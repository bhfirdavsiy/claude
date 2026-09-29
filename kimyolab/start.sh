#!/usr/bin/env sh
# Serves the built deployment surface (dist/). Builds it first if it does not exist.
cd "$(dirname "$0")"
[ -f dist/index.html ] || npm run build || exit 1
node server.mjs
