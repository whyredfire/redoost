# Redoost backend

## Development

Create the environment file and start Garage from the repository root:

```sh
cp .env.example .env
docker compose up -d garage
```

Browsers upload straight to Garage, so the bucket needs a CORS rule for the
frontend origin. Apply it once from `backend/`:

```sh
set -a && source ../.env && set +a
AWS_ACCESS_KEY_ID="$REDOOST_S3_ACCESS_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$REDOOST_S3_SECRET_ACCESS_KEY" \
uvx --from awscli aws s3api put-bucket-cors \
  --endpoint-url "$REDOOST_S3_ENDPOINT" --region "$REDOOST_S3_REGION" \
  --bucket "$REDOOST_S3_BUCKET" \
  --cors-configuration '{"CORSRules": [{"AllowedOrigins": ["http://localhost:5173"], "AllowedMethods": ["POST"], "AllowedHeaders": ["*"]}]}'
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
  digest. Returns the slug, a management token, and one signed upload policy
  per file.
- `GET /api/deployments/{slug}`: deployment status. Requires
  `Authorization: Bearer <token>`.
- `POST /api/deployments/{slug}/complete`: marks the deployment `ready` once
  every file is uploaded. Returns 409 while files are missing and 410 after
  the upload window. Requires the token.

Manifests need a root `index.html`. Default limits are 10 MiB per file,
50 MiB per deployment, and 500 files, set with `REDOOST_MAX_FILE_SIZE`,
`REDOOST_MAX_DEPLOYMENT_SIZE`, and `REDOOST_MAX_DEPLOYMENT_FILES`.

### Uploading files

Each file is uploaded with a multipart `POST` to `upload_url`, sending its
policy's `fields` first and the file last as `file`. Policies are bound to the
file's key, size, content type, and SHA-256, and expire after
`REDOOST_UPLOAD_WINDOW` (default 1 hour, at most 24 hours).

## Checks

Run tests with:

```sh
uv run python -m pytest
```

The upload tests are skipped unless Garage is reachable. To run them against
the local Garage:

```sh
uv run --env-file ../.env python -m pytest
```

Format, lint, and type-check with:

```sh
uv run ruff format .
uv run ruff check .
uv run basedpyright src tests
```

Garage UI is available at <http://localhost:8080>. Log in with the
`GARAGE_ADMIN_TOKEN` value from `.env`.
