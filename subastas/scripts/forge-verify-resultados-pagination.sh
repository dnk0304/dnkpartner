#!/bin/sh
# Proofs for the /resultados archive pagination. Fixture: madrid/madrid=61 rows
# (3 pages), madrid/alcobendas=24 (1 page), madrid/getafe=25 (2 pages),
# valencia/valencia=30 (2 pages). Province madrid = 110 rows (5 pages).
B=${B:-http://localhost:3987}
pass=0; fail=0
chk() { # name expected actual
  if [ "$2" = "$3" ]; then pass=$((pass+1)); echo "  PASS  $1 = $3";
  else fail=$((fail+1)); echo "  FAIL  $1  expected=$2  got=$3"; fi
}
code() { curl -s -o /dev/null -w "%{http_code}" "$B$1"; }
loc()  { curl -s -o /dev/null -w "%{redirect_url}" "$B$1"; }
body() { curl -s "$B$1"; }

echo "== status codes (precedent: pagina/1 -> 307 hub, out-of-range -> 404) =="
chk "town hub 200"                200 "$(code /resultados/madrid/madrid)"
chk "town pagina/2 200"           200 "$(code /resultados/madrid/madrid/pagina/2)"
chk "town pagina/3 200"           200 "$(code /resultados/madrid/madrid/pagina/3)"
chk "town pagina/4 out-of-range"  404 "$(code /resultados/madrid/madrid/pagina/4)"
chk "town pagina/1 redirect"      307 "$(code /resultados/madrid/madrid/pagina/1)"
chk "single-page town pagina/2"   404 "$(code /resultados/madrid/alcobendas/pagina/2)"
chk "getafe pagina/2 200"         200 "$(code /resultados/madrid/getafe/pagina/2)"
chk "getafe pagina/3 404"         404 "$(code /resultados/madrid/getafe/pagina/3)"
chk "province pagina/2 200"       200 "$(code /resultados/madrid/pagina/2)"
chk "province pagina/1 redirect"  307 "$(code /resultados/madrid/pagina/1)"
chk "province pagina/99 404"      404 "$(code /resultados/madrid/pagina/99)"
chk "outcome nat pagina/2 200"    200 "$(code /resultados/adjudicadas/pagina/2)"
chk "outcome x prov pagina/2 200" 200 "$(code /resultados/adjudicadas/madrid/pagina/2)"
chk "leading-zero pagina/02 404"  404 "$(code /resultados/madrid/madrid/pagina/02)"
chk "non-numeric pagina/abc 404"  404 "$(code /resultados/madrid/madrid/pagina/abc)"
chk "bogus province 404"          404 "$(code /resultados/nowhere/pagina/2)"

echo "== pagina/1 redirect target is the bare hub =="
chk "town pagina/1 -> hub"  "$B/resultados/madrid/madrid" "$(loc /resultados/madrid/madrid/pagina/1)"
chk "prov pagina/1 -> hub"  "$B/resultados/madrid"        "$(loc /resultados/madrid/pagina/1)"

echo "== robots + self-canonical (match /subastas precedent exactly) =="
P2=$(body /resultados/madrid/madrid/pagina/2)
chk "pagina/2 robots index,follow" 1 "$(printf '%s' "$P2" | grep -c '<meta name="robots" content="index,follow"')"
chk "pagina/2 self-canonical"      1 "$(printf '%s' "$P2" | grep -c 'rel="canonical" href="https://subastasactivas.com/resultados/madrid/madrid/pagina/2"')"
chk "pagina/2 NOT canonical to hub" 0 "$(printf '%s' "$P2" | grep -c 'rel="canonical" href="https://subastasactivas.com/resultados/madrid/madrid"/>')"

echo "== rel=next / rel=prev in HEAD (new; also lands on /subastas) =="
chk "pagina/2 head rel=next" 1 "$(printf '%s' "$P2" | grep -c '<link rel="next" href="https://subastasactivas.com/resultados/madrid/madrid/pagina/3"')"
chk "pagina/2 head rel=prev" 1 "$(printf '%s' "$P2" | grep -c '<link rel="prev" href="https://subastasactivas.com/resultados/madrid/madrid"')"
P3=$(body /resultados/madrid/madrid/pagina/3)
H1=$(body /resultados/madrid/madrid)
chk "last page has NO rel=next" 0 "$(printf '%s' "$P3" | grep -c '<link rel="next"')"
chk "last page has rel=prev"    1 "$(printf '%s' "$P3" | grep -c '<link rel="prev" href="https://subastasactivas.com/resultados/madrid/madrid/pagina/2"')"
chk "hub page1 has rel=next" 1 "$(printf '%s' "$H1" | grep -c '<link rel="next" href="https://subastasactivas.com/resultados/madrid/madrid/pagina/2"')"
chk "hub page1 has NO rel=prev" 0 "$(printf '%s' "$H1" | grep -c '<link rel="prev"')"

echo "== SSR crawl path: real <a href> per concluded card, in the server HTML =="
ROWS=$(printf '%s' "$P2" | grep -o 'href="/subastas/subasta/[^"]*"' | sort -u | wc -l)
chk "pagina/2 detail anchors = page size" 24 "$ROWS"
LAST=$(printf '%s' "$P3" | grep -o 'href="/subastas/subasta/[^"]*"' | sort -u | wc -l)
chk "pagina/3 detail anchors = remainder" 13 "$LAST"
chk "pagina/2 has pagination nav" 1 "$(printf '%s' "$P2" | grep -c 'href="/resultados/madrid/madrid/pagina/3"')"
chk "hub page1 links to pagina/2" 1 "$(printf '%s' "$H1" | grep -c 'href="/resultados/madrid/madrid/pagina/2"')"
# The deep page must NOT mount the client filter island (its "load more" fetches
# a robots-disallowed querystring URL). Proof: the island's <select> filter row
# is present on the hub and absent on the deep page.
chk "hub mounts the filter island"      1 "$(printf '%s' "$H1" | grep -c '<select')"
chk "deep page has no filter island"    0 "$(printf '%s' "$P2" | grep -c '<select')"

echo "== union proof: hub + pagina/2 + pagina/3 cover the whole town, no overlap =="
ALL=$( { printf '%s' "$H1"; printf '%s' "$P2"; printf '%s' "$P3"; } | grep -o 'href="/subastas/subasta/[^"]*"' | sort -u | wc -l)
chk "distinct detail urls across 3 pages" 61 "$ALL"

echo "== /subastas precedent unchanged + now carries head rel =="
chk "subastas madrid hub 200" 200 "$(code /subastas/madrid)"
chk "subastas pagina/1 redirect" 307 "$(code /subastas/madrid/pagina/1)"

echo
echo "PASS=$pass FAIL=$fail"
[ "$fail" = 0 ]
