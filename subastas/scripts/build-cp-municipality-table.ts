/**
 * Build the canonical postcode (CP) -> municipality table.
 *
 *   npm run build:cp-municipality
 *
 * Regenerable by one command, on purpose: Ghost refetches the corpus
 * periodically, and a hand-curated table would rot the moment that happened.
 * Nothing in here is edited by hand — re-run it and commit the diff.
 *
 * ============================ THE RULES ============================
 *
 * 1. DETERMINISTIC, NEVER STATISTICAL.
 *    A postcode that maps to exactly one municipality is answered. A postcode
 *    that maps to several is recorded as a CONFLICT with all of its candidates
 *    and their support counts, and is NOT resolvable. We never take the most
 *    frequent candidate and present it as fact.
 *
 * 2. QUARANTINED ROWS DO NOT VOTE.
 *    `geo_quarantine_20260803` holds the rows whose geo is known-suspect
 *    (the "en su caso" -> municipality `Caso` boilerplate defect class lives
 *    there). Letting them vote would launder bad geo into the authority that
 *    everything else resolves against. They are excluded at the SQL level.
 *
 * 3. ONLY REAL MUNICIPALITIES VOTE.
 *    A corpus name only counts if it resolves against the INE gazetteer
 *    (`scraper/config/ine_municipalities.csv` + the co-official name list).
 *    Barrios, pedanías, provinces-used-as-towns and typos are NOT
 *    municipalities; they are counted as discarded noise per postcode and
 *    reported, never promoted. This is a membership test against the official
 *    register — deterministic, not a popularity contest.
 *
 * 4. PROVENANCE PER ROW.
 *    Every mapping records how many corpus rows support it and whether the
 *    postcode was unanimous (i.e. zero rows had to be discarded). A future
 *    dispute about a URL is answerable from the table itself.
 *
 * Outputs:
 *   src/data/cp-municipality.json          runtime table (mapped CPs only)
 *   src/data/cp-municipality-report.json   full diagnostics: conflicts,
 *                                          province mismatches, unresolved
 */

import { Client } from 'pg';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { municipalityKey } from '../src/lib/geo/municipality-key';

const REPO = path.resolve(__dirname, '..');
const INE_OFFICIAL = path.join(REPO, 'scraper/config/ine_municipalities.csv');
const INE_COOFFICIAL = path.join(REPO, 'scraper/config/ine_municipalities_coofficial.csv');
const OUT_TABLE = path.join(REPO, 'src/data/cp-municipality.json');
const OUT_REPORT = path.join(REPO, 'src/data/cp-municipality-report.json');

const QUARANTINE_TABLE = 'geo_quarantine_20260803';

type IneMunicipality = { ine: string; name: string; province: string };

/** Minimal RFC-4180 line splitter — the INE files contain commas inside names. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

let rejectedGazetteerRows = 0;

function readIne(file: string): Array<{ ine: string; municipio: string; provincia: string }> {
  const text = readFileSync(file, 'utf8').replace(/^﻿/, '');
  // `#` lines are the generated provenance banner (INE source URL, edition
  // date, sha256) that scripts/build-ine-gazetteer.py writes into the file so
  // its age is answerable without archaeology. Not data.
  const lines = text
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0 && !l.startsWith('#'));
  lines.shift(); // header
  const rows: Array<{ ine: string; municipio: string; provincia: string }> = [];
  for (const line of lines) {
    const [ine, municipio, provincia] = splitCsvLine(line);
    if (!ine || !municipio) continue;
    // `ine_municipalities.csv` is polluted with sub-municipal entity rows
    // (EATIM / pedanías) carrying 11-digit codes — "Alcolea/04007000200",
    // "Solduengo/09043000300". Those are NOT municipalities and must never
    // become resolvable targets. A municipality code is exactly 5 digits.
    const code = ine.padStart(5, '0');
    if (!/^[0-9]{5}$/.test(code)) {
      rejectedGazetteerRows += 1;
      continue;
    }
    rows.push({ ine: code, municipio, provincia: provincia ?? '' });
  }
  return rows;
}

/**
 * The gazetteer is TIERED, and the tiers are resolved in order:
 *
 *   tier 1 — names from `ine_municipalities.csv` (the official register).
 *   tier 2 — names from `ine_municipalities_coofficial.csv`, plus the
 *            hyphenated compounds of an INE code's own names.
 *
 * Tiering exists because the co-official file carries genuine errors: it
 * lists `Sevilla` against INE 41023 (which is Cantillana) as well as against
 * the real 41091. Without tiers `"Sevilla"` is "ambiguous" and Spain's fourth
 * city fails to resolve. With tiers, the official register answers first and
 * a co-official-only claim can never outvote it. That is a precedence rule
 * over two fixed registers — deterministic, and it never consults row counts.
 *
 * The compounds cover the bilingual official forms the corpus actually
 * writes: INE stores `Vitoria` (official) and `Gasteiz` (co-official) as two
 * separate names, while every BOE row says `Vitoria-Gasteiz`. Joining an INE
 * code's OWN names is derived from the register, not invented.
 */
