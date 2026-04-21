import { slugify } from "@/lib/collections";
import type { DocsChild, DocsContentResponse } from "@/lib/docs2dsfr/client";

export interface PageItem {
  id: string;
  title: string;
  slug: string;
  document?: DocsContentResponse;
  children: PageItem[];
}

export function cleanTitle(title: string | null | undefined): string {
  return (title || "").replace(/\s*\|\s*Aide\s*$/, "").trim();
}

export function displayTitle(rawTitle: string | null | undefined, id: string): string {
  return cleanTitle(rawTitle) || `(untitled — ${id.slice(0, 8)})`;
}

export function buildPageItem(doc: DocsChild): PageItem {
  const rawTitle = doc.document?.frontmatter?.title || doc.title;
  const title = displayTitle(rawTitle, doc.id);
  const slug = doc.document?.frontmatter?.path || (rawTitle ? slugify(rawTitle) : doc.id);
  const item: PageItem = {
    id: doc.id,
    title,
    slug,
    children: (doc.children || []).map(buildPageItem),
  };
  if (doc.document) item.document = doc.document;
  return item;
}

export function findPageBySlug(sections: PageItem[], slug: string): PageItem | null {
  for (const section of sections) {
    if (section.slug === slug) return section;
    for (const child of section.children) {
      if (child.slug === slug) return child;
    }
  }
  return null;
}

export function findPageById(sections: PageItem[], id: string): PageItem | null {
  for (const section of sections) {
    if (section.id === id) return section;
    for (const child of section.children) {
      if (child.id === id) return child;
    }
  }
  return null;
}

export function getFirstPage(sections: PageItem[]): PageItem | null {
  if (sections.length === 0) return null;
  if (sections[0].children.length > 0) return sections[0].children[0];
  return sections[0];
}
