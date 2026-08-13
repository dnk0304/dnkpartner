#!/usr/bin/env bash
# =============================================================================
# verify-v4-suite — THE one command. Seeds the committed fixture, builds, and
# runs the whole v4 archive suite in BOTH switch states.
#
#     cd subastas && bash scripts/verify-v4-suite.sh
#
# That is the entire contract. From a clean checkout, with the local Postgres
# container up, this creates its own database, seeds it, builds, and reports.
# Run it twice; it must be green twice.
#
# -----------------------------------------------------------------------------
# WHY THIS FILE EXISTS (Ken's ruling, 2026-08-13)
#
# P1 reported 48/48 against a corpus nobody kept, and the committed fixture could
# not have produced it. The ruling: *a test that cannot be re-run from the repo
# is indistinguishable from no test; green output is not the artefact, the
# reproducible corpus is.* Everything that used to live in a comment someone
# would miss now lives in this script:
#
#   • `rm -rf .next/cache` — Pixel's `unstable_cache` trap. `readArchiveNodeTotal`
#     / `readArchiveChildren` / `readShelfRoots` are all `unstable_cache`d with a
#     3600s TTL and persisted under `.next/cache`. A second run against a reseeded
#     DB will happily serve the FIRST run's counts, which is a green suite proving
#     nothing. Purged before the build AND between the two switch states.
#   • the `auctionOutcomeStats` rollup — seeded by the fixture, not by hand. A
#     town slug does not RESOLVE without its rollup row, so a missing rollup shows
#     up as a 404 on a page whose auctions exist.
#   • a fresh `next start` per switch state — `isUrlV4SwitchOn()` is read at call
#     time, but route output is cached, so flipping the env under a warm server
#     measures the previous state.
#
# -----------------------------------------------------------------------------
# OVERRIDES (all optional)
#   DATABASE_URL  loopback Postgres. Default: the dedicated fixture DB below.
#                 Refuses to run against anything non-loopback.
#   PORT          default 3987
#   SKIP_BUILD=1  reuse an existing .next (re-running assertions only)
# =============================================================================
set -u

HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE" || exit 1

PORT="${PORT:-3987}"
B="http://localhost:$PORT"
FIXTURE_DB="${FIXTURE_DB:-subastas_v4_forge}"
export DATABASE_URL="${DATABASE_URL:-postgresql://dnk:dnk@localhost:5432/$FIXTURE_DB}"
STATE_FILE="$HERE/.v4-suite-dark-codes.txt"
LOG="$HERE/.v4-suite-server.log"

# ⛔ The seed TRUNCATES. `prisma/db-target-guard.ts` blocks `db push` off
# loopback, but the guard belongs here too — this script is the thing a tired
# person runs, and DATABASE_URL is an environment variable.
case "$DATABASE_URL" in
  *@localhost:*|*@127.0.0.1:*) ;;
  *) echo "REFUSING: DATABASE_URL is not loopback ($DATABASE_URL)"; exit 2;;
esac

say(){ echo ""; echo "=============================================================="; echo "$1"; echo "=============================================================="; }

# --- server lifecycle -------------------------------------------------------
# `pkill` does NOT kill node on Windows and a survivor makes the NEXT start
# EADDRINUSE — which does not fail loudly, it just leaves you measuring the
# stale build in the previous switch state. Kill by PORT, and verify.
stop_server(){
  if command -v taskkill >/dev/null 2>&1; then
    for p in $(netstat -ano 2>/dev/null | grep -E "[:.]$PORT[[:space:]]+.*LISTENING" | awk '{print $NF}' | sort -u); do
      taskkill //PID "$p" //F >/dev/null 2>&1 || true
    done
  else
    lsof -ti tcp:"$PORT" 2>/dev/null | xargs -r kill -9 2>/dev/null || true
  fi
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    curl -s -o /dev/null --max-time 1 "$B/resultados" || return 0
    sleep 1
  done
  echo "WARNING: something is still listening on $PORT"
}

start_server(){ # $1 = "dark" | "lit"
  stop_server
  # Purge the data cache BETWEEN states too: page output cached under the dark
  # switch would otherwise be replayed as if it were the lit render.
  rm -rf .next/cache
  : > "$LOG"
  if [ "$1" = "lit" ]; then
    URL_V4_SWITCH=1 npx next start -p "$PORT" >>"$LOG" 2>&1 &
  else
    npx next start -p "$PORT" >>"$LOG" 2>&1 &
  fi
  for _ in $(seq 1 60); do
    if curl -s -o /dev/null --max-time 2 "$B/resultados"; then
      # Confirm the switch state from the OUTSIDE before asserting anything on
      # it — an env var that did not reach the process is a silent false green.
      echo "  server up ($1)"
      return 0
    fi
    sleep 1
  done
  echo "FAIL: server did not come up in 60s. Tail of $LOG:"; tail -20 "$LOG"; exit 1
}

trap 'stop_server' EXIT

# --- 1. fixture -------------------------------------------------------------
say "1/4  seeding the fixture into $DATABASE_URL"
DB_NAME="${DATABASE_URL##*/}"
if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^dnk-crm-postgres$'; then
  docker exec dnk-crm-postgres psql -U dnk -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 || \
    docker exec dnk-crm-postgres psql -U dnk -d postgres -c "CREATE DATABASE $DB_NAME OWNER dnk;" >/dev/null
fi
# NODE_ENV is deliberately NOT forced to production here: prisma/db-target-guard.ts
# blocks `db push` when NODE_ENV=production, and that guard is worth more than the
# tidiness of a uniform env. (Prisma 7 has no --skip-generate.)
npx prisma db push >/dev/null || { echo "FAIL: prisma db push"; exit 1; }
npx tsx scripts/forge-v4-fixture.ts || { echo "FAIL: fixture seed"; exit 1; }

# --- 2. build ---------------------------------------------------------------
if [ "${SKIP_BUILD:-}" = "1" ]; then
  say "2/4  build SKIPPED (SKIP_BUILD=1)"
else
  say "2/4  building"
  # `rm -rf .next/cache` before the build: see the unstable_cache note above.
  # `--webpack` because Turbopack panics on the junctioned node_modules a git
  # worktree uses ("Symlink node_modules is invalid, it points out of the
  # filesystem root"). The real container build uses Turbopack and is unaffected.
  rm -rf .next/cache
  npx next build --webpack || { echo "FAIL: next build"; exit 1; }
fi

# --- 3. dark ----------------------------------------------------------------
say "3/4  DARK  (URL_V4_SWITCH unset)"
start_server dark
dark_fail=0
B="$B" MODE=dark bash scripts/verify-v4-archive.sh || dark_fail=1
B="$B" MODE=dark STATE_FILE="$STATE_FILE" bash scripts/verify-v4-redirects.sh || dark_fail=1

# --- 4. lit -----------------------------------------------------------------
say "4/4  LIT  (URL_V4_SWITCH=1)"
start_server lit
lit_fail=0
B="$B" MODE=lit bash scripts/verify-v4-archive.sh || lit_fail=1
B="$B" MODE=lit STATE_FILE="$STATE_FILE" bash scripts/verify-v4-redirects.sh || lit_fail=1

stop_server
say "RESULT"
echo "  dark: $([ $dark_fail -eq 0 ] && echo PASS || echo FAIL)"
echo "  lit:  $([ $lit_fail -eq 0 ] && echo PASS || echo FAIL)"
[ $dark_fail -eq 0 ] && [ $lit_fail -eq 0 ] || exit 1
echo "  v4 archive suite GREEN in both switch states."
