export interface Collection {
  slug: string;
  title: string;
  docsId: string;
  pageId?: string;
}

// Nav-safe subset — no docsId or pageId. Safe to send to the client.
export interface NavCollection {
  slug: string;
  title: string;
}

function parseCollections(): Collection[] {
  const raw = process.env.HELPCENTER_COLLECTIONS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Collection[]) : [];
  } catch (e) {
    console.error("Invalid HELPCENTER_COLLECTIONS env var:", e);
    return [];
  }
}

// Server-only — reads process.env.HELPCENTER_COLLECTIONS (not NEXT_PUBLIC_), so the
// docsId/pageId never reach the client bundle.
export const collections: Collection[] = parseCollections();

export const navCollections: NavCollection[] = collections.map(({ slug, title }) => ({
  slug,
  title,
}));

export function getCollectionBySlug(slug: string): Collection | undefined {
  return collections.find((c) => c.slug === slug);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
