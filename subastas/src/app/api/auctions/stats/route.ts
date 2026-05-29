import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';

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

const ACTIVE_STATUSES = ['ACTIVE', 'CELEBRANDOSE', 'SUSPENDED', 'SUSPENDIDA'];
const PRE_AUCTION_STATUSES = ['PRE_AUCTION', 'PROXIMA_APERTURA'];
// "True active" = genuinely-live auctions only (CELEBRANDOSE + PROXIMA_APERTURA),
// counted across ALL rows regardless of province completeness. SUSPENDIDA is
// excluded — those auctions are not currently open to bidders.
const TRUE_LIVE_STATUSES = ['CELEBRANDOSE', 'ACTIVE'];
const TRUE_UPCOMING_STATUSES = ['PROXIMA_APERTURA', 'PRE_AUCTION'];

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
      WHERE province IS NOT NULL
        AND LOWER(province) NOT IN ('unknown', 'desconocida', 'mapa de la zona', 'mapa del municipio', 'null', 'undefined')
        AND LENGTH(TRIM(province)) > 1
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

    // True active counts — NO province filter. This is the number we display
    // as "Subastas activas ahora" on the homepage. Matches BOE ground truth
    // (~1,202-1,700). The province-filtered activeCount above understates by
    // ~50% because of the scraper province=Unknown gap (Wave 2 fix).
    const trueSql = `
      SELECT
        SUM(CASE WHEN status IN (${TRUE_LIVE_STATUSES.map(() => '?').join(',')}) THEN 1 ELSE 0 END) AS trueLiveCount,
        SUM(CASE WHEN status IN (${TRUE_UPCOMING_STATUSES.map(() => '?').join(',')}) THEN 1 ELSE 0 END) AS trueUpcomingCount,
        SUM(CASE WHEN status IN (${[...TRUE_LIVE_STATUSES, ...TRUE_UPCOMING_STATUSES].map(() => '?').join(',')}) THEN 1 ELSE 0 END) AS trueActiveCount
      FROM Auction
    `;
    const trueParams = [
      ...TRUE_LIVE_STATUSES,
      ...TRUE_UPCOMING_STATUSES,
      ...TRUE_LIVE_STATUSES,
      ...TRUE_UPCOMING_STATUSES,
    ];
    const trueRaw = await queryOne<TrueActiveRow>(trueSql, trueParams);

    const stats = {
      totalAuctions: Number(raw?.totalAuctions || 0),
      oldestAuctionYear: raw?.oldestAuctionYear || null,
      lastUpdateTime: raw?.lastUpdateTime || null,
      activeCount: Number(raw?.activeCount || 0),
      activeProperties: Number(raw?.activeProperties || 0),
      activeVehicles: Number(raw?.activeVehicles || 0),
      preAuctionCount: Number(raw?.preAuctionCount || 0),
      // True active counts (no province filter) — headline metric.
      trueActiveCount: Number(trueRaw?.trueActiveCount || 0),
      trueLiveCount: Number(trueRaw?.trueLiveCount || 0),
      trueUpcomingCount: Number(trueRaw?.trueUpcomingCount || 0),
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
