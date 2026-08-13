#!/usr/bin/env bash
# verify-v4-redirects — the P2 release gate (Forge, 2026-08-13).
#
# Ken's §4: measured, not asserted. Four things are proved here, in BOTH switch
# states, against a real `next start` and the P2 fixture:
#
#   1. CHAIN LENGTH — every retired archive URL reaches its destination in
#      exactly ONE hop. `curl -w %{num_redirects}` is the measurement; anything
#      above 1 is a defect, not a rounding error.
#   2. ZERO LOOPS — flag on and flag off. A loop shows up as num_redirects
#      hitting the cap with a non-2xx final code, so it cannot pass silently.
#   3. ZERO 404s among URLs that answered 200 before. This is the gate: the dark
#      pass records the status of every URL in the table, the lit pass replays
#      the same table, and a 200 that became a 404 fails the run.
#   4. ATOMICITY (Ken blocker §4b.2) — the new shapes' `noindex` must lift in the
#      SAME switch flip that starts the 301s. Both are read from
#      `isUrlV4SwitchOn()`, and this script proves it from the outside: dark =
#      (old 200, new noindex, no redirects); lit = (old 301, new index,follow).
#      Either half alone is the failure mode — noindex targets, or two indexable
#      copies of the same list.
#
# Plus the outcome-parity proof (Ken blocker §4b.1): while DARK both URL shapes
# serve 200, so the two lists can be diffed row for row. That comparison is only
# possible in this window, which is exactly why it lives here.
#
# USAGE — run the whole thing twice, once per switch state:
#   createdb subastas_v4_p2_forge && npx prisma db push
#   npx tsx scripts/forge-v4-p2-fixture.ts
#   npx next build --webpack
#   PORT=3988 npx next start -p 3988                 # URL_V4_SWITCH unset
#   B=http://localhost:3988 MODE=dark bash scripts/verify-v4-redirects.sh
#   URL_V4_SWITCH=1 PORT=3988 npx next start -p 3988
#   B=http://localhost:3988 MODE=lit  bash scripts/verify-v4-redirects.sh
#
# ⚠️ The switch is read at CALL time but `next start` caches route output, so use
# a fresh process per state rather than trusting an env change under a warm one.

set -u
B="${B:-http://localhost:3988}"
MODE="${MODE:-dark}"
STATE_FILE="${STATE_FILE:-/tmp/v4-p2-dark-codes.txt}"

pass=0; fail=0
ck(){ if [ "$2" = "$3" ]; then echo "  ok   $1 ($3)"; pass=$((pass+1)); else echo "  FAIL $1: expected $3 got $2"; fail=$((fail+1)); fi }
note(){ echo "  --   $1"; }
# status of the FIRST response only (no follow) — a redirect must read as one.
code(){ curl -s -o /dev/null -w "%{http_code}" "$B$1"; }
# Location header of the first response, path only.
loc(){ curl -s -o /dev/null -D - "$B$1" | tr -d '\r' | awk 'tolower($1)=="location:"{print $2}' | head -1 | sed "s|^$B||"; }
# hops + final status after following: "N CODE"
hops(){ curl -s -o /dev/null -L --max-redirs 10 -w "%{num_redirects} %{http_code}" "$B$1"; }
body(){ curl -sL "$B$1"; }
has(){ if body "$1" | grep -qF -- "$2"; then echo "  ok   $3"; pass=$((pass+1)); else echo "  FAIL $3 (missing: $2)"; fail=$((fail+1)); fi }
hasnt(){ if body "$1" | grep -qF -- "$2"; then echo "  FAIL $3 (present: $2)"; fail=$((fail+1)); else echo "  ok   $3"; pass=$((pass+1)); fi }
# The auction detail links of a page, IN RENDER ORDER. Restricted to the detail
# shape (`/subastas/subasta/...`) so province/nav chrome is not counted as rows,
# and deliberately NOT sorted: order is half of what parity means here.
rows(){ body "$1" | grep -o 'href="/subastas/subasta/[^"]*"'; }

# ---------------------------------------------------------------------------
# THE TABLE — every archive URL shape this wave retires or preserves.
#
# `pagina/11`+ on madrid and `pagina/20` on madrid/madrid are the overflow
# cases: the fixture's province holds 755 rows and its biggest town 700, so both
# exceed the 10-page cap and both ladder, which is the only way the partition
# descent is actually executed rather than merely compiled.
# ---------------------------------------------------------------------------
URLS="
/resultados/canceladas/madrid
/resultados/adjudicadas/madrid
/resultados/desiertas/valencia
/resultados/canceladas/sevilla
/resultados/adjudicadas/madrid/pagina/2
/resultados/canceladas/madrid/pagina/3
/resultados/madrid
/resultados/madrid/pagina/2
/resultados/madrid/pagina/10
/resultados/madrid/pagina/11
/resultados/madrid/pagina/25
/resultados/madrid/madrid
/resultados/madrid/madrid/pagina/2
/resultados/madrid/madrid/pagina/10
/resultados/madrid/madrid/pagina/20
/resultados/madrid/alcobendas
/resultados/barcelona
/resultados/barcelona/municipios
/resultados/barcelona/municipios/pagina/2
/resultados/madrid/municipios/pagina/2
/resultados/valencia
/resultados/sevilla
/resultados/malaga
"

