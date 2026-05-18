export interface Collection {
  slug: string;
  title: string;
  docsId: string;
  pageId?: string;
}

export interface NavCollection {
  slug: string;
  title: string;
}

export interface Site {
  host: string;
  title: string;
  subtitle: string;
  parentSiteUrl: string;
  parentSiteLabel: string;
  footerDescription: string;
  repositoryUrl: string;
  matomoUrl: string;
  matomoSiteId: string;
  collections: Collection[];
}

interface SiteConfig {
  title?: string;
  subtitle?: string;
  parentSiteUrl?: string;
  parentSiteLabel?: string;
  footerDescription?: string;
  repositoryUrl?: string;
  matomoUrl?: string;
  matomoSiteId?: string;
  collections?: Collection[];
}

function parseSites(): Map<string, Site> {
  const raw = process.env.HELPCENTER_SITES;
  if (!raw) return new Map();
  let parsed: Record<string, SiteConfig>;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error("Invalid HELPCENTER_SITES env var:", e);
    return new Map();
  }
  if (!parsed || typeof parsed !== "object") return new Map();
  const out = new Map<string, Site>();
  for (const [host, cfg] of Object.entries(parsed)) {
    out.set(host, {
      host,
      title: cfg.title ?? "",
      subtitle: cfg.subtitle ?? "",
      parentSiteUrl: cfg.parentSiteUrl ?? "",
      parentSiteLabel: cfg.parentSiteLabel ?? "",
      footerDescription: cfg.footerDescription ?? "",
      repositoryUrl: cfg.repositoryUrl ?? "",
      matomoUrl: cfg.matomoUrl ?? "",
      matomoSiteId: cfg.matomoSiteId ?? "",
      collections: Array.isArray(cfg.collections) ? cfg.collections : [],
    });
  }
  return out;
}

const sites = parseSites();

export const allSites: ReadonlyMap<string, Site> = sites;

export function getSiteForHost(host: string | undefined | null): Site | null {
  if (!host) return null;
  return sites.get(host) ?? null;
}

export function navCollectionsOf(site: Site): NavCollection[] {
  return site.collections.map(({ slug, title }) => ({ slug, title }));
}

export function getCollectionBySlug(site: Site, slug: string): Collection | undefined {
  return site.collections.find((c) => c.slug === slug);
}
