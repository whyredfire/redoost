---
name: redoost
description: Publish a finished static site to a shareable address with redoost, from the command line. Use when the user wants to deploy, host, publish, or share a static site, a build folder (like dist or build), a .zip of one, or a single HTML file, or to preview one locally the way it will be served. Also use to update a site the user already published, list their sites, take a site offline or back online, or delete one.
---

# redoost

redoost publishes a static site and gives it a shareable address, with no
build step. It takes a finished site: a folder with `index.html` at its root, a
.zip of one, or a single HTML file. Build the project first if it needs it.

By default, files can be up to 20 MiB, sites up to 150 MiB and 2000 files, and
each account's sites up to 1 GiB in total.

## Install the CLI

If the `redoost` command isn't available, install it with uv; it needs Python
3.10 or newer:

```sh
uv tool install "git+https://github.com/whyredfire/redoost#subdirectory=cli"
```

Without uv, use
`pipx install "git+https://github.com/whyredfire/redoost#subdirectory=cli"`.
If it's already installed, `redoost update` brings it up to date.

It uses redoost.whyredfire.dev. For another redoost, add
`--server <its address>` to every command.

## Publish a site

1. Check whether the user is signed in with `redoost whoami`. It fails if
   they aren't.
2. If not, run `redoost login` in the background, since it waits for the
   user. It prints a link right away: give it to the user, ask them to open it
   on any device and click "Continue", then wait for it to print
   "Signed in as …". The link expires after 10 minutes.
3. Optionally, check the site first with `redoost preview <path> --json` in the
   background. It serves the site locally as it would be published, without
   signing in, and prints its `url`. Stop it when you're done.
4. Publish with `redoost publish <path> --description "<what it is>" --json`.
   The description is a short note, like "Pricing page draft", that helps the
   user tell their sites apart. It prints the site, including its `url` and
   `slug`.
5. Open the `url` to verify the site loads, then give the user its address.

Sites without a `404.html` are treated as single-page apps: missing paths
without a file extension serve `index.html`.

## Manage sites

- `redoost list --json` lists the user's sites, with each one's `slug`, `url`,
  `description`, and whether it's `enabled`. Use the descriptions to find the
  site the user means.
- `redoost publish <path> --update <slug> --json` replaces a site's files at
  the same address, uploading only what changed. If nothing changed, it says
  so and publishes nothing. Without `--description`, the site keeps its
  description.
- `redoost describe <slug> "<text>"` changes a site's description, and `""`
  clears it.
- `redoost disable <slug>...` takes sites offline without deleting them, and
  `redoost enable <slug>...` puts them back. Taking a site offline can take up
  to a minute to reach visitors.
- `redoost delete <slug>...` deletes one or more sites and their files, and
  fails naming any it didn't find. Confirm with the user first, listing the
  sites; it can't be undone.

Every command takes `--json` to print its result as JSON, with progress on
stderr.