function buildGazetteer() {
  const official = readIne(INE_OFFICIAL);
  const coofficial = readIne(INE_COOFFICIAL);

  const canonical = new Map<string, IneMunicipality>();
  for (const r of official) {
    canonical.set(r.ine, { ine: r.ine, name: r.municipio, province: r.provincia });
  }
  for (const r of coofficial) {
    if (!canonical.has(r.ine)) {
      canonical.set(r.ine, { ine: r.ine, name: r.municipio, province: r.provincia });
    }
  }

  const tier1 = new Map<string, Map<string, IneMunicipality>>();
  const tier2 = new Map<string, Map<string, IneMunicipality>>();
  const add = (
    into: Map<string, Map<string, IneMunicipality>>,
    name: string,
    ine: string,
  ) => {
    const key = municipalityKey(name);
    if (!key) return;
    const entry = canonical.get(ine);
    if (!entry) return;
    let bucket = into.get(key);
    if (!bucket) {
      bucket = new Map();
      into.set(key, bucket);
    }
    bucket.set(ine, entry);
  };

  for (const r of official) add(tier1, r.municipio, r.ine);
  for (const r of coofficial) add(tier2, r.municipio, r.ine);

  // Bilingual compounds, both orders, from each code's own registered names.
  const namesByIne = new Map<string, Set<string>>();
  for (const r of [...official, ...coofficial]) {
    let s = namesByIne.get(r.ine);
    if (!s) {
      s = new Set();
      namesByIne.set(r.ine, s);
    }
    s.add(r.municipio);
  }
  for (const [ine, names] of namesByIne) {
    const list = [...names];
    if (list.length < 2) continue;
    for (const a of list) {
      for (const b of list) {
        if (a === b) continue;
        add(tier2, `${a}-${b}`, ine);
      }
    }
  }

  return { tier1, tier2, canonical };
}

type Vote = { ine: string; rows: number };

type DiscardReason =
  /** the name is not in the INE register at all: barrio, pedanía, typo, junk */
  | 'not_a_municipality'
  /** the name IS a municipality, but not in the province this postcode belongs to */
  | 'province_prefix_mismatch'
  /** two same-province municipalities share the name; nothing left to separate them */
  | 'ambiguous_name';

type Discard = { reason: DiscardReason; name: string; rows: number };

