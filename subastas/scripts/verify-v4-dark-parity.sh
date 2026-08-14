#!/usr/bin/env bash
# =============================================================================
# verify-v4-dark-parity — WITH THE SWITCH OFF, NOTHING MOVED.
#
#   cd subastas && bash scripts/verify-v4-dark-parity.sh
#
# Invoked as a step by scripts/verify-v4-suite.sh. Standalone use is fine.
#
# -----------------------------------------------------------------------------
# WHY THIS FILE EXISTS (Ken, wave193 rollback)
#
# `URL_V4_SWITCH` ships dark. Ken's rule: with the flag off, production must
# behave byte-for-byte as the previous release 67b7d3f — a user or Googlebot
# must not be able to tell the flag is there. wave193 (13a46e4) went out dark,
# and four legacy URLs had moved anyway:
#
#     /resultados/madrid/msdrid                307 -> /resultados/madrid   (was 200)
#     /resultados/madrid/carabanchel-alto      307 -> /resultados/madrid   (was 200)
#     /resultados/alicante/elche               307 -> /resultados/alicante/elx (was 200)
#     /resultados/madrid/municipios/pagina/2   404                         (was 200)
#
# Prod was rolled back inside a minute. The existing suite proved the LIT
# behaviour beautifully and never asserted that DARK changes NOTHING. Ken:
# *"closing that gap is worth more than the five fixes."* This is the gap.
#
# -----------------------------------------------------------------------------
# THE METHOD: two servers, one corpus, diff (status, location).
#
#   1. build + serve 67b7d3f          (BASELINE)  with URL_V4_SWITCH unset
#   2. build + serve HEAD                          with URL_V4_SWITCH unset
#   3. request every corpus URL against both; compare status and Location.
#      EXPECTED DIFFERENCE COUNT: 0.
#   4. POSITIVE CONTROL: rerun step 3 with URL_V4_SWITCH=1 on the HEAD server.
#      EXPECTED DIFFERENCE COUNT: > 0.
#
# -----------------------------------------------------------------------------
# ⚠️ THE FOUR TRAPS, EACH OF WHICH HAS ALREADY PRODUCED A FALSE GREEN HERE
#
#  1. PROD HOSTS. Sitemap <loc>s are absolute https://subastasactivas.com URLs.
#     A crawler that follows them measures the LIVE SITE and passes while
#     testing nothing. The corpus builder host-rewrites and hard-exits if a
#     prod host survives; the probe refuses a prod --base. Guard re-asserted
#     below over the written corpus file, because a guard you cannot see fire
#     is a guard you do not have.
#  2. PORT COLLISIONS. Other agents run servers on this box. Both ports are
#     checked BOUND-or-not before anything starts and the run ABORTS if either
#     is taken — an all-identical result set is the signature of measuring
#     somebody else's server, and it looks exactly like a pass.
#  3. VACUOUS ABSENCE. "Zero differences" is trivially true if both servers are
#     broken, if the corpus is empty, or if everything 404s on both sides. So:
#     the corpus must be non-empty, the baseline must return a PLAUSIBLE MIX of
#     statuses (>= 2 distinct, with real 200s), and the positive control must
#     find MORE THAN ZERO differences. A harness that cannot tell dark from lit
#     is not measuring anything. BOTH numbers are reported; one alone is not
#     evidence.
#  4. WINDOWS TEARDOWN. `pkill` does not kill node here. Servers are killed by
#     PORT via netstat/taskkill, on every exit path, because a stray server is
#     what causes trap 2 for the next agent.
#
# -----------------------------------------------------------------------------
# OVERRIDES (all optional)
#   BASELINE_DIR   worktree holding 67b7d3f.
#                  default C:/Users/D/worktrees/dnkpartner/muni-a2-baseline
#   HEAD_DIR       app dir to serve as HEAD. Defaults to this checkout, which is
#                  what you want in CI. Point it at a clean detached worktree
#                  when THIS checkout has a sibling agent's uncommitted src/**
#                  edits in it — otherwise their work in progress shows up as
#                  dark-parity differences and gets blamed on the switch.
#   PORT_BASE / PORT_HEAD   default 3991 / 3992
#   PARITY_SAMPLE  corpus cap. default 4500. Only the unbounded `dirty` bucket
#                  is ever sampled (seeded); sitemap/legacy/alias stay exhaustive.
#   SKIP_BUILD=1   reuse both existing .next trees
#   DATABASE_URL   loopback only. BOTH servers get the SAME one or the diff is
#                  meaningless.
# =============================================================================
set -u

HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE" || exit 1

BASELINE_DIR="${BASELINE_DIR:-C:/Users/D/worktrees/dnkpartner/muni-a2-baseline}"
BASELINE_APP="$BASELINE_DIR/subastas"
HEAD_APP="${HEAD_DIR:-$HERE}"
PORT_BASE="${PORT_BASE:-3991}"
PORT_HEAD="${PORT_HEAD:-3992}"
SAMPLE="${PARITY_SAMPLE:-4500}"
FIXTURE_DB="${FIXTURE_DB:-subastas_v4_forge}"
export DATABASE_URL="${DATABASE_URL:-postgresql://dnk:dnk@localhost:5432/$FIXTURE_DB}"

TMP="$(mktemp -d)"
BLOG="$TMP/baseline-server.log"
HLOG="$TMP/head-server.log"

case "$DATABASE_URL" in
  *@localhost:*|*@127.0.0.1:*) ;;
  *) echo "REFUSING: DATABASE_URL is not loopback ($DATABASE_URL)"; exit 2;;
esac

echo "=== verify-v4-dark-parity ==="
echo "  baseline : $BASELINE_APP  (67b7d3f)  :$PORT_BASE"
echo "  head     : $HEAD_APP  :$PORT_HEAD"
echo "  db       : $DATABASE_URL"
echo "  tmp      : $TMP"

fail(){ echo "  FAIL  $1"; FAILED=1; }
FAILED=0

# --- windows-safe port lifecycle -------------------------------------------
port_pids(){ # $1 = port
  netstat -ano 2>/dev/null | grep -E "[:.]$1[[:space:]]+.*LISTENING" | awk '{print $NF}' | sort -u
}
kill_port(){
  if command -v taskkill >/dev/null 2>&1; then
    for p in $(port_pids "$1"); do taskkill //PID "$p" //F >/dev/null 2>&1 || true; done
  else
    lsof -ti tcp:"$1" 2>/dev/null | xargs -r kill -9 2>/dev/null || true
  fi
}
cleanup(){ kill_port "$PORT_BASE"; kill_port "$PORT_HEAD"; }
trap cleanup EXIT INT TERM

# ⚠️ TRAP 2. Abort rather than adopt a stranger's server. An all-zero diff
# against someone else's build is the most convincing false green available.
for p in "$PORT_BASE" "$PORT_HEAD"; do
  if [ -n "$(port_pids "$p")" ]; then
    echo "ABORT: port $p is already bound (pids: $(port_pids "$p" | tr '\n' ' '))."
    echo "       Another agent is probably serving there. Set PORT_BASE/PORT_HEAD and re-run."
    exit 2
  fi
done
echo "  ports $PORT_BASE and $PORT_HEAD are free"

start_server(){ # $1 = dir  $2 = port  $3 = log  $4 = "dark"|"lit"
  ( cd "$1" || exit 1
    rm -rf .next/cache            # unstable_cache would replay the other state
    if [ "$4" = "lit" ]; then
      URL_V4_SWITCH=1 DATABASE_URL="$DATABASE_URL" npx next start -p "$2" >>"$3" 2>&1 &
    else
      DATABASE_URL="$DATABASE_URL" npx next start -p "$2" >>"$3" 2>&1 &
    fi
  )
  for _ in $(seq 1 90); do
    if curl -s -o /dev/null --max-time 2 "http://localhost:$2/resultados"; then
      echo "  server up: $1 ($4) on $2"; return 0
    fi
    sleep 1
  done
  echo "FAIL: server ($1, $4) did not come up in 90s. Tail of $3:"; tail -30 "$3"; exit 1
}

build(){ # $1 = dir
  if [ "${SKIP_BUILD:-}" = "1" ]; then echo "  build SKIPPED for $1"; return 0; fi
  echo "  building $1 ..."
  # --webpack: Turbopack (the Next 16 default) panics on a git worktree's
  # junctioned node_modules ("Symlink ... points out of the filesystem root").
  # The heap bump: a bare `exit 1` with NO error output is the Node heap dying.
  ( cd "$1" && rm -rf .next/cache &&
    NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=8192}" npx next build --webpack ) \
    || { echo "FAIL: next build in $1"; exit 1; }
}

# --- 0. the baseline worktree must exist and be the right commit ------------
if [ ! -d "$BASELINE_APP" ]; then
  echo "ABORT: baseline worktree missing at $BASELINE_DIR"
  echo "  git -C C:/Users/D/Desktop/dnkpartner worktree add $BASELINE_DIR 67b7d3f"
  echo "  New-Item -ItemType Junction -Path $BASELINE_APP/node_modules -Target <main>/subastas/node_modules"
  exit 2
