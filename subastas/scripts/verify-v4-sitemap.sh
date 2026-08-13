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

TOTAL=0
EMPTY=0
OVER=0
: > "$TMP/all.txt"
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
AGG_CHILDREN="${AGG_CHILDREN:-1}"
agg_empty=0
j=0
while [ "$j" -lt "$AGG_CHILDREN" ]; do
  n=$(grep -o '<loc>' "$TMP/c$j.xml" 2>/dev/null | wc -l | tr -d ' ')
  [ "${n:-0}" -eq 0 ] && agg_empty=$((agg_empty+1))
  j=$((j+1))
done
chk "NO EMPTY AGGREGATION CHILD (the D2 defect)" "$agg_empty" 0
echo "  --   detail-band children empty on this corpus: $((EMPTY - agg_empty)) (fixture-scale; all 4 non-empty on prod 2026-08-13)"
chk "no child over CHILD_SITEMAP_SIZE" "$OVER" 0
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