async function run() {
  const url = process.env.DATABASE_URL;
  if (!url || !/^postgres(ql)?:\/\//.test(url)) {
    throw new Error(
      'DATABASE_URL must be set to the Postgres corpus connection string (read-only use).',
    );
  }

  const { tier1, tier2, canonical } = buildGazetteer();
  console.log(
    `[gazetteer] ${canonical.size} INE municipalities · tier1 names ${tier1.size} · tier2 names ${tier2.size} · rejected non-municipal rows ${rejectedGazetteerRows}`,
  );

  const client = new Client({ connectionString: url });
  await client.connect();

  // Universe figure: every row carrying a 5-digit postcode, quarantined or not.
  // This is the denominator the site actually faces at request time.
  const universe = await client.query<{
    rows_with_cp: string;
    rows_quarantined_with_cp: string;
    rows_total: string;
  }>(`
    SELECT
      count(*) FILTER (WHERE a."postalCode" ~ '^[0-9]{5}$')                     AS rows_with_cp,
      count(*) FILTER (WHERE a."postalCode" ~ '^[0-9]{5}$' AND q.id IS NOT NULL) AS rows_quarantined_with_cp,
      count(*)                                                                  AS rows_total
    FROM "Auction" a
    LEFT JOIN "${QUARANTINE_TABLE}" q ON q.id = a.id
  `);

  // The voting corpus. Quarantined rows are excluded HERE, in SQL, so no
  // downstream branch can accidentally re-admit them.
  const corpus = await client.query<{ cp: string; municipality: string; n: string }>(`
    SELECT a."postalCode" AS cp, a.municipality AS municipality, count(*)::text AS n
    FROM "Auction" a
    LEFT JOIN "${QUARANTINE_TABLE}" q ON q.id = a.id
    WHERE q.id IS NULL
      AND a."postalCode" ~ '^[0-9]{5}$'
      AND coalesce(a.municipality, '') <> ''
    GROUP BY 1, 2
  `);

  // Rows that carry a CP but cannot vote at all (no municipality string).
  const cpNoMuni = await client.query<{ n: string }>(`
    SELECT count(*)::text AS n
    FROM "Auction" a
    LEFT JOIN "${QUARANTINE_TABLE}" q ON q.id = a.id
    WHERE q.id IS NULL
      AND a."postalCode" ~ '^[0-9]{5}$'
      AND coalesce(a.municipality, '') = ''
  `);

  await client.end();

  type CpState = {
    votes: Map<string, Vote>;
    discards: Map<string, Discard>;
    voteRows: number;
    discardRows: number;
  };
  const cps = new Map<string, CpState>();
  const stateFor = (cp: string): CpState => {
    let s = cps.get(cp);
    if (!s) {
      s = { votes: new Map(), discards: new Map(), voteRows: 0, discardRows: 0 };
      cps.set(cp, s);
    }
    return s;
  };

  let corpusRows = 0;
  for (const row of corpus.rows) {
    const cp = row.cp;
    const n = Number(row.n);
    corpusRows += n;
    const state = stateFor(cp);
    const key = municipalityKey(row.municipality);

    const discard = (reason: Discard['reason']) => {
      state.discardRows += n;
      const dk = `${reason}:${key}`;
      const prev = state.discards.get(dk);
      if (prev) prev.rows += n;
      else state.discards.set(dk, { reason, name: row.municipality, rows: n } as Discard);
    };

    const bucket = key ? (tier1.get(key) ?? tier2.get(key)) : undefined;
    if (!bucket || bucket.size === 0) {
      discard('not_a_municipality');
      continue;
    }

    // The province guard is UNIVERSAL, not a tie-breaker of last resort.
    //
    // A postcode's first two digits are the province code Correos assigned it,
    // and it is the same 2-digit code INE municipality codes carry. Ghost's
    // post-apply check proved this holds for 206,735 of 206,735 corpus rows.
    // So a name that resolves to a municipality in a DIFFERENT province than
    // its own postcode has not resolved — it has collided.
    //
    // Applying this only to nationally-ambiguous names (the earlier shape of
    // this code) let single-candidate collisions straight through: the corpus
    // writes the Valencian `Torrent`, INE lists `Torrent` only in Girona and
    // the Valencian one as `Torrente`, so 393 Valencia rows resolved to
    // Girona unopposed. Same class: `Oropesa` (Toledo vs Oropesa del Mar,
    // Castellón), `Aguadulce` (a Sevilla municipality and a Roquetas de Mar
    // barrio). Guarding every candidate kills the whole class.
    const prefix = cp.slice(0, 2);
    const survivors = [...bucket.values()].filter((m) => m.ine.slice(0, 2) === prefix);

    if (survivors.length === 0) {
      discard('province_prefix_mismatch');
      continue;
    }
    if (survivors.length > 1) {
      // Two municipalities of the SAME province sharing a normalized name.
      // Nothing deterministic left to separate them — the row does not vote.
      discard('ambiguous_name');
      continue;
    }
    const chosen = survivors[0];

    state.voteRows += n;
    const prev = state.votes.get(chosen.ine);
    if (prev) prev.rows += n;
    else state.votes.set(chosen.ine, { ine: chosen.ine, rows: n });
  }

  type MappedEntry = {
    municipality: string;
    ine: string;
    province: string;
    /** corpus rows supporting this mapping */
    support: number;
    /** true when every corpus row for this CP agreed and none was discarded */
    unanimous: boolean;
    /** corpus rows discarded as non-municipality / ambiguous */
    discarded: number;
  };

  const table: Record<string, MappedEntry> = {};
  const conflicts: Record<
    string,
    { candidates: Array<{ municipality: string; ine: string; province: string; support: number }>; discarded: number }
  > = {};
  const provinceMismatch: Record<string, MappedEntry & { cpProvincePrefix: string }> = {};
  const unresolved: Record<
    string,
    { rows: number; discarded: Array<{ reason: string; name: string; rows: number }> }
  > = {};

  for (const [cp, state] of [...cps.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const votes = [...state.votes.values()].sort((a, b) => b.rows - a.rows || a.ine.localeCompare(b.ine));

    if (votes.length === 0) {
      unresolved[cp] = {
        rows: state.discardRows,
        discarded: [...state.discards.values()]
          .sort((a, b) => b.rows - a.rows)
          .map((d) => ({ reason: d.reason, name: d.name, rows: d.rows })),
      };
      continue;
    }

    if (votes.length > 1) {
      conflicts[cp] = {
        candidates: votes.map((v) => {
          const m = canonical.get(v.ine)!;
          return { municipality: m.name, ine: m.ine, province: m.province, support: v.rows };
        }),
        discarded: state.discardRows,
      };
      continue;
    }

    const m = canonical.get(votes[0].ine)!;
    const entry: MappedEntry = {
      municipality: m.name,
      ine: m.ine,
      province: m.province,
      support: votes[0].rows,
      unanimous: state.discardRows === 0,
      discarded: state.discardRows,
    };

    // A single municipality whose INE province code contradicts the postcode's
    // own province prefix is not a clean answer — it is a defect. It is NOT a
    // multi-municipality conflict, so it gets its own bucket, and it is kept
    // OUT of the runtime table rather than shipped as authority.
    if (m.ine.slice(0, 2) !== cp.slice(0, 2)) {
      provinceMismatch[cp] = { ...entry, cpProvincePrefix: cp.slice(0, 2) };
      continue;
    }

    table[cp] = entry;
  }

  const rowsWithCp = Number(universe.rows[0].rows_with_cp);
  const rowsQuarantinedWithCp = Number(universe.rows[0].rows_quarantined_with_cp);
  const rowsNoMuni = Number(cpNoMuni.rows[0].n);

  // Row-level reach: of every row the site can be asked about, how many land
  // on a resolvable postcode.
  let rowsOnMapped = 0;
  let rowsOnConflict = 0;
  let rowsOnMismatch = 0;
  let rowsOnUnresolved = 0;
  for (const [cp, state] of cps) {
    const n = state.voteRows + state.discardRows;
    if (table[cp]) rowsOnMapped += n;
    else if (conflicts[cp]) rowsOnConflict += n;
    else if (provinceMismatch[cp]) rowsOnMismatch += n;
    else rowsOnUnresolved += n;
  }

  // Why corpus rows failed to vote, aggregated across every postcode. This is
  // the honest accounting of what the table refused to believe.
  const discardsByReason: Record<DiscardReason, number> = {
    not_a_municipality: 0,
    province_prefix_mismatch: 0,
    ambiguous_name: 0,
  };
  // ...and the names behind it, so the biggest gaps are actionable rather
  // than just a total. The head of this list is the gazetteer's own defect
  // report: `ine_municipalities.csv` carries obsolete Castilian-only names
  // (`Lérida`, `Torrente`, `Sardañola del Vallés`) while the corpus writes
  // the current official ones (`Lleida`, `Torrent`, `Cerdanyola del Vallès`).
  const discardedNames = new Map<string, { reason: DiscardReason; name: string; rows: number }>();
  for (const state of cps.values()) {
    for (const d of state.discards.values()) {
      discardsByReason[d.reason] += d.rows;
      const k = `${d.reason}:${municipalityKey(d.name)}`;
      const prev = discardedNames.get(k);
      if (prev) prev.rows += d.rows;
      else discardedNames.set(k, { reason: d.reason, name: d.name, rows: d.rows });
    }
  }
  const topDiscardedNames = [...discardedNames.values()]
    .sort((a, b) => b.rows - a.rows)
    .slice(0, 60);

  const summary = {
    generatedAt: new Date().toISOString(),
    discardsByReason,
    quarantineTable: QUARANTINE_TABLE,
    ineMunicipalities: canonical.size,
    universe: {
      auctionRowsTotal: Number(universe.rows[0].rows_total),
      auctionRowsWith5DigitCp: rowsWithCp,
      excludedQuarantined: rowsQuarantinedWithCp,
      excludedNoMunicipality: rowsNoMuni,
      votingCorpusRows: corpusRows,
    },
    postcodes: {
      seen: cps.size,
      mapped: Object.keys(table).length,
      conflicted: Object.keys(conflicts).length,
      provinceMismatch: Object.keys(provinceMismatch).length,
      unresolved: Object.keys(unresolved).length,
    },
    rows: {
      onMappedPostcode: rowsOnMapped,
      onConflictedPostcode: rowsOnConflict,
      onProvinceMismatchPostcode: rowsOnMismatch,
      onUnresolvedPostcode: rowsOnUnresolved,
    },
  };

  writeFileSync(
    OUT_TABLE,
    `${JSON.stringify({ generatedAt: summary.generatedAt, entries: table }, null, 0)}\n`,
    'utf8',
  );
  writeFileSync(
    OUT_REPORT,
    `${JSON.stringify(
      { summary, topDiscardedNames, conflicts, provinceMismatch, unresolved },
      null,
      2,
    )}\n`,
    'utf8',
  );

  const pct = (a: number, b: number) => (b === 0 ? '0.0' : ((a / b) * 100).toFixed(1));
  console.log('\n=== CP -> MUNICIPALITY COVERAGE ===');
  console.log(`voting corpus rows       ${corpusRows}`);
  console.log(`  excluded quarantined   ${rowsQuarantinedWithCp}`);
  console.log(`  excluded no-muni       ${rowsNoMuni}`);
  console.log(`postcodes seen           ${cps.size}`);
  console.log(`  mapped                 ${summary.postcodes.mapped} (${pct(summary.postcodes.mapped, cps.size)}%)`);
  console.log(`  conflicted             ${summary.postcodes.conflicted} (${pct(summary.postcodes.conflicted, cps.size)}%)`);
  console.log(`  province mismatch      ${summary.postcodes.provinceMismatch}`);
  console.log(`  unresolved             ${summary.postcodes.unresolved}`);
  console.log(`rows on mapped CP        ${rowsOnMapped} (${pct(rowsOnMapped, corpusRows)}%)`);
  console.log(`rows on conflicted CP    ${rowsOnConflict} (${pct(rowsOnConflict, corpusRows)}%)`);
  console.log(`rows on mismatch CP      ${rowsOnMismatch}`);
  console.log(`rows on unresolved CP    ${rowsOnUnresolved}`);
  console.log(`\nwrote ${OUT_TABLE}`);
  console.log(`wrote ${OUT_REPORT}`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