fi
BASE_SHA="$(git -C "$BASELINE_DIR" rev-parse --short HEAD 2>/dev/null)"
if [ "$BASE_SHA" != "67b7d3f" ]; then
  fail "baseline worktree is at '$BASE_SHA', expected 67b7d3f — the diff would compare the wrong release"
  exit 1
fi
echo "  baseline worktree verified at $BASE_SHA"

# --- 1. build both ----------------------------------------------------------
build "$BASELINE_APP"
build "$HEAD_APP"

# --- 2. BASELINE, dark: derive the corpus and probe it ----------------------
echo ""
echo "--- BASELINE 67b7d3f, URL_V4_SWITCH unset ---"
start_server "$BASELINE_APP" "$PORT_BASE" "$BLOG" dark

CORPUS="$TMP/corpus.txt"
npx tsx scripts/verify-v4-dark-parity-corpus.ts \
  --base "http://localhost:$PORT_BASE" --out "$CORPUS" --sample "$SAMPLE" \
  || { echo "FAIL: corpus derivation"; exit 1; }

# ⚠️ TRAP 1, re-asserted where a reader can watch it fire. The builder already
# exits on a surviving prod host; this proves the FILE it wrote is clean too.
if grep -qi 'subastasactivas\.com' "$CORPUS"; then
  fail "PROD HOST GUARD FIRED: corpus contains production URLs — this run would have measured the live site"
  grep -i 'subastasactivas\.com' "$CORPUS" | head -5
  exit 1
fi
echo "  PASS  prod-host guard held (0 production URLs in the corpus)"

N="$(grep -c . "$CORPUS" | tr -d ' ')"
# ⚠️ TRAP 3a. An empty corpus makes every number below zero, and zero passes.
if [ "${N:-0}" -lt 200 ]; then
  fail "corpus is $N urls — too small to be evidence (expected >= 200)"
  exit 1
fi
echo "  PASS  corpus is non-empty ($N urls)"

# ⭐ REGRESSION-COVERAGE GUARD. The corpus is DERIVED, and it stays derived — but
# a derived corpus that happens not to cover the four shapes this script was
# built for would go green while blind. So the four wave193 classes are asserted
# PRESENT in what the generator produced. (This is the one legitimate use of the
# known list: it audits the generator, it does not feed it. The first version of
# this script sampled `/municipios/pagina/2` straight out of the corpus and
# would have shipped blind to regression #4.)
cover(){ # $1 = human name  $2 = grep -E pattern
  n=$(grep -cE "$2" "$CORPUS" || true)
  if [ "${n:-0}" -ge 1 ]; then echo "  PASS  corpus covers $1 ($n urls)"
  else fail "corpus does NOT cover $1 — this run is blind to that regression class"; fi
}
cover "district-compound town slugs (carabanchel-alto class)" '^/resultados/[a-z-]+/[a-z-]+-(alto|bajo|nuevo|viejo)$'
cover "municipality-index pagination tails"        '/municipios/pagina/[0-9]+$'
# Every DERIVATION SOURCE must have survived sampling. A bucket that sampled to
# zero is a whole regression class the run is silently blind to — the alias
# bucket going empty is exactly how the elche->elx class would disappear.
while IFS=$'	' read -r bname bn; do
  [ -n "$bname" ] || continue
  if [ "${bn:-0}" -ge 1 ]; then echo "  PASS  bucket '$bname' survived into the corpus ($bn urls)"
  else fail "bucket '$bname' sampled to ZERO — the run is blind to that derivation source"; fi
done < "$CORPUS.buckets"
# the two literal Madrid shapes, which this fixture always has the geography for
for u in /resultados/madrid/msdrid /resultados/madrid/municipios/pagina/2; do
  grep -qx "$u" "$CORPUS" && echo "  PASS  corpus contains $u"     || fail "corpus is missing the known regression url $u"
done
[ "$FAILED" -eq 0 ] || exit 1

npx tsx scripts/verify-v4-dark-parity-probe.ts \
  --base "http://localhost:$PORT_BASE" --corpus "$CORPUS" --out "$TMP/base.tsv" \
  || { echo "FAIL: baseline probe"; exit 1; }

