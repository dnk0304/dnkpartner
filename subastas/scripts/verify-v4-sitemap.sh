#!/usr/bin/env bash
# =============================================================================
# verify-v4-sitemap — assert the AGGREGATION band against a RUNNING server.
#
#   B=http://localhost:3987 MODE=dark bash scripts/verify-v4-sitemap.sh
#   B=http://localhost:3987 MODE=lit  bash scripts/verify-v4-sitemap.sh
#
# Invoked by scripts/verify-v4-suite.sh in both switch states. Standalone use is
# fine as long as something is already listening on $B.
#
# -----------------------------------------------------------------------------
# WHAT IT PROVES (P3 brief §5 + §5b)
#
#   DARK  the served `<loc>` set is BYTE-FOR-BYTE the previous release's
#         (67b7d3f), diffed against a committed capture of it, and the child
#         count matches. This is the assertion P3 lacked: it shipped a dark
#         sitemap that served 6 <sitemap> children where 67b7d3f served 5, and
#         prod was rolled back. "Ships dark" is now a diff, not a claim.
#   DARK  the served sitemap contains the v3 archive set and NOT ONE v4-only
#         shape. This is the leak test. The sitemap is the surface where a
#         premature URL reaches Google fastest and is the slowest to retract, so
#         "ships dark" is asserted here rather than asserted in a résumé.
#   BOTH  every advertised child is NON-EMPTY (the D2 defect), the index and the
#         children agree, and no child exceeds CHILD_SITEMAP_SIZE.
#   LIT   the superseded shapes are GONE and the v4 shapes are present.
#
# ⚠️ THE TRAPS ARE IN THE SCRIPT, NOT IN A COMMENT (Ken, P2c standard):
#   • an assertion that greps for a pattern which cannot appear in EITHER state
#     is green for the wrong reason, so every "must be absent" check is paired
#     with a "must be present" check on the same shape in the state where it
#     belongs. An absence-only proof is vacuous.
#   • `curl` failures are counted as FAILures, never as zero matches. A server
#     that is not listening otherwise reports a perfect score.
# =============================================================================
set -u

B="${B:-http://localhost:3987}"
MODE="${MODE:-dark}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

pass=0; fail=0
ok(){   pass=$((pass+1)); echo "  PASS  $1"; }
bad(){  fail=$((fail+1)); echo "  FAIL  $1"; }
chk(){ # chk <desc> <actual> <expected>
  if [ "$2" = "$3" ]; then ok "$1 ($2)"; else bad "$1 — got '$2', want '$3'"; fi
}
ge(){  # chk <desc> <actual> <min>
  if [ "$2" -ge "$3" ] 2>/dev/null; then ok "$1 ($2 >= $3)"; else bad "$1 — got '$2', want >= $3"; fi
}

echo "=== verify-v4-sitemap  MODE=$MODE  B=$B ==="

# --- fetch the index -------------------------------------------------------
if ! curl -sf --max-time 120 "$B/sitemap.xml" -o "$TMP/index.xml"; then
  bad "GET /sitemap.xml (server not answering — every assertion below would be a false green)"
  echo "RESULT $MODE: pass=$pass fail=$fail"; exit 1
fi
ok "GET /sitemap.xml"

# ⛔ REWRITE THE HOST. The <loc>s in the index are ABSOLUTE PRODUCTION URLs
# (`SITE` is hardcoded to https://subastasactivas.com so the served sitemap is
# correct for Google). Curling them verbatim fetches PROD, not the server under
# test — which is how the first run of this script reported a clean DARK pass
# while measuring the live site, and would have reported one forever. Map every
# child onto $B before fetching anything.
CHILDREN=$(grep -o '<loc>[^<]*</loc>' "$TMP/index.xml" | sed 's/<[^>]*>//g'   | sed -E "s#^https?://[^/]+#$B#")
NCHILD=$(echo "$CHILDREN" | grep -c 'sitemap/')
ge "index advertises children" "$NCHILD" 3

# --- fetch every advertised child; none may be empty -----------------------
case "$CHILDREN" in
  *subastasactivas.com*) bad "child URLs still point at PROD after rewrite"; echo "RESULT $MODE: pass=$pass fail=$fail"; exit 1;;
