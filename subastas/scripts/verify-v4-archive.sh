#!/usr/bin/env bash
# verify-v4-archive — e2e contract check for the v4 /resultados archive tree.
#
# Run against a real `next start` + a seeded Postgres fixture:
#   npx next build --webpack && npx next start -p 3987
#   bash scripts/verify-v4-archive.sh
#
# Asserts the things that silently rot: the pagination contract (pagina/1 -> 307,
# out-of-range -> 404, strict page parsing), the reserved-segment grammar, the
# MANDATORY full page fan (Ken 2026-08-13 — without it the depth number is
# fiction), the three page sizes (24 / 48 / adaptive 84 at the ladder-exhausted
# leaf, and 48 NOT 84 on an outcome facet), self-canonical to the paginated URL,
# and the two switch states.
#
# ⛔ RELEASE GATE included: /resultados must link every location-free shelf root.
# The province grid cannot reach a province-less row, and the shelf has no other
# parent — an unlinked shelf root orphans exactly the rows it exists for.
#
# The fixture must contain a 840-row (muni,tipo,año,t1) leaf, a >60-town
# province, and province-less rows; see the P1 résumé for the seed shape.
pass=0; fail=0
ck(){ if [ "$2" = "$3" ]; then echo "  ok   $1 ($3)"; pass=$((pass+1)); else echo "  FAIL $1: expected $3 got $2"; fail=$((fail+1)); fi }
code(){ curl -s -o /dev/null -w "%{http_code}" "$B$1"; }
body(){ curl -s "$B$1"; }
has(){ if body "$1" | grep -qF -- "$2"; then echo "  ok   $3"; pass=$((pass+1)); else echo "  FAIL $3 (missing: $2)"; fail=$((fail+1)); fi }
hasnt(){ if body "$1" | grep -qF -- "$2"; then echo "  FAIL $3 (present: $2)"; fail=$((fail+1)); else echo "  ok   $3"; pass=$((pass+1)); fi }

echo "--- status codes ---"
ck "province hub"            "$(code /resultados/madrid)" 200
ck "town archive"            "$(code /resultados/madrid/madrid)" 200
ck "v4 prov/tipo"            "$(code /resultados/madrid/judicial)" 200
ck "v4 prov/muni/tipo"       "$(code /resultados/madrid/madrid/judicial)" 200
ck "v4 .../ano"              "$(code /resultados/madrid/madrid/judicial/2026)" 200
ck "v4 .../ano/t1"           "$(code /resultados/madrid/madrid/judicial/2026/t1)" 200
ck "v4 reversed outcome"     "$(code /resultados/madrid/canceladas)" 200
ck "shelf root"              "$(code /resultados/judicial)" 200
ck "shelf tipo/ano"          "$(code /resultados/judicial/2024)" 200
ck "legacy outcome/prov"     "$(code /resultados/canceladas/madrid)" 200
ck "municipios de-paged (900 towns)" "$(code /resultados/barcelona/municipios)" 200

echo "--- pagination contract ---"
ck "pagina/1 -> 307"         "$(code /resultados/madrid/madrid/judicial/2026/t1/pagina/1)" 307
ck "pagina/2 in range"       "$(code /resultados/madrid/madrid/judicial/2026/t1/pagina/2)" 200
ck "pagina/10 last page"     "$(code /resultados/madrid/madrid/judicial/2026/t1/pagina/10)" 200
ck "pagina/11 out of range"  "$(code /resultados/madrid/madrid/judicial/2026/t1/pagina/11)" 404
ck "pagina/0 invalid"        "$(code /resultados/madrid/madrid/judicial/2026/t1/pagina/0)" 404
ck "pagina/01 invalid"       "$(code /resultados/madrid/madrid/judicial/2026/t1/pagina/01)" 404

echo "--- 404s that must stay 404 ---"
ck "bogus province"          "$(code /resultados/notaprovince)" 404
ck "bogus tipo"              "$(code /resultados/madrid/notatipo)" 404
ck "year out of range"       "$(code /resultados/madrid/madrid/judicial/9999)" 404
ck "empty year in range"     "$(code /resultados/madrid/madrid/judicial/2001)" 404
ck "quarter t5"              "$(code /resultados/madrid/madrid/judicial/2026/t5)" 404
ck "6th segment"             "$(code /resultados/madrid/madrid/judicial/2026/t1/x)" 404
# ⛔ CORRECTED in P2. P1 asserted 404 here — but this script runs with the switch
# DARK, and while dark that URL must serve exactly as it does on prod today. The
# assertion was locking in the regression rather than catching it. The retirement
# is a 308 with the switch LIT, proved in `verify-v4-redirects.sh`.
ck "muni pagina/2 still live while dark" "$(code /resultados/barcelona/municipios/pagina/2)" 200

echo "--- tipo alias 301/307 ---"
ck "alias aeat redirects"    "$(code /resultados/madrid/aeat)" 307

echo "--- RELEASE GATE: /resultados links every shelf root ---"
has /resultados 'href="/resultados/judicial"' "shelf root judicial linked from /resultados"
has /resultados 'href="/resultados/notarial"' "shelf root notarial linked from /resultados"

echo "--- dark switch (URL_V4_SWITCH unset) ---"
has  /resultados/madrid/madrid/judicial/2026 'noindex' "deep v4 node is noindex while dark"
has  /resultados/madrid 'href="/resultados/canceladas/madrid"' "legacy outcome ORDER preserved while dark"
hasnt /resultados/madrid 'href="/resultados/madrid/canceladas"' "v4 reversed order NOT linked while dark"

echo "--- full page fan (Ken mandate) ---"
for n in 2 3 4 5 6 7 8 9 10; do
  has /resultados/madrid/madrid/judicial/2026/t1 "/resultados/madrid/madrid/judicial/2026/t1/pagina/$n" "fan links page $n from page 1"
done
has /resultados/madrid/madrid/judicial/2026/t1/pagina/5 "/resultados/madrid/madrid/judicial/2026/t1/pagina/10" "fan links page 10 from page 5"

echo "--- adaptive page size: 840 rows / 10 pages = 84 per page ---"
rows(){ body "$1" | grep -o 'href="/subastas/subasta/[^"]*"' | sort -u | wc -l | tr -d ' '; }
ck "small node pages at 24"          "$(rows /resultados/barcelona/barcelona)" 24
ck "dense node pages at 48"          "$(rows /resultados/madrid/madrid/judicial/2025)" 48
ck "exhausted leaf pages at 84"      "$(rows /resultados/madrid/madrid/judicial/2026/t1)" 84
ck "exhausted leaf page 10 also 84"  "$(rows /resultados/madrid/madrid/judicial/2026/t1/pagina/10)" 84
ck "outcome facet stays at 48"       "$(rows /resultados/madrid/canceladas)" 48

echo "--- self-canonical to the paginated URL ---"
has /resultados/madrid/madrid/judicial/2026/t1/pagina/3 'rel="canonical" href="https://subastasactivas.com/resultados/madrid/madrid/judicial/2026/t1/pagina/3"' "self-canonical on page 3"
has /resultados/madrid/madrid/judicial/2026/t1/pagina/3 'rel="prev"' "rel=prev in head"
has /resultados/madrid/madrid/judicial/2026/t1/pagina/3 'rel="next"' "rel=next in head"

echo ""
echo "PASS=$pass FAIL=$fail"
