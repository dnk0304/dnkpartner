#!/usr/bin/env bash
# verify-v4-archive — e2e contract check for the v4 /resultados archive tree.
#
# ⚠️ DO NOT RUN THIS BY HAND. Run `bash scripts/verify-v4-suite.sh`, which seeds
# the committed fixture, builds, and runs this in BOTH switch states. Running it
# against whatever happens to be in your dev DB is precisely how P1's "48/48"
# came to mean nothing (Ken's ruling, 2026-08-13): a test that cannot be re-run
# from the repo is indistinguishable from no test.
#
# Asserts the things that silently rot: the pagination contract (pagina/1 -> 307,
# out-of-range -> 404, strict page parsing), the reserved-segment grammar, the
# MANDATORY full page fan (Ken 2026-08-13 — without it the depth number is
# fiction), the three page sizes (24 / 48 / adaptive 84 at the ladder-exhausted
# leaf, and 48 NOT 84 on an outcome facet), self-canonical to the paginated URL,
# the location-free shelf, and both switch states.
#
# ⛔ RELEASE GATE included: /resultados must link every location-free shelf root.
# The province grid cannot reach a province-less row, and the shelf has no other
# parent — an unlinked shelf root orphans exactly the rows it exists for.
#
# ---------------------------------------------------------------------------
# ⚠️ THE YEAR IS DERIVED, NEVER TYPED
#
# This script asserted 2026 while its fixture seeded 2025. That was not a typo —
# it was a hardcoded year rotting past its seed date, and it is the reason P1's
# evidence was voided. `Y` below is "last complete calendar year", computed the
# SAME way `scripts/forge-v4-fixture.ts` computes `ARCHIVE_YEAR`. Two derivations
# of one rule cannot drift the way two literals did. If you change the rule,
# change it in both files — and there are exactly two.
# ---------------------------------------------------------------------------
set -u
B="${B:-http://localhost:3987}"
MODE="${MODE:-dark}"
Y=$(( $(date -u +%Y) - 1 ))   # ARCHIVE_YEAR      — the 840-row leaf's year
YP=$(( Y - 1 ))               # ARCHIVE_YEAR_PREV — the dense node + shelf year

pass=0; fail=0
ck(){ if [ "$2" = "$3" ]; then echo "  ok   $1 ($3)"; pass=$((pass+1)); else echo "  FAIL $1: expected $3 got $2"; fail=$((fail+1)); fi }
code(){ curl -s -o /dev/null -w "%{http_code}" "$B$1"; }
body(){ curl -s "$B$1"; }
has(){ if body "$1" | grep -qF -- "$2"; then echo "  ok   $3"; pass=$((pass+1)); else echo "  FAIL $3 (missing: $2)"; fail=$((fail+1)); fi }
hasnt(){ if body "$1" | grep -qF -- "$2"; then echo "  FAIL $3 (present: $2)"; fail=$((fail+1)); else echo "  ok   $3"; pass=$((pass+1)); fi }

LEAF="/resultados/madrid/madrid/judicial/$Y/t1"   # 840 rows, 84/page, exactly 10 pages
DENSE="/resultados/madrid/madrid/judicial/$YP"    # 300 rows → 48/page, no split
SMALL="/resultados/barcelona/barcelona"           # 24 rows → 24/page

echo "=== verify-v4-archive  MODE=$MODE  B=$B  Y=$Y  YP=$YP ==="

echo "--- status codes ---"
ck "province hub"            "$(code /resultados/madrid)" 200
ck "town archive"            "$(code /resultados/madrid/madrid)" 200
ck "v4 prov/tipo"            "$(code /resultados/madrid/judicial)" 200
ck "v4 prov/muni/tipo"       "$(code /resultados/madrid/madrid/judicial)" 200
ck "v4 .../ano"              "$(code /resultados/madrid/madrid/judicial/$Y)" 200
ck "v4 .../ano/t1"           "$(code $LEAF)" 200
ck "v4 reversed outcome"     "$(code /resultados/madrid/canceladas)" 200
ck "municipios de-paged (206 towns)" "$(code /resultados/barcelona/municipios)" 200

echo "--- the location-free shelf (province-less rows) ---"
# Untested before P2c: the committed fixture had no province-less row at all, so
# every shelf assertion below was vacuously true against an empty node.
ck "shelf root judicial"     "$(code /resultados/judicial)" 200
ck "shelf root notarial"     "$(code /resultados/notarial)" 200
ck "shelf tipo/ano"          "$(code /resultados/judicial/$YP)" 200
ck "shelf year with no rows" "$(code /resultados/notarial/$Y)" 404
ck "shelf tipo alias 307"    "$(code /resultados/aeat)" 307

echo "--- outcome facets, including canceladas ---"
# `canceladas` is the outcome the old fixture could not produce (status CANCELADA
# with a NULL saleResult), so the whole cancelled branch of outcomeWhere() went
# unexercised.
ck "v4 canceladas facet"      "$(code /resultados/madrid/canceladas)" 200
ck "v4 adjudicadas facet"     "$(code /resultados/madrid/adjudicadas)" 200
ck "v4 desiertas facet"       "$(code /resultados/madrid/desiertas)" 200
# ⛔ An EMPTY v4 facet is a 404, and that is the correct answer, not a defect:
# the count gate refuses to mint a 0-row ladder node. It is also the entire
# reason the legacy 301 needs a fallback — `verify-v4-redirects.sh` proves
# `/resultados/canceladas/sevilla` lands on `/resultados/sevilla` rather than
# 301-ing onto this 404. The two assertions are halves of one contract, so this
# one is pinned here rather than left implicit.
ck "empty v4 facet 404s (301 fallback exists for it)" "$(code /resultados/sevilla/canceladas)" 404
# The LEGACY empty facet is a 200 noindex page today and must stay one while dark.
ck "legacy empty facet still 200s" "$(code /resultados/canceladas/sevilla)" "$([ "$MODE" = dark ] && echo 200 || echo 308)"

