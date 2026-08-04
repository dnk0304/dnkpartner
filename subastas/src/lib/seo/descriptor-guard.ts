/**
 * STRUCTURAL DESCRIPTOR GUARD — personal & sensitive identifiers must never
 * enter a permanent URL. (Ken ruling 2026-08-04; supersedes the category rule.)
 *
 * ── WHY THIS IS STRUCTURAL AND NOT A CATEGORY SWITCH ────────────────────────
 * The first design said "vehicles get type+ref only", relying on
 * `Auction.category` to keep licence plates out of URLs. Measured against the
 * live corpus that is **not sufficient**: 2 of the 4 rows carrying a real plate
 * in `address` sit under the PROPERTY category `Otros inmuebles` —
 *
 *   SUB-JA-2018-89759  [Otros inmuebles]  "…LICENCIA DE TAXI Nº 6558…, MATRICULA E6037HTP, …"
 *   SUB-JA-2024-227468 [Otros inmuebles]  "CR-8348-X Marca: Citroen"
 *
 * Both are **taxi-licence auctions**: the vehicle rides along with the licence,
 * so the plate lands in a property-category row. A category switch cannot see
 * that. A guard keyed on the CONTENT can.
 *
 * The sweep also surfaced a class nobody had named — Spanish justice-system
 * document tokens leaking into `address`:
 *
 *   SUB-JA-2025-242513        [Garajes]  "…Código Seguro de Verificación E04799402-MI:uWgK-…
 *                                          Puede verificar este documento en https://…gob.es"
 *   SUB-RC-2022-1400100122038 [Locales]  "https://www.haciendalocal.es/anunciossobre…"
 *
 * A CSV (Código Seguro de Verificación) is a document-verification token for the
 * Spanish administration of justice. It must never be published in a URL.
 *
 * ── DESIGN RULES ────────────────────────────────────────────────────────────
 *  • Runs at MINT TIME on every row, every category. The category rule is kept
 *    ONLY as defence in depth, never as the control.
 *  • Every strip is RETURNED as a signal, not silently swallowed. These 6 rows
 *    are a symptom of an upstream scraper field-mapping defect (document
 *    boilerplate and vehicle data being written into `address`); the caller logs
 *    the signal so the SOURCE gets fixed, not just the symptom.
 *  • Operates on the RAW text, before slugification. After slugging, `E6037HTP`
 *    has become `e6037htp` and `https://` has become `https-`, both far harder
 *    to match reliably.
 *  • Conservative by construction: each pattern is anchored on a structural
 *    marker (an explicit keyword, a URL scheme, a plate shape with word
 *    boundaries) so ordinary Spanish addresses are untouched. Verified against
 *    the corpus: road codes (`HV 4116`, `BV-1123`, `D-3311`) and cadastral refs
 *    (`PG A 2492 F`, `DS 8712-SA`) must SURVIVE — 17 of 18 raw old-plate regex
 *    hits were exactly those, and stripping them would gut real addresses.
 */

export type StripKind =
  | 'plate-explicit' // "MATRICULA 5751GTS" / "BASTIDOR VF1..."
  | 'plate-modern' //  4 digits + 3 consonants (post-2000 Spanish plate)
  | 'plate-old' //     provincial format, only next to a vehicle keyword
  | 'csv-token' //     Código Seguro de Verificación
  | 'url'; //          any http(s):// or www. fragment

export type GuardSignal = {
  kind: StripKind;
  /** The exact text removed — logged so the upstream defect is diagnosable. */
  matched: string;
};

export type GuardResult = {
  /** The cleaned text, safe to slugify into a permanent URL. */
  text: string;
  /** Every strip performed. Empty array = nothing sensitive found. */
  signals: GuardSignal[];
};

/**
 * Spanish plate alphabets.
 * Modern (2000-): 4 digits + 3 letters drawn from the CONSONANT set only
 * (vowels and Ñ/Q are excluded by the DGT). Restricting to that set is what
 * keeps `2492 F`-style cadastral tokens and 4-digit street numbers out.
 */
const PLATE_CONSONANTS = 'BCDFGHJKLMNPRSTVWXYZ';

const RULES: Array<{ kind: StripKind; re: RegExp }> = [
  // 1. URLs first — a URL can CONTAIN a token that later rules would match, and
  //    stripping the whole URL is strictly safer than stripping part of it.
  { kind: 'url', re: /\b(?:https?:\/\/|www\.)\S+/gi },

  // 2. CSV token: the keyword, then the alphanumeric/`:`/`-` token that follows.
  //    Anchored on the phrase so it cannot fire on ordinary prose.
  {
    kind: 'csv-token',
    re: /\bc[óo]digo\s+seguro\s+de\s+verificaci[óo]n\b[\s:]*[A-Za-z0-9:_-]*/gi,
  },
  // 2b. The companion boilerplate sentence, which carries no address value.
  { kind: 'csv-token', re: /\bpuede\s+verificar\s+este\s+documento\s+en\b/gi },

  // 3. Explicit vehicle-identifier keyword + its value. Highest confidence:
  //    the corpus literally labels these ("MATRICULA E6037HTP").
  {
    kind: 'plate-explicit',
    re: /\b(?:matr[íi]cula|bastidor)\b[\s.:#-]*[A-Za-z0-9-]{4,20}/gi,
  },

  // 4. Bare modern plate, e.g. "5751GTS" / "5751 GTS" / "5751-GTS".
  //    Word-bounded and restricted to the DGT consonant set.
  {
    kind: 'plate-modern',
    re: new RegExp(`\\b[0-9]{4}[\\s-]?[${PLATE_CONSONANTS}]{3}\\b`, 'gi'),
  },

  // 5. Old provincial plate ("CR-8348-X", "M-1234-AB) — ONLY when a vehicle
  //    keyword is present in the same string. Unconditionally stripping this
  //    shape would destroy road designations (`BV-1123`) and cadastral refs,
  //    which the corpus sweep showed are 17x more common than real old plates.
  {
    kind: 'plate-old',
    re: /\b[A-Z]{1,2}[\s-][0-9]{4}[\s-][A-Z]{1,2}\b/g,
  },
];

/** Vehicle context required before the ambiguous old-plate rule may fire. */
const VEHICLE_CONTEXT = /\b(?:matr[íi]cula|bastidor|marca|modelo|veh[íi]culo|turismo|coche|remolque|ciclomotor|motocicleta)\b/i;

/**
 * Strip personal / sensitive identifiers from descriptor text.
 * Pure and deterministic: same input → same output and same signals.
 */
export function guardDescriptor(raw: string | null | undefined): GuardResult {
  const signals: GuardSignal[] = [];
  if (!raw || !raw.trim()) return { text: '', signals };

  let text = raw;

  for (const rule of RULES) {
    if (rule.kind === 'plate-old' && !VEHICLE_CONTEXT.test(text)) continue;
    text = text.replace(rule.re, (m) => {
      signals.push({ kind: rule.kind, matched: m.trim() });
      return ' ';
    });
  }

  // Collapse the holes the strips left, and tidy dangling separators so the
  // slugifier does not emit runs of hyphens where an identifier used to be.
  text = text
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*,\s*,+/g, ', ')
    .replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '')
    .trim();

  return { text, signals };
}

/** Convenience: did the guard find anything sensitive? */
export function hasSensitiveContent(raw: string | null | undefined): boolean {
  return guardDescriptor(raw).signals.length > 0;
}
