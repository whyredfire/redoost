# Redoost backend

FastAPI, async SQLModel on SQLite or Postgres, and async S3. It runs as the `api` service
in Compose (see the root README).

## API

- `GET /health`
- `POST /api/deployments`: create a deployment from a manifest of
  `{"path", "size", "sha256", "gzip"}` files, where `sha256` is the
  base64-encoded digest. Size and digest are of the bytes as uploaded; files
  sent gzip-compressed set `gzip` and are served with `Content-Encoding: gzip`. Returns the slug, a management token, and one signed upload policy
  per file. Send a token from an earlier deployment to reuse it; unknown
  tokens get 403.
- `GET /api/deployments`: ready deployments for the token, newest first.
- `GET /api/deployments/{slug}`: deployment status. Requires
  `Authorization: Bearer <token>`.
- `GET /api/deployments/{slug}/files`: the site's stored files as
  `{"path", "sha256"}`, so an update can be previewed. Requires the token.
- `PUT /api/deployments/{slug}`: updates a ready site in place from a full
  manifest. Returns upload policies only for new and changed files, compared
  by checksum with what's stored. One upload per site at a time: returns 409
  while another is in progress and 410 for expired sites. Requires the token.
- `POST /api/deployments/{slug}/complete`: send the manifest again; marks the
  deployment `ready` once every file is stored with its checksum, then
  deletes files not in the manifest and frees the site for its next update.
  Returns 409 while files are missing and 410 after the upload window.
  Requires the token.
- `POST /api/deployments/{slug}/cancel`: frees the site for another update.
  Files uploaded so far stay until then. Requires the token.
- `DELETE /api/deployments/{slug}`: deletes the deployment's files, then the
  deployment. Requires the token. The site shows "Site not found" right away.
- `GET /internal/sites/{slug}`: readiness check for Nginx. Not exposed publicly.

Manifests need a root `index.html`. Default limits are 10 MiB per file,
50 MiB per deployment, and 500 files, set with `REDOOST_MAX_FILE_SIZE`,
`REDOOST_MAX_DEPLOYMENT_SIZE`, and `REDOOST_MAX_DEPLOYMENT_FILES`.

### Uploading files

Each file is uploaded with a multipart `POST` to `upload_url`, sending its
policy's `fields` first and the file last as `file`. Policies are bound to the
file's key, size, content type, and SHA-256, and expire after
`REDOOST_UPLOAD_WINDOW` (default 1 hour, at most 24 hours).

## Migrations

Alembic manages the schema, configured under `[tool.alembic]` in
`pyproject.toml`. The one-off `migrate` service runs `alembic upgrade head`
before `api` starts, like an init container on the API pod would. Watch mode
reruns it when `migrations/` changes.

After changing a model, generate a migration from the repository root. Mounting
`migrations/` writes the new file back to your checkout:

```sh
docker compose run --rm --no-deps -v ./backend/migrations:/app/migrations migrate uv run --no-sync alembic revision --autogenerate -m "Describe the change"
```

Review the generated file before committing. `tests/test_migrations.py` fails
if a model changes without a migration.

## Cleanup

`python -m scripts.cleanup` removes deployments still uploading after their
upload window, sites past their `REDOOST_SITE_LIFETIME`, and bucket folders
without a deployment, up to 100 of each per run. The chart runs it as a CronJob (`cleanup.schedule`, daily by default), keeping the last 10 successful and failed runs (`cleanup.successfulJobsHistoryLimit`, `cleanup.failedJobsHistoryLimit`);
in Compose, run it with `docker compose exec api uv run --no-sync python -m scripts.cleanup`.

## Checks

Run from the repository root while the stack is up. Tests use an in-memory
SQLite database, or the one in `REDOOST_TEST_DATABASE_URL`, e.g. an empty
Postgres database; the public S3 endpoint is overridden so upload tests can
reach Garage from inside the container:

```sh
docker compose exec -e REDOOST_S3_PUBLIC_ENDPOINT=http://garage:3900 api uv run --no-sync python -m pytest
docker compose exec api uv run --no-sync ruff check .
docker compose exec api uv run --no-sync ruff format --check .
docker compose exec api uv run --no-sync basedpyright src scripts tests migrations
```
