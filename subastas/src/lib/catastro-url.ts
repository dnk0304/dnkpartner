/**
 * catastro-url — build the public Sede Electrónica del Catastro URL for a
 * given referencia catastral (RC, a 20-character Spanish cadastral ID).
 *
 * Endpoint used:
 *   https://www1.sedecatastro.gob.es/CYCBienInmueble/OVCConCiud.aspx?RefC=<RC>
 *
 * This is the canonical "consulta descriptiva y gráfica" entry point. For a
 * valid 20-char RC it renders the full property record (address, surface,
 * use, building epoch, attached unit graphic). For a non-existent or
 * malformed RC the same endpoint returns a friendly Spanish error page
 * ("La información catastral del inmueble consultado no se puede mostrar…")
 * — no 404, no scary message, just a back button. That's exactly the
 * gracefully-degrading behaviour we want for the ~14 active rows we have
 * RCs for today.
 *
 * The alternative `Cartografia/mapa.aspx?refcat=<RC>` URL was rejected
 * because it lands on the generic Spain map tool without auto-zooming to
 * the property (verified live 2026-06-03).
 *
 * Validation:
 *   - Trim, upper-case.
 *   - Reject if the result isn't exactly 20 chars of [A-Z0-9].
 *   - Reject empty / null / whitespace.
 *
 * Returns null for any invalid input so callers can `if (url)` themselves.
 *
 * Usage:
 *   const href = buildCatastroUrl(auction.cadastralRef);
 *   if (href) renderLink(href);
 */
const CATASTRO_BASE =
  'https://www1.sedecatastro.gob.es/CYCBienInmueble/OVCConCiud.aspx';

const RC_PATTERN = /^[A-Z0-9]{20}$/;

/**
 * Build the public Catastro consultation URL for a referencia catastral.
 *
 * @param rc - Raw RC string from the auction row. May be null / empty / wrong
 *             length / lower-cased — the helper normalises and validates.
 * @returns The Catastro URL, or null when `rc` is missing or doesn't match
 *          the canonical 20-char `[A-Z0-9]` shape.
 */
export function buildCatastroUrl(rc: string | null | undefined): string | null {
  if (!rc) return null;
  const normalised = rc.trim().toUpperCase();
  if (!RC_PATTERN.test(normalised)) return null;
  // URL-encoding is unnecessary for the [A-Z0-9] payload, but pass through
  // `encodeURIComponent` anyway so any future relaxation of the pattern (e.g.
  // accepting refs with dots) doesn't introduce an injection vector.
  return `${CATASTRO_BASE}?RefC=${encodeURIComponent(normalised)}`;
}