echo "=== MODE=$MODE  B=$B ==="

if [ "$MODE" = "dark" ]; then
  # -------------------------------------------------------------------------
  # DARK — the whole point is that NOTHING has changed. Ken's ruling §3.5: "a
  # redirect appearing at this stage is a defect."
  # -------------------------------------------------------------------------
  echo "--- dark: every legacy URL serves, with ZERO redirects ---"
  : > "$STATE_FILE"
  for u in $URLS; do
    c=$(code "$u")
    echo "$u $c" >> "$STATE_FILE"
    case "$c" in
      200) pass=$((pass+1));;
      307) # pre-existing 307s (pagina/1, ≤60-town municipios index) are fine,
           # but a 301/308 is not: that is a P2 redirect leaking while dark.
           note "$u → 307 (pre-existing normalisation, allowed)"; pass=$((pass+1));;
      *)   echo "  FAIL $u served $c while dark (expected 200)"; fail=$((fail+1));;
    esac
  done

  echo "--- dark: the P1 regression this wave repairs ---"
  ck "municipios/pagina/2 still 200s (was 404 after P1)" "$(code /resultados/barcelona/municipios/pagina/2)" 200
  has /resultados/barcelona "/municipios/pagina/2" "province hub still links index page 2"

  echo "--- dark: no v4 redirect leaks ---"
  for u in /resultados/canceladas/madrid /resultados/madrid/pagina/25 /resultados/barcelona/municipios/pagina/2; do
    ck "no 308 on $u" "$(code "$u")" 200
  done

  echo "--- dark: v4 shapes exist but are noindex (atomicity, half 1) ---"
  has  /resultados/madrid/canceladas 'noindex' "v4 outcome facet is noindex while dark"
  has  /resultados/madrid/madrid/judicial 'noindex' "v4 tipo node is noindex while dark"
  hasnt /resultados/madrid 'href="/resultados/madrid/canceladas"' "hub does NOT link the v4 order while dark"

  echo "--- outcome parity (Ken blocker 4b.1): the two shapes list the SAME rows ---"
  nonempty=0
  for p in madrid barcelona valencia sevilla malaga; do
    for o in adjudicadas desiertas canceladas; do
      # The v4 facet may page DENSER (48 vs 24) once the province overflows, so
      # the lists are compared over the legacy page's length — same rows, same
      # order, from the top. A length difference is a page-size decision; a
      # membership difference is the filtering bug this exists to catch.
      a=$(rows "/resultados/$o/$p" | head -24)
      b=$(rows "/resultados/$p/$o" | head -24)
      n=$(echo "$a" | grep -c 'href=' || true)
      if [ "$a" != "$b" ]; then
        echo "  FAIL $p/$o list differs (legacy $n rows vs v4 $(echo "$b" | grep -c 'href=' || true))"; fail=$((fail+1))
      elif [ -z "$a" ]; then
        # Both empty. Agreement at zero proves nothing on its own, so these are
        # counted apart and the vacuity guard below is what makes the block mean
        # something. (barcelona and sevilla carry no canceladas by design —
        # sevilla's emptiness is itself a fixture requirement, for the
        # "301 must not land on a 404" fallback.)
        note "$p/$o both empty (vacuous — not counted as proof)"
      else
        echo "  ok   $p/$o identical list ($n rows)"; pass=$((pass+1)); nonempty=$((nonempty+1))
      fi
    done
  done
  # ⛔ VACUITY GUARD. Every comparison above would "pass" against an empty corpus.
  ck "parity proved on non-empty lists" "$([ "$nonempty" -ge 10 ] && echo ok || echo "only $nonempty")" ok

  echo "--- the reversal must not change the page's identity ---"
  # Comparing the two H1s against EACH OTHER, not against a literal: the singular
  # "Subastas cancelada" reads oddly, but it is the copy the legacy page already
  # ships, and a URL reversal is supposed to change the URL and nothing else.
  # Asserting a hand-written string here would have flagged pre-existing copy as
  # a P2 defect (it did, on the first run).
  h1(){ body "$1" | grep -o '<h1[^>]*>[^<]*</h1>' | head -1 | sed 's/<[^>]*>//g'; }
  for p in madrid valencia malaga; do
    for o in adjudicadas canceladas; do
      la=$(h1 "/resultados/$o/$p"); lb=$(h1 "/resultados/$p/$o")
      if [ -n "$la" ] && [ "$la" = "$lb" ]; then
        echo "  ok   $p/$o H1 unchanged by the reversal (\"$la\")"; pass=$((pass+1))
      else
        echo "  FAIL $p/$o H1 differs: legacy=\"$la\" v4=\"$lb\""; fail=$((fail+1))
      fi
    done
  done

