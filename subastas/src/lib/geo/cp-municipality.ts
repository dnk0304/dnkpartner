import table from '@/data/cp-municipality.json';

/**
 * Read side of the canonical postcode -> municipality table.
 *
 * The table is generated, never hand-edited: `npm run build:cp-municipality`.
 *
 * Contract, which the URL scheme and the municipality pages both depend on:
 *
 *   - A postcode is resolvable ONLY when the corpus mapped it to exactly one
 *     INE municipality. Conflicted, province-mismatched and unresolved
 *     postcodes are absent from this table by construction.
 *   - An absent postcode returns `{ status: 'unmapped' }`. It never throws,
 *     never guesses a neighbouring municipality, and never returns a partial
 *     entry. Callers degrade — fall back to the province-level page or to the
 *     row's own stored municipality — they do not 500.
 *   - Junk input (null, '', 'ES-28001', '2800', '280012') is `unmapped`, not
 *     an error. Postcodes reach this function from URLs and from scraped
 *     text; both are hostile.
 */

export type CpMunicipality = {
  /** INE canonical municipality name, suitable for display and for slugging. */
  municipality: string;
  /** 5-digit INE municipality code. Stable across renames — key joins on this. */
  ine: string;
  province: string;
  /** How many corpus rows supported this mapping when the table was built. */
  support: number;
  /** True when every corpus row for this postcode agreed and none was discarded. */
  unanimous: boolean;
  /** Corpus rows for this postcode that were discarded as non-municipality names. */
  discarded: number;
};

export type CpResolution =
  | ({ status: 'mapped' } & CpMunicipality)
  | { status: 'unmapped'; postalCode: string | null };

const ENTRIES = (table as { entries: Record<string, CpMunicipality> }).entries;

/** Normalizes to a bare 5-digit postcode, or null if the input is not one. */
export function normalizePostalCode(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^[0-9]{5}$/.test(trimmed) ? trimmed : null;
}

export function resolveCpMunicipality(value: string | null | undefined): CpResolution {
  const postalCode = normalizePostalCode(value);
  if (!postalCode) return { status: 'unmapped', postalCode: null };

  const entry = Object.prototype.hasOwnProperty.call(ENTRIES, postalCode)
    ? ENTRIES[postalCode]
    : undefined;
  if (!entry) return { status: 'unmapped', postalCode };

  return { status: 'mapped', ...entry };
}

/** Convenience: the municipality name, or null when the postcode is not resolvable. */
export function cpMunicipalityName(value: string | null | undefined): string | null {
  const r = resolveCpMunicipality(value);
  return r.status === 'mapped' ? r.municipality : null;
}

export function cpTableSize(): number {
  return Object.keys(ENTRIES).length;
}

export function cpTableGeneratedAt(): string {
  return (table as { generatedAt: string }).generatedAt;
}
