/**
 * Shared text-normalization for grouping/comparison keys.
 *
 * Single source of truth for the province/municipality fold logic that the
 * counts route and the list route both rely on. Keeping this in one place
 * is the whole point — the two routes used to carry inline copies and that
 * is exactly how they drifted (see DISPATCH-BRIEF-FORGE-count-hierarchy-sync
 * §4a).
 *
 * Behaviour:
 *   - NFD-decompose, then strip combining marks (accents).
 *   - Lowercase.
 *   - Trim leading/trailing whitespace.
 *   - Collapse any run of internal whitespace into a single space (the
 *     scraper has produced trailing-space and `"Madrid "` variants in the
 *     past; collapsing keeps the grouping key tight).
 *
 * This is NOT a display formatter. Callers needing a human label should
 * pick a canonical raw variant (e.g. prefer one with uppercase chars) and
 * fall back to `normalizeText` only for the grouping key.
 */
export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}
