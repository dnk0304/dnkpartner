#!/bin/sh
# Proofs for the province municipality index — the fix for the `slice(0, 60)`
# that left 8,673 of 11,677 town archives (74%, 50/52 provinces) with no inbound
# internal link.
#
# Fixture (scripts/forge-pagination-fixture.ts):
#   madrid    →   3 munis  (<= HUB_MUNI_PREVIEW=60)  → /municipios redirects to hub
#   tarragona →  70 munis  (> 60, 1 index page)
#   barcelona → 205 munis  (> 60, 2 index pages: 200 + 5)
# Town totals descend strictly (n … 1), so rank == page position is assertable.
B=${B:-http://localhost:3991}
pass=0; fail=0
chk() {
  if [ "$2" = "$3" ]; then pass=$((pass+1)); echo "  PASS  $1 = $3";
  else fail=$((fail+1)); echo "  FAIL  $1  expected=$2  got=$3"; fi
}
code() { curl -s -o /dev/null -w "%{http_code}" "$B$1"; }
loc()  { curl -s -o /dev/null -w "%{redirect_url}" "$B$1"; }
body() { curl -s "$B$1"; }
# distinct town-archive anchors for a province, in one document
towns() { printf '%s' "$2" | grep -o "href=\"/resultados/$1/[a-z0-9-]*\"" | grep -v '/municipios"' | sort -u; }

echo "== status codes (precedent-matched to the archive pagination) =="
chk "index p1 200"                200 "$(code /resultados/barcelona/municipios)"
chk "index p2 200"                200 "$(code /resultados/barcelona/municipios/pagina/2)"
chk "index p3 out-of-range 404"   404 "$(code /resultados/barcelona/municipios/pagina/3)"
chk "index pagina/1 redirect"     307 "$(code /resultados/barcelona/municipios/pagina/1)"
chk "single-page prov p2 404"     404 "$(code /resultados/tarragona/municipios/pagina/2)"
chk "single-page prov p1 200"     200 "$(code /resultados/tarragona/municipios)"
chk "leading-zero pagina/02 404"  404 "$(code /resultados/barcelona/municipios/pagina/02)"
chk "non-numeric pagina/abc 404"  404 "$(code /resultados/barcelona/municipios/pagina/abc)"
chk "negative pagina/-1 404"      404 "$(code /resultados/barcelona/municipios/pagina/-1)"
chk "outcome slug has no index"   404 "$(code /resultados/adjudicadas/municipios)"
chk "bogus province 404"          404 "$(code /resultados/nowhere/municipios)"

echo "== small province: hub IS the index, so /municipios redirects (never an orphan page) =="
chk "madrid /municipios 307"      307 "$(code /resultados/madrid/municipios)"
chk "madrid redirect target"      "$B/resultados/madrid" "$(loc /resultados/madrid/municipios)"
chk "index pagina/1 -> bare index" "$B/resultados/barcelona/municipios" "$(loc /resultados/barcelona/municipios/pagina/1)"

echo "== robots + self-canonical (deep index page must NOT canonicalise to p1) =="
I1=$(body /resultados/barcelona/municipios)
I2=$(body /resultados/barcelona/municipios/pagina/2)
chk "p1 index,follow" 1 "$(printf '%s' "$I1" | grep -c '<meta name="robots" content="index,follow"')"
chk "p2 index,follow" 1 "$(printf '%s' "$I2" | grep -c '<meta name="robots" content="index,follow"')"
chk "p1 self-canonical" 1 "$(printf '%s' "$I1" | grep -c 'rel="canonical" href="https://subastasactivas.com/resultados/barcelona/municipios"')"
chk "p2 self-canonical" 1 "$(printf '%s' "$I2" | grep -c 'rel="canonical" href="https://subastasactivas.com/resultados/barcelona/municipios/pagina/2"')"

echo "== rel prev/next in <head> =="
chk "p1 head rel=next" 1 "$(printf '%s' "$I1" | grep -c '<link rel="next" href="https://subastasactivas.com/resultados/barcelona/municipios/pagina/2"')"
chk "p1 head NO rel=prev" 0 "$(printf '%s' "$I1" | grep -c '<link rel="prev"')"
chk "p2 head rel=prev -> bare index" 1 "$(printf '%s' "$I2" | grep -c '<link rel="prev" href="https://subastasactivas.com/resultados/barcelona/municipios"')"
chk "p2 head NO rel=next (last page)" 0 "$(printf '%s' "$I2" | grep -c '<link rel="next"')"

echo "== the hub links the index, and links EVERY index page (depth-4 guarantee) =="
HUB=$(body /resultados/barcelona)
chk "hub links index p1" 1 "$(printf '%s' "$HUB" | grep -c 'href="/resultados/barcelona/municipios"')"
chk "hub links index p2" 1 "$(printf '%s' "$HUB" | grep -c 'href="/resultados/barcelona/municipios/pagina/2"')"
THUB=$(body /resultados/tarragona)
chk "1-page prov: hub links index" 1 "$(printf '%s' "$THUB" | grep -c 'href="/resultados/tarragona/municipios"')"
chk "1-page prov: no page-number row" 0 "$(printf '%s' "$THUB" | grep -c 'href="/resultados/tarragona/municipios/pagina/')"
MHUB=$(body /resultados/madrid)
chk "small prov hub does NOT link index" 0 "$(printf '%s' "$MHUB" | grep -c 'href="/resultados/madrid/municipios"')"

echo "== page-size split is exact (200 + 5), and pages do not overlap =="
chk "index p1 town anchors" 200 "$(towns barcelona "$I1" | wc -l)"
chk "index p2 town anchors"   5 "$(towns barcelona "$I2" | wc -l)"
chk "p1+p2 distinct union"  205 "$( { towns barcelona "$I1"; towns barcelona "$I2"; } | sort -u | wc -l)"
chk "rank-1 town on p1"  1 "$(printf '%s' "$I1" | grep -c 'href="/resultados/barcelona/bartown001"')"
chk "rank-201 town NOT on p1" 0 "$(printf '%s' "$I1" | grep -c 'href="/resultados/barcelona/bartown201"')"
chk "rank-201 town IS on p2"  1 "$(printf '%s' "$I2" | grep -c 'href="/resultados/barcelona/bartown201"')"
chk "rank-205 town IS on p2"  1 "$(printf '%s' "$I2" | grep -c 'href="/resultados/barcelona/bartown205"')"

echo "== THE GATE: zero town archives with no inbound internal link =="
# Union of every town anchor reachable from the province hub + its index pages,
# vs the full set of town archives that exist for that province.
COVERED=$( { towns barcelona "$HUB"; towns barcelona "$I1"; towns barcelona "$I2"; } | sort -u | wc -l)
chk "barcelona towns linked from hub+index" 205 "$COVERED"
TCOVER=$( { towns tarragona "$THUB"; towns tarragona "$(body /resultados/tarragona/municipios)"; } | sort -u | wc -l)
chk "tarragona towns linked from hub+index" 70 "$TCOVER"
chk "madrid towns linked from hub alone"     3 "$(towns madrid "$MHUB" | wc -l)"

echo "== every linked town archive actually resolves (no linked 404s) =="
BAD=0
for u in $(towns barcelona "$I2" | sed 's/href="//;s/"//'); do
  [ "$(code "$u")" = "200" ] || BAD=$((BAD+1))
done
chk "p2 town archives all 200" 0 "$BAD"

echo "== the index page is deliberately absent from the sitemap =="
S0=$(body /sitemap/0.xml)
chk "no /municipios URL in child 0" 0 "$(printf '%s' "$S0" | grep -c '/municipios')"

echo "== archive pagination precedent still intact (no regression) =="
chk "town hub 200"               200 "$(code /resultados/madrid/madrid)"
chk "town pagina/2 200"          200 "$(code /resultados/madrid/madrid/pagina/2)"
chk "town pagina/4 404"          404 "$(code /resultados/madrid/madrid/pagina/4)"
chk "province pagina/2 200"      200 "$(code /resultados/madrid/pagina/2)"
chk "outcome x prov pagina/2"    200 "$(code /resultados/adjudicadas/madrid/pagina/2)"
chk "town archive still 200"     200 "$(code /resultados/madrid/getafe)"

echo
echo "PASS=$pass FAIL=$fail"
[ "$fail" = 0 ]
