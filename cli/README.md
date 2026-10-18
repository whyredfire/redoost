# redoost CLI

Publish static sites to redoost from the command line. Needs Python 3.10 or
newer.

Install it from `main`, so `redoost` works from anywhere:

```sh
# Install with uv
uv tool install "git+https://github.com/whyredfire/redoost#subdirectory=cli"

# Or with pipx
pipx install "git+https://github.com/whyredfire/redoost#subdirectory=cli"
```

`main` can be ahead of what's deployed. Each
[release](https://github.com/whyredfire/redoost/releases) attaches the CLI as a
wheel, with the same commands pinned to that version in its notes.

## For AI agents

The redoost skill teaches agents like Claude Code, Codex, and Cursor to install
the CLI, sign in, and publish and manage sites:

```sh
npx skills add whyredfire/redoost
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
| `redoost whoami` | Show who's signed in and how much storage their sites use |
| `redoost preview <folder\|zip\|file.html>` | Serve a site locally as it would be published, on a free port; `--port` picks one, `--host 0.0.0.0` shares it on your network |
| `redoost publish <folder\|zip\|file.html>` | Publish a new site |
| `redoost publish <path> --update <slug>` | Replace a site's files, uploading only what changed, or nothing if nothing did |
| `redoost list` | List your sites |
| `redoost disable <slug>` | Take a site offline, keeping its files and address |
| `redoost enable <slug>` | Put an offline site back online |
| `redoost delete <slug>` | Delete a site |
| `redoost update` | Update the CLI to the release your server runs |

Once a day, commands run in a terminal check whether the server runs a newer
release, and suggest `redoost update` if so.

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
