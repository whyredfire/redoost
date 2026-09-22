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

The API is available at <http://localhost:8000>. Its health endpoint is:

- `GET /health`

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
