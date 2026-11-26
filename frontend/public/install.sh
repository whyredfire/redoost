#!/bin/sh
# Installs the redoost CLI from npm. Every redoost dashboard serves it:
#   curl -fsSL https://redoost.whyredfire.dev/install.sh | sh
# REDOOST_VERSION picks a version (default: the latest).
set -eu

version=${REDOOST_VERSION:-latest}
package="redoost@${version#v}"

fail() {
  echo "error: $*" >&2
  exit 1
}

if command -v node >/dev/null 2>&1; then
  node_major=$(node -p 'process.versions.node.split(".")[0]')
else
  node_major=0
fi

# The CLI runs on Node.js, even when Bun installed it, so Bun alone can only run it with bunx
if [ "$node_major" -ge 20 ] && command -v npm >/dev/null 2>&1; then
  npm install -g "$package"
  bin="$(npm prefix -g)/bin"
elif command -v bun >/dev/null 2>&1; then
  fail "redoost runs on Node.js 20 or later (https://nodejs.org). With only Bun, run it without installing, as in: bunx redoost publish ./dist"
elif command -v node >/dev/null 2>&1; then
  fail "redoost needs Node.js 20 or later, and this is Node.js $(node --version). Update Node.js, then run this again."
else
  fail "redoost needs Node.js 20 or later. Install it from https://nodejs.org, then run this again."
fi

if command -v redoost >/dev/null 2>&1; then
  echo "Installed $(redoost --version)"
else
  echo "Installed redoost to $bin. Add it to your PATH to run redoost from anywhere."
fi
