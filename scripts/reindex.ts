/**
 * Reindex script: fetches all CMS content for every configured site,
 * indexes with pagefind, stores in Redis under per-host keys.
 *
 * Usage: npm run reindex
 */

import Redis from "ioredis";

if (!process.env.DOCS_CMS_URL) {
  throw new Error("DOCS_CMS_URL environment variable is required");
}
const DOCS_CMS_URL = process.env.DOCS_CMS_URL.replace(/\/$/, "");
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const REDIS_TTL = 7 * 24 * 3600; // 7 days

import { slugify } from "../src/lib/collections";
import { allSites, type Site } from "../src/lib/sites";

interface DocsChildrenResponse {
  count: number;
  next?: string | null;
  results: Array<{
    id: string;
    title: string;
    numchild: number;
  }>;
}

interface DocsContentResponse {
  id: string;
  title: string;
  content: string;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json() as Promise<T>;
}

async function fetchChildren(parentId: string): Promise<DocsChildrenResponse> {
  let url: string | null = `${DOCS_CMS_URL}/api/v1.0/documents/${parentId}/children/`;
  let count = 0;
  const results: DocsChildrenResponse["results"] = [];
  while (url) {
    const data = await fetchJson<DocsChildrenResponse>(url);
    count = data.count;
    results.push(...data.results);
    url = data.next ?? null;
  }
  return { count, results };
}

async function fetchContent(docId: string): Promise<DocsContentResponse> {
  return fetchJson(`${DOCS_CMS_URL}/api/v1.0/documents/${docId}/content/?content_format=html`);
}

function stripFrontmatter(html: string): { content: string; frontmatter: Record<string, string> } {
  const frontmatter: Record<string, string> = {};
  let content = html;

  const match = content.match(/^<p>---<\/p>((<p>[a-z0-9_-]+\:\s.+?<\/p>)+)<p>---<\/p>/);
  if (match?.[1]) {
    match[1].match(/<p>([a-z0-9]+)\:\s(.+?)<\/p>/g)?.forEach((curr) => {
      const m = curr.match(/<p>([a-z0-9]+)\:\s(.+?)<\/p>/);
      if (m) frontmatter[m[1].toLowerCase()] = m[2];
    });
    content = content.slice(match[0].length);
  }

  return { content, frontmatter };
}

interface PageToIndex {
  url: string;
  title: string;
  content: string;
  collection: string;
  parentTitle?: string;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

function cleanTitle(title: string): string {
  return title.trim();
}

async function gatherPages(site: Site): Promise<PageToIndex[]> {
  const pages: PageToIndex[] = [];

  for (const collection of site.collections) {
    console.log(`  Fetching collection: ${collection.title} (${collection.slug})`);

    const sections = await fetchChildren(collection.docsId);

    for (const section of sections.results.filter((s) => s.title !== "_drafts")) {
      const sectionDoc = await fetchContent(section.id);
      const { content: sectionContent, frontmatter: sectionFm } = stripFrontmatter(
        sectionDoc.content,
      );
      const sectionSlug = sectionFm.path || slugify(section.title);
      const sectionTitle = cleanTitle(sectionFm.title || section.title);

      pages.push({
        url: `/${collection.slug}/${sectionSlug}`,
        title: sectionTitle,
        content: sectionContent,
        collection: collection.title,
      });

      if (section.numchild > 0) {
        const children = await fetchChildren(section.id);
        for (const child of children.results) {
          const childDoc = await fetchContent(child.id);
          const { content: childContent, frontmatter: childFm } = stripFrontmatter(
            childDoc.content,
          );
          const childSlug = childFm.path || slugify(child.title);
          const childTitle = cleanTitle(childFm.title || child.title);

          pages.push({
            url: `/${collection.slug}/${childSlug}`,
            title: childTitle,
            content: childContent,
            collection: collection.title,
            parentTitle: sectionTitle,
          });
        }
      }
    }
  }

  return pages;
}

interface PagefindModule {
  createIndex: (opts: Record<string, unknown>) => Promise<{
    index?: {
      addHTMLFile: (args: { url: string; content: string }) => Promise<{ errors: string[] }>;
      getFiles: () => Promise<{ files: Array<{ path: string; content: Buffer | Uint8Array }> }>;
    };
  }>;
  close: () => Promise<void>;
}

async function reindexSite(site: Site, pagefind: PagefindModule, redis: Redis): Promise<void> {
  console.log(`\n=== Indexing site: ${site.host} ===`);
  const pages = await gatherPages(site);
  console.log(`Fetched ${pages.length} pages for ${site.host}`);

  const { index } = await pagefind.createIndex({});
  if (!index) {
    throw new Error(`Failed to create pagefind index for ${site.host}`);
  }

  for (const page of pages) {
    const parentMeta = page.parentTitle
      ? `<span data-pagefind-meta="parent_title:${escapeHtml(page.parentTitle)}"></span>`
      : "";

    const html = `<!DOCTYPE html>
<html lang="fr">
<head><title>${page.title}</title></head>
<body>
<main>
${parentMeta}
<h1>${page.title}</h1>
${page.content}
</main>
</body>
</html>`;

    const { errors } = await index.addHTMLFile({
      url: page.url,
      content: html,
    });

    if (errors.length > 0) {
      console.warn(`Errors indexing ${page.url}:`, errors);
    }
  }

  const { files } = await index.getFiles();
  console.log(`Pagefind generated ${files.length} files for ${site.host}`);

  const prefix = `pagefind:${site.host}:`;
  const pipeline = redis.pipeline();
  pipeline.set(`${prefix}_manifest`, JSON.stringify(files.map((f) => f.path)));
  pipeline.expire(`${prefix}_manifest`, REDIS_TTL);
  for (const file of files) {
    const key = `${prefix}${file.path}`;
    pipeline.set(key, Buffer.from(file.content));
    pipeline.expire(key, REDIS_TTL);
  }
  await pipeline.exec();
  console.log(`Stored ${files.length} files in Redis for ${site.host}`);
}

async function run() {
  console.log("Starting reindex...");
  console.log(`CMS URL: ${DOCS_CMS_URL}`);
  console.log(`Redis URL: ${REDIS_URL}`);
  console.log(`Sites configured: ${allSites.size}`);

  if (allSites.size === 0) {
    throw new Error("No sites configured. Set HELPCENTER_SITES env var.");
  }

  const pagefind = (await import("pagefind")) as unknown as PagefindModule;
  const redis = new Redis(REDIS_URL);

  try {
    for (const site of allSites.values()) {
      await reindexSite(site, pagefind, redis);
    }
  } finally {
    await pagefind.close();
    await redis.quit();
  }

  console.log("\nReindex complete!");
}

run().catch((err) => {
  console.error("Reindex failed:", err);
  process.exit(1);
});
