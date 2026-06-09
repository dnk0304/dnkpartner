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
 * Structured-label keys that appear as `Etiqueta: valor` / `Etiqueta\tvalor`
 * segments inside the BOE-style `lotDescription` / `propertyDescription` blob.
 *
 * Each of these is ALSO surfaced — canonically — by the structured
 * "Datos del bien" key-value panel on the detail page (Dirección, Código
 * postal, Localidad, IDUFIR, Referencia catastral, …). Rendering the raw blob
 * verbatim therefore prints the address (and its neighbours) a SECOND time:
 * once inside the description prose and once in the KV panel. See
 * `stripStructuredLabelLines` below.
 *
 * Written WITH accents — the matcher built from these is accent-tolerant, so
 * "Dirección", "DIRECCIÓN", and "Direccion" all match the same key.
 *
 * Order matters: longer keys come before their prefixes (e.g.
 * "superficie construida" / "superficie útil" before bare "superficie") so the
 * regex alternation prefers the most specific label.
 */
const STRUCTURED_LABEL_KEYS: readonly string[] = [
  'dirección',
  'vía pública',
  'número',
  'localización',
  'localidad',
  'municipio',
  'provincia',
  'código postal',
  'referencia catastral',
  'idufir',
  'superficie construida',
  'superficie útil',
  'superficie',
  'inscripción registral',
  'título legal',
  'vivienda habitual',
];

/**
 * Accent-tolerant single-character matcher. Maps each accentable base letter
 * to a class covering its Spanish-accented variants, and regex-escapes
 * everything else, so the label matcher hits "Dirección", "DIRECCION", and
 * "direccion" alike while matching the ORIGINAL string (no NFD offset drift).
 */
function accentTolerantChar(ch: string): string {
  const lower = ch.toLowerCase();
  const variants: Record<string, string> = {
    a: 'aá', e: 'eé', i: 'ií', o: 'oó', u: 'uúü', n: 'nñ',
  };
  if (variants[lower]) return `[${variants[lower]}]`;
  return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Turn a label key into an accent/case/space-tolerant regex fragment. */
function labelKeyToPattern(key: string): string {
  return key
    .split('')
    .map((c) => (c === ' ' ? '\\s+' : accentTolerantChar(c)))
    .join('');
}

/**
 * Matches a structured label token — one of STRUCTURED_LABEL_KEYS immediately
 * followed by its value delimiter (`:` or a tab). Global + case-insensitive so
 * we can locate the FIRST structured token anywhere in the blob.
 *
 * Built once at module load.
 */
const STRUCTURED_LABEL_TOKEN = new RegExp(
  '(?:' + STRUCTURED_LABEL_KEYS.map(labelKeyToPattern).join('|') + ')\\s*[:\\t]',
  'gi',
);

/**
 * Strip the structured `Etiqueta: valor` segments (Dirección, Vía Pública,
 * Código Postal, Referencia catastral, IDUFIR, Superficie…, etc.) out of a
 * description blob, returning only the genuine human-readable prose.
 *
 * The BOE blob is a flat run of `Etiqueta: valor` / `Etiqueta\tvalor` segments,
 * frequently packed inline on one line with `...` separators rather than on
 * separate rows — e.g.
 *
 *     "Vía Pública: calle León y Castillo  Número: nº 373 ... Dirección\tLeón y Castillo 373"
 *
 * Genuine description prose, when present, is the free-text LEAD paragraph that
 * appears BEFORE the first structured label token. (In the corpus the Key/Value
 * dump is always appended after any prose, never interleaved.) So the prose is
 * exactly `blob.slice(0, firstLabelTokenIndex)` — everything from the first
 * structured token onward is the duplicate-address machinery and is dropped.
 *
 * Behaviour:
 *   - Runs the input through `sanitizeExtractedText` first, so page-dump junk
 *     and over-long blobs are still rejected (returns null).
 *   - If the blob has NO structured label token, it is treated as pure prose
 *     and returned (whitespace-normalised). This covers free-prose sources
 *     (e.g. Seguridad Social) that have no Key/Value structure.
 *   - If a structured token exists, returns the lead prose before it, or
 *     `null` when there is no lead prose (blob was purely structured) so the
 *     caller omits the section entirely (no empty heading).
 *
 * Defensive by design: a token only counts when a known label is immediately
 * followed by a `:`/tab delimiter, so a sentence that merely mentions a word
 * like "dirección" mid-prose (no delimiter) never triggers a cut. Taking only
 * the lead means the function can under-show prose but can NEVER re-leak a
 * structured address — the correct trade-off given the field's leak history.
 */
export function stripStructuredLabelLines(
  raw: string | null | undefined,
): string | null {
  const safe = sanitizeExtractedText(raw);
  if (safe == null) return null;

  STRUCTURED_LABEL_TOKEN.lastIndex = 0;
  const firstToken = STRUCTURED_LABEL_TOKEN.exec(safe);

  // Everything from the first structured token onward is the Key/Value dump;
  // the prose is the free-text lead before it (or the whole blob when there is
  // no structured token at all).
  const proseSlice = firstToken === null ? safe : safe.slice(0, firstToken.index);

  const prose = proseSlice
    .replace(/[\t ]+/g, ' ') // collapse runs of tabs/spaces
    .replace(/\s*\n\s*/g, '\n') // tidy line boundaries
    .replace(/\n{3,}/g, '\n\n') // cap blank runs
    .trim();

  return prose.length > 0 ? prose : null;
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
