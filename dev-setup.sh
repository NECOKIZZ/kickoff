#!/usr/bin/env bash
# One-time-per-boot dev setup: /home disk is tiny (4.8G), so node_modules
# and the .next build dir live on the /tmp overlay (30G+).
set -e
cd "$(dirname "$0")"
if [ ! -d /tmp/kickoff-nm-real ]; then mkdir -p /tmp/kickoff-nm-real; fi
mountpoint -q node_modules || { mkdir -p node_modules; sudo mount --bind /tmp/kickoff-nm-real node_modules; }
[ -e node_modules/next ] || corepack pnpm install
mkdir -p /tmp/kickoff-next
[ -L .next ] || { rm -rf .next; ln -s /tmp/kickoff-next .next; }
sudo service postgresql start || true
# Box resets can wipe the cluster: recreate role+db idempotently, then migrate.
sudo -u postgres psql -tc "select 1 from pg_roles where rolname='kickoff'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE ROLE kickoff LOGIN PASSWORD 'kickoff_dev'"
sudo -u postgres psql -tc "select 1 from pg_database where datname='kickoff'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE kickoff OWNER kickoff"
sudo -u postgres psql -tc "select 1 from pg_database where datname='kickoff_data'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE kickoff_data OWNER kickoff"
set -a; source .env.local; set +a
./node_modules/.bin/drizzle-kit migrate
# kickoff-data service owns its own DB + migrations.
(cd services/kickoff-data && ../../node_modules/.bin/drizzle-kit migrate)
# Forge build artifacts also live on /tmp (see contracts/foundry.toml) —
# nothing to restore, forge recreates them; just make sure the dirs exist.
mkdir -p /tmp/kickoff-forge-out /tmp/kickoff-forge-cache
echo "ready: node_modules mounted, .next on /tmp, postgres up, forge dirs on /tmp"
