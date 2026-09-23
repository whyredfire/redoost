# redoost

Self-hosted static-site publishing with FastAPI, React, Garage, and Nginx.

## Development

Everything runs in Docker Compose:

```sh
cp .env.example .env
docker compose up --build --wait
docker compose watch
```

`docker compose watch` syncs source changes into the containers, where the API
and frontend reload in place. Lockfile changes rebuild the image. The
`Dockerfile.dev` images are for development only; `backend/Dockerfile`
(distroless, non-root) and `frontend/Dockerfile` (unprivileged Nginx serving the
build) are the production images.

Only two ports are published. The `gateway` service stands in for the
cluster's ingress and routes by host; everything else stays on the Compose
network.

| URL | Routes to |
| --- | --- |
| <http://localhost:8081> | Frontend, with `/api/` going to the API |
| `http://<slug>.sites.localhost:8081` | Published sites (the `sites` Nginx) |
| `http://s3.localhost:8081` | Garage's S3 API, for browser uploads |
| <http://localhost:8080> | Garage UI (log in with `GARAGE_ADMIN_TOKEN`) |

On startup, the one-off `init` service enables the bucket's website endpoint
and its CORS rule for `REDOOST_APP_ORIGIN`.

Nginx serves published sites at `http://<slug>.<REDOOST_SITES_DOMAIN>:8081`
(`sites.localhost` by default, which browsers resolve locally). It only serves
deployments that are `ready`; anything else gets a "Site not found" page. Sites
without a top-level `404.html` are treated as single-page apps: missing page
paths return `index.html`, while missing assets still return 404.

See [`backend/README.md`](backend/README.md) and
[`frontend/README.md`](frontend/README.md) for the API and checks.
