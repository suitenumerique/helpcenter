# Help Center - La Suite territoriale

A documentation-focused help center app built with Next.js and the [DSFR](https://www.systeme-de-design.gouv.fr/) design system. Content is served from a [Docs](https://docs.suite.anct.gouv.fr) CMS instance.

## Architecture

- **Next.js** (Pages Router) with server-side rendering
- **DSFR** (Système de design de l'État) for UI components
- **Docs CMS** integration via `src/lib/docs2dsfr/` for content fetching and rendering
- **Collections**: URL routes mapped to Docs CMS parent documents, configured in `src/lib/collections.ts`

## URL Structure

```
/                          → Redirects to the first collection
/[collection]/             → First page of the collection with sidebar
/[collection]/[page-slug]  → Specific page within the collection
```

### Configured Collections

| Slug  | Docs Parent ID                         | URL     |
| ----- | -------------------------------------- | ------- |
| `lst` | `281bc1f0-5911-4442-b4b7-af78d77f0e1e` | `/lst/` |

## Getting Started

```bash
npm install
npm run dev
```

The app runs on [http://localhost:8990](http://localhost:8990).

## Environment Variables

| Variable                | Description                      | Default                           |
| ----------------------- | -------------------------------- | --------------------------------- |
| `PORT`                  | Server port                      | `8990`                            |
| `DOCS_CMS_URL`          | Docs CMS base URL                | `https://docs.suite.anct.gouv.fr` |
| `NEXT_PUBLIC_BASE_PATH` | Base path for subpath deployment | (empty)                           |
| `NEXT_PUBLIC_SITE_URL`  | Public site URL                  | `http://localhost:8990`           |

## License

MIT
