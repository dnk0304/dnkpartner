/**
 * teaser-snippet — SAFE-BY-CONSTRUCTION snippet builder for the freemium gate.
 *
 * Source of truth for the ≤280-char "Descripción" snippet rendered in the
 * public SSR teaser AND the field returned by GET /api/auctions/[id] for
 * logged-out / non-qualifying callers.
 *
 * ============================================================================
 * WHY THIS FILE IS THE WAY IT IS — READ BEFORE EDITING
 * ============================================================================
 *
 * The PUBLIC teaser snippet is CONSTRUCTED from known-safe structured fields
 * ONLY. It MUST NEVER include any fragment of `propertyDescription`,
 * `lotDescription`, or `boeAnnouncement` — those are untrusted free text that
 * can embed PII (street address, cadastral ref, IDUFIR, postal code, registry
 * info, court name) inline in the prose for ANY source.
 *
 * The two leak incidents that drove this design:
 *
 *   Leak #1 (BOE rows, 2026-06-04):
 *     `propertyDescription` on BOE rows is a `Key\tValue` dump:
 *         Dirección\tURB LOS OLIVOS 15D, Es: 1. Pl: 00, Pt: 2
 *         Código Postal\t29730
 *         Referencia catastral\t4547941UF8644N0002EQ
 *         IDUFIR\t29025000672205
 *     A naive `slice(0, 277)` over that blob leaked every gated field into
 *     the public SSR HTML + `__next_f` JSON.
 *
 *   Leak #2 (SEGSOCIAL / SUB-SS-* rows, 2026-06-05):
 *     `propertyDescription` on Seguridad Social rows is ONE FREE-PROSE
 *     PARAGRAPH with the street address + cadastral ref written inline in
 *     the sentence (no tabs, no Key\tValue structure). The fix #1 prose
 *     allowlist kept it verbatim → leaked cadastral `0981619YH1708S0002GK`,
 *     "MANUEL DE FALLA", "REFERENCIA CATASTRAL", "Dirección" on a
 *     logged-out detail page.
 *
 * The conclusion: there is NO sanitizer over untrusted prose that we trust.
 * Every "strip Key\tValue" or "regex out cadastrals" rule is a blocklist,
 * and a blocklist will always miss something — a new source, a new layout,
 * a typo in the scraper, an inline mention of a street in a sentence.
 *
 * The senior fix is an ALLOWLIST OF STRUCTURED FIELDS — a field is only
 * eligible for the public snippet if it is structurally guaranteed to never
 * contain an address / cadastral / PII. `propertyDescription`,
 * `lotDescription`, and `boeAnnouncement` ALL fail that bar for EVERY source.
 *
 * The full description stays GATED (logged-in / trial / paid only, via the
 * existing freemium wall) — that's fine, it's behind the wall. Only the
 * PUBLIC teaser is constrained.
 *
 * ============================================================================
 * THE ALLOWLIST (the only fields that may appear in the public snippet)
 * ============================================================================
 *
 *   - tipoBien       — property type / category label (e.g. "Vivienda")
 *   - municipio      — municipality (already in the teaser geo line)
 *   - provincia      — province (already in the teaser geo line)
 *   - statusLabel    — Spanish status label (e.g. "Celebrándose")
 *
 * All four are derived from canonical enum-like columns in the schema; none
 * of them is free-text untrusted prose. If you ever consider adding another
 * field here, the bar is: structurally guaranteed to never contain an
 * address, cadastral ref, IDUFIR, postal code, registry/court detail, or
 * any other identifier that the gate hides. When in doubt, leave it out.
 *
 * ============================================================================
 * SINGLE-SOURCE-OF-TRUTH CONTRACT
 * ============================================================================
 *
 * Both AuctionTeaser.tsx (SSR teaser) and /api/auctions/[id]/route.ts
 * (JSON API for non-qualifying callers) MUST call `pickTeaserSnippet`. The
 * two paths can never drift because there is only one builder.
 */

import { capitalize, titleCase } from '@/components/observatory/format';
import { getStatusMeta } from '@/components/observatory/status';