# ⚠️ TRAP 3b. If the baseline answers one status for everything, it is broken
# or we are talking to the wrong process, and an identical HEAD proves nothing.
B200=$(awk -F'\t' '$2==200' "$TMP/base.tsv" | wc -l | tr -d ' ')
BKIND=$(awk -F'\t' '{print $2}' "$TMP/base.tsv" | sort -u | wc -l | tr -d ' ')
BERR=$(grep -c 'ERR:' "$TMP/base.tsv" || true)
echo "  baseline census: 200s=$B200  distinct statuses=$BKIND  transport errors=$BERR"
[ "${B200:-0}" -ge 20 ] || fail "baseline returned only $B200 200s — it is not serving a real site"
[ "${BKIND:-0}" -ge 2 ] || fail "baseline returned a single status for every url — degenerate"
[ "${BERR:-0}" -eq 0 ] || fail "baseline had $BERR transport errors — results are unreliable"
[ "$FAILED" -eq 0 ] || exit 1

kill_port "$PORT_BASE"

# --- 3. HEAD, dark: THE ASSERTION -------------------------------------------
echo ""
echo "--- HEAD, URL_V4_SWITCH unset (the dark-parity assertion) ---"
start_server "$HEAD_APP" "$PORT_HEAD" "$HLOG" dark
npx tsx scripts/verify-v4-dark-parity-probe.ts \
  --base "http://localhost:$PORT_HEAD" --corpus "$CORPUS" --out "$TMP/head-dark.tsv" \
  || { echo "FAIL: head dark probe"; exit 1; }
kill_port "$PORT_HEAD"

DARK_DIFF=$(diff "$TMP/base.tsv" "$TMP/head-dark.tsv" | grep -c '^<' || true)

# --- 4. HEAD, lit: THE POSITIVE CONTROL -------------------------------------
# Without this the whole script is an absence-only proof. If flipping the switch
# does NOT change the answers, the harness cannot tell the two states apart and
# its zero above means nothing.
echo ""
echo "--- HEAD, URL_V4_SWITCH=1 (positive control) ---"
start_server "$HEAD_APP" "$PORT_HEAD" "$HLOG" lit
npx tsx scripts/verify-v4-dark-parity-probe.ts \
  --base "http://localhost:$PORT_HEAD" --corpus "$CORPUS" --out "$TMP/head-lit.tsv" \
  || { echo "FAIL: head lit probe"; exit 1; }
kill_port "$PORT_HEAD"

LIT_DIFF=$(diff "$TMP/base.tsv" "$TMP/head-lit.tsv" | grep -c '^<' || true)

# --- 5. verdict -------------------------------------------------------------
echo ""
echo "=============================================================="
echo "  corpus            : $N urls (sampled/full — see the bucket census above)"
echo "  DARK differences  : $DARK_DIFF   (must be 0)"
echo "  LIT  differences  : $LIT_DIFF   (positive control, must be > 0)"
echo "=============================================================="

if [ "${DARK_DIFF:-1}" -ne 0 ]; then
  fail "DARK IS NOT BYTE-FOR-BYTE 67b7d3f — $DARK_DIFF urls moved with the switch OFF"
  echo ""
  echo "  every differing row (baseline  ->  head-dark):"
  paste <(awk -F'\t' '{print $1"\t"$2"\t"$3}' "$TMP/base.tsv") \
        <(awk -F'\t' '{print $2"\t"$3}' "$TMP/head-dark.tsv") \
    | awk -F'\t' '$2!=$4 || $3!=$5 {printf "    %-56s  %s %s   ->   %s %s\n",$1,$2,$3,$4,$5}'
else
  echo "  PASS  DARK: the entire legacy surface is byte-for-byte 67b7d3f (0 differences)"
fi

if [ "${LIT_DIFF:-0}" -le 0 ]; then
  fail "POSITIVE CONTROL DEAD: flipping URL_V4_SWITCH changed nothing."
  echo "        The switch is not reaching the process, or the harness is not"
  echo "        measuring the server under test. The DARK zero above is VACUOUS."
else
  echo "  PASS  positive control: the flip moves $LIT_DIFF urls, so the harness can see change"
  echo "        sample of what the flip changes:"
  paste <(awk -F'\t' '{print $1"\t"$2"\t"$3}' "$TMP/base.tsv") \
        <(awk -F'\t' '{print $2"\t"$3}' "$TMP/head-lit.tsv") \
    | awk -F'\t' '$2!=$4 || $3!=$5 {printf "    %-56s  %s %s   ->   %s %s\n",$1,$2,$3,$4,$5}' | head -8
fi

echo ""
echo "  artefacts kept for inspection: $TMP"
[ "$FAILED" -eq 0 ] || exit 1
echo "  dark-parity GREEN."
