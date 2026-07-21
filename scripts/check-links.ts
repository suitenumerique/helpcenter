/**
 * Checks every internal doc-to-doc interlink (`<a href="/docs/UUID/">`) across
 * all configured sites/collections and reports any UUID that doesn't resolve
 * to a page in the same collection's tree — the exact resolution SSR does
 * (see rewriteAllInterlinks in src/pages/[collection]/[[...page]].tsx), so a
 * link reported here is one that would actually render stripped/broken in
 * production.
 *
 * Usage: npm run check-links
 */

if (!process.env.DOCS_CMS_URL) {
  throw new Error("DOCS_CMS_URL environment variable is required");
}

import { buildPageItem, findPageById, PageItem } from "../src/lib/collection-tree";
import { DocsChild } from "../src/lib/docs2dsfr/client";
import { getDocumentChildren } from "../src/lib/docs2dsfr/server";
import { closeRedis } from "../src/lib/redis";
import { allSites, type Site } from "../src/lib/sites";

// A dedicated, fully sequential tree walk for this script only — deliberately
// not reusing buildSectionTree. buildSectionTree recurses with Promise.all at
// every level, which (now that it's unbounded-depth) eagerly kicks off every
// sibling's entire subtree walk in parallel — thousands of pending call
// frames/timers all at once for a large collection, even though the actual
// network concurrency is throttled via DOCS_FETCH_CONCURRENCY. That appears
// to be what was causing widespread request failures during a full-tree
// crawl. This walker instead awaits one node's full subtree before moving to
// its sibling, so at most one branch is ever in flight.
async function buildTreeSequentially(
  rootId: string,
  forceRefresh: boolean,
  noCache: boolean,
): Promise<DocsChild[]> {
  const fetchDescendants = async (item: DocsChild): Promise<void> => {
    try {
      item.children = await getDocumentChildren(item.id, forceRefresh, noCache);
    } catch (e) {
      console.warn(`children fetch failed for ${item.id}:`, e instanceof Error ? e.message : e);
      item.children = [];
      return;
    }
    for (const child of item.children) {
      await fetchDescendants(child);
    }
  };

  const rawSections = (await getDocumentChildren(rootId, forceRefresh, noCache)).filter(
    (s) => s.title !== "_drafts",
  );
  for (const section of rawSections) {
    await fetchDescendants(section);
  }
  return rawSections;
}

interface BrokenLink {
  site: string;
  collection: string;
  sourceTitle: string;
  sourceUrl: string;
  targetUuid: string;
  linkText: string;
}

const INTERLINK_RE =
  /<a\b[^>]*?\bhref="\/docs\/([0-9a-f-]+)\/?"[^>]*?>([\s\S]*?)<\/a>/gi;

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

function findBrokenInterlinks(
  sections: PageItem[],
  collectionSlug: string,
  siteHost: string,
): BrokenLink[] {
  const broken: BrokenLink[] = [];
  const visit = (item: PageItem) => {
    const html = item.document?.content;
    if (html) {
      let match: RegExpExecArray | null;
      INTERLINK_RE.lastIndex = 0;
      while ((match = INTERLINK_RE.exec(html))) {
        const uuid = match[1];
        if (!findPageById(sections, uuid)) {
          broken.push({
            site: siteHost,
            collection: collectionSlug,
            sourceTitle: item.title,
            sourceUrl: `/${collectionSlug}/${item.path}`,
            targetUuid: uuid,
            linkText: stripTags(match[2]),
          });
        }
      }
    }
    for (const child of item.children) visit(child);
  };
  for (const section of sections) visit(section);
  return broken;
}

// forceRefresh=false, noCache=false: reuse the same Redis-backed docs cache
// SSR and the reindex cron already keep warm, instead of forcing a fresh
// live CMS fetch for every single node. When Redis is cold or unreachable
// this degrades gracefully to a live fetch per node, so it's still correct
// everywhere — just far lighter on the CMS when the cache is actually warm.
// Set CHECK_LINKS_FRESH=1 to force a full live crawl bypassing the cache.
const FORCE_REFRESH = process.env.CHECK_LINKS_FRESH === "1";

async function checkSite(site: Site): Promise<BrokenLink[]> {
  const broken: BrokenLink[] = [];
  for (const collection of site.collections) {
    console.log(`  Checking collection: ${collection.title} (${collection.slug})`);
    try {
      const rawSections = await buildTreeSequentially(collection.docsId, FORCE_REFRESH, false);
      const sections = rawSections.map((s) => buildPageItem(s));
      broken.push(...findBrokenInterlinks(sections, collection.slug, site.host));
    } catch (e) {
      console.error(
        `Failed to check collection ${collection.slug} (${collection.docsId}):`,
        e instanceof Error ? e.message : e,
      );
    }
  }
  return broken;
}

async function run() {
  console.log("Checking internal doc links...");
  console.log(`CMS URL: ${process.env.DOCS_CMS_URL}`);
  console.log(`Sites configured: ${allSites.size}`);

  if (allSites.size === 0) {
    throw new Error("No sites configured. Set HELPCENTER_SITES env var.");
  }

  const allBroken: BrokenLink[] = [];
  try {
    for (const site of allSites.values()) {
      console.log(`\n=== Checking site: ${site.host} ===`);
      allBroken.push(...(await checkSite(site)));
    }
  } finally {
    await closeRedis();
  }

  if (allBroken.length === 0) {
    console.log("\nNo broken internal links found.");
    return;
  }

  console.log(`\nFound ${allBroken.length} broken internal link(s):\n`);
  for (const link of allBroken) {
    const label = link.linkText ? ` — link text: "${link.linkText}"` : "";
    console.log(
      `[${link.site}/${link.collection}] "${link.sourceTitle}" (${link.sourceUrl}) ` +
        `→ missing doc ${link.targetUuid}${label}`,
    );
  }
  process.exitCode = 1;
}

run().catch((err) => {
  console.error("check-links failed:", err);
  process.exit(1);
});
