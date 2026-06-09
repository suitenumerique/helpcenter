import BackToTop from "@/components/BackToTop";
import TableOfContents from "@/components/TableOfContents";
import { PageItem, subtreeContains } from "@/lib/collection-tree";
import { DocumentContent } from "@/lib/docs2dsfr/client";
import { fr } from "@codegouvfr/react-dsfr";
import { SideMenu, SideMenuProps } from "@codegouvfr/react-dsfr/SideMenu";

export function buildSidebarItems(
  sections: PageItem[],
  activeId: string,
  getHref: (page: PageItem) => string,
): SideMenuProps.Item[] {
  return sections.map((section) => {
    if (section.children.length === 0) {
      return {
        isActive: activeId === section.id,
        linkProps: { href: getHref(section) },
        text: section.title,
      } satisfies SideMenuProps.Item.Link;
    }
    return {
      isActive: activeId === section.id,
      expandedByDefault: subtreeContains(section, activeId),
      linkProps: { href: getHref(section) },
      text: section.title,
      items: buildSidebarItems(section.children, activeId, getHref),
    } satisfies SideMenuProps.Item.SubMenu;
  });
}

export interface PageNavLink {
  text: string;
  href: string;
}

interface DocPageProps {
  sidebarItems: SideMenuProps.Item[];
  burgerMenuButtonText: string;
  currentPage: PageItem | null;
  pageTitle: string;
  fallbackTitle: string;
  fallbackMessage: string;
  prevLink?: PageNavLink | null;
  nextLink?: PageNavLink | null;
}

export function DocPage({
  sidebarItems,
  burgerMenuButtonText,
  currentPage,
  pageTitle,
  fallbackTitle,
  fallbackMessage,
  prevLink,
  nextLink,
}: DocPageProps) {
  const hasSidebar = sidebarItems.length > 0;

  return (
    <div className={fr.cx("fr-container", "fr-my-4w")}>
      <div className={hasSidebar ? "helpcenter-page-layout" : undefined}>
        {hasSidebar && (
          <div className="helpcenter-sidebar-col">
            <SideMenu
              sticky
              align="left"
              burgerMenuButtonText={burgerMenuButtonText}
              items={sidebarItems}
            />
          </div>
        )}

        <div className={`helpcenter-main-col${hasSidebar ? "" : " helpcenter-main-col--no-sidebar"}`}>
          {currentPage ? (
            <article className="helpcenter-article">
              <h1 className="helpcenter-page-title">{pageTitle}</h1>
              {currentPage.document?.frontmatter?.summary && (
                <p className={fr.cx("fr-text--lead")}>{currentPage.document.frontmatter.summary}</p>
              )}
              <TableOfContents deps={[currentPage.id]} />
              <DocumentContent document={currentPage.document} />
              {(prevLink || nextLink) && (
                <nav
                  aria-label="Pagination"
                  className={`helpcenter-page-switcher ${fr.cx("fr-pt-6w", "fr-mt-14v")}${
                    !prevLink && nextLink ? " helpcenter-page-switcher--end" : ""
                  }`}
                >
                  {prevLink && (
                    <p className={fr.cx("fr-mb-0")}>
                      <a
                        href={prevLink.href}
                        className={fr.cx(
                          "fr-link",
                          "fr-icon-arrow-left-line",
                          "fr-link--icon-left",
                        )}
                      >
                        {prevLink.text}
                      </a>
                    </p>
                  )}
                  {nextLink && (
                    <p className={fr.cx("fr-mb-0")}>
                      <a
                        href={nextLink.href}
                        className={fr.cx(
                          "fr-link",
                          "fr-icon-arrow-right-line",
                          "fr-link--icon-right",
                        )}
                      >
                        {nextLink.text}
                      </a>
                    </p>
                  )}
                </nav>
              )}
            </article>
          ) : (
            <div>
              <h1>{fallbackTitle}</h1>
              <p>{fallbackMessage}</p>
            </div>
          )}

          <BackToTop />
        </div>

      </div>
    </div>
  );
}
