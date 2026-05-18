import { buildSidebarItems, DocPage, PageNavLink } from "@/components/DocPage";
import {
  buildPageItem,
  cleanTitle,
  findPageById,
  findPageByPath,
  flattenPages,
  getFirstPage,
  PageItem,
  rewriteAllInterlinks,
} from "@/lib/collection-tree";
import { getCollectionBySlug, getSiteForHost, NavCollection } from "@/lib/sites";
import { GetServerSideProps } from "next";
import { NextSeo } from "next-seo";

interface CollectionPageProps {
  collection: NavCollection;
  sections: PageItem[];
  currentPage: PageItem | null;
  prevLink: PageNavLink | null;
  nextLink: PageNavLink | null;
}

export default function CollectionPage({
  collection,
  sections,
  currentPage,
  prevLink,
  nextLink,
}: CollectionPageProps) {
  const sidebarItems = buildSidebarItems(
    sections,
    currentPage?.id || "",
    (page) => `/${collection.slug}/${page.path}`,
  );

  const pageTitle = cleanTitle(
    currentPage?.document?.frontmatter?.title || currentPage?.title || "",
  );

  return (
    <>
      <NextSeo title={pageTitle} description={currentPage?.document?.frontmatter?.summary || ""} />
      <DocPage
        sidebarItems={sidebarItems}
        burgerMenuButtonText={collection.title}
        currentPage={currentPage}
        pageTitle={pageTitle}
        fallbackTitle={collection.title}
        fallbackMessage="Page non trouvée."
        prevLink={prevLink}
        nextLink={nextLink}
      />
    </>
  );
}

export const getServerSideProps: GetServerSideProps<CollectionPageProps> = async ({
  params,
  query,
  req,
}) => {
  const collectionSlug = params?.collection as string;
  const pagePath = params?.page as string[] | undefined;
  const forceRefresh = query?.refresh === "1";

  const site = getSiteForHost(req.headers.host);
  if (!site) {
    return { notFound: true };
  }

  const collection = getCollectionBySlug(site, collectionSlug);
  if (!collection) {
    return { notFound: true };
  }

  try {
    const { buildSectionTree } = await import("@/lib/docs2dsfr/server");
    const rawSections = await buildSectionTree(collection.docsId, forceRefresh);
    const sections = rawSections.map((s) => buildPageItem(s));

    // CMS-emitted `<a href="/docs/UUID/">` interlinks → helpcenter URLs.
    rewriteAllInterlinks(sections, (uuid) => {
      const found = findPageById(sections, uuid);
      return found ? `/${collection.slug}/${found.path}` : null;
    });

    const requestedPath = pagePath?.join("/") || "";
    let currentPage: PageItem | null = null;

    if (requestedPath) {
      currentPage = findPageByPath(sections, requestedPath);
      if (!currentPage) {
        return { notFound: true };
      }
    } else {
      if (collection.pageId) {
        currentPage = findPageById(sections, collection.pageId);
      }
      if (!currentPage) {
        currentPage = getFirstPage(sections);
      }
    }

    let prevLink: PageNavLink | null = null;
    let nextLink: PageNavLink | null = null;
    if (currentPage) {
      const flat = flattenPages(sections);
      const idx = flat.findIndex((p) => p.id === currentPage!.id);
      const toLink = (p: PageItem): PageNavLink => ({
        text: p.title,
        href: `/${collection.slug}/${p.path}`,
      });
      if (idx > 0) prevLink = toLink(flat[idx - 1]);
      if (idx >= 0 && idx < flat.length - 1) nextLink = toLink(flat[idx + 1]);
    }

    return {
      props: {
        collection: { slug: collection.slug, title: collection.title },
        sections,
        currentPage,
        prevLink,
        nextLink,
      },
    };
  } catch (error) {
    console.error("Error fetching collection:", error);
    return {
      props: {
        collection: { slug: collection.slug, title: collection.title },
        sections: [],
        currentPage: null,
        prevLink: null,
        nextLink: null,
      },
    };
  }
};
