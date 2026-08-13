import { resolveCpMunicipality } from '@/lib/geo/cp-municipality';
import {
  lookupMunicipality,
  lookupMunicipalityCandidates,
  type GazetteerEntry,
} from '@/lib/geo/municipality-gazetteer';
import { municipalityKey } from '@/lib/geo/municipality-key';
import { PROVINCE_DB_KEY_TO_SLUG, slugify } from '@/lib/seo/slugs';

/**
 * Compare two province names through the canonical slug map so
 * "Illes Balears"/"Baleares" and "A Coruña"/"a-coruna" compare equal.
 */
function sameProvince(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const sa = PROVINCE_DB_KEY_TO_SLUG[a] ?? slugify(a);
  const sb = PROVINCE_DB_KEY_TO_SLUG[b] ?? slugify(b);
  return Boolean(sa) && sa === sb;
}

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
  /** Stored name IS a municipality, but one in a DIFFERENT province than the row. */
  | 'province-mismatch-stored'
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

export type TownNameResolution =
  | { status: 'resolved'; municipality: string; ine: string; province: string }
  | {
      status: 'degraded';
      reason: Extract<
        TownDegradeReason,
        'stored-not-in-gazetteer' | 'province-mismatch-stored' | 'no-municipality' | 'no-province'
      >;
    };

/**
 * ⭐ THE ONE PLACE a raw corpus municipality string becomes a canonical town.
 *
 * This is rung 2 of the ladder above, lifted out so it has exactly one
 * definition and two callers:
 *
 *   • `resolveTown` (below) — the v3 detail-URL mint, which reaches here only
 *     after the postcode table has stayed silent;
 *   • the v4 ARCHIVE layer, via `resolveArchiveMunicipality`, which has no
 *     postcode to consult because it works over (province, municipality)
 *     AGGREGATES, not rows.
 *
 * Before MUNI-A the archive had no resolution at all: it took
 * `DISTINCT(municipality)` straight off the corpus, so `Msdrid`, `Madrdi` and
 * seven more misspellings each minted their own permanent town URL, districts
 * posed as municipalities, and `Valencia` filed under Madrid. The register is
 * now the only source of towns, and this function is the gate.
 *
 * Two things it does that a bare `lookupMunicipality` cannot:
 *
 *  1. PROVINCE CROSS-CHECK. A gazetteer hit proves the string names *a* Spanish
 *     municipality, never that it names one in THIS row's province. `Oropesa`
 *     under Castellón is Oropesa del Mar; the register's `Oropesa` is in Toledo.
 *     Mismatch DEGRADES.
 *  2. PROVINCE-SCOPED DISAMBIGUATION. Conversely, the 17 names two provinces
 *     share (`Torrent`, `Cieza`, `Mieres`, `Sada`…) are unresolvable nationally
 *     but perfectly determined once the province is known. Nationally-ambiguous
 *     names were costing 863 auctions and 26 real municipalities their town hub.
 *     Choosing among candidates BY THE REGISTER'S OWN PROVINCE COLUMN is not
 *     guessing, and it cannot invent a cross-province match — the province is
 *     part of the test, not an afterthought.
 *
 * Still no fuzzy matching, deliberately. A typo matches no candidate and
 * degrades to the province, exactly as `municipality-gazetteer` promises.
 * Dirty data costs us COVERAGE, which Ghost's normalisation pass recovers; it
 * must never cost us a wrong permanent URL, which nothing recovers.
 */
export function resolveTownName(input: {
  province: string | null | undefined;
  storedMunicipality: string | null | undefined;
}): TownNameResolution {
  if (typeof input.province !== 'string' || input.province.trim() === '') {
    return { status: 'degraded', reason: 'no-province' };
  }
  const storedRaw = (input.storedMunicipality ?? '').trim();
  if (!storedRaw) return { status: 'degraded', reason: 'no-municipality' };

  const candidates = lookupMunicipalityCandidates(storedRaw);
  if (candidates.length === 0) {
    return { status: 'degraded', reason: 'stored-not-in-gazetteer' };
  }

  const inProvince = candidates.filter((c) => sameProvince(c.province, input.province));
  // Zero survivors means the name is real but belongs somewhere else.
  if (inProvince.length === 0) {
    return { status: 'degraded', reason: 'province-mismatch-stored' };
  }
  // Two survivors would mean one province lists two distinct municipalities under
  // one name. INE contains no such case (measured: zero). If the register ever
  // gains one, DEGRADE — the whole point is that we never pick between equals.
  if (inProvince.length > 1) {
    return { status: 'degraded', reason: 'stored-not-in-gazetteer' };
  }

  const hit: GazetteerEntry = inProvince[0];
  return {
    status: 'resolved',
    // The INE OFFICIAL denomination, never the corpus spelling — this is what
    // collapses nine spellings of Madrid onto one town hub.
    municipality: hit.official,
    ine: hit.ine,
    province: hit.province,
  };
}

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
  // Delegated to `resolveTownName` so the archive layer and the mint cannot
  // drift apart; the commentary on the province cross-check lives there now.
  {
    const byName = resolveTownName({
      province: input.province,
      storedMunicipality: storedRaw,
    });
    if (byName.status === 'resolved') {
      return {
        status: 'resolved',
        municipality: byName.municipality,
        ine: byName.ine,
        source: 'stored-gazetteer',
      };
    }
    if (byName.reason === 'province-mismatch-stored') {
      return {
        status: 'degraded',
        source: 'province',
        reason: 'province-mismatch-stored',
        storedMunicipality: storedRaw,
      };
    }
  }

  // ── Rung 3: degrade. ──────────────────────────────────────────────────────
  return {
    status: 'degraded',
    source: 'province',
    reason: storedRaw ? 'stored-not-in-gazetteer' : 'no-municipality',
  };
}
