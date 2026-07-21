#!/usr/bin/env bash
# One-time-per-boot dev setup: /home disk is tiny (4.8G), so node_modules
# and the .next build dir live on the /tmp overlay (30G+).
set -e
cd "$(dirname "$0")"
if [ ! -d /tmp/kickoff-nm-real ]; then mkdir -p /tmp/kickoff-nm-real; fi
mountpoint -q node_modules || { mkdir -p node_modules; sudo mount --bind /tmp/kickoff-nm-real node_modules; }
[ -e node_modules/next ] || pnpm install
mkdir -p /tmp/kickoff-next
[ -L .next ] || { rm -rf .next; ln -s /tmp/kickoff-next .next; }
sudo service postgresql start || true
echo "ready: node_modules mounted, .next on /tmp, postgres up"
