/**
 * legacy-rows — single source of truth for the "retire this auction URL" (SEO
 * 410/de-index) predicate.
 *
 * ─── CORRECTED 2026-07-28 (wave155, diagnosis-driven) ─────────────────────────
 * The ORIGINAL predicate (2026-06-02) retired a row by **id SHAPE** — any cuid
 * id (`^c[a-z0-9]{24}$`) was treated as "January junk import" and 410'd at the
 * edge BEFORE any status/link check. That was BACKWARDS: `Auction.id` is
 * `@default(cuid())`, so EVERY newer scraped row has a cuid id. The old junk
 * corpus is identified NOT by its id shape but by a **dead internal BOE link**
 * (`boeId ~ '^0x'`). Keying on cuid shape silently 410'd 1,176 legitimate
 * auctions (1,088 concluded-with-real-SUB sold comps, 77 cancelada real-SUB,
 * 11 suspendida real-SUB — including Dennis's flagged Las Palmas row).
 *
 * THE CORRECTED PREDICATE — a row may be retired (410 / noindex / 404) **ONLY**
 * when BOTH hold:
 *   1. dead link:  boeId ~ '^0x'   (the internal-code BOE link is dead), AND
 *   2. terminal:   status ∈ FINISHED_DB_STATUSES (concluded / finalizada /
 *                  cancelada / legacy finished-cancelled).
 *
 * NEVER retire a SUSPENDIDA or live/upcoming row — even if its boeId is a dead
 * `0x` link. Dennis's example `c7mdnij4a9ihge0842bms8sst` is SUSPENDIDA with a
 * dead `0x` boeId: dead-link is TRUE but SUSPENDIDA is NOT terminal → NOT
 * retired → it renders as a normal card with a "Suspendida" badge (frozen —
 * the dead link cannot be re-scraped, which is the honest correct state).
 *
 * Consequence:
 *   - 0x + terminal (the genuine ~12.3k junk)     → RETIRED (stays de-indexed).
 *   - real SUB- + terminal (sold comps, cancelada) → NOT retired (indexable /
 *     renders) — preserves the wave146-151 /resultados sold-comp SEO.
 *   - 0x + SUSPENDIDA / live / upcoming            → NOT retired (renders frozen).
 *
 * WHY THE DECISION IS NO LONGER AT THE EDGE: the corrected predicate needs the
 * row's boeId + status, which the edge middleware (edge runtime, no Prisma)
 * cannot read. So the retire decision moved OFF the edge into the [slug] page /
 * generateMetadata, which already loads the row. `middleware.ts` Rule 1b (the
 * cuid-shape edge 410) has been REMOVED.
 *
 * Scraper mirror: `scraper/database/legacy_rows.py` keys candidate-exclusion on
 * the dead-link (`0x`) signal ONLY (it also dropped the cuid-shape branch) —
 * see that file's header for why its predicate omits the terminal gate.
 */

// Relative (not '@/…') so this predicate is importable by the plain-tsx unit
// test (tsx does not resolve tsconfig path aliases). auction-status.ts is pure
// (no I/O / prisma), so importing it here is side-effect-free.
import { isFinishedStatus } from '../auction-status';

/**
 * cuid v1 shape — `c` + 24 lowercase alnum chars (25 total).
 *
 * ⚠️ HISTORICAL — this is the id shape of EVERY newer scraped row (the Prisma
 * `@default(cuid())` default), NOT a junk signal. Retained only so older tests
 * / callers resolve the symbol; it MUST NOT be used to retire a row. Use
 * {@link shouldRetireAuction} instead.
 */
export const LEGACY_CUID_RE = /^c[a-z0-9]{24}$/;

/** Internal-code BOE id shape — `0x` + hex. The real dead-link junk signal. */
export const LEGACY_BOE_ID_RE = /^0x/i;

/** True iff the boeId is a dead internal-code (`0x…`) link. */
export function isDeadLinkBoeId(boeId: string | null | undefined): boolean {
  return !!boeId && LEGACY_BOE_ID_RE.test(boeId);
}

/**
 * @deprecated Not a retire signal. cuid is the default id of every legit newer
 * row. Kept as a no-decision helper for backward symbol resolution only.
 * Always returns false's practical meaning for retirement — do NOT branch 410
 * on it. Prefer {@link shouldRetireAuction}.
 */
export function isLegacyCuid(id: string | null | undefined): boolean {
  if (!id) return false;
  return LEGACY_CUID_RE.test(id);
}

/** Minimal row shape the retire predicate needs. */
export interface RetirableRow {
  boeId?: string | null;
  status?: string | null;
}

/**
 * THE retire predicate (single source of truth). Retire a detail URL (410 /
 * noindex / 404) iff the row has a DEAD internal link (`boeId ~ '^0x'`) AND is
 * in a TERMINAL status. Never retires suspended / live / upcoming rows, and
 * never retires a real `SUB-` boeId (regardless of status — real terminal rows
 * stay reachable as indexable sold comps).
 */
export function shouldRetireAuction(row: RetirableRow): boolean {
  return isDeadLinkBoeId(row.boeId) && isFinishedStatus(row.status);
}

/**
 * Back-compat alias for the previous name. Now delegates to the CORRECTED
 * predicate ({@link shouldRetireAuction}) so every existing caller (page.tsx
 * metadata + body) is fixed in one place. The prior implementation retired on
 * cuid id shape OR any 0x boeId; both were over-broad.
 */
export function isLegacyRow(row: { id?: string; boeId?: string | null; status?: string | null }): boolean {
  return shouldRetireAuction(row);
}
