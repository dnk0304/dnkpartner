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

// ---------------------------------------------------------------------------
// SANITIZE-DISPLAY (2026-08-04, Ken ruling) — excision of justice-system
// document stamps and personal contact data from published free text.
//
// Ghost's ADDRFIELD work (77566fb, `subastas/scraper/scrapers/boe_scraper.py`)
// proved that BOE's own text carries e-justice document stamps spliced into
// property prose. His fix runs at EXTRACTION time and only guards
// `Auction.address`. The same blobs are ALSO published verbatim from
// `lotDescription` — on the detail body, in JSON-LD, and via the title/H1
// fallback. This is the display-side half.
//
// The stamp patterns below are PORTED VERBATIM from Ghost's `_ADDR_STAMP_RES`
// (same order, same semantics, Python `re` → JS RegExp). They are deliberately
// NOT a third implementation: this module is the single TypeScript source of
// truth, and it mirrors his Python set rule-for-rule. A cross-language shared
// module is not possible (his runs in the Python scraper, this in Next.js), so
// "shared" here means one TS module consumed by every TS surface.
//
// Added beyond Ghost's set, because the display surface publishes to the whole
// internet and to search-engine structured data:
//   - e-mail addresses          (25 rows in prod carry one)
//   - Spanish phone numbers     (67 rows; several are a named private
//                                depositary's personal mobile)
// Personal contact data about identifiable people must never be rendered.
//
// RULING (Ken, 2026-08-04): do NOT weaken these to preserve legitimate
// content. Over-stripping is the correct failure direction.
//
// NOT stripped, deliberately:
//   - licence plates / VINs. On a VEHICLE lot the plate IS the goods being
//     auctioned, not third-party PII; stripping it would gut the listing.
//     Ghost NULLs a plate only when it lands in the ADDRESS cell, which is a
//     different question. `matrícula SE-62` (a social-housing registry code)
//     survives for the same reason it survives his extractor.
//   - road codes (`A-92`, `N-340`), cadastral refs, IDUFIR, postal codes.
// ---------------------------------------------------------------------------

/** A single excision rule. `name` is what we log — never the matched text. */
interface RedactionRule {
  readonly name: string;
  readonly re: RegExp;
}

/**
 * Order matters, exactly as in Ghost's `_ADDR_STAMP_RES`: URLs first (the
 * stamp's trailing verification URL), then the stamp prose, then contact data.
 * Every pattern is written stateless (no `g` flag stored on a shared object is
 * mutated — we clone per call via `new RegExp` in `redactSensitiveText`).
 */
