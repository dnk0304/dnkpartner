/**
 * Source labels — single source of truth for mapping `Auction.source` DB
 * values to user-facing display labels.
 *
 * The DB column is a free `string` (with default `'BOE'`) so any new scraper
 * source self-registers in the DB; this map controls how it RENDERS. New
 * sources show up automatically in data-driven counts and in the listing as
 * the row's `source` field, but they will fall through `getSourceLabel()` to
 * a titlecased fallback until they're added here.
 *
 * Why a typed `string` keyspace (not a TS union): keeps the next source from
 * needing a code change to land in the DB or to flow through the API. The
 * filter whitelist below caps which sources can be requested via the public
 * `?source=` query param — that one IS a closed set on purpose.
 */

/** Canonical display labels per known `Auction.source` DB value. */
export const SOURCE_LABEL_MAP: Readonly<Record<string, string>> = {
  // BOE = subastas judiciales + AEAT + notariales + administrativas (the
  // Portal de Subastas families). All judicial/admin/tax rows scraped from
  // the BOE portal carry source='BOE'.
  BOE: 'BOE',
  // Legacy alias — historically a small subset of BOE rows were tagged TEJU
  // for "tesoreria judicial"; we collapse onto the same display label since
  // they're functionally the same family for users.
  TEJU: 'BOE',
  // Tesorería General de la Seguridad Social — the new source (2026-06).
  SEGSOCIAL: 'Seguridad Social',
};

/** Sources the public `?source=` filter param accepts. Closed set on purpose. */
export const KNOWN_SOURCES = ['BOE', 'TEJU', 'SEGSOCIAL'] as const;
export type KnownSource = (typeof KNOWN_SOURCES)[number];

/** True when `s` is a value the public source-filter accepts. */
export function isKnownSource(s: string): s is KnownSource {
  return (KNOWN_SOURCES as readonly string[]).includes(s);
}

/**
 * Resolve a display label for a raw DB source value. Honest-NULL: returns
 * null when the input is null/empty so callers can decide whether to omit
 * the badge entirely. Unknown sources fall back to a titlecased rendering
 * (e.g. a future "AYTO_MADRID" → "Ayto Madrid") so the UI never shows
 * raw scream-case strings.
 */
export function getSourceLabel(source: string | null | undefined): string | null {
  if (!source) return null;
  const trimmed = source.trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  if (SOURCE_LABEL_MAP[upper]) return SOURCE_LABEL_MAP[upper];
  // Graceful fallback: lower-case + capitalize first letter of each segment.
  return upper
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((seg) => seg.charAt(0) + seg.slice(1).toLowerCase())
    .join(' ');
}
