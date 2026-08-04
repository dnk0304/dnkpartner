/**
 * Timeline labels — the translation layer for `AuctionStatusHistory` rows.
 *
 * WHY THIS MODULE EXISTS (I18N-1, 2026-08-03)
 * -------------------------------------------
 * The "Línea de tiempo" on the public auction detail page was rendering
 * `AuctionStatusHistory.reason` VERBATIM. That column holds internal
 * scraper/maintenance sentinels, so a Spanish-language indexed page was
 * printing e.g.
 *
 *     Próxima apertura → Cancelada · WITHDRAWN_PRE_AUCTION
 *
 * There was no mapping layer at all for that field — not a missing case, a
 * missing layer. Live DB at time of writing (238k auctions):
 *
 *     reason = 'audit_cleanup_2026-05-29'  → 20 554 rows   (leaking)
 *     reason = NULL                        →  5 401 rows   (fine)
 *     reason = 'WITHDRAWN_PRE_AUCTION'     →  2 508 rows   (leaking)
 *
 * i.e. EVERY non-null reason in production was a raw internal. This module is
 * the single place that turns history rows into user-facing Spanish. Every
 * render site must go through it; nothing may render `reason` directly.
 *
 * TWO COLUMNS, TWO GUARANTEES
 * ---------------------------
 * 1. `toStatus` / `fromStatus` are the Prisma enum `AuctionStatus`. They get
 *    `Record<AuctionStatus, …>` + a `never` guard, so adding an enum member
 *    BREAKS THE BUILD instead of leaking to production.
 * 2. `reason` is a free `String?`. A compile-time guard on the raw value is
 *    impossible, so it gets a known-value map, a NARROW UNION at the DTO
 *    boundary (`TimelineReasonCode`), and a mandatory Spanish fallback that
 *    is COUNTED AND LOGGED — an unmapped reason must be visible to us, never
 *    silently swallowed and never printed raw.
 */

