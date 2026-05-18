import { buildSidebarItems, DocPage } from "@/components/DocPage";
import {
  buildPageItem,
  cleanTitle,
  findPageById,
  findPageBySlug,
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
}

export default function CollectionPage({ collection, sections, currentPage }: CollectionPageProps) {
  const sidebarItems = buildSidebarItems(
    sections,
    currentPage?.id || "",
    (page) => `/${collection.slug}/${page.slug}`,
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
    const sections = rawSections.map(buildPageItem);

    // CMS-emitted `<a href="/docs/UUID/">` interlinks → helpcenter URLs.
    rewriteAllInterlinks(sections, (uuid) => {
      const found = findPageById(sections, uuid);
      return found ? `/${collection.slug}/${found.slug}` : null;
    });

    const requestedSlug = pagePath?.join("/") || "";
    let currentPage: PageItem | null = null;

    if (requestedSlug) {
      currentPage = findPageBySlug(sections, requestedSlug);
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

    return {
      props: {
        collection: { slug: collection.slug, title: collection.title },
        sections,
        currentPage,
      },
    };
  } catch (error) {
    console.error("Error fetching collection:", error);
    return {
      props: {
        collection: { slug: collection.slug, title: collection.title },
        sections: [],
        currentPage: null,
      },
    };
  }
};
