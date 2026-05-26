import { SearchResults, useSearch } from "@/components/Search";
import { navCollectionsOf, type Site } from "@/lib/sites";
import { Footer } from "@codegouvfr/react-dsfr/Footer";
import { Header } from "@codegouvfr/react-dsfr/Header";
import { SkipLinks } from "@codegouvfr/react-dsfr/SkipLinks";
import Head from "next/head";
import { useRouter } from "next/router";
import { ReactNode } from "react";

const brandTop = (
  <>
    République
    <br />
    Française
  </>
);

type LayoutProps = {
  children: ReactNode;
  site: Site | null;
};

export function PageLayout({ children, site }: LayoutProps) {
  const router = useRouter();
  const contentSecurityPolicy = process.env.CONTENT_SECURITY_POLICY;
  const { results, loading, open, query, activeIndex, search, close, onKeyDown, setActiveIndex } =
    useSearch();

  // Unknown host: render bare so 404/healthz pages still work without tenant chrome.
  if (!site) {
    return (
      <>
        <Head>
          {contentSecurityPolicy && (
            <meta httpEquiv="Content-Security-Policy" content={contentSecurityPolicy} />
          )}
          <link rel="icon" href="/favicon.ico" />
        </Head>
        <main role="main" id="content">
          {children}
        </main>
      </>
    );
  }

  const homeLinkProps = {
    href: "/",
    title: site.subtitle ? `${site.title} - ${site.subtitle}` : site.title,
  };

  const navItems = [
    ...navCollectionsOf(site).map((collection) => ({
      text: collection.title,
      linkProps: {
        href: `/${collection.slug}/`,
      },
      isActive: router.asPath.startsWith(`/${collection.slug}`),
    })),
    ...(site.parentSiteUrl
      ? [
          {
            text: site.parentSiteLabel || "Retour au site",
            linkProps: { href: site.parentSiteUrl },
            isActive: false,
          },
        ]
      : []),
  ];

  return (
    <>
      <Head>
        {contentSecurityPolicy && (
          <meta httpEquiv="Content-Security-Policy" content={contentSecurityPolicy} />
        )}
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <SkipLinks
        links={[
          {
            anchor: "#content",
            label: "Contenu",
          },
          {
            anchor: "#fr-header",
            label: "Menu",
          },
          {
            anchor: "#fr-footer",
            label: "Pied de page",
          },
        ]}
      />
      <>
        <Header
          brandTop={brandTop}
          serviceTitle={site.title}
          serviceTagline={site.subtitle}
          homeLinkProps={homeLinkProps}
          quickAccessItems={[
            {
              iconId: "fr-icon-mail-line",
              text: "Nous contacter",
              linkProps: {
                href: "mailto:aide@suite.anct.gouv.fr?subject=Guide%20-%20Demande%20d'aide&body=Nom%20de%20la%20plateforme%20concernée%20:%20%0ADécrivez%20votre%20demande",
              },
            },
          ]}
          navigation={navItems}
          renderSearchInput={({ className, id, placeholder, type }) => (
            <input
              className={className}
              id={id}
              placeholder={placeholder}
              type={type}
              value={query}
              onChange={(e) => search(e.target.value)}
              onKeyDown={onKeyDown}
              onFocus={() => {
                if (results.length > 0) search(query);
              }}
            />
          )}
          onSearchButtonClick={(text) => search(text)}
          allowEmptySearch={false}
          clearSearchInputOnSearch={false}
        />
        <SearchResults
          results={results}
          query={query}
          loading={loading}
          open={open}
          activeIndex={activeIndex}
          onClose={close}
          onHoverIndex={setActiveIndex}
        />
      </>
      <main role="main" id="content">
        {children}
      </main>
      <Footer
        brandTop={brandTop}
        accessibility="non compliant"
        contentDescription={
          site.footerDescription ? (
            <span dangerouslySetInnerHTML={{ __html: site.footerDescription }} />
          ) : undefined
        }
        homeLinkProps={homeLinkProps}
        bottomItems={
          site.repositoryUrl
            ? [
                {
                  text: "Contribuer sur GitHub",
                  linkProps: { href: site.repositoryUrl },
                },
              ]
            : undefined
        }
      />
    </>
  );
}
