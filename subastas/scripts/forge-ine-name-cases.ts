/**
 * forge-ine-name-cases — ENUMERATION ONLY (Ken, 2026-08-14).
 *
 * Ken dropped the planned `/resultados/alicante/elche` -> `/elx` 301 and asked
 * instead for the FULL list of INE-official-name vs common-name divergences,
 * at BOTH levels (province and municipio), with real row counts, so provinces
 * and towns get ONE naming policy decided once by Dennis.
 *
 * THIS SCRIPT CHANGES NOTHING. It writes no redirect, mutates no database, and
 * takes no position on which spelling should win. It measures.
 *
 * DATA SOURCES
 *  - names: the INE register (`scraper/config/ine_municipalities*.csv`) via
 *    `allGazetteerEntries()` — the exact same source `archive-town-redirect.ts`
 *    builds its alias map from, so the cases enumerated here are precisely the
 *    cases a register-driven rename would act on.
 *  - counts: the READ-ONLY production database, reached the only way it is
 *    reachable from this box — `ssh -> docker exec -> psql`. There is no direct
 *    TCP route to prod, and fixture counts would be a lie in a decision table,
 *    so the script SHELLS OUT rather than silently substituting local numbers.
 *    Every statement it issues is a SELECT.
 *
 * Run:  npx tsx scripts/forge-ine-name-cases.ts        (cwd must be subastas/)
 *       npx tsx scripts/forge-ine-name-cases.ts --md   markdown table only
 */

import { execFileSync } from 'node:child_process';

import { allGazetteerEntries } from '@/lib/geo/municipality-gazetteer';
import { safeMunicipioSegment } from '@/lib/seo/archive-partitions';
import { SPAIN_PROVINCES } from '@/lib/spain-provinces';
import {
  PROVINCE_ALIAS_TO_CANONICAL,
  PROVINCE_DB_KEY_TO_SLUG,
  slugify,
} from '@/lib/seo/slugs';

// ---------------------------------------------------------------------------
// Prod DB (read-only). Connection per Forge STATE.md.
// ---------------------------------------------------------------------------

const SSH_KEY = '/c/hetzner_dnk';
const SSH_HOST = 'root@167.235.53.57';
const PG_CONTAINER = 'jidtaj7dlaho5km6zru1dbi5';

/** POSIX single-quote a string for the REMOTE shell. */
function shq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * Run one SELECT on prod and return its rows split into fields.
 *
 * Each query projects a single TAB-joined text column: psql's own `-F`
 * separator would have to survive two shells to get here, and a municipality
 * name containing psql's default `|` separator would silently mis-split.
 * A tab cannot occur in these columns.
 */
