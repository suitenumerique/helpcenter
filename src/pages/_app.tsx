import "../styles/global.css";
import "../styles/content.css";

import NextApp, { AppContext, AppInitialProps, AppProps } from "next/app";

import Link from "next/link";
import { useEffect } from "react";

import { createNextDsfrIntegrationApi } from "@codegouvfr/react-dsfr/next-pagesdir";
import { init as matomoInit } from "@socialgouv/matomo-next";
import { createEmotionSsrAdvancedApproach } from "tss-react/next";

import { DefaultSeo } from "next-seo";

import type { Site } from "@/lib/sites";
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

// Site is resolved server-side from the request host in App.getInitialProps.
// On client-side navigation, getInitialProps re-runs without a req, so we cache
// the initial SSR value at module scope.
let siteCache: Site | null = null;

// Matomo's init() injects a <script> tag and global state; one call per browser session.
let matomoInited = false;

type Props = AppProps & { site: Site | null };

function App({ Component, pageProps, site }: Props) {
  if (site) siteCache = site;
  // Only fall back to the cache on the client. On the server the cache is shared
  // across requests, which would leak one tenant's chrome onto an unknown host.
  const effectiveSite = site ?? (typeof window !== "undefined" ? siteCache : null);

  const matomoUrl = effectiveSite?.matomoUrl;
  const matomoSiteId = effectiveSite?.matomoSiteId;
  useEffect(() => {
    if (matomoInited || !matomoUrl || !matomoSiteId) return;
    matomoInit({ url: matomoUrl, siteId: matomoSiteId });
    matomoInited = true;
  }, [matomoUrl, matomoSiteId]);

  const title = effectiveSite?.title || "Centre d'aide";
  const fullTitle = effectiveSite?.subtitle ? `${title} - ${effectiveSite.subtitle}` : title;

  return (
    <>
      <DefaultSeo
        defaultTitle={fullTitle}
        titleTemplate={`%s - ${title}`}
        description={fullTitle}
      />
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <PageLayout site={effectiveSite}>
          <Component {...pageProps} />
        </PageLayout>
      </div>
    </>
  );
}

App.getInitialProps = async (
  appContext: AppContext,
): Promise<AppInitialProps & { site: Site | null }> => {
  const appProps = await NextApp.getInitialProps(appContext);
  if (typeof window === "undefined") {
    const host = appContext.ctx.req?.headers.host ?? null;
    const { getSiteForHost } = await import("@/lib/sites");
    return { ...appProps, site: getSiteForHost(host) };
  }
  return { ...appProps, site: null };
};

export default withDsfr(withAppEmotionCache(App));