/**
 * Inputs to the public teaser snippet builder. Every field listed here is
 * an allowlisted, structurally-safe field — see file header for the bar.
 *
 * `frontendStatus` is the slug already used by the rest of the app
 * (`celebrandose`, `proxima-apertura`, `suspendida`, …); we resolve its
 * human label via `getStatusMeta` so the snippet stays in sync with the
 * status badge.
 */
export interface TeaserSnippetInputs {
  /**
   * Property type or fallback auction-type/category label.
   * Examples: "Vivienda", "Inmueble", "Vehículo".
   */
  tipoBien?: string | null;
  /** Municipality name (free text but already exposed as a teaser field). */
  municipio?: string | null;
  /** Province name (free text but already exposed as a teaser field). */
  provincia?: string | null;
  /**
   * Frontend status slug — must be one of the values produced by
   * `effectiveStatus` (e.g. "celebrandose", "proxima-apertura"). The label
   * is resolved through `getStatusMeta` so the public snippet stays in
   * sync with the StatusBadge.
   */
  frontendStatus?: string | null;
}

/**
 * Build the PUBLIC teaser snippet from safe structured inputs.
 *
 * Returns null if there's nothing meaningful to say (no type and no
 * location). The caller should fall back to rendering no snippet at all
 * in that case — the rest of the teaser (title, type, province,
 * municipality, status badge, headline figure) already carries the
 * public intel.
 *
 * Shape of the output (when fully populated):
 *     "{Tipo} en {Municipio} ({Provincia}). {EstadoLabel}."
 *
 * Degrades gracefully when fields are missing:
 *     - no type:        "Subasta en {Municipio} ({Provincia}). {Estado}."
 *     - no municipality:"{Tipo} en {Provincia}. {Estado}."
 *     - no location:    "{Tipo}. {Estado}."
 *     - no status:      drops the trailing sentence.
 *
 * Output is clamped to ≤280 characters as a defensive belt — in practice
 * the constructed string is always far shorter, but the cap matches the
 * original contract so downstream layout assumptions hold.
 */
export function pickTeaserSnippet(
  inputs: TeaserSnippetInputs,
): string | null {
  const tipo = cleanLabel(inputs.tipoBien);
  const muni = inputs.municipio ? titleCase(inputs.municipio) : null;
  const prov = inputs.provincia ? capitalize(inputs.provincia) : null;
  const statusLabel = inputs.frontendStatus
    ? getStatusMeta(inputs.frontendStatus).label
    : null;

  // Compose the "where" fragment. Both, one, or neither may be present.
  let geo: string | null = null;
  if (muni && prov) geo = `${muni} (${prov})`;
  else if (muni) geo = muni;
  else if (prov) geo = prov;

  // Compose the lead sentence: "{Tipo} en {Geo}" / "Subasta en {Geo}" /
  // "{Tipo}" — depending on what's available.
  let lead: string | null = null;
  if (tipo && geo) lead = `${tipo} en ${geo}`;
  else if (tipo) lead = tipo;
  else if (geo) lead = `Subasta en ${geo}`;

  // Bail if there's literally nothing to say. The teaser block will hide
  // the "Descripción" heading and render no snippet (the rest of the
  // teaser already carries title/type/province/municipality/status).
  if (!lead && !statusLabel) return null;

  const parts: string[] = [];
  if (lead) parts.push(`${lead}.`);
  if (statusLabel) parts.push(`${statusLabel}.`);
  const snippet = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (!snippet) return null;

  // Defensive cap — constructed output is far shorter in practice.
  if (snippet.length <= 280) return snippet;
  return snippet.slice(0, 277).trimEnd() + '…';
}

/**
 * Lightly normalise a property-type / category label for display.
 * - Trims and collapses internal whitespace.
 * - Capitalises the first letter (the source columns are mixed-case).
 * - Returns null for empty input so the caller can branch cleanly.
 */
function cleanLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).replace(/\s+/g, ' ').trim();
  if (!trimmed) return null;
  return capitalize(trimmed.toLowerCase());
}
