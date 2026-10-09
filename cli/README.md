# redoost CLI

Publish static sites to redoost from the command line. Needs Python 3.10 or
newer.

Each release attaches the CLI as a wheel, so it runs from a release's URL:

```sh
uvx --from https://github.com/whyredfire/redoost/releases/download/v0.2.2/redoost-0.2.2-py3-none-any.whl redoost login
```

`pipx install <wheel URL>` works too, and so does the source at any tag or
branch:

```sh
uvx --from "git+https://github.com/whyredfire/redoost@v0.2.2#subdirectory=cli" redoost login
```

## Signing in

`redoost login` prints a link. Open it on any device, sign in to the dashboard,
and continue; the CLI finishes signing in by itself, so it works without a
browser on the machine. Links expire after 10 minutes.

Tokens are saved per server in `~/.config/redoost/config.json`, readable only by
you, and last 30 days. `redoost logout` forgets the token.

## Commands

| Command | |
| --- | --- |
| `redoost login` | Sign in through a link |
| `redoost logout` | Forget this sign-in |
| `redoost whoami` | Show who's signed in |
| `redoost publish <folder\|zip\|file.html>` | Publish a new site |
| `redoost publish <path> --update <slug>` | Replace a site's files, uploading only what changed |
| `redoost list` | List your sites |
| `redoost delete <slug>` | Delete a site |

Every command takes `--json` to print its result as JSON, with progress on
stderr, and `--server` (or `REDOOST_SERVER`) to use another redoost, such as
`http://localhost:8081` for the Compose stack.

## Development

```sh
uv sync
uv run ruff format --check .
uv run ruff check .
uv run basedpyright src tests
uv run pytest
```

`.python-version` pins Python 3.10, so code that needs a newer Python fails
here first.