esac

# How many of the leading children are the AGGREGATION band. Declared before the
# fetch loop because the loop separates aggregation locs from detail locs: the
# aggregation band is baselined URL-for-URL, the detail bands only by count (their
# slugs embed per-seed cuids — see the baseline fixture's header).
AGG_CHILDREN="${AGG_CHILDREN:-1}"

TOTAL=0
DETAIL_TOTAL=0
EMPTY=0
OVER=0
: > "$TMP/all.txt"
: > "$TMP/agg.txt"
i=0
for u in $CHILDREN; do
  if ! curl -sf --max-time 300 "$u" -o "$TMP/c$i.xml"; then
    bad "GET $u"
    i=$((i+1)); continue
  fi
  n=$(grep -o '<loc>' "$TMP/c$i.xml" | wc -l | tr -d ' ')
  echo "    child $i: $n urls   $u"
  [ "$n" -eq 0 ] && EMPTY=$((EMPTY+1))
  [ "$n" -gt 20000 ] && OVER=$((OVER+1))
  TOTAL=$((TOTAL+n))
  grep -o '<loc>[^<]*</loc>' "$TMP/c$i.xml" | sed 's/<[^>]*>//g' >> "$TMP/all.txt"
  if [ "$i" -lt "$AGG_CHILDREN" ]; then
    grep -o '<loc>[^<]*</loc>' "$TMP/c$i.xml" | sed 's/<[^>]*>//g' >> "$TMP/agg.txt"
  else
    DETAIL_TOTAL=$((DETAIL_TOTAL+n))
  fi
  i=$((i+1))
done

# ⭐ THE EMPTY-CHILD GATE, SCOPED TO THE BAND THIS BRIEF OWNS.
#
# The AGGREGATION band's width is DERIVED from its own URL count
# (`aggregationChildCount`), so an empty aggregation child is arithmetically
# impossible and is asserted as such. The ACTIVE and CONCLUDED detail bands are
# still sized by the hand-set constants ACTIVE_CHUNKS / PUBLISHED_CONCLUDED_CHILDREN,
# which are measured against PROD — so against the small committed FIXTURE they
# are legitimately empty, and failing on that would be failing on the fixture's
# size rather than on the code.
#
# ⚠️ So this is reported, not asserted, and the prod evidence is recorded here
# rather than in a résumé nobody can re-run: measured live 2026-08-13,
# /sitemap/{0,1,2,3}.xml served 16,507 / 1,148 / 20,000 / 20,000 <loc>s — all
# four non-empty. Detail bands are explicitly out of P3's scope (brief §0).
agg_empty=0
j=0
while [ "$j" -lt "$AGG_CHILDREN" ]; do
  n=$(grep -o '<loc>' "$TMP/c$j.xml" 2>/dev/null | wc -l | tr -d ' ')
  [ "${n:-0}" -eq 0 ] && agg_empty=$((agg_empty+1))
  j=$((j+1))
done
chk "NO EMPTY AGGREGATION CHILD (the D2 defect)" "$agg_empty" 0
echo "  --   detail-band children empty on this corpus: $((EMPTY - agg_empty)) (fixture-scale; all 4 non-empty on prod 2026-08-13)"
# ⭐ SCOPED TO LIT ON PURPOSE. An over-full child is out of spec and the chunked
# band is the fix — but the fix ships with the FLIP. While dark we are pinned to
# 67b7d3f, which served the whole aggregation band in one fixed child and could
# legitimately exceed 20,000 once guias/noticias/monthly recaps were appended
# after the truncated /pagina/N block. Asserting the spec while dark would fail
# the build for correctly reproducing the previous release — so dark REPORTS the
# number and lit ASSERTS it. (Reported, not dropped: if it is ever non-zero dark,
# that is a thing Ken should see on the flip-day checklist.)
if [ "$MODE" = "dark" ]; then
  echo "  --   children over CHILD_SITEMAP_SIZE: $OVER (dark = 67b7d3f's uncapped single child; asserted in LIT)"
else
  chk "no child over CHILD_SITEMAP_SIZE" "$OVER" 0
