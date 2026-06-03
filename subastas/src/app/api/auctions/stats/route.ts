import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import {
  ACTIVE_DB_STATUSES,
  LIVE_NOW_DB_STATUSES,
  PRE_AUCTION_DB_STATUSES,
  ACTIVE_CLOCK_GUARD_SQL,
} from '@/lib/auction-status';

interface AuctionStatsRow {
  totalAuctions: number;
  oldestAuctionYear: number | null;
  lastUpdateTime: string | null;
  activeCount: number;
  activeProperties: number;
  activeVehicles: number;
  preAuctionCount: number;
}

interface TrueActiveRow {
  trueActiveCount: number;
  trueLiveCount: number;
  trueUpcomingCount: number;
}

// Re-export the canonical sets locally as mutable arrays for the legacy
// province-filtered block below (it builds raw-SQL `?` placeholders by length).
// Values are identical to the lib's `as const` tuples — no semantic change.
const ACTIVE_STATUSES = [...ACTIVE_DB_STATUSES];
const PRE_AUCTION_STATUSES = [...PRE_AUCTION_DB_STATUSES];

const PROPERTY_CATEGORIES = [
  'Viviendas',
  'Locales',
  'Garajes',
  'Trasteros',
  'Terrenos',
  'Fincas rústicas',
  'Naves industriales',
  'Otros inmuebles',
];
const VEHICLE_CATEGORIES = ['Turismos', 'Motocicletas', 'Vehículos Industriales', 'Barcos'];

// The shared province-validity predicate. Identical clause to
// /api/auctions/counts/route.ts (lines 71-73) and the list route. Kept inline
// here on purpose — until auction-status.ts exports a PROVINCE_VALID_SQL const,
// this is the canonical text every active-counting surface uses verbatim.
const PROVINCE_VALID_SQL = `province IS NOT NULL
  AND LOWER(province) NOT IN ('unknown', 'desconocida', 'mapa de la zona', 'mapa del municipio', 'null', 'undefined')
  AND LENGTH(TRIM(province)) > 1`;

export async function GET() {
  try {
    // Province-filtered stats (legacy, used for property/vehicle category breakdowns).
    const sql = `
      SELECT
        COUNT(*) AS totalAuctions,
        MIN(CAST(strftime('%Y', publishedAt) AS INTEGER)) AS oldestAuctionYear,
        MAX(COALESCE(updatedAt, createdAt, publishedAt)) AS lastUpdateTime,
        SUM(CASE WHEN status IN (${ACTIVE_STATUSES.map(() => '?').join(',')}) THEN 1 ELSE 0 END) AS activeCount,
        SUM(CASE
          WHEN status IN (${ACTIVE_STATUSES.map(() => '?').join(',')})
            AND category IN (${PROPERTY_CATEGORIES.map(() => '?').join(',')})
          THEN 1 ELSE 0
        END) AS activeProperties,
        SUM(CASE
          WHEN status IN (${ACTIVE_STATUSES.map(() => '?').join(',')})
            AND category IN (${VEHICLE_CATEGORIES.map(() => '?').join(',')})
          THEN 1 ELSE 0
        END) AS activeVehicles,
        SUM(CASE WHEN status IN (${PRE_AUCTION_STATUSES.map(() => '?').join(',')}) THEN 1 ELSE 0 END) AS preAuctionCount
      FROM Auction
      WHERE ${PROVINCE_VALID_SQL}
    `;

    const params = [
      ...ACTIVE_STATUSES,
      ...ACTIVE_STATUSES,
      ...PROPERTY_CATEGORIES,
      ...ACTIVE_STATUSES,
      ...VEHICLE_CATEGORIES,
      ...PRE_AUCTION_STATUSES,
    ];

    const raw = await queryOne<AuctionStatsRow>(sql, params);

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

    const [trueActiveRow, trueLiveRow, trueUpcomingRow] = await Promise.all([
      queryOne<{ count: number }>(trueActiveSql, [...ACTIVE_DB_STATUSES]),
      queryOne<{ count: number }>(trueLiveSql, [...LIVE_NOW_DB_STATUSES]),
      queryOne<{ count: number }>(trueUpcomingSql, [...PRE_AUCTION_DB_STATUSES]),
    ]);

    const trueRaw: TrueActiveRow = {
      trueActiveCount: Number(trueActiveRow?.count ?? 0),
      trueLiveCount: Number(trueLiveRow?.count ?? 0),
      trueUpcomingCount: Number(trueUpcomingRow?.count ?? 0),
    };

    const stats = {
      totalAuctions: Number(raw?.totalAuctions || 0),
      oldestAuctionYear: raw?.oldestAuctionYear || null,
      lastUpdateTime: raw?.lastUpdateTime || null,
      activeCount: Number(raw?.activeCount || 0),
      activeProperties: Number(raw?.activeProperties || 0),
      activeVehicles: Number(raw?.activeVehicles || 0),
      preAuctionCount: Number(raw?.preAuctionCount || 0),
      // True active counts — unified with the rest of the site (wave35).
      trueActiveCount: trueRaw.trueActiveCount,
      trueLiveCount: trueRaw.trueLiveCount,
      trueUpcomingCount: trueRaw.trueUpcomingCount,
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
