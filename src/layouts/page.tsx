import { SearchResults, useSearch } from "@/components/Search";
import type { NavCollection } from "@/lib/collections";
import { Footer } from "@codegouvfr/react-dsfr/Footer";
import { Header } from "@codegouvfr/react-dsfr/Header";
import { SkipLinks } from "@codegouvfr/react-dsfr/SkipLinks";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { ReactNode } from "react";

const brandTop = (
  <>
    République
    <br />
    Française
  </>
);

const SITE_TITLE = process.env.NEXT_PUBLIC_SITE_TITLE || "Centre d'aide";
const SITE_SUBTITLE = process.env.NEXT_PUBLIC_SITE_SUBTITLE || "";
const PARENT_SITE_URL = process.env.NEXT_PUBLIC_PARENT_SITE_URL || "";
const PARENT_SITE_LABEL = process.env.NEXT_PUBLIC_PARENT_SITE_LABEL || "Retour au site";

const homeLinkProps = {
  href: "/",
  title: SITE_SUBTITLE ? `${SITE_TITLE} - ${SITE_SUBTITLE}` : SITE_TITLE,
};

type LayoutProps = {
  children: ReactNode;
  navCollections: NavCollection[];
};

export function PageLayout({ children, navCollections }: LayoutProps) {
  const router = useRouter();
  const contentSecurityPolicy = process.env.CONTENT_SECURITY_POLICY;
  const { results, loading, open, query, activeIndex, search, close, onKeyDown, setActiveIndex } =
    useSearch();

  const navItems = [
    ...navCollections.map((collection) => ({
      text: collection.title,
      linkProps: {
        href: `/${collection.slug}/`,
      },
      isActive: router.asPath.startsWith(`/${collection.slug}`),
    })),
    ...(PARENT_SITE_URL
      ? [
          {
            text: PARENT_SITE_LABEL,
            linkProps: { href: PARENT_SITE_URL },
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
          serviceTitle={SITE_TITLE}
          serviceTagline={SITE_SUBTITLE}
          homeLinkProps={homeLinkProps}
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
          <>
            La Suite territoriale est un service de{" "}
            <Link href="https://anct.gouv.fr/programmes-dispositifs/incubateur-des-territoires">
              l&rsquo;Incubateur des Territoires
            </Link>
            , une mission de{" "}
            <Link href="https://anct.gouv.fr/">
              l&rsquo;Agence Nationale de la Cohésion des Territoires
            </Link>
            .
          </>
        }
        homeLinkProps={homeLinkProps}
        bottomItems={[
          {
            text: "Contribuer sur GitHub",
            linkProps: {
              href: `${process.env.NEXT_PUBLIC_APP_REPOSITORY_URL}`,
            },
          },
        ]}
      />
    </>
  );
}