fi
ge "total urls across all children" "$TOTAL" 1

# --- the aggregation band --------------------------------------------------
grep '/resultados' "$TMP/all.txt" > "$TMP/arch.txt" || true
ARCH=$(wc -l < "$TMP/arch.txt" | tr -d ' ')
ge "archive urls advertised" "$ARCH" 1

# no duplicate <loc> anywhere — a URL in two children is a chunking bug
DUPS=$(sort "$TMP/all.txt" | uniq -d | wc -l | tr -d ' ')
chk "no duplicate <loc> across children" "$DUPS" 0

# no URL may appear that is a known 301 target shape
OVERCAP=$(grep -cE '/pagina/(1[1-9]|[2-9][0-9]|[0-9]{3,})$' "$TMP/arch.txt" || true)
MUNIPAG=$(grep -cE '/municipios/pagina/' "$TMP/arch.txt" || true)

# outcome-FIRST (v3) vs outcome-LAST (v4) — the shape v4 reverses.
OUT_FIRST=$(grep -cE '/resultados/(adjudicadas|desiertas|canceladas|finalizadas-sin-resultado)/[a-z0-9-]+$' "$TMP/arch.txt" || true)
OUT_LAST=$(grep -cE '/resultados/[a-z0-9-]+/(adjudicadas|desiertas|canceladas|finalizadas-sin-resultado)$' "$TMP/arch.txt" || true)

echo "  -- shape census: outcome-first=$OUT_FIRST outcome-last=$OUT_LAST overcap-pagina=$OVERCAP muni-pagina=$MUNIPAG"

