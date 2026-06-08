/**
 * Display-side sanitizer for scraper-extracted free-text fields.
 *
 * Defence-in-depth against the 2026-06-08 BOE-scraper leak, where the
 * detail-page chargesDetail / lotDescription / propertyDescription /
 * registryInfo columns ended up containing the entire BOE page's HTML/JS
 * (nav chrome + `var hoy = new Date()` clock + "Iniciar sesión") because
 * the scraper's fallback extractor was too greedy.
 *
 * Even with Ghost's scraper fix landed and the one-shot backfill applied,
 * we render every one of those fields through this helper so a future
 * regression can never put page-dump junk in front of a user. The helper
 * returns `null` for content that looks like a page dump (caller renders
 * nothing / shows an empty-state) and returns the trimmed string otherwise.
 *
 * Pure, synchronous, zero deps — safe to import on both server and client.
 */

/**
 * Tokens that should NEVER appear in a legitimate "charges detail" /
 * "property description" blurb. Each one is a page-dump fingerprint.
 *
 * Matched case-insensitive against the field value.
 */
const PAGE_DUMP_TOKENS: readonly string[] = [
  // JS clock that lives in the BOE site chrome
  'var hoy',
  'function reloj',
  'new Date(',
  // Site-chrome anchors / labels
  'Iniciar sesi', // matches "Iniciar sesión" w/ or w/o accent encoding
  'Buscar Ayuda',
  // Generic HTML/JS leak markers
  '<script',
  '<style',
  'window.location',
  'document.write',
];

/**
 * Hard upper bound on a single field's length. Legitimate charges-detail /
 * lot-description fields in the corpus top out well below this — content
 * larger than this is page-dump junk by definition.
 */
const MAX_FIELD_LEN = 1500;

/**
 * Returns the trimmed `raw` value when it looks like real extracted text,
 * or `null` when:
 *   - `raw` is null/undefined/empty/whitespace-only
 *   - `raw` length exceeds MAX_FIELD_LEN (page-dump territory)
 *   - `raw` contains any PAGE_DUMP_TOKENS fingerprint
 *
 * Callers should render nothing (or an empty-state) when this returns null,
 * never the original value.
 */
export function sanitizeExtractedText(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_FIELD_LEN) return null;
  const lower = trimmed.toLowerCase();
  for (const tok of PAGE_DUMP_TOKENS) {
    if (lower.includes(tok.toLowerCase())) return null;
  }
  return trimmed;
}

/**
 * SQL ILIKE predicate fragment used by the one-shot backfill script. Kept
 * here so the display rejection list and the backfill rejection list stay
 * in lock-step — any future addition to PAGE_DUMP_TOKENS should also extend
 * this fragment so the backfill catches the same leak shape it will be
 * asked to suppress in the UI.
 *
 * Exported as a constant for the script to consume.
 */
export const SQL_PAGE_DUMP_PREDICATE: string = `(
  "{col}" ILIKE '%var hoy%'
  OR "{col}" ILIKE '%function reloj%'
  OR "{col}" ILIKE '%new Date(%'
  OR "{col}" ILIKE '%Iniciar sesi%'
  OR "{col}" ILIKE '%Buscar Ayuda%'
  OR "{col}" ILIKE '%<script%'
  OR "{col}" ILIKE '%<style%'
  OR "{col}" ILIKE '%window.location%'
  OR "{col}" ILIKE '%document.write%'
)`;
