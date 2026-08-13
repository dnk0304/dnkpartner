/**
 * verify-municipality-whitelist — the reproducible proof for Ken's MUNI-A ruling.
 *
 *   npx tsx scripts/verify-municipality-whitelist.ts            # report + guard
 *   npx tsx scripts/verify-municipality-whitelist.ts --csv      # machine-readable
 *
 * ---------------------------------------------------------------------------
 * WHAT IT PROVES
 *
 * `/resultados/madrid/municipios` said "Los 302 municipios de Madrid" against a
 * true INE count of 179. The archive derived town hubs from
 * `DISTINCT(municipality)` over scraped `Auction` rows, so nine misspellings of
 * Madrid, several city DISTRICTS, and other provinces' capitals each minted a
 * permanent town URL. Ken's ruling made the INE register the only source of
 * towns. This script re-derives the whole town tree from the committed prod
 * rollup and asserts the ruling holds, so the claim is re-runnable from a clean
 * checkout instead of resting on a number someone once pasted into Discord.
 *
 * It runs entirely off two COMMITTED artefacts and needs no database:
 *   • `scripts/archive-rollup-2026-08-13.csv` — the prod rollup produced by the
 *     committed query in `scripts/archive-rollup-sql.ts`;
 *   • `scraper/config/ine_municipalities*.csv` — the INE register.
 *
 * ---------------------------------------------------------------------------
 * ⛔ IT IS ALSO THE GUARD (Ken's task 4: "a non-gazetteer municipality FAILS
 * LOUDLY — it must not fall through to a plausible value").
 *
 * Non-zero exit on any of:
 *   G1  a town hub whose name is not the INE official denomination;
 *   G2  a town hub in a province the register does not place it in;
 *   G3  a province emitting MORE town hubs than that province has municipalities
 *       (structurally impossible unless the whitelist has been bypassed);
 *   G4  two hubs sharing one URL slug within a province;
 *   G5  a hub with zero rows (the planner refuses zero-row partitions, so such a
 *       hub is a 301 target that 404s).
 *
 * G3 is the one that would have caught the original defect on day one.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { foldArchiveMunicipalities, resolveArchiveMunicipality } from '../src/lib/registro/archive-municipality';
import { lookupMunicipalityCandidates } from '../src/lib/geo/municipality-gazetteer';
import { PROVINCE_DB_KEY_TO_SLUG, slugify } from '../src/lib/seo/slugs';
import { safeMunicipioSegment } from '../src/lib/seo/archive-partitions';
import { archiveTownRedirect } from '../src/lib/registro/archive-town-redirect';

const ROLLUP_CSV = path.join(process.cwd(), 'scripts/archive-rollup-2026-08-13.csv');
const INE_OFFICIAL = path.join(process.cwd(), 'scraper/config/ine_municipalities.csv');

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

const provinceSlug = (p: string): string => PROVINCE_DB_KEY_TO_SLUG[p] ?? slugify(p);

/** INE municipality count per province — the expected ceiling. */
function ineCountsByProvince(): Map<string, number> {
  const text = readFileSync(INE_OFFICIAL, 'utf8').replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'));
  lines.shift();
  const counts = new Map<string, number>();
  for (const line of lines) {
    const [ine, municipio, provincia] = splitCsvLine(line).map((s) => s.trim().replace(/^"|"$/g, ''));
    if (!ine || !municipio) continue;
    const code = ine.padStart(5, '0');
    // 11-digit sub-municipal entities are not municipalities.
    if (!/^[0-9]{5}$/.test(code)) continue;
    const key = provinceSlug(provincia ?? '');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

type ProvinceResult = {
  province: string;
  before: number;
  after: number;
  ineExpected: number | null;
  coverageCost: number;
  auctions: number;
};

/**
 * Named behavioural cases for the resolver itself.
 *
 * These live here, behind `--self-test`, rather than in a `.test.ts` because
 * this repo has NO vitest config and no vitest dependency — `src/lib/geo/*.test.ts`
 * cannot resolve `@/` and has never executed (a known, recorded blocker). A
 * proof that cannot run is indistinguishable from no proof, so the convention
 * already used by `guard:url-v3:selftest` is followed instead: the assertions
 * run under `tsx`, in CI, with everything else.
 *
 * Each case names the real defect it pins down.
 */
function selfTest(): number {
  type Case = { why: string; province: string; input: string; expect: string | null };
  const cases: Case[] = [
    // The defect that started MUNI-A: nine spellings, one town.
    { why: 'exact official name resolves', province: 'Madrid', input: 'Madrid', expect: 'Madrid' },
    { why: 'typo must NOT snap to Madrid', province: 'Madrid', input: 'Msdrid', expect: null },
    { why: 'typo must NOT snap to Madrid', province: 'Madrid', input: 'Madrdi', expect: null },
    { why: 'typo must NOT snap to Madrid', province: 'Madrid', input: 'Maddrid', expect: null },
    { why: 'truncation must NOT resolve', province: 'Madrid', input: 'Madri', expect: null },
    // Districts are not municipalities — no district relation exists to use.
    { why: 'district is not a municipality', province: 'Madrid', input: 'Carabanchel Alto', expect: null },
    { why: 'district is not a municipality', province: 'Madrid', input: 'Puente de Vallecas', expect: null },
    { why: 'district is not a municipality', province: 'Madrid', input: 'Aravaca', expect: null },
    // Cross-province misfiles: real municipality, wrong province -> degrade.
    { why: 'cross-province misfile degrades', province: 'Madrid', input: 'Valencia', expect: null },
    { why: 'cross-province misfile degrades', province: 'Madrid', input: 'Murcia', expect: null },
    { why: 'Oropesa/Toledo must not claim Castellón', province: 'Castellón', input: 'Oropesa', expect: null },
    { why: 'Abanto/Zaragoza must not claim Bizkaia', province: 'Bizkaia', input: 'Abanto', expect: null },
    // Province-scoped disambiguation: nationally ambiguous, locally certain.
    { why: 'Torrent resolves in Valencia', province: 'Valencia', input: 'Torrent', expect: 'Torrent' },
    { why: 'Torrent resolves in Girona', province: 'Girona', input: 'Torrent', expect: 'Torrent' },
    { why: 'Torrent must NOT resolve in Madrid', province: 'Madrid', input: 'Torrent', expect: null },
    { why: 'Cieza resolves in Murcia', province: 'Murcia', input: 'Cieza', expect: 'Cieza' },
    { why: 'Arroyomolinos resolves in Madrid', province: 'Madrid', input: 'Arroyomolinos', expect: 'Arroyomolinos' },
    // Canonicalisation: corpus spelling in, official denomination out.
    { why: 'case/accent variants collapse', province: 'Madrid', input: 'ALCALA DE HENARES', expect: 'Alcalá de Henares' },
    // The generated register stores the UN-inverted form, so both the INE
    // spelling ("Coruña, A") and the corpus spelling ("A Coruña") land on the
    // same tier-1 entry and the same display name.
    { why: 'corpus article form resolves', province: 'A Coruña', input: 'A Coruña', expect: 'A Coruña' },
    { why: 'INE inverted article form resolves', province: 'A Coruña', input: 'Coruña, A', expect: 'A Coruña' },
    // Empty / junk sentinels.
    { why: 'empty degrades', province: 'Madrid', input: '', expect: null },
    { why: 'no province degrades', province: '', input: 'Madrid', expect: null },
  ];

  let failed = 0;
  for (const c of cases) {
    const got = resolveArchiveMunicipality(c.province, c.input);
    const gotName = got ? got.name : null;
    if (gotName !== c.expect) {
      failed++;
      console.log(
        `  FAIL [${c.why}] (${c.province || '<none>'}, "${c.input}") -> ` +
          `${gotName === null ? 'null' : `"${gotName}"`}, expected ${c.expect === null ? 'null' : `"${c.expect}"`}`,
      );
    }
  }
  console.log(`self-test: ${cases.length - failed}/${cases.length} passed`);
  return failed === 0 ? 0 : 1;
}

function main(): number {
  if (process.argv.includes('--self-test')) return selfTest();
  const asCsv = process.argv.includes('--csv');

  const raw = readFileSync(ROLLUP_CSV, 'utf8').split(/\r?\n/);
  const header = splitCsvLine(raw[0]);
  const iProv = header.indexOf('province');
  const iMuni = header.indexOf('municipality');
  const iN = header.indexOf('n');
  if (iProv < 0 || iMuni < 0 || iN < 0) {
    console.error(`FAIL: unexpected rollup header: ${header.join(',')}`);
    return 2;
  }

  // Fold the rollup to (province -> raw municipality -> auctions).
  const perProvince = new Map<string, Map<string, number>>();
  let auctionsTotal = 0;
  let noProvince = 0;
  let provinceOnly = 0;
  for (let i = 1; i < raw.length; i++) {
    if (!raw[i]) continue;
    const f = splitCsvLine(raw[i]);
    const prov = f[iProv];
    const muni = f[iMuni];
    const n = Number(f[iN] || 0);
    auctionsTotal += n;
    if (!prov) {
      noProvince += n;
      continue;
    }
    if (!muni) {
      provinceOnly += n;
      continue;
    }
    if (!perProvince.has(prov)) perProvince.set(prov, new Map());
    const g = perProvince.get(prov)!;
    g.set(muni, (g.get(muni) ?? 0) + n);
  }

  const ineCounts = ineCountsByProvince();
  const failures: string[] = [];
  const results: ProvinceResult[] = [];
  let beforeTotal = 0;
  let afterTotal = 0;
  let coverageTotal = 0;
  let redirectsToTown = 0;
  let redirectsToProvince = 0;

  for (const [province, group] of [...perProvince].sort((a, b) => a[0].localeCompare(b[0], 'es'))) {
    const rows = [...group].map(([name, total]) => ({ name, total }));
    const folded = foldArchiveMunicipalities(province, rows);
    const expected = ineCounts.get(provinceSlug(province)) ?? null;

    const seenSlugs = new Map<string, string>();
    for (const town of folded.resolved) {
      // G1 / G2 — the register must recognise the emitted name, in this province.
      const candidates = lookupMunicipalityCandidates(town.name);
      const match = candidates.find((c) => c.ine === town.ine);
      if (!match) {
        failures.push(`G1 ${province}: emitted town "${town.name}" (INE ${town.ine}) is not an INE official denomination`);
      } else if (provinceSlug(match.province) !== provinceSlug(province)) {
        failures.push(`G2 ${province}: emitted town "${town.name}" belongs to ${match.province}, not ${province}`);
      }
      // G4 — one slug, one town.
      const clash = seenSlugs.get(town.slug);
      if (clash) failures.push(`G4 ${province}: slug "${town.slug}" emitted by both "${clash}" and "${town.name}"`);
      else seenSlugs.set(town.slug, town.name);
      // G5 — a zero-row hub is a 404 wearing a URL.
      if (town.total <= 0) failures.push(`G5 ${province}: town "${town.name}" has ${town.total} rows`);
    }

    // G3 — the structural one. More hubs than the register has municipalities
    // means something reached the tree without passing the whitelist.
    if (expected !== null && folded.resolved.length > expected) {
      failures.push(`G3 ${province}: ${folded.resolved.length} town hubs > ${expected} INE municipalities`);
    }

    // ── 301 census ──────────────────────────────────────────────────────────
    // Every town slug that is LIVE today (i.e. some corpus name slugified to it)
    // but is not a canonical hub after the whitelist needs a redirect. Classify
    // each by where `archiveTownRedirect` actually sends it, and assert the
    // floor: nothing may be left without a target, and no target may be a hub
    // that does not exist.
    const canonicalSlugs = new Set(folded.resolved.map((t) => t.slug));
    const liveSlugs = new Set<string>();
    for (const r of rows) {
      const s = slugify(r.name);
      if (s) liveSlugs.add(safeMunicipioSegment(s));
    }
    const pSlug = provinceSlug(province);
    for (const slug of liveSlugs) {
      if (canonicalSlugs.has(slug)) continue;
      const target = archiveTownRedirect(pSlug, slug);
      if (target === null) {
        // Register-canonical but no rows: the hub does not exist, so a "do not
        // redirect" answer here would leave a live URL 404ing.
        redirectsToProvince++;
        continue;
      }
      if (target.kind === 'town') {
        if (!canonicalSlugs.has(target.slug)) {
          failures.push(
            `G6 ${province}: /${pSlug}/${slug} would 301 to /${pSlug}/${target.slug}, which is not a live hub (301 -> 404)`,
          );
        } else redirectsToTown++;
      } else redirectsToProvince++;
    }

    const auctions = rows.reduce((a, r) => a + r.total, 0);
    beforeTotal += group.size;
    afterTotal += folded.resolved.length;
    coverageTotal += folded.unresolvedTotal;
    results.push({
      province,
      before: group.size,
      after: folded.resolved.length,
      ineExpected: expected,
      coverageCost: folded.unresolvedTotal,
      auctions,
    });
  }

  if (asCsv) {
    console.log('province,before,after,ine_expected,coverage_cost,auctions');
    for (const r of results) {
      console.log(
        `"${r.province}",${r.before},${r.after},${r.ineExpected ?? ''},${r.coverageCost},${r.auctions}`,
      );
    }
  } else {
    console.log('== MUNICIPALITY WHITELIST — town hubs per province ==');
    console.log('(source: committed prod rollup archive-rollup-2026-08-13.csv + INE register)');
    console.log('');
    console.log('province                 before   after     INE   short   cost(rows)');
    for (const r of results) {
      const short = r.ineExpected === null ? '' : String(r.ineExpected - r.after);
      console.log(
        `${r.province.padEnd(24)}${String(r.before).padStart(6)}${String(r.after).padStart(8)}` +
          `${String(r.ineExpected ?? '-').padStart(8)}${short.padStart(8)}${String(r.coverageCost).padStart(12)}`,
      );
    }
    console.log('');
    console.log(`TOWN HUBS            ${beforeTotal} -> ${afterTotal}   (removed ${beforeTotal - afterTotal})`);
    console.log(`301s ADDED           ${redirectsToTown + redirectsToProvince}`);
    console.log(`  -> canonical town  ${redirectsToTown}  (register-identifiable alternate denominations)`);
    console.log(`  -> province hub    ${redirectsToProvince}  (typos, districts, cross-province misfiles)`);
    console.log(`AUCTIONS             ${auctionsTotal} total`);
    console.log(`  no province        ${noProvince}  (location-free shelf)`);
    console.log(`  province, no muni  ${provinceOnly}`);
    console.log(
      `  COVERAGE COST      ${coverageTotal} rows fall back to province level ` +
        `(${((coverageTotal / auctionsTotal) * 100).toFixed(2)}% of all auctions) — MUNI-B recovers these`,
    );
    const madrid = results.find((r) => r.province === 'Madrid');
    if (madrid) {
      console.log('');
      console.log(
        `MADRID  ${madrid.before} -> ${madrid.after} town hubs (INE has ${madrid.ineExpected}; ` +
          `${(madrid.ineExpected ?? 0) - madrid.after} Madrid municipalities have no concluded auctions)`,
      );
    }
  }

  console.log('');
  if (failures.length > 0) {
    console.log(`GUARD FAILED — ${failures.length} violation(s):`);
    for (const f of failures.slice(0, 40)) console.log(`  ${f}`);
    if (failures.length > 40) console.log(`  ... and ${failures.length - 40} more`);
    return 1;
  }
  console.log('GUARD PASSED — every town hub is an INE municipality of its own province.');
  return 0;
}

process.exit(main());
