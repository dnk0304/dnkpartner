import { readFileSync } from 'node:fs';
import path from 'node:path';
import { municipalityKey } from '@/lib/geo/municipality-key';

/**
 * RUNTIME read side of the INE municipality gazetteer.
 *
 * Purpose: answer one question — *"is this raw corpus string actually the name
 * of a Spanish municipality?"* — so that a stored `Auction.municipality` value
 * can be **validated** before it is allowed into a permanent URL.
 *
 * `scripts/build-cp-municipality-table.ts` builds the same gazetteer at BUILD
 * time to generate `cp-municipality.json`. This module is the MINT-time twin.
 * Both read the SAME two generated CSVs and both key through the SAME
 * `municipalityKey` normalizer, so a name that resolved for the table resolves
 * here identically. If they ever diverge the table stops being an authority —
 * which is why neither re-implements the normalizer.
 *
 * ── TIERING (copied in spirit from the builder, and for the same reason) ─────
 *   tier 1 — `ine_municipalities.csv` (the official register) answers first.
 *   tier 2 — `ine_municipalities_coofficial.csv` answers only if tier 1 is silent.
 *
 * The co-official file carries genuine errors — it lists `Sevilla` against INE
 * 41023 (Cantillana) as well as against the real 41091. Flat (untiered) lookup
 * therefore calls "Sevilla" ambiguous and Spain's fourth city fails to resolve.
 * Tiering makes the official register authoritative and stops a co-official-only
 * claim outvoting it. Deterministic; never consults row counts.
 *
 * ⚠️ NO FUZZY MATCHING, deliberately. A typo (`"Vitoria-Gaseiz"`) MUST fail to
 * resolve. Under the URL precedence ladder a failure to resolve degrades the row
 * to the province page — which is correct. Silently snapping a typo onto the
 * nearest real municipality would mint a permanently WRONG URL, and a wrong
 * permanent URL is worse than a missing one.
 */

export type GazetteerEntry = {
  /** 5-digit INE municipality code. */
  ine: string;
  /** The official (tier-1) denomination for that INE code. */
  official: string;
  province: string;
  /** Which register answered: 1 = official, 2 = co-official/compound. */
  tier: 1 | 2;
};

const REPO = path.join(process.cwd());
const INE_OFFICIAL = path.join(REPO, 'scraper/config/ine_municipalities.csv');
const INE_COOFFICIAL = path.join(REPO, 'scraper/config/ine_municipalities_coofficial.csv');

function splitCsvLine(line: string): string[] {
  // The generated files are simple: no embedded commas inside quoted fields.
  // Kept minimal on purpose — a CSV parser dependency here would be overkill
  // and would risk diverging from the builder's own splitter.
  return line.split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
}

function readIne(file: string): Array<{ ine: string; municipio: string; provincia: string }> {
  const text = readFileSync(file, 'utf8').replace(/^﻿/, '');
  const lines = text
    .split(/\r?\n/)
    // `#` lines are the provenance banner (INE source URL, edition date, sha256)
    // written by scripts/build-ine-gazetteer.py. Not data.
    .filter((l) => l.trim().length > 0 && !l.startsWith('#'));
  lines.shift(); // header
  const rows: Array<{ ine: string; municipio: string; provincia: string }> = [];
  for (const line of lines) {
    const [ine, municipio, provincia] = splitCsvLine(line);
    if (!ine || !municipio) continue;
    // Sub-municipal entity rows (EATIM / pedanías) carry 11-digit codes and are
    // NOT municipalities — they must never become resolvable targets.
    const code = ine.padStart(5, '0');
    if (!/^[0-9]{5}$/.test(code)) continue;
    rows.push({ ine: code, municipio, provincia: provincia ?? '' });
  }
  return rows;
}

type Index = {
  /** municipalityKey(name) -> entry. Ambiguous keys are ABSENT, never guessed. */
  byKey: Map<string, GazetteerEntry>;
  officialByIne: Map<string, { official: string; province: string }>;
  size: number;
};

let CACHE: Index | null = null;

function build(): Index {
  const official = readIne(INE_OFFICIAL);
  const coofficial = readIne(INE_COOFFICIAL);

  const officialByIne = new Map<string, { official: string; province: string }>();
  for (const r of official) {
    if (!officialByIne.has(r.ine)) {
      officialByIne.set(r.ine, { official: r.municipio, province: r.provincia });
    }
  }

  const byKey = new Map<string, GazetteerEntry>();
  const ambiguous = new Set<string>();

  const add = (name: string, ine: string, tier: 1 | 2) => {
    const key = municipalityKey(name);
    if (!key) return;
    const existing = byKey.get(key);
    if (existing) {
      // Same INE code re-stated (e.g. an alternate spelling) is not a conflict.
      if (existing.ine === ine) return;
      // A tier-1 answer always beats a tier-2 claim.
      if (existing.tier === 1 && tier === 2) return;
      if (existing.tier === 2 && tier === 1) {
        const off = officialByIne.get(ine);
        byKey.set(key, {
          ine,
          official: off?.official ?? name,
          province: off?.province ?? '',
          tier: 1,
        });
        ambiguous.delete(key);
        return;
      }
      // Same-tier collision between two different INE codes -> genuinely
      // ambiguous. Refuse to name it rather than pick one.
      ambiguous.add(key);
      return;
    }
    const off = officialByIne.get(ine);
    byKey.set(key, { ine, official: off?.official ?? name, province: off?.province ?? '', tier });
  };

  for (const r of official) add(r.municipio, r.ine, 1);
  for (const r of coofficial) add(r.municipio, r.ine, 2);

  // Bilingual compounds the corpus actually writes: INE stores `Vitoria`
  // (official) and `Gasteiz` (co-official) as two names of one code, while every
  // BOE row says `Vitoria-Gasteiz`. Derived from the register, not invented.
  const namesByIne = new Map<string, Set<string>>();
  for (const r of [...official, ...coofficial]) {
    if (!namesByIne.has(r.ine)) namesByIne.set(r.ine, new Set());
    namesByIne.get(r.ine)!.add(r.municipio);
  }
  for (const [ine, names] of namesByIne) {
    if (names.size < 2) continue;
    const list = [...names];
    for (const a of list) {
      for (const b of list) {
        if (a === b) continue;
        add(`${a}-${b}`, ine, 2);
      }
    }
  }

  for (const key of ambiguous) byKey.delete(key);

  return { byKey, officialByIne, size: byKey.size };
}

function index(): Index {
  if (!CACHE) CACHE = build();
  return CACHE;
}

/**
 * Resolve a raw corpus municipality string against the INE register.
 * Returns `null` when the string is not a municipality name, or is ambiguous.
 * Never throws, never guesses, never fuzzy-matches.
 */
export function lookupMunicipality(raw: string | null | undefined): GazetteerEntry | null {
  const key = municipalityKey(raw ?? '');
  if (!key) return null;
  return index().byKey.get(key) ?? null;
}

/** True iff `raw` names a real Spanish municipality unambiguously. */
export function isKnownMunicipality(raw: string | null | undefined): boolean {
  return lookupMunicipality(raw) !== null;
}

export function gazetteerSize(): number {
  return index().size;
}

/** Test seam: drop the memoized index so a test can rebuild it. */
export function __resetGazetteerCache(): void {
  CACHE = null;
}
