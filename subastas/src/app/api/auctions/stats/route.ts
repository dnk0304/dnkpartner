import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import {
  ACTIVE_DB_STATUSES,
  LIVE_NOW_DB_STATUSES,
  PRE_AUCTION_DB_STATUSES,
  ACTIVE_CLOCK_GUARD_SQL,
  IN_SCOPE_GUARD_SQL,
} from '@/lib/auction-status';

interface AuctionStatsRow {
  totalAuctions: number;
  oldestAuctionYear: number | null;
  lastUpdateTime: string | null;
  preAuctionCount: number;
}

interface TotalTrackedAllRow {
  totalTrackedAll: number;
}

interface ActiveSplitRow {
  activeTotal: number;
  activeProperties: number;
  activeVehicles: number;
}

interface TrueActiveRow {
  trueActiveCount: number;
  trueLiveCount: number;
  trueUpcomingCount: number;
}

// First day of the current month (UTC, ISO 8601). Used by the legacy
// `newThisMonthCount` field — preserved so existing consumers don't break,
// but the hero now reads `newLast30DaysCount` (rolling 30d) so the chip
// never resets to ~0 at month boundaries.
function firstOfMonthIsoUtc(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return new Date(Date.UTC(y, m, 1, 0, 0, 0, 0)).toISOString();
}

// Anchor for the rolling-30-day "Nuevas" chip. Today minus 30 days, UTC,
// ISO 8601. Computed once per request handler invocation. Counts rows whose
// `createdAt` (ingestion timestamp — the date OUR catalog learned about the
// auction) lands on/after this anchor. Using createdAt rather than
// publishedAt guarantees a non-zero number even when the BOE publish date
// field lags or clusters: this measures freshness of OUR ingestion, which
// is what the hero claim ("nuevas en los últimos 30 días") promises.
function thirtyDaysAgoIsoUtc(now: Date = new Date()): string {
  const ms = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString();
}

// Re-export the canonical sets locally as mutable arrays for the legacy
// province-filtered block below (it builds raw-SQL `?` placeholders by length).
// Values are identical to the lib's `as const` tuples — no semantic change.
const ACTIVE_STATUSES = [...ACTIVE_DB_STATUSES];
const PRE_AUCTION_STATUSES = [...PRE_AUCTION_DB_STATUSES];

// Real-estate / immovable. All BOE property family labels (some not currently
// active but kept so a row that flips active later is classified correctly).
// 'Oficinas' is a BOE property label with 0 active rows today (finished-only) —
// kept for forward-safety so it lands in the property bucket if it ever flips.
const PROPERTY_CATEGORIES = [
  'Viviendas',
  'Locales',
  'Garajes',
  'Trasteros',
  'Terrenos',
  'Fincas rústicas',
  'Naves industriales',
  'Otros inmuebles',
  'Oficinas',
];

// Vehicles / movables. The previous set was MISSING 'Camiones' (6 active rows)
// and included two dead labels ('Vehículos Industriales', 'Barcos' = 0 active).
// Dead labels are harmless — kept in the set so they classify correctly if they
// ever go active. 'Embarcaciones' added for the same forward-safety reason.
// Live (2026-06-03): Turismos=31, Camiones=6, Motocicletas=3 → 40 active.
const VEHICLE_CATEGORIES = [
  'Turismos',
  'Motocicletas',
  'Camiones',
  'Barcos',
  'Embarcaciones',
  'Vehículos Industriales',
];

// The shared province-validity predicate. Identical clause to
// /api/auctions/counts/route.ts (lines 71-73) and the list route. Kept inline
// here on purpose — until auction-status.ts exports a PROVINCE_VALID_SQL const,
// this is the canonical text every active-counting surface uses verbatim.
// wave155: fold the scope soft-hide gate into the shared province-valid
// predicate so EVERY province-valid stats query (totalAuctions, active splits,
// preAuction, new-this-month/30d) reconciles with the now-scoped catalog in one
// place. `totalTrackedAll` (the raw "ever tracked" grand total) deliberately
// does NOT use this const, so it stays ungated (honest all-rows number).
const PROVINCE_VALID_SQL = `${IN_SCOPE_GUARD_SQL}
  AND province IS NOT NULL
  AND LOWER(province) NOT IN ('unknown', 'desconocida', 'mapa de la zona', 'mapa del municipio', 'null', 'undefined')
  AND LENGTH(TRIM(province)) > 1`;

