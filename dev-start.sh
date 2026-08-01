#!/usr/bin/env bash
# Starts the Next dev server on port 3123 with env loaded.
cd "$(dirname "$0")"
set -a
source .env.local 2>/dev/null
source .env 2>/dev/null
set +a
exec ./node_modules/.bin/next dev -p 3123
