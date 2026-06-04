/**
 * teaser-snippet — PII-safe snippet sanitizer for the freemium gate.
 *
 * Source of truth for the ≤280-char "Descripción" snippet rendered in the
 * public SSR teaser AND the field returned by GET /api/auctions/[id] for
 * logged-out / non-qualifying callers.
 *
 * BACKGROUND (2026-06-05 — Ken's leak report):
 *   `Auction.propertyDescription` is NOT prose. The scraper writes a
 *   structured "Key\tValue" dump as the first several hundred characters,
 *   e.g.:
 *
 *       Bien 0 - Inmueble (Vivienda)
 *       Descripción\tFINCA DOS. VIVIENDA TIPO B, MODULO DOS
 *       IDUFIR\t29025000672205
 *       Referencia catastral\t4547941UF8644N0002EQ
 *       Dirección\tURB LOS OLIVOS 15D, Es: 1. Pl: 00, Pt: 2
 *       Código Postal\t29730
 *       Localidad\tRincón de la Victoria
 *       Provincia\tMálaga
 *       Vivienda habi…
 *
 *   A naive `slice(0, 277)` over that blob leaks every gated field the
 *   freemium wall is built to hide — IDUFIR, cadastral ref, exact address,
 *   postal code — into the public SSR teaser AND the `__next_f` JSON in the
 *   server-rendered HTML (crawlable by Google).
 *
 * STRATEGY (prose-allowlist, not blocklist):
 *   - Split the source on newlines.
 *   - For each line: if it contains a TAB (`\t`), treat it as a structured
 *     `Key\tValue` pair and ONLY keep the value when the key normalises to
 *     a known prose label (`descripción`, `descripcion`, `description`,
 *     `tipo`). Everything else is structured intel — drop the whole line.
 *   - Lines with no TAB are free prose — keep them.
 *   - Collapse whitespace, trim, clamp to ≤280 (277 + `…` on overflow).
 *   - If nothing safe remains, return null. Callers fall back to a
 *     generic line (or render no snippet at all — the rest of the teaser
 *     already carries title/type/province/municipality/status/figure).
 *
 * NOTE on accent-insensitivity: we lowercase + NFD-strip combining marks
 * before comparing the key, so `Descripción` and `descripcion` both match.
 *
 * This sanitizer is the SINGLE source of truth shared by both layers
 * (AuctionTeaser.tsx + /api/auctions/[id]/route.ts) so the two paths can
 * never drift.
 */

const PROSE_KEYS = new Set([
  'descripcion', // "Descripción" / "Descripcion" / "Description"
  'description',
  'tipo', // generic property type label — non-gated
]);

function normalizeKey(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining accents (NFD diacritics)
    .trim()
    .toLowerCase();
}

/**
 * Strip structured `Key\tValue` lines, keep prose, collapse whitespace,
 * clamp to ≤280 chars. Returns null when nothing prose-safe remains.
 */
export function sanitizeTeaserSnippet(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const src = String(raw);
  if (!src.trim()) return null;

  const safeParts: string[] = [];
  for (const line of src.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const tabIdx = trimmed.indexOf('\t');
    if (tabIdx === -1) {
      // Free prose line — no Key\tValue structure. Keep verbatim.
      safeParts.push(trimmed);
      continue;
    }
    // Structured Key\tValue. Allowlist by key, never blocklist:
    // anything we don't explicitly recognise as prose is dropped.
    const key = normalizeKey(trimmed.slice(0, tabIdx));
    if (!PROSE_KEYS.has(key)) continue;
    const value = trimmed.slice(tabIdx + 1).trim();
    if (value) safeParts.push(value);
  }

  if (safeParts.length === 0) return null;

  // Collapse all whitespace (incl. embedded tabs from any pathological
  // multi-tab line) to single spaces, then trim.
  const collapsed = safeParts.join(' ').replace(/\s+/g, ' ').trim();
  if (!collapsed) return null;

  if (collapsed.length <= 280) return collapsed;
  return collapsed.slice(0, 277).trimEnd() + '…';
}

/**
 * Best snippet for a teaser-data row. Tries propertyDescription first
 * (richest), falls back to lotDescription then boeAnnouncement. Each
 * candidate is run through the same sanitizer — a leaky propertyDescription
 * can't "win" just because it's longest pre-sanitize.
 */
export function pickTeaserSnippet(sources: {
  propertyDescription?: string | null;
  lotDescription?: string | null;
  boeAnnouncement?: string | null;
}): string | null {
  return (
    sanitizeTeaserSnippet(sources.propertyDescription) ??
    sanitizeTeaserSnippet(sources.lotDescription) ??
    sanitizeTeaserSnippet(sources.boeAnnouncement) ??
    null
  );
}
