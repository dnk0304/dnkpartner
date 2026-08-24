-- url-v3 STREET-TYPE full-word measurement / re-verification (Phase 1, 2026-08-24).
--
-- Read-only. Reproduces the Phase-1 measurement and is the re-verification tool
-- AFTER the re-mint (the abbreviated-leading count must fall to ~0, minus the
-- deliberately-unexpanded ambiguous codes pj/pa/pd).
--
-- Run (prod, read-only):
--   docker exec <pg-container> psql -U dnksubastas -d dnksubastas -f url-v3-street-fullword-measure.sql
-- or paste block-by-block.

-- (1) Affected rows by leading via-type code (UNAMBIGUOUS + AMBIGUOUS sets).
--     The alternation is the exact set from src/lib/seo/street-type-expand.ts.
SELECT split_part(descriptor, '-', 1) AS lead_code,
       count(*) AS rows
  FROM auction_url_v3
 WHERE descriptor ~ '^(avda|avd|ctra|cami|cno|urb|c|cl|av|pz|ps|cr|cm|tr|rd|rb|gl|ur|lg|pg|bo|ed|pj|pa|pd|ds|tn|no)(-|$)'
 GROUP BY 1
 ORDER BY rows DESC;

-- (2) Total affected (should be ~83,306 pre-remint; ~3,298 post-remint = the
--     ambiguous pj/pa/pd rows deliberately left unexpanded).
SELECT count(*) AS affected_total
  FROM auction_url_v3
 WHERE descriptor ~ '^(avda|avd|ctra|cami|cno|urb|c|cl|av|pz|ps|cr|cm|tr|rd|rb|gl|ur|lg|pg|bo|ed)(-|$)';

-- (3) Status split of the affected set (drives scope: 3a re-mints ALL statuses).
SELECT a.status, count(*) AS rows
  FROM auction_url_v3 v
  JOIN "Auction" a ON a.id = v.auction_id
 WHERE v.descriptor ~ '^(avda|avd|ctra|cami|cno|urb|c|cl|av|pz|ps|cr|cm|tr|rd|rb|gl|ur|lg|pg|bo|ed)(-|$)'
 GROUP BY a.status
 ORDER BY rows DESC;

-- (4) Length headroom: longest CURRENT url in the affected set + a rough
--     post-expansion estimate (adds up to (len(full)-len(code)) chars).
--     The 200-char CHECK is structural; Phase-1 measured post-expansion max 186.
SELECT max(length(url)) AS max_current_url_len
  FROM auction_url_v3
 WHERE descriptor ~ '^(avda|avd|ctra|cami|cno|urb|c|cl|av|pz|ps|cr|cm|tr|rd|rb|gl|ur|lg|pg|bo|ed)(-|$)';

-- (5) Collision safety proof: ref_tail is 100% unique, so expanded urls are
--     unique by construction. Both numbers must be equal.
SELECT count(*) AS total_rows, count(DISTINCT ref_tail) AS distinct_ref_tail
  FROM auction_url_v3;

-- (6) Post-remint alias/backup reconciliation (run AFTER --apply):
--     alias rows written should equal the number of urls that actually changed.
-- SELECT count(*) AS alias_rows FROM auction_url_v3_alias;
-- SELECT count(*) AS backup_rows FROM auction_url_v3_bak_20260824;
