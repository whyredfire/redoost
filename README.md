# redoost

Self-hosted static-site publishing with FastAPI, React, Garage, and Nginx.

The backend development setup is documented in [`backend/README.md`](backend/README.md).
The frontend development setup is documented in [`frontend/README.md`](frontend/README.md).

Garage UI is included in Compose at <http://localhost:8080>.

Nginx serves published sites at `http://<slug>.<REDOOST_SITES_DOMAIN>:8081`
(`sites.localhost` by default, which browsers resolve locally). It only serves
deployments that are `ready`; anything else gets a "Site not found" page. Sites
without a top-level `404.html` are treated as single-page apps: missing page
paths return `index.html`, while missing assets still return 404.
