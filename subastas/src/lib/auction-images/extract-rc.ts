/**
 * Spanish cadastral reference extractor.
 *
 * Standard Spanish "referencia catastral" is a 20-character alphanumeric code,
 * e.g. 9872023VH5797S0001WX. It is embedded in BOE lote text and the auction
 * detail page; the live scraper does NOT currently capture it (verified 2026-05-30:
 * 0 of 2,028 active rows had a non-null cadastralRef).
 *
 * This helper is wired into the image resolver as a best-effort: if any of the
 * row's text fields happens to contain an RC, we use it. A dedicated BOE-detail
 * scraper enrichment pass (separate dispatch) is the real fix; this is the
 * minimum to make the Catastro path do useful work once RC values arrive.
 */

// 20-char Spanish refcatastral. Anchors enforce a word boundary so we don't
// match the middle of a longer hex string.
export const RC_PATTERN = /\b([0-9]{4}[A-Z]{2}[0-9]{4}[A-Z][0-9]{4}[A-Z]{2})\b/g;

export function extractFirstRC(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.toUpperCase().match(RC_PATTERN);
  return m && m[0] ? m[0] : null;
}

export function extractRCFromRow(row: {
  cadastralRef?: string | null;
  cadastralData?: string | null;
  lotDescription?: string | null;
  propertyDescription?: string | null;
  boeAnnouncement?: string | null;
  address?: string | null;
}): string | null {
  if (row.cadastralRef && /^[0-9A-Z]{20}$/i.test(row.cadastralRef.trim())) {
    return row.cadastralRef.trim().toUpperCase();
  }
  const candidates = [
    row.cadastralData,
    row.lotDescription,
    row.propertyDescription,
    row.boeAnnouncement,
    row.address,
  ];
  for (const c of candidates) {
    const hit = extractFirstRC(c);
    if (hit) return hit;
  }
  return null;
}
