/**
 * Reindex script: fetches all CMS content for every configured site,
 * indexes with pagefind, stores in Redis under per-host keys.
 *
 * Usage: npm run reindex
 *
 * The fetch + frontmatter + tag-restoration logic is shared with the SSR
 * code path (src/lib/docs2dsfr/server.tsx + src/lib/collection-tree.ts) so
 * the search index sees the same HTML the user sees. Local additions are
 * limited to: pagefind invocation, Redis storage, the per-site loop.
 */

import Redis from "ioredis";

if (!process.env.DOCS_CMS_URL) {
  throw new Error("DOCS_CMS_URL environment variable is required");
}
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const REDIS_TTL = 7 * 24 * 3600; // 7 days

import {
  buildPageItem,
  findPageById,
  PageItem,
  rewriteAllInterlinks,
} from "../src/lib/collection-tree";
import { buildSectionTree } from "../src/lib/docs2dsfr/server";
import { closeRedis } from "../src/lib/redis";
import { allSites, type Site } from "../src/lib/sites";

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
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

// Walk a 3-level PageItem tree and push every node with a document into a
// flat list of pages for pagefind. Each entry carries its parent's title so
// search results can surface the section path.
function collectPages(
  sections: PageItem[],
  collectionSlug: string,
  collectionTitle: string,
): PageToIndex[] {
  const pages: PageToIndex[] = [];
  const visit = (item: PageItem, parentTitle?: string) => {
    if (item.document?.content) {
      pages.push({
        url: `/${collectionSlug}/${item.slug}`,
        title: item.title,
        content: item.document.content,
        collection: collectionTitle,
        parentTitle,
      });
    }
    for (const child of item.children) visit(child, item.title);
  };
  for (const section of sections) visit(section);
  return pages;
}

async function gatherPages(site: Site): Promise<PageToIndex[]> {
  const pages: PageToIndex[] = [];
  for (const collection of site.collections) {
    console.log(`  Fetching collection: ${collection.title} (${collection.slug})`);
    try {
      // forceRefresh=true: deploy-time index should reflect the latest CMS state.
      const rawSections = await buildSectionTree(collection.docsId, true);
      const sections = rawSections.map(buildPageItem);
      // CMS interlinks `/docs/UUID/` → helpcenter URLs (unresolved UUIDs get
      // their hrefs stripped so pagefind doesn't surface dead-link text).
      rewriteAllInterlinks(sections, (uuid) => {
        const found = findPageById(sections, uuid);
        return found ? `/${collection.slug}/${found.slug}` : null;
      });
      pages.push(...collectPages(sections, collection.slug, collection.title));
    } catch (e) {
      // One bad collection shouldn't tank the whole reindex — the next cron
      // run (every 10 min) will retry. Log and continue.
      console.error(
        `Failed to gather collection ${collection.slug} (${collection.docsId}):`,
        e instanceof Error ? e.message : e,
      );
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
  if (pages.length === 0) {
    console.warn(`No pages to index for ${site.host} — skipping.`);
    return;
  }

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
  console.log(`CMS URL: ${process.env.DOCS_CMS_URL}`);
  console.log(`Redis URL: ${REDIS_URL}`);
  console.log(`Sites configured: ${allSites.size}`);

  if (allSites.size === 0) {
    throw new Error("No sites configured. Set HELPCENTER_SITES env var.");
  }

  const pagefind = (await import("pagefind")) as unknown as PagefindModule;
  const redis = new Redis(REDIS_URL);

  let failed = 0;
  try {
    for (const site of allSites.values()) {
      try {
        await reindexSite(site, pagefind, redis);
      } catch (e) {
        failed++;
        // Per-site isolation: one site's failure shouldn't void the rest.
        console.error(`Failed to reindex site ${site.host}:`, e instanceof Error ? e.message : e);
      }
    }
  } finally {
    await pagefind.close();
    await redis.quit();
    // Also close the shared Redis client used by the docs cache (populated
    // when buildSectionTree calls into server.tsx → cache.ts).
    await closeRedis();
  }

  if (failed > 0) {
    console.warn(`\nReindex complete with ${failed} site failure(s).`);
  } else {
    console.log("\nReindex complete!");
  }
}

run().catch((err) => {
  console.error("Reindex failed:", err);
  process.exit(1);
});
