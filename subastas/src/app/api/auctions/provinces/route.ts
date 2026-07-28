/**
 * GET /api/auctions/provinces
 *
 * Per-province available-auction counts for the /subastas province dropdown.
 *
 * Returns ONE row per real Spanish province (50 provincias + Ceuta + Melilla).
 * Postal-code junk that leaked into Auction.province during early scraper
 * passes ("CP 28013", numeric strings, "Unknown", etc.) is filtered server-
 * side and never reaches the UI. See `src/lib/spain-provinces.ts` for the
 * whitelist source of truth.
 *
 * "Available" = status IN (active + upcoming). Closed/cancelled/finalised
 * statuses are excluded so the dropdown reflects what a user can actually act on.
 *
 * Response:
 *   {
 *     success: true,
 *     data: [
 *       { province: "Madrid", label: "Madrid", count: 142 },
 *       { province: "Barcelona", label: "Barcelona", count: 98 },
 *       ...
 *     ],
 *     meta: {
 *       provinceCount: 52,         // canonical Spain provinces returned
 *       totalAvailable: 1234,      // sum of `count`
 *       junkRowsExcluded: number,  // DB rows whose province failed whitelist
 *     }
 *   }
 *
 * Query params:
 *   sort   — "count_desc" (default) | "label_asc"
 *   minimum_count — only return provinces with count >= n (default 0)
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { IN_SCOPE_GUARD_SQL } from '@/lib/auction-status';
import {
  SPAIN_PROVINCES,
  isCanonicalProvince,
  toCanonicalProvince,
} from '@/lib/spain-provinces';

export const dynamic = 'force-dynamic';

// "Available" = status visible to a user as still-actionable.
// Mirrors the list-route active+upcoming union.
const AVAILABLE_DB_STATUSES = [
  'CELEBRANDOSE',
  'ACTIVE',
  'PROXIMA_APERTURA',
  'PRE_AUCTION',
  'SUSPENDIDA',
  'SUSPENDED',
];

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  try {
    const url = new URL(req.url);
    const sort = url.searchParams.get('sort') === 'label_asc' ? 'label_asc' : 'count_desc';
    const minimumCountRaw = Number(url.searchParams.get('minimum_count') ?? 0);
    const minimumCount =
      Number.isFinite(minimumCountRaw) && minimumCountRaw >= 0 ? minimumCountRaw : 0;

    // One round trip: GROUP BY province across available statuses only.
    // Numeric/postal-code junk is filtered in JS against the canonical
    // whitelist so we don't need to enumerate every bad variant in SQL.
    const placeholders = AVAILABLE_DB_STATUSES.map(() => '?').join(',');
    const sql = `
      SELECT province, COUNT(*)::bigint AS count
      FROM "Auction"
      WHERE province IS NOT NULL
        AND ${IN_SCOPE_GUARD_SQL}
        AND LENGTH(TRIM(province)) > 1
        AND status IN (${placeholders})
      GROUP BY province
    `;
    const rows = await query<{ province: string; count: string | number }>(
      sql,
      AVAILABLE_DB_STATUSES,
    );

    // Tally onto the canonical 52 provinces. Anything that doesn't map is junk.
    const counts = new Map<string, number>(); // key = canonical .key
    for (const p of SPAIN_PROVINCES) counts.set(p.key, 0);

    let junkRowsExcluded = 0;
    let junkDistinctProvincesSeen = 0;
    const junkSeen = new Set<string>();

    for (const row of rows) {
      const raw = row.province;
      const n = Number(row.count) || 0;
      if (!isCanonicalProvince(raw)) {
        junkRowsExcluded += n;
        if (!junkSeen.has(raw)) {
          junkSeen.add(raw);
          junkDistinctProvincesSeen++;
        }
        continue;
      }
      const canonical = toCanonicalProvince(raw);
      if (!canonical) {
        junkRowsExcluded += n;
        continue;
      }
      counts.set(canonical.key, (counts.get(canonical.key) ?? 0) + n);
    }

    // Build the response array. Always include every canonical province so the
    // UI dropdown is stable (zero-count provinces appear with count: 0 unless
    // minimum_count filters them out).
    let data = SPAIN_PROVINCES.map((p) => ({
      province: p.key, // value to filter by — what's in the DB
      label: p.label, // what to render
      count: counts.get(p.key) ?? 0,
    })).filter((row) => row.count >= minimumCount);

    if (sort === 'label_asc') {
      data = data.sort((a, b) => a.label.localeCompare(b.label, 'es'));
    } else {
      data = data.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'es'));
    }

    const totalAvailable = data.reduce((s, r) => s + r.count, 0);

    return NextResponse.json({
      success: true,
      data,
      meta: {
        provinceCount: data.length,
        totalAvailable,
        junkRowsExcluded,
        junkDistinctProvincesSeen,
        statusFilter: AVAILABLE_DB_STATUSES,
        elapsedMs: Date.now() - startedAt,
      },
    });
  } catch (error) {
    console.error('/api/auctions/provinces error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to load province counts',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