export async function GET() {
  try {
    // Catalog-wide stats. totalAuctions / oldestAuctionYear / lastUpdateTime
    // describe the whole indexed catalog (no status filter). preAuctionCount
    // uses the canonical PRE_AUCTION set. activeCount and the property/vehicle
    // splits live in a SEPARATE clock-guarded query below so they always
    // reconcile to trueActiveCount.
    const sql = `
      SELECT
        COUNT(*) AS totalAuctions,
        MIN(CAST(strftime('%Y', publishedAt) AS INTEGER)) AS oldestAuctionYear,
        MAX(COALESCE(updatedAt, createdAt, publishedAt)) AS lastUpdateTime,
        SUM(CASE WHEN status IN (${PRE_AUCTION_STATUSES.map(() => '?').join(',')}) THEN 1 ELSE 0 END) AS preAuctionCount
      FROM Auction
      WHERE ${PROVINCE_VALID_SQL}
    `;

    const params = [...PRE_AUCTION_STATUSES];

    const raw = await queryOne<AuctionStatsRow>(sql, params);

    // Canonical active split — uses the SAME predicate as trueActiveCount
    // below (ACTIVE_DB_STATUSES + ACTIVE_CLOCK_GUARD_SQL + province valid).
    // Guarantees activeProperties + activeVehicles + activeOtros === activeTotal
    // === trueActiveCount (541 on 2026-06-03), every time.
    const activeSplitSql = `
      SELECT
        COUNT(*) AS activeTotal,
        SUM(CASE WHEN category IN (${PROPERTY_CATEGORIES.map(() => '?').join(',')}) THEN 1 ELSE 0 END) AS activeProperties,
        SUM(CASE WHEN category IN (${VEHICLE_CATEGORIES.map(() => '?').join(',')}) THEN 1 ELSE 0 END) AS activeVehicles
      FROM Auction
      WHERE status IN (${ACTIVE_STATUSES.map(() => '?').join(',')})
        AND ${ACTIVE_CLOCK_GUARD_SQL}
        AND ${PROVINCE_VALID_SQL}
    `;

    const activeSplitParams = [
      ...PROPERTY_CATEGORIES,
      ...VEHICLE_CATEGORIES,
      ...ACTIVE_STATUSES,
    ];

    const activeSplitRaw = await queryOne<ActiveSplitRow>(activeSplitSql, activeSplitParams);

    // Headline "true*" counts — these feed the homepage hero strip
    // (HomeObservatory). Wave35 (2026-06-03): wired to the unified canonical
    // predicates from src/lib/auction-status.ts so this surface stops drifting
    // away from /api/auctions, /api/auctions/counts, /api/auctions/map and
    // /api/auctions/recent. All three "true*" counts now use:
    //   - canonical status sets from the lib (ACTIVE / LIVE_NOW / PRE_AUCTION)
    //   - the SAME province WHERE the other surfaces use
    //   - the canonical clock guard (active + live only — pre-auction doesn't
    //     have a "has it ended" question relevant to set membership)
    //
    // Distinct metrics on purpose:
    //   - trueActiveCount  ("activas en total") = canonical ACTIVE — matches
    //     /api/auctions totalCount and /api/auctions/counts active SUM (~541).
    //   - trueLiveCount    ("celebrándose")     = LIVE_NOW subset (ACTIVE/
    //     CELEBRANDOSE only — SUSPENDIDA excluded) — happening right now (~443).
    //   - trueUpcomingCount("próximas")         = PRE_AUCTION_DB_STATUSES.
    const trueActiveSql = `
      SELECT COUNT(*) AS count
      FROM Auction
      WHERE status IN (${ACTIVE_DB_STATUSES.map(() => '?').join(',')})
        AND ${ACTIVE_CLOCK_GUARD_SQL}
        AND ${PROVINCE_VALID_SQL}
    `;
    const trueLiveSql = `
      SELECT COUNT(*) AS count
      FROM Auction
      WHERE status IN (${LIVE_NOW_DB_STATUSES.map(() => '?').join(',')})
        AND ${ACTIVE_CLOCK_GUARD_SQL}
        AND ${PROVINCE_VALID_SQL}
    `;
    const trueUpcomingSql = `
      SELECT COUNT(*) AS count
      FROM Auction
      WHERE status IN (${PRE_AUCTION_DB_STATUSES.map(() => '?').join(',')})
        AND ${PROVINCE_VALID_SQL}
    `;

    // "Nuevas este mes" — legacy field, calendar-month anchored. Preserved
    // for back-compat with any existing consumer. The HERO now reads
    // `newLast30DaysCount` instead (rolling window — never resets to 0).
    const newThisMonthSql = `
      SELECT COUNT(*) AS count
      FROM Auction
      WHERE publishedAt >= ?
        AND ${PROVINCE_VALID_SQL}
    `;
    const monthAnchor = firstOfMonthIsoUtc();

    // "Nuevas (últimos 30 días)" — rolling 30-day window keyed on
    // `createdAt` (when OUR catalog ingested the row). Province-filtered
    // for consistency with the rest of the catalog so it reconciles with
    // `totalAuctions` (the cleanly-categorized total). This is the field
    // the landing hero "Nuevas" chip should consume.
    const newLast30DaysSql = `
      SELECT COUNT(*) AS count
      FROM Auction
      WHERE createdAt >= ?
        AND ${PROVINCE_VALID_SQL}
    `;
    const thirtyDayAnchor = thirtyDaysAgoIsoUtc();

    // Raw grand total — COUNT(*) over the entire Auction table with NO
    // province or status filter. This is the honest "auctions we've ever
    // tracked" number (~235767 on 2026-06-04), distinct from `totalAuctions`
    // which is the cleanly-categorized province-valid subset (~198753).
    // Landing hero "Rastreadas" chip consumes this field.
    const totalTrackedAllSql = `SELECT COUNT(*) AS totalTrackedAll FROM Auction`;

    const [trueActiveRow, trueLiveRow, trueUpcomingRow, newThisMonthRow, newLast30DaysRow, totalTrackedAllRaw] = await Promise.all([
      queryOne<{ count: number }>(trueActiveSql, [...ACTIVE_DB_STATUSES]),
      queryOne<{ count: number }>(trueLiveSql, [...LIVE_NOW_DB_STATUSES]),
      queryOne<{ count: number }>(trueUpcomingSql, [...PRE_AUCTION_DB_STATUSES]),
      queryOne<{ count: number }>(newThisMonthSql, [monthAnchor]),
      queryOne<{ count: number }>(newLast30DaysSql, [thirtyDayAnchor]),
      queryOne<TotalTrackedAllRow>(totalTrackedAllSql, []),
    ]);

    const trueRaw: TrueActiveRow = {
      trueActiveCount: Number(trueActiveRow?.count ?? 0),
      trueLiveCount: Number(trueLiveRow?.count ?? 0),
      trueUpcomingCount: Number(trueUpcomingRow?.count ?? 0),
    };

    // Reconcile the active split. activeOtros is the leftover so that
    // activeProperties + activeVehicles + activeOtros === activeCount, always.
    // Today (2026-06-03): 501 + 40 + 0 = 541. If a category like
    // 'Arte y antigüedades' / 'Joyas' / 'Maquinaria' / 'Derechos de crédito'
    // goes active later, activeOtros catches it instead of silently dropping
    // those rows out of the split.
    const activeTotal = Number(activeSplitRaw?.activeTotal || 0);
    const activeProperties = Number(activeSplitRaw?.activeProperties || 0);
    const activeVehicles = Number(activeSplitRaw?.activeVehicles || 0);
    const activeOtros = Math.max(0, activeTotal - activeProperties - activeVehicles);

    const stats = {
      totalAuctions: Number(raw?.totalAuctions || 0),
      oldestAuctionYear: raw?.oldestAuctionYear || null,
      lastUpdateTime: raw?.lastUpdateTime || null,
      activeCount: activeTotal,
      activeProperties,
      activeVehicles,
      activeOtros,
      preAuctionCount: Number(raw?.preAuctionCount || 0),
      // True active counts — unified with the rest of the site (wave35).
      trueActiveCount: trueRaw.trueActiveCount,
      trueLiveCount: trueRaw.trueLiveCount,
      trueUpcomingCount: trueRaw.trueUpcomingCount,
      // Legacy hero chip — auctions whose publishedAt landed on/after the
      // first of the current month (UTC). PRESERVED for back-compat; hero
      // now reads `newLast30DaysCount` so the chip never resets to 0 at a
      // month boundary.
      newThisMonthCount: Number(newThisMonthRow?.count ?? 0),
      // P3 hero chip (rolling) — auctions WE ingested in the last 30 days.
      // Always-fresh number for the "Nuevas" stat card.
      newLast30DaysCount: Number(newLast30DaysRow?.count ?? 0),
      // Raw grand total — COUNT(*) over Auction with NO filters. The honest
      // "auctions we've ever tracked" number for the hero "Rastreadas" chip.
      totalTrackedAll: Number(totalTrackedAllRaw?.totalTrackedAll || 0),
    };

    return NextResponse.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error fetching auction stats:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch auction stats' },
      { status: 500 }
    );
  }
}
