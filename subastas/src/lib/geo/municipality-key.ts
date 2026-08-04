import { normalizeText } from '@/lib/normalize';

/**
 * Grouping key for Spanish municipality names.
 *
 * This is the ONE normalizer shared by the CP->municipality table generator
 * (`scripts/build-cp-municipality-table.ts`) and anything that needs to look a
 * corpus name up against the INE gazetteer. If the generator and a consumer
 * ever normalize differently, the table stops being an authority — so both
 * import this, and nothing re-implements it.
 *
 * On top of `normalizeText` (accent-strip + lowercase + whitespace collapse)
 * it does two things:
 *
 *  1. Un-inverts the INE trailing-article form. INE writes `"Coruña, A"`,
 *     `"Palmas de Gran Canaria, Las"`; the BOE corpus writes `"A Coruña"`,
 *     `"Las Palmas de Gran Canaria"`. Same municipality, so same key.
 *  2. Folds all punctuation to a single space. `"Vitoria-Gasteiz"`,
 *     `"Vitoria Gasteiz"` and `"Vitoria - Gasteiz"` are the same place;
 *     `"L'Alcúdia"` and `"l Alcudia"` are the same place.
 *
 * What it deliberately does NOT do: fuzzy/edit-distance matching. A typo
 * (`"Vitoria-Gaseiz"`) must fail to resolve and be counted as discarded
 * noise, not silently attach itself to the nearest real municipality.
 */

// Castilian, Catalan/Valencian, Galician and Asturian leading articles, as
// they appear in INE's inverted form ("Name, Article").
const TRAILING_ARTICLES = new Set([
  'el',
  'la',
  'los',
  'las',
  'l',
  'els',
  'les',
  'a',
  'as',
  'o',
  'os',
  'lo',
  'es',
  'sa',
  'ses',
  'sos',
  'ses',
]);

export function municipalityKey(value: string | null | undefined): string {
  if (!value) return '';

  // Un-invert BEFORE punctuation folding: the comma is the signal.
  let working = value.trim();
  const comma = working.lastIndexOf(',');
  if (comma > 0) {
    const head = working.slice(0, comma).trim();
    const tail = working.slice(comma + 1).trim();
    const tailKey = normalizeText(tail).replace(/['’]/g, '');
    if (head && tailKey && TRAILING_ARTICLES.has(tailKey)) {
      working = `${tail} ${head}`;
    }
  }

  return normalizeText(working)
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
