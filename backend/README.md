# Redoost backend

FastAPI, async SQLModel on Postgres, and async S3. It runs as the `api` service
in Compose (see the root README).

## Users

Every request apart from `/health`, `/api/version`, the limits, the auth
config, starting and claiming a CLI sign-in, and `/internal/sites` sends
`Authorization: Bearer <token>`: a JWT the API issues to the dashboard, or an
API token. Missing, expired, or unknown tokens get 401, and other users'
deployments 403. JWTs are valid for 30 days, and users sign in one of two ways:

- **With an OIDC provider**, when `REDOOST_OIDC_ISSUER` is set: clients sign in
  with the authorization code flow and PKCE, then send the code to
  `POST /api/auth/token` as `{"code", "code_verifier", "redirect_uri"}`. The API
  exchanges it with the client secret and returns a token.
- **As a dev user**, when `REDOOST_DEV_SIGN_IN` is set, for local development:
  `POST /api/auth/dev` returns a token for `dev@localhost`.

`GET /api/auth/config` returns the authorization endpoint, client ID, and
scope to sign in with as `oidc`, and whether dev sign-in is on as `dev`. `GET /api/auth/me`
returns the token's user, and `DELETE /api/auth/me` deletes them with all their
sites, files first, after which their tokens get 401.

The CLI signs in through the browser: `POST /api/auth/cli` returns an `id` and
`secret`, and the CLI prints `<app origin>/cli/<id>` for a signed-in user to
approve with `POST /api/auth/cli/{id}`. Meanwhile it polls
`POST /api/auth/cli/{id}/token` with `{"secret", "name"}`, which returns 202
until the link is approved, then an API token once. Links expire after 10
minutes.

API tokens act as their user. They're prefixed `rdo_`, stored only as a hash,
and have a name, a `source` of `cli` for sign-ins or `manual` for ones made in
the dashboard, scopes, and an optional expiry. The scopes are `read`, `publish`
(creating, updating, completing, and cancelling uploads), and `manage`
(enabling, disabling, describing, and deleting sites); reading comes with every
scope, and other requests get 403 without theirs. CLI sign-ins get every scope
for 30 days. `POST /api/auth/tokens` with `{"name", "scopes", "expires_at"}`
makes one, returning it just that once; `GET /api/auth/tokens` lists them with
when each was last used; `DELETE /api/auth/tokens/{id}` revokes one, and
`DELETE /api/auth/tokens/current` the one making the request, which is how the
CLI signs out. No token can manage tokens, approve CLI sign-ins, or delete the
account: those take the dashboard's JWT.

## API

- `GET /health`
- `GET /api/version`: the deployed version, and the SHA-256 of the CLI wheel
  released with it, which `redoost update` checks before installing.
- `GET /api/deployments/limits`: the file, deployment, and file count limits.
- `GET /api/deployments/usage`: bytes the user's sites take up, and the most
  they can.
- `GET /api/deployments/slugs`: four unused addresses to publish a new site
  at, different each time and held for the user for `REDOOST_UPLOAD_WINDOW`.
- `POST /api/deployments`: create a deployment from a manifest of
  `{"path", "size", "sha256", "gzip"}` files, where `sha256` is the
  base64-encoded digest. Size and digest are of the bytes as uploaded; files
  sent gzip-compressed set `gzip` and are served with `Content-Encoding: gzip`.
  An optional `slug` picks one of the addresses offered to the user, and gets
  409 once the offer lapsed or was used; without one, the server picks. Returns the
  slug and one signed upload policy per file. Users whose sites would exceed
  `REDOOST_MAX_ACCOUNT_SIZE` in total get 403.
- `GET /api/deployments`: the user's ready deployments, newest first, each
  with `storage_size` and `version_count` for its kept versions.
- `GET /api/deployments/{slug}`: deployment status.
- `PATCH /api/deployments/{slug}`: changes the site's `description`, or takes
  it offline or puts it online with `enabled`.
