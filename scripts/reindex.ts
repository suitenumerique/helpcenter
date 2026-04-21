/**
 * Reindex script: fetches all CMS content, indexes with pagefind, stores in Redis.
 *
 * Usage: npm run reindex
 */

import Redis from "ioredis";

// Inline the minimal CMS fetching logic to avoid Next.js dependencies
const DOCS_CMS_URL = (process.env.DOCS_CMS_URL || "https://docs.suite.anct.gouv.fr").replace(
  /\/$/,
  "",
);
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const REDIS_KEY_PREFIX = "pagefind:";
const REDIS_TTL = 7 * 24 * 3600; // 7 days

// Import collections config (relative path, no alias)
import { collections, slugify } from "../src/lib/collections";

interface DocsChildrenResponse {
  count: number;
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
  return fetchJson(`${DOCS_CMS_URL}/api/v1.0/documents/${parentId}/children/`);
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
  return title.replace(/\s*\|\s*Aide\s*$/, "").trim();
}

async function gatherPages(): Promise<PageToIndex[]> {
  const pages: PageToIndex[] = [];

  for (const collection of collections) {
    console.log(`Fetching collection: ${collection.title} (${collection.slug})`);

    const sections = await fetchChildren(collection.docsId);

    for (const section of sections.results.filter((s) => s.title !== "_drafts")) {
      // Fetch section content
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

      // Fetch children if any
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

async function run() {
  console.log("Starting reindex...");
  console.log(`CMS URL: ${DOCS_CMS_URL}`);
  console.log(`Redis URL: ${REDIS_URL}`);

  // 1. Gather all pages from CMS
  const pages = await gatherPages();
  console.log(`Fetched ${pages.length} pages from CMS`);

  // 2. Create pagefind index (dynamic import for ESM-only package)
  const pagefind = await import("pagefind");
  const { index } = await pagefind.createIndex({});
  if (!index) {
    throw new Error("Failed to create pagefind index");
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

  // 3. Get all files from the index
  const { files } = await index.getFiles();
  console.log(`Pagefind generated ${files.length} files`);

  await pagefind.close();

  // 4. Store in Redis
  const redis = new Redis(REDIS_URL);

  const pipeline = redis.pipeline();

  // Store manifest (list of all file paths)
  const paths = files.map((f) => f.path);
  pipeline.set(`${REDIS_KEY_PREFIX}_manifest`, JSON.stringify(paths));
  pipeline.expire(`${REDIS_KEY_PREFIX}_manifest`, REDIS_TTL);

  // Store each file
  for (const file of files) {
    const key = `${REDIS_KEY_PREFIX}${file.path}`;
    pipeline.set(key, Buffer.from(file.content));
    pipeline.expire(key, REDIS_TTL);
  }

  await pipeline.exec();
  console.log(`Stored ${files.length} files in Redis`);

  await redis.quit();
  console.log("Reindex complete!");
}

run().catch((err) => {
  console.error("Reindex failed:", err);
  process.exit(1);
});
