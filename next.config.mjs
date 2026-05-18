import { withSentryConfig } from "@sentry/nextjs";
import ContentSecurityPolicy from "./csp.config.mjs";

const pkg = await import("./package.json", { with: { type: "json" } });
const version = pkg.default.version;

/** @type {import('next').NextConfig} */
const moduleExports = {
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
  crossOrigin: "anonymous",
  pageExtensions: ["js", "jsx", "ts", "tsx"],
  poweredByHeader: false,
  bundlePagesRouterDependencies: true,

  reactStrictMode: process.env.NODE_ENV !== "production",

  images: {
    remotePatterns: [
      ...(process.env.DOCS_CMS_URL
        ? [new URL(process.env.DOCS_CMS_URL.replace(/\/+$/, "") + "/**")]
        : []),
      { protocol: "https", hostname: "**.gouv.fr", pathname: "/**" },
    ],
  },

  webpack: (config) => {
    config.module.rules.push({
      test: /\.(woff2|webmanifest)$/,
      type: "asset/resource",
    });
    return config;
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_APP_VERSION_COMMIT: process.env.GITHUB_SHA || process.env.CONTAINER_VERSION,
    CONTENT_SECURITY_POLICY: ContentSecurityPolicy,
  },
  onDemandEntries: {
    maxInactiveAge: 24 * 3600 * 1000,
    pagesBufferLength: 100,
  },
  transpilePackages: ["@codegouvfr/react-dsfr", "tss-react"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "Cross-Origin-Opener-Policy", value: "same-origin" }],
      },
    ];
  },
};

export default withSentryConfig(moduleExports, { silent: true });
