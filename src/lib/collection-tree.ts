import { slugify } from "@/lib/collections";
import type { DocsChild, DocsContentResponse } from "@/lib/docs2dsfr/client";

export interface PageItem {
  id: string;
  title: string;
  slug: string;
  // Full path from the collection root, slash-joined (e.g. "fichiers/mes-premiers-pas").
  // Used as the URL segment after the collection slug.
  path: string;
  document?: DocsContentResponse;
  children: PageItem[];
}

export function cleanTitle(title: string | null | undefined): string {
  return (title || "").trim();
}

export function displayTitle(rawTitle: string | null | undefined, id: string): string {
  return cleanTitle(rawTitle) || `(untitled — ${id.slice(0, 8)})`;
}

export function buildPageItem(doc: DocsChild, parentPath = ""): PageItem {
  const rawTitle = doc.document?.frontmatter?.title || doc.title;
  const title = displayTitle(rawTitle, doc.id);
  const slug = doc.document?.frontmatter?.path || (rawTitle ? slugify(rawTitle) : doc.id);
  const path = parentPath ? `${parentPath}/${slug}` : slug;
  const item: PageItem = {
    id: doc.id,
    title,
    slug,
    path,
    children: (doc.children || []).map((child) => buildPageItem(child, path)),
  };
  if (doc.document) item.document = doc.document;
  return item;
}

export function findPageByPath(sections: PageItem[], path: string): PageItem | null {
  for (const section of sections) {
    if (section.path === path) return section;
    const found = findPageByPath(section.children, path);
    if (found) return found;
  }
  return null;
}

export function findPageById(sections: PageItem[], id: string): PageItem | null {
  for (const section of sections) {
    if (section.id === id) return section;
    const found = findPageById(section.children, id);
    if (found) return found;
  }
  return null;
}

export function getFirstPage(sections: PageItem[]): PageItem | null {
  if (sections.length === 0) return null;
  if (sections[0].children.length > 0) return sections[0].children[0];
  return sections[0];
}

// DFS in-order flatten — matches the visual reading order of the sidebar,
// so prev/next navigation walks the tree top-to-bottom.
export function flattenPages(sections: PageItem[]): PageItem[] {
  const out: PageItem[] = [];
  const walk = (item: PageItem) => {
    out.push(item);
    for (const child of item.children) walk(child);
  };
  for (const section of sections) walk(section);
  return out;
}

// CMS interlinks ship as `<a href="/docs/UUID/" data-doc-id="UUID" ...>`.
// Rewrite each href via the caller-supplied resolver (typically a lookup into
// the current collection tree). When the resolver returns null the link's
// href and data-doc-id are stripped so a broken UUID renders as plain text
// instead of a 404. Mutates each page's document.content in place.
const INTERLINK_RE = /<a\b([^>]*?)\bhref="\/docs\/([0-9a-f-]+)\/?"([^>]*?)>/gi;

export function rewriteInterlinks(
  html: string,
  resolveHref: (uuid: string) => string | null,
): string {
  return html.replace(INTERLINK_RE, (_match, before: string, uuid: string, after: string) => {
    const stripDocId = (s: string) => s.replace(/\s*data-doc-id="[^"]*"/g, "");
    const cleanBefore = stripDocId(before);
    const cleanAfter = stripDocId(after);
    const href = resolveHref(uuid);
    if (href) return `<a${cleanBefore} href="${href}"${cleanAfter}>`;
    console.warn(`[interlink] doc id ${uuid} not found in tree — stripping href`);
    return `<a${cleanBefore}${cleanAfter}>`;
  });
}

export function rewriteAllInterlinks(
  sections: PageItem[],
  resolveHref: (uuid: string) => string | null,
): void {
  const walk = (item: PageItem) => {
    if (item.document?.content) {
      item.document.content = rewriteInterlinks(item.document.content, resolveHref);
    }
    for (const child of item.children) walk(child);
  };
  for (const section of sections) walk(section);
}
