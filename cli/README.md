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

Each sign-in is a token named after the machine, saved per server in
`~/.config/redoost/config.json`, readable only by you, and good for 30 days. The
dashboard lists them under Settings → API tokens, where you can sign a machine
out; `redoost logout` revokes the token and forgets it.

### From a pipeline

Pipelines can't open a link, so they use a token made under Settings → API
tokens instead, with the scopes they need, usually just read and publish, and
an expiry if you like. Either set it as `REDOOST_TOKEN` where the CLI runs,
which takes precedence over a saved sign-in, or run `redoost login --token`
once to save it. For example, in GitHub Actions, with the token saved as a
repository secret:

```yaml
- run: uv tool install "git+https://github.com/whyredfire/redoost#subdirectory=cli"
- run: redoost publish ./dist --update brave-otter-1a2b
  env:
    REDOOST_TOKEN: ${{ secrets.REDOOST_TOKEN }}
```

## Commands

| Command | |
| --- | --- |
| `redoost login` | Sign in through a link; `--token` signs in with an API token instead |
| `redoost logout` | Revoke and forget this sign-in |
| `redoost whoami` | Show who's signed in and how much storage their sites use |
| `redoost preview <folder\|zip\|file.html>` | Serve a site locally as it would be published, on a free port, and press Enter to open it; `--port` picks one, `--host 0.0.0.0` shares it on your network |
| `redoost publish <folder\|zip\|file.html>` | Publish a new site; `--description` adds a note to tell it apart |
| `redoost publish <path> --update <slug>` | Replace a site's files, uploading only what changed, or nothing if nothing did |
| `redoost list` | List your sites |
| `redoost disable <slug>...` | Take sites offline, keeping their files and addresses |
| `redoost enable <slug>...` | Put offline sites back online |
| `redoost describe <slug> <text>` | Change a site's description, or clear it with `""` |
| `redoost delete <slug>...` | Delete one or more sites |
| `redoost update` | Update the CLI to the release your server runs |

Publishing and previewing leave out dotfiles like `.env` and `.git/`, except
`.well-known/`, and links to files outside the folder.

Once a day, commands run in a terminal check whether the server runs a newer
release, and suggest `redoost update` if so.

Every command takes `--json` to print its result as JSON, with progress on
stderr, and `--server` (or `REDOOST_SERVER`) to use another redoost, such as
`http://localhost:8081` for the Compose stack. `REDOOST_TOKEN` signs in with an
API token instead of a saved sign-in.

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
