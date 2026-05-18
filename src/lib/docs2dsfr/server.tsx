import { getImageProps } from "next/image";
import { cache, CacheEntry, isExpired } from "../cache";
import { DocsChild, DocsChildrenResponse, DocsContentResponse } from "./client";
import { customTags, customVoidTags, htmlComponents } from "./components";

const getDocsBaseUrl = (): string => {
  const baseUrl = process.env.DOCS_CMS_URL || "";
  return baseUrl.replace(/\/$/, "");
};

const getDocsApiUrl = (path: string): string => {
  return `${getDocsBaseUrl()}/api/v1.0${path}`;
};

// Bounds concurrent docs CMS requests across the whole process. A page render
// can fan out hundreds of tree fetches; without a cap the socket pool and the
// upstream API both start refusing connections.
const MAX_CONCURRENT_FETCHES = 4;
let inFlight = 0;
const waiters: Array<() => void> = [];
async function withFetchSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (inFlight >= MAX_CONCURRENT_FETCHES) {
    await new Promise<void>((resolve) => waiters.push(resolve));
  }
  inFlight++;
  try {
    return await fn();
  } finally {
    inFlight--;
    const next = waiters.shift();
    if (next) next();
  }
}

async function fetchUrl(
  url: string,
  options: RequestInit = {},
  timeout: number = 5,
  requiredKey: string | null = null,
  retries: number = 2,
): Promise<object | null> {
  try {
    for (let i = 0; i < retries; i++) {
      // Start the abort timer only after we've acquired a slot — otherwise
      // queueing for the concurrency cap eats the timeout budget and the
      // fetch is aborted before it ever runs.
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const freshResponse = await withFetchSlot(() => {
        const controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), timeout * 1000);
        return fetch(url, { ...options, signal: controller.signal });
      });

      if (timeoutId !== undefined) clearTimeout(timeoutId);

      if (freshResponse.ok) {
        const freshData = await freshResponse.json();
        if (!requiredKey || freshData[requiredKey]) {
          return freshData;
        }
      } else if (i < retries - 1) {
        // Back off before retrying on 429/5xx — otherwise both attempts hammer
        // the upstream in <1 ms and waste the retry budget.
        const retryAfter = parseInt(freshResponse.headers.get("retry-after") || "0", 10);
        const wait = retryAfter > 0 ? retryAfter * 1000 : 500 + 1000 * i;
        await new Promise((r) => setTimeout(r, wait));
      }
    }

    return null;
  } catch (error) {
    console.error(
      `Error fetching ${url}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

// Cached fetch function with expiry and timeout for stale cache
// Returns parsed JSON directly instead of Response object
// When noCache=true, cache is fully bypassed: neither read nor written (for draft previews).
async function cachedFetch(
  url: string,
  options: RequestInit = {},
  forceRefresh: boolean = false,
  requiredKey: string | null = null,
  cacheTTL: number = 4000,
  staleCacheTimeout: number = 5,
  requestTimeout: number = 15,
  retries: number = 2,
  noCache: boolean = false,
): Promise<object> {
  const cacheKey = `url:${url}`;

  let cacheEntry: CacheEntry | null = null;

  // If force refresh is requested, don't read from the cache
  if (!forceRefresh && !noCache) {
    cacheEntry = await cache.get(cacheKey);

    // If we have cached data and it's not expired, return it immediately
    // Cache for 4000 seconds (1h+)
    if (cacheEntry && !isExpired(cacheEntry, cacheTTL)) {
      return JSON.parse(cacheEntry.value.toString());
    }
  }

  const freshData = await fetchUrl(
    url,
    options,
    cacheEntry ? staleCacheTimeout : requestTimeout,
    requiredKey,
    retries,
  );
  if (freshData) {
    if (!noCache) {
      const buffer = Buffer.from(JSON.stringify(freshData));
      await cache.set(cacheKey, buffer);
    }
    return freshData;
  } else if (cacheEntry) {
    console.warn(`Using stale cache for ${url} due to timeout or error`);
    return JSON.parse(cacheEntry.value.toString());
  } else {
    throw new Error(`Failed to fetch ${url}`);
  }
}

export async function fetchDocumentContent(
  docId: string,
  forceRefresh: boolean = false,
  noCache: boolean = false,
): Promise<DocsContentResponse> {
  const url = getDocsApiUrl(`/documents/${docId}/formatted-content/?content_format=html`);

  const data = await cachedFetch(
    url,
    {
      headers: {
        Accept: "application/json",
      },
    },
    forceRefresh,
    "created_at",
    undefined,
    undefined,
    undefined,
    undefined,
    noCache,
  );

  return data as DocsContentResponse;
}

export async function fetchDocumentChildren(
  parentId: string,
  forceRefresh: boolean = false,
  noCache: boolean = false,
): Promise<DocsChildrenResponse> {
  let url: string | null = getDocsApiUrl(`/documents/${parentId}/children/`);
  let count = 0;
  const results: DocsChildrenResponse["results"] = [];

  while (url) {
    const data = (await cachedFetch(
      url,
      { headers: { Accept: "application/json" } },
      forceRefresh,
      "results",
      undefined,
      undefined,
      undefined,
      undefined,
      noCache,
    )) as DocsChildrenResponse;
    count = data.count;
    results.push(...data.results);
    url = data.next ?? null;
  }

  return { count, next: null, previous: null, results };
}

export async function getDocument(
  docId: string,
  forceRefresh: boolean = false,
  noCache: boolean = false,
): Promise<DocsContentResponse> {
  const document = await fetchDocumentContent(docId, forceRefresh, noCache);
  document.frontmatter = {};

  if (!document.content) return document;

  // Extract frontmatter from the document content
  const frontmatter = document.content.match(
    /^<p>---<\/p>((<p>[a-z0-9_-]+\:\s.+?<\/p>)+)<p>---<\/p>/,
  );
  if (frontmatter && frontmatter[1]) {
    document.frontmatter =
      frontmatter[1]
        .match(/<p>([a-z0-9]+)\:\s(.+?)<\/p>/g)
        ?.reduce((acc: Record<string, string>, curr: string) => {
          const match = curr.match(/<p>([a-z0-9]+)\:\s(.+?)<\/p>/);
          if (match) {
            const [, key, value] = match;
            acc[key.toLowerCase()] = value;
          }
          return acc;
        }, {}) || {};
    document.content = document.content.slice(frontmatter[0].length);
  }

  if (document.frontmatter.date) {
    // Make sure the date formatting always happens on the server side to avoid hydration errors
    document.frontmatter.dateFormatted = new Date(document.frontmatter.date).toLocaleDateString(
      "fr-FR",
      {
        year: "numeric",
        month: "long",
        day: "numeric",
      },
    );
  }

  // Convert custom tags to components.
  // Editors sometimes inject whitespace or zero-width chars (U+200B/200C/200D/FEFF)
  // around the escaped tag inside the wrapping <p>; allow those padding chars.
  const pad = `[\\s\\u200B-\\u200D\\uFEFF]*`;
  // Restore entity-escaped tag attributes (e.g. URLs containing &amp;, attrs
  // quoted with &quot;) AND collapse BlockNote-style auto-linkified URLs the
  // CMS injects inside escaped tags (src="<a href=&quot;URL&quot;>URL</a>"
  // → src="URL"), which would otherwise break attribute quoting.
  const normalizeAttrs = (s: string) =>
    s
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/<a\b[^>]*\bhref="([^"]+)"[^>]*>[^<]*<\/a>/gi, "$1");

  // Paired tags (open + close). Allow optional attributes after the tag name.
  customTags.forEach((tag) => {
    // Open and close in separate <p> blocks, with content between.
    document.content = document.content.replace(
      new RegExp(
        `<p>${pad}&lt;${tag}([\\s\\S]*?)&gt;${pad}<\/p>(.*?)<p>${pad}&lt;\/${tag}&gt;${pad}<\/p>`,
        "gs",
      ),
      (_m, attrs, content) => `<${tag}${normalizeAttrs(attrs)}>${content}</${tag}>`,
    );
    // Open and close inside a single <p> block (no content between).
    document.content = document.content.replace(
      new RegExp(
        `<p>${pad}&lt;${tag}([\\s\\S]*?)&gt;${pad}&lt;\/${tag}&gt;${pad}<\/p>`,
        "g",
      ),
      (_m, attrs) => `<${tag}${normalizeAttrs(attrs)}></${tag}>`,
    );
  });

  // Void tags (no closing tag). Match `<tag>` or `<tag/>` / `<tag />`.
  customVoidTags.forEach((tag) => {
    document.content = document.content.replace(
      new RegExp(`<p>${pad}&lt;${tag}([\\s\\S]*?)\\s*\\/&gt;${pad}<\/p>`, "g"),
      (_m, attrs) => `<${tag}${normalizeAttrs(attrs)}/>`,
    );
  });

  // Remove blank paragraphs at the top
  document.content = document.content.replace(/^<p><\/p>/, "");

  // Extract an image URL if it's right after the frontmatter
  if (!document.frontmatter.image) {
    const image = document.content.match(/^<img\s+[^>]*src="([^"]+)"/);
    if (image) {
      try {
        document.frontmatter.image = getImageProps({
          src: image[1],
          alt: "",
          width: 800,
          height: 600,
        }).props.src;
      } catch {
        document.frontmatter.image = image[1];
      }
    }
  }

  return document;
}

export async function getDocumentChildren(
  parentId: string,
  forceRefresh: boolean = false,
  noCache: boolean = false,
): Promise<DocsChild[]> {
  const response = await fetchDocumentChildren(parentId, forceRefresh, noCache);

  // Fetch each child's document in parallel; tolerate per-doc failures so a
  // single bad fetch (timeout, network blip) doesn't void the whole list.
  await Promise.all(
    response.results.map(async (doc) => {
      try {
        doc.document = await getDocument(doc.id, forceRefresh, noCache);
      } catch (e) {
        console.warn(
          `getDocument failed for ${doc.id}:`,
          e instanceof Error ? e.message : e,
        );
      }
    }),
  );

  return response.results;
}