const REDACTION_RULES: readonly RedactionRule[] = [
  // Ghost rule 1 — any URL, including the bare `www.` form (brief: "bare
  // http/www fragments").
  { name: 'url', re: /\s*(?:https?:\/\/|www\.)\S+/gi },
  // e-mail (display-side addition).
  { name: 'email', re: /\s*[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  // Ghost rule 2 — "Código Seguro de Verificación E04799402-MI:h6Rb-…-S".
  // Accent-optional: the corpus holds both "Código" and "Codigo".
  {
    name: 'csv-label',
    re: /\s*C[oó]digo\s+Seguro\s+de\s+Verificaci[oó]n\s*:?\s*\S+/gi,
  },
  // Ghost rule 3 — the abbreviated form.
  { name: 'csv-abbrev', re: /\s*\bCSV\s*[:=]\s*\S+/gi },
  // Ghost rule 4 — label only; the URL itself is already gone (rule 1), and
  // consuming a further token here would eat the street name that follows.
  { name: 'validation-url-label', re: /\s*URL\s+de\s+validaci[oó]n\s*:?/gi },
  // Ghost rule 5.
  {
    name: 'verify-prose',
    re: /\s*Puede\s+verificar\s+este\s+documento(?:\s+en)?/gi,
  },
  // Ghost rule 6, WIDENED for display. Ghost strips the label only; on the
  // address cell the signer's name never followed. In `lotDescription` it does
  // — every one of the 25 prod rows reads "Firmado por: <NAMED JUDICIAL
  // OFFICER> <dd/mm/yyyy hh:mm>". We consume the label AND the following run of
  // capitalised name tokens (bounded to 6), so the name does not survive the
  // label's removal. Both casings occur in the corpus ("ANA SALA ICARDO" and
  // "Marta González García"), hence the mixed-case continuation class. The run
  // stops at the first token that does not start with a capital — in practice
  // the signature timestamp — so it cannot walk on into the property prose.
  {
    name: 'signed-by',
    re: /\s*Firmado\s+por\s*:?\s*(?:[A-ZÁÉÍÓÚÜÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ.'-]*(?:\s+|$)){0,6}/g,
  },
  // Contact data, labelled form: "teléfono 639649100", "Tfno: 91 123 45 67",
  // "CON TELEFÓNO: 620546029", "Fax 954 00 00 00".
  {
    name: 'phone-labelled',
    re: /\s*\b(?:tel[eé]f[oó]nos?|tel[eé]f[oó]no|tfnos?|tlfnos?|tlf|m[oó]vil(?:es)?|fax)\b\.?\s*:?\s*(?:\+?\d[\d\s.()-]{7,}\d)?/gi,
  },
  // Contact data, bare Spanish number: 9 digits opening 6/7/8/9, optional
  // `+34`, optional space/hyphen grouping (3-3-3 or 3-2-2-2).
  //
  // The letter/digit/slash guards on BOTH sides are load-bearing: without them
  // this would eat the 9-digit run inside a VIN ("VF1FDA1D644366300") or a
  // cadastral reference. Dot-separated groups are deliberately NOT accepted —
  // that is how Spanish writes money ("1.234.567"), not phone numbers.
  {
    name: 'phone-bare',
    re: /(?<![\dA-Za-zÁÉÍÓÚÜÑáéíóúüñ/-])(?:\+?34[ -]?)?[6789]\d{2}(?:[ -]?\d{3}[ -]?\d{3}|[ -]?\d{2}[ -]?\d{2}[ -]?\d{2}|\d{6})(?![\dA-Za-zÁÉÍÓÚÜÑáéíóúüñ/-])/g,
  },
];

/** Outcome of a redaction pass. `rules` lists the rule NAMES that fired. */
export interface RedactionResult {
  readonly text: string;
  /** Rule names that matched, in rule order. Never contains stripped content. */
  readonly rules: readonly string[];
  /** Total number of excised spans across all rules. */
  readonly count: number;
}

/**
 * Excise justice-system document stamps, URLs and personal contact data from
 * a free-text blob. Pure; returns the cleaned text plus a description of what
 * fired, so callers can log WITHOUT logging the removed content itself
 * (logging a stripped phone number into the application log would defeat the
 * purpose of stripping it).
 */
export function redactSensitiveText(raw: string): RedactionResult {
  let text = raw;
  const rules: string[] = [];
  let count = 0;
  for (const rule of REDACTION_RULES) {
    // Fresh RegExp per call: the module-level literals carry `g`, and a shared
    // `lastIndex` across calls would make results order-dependent.
    const re = new RegExp(rule.re.source, rule.re.flags);
    let hits = 0;
    text = text.replace(re, () => {
      hits += 1;
      return ' ';
    });
    if (hits > 0) {
      rules.push(rule.name);
      count += hits;
    }
  }
  if (count > 0) {
    text = text.replace(/[ \t]{2,}/g, ' ').replace(/\s+([,;.])/g, '$1');
  }
  return { text, rules, count };
}

/**
 * Server-side observability hook. Logs the RULE NAMES that fired (never the
 * stripped text) so the patterns can be refined later on evidence, per Ken's
 * "log every strip" ruling. No-op in the browser bundle.
 */
function logRedaction(result: RedactionResult): void {
  if (result.count === 0) return;
  if (typeof window !== 'undefined') return;
  console.warn(
    `[SANITIZE-DISPLAY] redacted ${result.count} span(s): ${result.rules.join(',')}`,
  );
}

/**
 * Redact + trim a value for display. Returns null when nothing survives.
 * Use this on any surface that renders scraper free text but does NOT already
 * go through `sanitizeExtractedText` (JSON-LD, title fallbacks, list excerpts).
 */
export function redactForDisplay(
  raw: string | null | undefined,
): string | null {
  if (typeof raw !== 'string') return null;
  const result = redactSensitiveText(raw);
  logRedaction(result);
  const trimmed = result.text.trim().replace(/^[,;.\s-]+/, '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

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
  // SANITIZE-DISPLAY (2026-08-04): page-dump rejection is all-or-nothing, but
  // the CSV stamps / phones / e-mails sit INSIDE otherwise-legitimate prose —
  // rejecting the whole field would delete real descriptions. Excise instead.
  // Placed here so every existing consumer of this choke point (the detail
  // payload projection and `stripStructuredLabelLines`) inherits it.
  return redactForDisplay(trimmed);
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
