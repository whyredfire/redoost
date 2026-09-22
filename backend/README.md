# Redoost backend

## Development

Create the environment file and start Garage from the repository root:

```sh
cp .env.example .env
docker compose up -d garage
```

Then start the API:

```sh
cd backend
uv sync --locked
uv run --env-file ../.env python -m src.main
```

The API is available at <http://localhost:8000>. Endpoints:

- `GET /health`
- `POST /api/deployments`: create a deployment from a manifest of
  `{"path", "size", "sha256"}` files, where `sha256` is the base64-encoded
  digest. Returns the slug and a management token.
- `GET /api/deployments/{slug}`: deployment status. Requires
  `Authorization: Bearer <token>`.

Manifests need a root `index.html`. Default limits are 10 MiB per file,
50 MiB per deployment, and 500 files, set with `REDOOST_MAX_FILE_SIZE`,
`REDOOST_MAX_DEPLOYMENT_SIZE`, and `REDOOST_MAX_DEPLOYMENT_FILES`.

Run tests with:

```sh
uv run python -m pytest
```

Format, lint, and type-check with:

```sh
uv run ruff format .
uv run ruff check .
uv run basedpyright src tests
```

Garage UI is available at <http://localhost:8080>. Log in with the
`GARAGE_ADMIN_TOKEN` value from `.env`.
