# Redoost frontend

Bun, React, Tailwind CSS, and shadcn/ui.

```sh
bun install
cp .env.example .env
bun run dev
```

The dev server runs at <http://localhost:5173> and forwards `/api/*` to
FastAPI at `http://127.0.0.1:8000`.
Garage needs a POST CORS rule for `http://localhost:5173` (see
`backend/README.md`). `BUN_PUBLIC_SITES_ORIGIN` sets the base hostname for
published site links; those links work once Nginx site routing is configured.

Build static files for Nginx with `bun run build`. The output is in `dist/`.
