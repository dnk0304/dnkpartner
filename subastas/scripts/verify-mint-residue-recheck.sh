#!/usr/bin/env sh
# Reproducible verify for the stale-skip re-offer fix. Creates an ephemeral local
# Postgres database, runs the tsx proof, and drops the database whether it passes
# or fails. Requires the local docker PG (dnk-crm-postgres, dnk:dnk@localhost:5432).
set -eu
DB=forge_mint_verify
PGURL_ADMIN="postgres://dnk:dnk@localhost:5432/postgres"
export DATABASE_URL="postgres://dnk:dnk@localhost:5432/${DB}"

psql "$PGURL_ADMIN" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${DB}" >/dev/null
psql "$PGURL_ADMIN" -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${DB}" >/dev/null
trap 'psql "$PGURL_ADMIN" -c "DROP DATABASE IF EXISTS ${DB}" >/dev/null 2>&1 || true' EXIT

cd "$(dirname "$0")/.."
npx tsx scripts/verify-mint-residue-recheck.ts