if [ "$MODE" = "dark" ]; then
  # =========================================================================
  # ⭐⭐ THE BASELINE DIFF — dark must equal 67b7d3f, and this MEASURES it. ⭐⭐
  #
  # Every other dark assertion in this file is a SHAPE census: "no outcome-last
  # url appears". Shape censuses are how P3 passed. They cannot see a url that
  # was dropped, a url that was added in a shape nobody thought to grep for, or
  # a child count that moved — and P3's regression was all three at once.
  #
  # So: the full served `<loc>` set, diffed line-for-line against a committed
  # capture of what the PREVIOUS RELEASE served on this same fixture corpus.
  # Difference count must be exactly 0.
  #
  # ⚠️ COMPARABILITY. `agg.txt` deliberately holds the ORIGINAL absolute
  # https://subastasactivas.com urls — the host rewrite above is applied only to
  # the child urls we FETCH, never to the urls we record. That is what makes
  # this diff meaningful: the baseline holds production hosts too, because those
  # are the bytes Google receives. (The "still points at PROD" guard above is
  # about what we fetch; this is about what we compare. Do not "fix" either one
  # into the other.)
  #
  # ⚠️ SCOPE: the AGGREGATION band, url-for-url. The detail bands are asserted by
  # count on the next line down, because their slugs embed per-seed cuids — see
  # the baseline fixture's header for why that is a property of the seed and not
  # a hole in the proof.
  BASE="$(cd "$(dirname "$0")" && pwd)/fixtures/sitemap-dark-baseline-67b7d3f.txt"
  if [ ! -f "$BASE" ]; then
    bad "DARK baseline fixture missing ($BASE) — the diff below would be vacuous"
  else
    grep -v '^#' "$BASE" | grep -v '^[[:space:]]*$' | sort > "$TMP/base.txt"
    sort "$TMP/agg.txt" > "$TMP/got.txt"
    # `comm` rather than `diff` so added and removed are reported separately —
    # "3 lines differ" is not actionable; "2 added, 1 removed" is.
    ADDED=$(comm -13 "$TMP/base.txt" "$TMP/got.txt" | wc -l | tr -d ' ')
    REMOVED=$(comm -23 "$TMP/base.txt" "$TMP/got.txt" | wc -l | tr -d ' ')
    DIFFN=$((ADDED + REMOVED))
    BASEN=$(wc -l < "$TMP/base.txt" | tr -d ' ')
    echo "  -- aggregation band vs 67b7d3f: baseline $BASEN locs | served $(wc -l < "$TMP/got.txt" | tr -d ' ') locs | +$ADDED -$REMOVED"
    chk "DARK: aggregation <loc> set is byte-for-byte 67b7d3f (difference count)" "$DIFFN" 0
    if [ "$DIFFN" -ne 0 ]; then
      echo "      first 10 ADDED (dark is emitting urls 67b7d3f did not):"
      comm -13 "$TMP/base.txt" "$TMP/got.txt" | head -10 | sed 's/^/        + /'
      echo "      first 10 REMOVED (dark stopped emitting urls 67b7d3f had):"
      comm -23 "$TMP/base.txt" "$TMP/got.txt" | head -10 | sed 's/^/        - /'
    fi
    # ⚠️ PAIRED, so the diff cannot pass because both sides are empty — the
    # classic vacuous green. A baseline with no urls proves nothing.
    ge "DARK: baseline fixture is non-empty (else the diff above is vacuous)" "$BASEN" 1

    # ⭐ THE CHILD COUNT — the number Ken measured, 5 on prod vs 6 on P3.
    # Asserted against the baseline's OWN count rather than a hardcoded 5,
    # because `PUBLISHED_CONCLUDED_CHILDREN` is an env var (3 on prod, default 2
    # here) and hardcoding it would fail on the fixture for the wrong reason.
    # The invariant that actually broke — the AGGREGATION band contributes
    # exactly one child while dark, at ANY band size — is asserted over a
    # 0..60,000-url range in src/lib/seo/sitemap-config.test.ts, because this
    # fixture's band is 64 urls and never reaches the 20,000 boundary.
    BASE_CHILDREN=$(grep -m1 '^# *children ' "$BASE" | sed -E 's/[^0-9]*([0-9]+).*/\1/')
    chk "DARK: sitemap index child count matches 67b7d3f" "$NCHILD" "${BASE_CHILDREN:-4}"

    # The detail bands, by count. Not by url: their slugs carry per-seed cuids.
    # A count still catches the thing that matters here — a band losing or
    # gaining a child, or a skip window shifting, both of which move the total.
    BASE_DETAIL=$(grep -m1 '^# *detail-locs ' "$BASE" | sed -E 's/[^0-9]*([0-9]+).*/\1/')
    chk "DARK: detail-band url count matches 67b7d3f" "$DETAIL_TOTAL" "${BASE_DETAIL:-0}"
  fi

  # ⭐ THE LEAK TEST. With the switch off the sitemap must be the v3 set.
  # Paired assertions: the v3 shape must be PRESENT (so its absence cannot make
  # the v4 check pass vacuously) and the v4 shape must be ABSENT.
  ge  "DARK: v3 outcome-first shape present" "$OUT_FIRST" 1
  chk "DARK: v4 outcome-last shape ABSENT (leak test)" "$OUT_LAST" 0
  chk "DARK: no /municipios/pagina in sitemap" "$MUNIPAG" 0
else
  # LIT: the superseded shapes are gone, their replacements are there.
  ge  "LIT: v4 outcome-last shape present" "$OUT_LAST" 1
  chk "LIT: v3 outcome-first shape GONE (it 301s; a 301 is a wasted crawl)" "$OUT_FIRST" 0
  chk "LIT: no /pagina/N past the 10-page cap" "$OVERCAP" 0
  chk "LIT: no /municipios/pagina past the index" "$MUNIPAG" 0
fi

# --- the index must not advertise a child the child route 404s -------------
LAST=$((NCHILD - 1))
PAST=$(curl -s -o /dev/null -w '%{http_code}' --max-time 60 "$B/sitemap/$((LAST + 1)).xml")
chk "id past the published range 404s" "$PAST" 404

# --- detail URLs are FROZEN this wave --------------------------------------
# The brief's hardest fence: auction DETAIL urls must not move. Asserted here
# because the sitemap is where a moved detail URL would first become visible.
DET=$(grep -c '/subastas/' "$TMP/all.txt" || true)
ge "auction detail urls still advertised (frozen, untouched by P3)" "$DET" 1

echo "RESULT $MODE: pass=$pass fail=$fail  (children=$NCHILD urls=$TOTAL archive=$ARCH)"
[ "$fail" -eq 0 ] || exit 1
