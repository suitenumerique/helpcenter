import { buildSidebarItems, DocPage, PageNavLink } from "@/components/DocPage";
import {
  buildPageItem,
  cleanTitle,
  displayTitle,
  findPageById,
  flattenPages,
  getFirstPage,
  PageItem,
} from "@/lib/collection-tree";
import { slugify } from "@/lib/collections";
import { fr } from "@codegouvfr/react-dsfr";
import { GetServerSideProps } from "next";
import { NextSeo } from "next-seo";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface DraftPageProps {
  docId: string | null;
  rootTitle: string;
  sections: PageItem[];
  currentPage: PageItem | null;
  prevLink: PageNavLink | null;
  nextLink: PageNavLink | null;
  error: string | null;
}

const Banner = () => (
  <div
    style={{
      backgroundColor: "#ce0500",
      color: "#fff",
      padding: "0.75rem 1rem",
      textAlign: "center",
      fontWeight: "bold",
      letterSpacing: "0.05em",
    }}
  >
    ⚠ DRAFT MODE — DO NOT SHARE PUBLICLY ⚠
  </div>
);

export default function DraftPage({
  docId,
  rootTitle,
  sections,
  currentPage,
  prevLink,
  nextLink,
  error,
}: DraftPageProps) {
  if (!docId || error) {
    return (
      <>
        <NextSeo noindex nofollow />
        <Banner />
        <div className={fr.cx("fr-container", "fr-my-4w")}>
          {!docId && <p>Add ?docs=UUID to the URL to preview a document.</p>}
          {error && <p style={{ color: "#ce0500" }}>Error: {error}</p>}
        </div>
      </>
    );
  }

  const sidebarItems = buildSidebarItems(
    sections,
    currentPage?.id || "",
    (page) => `/draft?docs=${docId}&page=${page.id}`,
  );

  const pageTitle = cleanTitle(
    currentPage?.document?.frontmatter?.title || currentPage?.title || rootTitle,
  );

  return (
    <>
      <NextSeo
        title={pageTitle}
        description={currentPage?.document?.frontmatter?.summary || ""}
        noindex
        nofollow
      />
      <Banner />
      <DocPage
        sidebarItems={sidebarItems}
        burgerMenuButtonText={rootTitle}
        currentPage={currentPage}
        pageTitle={pageTitle}
        fallbackTitle={rootTitle}
        fallbackMessage="Page not found."
        prevLink={prevLink}
        nextLink={nextLink}
      />
    </>
  );
}

export const getServerSideProps: GetServerSideProps<DraftPageProps> = async ({ query, res }) => {
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Cache-Control", "no-store");

  const docId = typeof query.docs === "string" ? query.docs : null;
  const pageIdRaw = typeof query.page === "string" ? query.page : "";
  const pageId = UUID_REGEX.test(pageIdRaw) ? pageIdRaw : "";

  const empty: Omit<DraftPageProps, "docId" | "error"> = {
    rootTitle: "",
    sections: [],
    currentPage: null,
    prevLink: null,
    nextLink: null,
  };

  if (!docId) {
    return { props: { docId: null, error: null, ...empty } };
  }
  if (!UUID_REGEX.test(docId)) {
    return { props: { docId, error: "Invalid UUID", ...empty } };
  }
  if (!process.env.DOCS_CMS_URL) {
    return { props: { docId, error: "DOCS_CMS_URL not configured", ...empty } };
  }

  try {
    const { getDocument, fetchDocumentContent, fetchDocumentChildren } = await import(
      "@/lib/docs2dsfr/server"
    );

    // Fetch with noCache=true: bypass both read and write so drafts don't pollute the public cache.
    // Metadata-only for the tree (titles + ids); full content only for the currently-viewed page.
    const rootMeta = await fetchDocumentContent(docId, false, true);
    const rawSections = (await fetchDocumentChildren(docId, false, true)).results;
    for (const section of rawSections) {
      section.children =
        section.numchild > 0 ? (await fetchDocumentChildren(section.id, false, true)).results : [];
    }
    const sections = rawSections.map((s) => buildPageItem(s));

    // If the UUID is itself a leaf with content and no children, render it as the current page.
    if (sections.length === 0 && rootMeta.content) {
      const rootDoc = await getDocument(docId, false, true);
      const rawTitle = rootDoc.frontmatter?.title || rootDoc.title;
      const slug = rootDoc.frontmatter?.path || (rawTitle ? slugify(rawTitle) : rootDoc.id);
      const rootAsPage: PageItem = {
        id: rootDoc.id,
        title: displayTitle(rawTitle, rootDoc.id),
        slug,
        path: slug,
        document: rootDoc,
        children: [],
      };
      return {
        props: {
          docId,
          rootTitle: cleanTitle(rootDoc.title) || "Draft",
          sections: [rootAsPage],
          currentPage: rootAsPage,
          prevLink: null,
          nextLink: null,
          error: null,
        },
      };
    }

    // Pick the current page, then fetch its content.
    let currentPage: PageItem | null = null;
    if (pageId) currentPage = findPageById(sections, pageId);
    if (!currentPage) currentPage = getFirstPage(sections);
    if (currentPage) {
      currentPage.document = await getDocument(currentPage.id, false, true);
      const rawTitle = currentPage.document.frontmatter?.title || currentPage.document.title;
      currentPage.title = displayTitle(rawTitle, currentPage.id);
    }

    let prevLink: PageNavLink | null = null;
    let nextLink: PageNavLink | null = null;
    if (currentPage) {
      const flat = flattenPages(sections);
      const idx = flat.findIndex((p) => p.id === currentPage!.id);
      const toLink = (p: PageItem): PageNavLink => ({
        text: p.title,
        href: `/draft?docs=${docId}&page=${p.id}`,
      });
      if (idx > 0) prevLink = toLink(flat[idx - 1]);
      if (idx >= 0 && idx < flat.length - 1) nextLink = toLink(flat[idx + 1]);
    }

    return {
      props: {
        docId,
        rootTitle: cleanTitle(rootMeta.title) || "Draft",
        sections,
        currentPage,
        prevLink,
        nextLink,
        error: null,
      },
    };
  } catch (e) {
    const err = e as Error & { cause?: Error & { code?: string } };
    const cause = err?.cause;
    const detail = cause?.message || cause?.code;
    const msg = err?.message || "Unknown error";
    console.error("[draft] fetch failed:", msg, "cause:", cause);
    return {
      props: { docId, error: detail ? `${msg} (${detail})` : msg, ...empty },
    };
  }
};
