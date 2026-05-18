// Walk the docs CMS tree from a root id, fetch every node's formatted HTML,
// and list <img src> URLs pointing at *.gitbook.io grouped by docs URL.
//
// Usage: node scripts/scan-gitbook-images.mjs <root-doc-id>
//   DOCS_CMS_URL=https://docs.suite.anct.gouv.fr (defaults)
//
// Throttles requests and retries on 429/503.

const ROOT = process.argv[2];
if (!ROOT) {
  console.error("Usage: node scripts/scan-gitbook-images.mjs <root-doc-id>");
  process.exit(2);
}

const CMS = (process.env.DOCS_CMS_URL || "https://docs.suite.anct.gouv.fr").replace(/\/+$/, "");
const BASE = `${CMS}/api/v1.0`;
const DOCS_PUBLIC = `${CMS}/docs`;
const MIN_GAP_MS = 250;
const MAX_RETRIES = 6;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let lastRequestAt = 0;
async function throttledFetch(url) {
  const gap = Date.now() - lastRequestAt;
  if (gap < MIN_GAP_MS) await sleep(MIN_GAP_MS - gap);
  lastRequestAt = Date.now();
  return fetch(url, { headers: { Accept: "application/json" } });
}

async function fetchJson(url) {
  let attempt = 0;
  for (;;) {
    const r = await throttledFetch(url);
    if (r.ok) return r.json();
    if (r.status !== 429 && r.status !== 503) {
      throw new Error(`HTTP ${r.status} ${url}`);
    }
    if (attempt >= MAX_RETRIES) {
      throw new Error(`HTTP ${r.status} after ${MAX_RETRIES} retries ${url}`);
    }
    const ra = parseInt(r.headers.get("retry-after") || "0", 10);
    const wait = ra > 0 ? ra * 1000 : Math.min(60000, 2000 * 2 ** attempt);
    console.error(
      `  ${r.status} on …${url.slice(-50)} — sleeping ${wait}ms (attempt ${attempt + 1})`,
    );
    await sleep(wait);
    attempt++;
  }
}

// Paginated children fetch (matches src/lib/docs2dsfr/server.tsx::fetchDocumentChildren).
async function fetchChildren(parentId) {
  let url = `${BASE}/documents/${parentId}/children/`;
  const out = [];
  while (url) {
    const data = await fetchJson(url);
    out.push(...(data.results || []));
    url = data.next || null;
  }
  return out;
}

async function fetchContent(docId) {
  return fetchJson(`${BASE}/documents/${docId}/formatted-content/?content_format=html`);
}

// Collect every reachable doc id transitively.
async function collectIds(rootId) {
  const ids = [rootId];
  const seen = new Set([rootId]);
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift();
    let kids;
    try {
      kids = await fetchChildren(id);
    } catch (e) {
      console.error(`children failed for ${id}: ${e.message}`);
      continue;
    }
    for (const k of kids) {
      if (seen.has(k.id)) continue;
      seen.add(k.id);
      ids.push(k.id);
      queue.push(k.id);
    }
  }
  return ids;
}

const IMG_RE = /<img\b[^>]*\bsrc\s*=\s*"([^"]*)"/gi;

(async () => {
  console.error(`Collecting tree from ${ROOT}…`);
  const ids = await collectIds(ROOT);
  console.error(`Got ${ids.length} document(s). Fetching content…`);

  const grouped = {};
  let processed = 0;
  let failed = 0;
  for (const id of ids) {
    processed++;
    try {
      const c = await fetchContent(id);
      const html = (c && c.content) || "";
      const hits = [];
      for (const m of html.matchAll(IMG_RE)) {
        const src = m[1];
        if (/\bgitbook\.io\b/i.test(src)) hits.push(src);
      }
      if (hits.length) grouped[`${DOCS_PUBLIC}/${id}/`] = hits;
    } catch (e) {
      failed++;
      console.error(`content failed for ${id}: ${e.message}`);
    }
    if (processed % 10 === 0) {
      console.error(`  ${processed}/${ids.length}  (fail=${failed})`);
    }
  }

  console.error(
    `\nDone. ${Object.keys(grouped).length} doc(s) reference gitbook images. ${failed} fetch failure(s).\n`,
  );
  for (const [url, imgs] of Object.entries(grouped)) {
    console.log(url);
    for (const img of imgs) console.log(`  ${img}`);
  }
})();
