# redoost CLI

Publish static sites to redoost from the command line. It needs Node.js 20 or later.

Install it globally with the script, which uses npm:

```sh
curl -fsSL https://redoost.whyredfire.dev/install.sh | sh
```

Any redoost serves the same script at `/install.sh`; `REDOOST_VERSION=0.7.0` installs that release instead. Or install it yourself:

```sh
npm i -g redoost
```

`bun add -g redoost` works too, as long as Node.js is installed, since the CLI runs on Node. Or run it without installing, as in `npx redoost publish ./dist`, or `bunx redoost publish ./dist`, which works with Bun alone.

## For AI agents

The redoost skill teaches agents like Claude Code, Codex, and Cursor to install the CLI, sign in, and publish and manage sites:

```sh
npx skills add whyredfire/redoost
```

## Signing in

`redoost login` prints a link. Open it on any device, sign in to the dashboard, and continue; the CLI finishes signing in by itself, so it works without a browser on the machine. Links expire after 10 minutes.

Each sign-in is a token named after the machine, saved per server in `~/.config/redoost/config.json`, readable only by you, and good for 30 days. The dashboard lists them under Settings → API tokens, where you can sign a machine out; `redoost logout` revokes the token and forgets it.

### From a pipeline

Pipelines can't open a link, so they use a token made under Settings → API tokens instead, with the scopes they need, usually just read and publish, and an expiry if you like. Either set it as `REDOOST_TOKEN` where the CLI runs, which takes precedence over a saved sign-in, or run `redoost login --token` once to save it. For example, in GitHub Actions, with the token saved as a repository secret:

```yaml
- run: npx redoost publish ./dist --update brave-otter-1a2b
  env:
    REDOOST_TOKEN: ${{ secrets.REDOOST_TOKEN }}
```

## Commands

| Command |  |
| --- | --- |
| `redoost login` | Sign in through a link; `--token` signs in with an API token instead |
| `redoost logout` | Revoke and forget this sign-in |
| `redoost whoami` | Show who's signed in and how much storage their sites use |
| `redoost preview <folder\|zip\|file.html>` | Serve a site locally as it would be published, on a free port, and press Enter to open it; `--port` picks one, `--host 0.0.0.0` shares it on your network |
| `redoost publish <folder\|zip\|file.html>` | Publish a new site; `--description` adds a note to tell it apart, `-m` says what the version changes, and `--expires` sets when it goes offline |
| `redoost publish <path> --update <slug>` | Replace a site's files, uploading only what changed, or nothing if nothing did |
| `redoost list` | List your sites |
| `redoost versions <slug>` | List a site's kept versions, newest first |
| `redoost rollback <slug> [version]` | Serve an earlier version again, the previous one by default; nothing is uploaded |
| `redoost prune <slug>` | Delete a site's other versions, keeping the one served |
| `redoost disable <slug>...` | Take sites offline, keeping their files and addresses |
| `redoost enable <slug>...` | Put offline sites back online |
| `redoost describe <slug> <text>` | Change a site's description, or clear it with `""` |
| `redoost expire <slug> <when>` | Set when a site goes offline: a date, online through that day, a time, or `never` |
| `redoost delete <slug>...` | Delete one or more sites |
| `redoost update` | Install the release your server runs, with npm or Bun, whichever installed the CLI |

Publishing and previewing leave out dotfiles like `.env` and `.git/`, except `.well-known/`, and links to files outside the folder.

Once a day, commands run in a terminal check whether the server runs a newer release, and suggest `redoost update` if so.

Every command takes `--json` to print its result as JSON, with progress on stderr, and `--server` (or `REDOOST_SERVER`) to use another redoost, such as `http://localhost:8081` for the Compose stack. `REDOOST_TOKEN` signs in with an API token instead of a saved sign-in.

## Development

The CLI is TypeScript in the repository's Bun workspace, sharing the API client and site handling with the dashboard through `shared/`. From the repository root, `bun install`, then in `cli/`:

```sh
bun run typecheck
bun test                  # builds the CLI, then runs it against a fake API and S3
bun run build             # dist/redoost.js, one file with no dependencies
node dist/redoost.js --help
```

`REDOOST_TEST_RUNTIME=node bun test` runs the built CLI under Node instead of Bun.
