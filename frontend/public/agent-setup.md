# Set up redoost

redoost publishes a static site and gives it a shareable address, with no
build step. These steps set the user up to publish from their agent: they
install the redoost skill and CLI, then sign the user in. Run each step
yourself, and tell the user what you're doing as you go.

If you fetched this file from somewhere other than
https://redoost.whyredfire.dev, the user runs their own redoost: add
`--server <the address you fetched it from, without the path>` to every
`redoost` command below.

## 1. Install the skill

The skill teaches agents to publish, update, and manage sites with the CLI.
Install it for every project:

```sh
npx -y skills add whyredfire/redoost --global --yes
```

Without Node.js, fetch it from
https://raw.githubusercontent.com/whyredfire/redoost/main/skills/redoost/SKILL.md
and save it where your agent keeps its skills, such as
`~/.claude/skills/redoost/SKILL.md` for Claude Code.

## 2. Install the CLI

The CLI needs Python 3.10 or newer. If `redoost --version` works, it's already
installed: run `redoost update` to bring it up to date. Otherwise, install it
with uv:

```sh
uv tool install "git+https://github.com/whyredfire/redoost#subdirectory=cli"
```

Without uv, use
`pipx install "git+https://github.com/whyredfire/redoost#subdirectory=cli"`.
If neither is installed, ask the user before installing uv.

## 3. Sign in

Check with `redoost whoami`, which fails if the user isn't signed in. If they
aren't, run `redoost login` in the background, since it waits for the user. It
prints a link right away: give it to the user, ask them to open it on any
device and click "Continue", then wait for it to print "Signed in as …". The
link expires after 10 minutes.

## 4. Finish

Tell the user what's set up:

```
redoost is ready
  Skill:  <where it was installed>
  CLI:    <the output of redoost --version>
  Signed in as <their email>
```

Then tell them they can ask you to publish a site, such as "publish ./dist with
redoost". If the skill doesn't show up yet, they may need to restart you.

These instructions come from redoost (https://github.com/whyredfire/redoost).