- `GET /api/deployments/{slug}/versions`: the site's kept versions, newest
  first, as `{"id", "created_at", "file_count", "size", "description",
  "current"}`. A manifest's optional `version_description` says what the
  version changes, and `PATCH /api/deployments/{slug}/versions/{id}` with
  `{"description"}` changes it later. Each site
  keeps its last `REDOOST_KEPT_VERSIONS` (default 5), every one counting in full
  toward `REDOOST_MAX_ACCOUNT_SIZE`; older ones are deleted as updates complete.
- `POST /api/deployments/{slug}/versions/{id}/restore`: serves that version
  again, right away and without copying anything; the one it replaces stays
  kept. Returns 409 while an upload is in progress.
- `DELETE /api/deployments/{slug}/versions/{id}`: deletes a version other than
  the one served, which gets 409.
- `DELETE /api/deployments/{slug}/versions`: deletes every version but the one
  served, returning the deployment.
- `GET /api/deployments/{slug}/files`: the site's stored files as
  `{"path", "sha256"}`, sorted by path, so an update can be previewed. Each
  version's files are recorded when it's published, so this and updates never
  read them back from storage.
- `PUT /api/deployments/{slug}`: updates a ready site in place from a full
  manifest, counted on top of its kept versions against
  `REDOOST_MAX_ACCOUNT_SIZE`. Returns upload policies only for new and changed
  files, compared by checksum with what's stored; unchanged ones are copied
  into the new version when it completes, so each version is complete on its
  own. One upload per site at a time: returns 409 while another is in progress.
- `POST /api/deployments/{slug}/complete`: send the manifest again; marks the
  deployment `ready` once every file is stored with its checksum, then
  deletes files not in the manifest and frees the site for its next update.
  Returns 409 while files are missing or the manifest isn't the one the upload
  started with, and 410 after the upload window.
- `POST /api/deployments/{slug}/cancel`: frees the site for another update and
  deletes the files uploaded so far. Its upload policies work until the window
  closes, so its size counts toward the user's storage until then, and cleanup
  deletes anything uploaded meanwhile.
- `DELETE /api/deployments/{slug}`: deletes the deployment's files, then the
  deployment. The site shows "Site not found" right away.
- `PATCH /api/deployments?slug=…&slug=…`: takes up to 100 of the user's sites
  offline or puts them online, with `{"enabled": false}` or `true`, returning
  `{"changed": [...]}`.
- `DELETE /api/deployments?slug=…&slug=…`: deletes up to 100 of the user's
  sites at once, returning `{"deleted": [...]}`. Both bulk requests leave out
  sites that don't exist, so repeating them is safe, and return 403 without
  changing anything if any of the sites belongs to someone else.
- `GET /internal/sites/{slug}`: readiness check for Nginx. Not exposed publicly.

Manifests need a root `index.html`. Default limits are 20 MiB per file,
150 MiB per deployment, and 2000 files, set with `REDOOST_MAX_FILE_SIZE`,
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
upload window and bucket folders without a deployment, lets go of updates
nobody finished, deletes the folders let go of once their upload window has
passed or Nginx can no longer have them cached, and removes expired CLI sign-in
links, API tokens, and address offers. It handles up to 100 of each per run. The chart runs it as a CronJob (`cleanup.schedule`, hourly by default),
keeping the last 10 successful and failed runs (`cleanup.successfulJobsHistoryLimit`,
`cleanup.failedJobsHistoryLimit`); in Compose, run it with
`docker compose exec api uv run --no-sync python -m scripts.cleanup`.

## Checks

Run from the repository root while the stack is up. Tests use the Postgres
database in `REDOOST_TEST_DATABASE_URL`, which they empty first; in Compose,
that's `redoost_test` on the `postgres` service. The public S3 endpoint is
overridden so upload tests can reach Garage from inside the container:

```sh
docker compose exec -e REDOOST_S3_PUBLIC_ENDPOINT=http://garage:3900 api uv run --no-sync python -m pytest
docker compose exec api uv run --no-sync ruff check .
docker compose exec api uv run --no-sync ruff format --check .
docker compose exec api uv run --no-sync basedpyright src scripts tests migrations
```
