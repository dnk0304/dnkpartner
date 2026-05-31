-- Forge 2026-05-31 — NULL-rate diagnostic for the info-rich card field set.
-- Run inside the dnksubastas-app container:
--   docker exec -i dnksubastas-postgres psql "$DATABASE_URL" < diagnose-card-fields.sql
-- (or psql any way you reach the live db). Read-only — safe on prod.
--
-- Produces:
--   (a) history-table coverage (proves whether feed-starvation is the
--       reason cards lost their titles)
--   (b) per-field NULL-rate across ACTIVE+UPCOMING auctions for every card
--       field the new feed/detail surface exposes
--   (c) province-junk count (CP/postal/numeric values currently in DB)

\echo '=== A) Wave-1 history table coverage ==='
SELECT
  (SELECT COUNT(*) FROM "AuctionStatusHistory")               AS status_history_rows,
  (SELECT COUNT(DISTINCT "auctionId") FROM "AuctionStatusHistory") AS status_distinct_auctions,
  (SELECT COUNT(*) FROM "AuctionBidHistory")                  AS bid_history_rows,
  (SELECT COUNT(DISTINCT "auctionId") FROM "AuctionBidHistory")    AS bid_distinct_auctions,
  (SELECT COUNT(*) FROM "Auction" WHERE status IN
    ('CELEBRANDOSE','ACTIVE','PROXIMA_APERTURA','PRE_AUCTION','SUSPENDIDA','SUSPENDED')) AS active_or_upcoming_auctions;

\echo
\echo '=== B) Per-field NULL-rate on active/upcoming auctions ==='
WITH base AS (
  SELECT * FROM "Auction"
  WHERE status IN ('CELEBRANDOSE','ACTIVE','PROXIMA_APERTURA','PRE_AUCTION','SUSPENDIDA','SUSPENDED')
), total AS (
  SELECT COUNT(*)::numeric AS n FROM base
)
SELECT
  field,
  null_rows,
  ROUND(null_rows::numeric * 100.0 / NULLIF((SELECT n FROM total), 0), 1) AS pct_null
FROM (
  -- PRIORITY 3 (locked by Dennis)
  SELECT 'appraisalValue (tasación) [PRI]' AS field, SUM((appraisalValue IS NULL OR appraisalValue = 0)::int) AS null_rows FROM base
  UNION ALL SELECT 'endsAt (days-left)    [PRI]', SUM(("endsAt" IS NULL)::int) FROM base
  UNION ALL SELECT 'minimumBid (puja mín) [PRI]', SUM(("minimumBid" IS NULL)::int) FROM base
  -- SECONDARY card fields
  UNION ALL SELECT 'currentBid',          SUM(("currentBid" IS NULL)::int) FROM base
  UNION ALL SELECT 'depositAmount',       SUM(("depositAmount" IS NULL)::int) FROM base
  UNION ALL SELECT 'endDateTime',         SUM(("endDateTime" IS NULL)::int) FROM base
  UNION ALL SELECT 'address',             SUM(("address" IS NULL)::int) FROM base
  UNION ALL SELECT 'municipality',        SUM(("municipality" IS NULL)::int) FROM base
  UNION ALL SELECT 'propertyType',        SUM(("propertyType" IS NULL)::int) FROM base
  UNION ALL SELECT 'auctionType',         SUM(("auctionType" IS NULL)::int) FROM base
  UNION ALL SELECT 'lotNumber',           SUM(("lotNumber" IS NULL)::int) FROM base
  UNION ALL SELECT 'imageUrl (real photo)',
    SUM(("imageUrl" IS NULL
         OR NOT ("imageUrl" LIKE '/api/auction-image/%' OR "imageUrl" LIKE '/streetview/%'))::int) FROM base
  UNION ALL SELECT 'boeLink (official)',  SUM(("boeLink" IS NULL)::int) FROM base
  UNION ALL SELECT 'latitude/longitude',  SUM((latitude IS NULL OR longitude IS NULL)::int) FROM base
) q
ORDER BY null_rows DESC;

\echo
\echo '=== C) Province junk (CP / postal / numeric / non-canonical) ==='
SELECT
  province,
  COUNT(*) AS rows
FROM "Auction"
WHERE province IS NOT NULL
  AND status IN ('CELEBRANDOSE','ACTIVE','PROXIMA_APERTURA','PRE_AUCTION','SUSPENDIDA','SUSPENDED')
  AND (
       province ~ '^\d+$'
    OR LOWER(province) ~ '^cp[\s\-]*\d'
    OR LOWER(province) ~ '^codigo\s*postal'
    OR LENGTH(TRIM(province)) <= 1
  )
GROUP BY province
ORDER BY rows DESC
LIMIT 50;

\echo
\echo '=== C2) Distinct province values seen (sanity check vs 52-province whitelist) ==='
SELECT province, COUNT(*) AS rows
FROM "Auction"
WHERE province IS NOT NULL
  AND status IN ('CELEBRANDOSE','ACTIVE','PROXIMA_APERTURA','PRE_AUCTION','SUSPENDIDA','SUSPENDED')
GROUP BY province
ORDER BY rows DESC;
