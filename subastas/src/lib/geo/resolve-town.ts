import { resolveCpMunicipality } from '@/lib/geo/cp-municipality';
import { lookupMunicipality } from '@/lib/geo/municipality-gazetteer';
import { municipalityKey } from '@/lib/geo/municipality-key';

/**
 * TOWN RESOLUTION for the v3 permanent URL scheme — Ken's precedence ladder
 * (ruled 2026-08-04).
 *
 *   1. CP-MUNI deterministic  — the postcode→municipality table is the authority.
 *   2. Stored municipality    — ONLY where it matches a gazetteer entry.
 *                               A raw unvalidated string degrades.
 *   3. Province page          — no town segment, no guessed slug.
 *
 * ⭐ THE RULE THAT MATTERS: **contradictions DEGRADE, they never choose.**
 * "Lenient" means *fall back when CP-MUNI is SILENT*, never *override when it
 * DISAGREES*. If CP-MUNI says X and the stored municipality says Y, this
 * returns `province` — it does NOT pick X, and it does NOT pick Y. Two
 * authorities disagreeing is a data-quality signal, and the only safe response
 * when the output is a PERMANENT URL is to decline to mint one.
 *
 * Every conflict is counted and every resolution records WHICH SOURCE it used,
 * so a future dispute about a URL is answerable without re-deriving anything.
 *
 * ⛔ Quarantined rows never reach this function — they are excluded upstream by
 * the mint query. Isolation is only worth something if the mint respects it.
 */

export type TownSource =
  /** Rung 1 — the CP→municipality table resolved the postcode deterministically. */
  | 'cp-muni'
  /** Rung 2 — CP-MUNI was silent; the stored municipality validated against INE. */
  | 'stored-gazetteer'
  /** Rung 3 — degrade to the province page. */
  | 'province';

export type TownDegradeReason =
  /** CP-MUNI and the stored municipality name two DIFFERENT municipalities. */
  | 'conflict-cp-vs-stored'
  /** CP-MUNI silent, and the stored string is not a municipality (or ambiguous). */
  | 'stored-not-in-gazetteer'
  /** CP-MUNI silent and there is no stored municipality at all. */
  | 'no-municipality'
  /** The row has no usable province either — it cannot be placed at all. */
  | 'no-province';

export type TownResolution =
  | {
      status: 'resolved';
      /** INE canonical municipality name, ready to slug. */
      municipality: string;
      /** 5-digit INE code when known — the stable join key. */
      ine: string | null;
      source: Exclude<TownSource, 'province'>;
    }
  | {
      status: 'degraded';
      source: 'province';
      reason: TownDegradeReason;
      /** Populated on a conflict so the signal is actionable, not just counted. */
      cpMunicipality?: string;
      storedMunicipality?: string;
    };

export type TownInput = {
  postalCode: string | null | undefined;
  /** The row's own stored `Auction.municipality` — raw, untrusted. */
  storedMunicipality: string | null | undefined;
  province: string | null | undefined;
};

export function resolveTown(input: TownInput): TownResolution {
  const hasProvince = typeof input.province === 'string' && input.province.trim() !== '';
  if (!hasProvince) {
    return { status: 'degraded', source: 'province', reason: 'no-province' };
  }

  const cp = resolveCpMunicipality(input.postalCode);
  const cpName = cp.status === 'mapped' ? cp.municipality : null;

  const storedRaw = (input.storedMunicipality ?? '').trim();
  const storedEntry = storedRaw ? lookupMunicipality(storedRaw) : null;

  // ── Rung 1: CP-MUNI is the authority when it speaks. ──────────────────────
  if (cpName) {
    // But it does not get to speak OVER a validated stored name that disagrees.
    // Compare through the shared normalizer so "Sant Josep de sa Talaia" vs
    // "SANT JOSEP DE SA TALAIA" is agreement, not a conflict.
    if (storedEntry) {
      const cpEntry = lookupMunicipality(cpName);
      const sameByIne = cpEntry && cpEntry.ine === storedEntry.ine;
      const sameByKey = municipalityKey(cpName) === municipalityKey(storedRaw);
      if (!sameByIne && !sameByKey) {
        return {
          status: 'degraded',
          source: 'province',
          reason: 'conflict-cp-vs-stored',
          cpMunicipality: cpName,
          storedMunicipality: storedRaw,
        };
      }
    }
    // Agreement, or the stored value is junk we can simply ignore in favour of
    // the deterministic table. Note we do NOT treat unvalidated-stored as a
    // conflict: an unrecognisable string is noise, not a competing claim.
    return {
      status: 'resolved',
      municipality: cpName,
      ine: cp.status === 'mapped' ? cp.ine : null,
      source: 'cp-muni',
    };
  }

  // ── Rung 2: CP-MUNI silent → stored municipality, gazetteer-validated. ────
  if (storedEntry) {
    return {
      status: 'resolved',
      // Emit the INE OFFICIAL denomination, not the corpus spelling, so two
      // rows spelling the same town differently cannot mint two town segments.
      municipality: storedEntry.official,
      ine: storedEntry.ine,
      source: 'stored-gazetteer',
    };
  }

  // ── Rung 3: degrade. ──────────────────────────────────────────────────────
  return {
    status: 'degraded',
    source: 'province',
    reason: storedRaw ? 'stored-not-in-gazetteer' : 'no-municipality',
  };
}