import type { AuctionStatus as DbAuctionStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// 1. Prisma enum → frontend status key (exhaustive, build-breaking)
// ---------------------------------------------------------------------------

/**
 * DB enum value → the lowercase-hyphen key the frontend `getStatusMeta()`
 * palette is keyed by. Typed `Record<DbAuctionStatus, …>`: if Ghost adds an
 * enum member to `schema.prisma`, `tsc` fails here rather than the UI falling
 * through to `s.toLowerCase()` and printing an internal.
 */
export const DB_STATUS_TO_FRONTEND: Record<DbAuctionStatus, string> = {
  PROXIMA_APERTURA: 'proxima-apertura',
  CELEBRANDOSE: 'celebrandose',
  SUSPENDIDA: 'suspendida',
  CANCELADA: 'cancelada',
  CONCLUIDA_PORTAL: 'concluida-portal',
  FINALIZADA_AUTORIDAD: 'finalizada-autoridad',
  // Legacy values still present on historical rows.
  PRE_AUCTION: 'proxima-apertura',
  ACTIVE: 'celebrandose',
  FINISHED: 'concluida-portal',
  SUSPENDED: 'suspendida',
  CANCELLED: 'cancelada',
};

/**
 * The key rendered when the DB value is null/absent or (impossibly) unknown.
 * `concluida-portal` resolves to the neutral "Concluida" chip — it is a real
 * Spanish label, never a raw value.
 */
export const FALLBACK_FRONTEND_STATUS = 'concluida-portal';

/**
 * Resolve a raw DB status to a frontend status key. Total function: a value
 * outside the enum (only reachable if a row is written by raw SQL bypassing
 * the enum) maps to the neutral fallback, never to itself.
 */
export function frontendStatusOf(raw: string | null | undefined): string {
  if (!raw) return FALLBACK_FRONTEND_STATUS;
  const mapped = DB_STATUS_TO_FRONTEND[raw as DbAuctionStatus];
  if (mapped) return mapped;
  countUnmappedStatus(raw);
  return FALLBACK_FRONTEND_STATUS;
}

/**
 * Compile-time exhaustiveness assertion (CRM `never`-guard pattern). Called
 * from the unit test over every enum member; the `never` binding is what makes
 * a newly-added enum member a build error.
 */
export function assertExhaustiveStatus(value: never): never {
  throw new Error(`Unhandled AuctionStatus: ${String(value)}`);
}

// ---------------------------------------------------------------------------
// 2. AuctionStatusHistory.reason → Spanish (free string, fallback + logging)
// ---------------------------------------------------------------------------

/**
 * The narrow union of `reason` values we know about. Used to type the DTO
 * boundary so downstream callers are type-checked even though the column
 * itself is a free string.
 */
export type TimelineReasonCode = 'WITHDRAWN_PRE_AUCTION' | 'audit_cleanup_2026-05-29';

/**
 * Known reason values → what a Spanish-speaking user should read.
 *
 * A `null` value means "known internal marker, deliberately NOT user-facing —
 * render nothing". That is a MAPPED decision, not a fallback: printing
 * "Motivo no disponible" next to 20k rows of a one-off maintenance backfill
 * would be noise, not information. Unknown values are a different case and go
 * through `TIMELINE_REASON_FALLBACK` below.
 */
export const TIMELINE_REASON_LABELS: Readonly<Record<TimelineReasonCode, string | null>> = {
  // Ghost's sentinel for a lot pulled from the portal before bidding opened.
  // The status transition already says "Cancelada"; this says WHEN/WHY.
  WITHDRAWN_PRE_AUCTION: 'Retirada antes de la apertura',
  // One-off 2026-05-29 backfill that swept stale rows to CONCLUIDA_PORTAL.
  // Purely internal bookkeeping — suppressed on purpose.
  'audit_cleanup_2026-05-29': null,
};

/** Shown for a reason value we have never seen. NEVER the raw value. */
export const TIMELINE_REASON_FALLBACK = 'Motivo no disponible';

/** True when `s` is a reason code this module knows about. */
export function isKnownReasonCode(s: string): s is TimelineReasonCode {
  return Object.prototype.hasOwnProperty.call(TIMELINE_REASON_LABELS, s);
}

// --- observability ---------------------------------------------------------
// A silent fallback converts a VISIBLE bug into an INVISIBLE one. Every
// unmapped value is counted in-process and logged once per distinct value per
// process so the container log names it without flooding.

const unmappedReasonCounts = new Map<string, number>();
const unmappedStatusCounts = new Map<string, number>();

function bump(m: Map<string, number>, key: string): number {
  const next = (m.get(key) ?? 0) + 1;
  m.set(key, next);
  return next;
}

function countUnmappedStatus(raw: string): void {
  const n = bump(unmappedStatusCounts, raw);
  if (n === 1) {
    console.warn(`[i18n][timeline] unmapped AuctionStatus value: ${JSON.stringify(raw)}`);
  }
}

function countUnmappedReason(raw: string): void {
  const n = bump(unmappedReasonCounts, raw);
  if (n === 1) {
    console.warn(
      `[i18n][timeline] unmapped AuctionStatusHistory.reason: ${JSON.stringify(raw)} — ` +
        `rendering "${TIMELINE_REASON_FALLBACK}". Add it to TIMELINE_REASON_LABELS.`,
    );
  }
}

/** Snapshot of unmapped hits seen by this process. For tests / diagnostics. */
export function getUnmappedTimelineCounts(): {
  reasons: Record<string, number>;
  statuses: Record<string, number>;
} {
  return {
    reasons: Object.fromEntries(unmappedReasonCounts),
    statuses: Object.fromEntries(unmappedStatusCounts),
  };
}

/** Test-only: clear the in-process counters. */
export function __resetUnmappedTimelineCounts(): void {
  unmappedReasonCounts.clear();
  unmappedStatusCounts.clear();
}

// --- the resolver ----------------------------------------------------------

export type ResolvedReason = {
  /** Narrow code when known, else null. Safe to send to the client. */
  code: TimelineReasonCode | null;
  /** Spanish text to render, or null to render nothing. NEVER a raw value. */
  label: string | null;
  /** True when the raw value was unmapped and the generic fallback was used. */
  usedFallback: boolean;
};

/**
 * Translate a raw `reason` into something renderable. This is the ONLY
 * function allowed to look at the raw column value.
 */
export function resolveTimelineReason(raw: string | null | undefined): ResolvedReason {
  if (raw == null) return { code: null, label: null, usedFallback: false };
  const trimmed = raw.trim();
  if (!trimmed) return { code: null, label: null, usedFallback: false };
  if (isKnownReasonCode(trimmed)) {
    return { code: trimmed, label: TIMELINE_REASON_LABELS[trimmed], usedFallback: false };
  }
  countUnmappedReason(trimmed);
  return { code: null, label: TIMELINE_REASON_FALLBACK, usedFallback: true };
}
