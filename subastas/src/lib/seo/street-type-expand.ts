/**
 * SPANISH STREET-TYPE (via-type) FULL-WORD EXPANSION for URL descriptors.
 *
 * ⭐ WHY THIS FILE EXISTS (2026-08-24, url-street-fullword dispatch)
 * Property URLs that carry an address spelled the street type ABBREVIATED —
 * `cl-mayor-…`, `av-…`, `avda-…` — because the abbreviation flowed verbatim
 * from the raw BOE / Registro `address` field into the slug. Dennis's ask:
 * the URL must spell the street type in FULL (`calle-…`, `avenida-…`).
 *
 * ── THE ONE RULE THAT MAKES THIS SAFE ───────────────────────────────────────
 * Expansion is **token-anchored to the LEADING descriptor token only**, matched
 * as a WHOLE token between hyphen boundaries. It is NEVER a substring replace.
 *   • The via-type in a Spanish address is always the FIRST token ("CL MAYOR 12",
 *     "AVDA DEL PUERTO 4"), which is exactly the set Phase-1 measured (83,306
 *     leading tokens). Anchoring to the leading token reproduces that set
 *     precisely and cannot corrupt a street *named* after a would-be code
 *     (a street "Clara" slugs to `clara`, whose leading token is `clara`,
 *     not `cl`, so it never matches).
 *   • Name particles (`la`, `el`, `los`, `las`, `san`, `de`, `del`) and the
 *     co-official full words `carrer` (Catalan) / `rua` (Galician) are NOT keys
 *     in the map, so they pass through untouched by construction.
 *
 * ── SOURCE OF THE MAP ───────────────────────────────────────────────────────
 * Codes and expansions follow the official DGC (Dirección General del Catastro)
 * via-type sigla table, plus the small set of unambiguous registry variants
 * (`c`, `avda`, `avd`, `urb`, `cami`, `cno`, `ctra`) that carry the same meaning
 * with no alternate reading.
 *
 * ── AMBIGUOUS CODES ARE LEFT UNEXPANDED ON PURPOSE ──────────────────────────
 * `pj` (paraje OR pasaje), `pa`, `pd`, `ds`, `tn`, `no` have more than one
 * DGC / registry reading. Per the dispatch, an ambiguous code is left
 * UNEXPANDED (the URL is unchanged) and reported, rather than guessed — a
 * wrongly-expanded permanent URL is worse than an abbreviated one, and there is
 * no cheap way to reverse it. `AMBIGUOUS_VIA_CODES` is exported so the re-mint
 * and the tests can assert this set is deliberately skipped.
 *
 * PURE: no DB, no `now`, no env. Same descriptor -> same result, forever.
 */

/**
 * Leading via-type code -> full Spanish word. Keys are already slug-cased
 * (lowercase, no accents), matching the descriptor form the pipeline produces.
 *
 * Every entry here is UNAMBIGUOUS: the code has exactly one street-type reading.
 * Ambiguous codes are intentionally absent (see AMBIGUOUS_VIA_CODES).
 */
export const VIA_TYPE_EXPANSION: Readonly<Record<string, string>> = Object.freeze({
  // calle
  c: 'calle',
  cl: 'calle',
  // avenida
  av: 'avenida',
  avd: 'avenida',
  avda: 'avenida',
  // plaza
  pz: 'plaza',
  // paseo
  ps: 'paseo',
  // carretera
  cr: 'carretera',
  ctra: 'carretera',
  // camino
  cm: 'camino',
  cami: 'camino',
  cno: 'camino',
  // travesia
  tr: 'travesia',
  // ronda
  rd: 'ronda',
  // rambla
  rb: 'rambla',
  // glorieta
  gl: 'glorieta',
  // urbanizacion
  ur: 'urbanizacion',
  urb: 'urbanizacion',
  // lugar
  lg: 'lugar',
  // poligono
  pg: 'poligono',
  // barrio
  bo: 'barrio',
  // edificio
  ed: 'edificio',
});

/**
 * Codes with more than one plausible DGC / registry reading. Left UNEXPANDED
 * and reported rather than guessed. Present in the measured corpus: pj, pa, pd
 * (ds/tn/no measured 0 rows but are kept here as known-ambiguous).
 */
export const AMBIGUOUS_VIA_CODES: ReadonlySet<string> = Object.freeze(
  new Set(['pj', 'pa', 'pd', 'ds', 'tn', 'no']),
) as ReadonlySet<string>;

/** The leading token of a hyphen-joined descriptor (everything before first '-'). */
function leadingToken(descriptor: string): string {
  const i = descriptor.indexOf('-');
  return i === -1 ? descriptor : descriptor.slice(0, i);
}

/**
 * Expand the leading via-type code of a slug-cased descriptor to its full word.
 *
 * Returns the descriptor UNCHANGED when the leading token is not an unambiguous
 * via-type code (already a full word, an ambiguous code, a name particle, or an
 * ordinary street name). Idempotent: expanding an already-expanded descriptor
 * is a no-op, because full words are not keys.
 *
 * @param descriptor slug-cased descriptor, e.g. `cl-mayor-12`
 */
export function expandLeadingViaType(descriptor: string): string {
  if (!descriptor) return descriptor;
  const head = leadingToken(descriptor);
  const full = VIA_TYPE_EXPANSION[head];
  if (!full) return descriptor; // full word, ambiguous, particle, or a real name
  const rest = descriptor.slice(head.length); // includes the leading '-' if any
  return `${full}${rest}`;
}

/**
 * Diagnostic classification of a descriptor's leading token — for the re-mint
 * report and tests. Does not mutate anything.
 */
export function classifyLeadingViaType(descriptor: string): {
  token: string;
  action: 'expanded' | 'ambiguous-skipped' | 'unchanged';
  expandedTo: string | null;
} {
  const token = leadingToken(descriptor);
  if (VIA_TYPE_EXPANSION[token]) {
    return { token, action: 'expanded', expandedTo: VIA_TYPE_EXPANSION[token] };
  }
  if (AMBIGUOUS_VIA_CODES.has(token)) {
    return { token, action: 'ambiguous-skipped', expandedTo: null };
  }
  return { token, action: 'unchanged', expandedTo: null };
}