else
  # -------------------------------------------------------------------------
  # LIT — the redirects fire, in one hop, and nothing that worked stops working.
  # -------------------------------------------------------------------------
  echo "--- lit: chain length and the zero-404 gate ---"
  if [ ! -s "$STATE_FILE" ]; then
    echo "  FAIL no dark baseline at $STATE_FILE — run MODE=dark first"; fail=$((fail+1))
  fi
  maxhops=0
  while read -r u prev; do
    [ -z "${u:-}" ] && continue
    read -r n final <<EOF
$(hops "$u")
EOF
    [ "$n" -gt "$maxhops" ] && maxhops=$n
    if [ "$n" -gt 1 ]; then
      echo "  FAIL $u took $n hops (max 1)"; fail=$((fail+1))
    else
      pass=$((pass+1))
    fi
    # The gate: a URL that answered 200 before must still resolve to 200.
    if [ "$prev" = "200" ] && [ "$final" != "200" ]; then
      echo "  FAIL $u was 200 while dark, now resolves $final"; fail=$((fail+1))
    else
      pass=$((pass+1))
    fi
  done < "$STATE_FILE"
  note "max chain length across the table: $maxhops"
  ck "max chain length" "$maxhops" 1

  echo "--- lit: the reversed outcome facet ---"
  ck "outcome/prov is a permanent redirect" "$(code /resultados/canceladas/madrid)" 308
  ck "…to the reversed shape"               "$(loc /resultados/canceladas/madrid)" /resultados/madrid/canceladas
  ck "…which answers 200"                   "$(code /resultados/madrid/canceladas)" 200
  ck "paginated facet keeps its page"       "$(loc /resultados/adjudicadas/madrid/pagina/2)" /resultados/madrid/adjudicadas/pagina/2
  echo "  -- empty facet must not 301 onto a 404 (sevilla has no canceladas)"
  ck "empty facet falls back to the province" "$(loc /resultados/canceladas/sevilla)" /resultados/sevilla

  echo "--- lit: the municipality index de-paginates ---"
  ck "municipios/pagina/2 → 308"            "$(code /resultados/barcelona/municipios/pagina/2)" 308
  ck "…to the bare index"                   "$(loc /resultados/barcelona/municipios/pagina/2)" /resultados/barcelona/municipios
  echo "  -- a ≤60-town province has NO index page: target the hub, or it is 301→307"
  ck "small province targets the hub"       "$(loc /resultados/madrid/municipios/pagina/2)" /resultados/madrid

  echo "--- lit: pagination past the cap → the PARTITION, never the root ---"
  ck "in-range page still serves"           "$(code /resultados/madrid/pagina/10)" 200
  ck "past the cap redirects"               "$(code /resultados/madrid/pagina/11)" 308
  t=$(loc /resultados/madrid/pagina/11)
  note "province overflow target: $t"
  ck "…is not the archive root"             "$([ "$t" = "/resultados" ] && echo root || echo ok)" ok
  ck "…is not another /pagina/ URL"         "$(echo "$t" | grep -q '/pagina/' && echo chain || echo ok)" ok
  ck "…answers 200"                         "$(code "$t")" 200
  ck "deep overflow redirects"              "$(code /resultados/madrid/pagina/25)" 308
  ck "town overflow redirects"              "$(code /resultados/madrid/madrid/pagina/20)" 308
  t2=$(loc /resultados/madrid/madrid/pagina/20)
  note "town overflow target: $t2"
  ck "…answers 200"                         "$(code "$t2")" 200
  ck "…stays under the town"                "$(echo "$t2" | grep -q '^/resultados/madrid/madrid' && echo ok || echo escaped)" ok

  echo "--- lit: no redirect targets its own source pattern (loop guard) ---"
  for u in /resultados/canceladas/madrid /resultados/madrid/pagina/11 /resultados/barcelona/municipios/pagina/2; do
    read -r n final <<EOF
$(hops "$u")
EOF
    ck "$u settles at 200 in $n hop(s)" "$final" 200
  done

  echo "--- lit: noindex lifts in the SAME flip (atomicity, half 2) ---"
  has  /resultados/madrid/canceladas 'index,follow' "v4 facet is indexable once lit"
  hasnt /resultados/madrid/canceladas 'noindex' "v4 facet is no longer noindex"
  has  /resultados/madrid/madrid/judicial 'index,follow' "v4 tipo node is indexable once lit"
  has  /resultados/madrid 'href="/resultados/madrid/canceladas"' "hub links the v4 order once lit"
  hasnt /resultados/madrid 'href="/resultados/canceladas/madrid"' "hub no longer links the retired order"
  hasnt /resultados/barcelona "/municipios/pagina/2" "hub no longer links the retired index pages"
fi

echo ""
echo "PASS=$pass FAIL=$fail"
[ "$fail" -eq 0 ] || exit 1
