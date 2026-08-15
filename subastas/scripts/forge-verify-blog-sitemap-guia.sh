#!/bin/sh
# Proofs for: /blog added to the sitemap aggregation band, and bare /guia 301 -> /blog.
#
# Fixture: any DB with >=1 PUBLISHED Article (the /guia/<slug> arm needs one slug;
# override with S=<slug>). The /guia redirect arm is pure middleware and needs no DB.
#
#   Local arm (default):  sh scripts/forge-verify-blog-sitemap-guia.sh
#   Prod baseline arm:    B=https://subastasactivas.com sh scripts/forge-verify-blog-sitemap-guia.sh
#
# Port is deliberately NOT a repo-wide default — sibling agents hold 3987/3991.
B=${B:-http://localhost:3994}
S=${S:-}
# The sitemap emits ABSOLUTE canonical URLs built from SITE, which is NOT the
# host you fetched from. Grepping child 0 for "$B/blog" fails against a local
# server even when the entry is present and correct. Keep the two separate.
SITE=${SITE:-https://subastasactivas.com}

pass=0; fail=0
chk() { # name expected actual
  if [ "$2" = "$3" ]; then pass=$((pass+1)); echo "  PASS  $1 = $3";
  else fail=$((fail+1)); echo "  FAIL  $1  expected=$2  got=$3"; fi
}
chk_ne() { # name notexpected actual
  if [ "$2" != "$3" ]; then pass=$((pass+1)); echo "  PASS  $1 = $3 (not $2)";
  else fail=$((fail+1)); echo "  FAIL  $1  should not be $2"; fi
}
code() { curl -s -o /dev/null -w "%{http_code}" "$B$1"; }
loc()  { curl -s -o /dev/null -w "%{redirect_url}" "$B$1"; }

# Follow the whole chain and report how many hops it took. This is the
# "exactly one hop, landing on a 200" assertion — a 301 onto another redirect
# or onto a 404 is the classic way this change goes wrong.
hops() { curl -s -o /dev/null -w "%{num_redirects}" -L "$B$1"; }
final() { curl -s -o /dev/null -w "%{http_code}" -L "$B$1"; }

echo "== T2: bare /guia 301s to /blog =="
chk "/guia status"            301 "$(code /guia)"
chk "/guia Location"          "$B/blog" "$(loc /guia)"
chk "/guia hops"              1   "$(hops /guia)"
chk "/guia final status"      200 "$(final /guia)"

echo "== T2: locale arm — /en/guia 301s to /en/blog (relocale, not /blog) =="
chk "/en/guia status"         301 "$(code /en/guia)"
chk "/en/guia Location"       "$B/en/blog" "$(loc /en/guia)"
chk "/en/guia hops"           1   "$(hops /en/guia)"
chk "/en/guia final status"   200 "$(final /en/guia)"

echo "== T2: the redirect target is terminal, and articles are untouched =="
chk "/blog is 200 not a redirect"    200 "$(code /blog)"
chk "/en/blog is 200 not a redirect" 200 "$(code /en/blog)"
if [ -n "$S" ]; then
  chk "/guia/$S still 200"           200 "$(code "/guia/$S")"
else
  echo "  SKIP  /guia/<slug> arm (set S=<published-slug> to enable)"
fi
# Rule 2c must match the bare segment ONLY. If it ever widened to a prefix
# match it would swallow every article URL into /blog — a silent content wipe.
chk_ne "/guia/<any> is not swallowed by Rule 2c" 301 "$(code /guia/__no_such_article__)"

echo "== T1: /blog is in the sitemap, exactly once, in child 0 =="
curl -s "$B/sitemap/0.xml" > /tmp/forge_c0.xml
total=$(grep -c '<loc>' /tmp/forge_c0.xml)
echo "  INFO  child 0 total = $total"
chk "/blog in child 0 exactly once" 1 "$(grep -c "<loc>$SITE/blog</loc>" /tmp/forge_c0.xml)"

# Child 0 must stay under the hard 20,000 cap. This is the standing constraint
# for the unchunked aggregation band, not a nicety.
if [ "$total" -lt 20000 ]; then
  pass=$((pass+1)); echo "  PASS  child 0 under CHILD_SITEMAP_SIZE: $total < 20000"
else
  fail=$((fail+1)); echo "  FAIL  child 0 at/over cap: $total >= 20000"
fi

echo "== T1: the redirect is NOT advertised — redirects don't belong in sitemaps =="
chk "bare /guia absent from child 0"  0 "$(grep -c "<loc>$SITE/guia</loc>" /tmp/forge_c0.xml)"
# /guia/<slug> articles must still be listed; adding /blog must not have
# displaced them.
arts=$(grep -c "<loc>$SITE/guia/" /tmp/forge_c0.xml)
echo "  INFO  /guia/<slug> articles in child 0 = $arts"
chk_ne "guia articles still listed" 0 "$arts"

echo
echo "pass=$pass fail=$fail"
[ "$fail" -eq 0 ] || exit 1