echo "--- pagination contract ---"
ck "pagina/1 -> 307"         "$(code $LEAF/pagina/1)" 307
ck "pagina/2 in range"       "$(code $LEAF/pagina/2)" 200
ck "pagina/10 last page"     "$(code $LEAF/pagina/10)" 200
ck "pagina/11 out of range"  "$(code $LEAF/pagina/11)" 404
ck "pagina/0 invalid"        "$(code $LEAF/pagina/0)" 404
ck "pagina/01 invalid"       "$(code $LEAF/pagina/01)" 404

echo "--- 404s that must stay 404 ---"
ck "bogus province"          "$(code /resultados/notaprovince)" 404
ck "bogus tipo"              "$(code /resultados/madrid/notatipo)" 404
ck "year out of range"       "$(code /resultados/madrid/madrid/judicial/9999)" 404
ck "empty year in range"     "$(code /resultados/madrid/madrid/judicial/2001)" 404
ck "quarter t5"              "$(code /resultados/madrid/madrid/judicial/$Y/t5)" 404
ck "6th segment"             "$(code $LEAF/x)" 404

echo "--- tipo alias 301/307 ---"
ck "alias aeat redirects"    "$(code /resultados/madrid/aeat)" 307

echo "--- RELEASE GATE: /resultados links every shelf root ---"
has /resultados 'href="/resultados/judicial"' "shelf root judicial linked from /resultados"
has /resultados 'href="/resultados/notarial"' "shelf root notarial linked from /resultados"

echo "--- full page fan (Ken mandate) ---"
for n in 2 3 4 5 6 7 8 9 10; do
  has $LEAF "$LEAF/pagina/$n" "fan links page $n from page 1"
done
has $LEAF/pagina/5 "$LEAF/pagina/10" "fan links page 10 from page 5"

echo "--- the three page sizes ---"
rows(){ body "$1" | grep -o 'href="/subastas/subasta/[^"]*"' | sort -u | wc -l | tr -d ' '; }
ck "small node pages at 24"          "$(rows $SMALL)" 24
ck "dense node pages at 48"          "$(rows $DENSE)" 48
ck "exhausted leaf pages at 84"      "$(rows $LEAF)" 84
ck "exhausted leaf page 10 also 84"  "$(rows $LEAF/pagina/10)" 84
ck "outcome facet stays at 48"       "$(rows /resultados/madrid/canceladas)" 48

echo "--- self-canonical to the paginated URL ---"
has $LEAF/pagina/3 "rel=\"canonical\" href=\"https://subastasactivas.com$LEAF/pagina/3\"" "self-canonical on page 3"
has $LEAF/pagina/3 'rel="prev"' "rel=prev in head"
has $LEAF/pagina/3 'rel="next"' "rel=next in head"

if [ "$MODE" = "dark" ]; then
  echo "--- dark switch (URL_V4_SWITCH unset) ---"
  ck "legacy outcome/prov still 200"  "$(code /resultados/canceladas/madrid)" 200
  has  "/resultados/madrid/madrid/judicial/$Y" 'noindex' "deep v4 node is noindex while dark"
  has  /resultados/madrid/canceladas 'noindex' "v4 outcome facet is noindex while dark"
  has  /resultados/judicial 'noindex' "shelf root is noindex while dark"
  has  /resultados/madrid 'href="/resultados/canceladas/madrid"' "legacy outcome ORDER preserved while dark"
  hasnt /resultados/madrid 'href="/resultados/madrid/canceladas"' "v4 reversed order NOT linked while dark"
  # ⛔ CORRECTED in P2. P1 asserted 404 here — but this script runs with the
  # switch DARK, and while dark that URL must serve exactly as it does on prod
  # today. The assertion was locking in the regression rather than catching it.
  ck "muni pagina/2 still live while dark" "$(code /resultados/barcelona/municipios/pagina/2)" 200
else
  echo "--- lit switch (URL_V4_SWITCH=1) ---"
  # The other half of the atomic flip. `verify-v4-redirects.sh` proves the 301
  # side and the chain length; this proves the same nodes this script paged
  # through are the ones whose robots tag lifted.
  ck "legacy outcome/prov is now a 308" "$(code /resultados/canceladas/madrid)" 308
  has  "/resultados/madrid/madrid/judicial/$Y" 'index,follow' "deep v4 node is indexable once lit"
  hasnt "/resultados/madrid/madrid/judicial/$Y" 'noindex' "deep v4 node no longer noindex"
  has  /resultados/madrid/canceladas 'index,follow' "v4 outcome facet is indexable once lit"
  has  /resultados/judicial 'index,follow' "shelf root is indexable once lit"
  has  /resultados/madrid 'href="/resultados/madrid/canceladas"' "v4 reversed order linked once lit"
  hasnt /resultados/madrid 'href="/resultados/canceladas/madrid"' "legacy order no longer linked"
  ck "muni pagina/2 retires to a 308"   "$(code /resultados/barcelona/municipios/pagina/2)" 308
fi

echo ""
echo "PASS=$pass FAIL=$fail"
[ "$fail" -eq 0 ] || exit 1
