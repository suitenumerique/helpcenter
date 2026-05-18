# Help Center

A multi-tenant documentation help center built with Next.js. UI uses the [DSFR](https://www.systeme-de-design.gouv.fr/) design system; content is served from a [Docs](https://docs.numerique.gouv.fr) CMS instance.

A single deployment serves multiple sites at once, routed by request `Host` header. Each site has its own header/footer, its own collections, and its own search index. The app is read-only and entirely public — there is no user authentication.

## Architecture

- **Next.js** (Pages Router) with server-side rendering.
- **DSFR** for UI components.
- **Docs CMS** integration in `src/lib/docs2dsfr/`: server-side fetch with in-memory caching, client-side React rendering via rehype.
- **Per-tenant config** in `src/lib/sites.ts`: parses `HELPCENTER_SITES`, resolves the active site from `req.headers.host`, exposes helpers consumed by every page.
- **Search**: pagefind index per tenant, stored in Redis. The `/api/pagefind/[...path]` route reads the request `Host` to serve the right index.

## URL structure

```
/                          → Redirect to the first collection
/[collection]/             → First page of the collection with sidebar
/[collection]/[page-slug]  → Specific page within the collection
/draft?docs=<uuid>         → Public preview of a Docs CMS draft (cache-bypassed)
```

## Local development

```bash
make bootstrap       # build and start frontend-dev + redis
make logs            # follow logs
make reindex         # populate the search index
```

The app runs at <http://localhost:8990>. The default `.env.defaults` ships a working configuration that points at the public [docs.numerique.gouv.fr](https://docs.numerique.gouv.fr) instance, so the dev server boots with content out of the box. Override anything by creating an `.env.local` (git-ignored).

Without Docker:

```bash
set -a && source .env.defaults && set +a   # docker-compose does this for you
npm install
npm run dev
```

## Multi-tenant configuration

All site-specific configuration lives in `HELPCENTER_SITES`, a JSON object indexed by hostname. Hostnames are matched **literally**, including port — local dev uses `"localhost:8990"`. Requests with a `Host` header that doesn't match any configured site return 404 on every route.

```jsonc
{
  "<hostname>": {
    "title":             "Site title",                     // header service title
    "subtitle":          "Site subtitle",                   // optional; header tagline
    "parentSiteUrl":     "https://...",                    // optional; adds a "back to parent" nav link
    "parentSiteLabel":   "Retour au site",                 // optional; label for the parent-site link
    "footerDescription": "...",                            // optional; footer description text
    "repositoryUrl":     "https://github.com/...",         // optional; footer "Contribute" link
    "matomoUrl":         "https://matomo.example.com",     // optional; tracking enabled when both matomo* are set
    "matomoSiteId":      "42",                             // optional; Matomo site id (string)
    "collections": [
      {
        "slug":   "guides",                                // URL segment: /guides/...
        "title":  "Guides",                                // displayed in nav and sidebar
        "docsId": "<doc-uuid>",                            // Docs CMS parent document UUID
        "pageId": "<doc-uuid>"                             // optional; landing page within the collection
      }
    ]
  }
}
```

## Environment variables

### Required

| Variable            | Description                                          |
| ------------------- | ---------------------------------------------------- |
| `DOCS_CMS_URL`      | Docs CMS base URL (shared by all tenants).           |
| `HELPCENTER_SITES`  | JSON object mapping hostname to site config (above). |

### Server & infrastructure

| Variable                  | Description                                  | Default                  |
| ------------------------- | -------------------------------------------- | ------------------------ |
| `PORT`                    | Server port.                                 | `8990`                   |
| `REDIS_URL`               | Redis URL used by reindex and search lookup. | `redis://localhost:6379` |
| `CONTENT_SECURITY_POLICY` | CSP header value injected into `<head>`.     | (none)                   |
| `NEXT_PUBLIC_BASE_PATH`   | Base path for subpath deployment.            | (empty)                  |
| `NEXT_PUBLIC_SITE_URL`    | Public site URL (used in robots.txt, etc).   | `http://localhost:8990`  |

### Observability (optional)

| Variable                                | Description                              | Default |
| --------------------------------------- | ---------------------------------------- | ------- |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | Sentry DSN. Sentry is disabled if unset. | (empty) |
| `SENTRY_ENV` / `NEXT_PUBLIC_SENTRY_ENV` | Sentry environment label.                | (empty) |

### Build-time

| Variable                           | Description                                                        | Default |
| ---------------------------------- | ------------------------------------------------------------------ | ------- |
| `GITHUB_SHA` / `CONTAINER_VERSION` | Commit SHA used as the Sentry release tag (and exposed to client). | (empty) |
| `PRODUCTION`                       | If truthy, prebuild generates a production-mode robots.txt.        | (empty) |

## Search reindex

`npm run reindex` iterates every site in `HELPCENTER_SITES`, fetches every collection's content from the Docs CMS, and writes a per-host pagefind index to Redis under `pagefind:<hostname>:` keys. Indexed entries expire after 7 days, so the script must run periodically (the bundled `cron.json` runs it every 10 minutes on Scalingo).

## Deployment

The repo ships everything needed for a [Scalingo](https://scalingo.com) deployment with a Caddy reverse proxy in front of Next.js:

- `Procfile` runs `scripts/scalingo_run_web`, which launches Caddy and Next.js side-by-side.
- `scripts/scalingo_postfrontend` builds Caddy with the rate-limit and geolocation plugins.
- `src/caddy/Caddyfile` provides IP/country blocklisting and rate limiting, configured via `PROXY_*` env vars.
- `cron.json` schedules the search reindex.
- `Dockerfile` provides `runtime-dev` and `runtime-prod` stages for local Docker workflows.

Caddy and the build pipeline are Scalingo-flavored but should adapt to any Docker-friendly platform.

## License

MIT