function psql(sql: string): string[][] {
  const remote =
    `docker exec ${PG_CONTAINER} psql -U dnksubastas -d dnksubastas -tAc ${shq(sql)}`;
  const out = execFileSync(
    'ssh',
    ['-i', SSH_KEY, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', SSH_HOST, remote],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  );
  return out
    .split(/\r?\n/)
    .filter((l) => l.length > 0)
    .map((l) => l.split('	'));
}

// ---------------------------------------------------------------------------
// Slugging — identical to what the live archive does.
// ---------------------------------------------------------------------------

function townSlug(name: string): string {
  const s = slugify(name);
  return s ? safeMunicipioSegment(s) : '';
}

// ---------------------------------------------------------------------------
// Case model
// ---------------------------------------------------------------------------

type Case = {
  level: 'province' | 'municipio';
  province: string; // canonical province slug
  commonSlug: string; // the Castilian / common spelling
  officialSlug: string; // the INE official denomination, slugged
  commonName: string;
  officialName: string;
  commonRows: number;
  officialRows: number;
  /**
   * Rows sitting on the BILINGUAL COMPOUND spelling ("Donostia-San Sebastián",
   * "Pamplona/Iruña") — neither the official nor the alias slug, but a third
   * live URL for the same town. Invisible to the register's alias list (the
   * gazetteer synthesises compounds for LOOKUP only, it does not record them as
   * denominations), and large enough to change the ranking: Donostia's 461 rows
   * all live here. Counted separately so the decision table is not misled.
   */
  compoundRows: number;
  totalRows: number;
  liveIs200: boolean; // the COMMON slug resolves to a hub with >=1 row today
  note: string;
};

function main(): void {
  const mdOnly = process.argv.includes('--md');

  // ---- counts from prod ---------------------------------------------------
  const provRows = psql(
    `select concat_ws(chr(9), province, count(*)) from "Auction" group by province`,
  );
  const muniRows = psql(
    `select concat_ws(chr(9), province, coalesce(municipality, ''), count(*)) ` +
      `from "Auction" group by province, municipality`,
  );

  /** province DB key -> rows */
  const byProvinceKey = new Map<string, number>();
  /** slugified province spelling -> rows (catches literal alt spellings in the corpus) */
  const byProvinceSlug = new Map<string, number>();
  for (const [prov, n] of provRows) {
    const c = Number(n);
    byProvinceKey.set(prov, (byProvinceKey.get(prov) ?? 0) + c);
    const s = slugify(prov);
    if (s) byProvinceSlug.set(s, (byProvinceSlug.get(s) ?? 0) + c);
  }

  /** `${provSlug}|${townSlug}` -> rows. This is exactly the URL identity. */
  const byTownUrl = new Map<string, number>();
  for (const [prov, muni, n] of muniRows) {
    if (!muni) continue;
    const provSlug = PROVINCE_DB_KEY_TO_SLUG[prov] ?? slugify(prov);
    const t = townSlug(muni);
    if (!provSlug || !t) continue;
    const k = `${provSlug}|${t}`;
    byTownUrl.set(k, (byTownUrl.get(k) ?? 0) + Number(n));
  }

  const cases: Case[] = [];

  // ---- LEVEL 1: provinces -------------------------------------------------
  //
  // The province level is inverted relative to towns: the canonical SLUG is
  // already the native form for Girona/Lleida/Ourense/Bizkaia/Gipuzkoa while
  // the display LABEL is the Castilian exonym. A case is any province where the
  // live canonical slug and a recorded alternate spelling of the same province
  // disagree. `ineNameByProvinceKey` is the register's own province column, so
  // "which side is INE-official" is measured, not asserted.
  const ineNameByProvinceKey = new Map<string, string>();
  for (const e of allGazetteerEntries()) {
    if (e.province && !ineNameByProvinceKey.has(e.province)) {
      ineNameByProvinceKey.set(e.province, e.province);
    }
  }

  /** canonical province slug -> every alias slug pointing at it */
  const provAliases = new Map<string, string[]>();
  for (const [alias, canon] of Object.entries(PROVINCE_ALIAS_TO_CANONICAL)) {
    if (alias === canon) continue;
    const list = provAliases.get(canon) ?? [];
    list.push(alias);
    provAliases.set(canon, list);
  }

  for (const p of SPAIN_PROVINCES) {
    const liveSlug = PROVINCE_DB_KEY_TO_SLUG[p.key];
    const ineName = ineNameByProvinceKey.get(p.key) ?? p.key;
    const ineSlug = slugify(ineName);
    const labelSlug = slugify(p.label);
    // Every OTHER recorded spelling of this province: the Castilian display
    // label plus every 301 alias already pointing at the canonical slug.
    const alts = new Set<string>(provAliases.get(liveSlug) ?? []);
    if (labelSlug && labelSlug !== liveSlug) alts.add(labelSlug);
    if (ineSlug && ineSlug !== liveSlug) alts.add(ineSlug);
    if (alts.size === 0) continue;

    const liveRows = byProvinceKey.get(p.key) ?? 0;
    let altRows = 0;
    for (const alt of alts) altRows += byProvinceSlug.get(alt) ?? 0;

    // NO auto-classification of "which side is official" at province level.
    // The register's province column is itself a mixed bag (it writes the
    // Castilian `Alicante`/`Castellón`/`Valencia` but the native `Girona`/
    // `Lleida`/`Ourense`), and `Álava`'s canonical slug is a COMPOUND
    // (`araba-alava`) that matches neither side. Asserting a winner here would
    // be exactly the policy call Ken reserved for Dennis. So: report the live
    // slug, the register's own spelling, and the alternates — and let the
    // human decide.
    cases.push({
      level: 'province',
      province: liveSlug,
      commonSlug: liveSlug,
      officialSlug: ineSlug,
      commonName: p.key,
      officialName: ineName,
      commonRows: liveRows,
      officialRows: altRows,
      compoundRows: 0,
      totalRows: liveRows,
      liveIs200: liveRows > 0,
      note:
        (liveSlug === ineSlug
          ? 'live slug MATCHES the register spelling'
          : `live slug DIFFERS from the register spelling "${ineName}"`) +
        `; display label "${p.label}"; alt spellings: ${[...alts].sort().join(', ')}`,
    });
  }

  // ---- LEVEL 2: municipios ------------------------------------------------
  //
  // Same construction as archive-town-redirect.ts `build()`: official
  // denomination vs every alternate denomination the register records for the
  // same INE code. A case is an alternate whose slug differs from the official
  // slug — i.e. exactly the URLs a register-driven rename would move.
  type Bucket = {
    canonical: Set<string>;
    claims: Map<string, Set<string>>;
    /** official slug -> rows on bilingual-compound spellings of that town. */
    compounds: Map<string, Set<string>>;
  };
  const byProvinceBucket = new Map<string, Bucket>();
  const officialName = new Map<string, string>(); // `${prov}|${slug}` -> name
  const aliasName = new Map<string, string>();

  for (const entry of allGazetteerEntries()) {
    const provSlug = PROVINCE_DB_KEY_TO_SLUG[entry.province] ?? slugify(entry.province);
    if (!provSlug) continue;
    let bucket = byProvinceBucket.get(provSlug);
    if (!bucket) {
      bucket = { canonical: new Set(), claims: new Map(), compounds: new Map() };
      byProvinceBucket.set(provSlug, bucket);
    }
    const off = townSlug(entry.official);
    if (!off) continue;
    bucket.canonical.add(off);
    officialName.set(`${provSlug}|${off}`, entry.official);
    // Compound spellings the corpus actually writes, derived the same way the
    // gazetteer derives them for lookup: every ordered pair of the register's
    // names for this INE code, joined.
    const compoundSlugs = new Set<string>();
    for (const a of entry.names) {
      for (const b of entry.names) {
        if (a === b) continue;
        const cs = townSlug(`${a}-${b}`);
        if (cs && cs !== off) compoundSlugs.add(cs);
      }
    }
    if (compoundSlugs.size > 0) bucket.compounds.set(off, compoundSlugs);
    for (const alias of entry.names) {
      const slug = townSlug(alias);
      if (!slug || slug === off) continue;
      const set = bucket.claims.get(slug) ?? new Set<string>();
      set.add(off);
      bucket.claims.set(slug, set);
      aliasName.set(`${provSlug}|${slug}`, alias);
    }
  }

  for (const [provSlug, bucket] of byProvinceBucket) {
    for (const [aliasSlug, targets] of bucket.claims) {
      const commonRows = byTownUrl.get(`${provSlug}|${aliasSlug}`) ?? 0;
      const notes: string[] = [];
      let target = [...targets][0];
      if (targets.size > 1) {
        notes.push(
          `AMBIGUOUS: alias claimed by ${targets.size} municipalities (${[...targets].join(', ')}) — no redirect is derivable`,
        );
        target = [...targets].sort()[0];
      }
      if (bucket.canonical.has(aliasSlug)) {
        notes.push(
          'alias slug is ALSO another municipality’s own official slug — it must stay canonical',
        );
      }
      const officialRows = byTownUrl.get(`${provSlug}|${target}`) ?? 0;
      let compoundRows = 0;
      for (const cs of bucket.compounds.get(target) ?? []) {
        if (cs === aliasSlug) continue;
        compoundRows += byTownUrl.get(`${provSlug}|${cs}`) ?? 0;
      }
      if (compoundRows > 0) {
        notes.push(`${compoundRows} further rows sit on the BILINGUAL COMPOUND slug`);
      }
      cases.push({
        level: 'municipio',
        province: provSlug,
        commonSlug: aliasSlug,
        officialSlug: target,
        commonName: aliasName.get(`${provSlug}|${aliasSlug}`) ?? aliasSlug,
        officialName: officialName.get(`${provSlug}|${target}`) ?? target,
        commonRows,
        officialRows,
        compoundRows,
        totalRows: commonRows + officialRows + compoundRows,
        liveIs200: commonRows > 0,
        note: notes.join('; '),
      });
    }
  }

  // ---- output -------------------------------------------------------------
  cases.sort(
    (a, b) =>
      b.totalRows - a.totalRows ||
      b.commonRows - a.commonRows ||
      a.province.localeCompare(b.province) ||
      a.commonSlug.localeCompare(b.commonSlug),
  );

  const live = cases.filter((c) => c.totalRows > 0);
  const provinceCases = cases.filter((c) => c.level === 'province');
  const muniCases = cases.filter((c) => c.level === 'municipio');
  const ambiguous = cases.filter((c) => c.note.includes('AMBIGUOUS'));

  if (!mdOnly) {
    console.log('# INE official name vs common name — full case enumeration');
    console.log('');
    console.log('Counts measured against the READ-ONLY PRODUCTION database');
    console.log(`(${SSH_HOST} -> docker exec ${PG_CONTAINER} psql). SELECT only.`);
    console.log('');
  }
  console.log(`- **Total cases:** ${cases.length} (${provinceCases.length} province, ${muniCases.length} municipio)`);
  console.log(`- **With >=1 row (real equity at risk):** ${live.length}`);
  console.log(`- **Where the COMMON slug itself serves >=1 row today (live 200):** ${cases.filter((c) => c.liveIs200).length}`);
  console.log(`- **Zero-row (cosmetic):** ${cases.length - live.length}`);
  console.log(`- **Ambiguous (alias claimed by 2+ municipalities):** ${ambiguous.length}`);
  console.log('');
  console.log('| # | level | province | common / non-official slug | INE official slug | rows behind common | rows behind official | rows on compound | total | live 200? | note |');
  console.log('|--:|---|---|---|---|--:|--:|--:|--:|---|---|');
  cases.forEach((c, i) => {
    console.log(
      `| ${i + 1} | ${c.level} | ${c.province} | \`${c.commonSlug}\` (${c.commonName}) | \`${c.officialSlug}\` (${c.officialName}) | ${c.commonRows} | ${c.officialRows} | ${c.compoundRows} | ${c.totalRows} | ${c.liveIs200 ? 'yes' : 'no'} | ${c.note} |`,
    );
  });
}

main();
