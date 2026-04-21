import "../styles/global.css";
import "../styles/content.css";

import NextApp, { AppContext, AppInitialProps, AppProps } from "next/app";

import Link from "next/link";

import { createNextDsfrIntegrationApi } from "@codegouvfr/react-dsfr/next-pagesdir";
import { createEmotionSsrAdvancedApproach } from "tss-react/next";

import { DefaultSeo } from "next-seo";

import type { NavCollection } from "@/lib/collections";
import { PageLayout } from "../layouts/page";

declare module "@codegouvfr/react-dsfr/next-pagesdir" {
  interface RegisterLink {
    Link: typeof Link;
  }
}

declare module "@codegouvfr/react-dsfr" {
  interface RegisterLink {
    Link: typeof Link;
  }
}

const { withDsfr, dsfrDocumentApi } = createNextDsfrIntegrationApi({
  defaultColorScheme: "light",
  Link,
  useLang: () => "fr",
  preloadFonts: ["Marianne-Regular", "Marianne-Medium", "Marianne-Bold"],
});

export { dsfrDocumentApi };

const { withAppEmotionCache, augmentDocumentWithEmotionCache } = createEmotionSsrAdvancedApproach({
  key: "css",
});

export { augmentDocumentWithEmotionCache };

const SITE_TITLE = process.env.NEXT_PUBLIC_SITE_TITLE || "Centre d'aide";
const SITE_SUBTITLE = process.env.NEXT_PUBLIC_SITE_SUBTITLE || "";
const FULL_TITLE = SITE_SUBTITLE ? `${SITE_TITLE} - ${SITE_SUBTITLE}` : SITE_TITLE;

// navCollections comes from a server-only env var and is populated via App.getInitialProps
// on SSR. On client-side navigation, getInitialProps re-runs on the client where the env var
// is not available, so we cache the initial SSR value at module scope.
let navCollectionsCache: NavCollection[] = [];

type Props = AppProps & { navCollections: NavCollection[] };

function App({ Component, pageProps, navCollections }: Props) {
  if (navCollections.length > 0) navCollectionsCache = navCollections;
  const effectiveNav = navCollections.length > 0 ? navCollections : navCollectionsCache;

  return (
    <>
      <DefaultSeo
        defaultTitle={FULL_TITLE}
        titleTemplate={`%s - ${SITE_TITLE}`}
        description={FULL_TITLE}
      />
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <PageLayout navCollections={effectiveNav}>
          <Component {...pageProps} />
        </PageLayout>
      </div>
    </>
  );
}

App.getInitialProps = async (
  appContext: AppContext,
): Promise<AppInitialProps & { navCollections: NavCollection[] }> => {
  const appProps = await NextApp.getInitialProps(appContext);
  if (typeof window === "undefined") {
    const { navCollections } = await import("@/lib/collections");
    return { ...appProps, navCollections };
  }
  return { ...appProps, navCollections: [] };
};

export default withDsfr(withAppEmotionCache(App));
