# Redoost frontend

React, TanStack Router, Tailwind CSS, and shadcn/ui, built with Vite and managed
with Bun. It runs as the `frontend` service in Compose (see the root README)
behind the gateway at <http://localhost:8081>, with hot reload. The gateway
sends `/api/` to the API, so the frontend calls it on the same origin.

Routes are files in `src/routes/`. The router plugin regenerates
`src/routeTree.gen.ts` whenever Vite runs; commit it with route changes.

The base URL for published site links comes from `/config.json` at runtime, so
builds aren't tied to a domain. The Vite dev server fills it from
`REDOOST_SITES_ORIGIN` (derived from `REDOOST_SITES_DOMAIN` in Compose); in
production the frontend's Nginx serves it.

## Checks

```sh
docker compose exec frontend bunx tsc --noEmit
docker compose exec frontend bun run build
```

`bun run build` writes static files to `dist/` for Nginx, with gzipped copies of
the assets for `gzip_static`.
