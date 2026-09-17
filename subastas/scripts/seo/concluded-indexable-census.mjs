#!/usr/bin/env node
/**
 * concluded-indexable-census.mjs — how many concluded auction pages does the
 * content bar actually index, and WHICH ARM rejects the rest?
 *
 * ─── WHY ─────────────────────────────────────────────────────────────────
 *
 * Content bar v1 (2026-09-17 morning) required 40 words of scraped BOE prose.
 * Nothing went red; the number nobody was counting was that 108,015 of the
 * 175,148 concluded-with-outcome rows — 62 % of the registry — hold fewer than
 * 40 words, and 99,536 of them were rejected by that arm ALONE (the rest had
 * already failed an earlier arm), while every one of them already rendered a
 * complete page. This is the counter: run it BEFORE and AFTER any change to
 * the bar. Measured totals 2026-09-17: v1 66,349 indexable, v2 167,996.
 *
 * ─── ⭐ THE VACUITY RULE (read before adding a signal) ────────────────────
 *
 *   ANY SIGNAL WITH A FILL RATE >= 99 % IS VACUOUS AND MUST BE REMOVED FROM
 *   THE SIGNAL SET.
 *
 * A signal present on (nearly) every row carries no information: scoring it
 * silently turns "2 of 4" into "1 of 3" with nothing failing anywhere. That is
 * how `category` (a NON-NULLABLE column, 100.00 % filled) nearly got scored, and
 * why `boeId` (`String @unique`) was rejected before it. The fill-rate table is
 * printed FIRST, before any before/after numbers, precisely so the next person
 * meets this fact before they meet the totals.
 *
 * Note that a REQUIRED arm can be near-vacuous too and is worth the same
 * scepticism — `province` is `String` NOT NULL and measured 99.49 % non-blank,
 * so it rejects ~900 rows, not the 175k it appears to be guarding.
 *
 * ─── ⚠️ THIS SCRIPT TRANSCRIBES THE PREDICATE INTO SQL ───────────────────
 *
 * `src/lib/seo/concluded-indexable.ts` is the single source of truth; a .mjs
 * script run against a psql pipe cannot import it. The SQL below is therefore a
 * SECOND expression of the same rule, and the two can drift. Mitigations:
 *   - the arms are printed at the top of every run, so a reader can diff them
 *     against the TS file by eye in ten seconds;
 *   - `concluded-content-bar.test.ts` §5 pins the TS pair (in-memory gate vs
 *     Prisma WHERE) against each other, so only THIS file can be the odd one out;
 *   - if you change the bar, change this file in the same commit.
 *
 * ─── USAGE ───────────────────────────────────────────────────────────────
 *
 *   # print the SQL and run it yourself
 *   node scripts/seo/concluded-indexable-census.mjs --print-sql
 *
 *   # run it against prod, READ-ONLY (this is how it was run for wave217):
 *   CENSUS_PSQL="ssh -i C:/hetzner_dnk root@167.235.53.57 \
 *     \"docker exec -i <pg-container> psql -U dnksubastas -d dnksubastas -f -\"" \
 *     node scripts/seo/concluded-indexable-census.mjs
 *
 *   CENSUS_PSQL must be a command that reads SQL on STDIN. The script issues
 *   SELECTs only — no UPDATE/INSERT/DDL, no transaction, nothing to roll back.
 */

import { spawn } from 'node:child_process';

const PRINT_ONLY = process.argv.includes('--print-sql');

// ── The predicate, transcribed. Keep in step with concluded-indexable.ts. ──
const CONCLUDED_STATUSES = ['CONCLUIDA_PORTAL', 'FINALIZADA_AUTORIDAD', 'FINISHED'];
const OUTCOMES = ['ADJUDICADA', 'DESIERTA'];
const V1_CATEGORIES = [
  'Viviendas', 'Otros inmuebles', 'Garajes', 'Naves industriales', 'Fincas rústicas',
  'Terrenos', 'Locales', 'Trasteros', 'Turismos', 'Motocicletas', 'Vehículos Industriales', 'Barcos',
];
const V1_MIN_WORDS = 40;
const MIN_SIGNALS = 2;

const q = (xs) => xs.map((x) => `'${x.replace(/'/g, "''")}'`).join(',');
/** Non-blank, TRIM-aware — matches the in-memory `filled()`, not the looser SQL fragment. */
const filled = (c) => `btrim(coalesce(${c},'')) <> ''`;

const ARMS = [
  ['REQUIRED status', `status IN (${q(CONCLUDED_STATUSES)})`],
  ['REQUIRED outcome', `"saleResult" IN (${q(OUTCOMES)})`],
  ['REQUIRED province', filled('province')],
  ['REQUIRED municipality', filled('municipality')],
  ['SIGNAL   date', `("endsAt" IS NOT NULL OR "soldDate" IS NOT NULL)`],
  ['SIGNAL   price', `(coalesce("soldPrice",0) > 0 OR coalesce("valorSubasta",0) > 0)`],
  ['SIGNAL   text', `(${filled('"lotDescription"')} OR ${filled('address')})`],
];
const SIG = ARMS.filter(([k]) => k.startsWith('SIGNAL')).map(([, e]) => e);
const REQ = ARMS.filter(([k]) => k.startsWith('REQUIRED')).map(([, e]) => e);

const AFTER = `${REQ.join(' AND ')} AND (${SIG.map((s) => `(${s})::int`).join(' + ')}) >= ${MIN_SIGNALS}`;

// v1 (what wave216 serves today), for the BEFORE tables. The recency floor is
// OFF on prod (SEO_CONCLUDED_MAX_AGE_MONTHS=0, verified in the container), so it
// is omitted from BOTH sides — this census measures the content bar, not the ramp.
const V1_WORDS = `coalesce(array_length(regexp_split_to_array(btrim(coalesce("lotDescription",'')||' '||coalesce("propertyDescription",'')), '\\s+'), 1), 0)`;
const V1_SIGNALS = [
  `(coalesce("appraisalValue",0) > 0 OR coalesce("valorSubasta",0) > 0)`,
  filled('"cadastralRef"'),
  `(${filled('"courtReference"')} OR ${filled('"courtName"')})`,
  `("endsAt" IS NOT NULL)`,
];
const BEFORE = `status IN (${q(CONCLUDED_STATUSES)}) AND category IN (${q(V1_CATEGORIES)})
    AND ${filled('municipality')} AND ${V1_WORDS} >= ${V1_MIN_WORDS}
    AND (${V1_SIGNALS.map((s) => `(${s})::int`).join(' + ')}) >= ${MIN_SIGNALS}`;

const POP = `status IN (${q(CONCLUDED_STATUSES)}) AND "saleResult" IN (${q(OUTCOMES)})`;

/** year bucket — endsAt is the auction's real end; soldDate is the fallback. */
const YEAR = `extract(year from coalesce("endsAt","soldDate"))::int`;

/** Mutually exclusive failing-arm label, evaluated in priority order. */
const failLabel = (pred, extra) => `CASE
      WHEN ${pred} THEN 'indexable'
      ${extra}
      ELSE 'other' END`;

const SQL = `
\\pset border 2
\\pset footer off

\\echo '== 0. POPULATION =========================================================='
SELECT count(*) AS concluded_with_outcome FROM "Auction" WHERE ${POP};

\\echo ''
\\echo '== 1. SIGNAL FILL RATE  (>= 99.0% = VACUOUS, remove from the signal set) =='
WITH pop AS (SELECT * FROM "Auction" WHERE ${POP}), t AS (SELECT count(*)::numeric AS n FROM pop)
SELECT s.arm, s.present, to_char(100*s.present/t.n,'990.99') AS pct,
       CASE WHEN s.arm LIKE '%status%' OR s.arm LIKE '%outcome%' THEN 'n/a (defines the population)'
            WHEN 100*s.present/t.n >= 99 THEN 'VACUOUS' ELSE '' END AS verdict
FROM t, (
${ARMS.map(([k, e]) => `  SELECT '${k}' AS arm, count(*) FILTER (WHERE ${e})::numeric AS present, ${ARMS.findIndex(([kk]) => kk === k)} AS ord FROM pop`).join('\n  UNION ALL\n')}
  UNION ALL SELECT 'ref      category (not an arm)', count(*) FILTER (WHERE ${filled('category')})::numeric, 99 FROM pop
) s ORDER BY s.ord;

\\echo ''
\\echo '== 2. COMPONENT FILL RATE (which half of each OR is carrying it) ========='
WITH pop AS (SELECT * FROM "Auction" WHERE ${POP})
SELECT count(*) FILTER (WHERE "endsAt" IS NOT NULL) AS endsat,
       count(*) FILTER (WHERE "soldDate" IS NOT NULL) AS solddate,
       count(*) FILTER (WHERE coalesce("soldPrice",0) > 0) AS soldprice,
       count(*) FILTER (WHERE coalesce("valorSubasta",0) > 0) AS valorsubasta,
       count(*) FILTER (WHERE ${filled('"lotDescription"')}) AS lotdesc,
       count(*) FILTER (WHERE ${filled('address')}) AS address,
       count(*) FILTER (WHERE ${V1_WORDS} >= ${V1_MIN_WORDS}) AS v1_40_words
FROM pop;

\\echo ''
\\echo '== 3. BEFORE (wave216, v1 40-word bar) — by year ========================='
WITH pop AS (SELECT * FROM "Auction" WHERE ${POP})
SELECT ${YEAR} AS year,
       count(*) FILTER (WHERE ${BEFORE}) AS indexable,
       count(*) FILTER (WHERE NOT (${BEFORE})) AS noindex,
       count(*) AS total
FROM pop GROUP BY 1 ORDER BY 1;

\\echo ''
\\echo '== 4. BEFORE — by failing arm (mutually exclusive, priority order) ======='
WITH pop AS (SELECT * FROM "Auction" WHERE ${POP})
SELECT ${failLabel(
  BEFORE,
  `WHEN NOT ${filled('municipality')} THEN 'stub: no municipality'
       WHEN category NOT IN (${q(V1_CATEGORIES)}) THEN 'category off the 12-label list'
       WHEN ${V1_WORDS} < ${V1_MIN_WORDS} THEN 'prose < ${V1_MIN_WORDS} words'
       WHEN (${V1_SIGNALS.map((s) => `(${s})::int`).join(' + ')}) < ${MIN_SIGNALS} THEN '< ${MIN_SIGNALS} signals'`,
)} AS arm, count(*) FROM pop GROUP BY 1 ORDER BY 2 DESC;

\\echo ''
\\echo '== 5. AFTER (content bar v2) — by year ==================================='
WITH pop AS (SELECT * FROM "Auction" WHERE ${POP})
SELECT ${YEAR} AS year,
       count(*) FILTER (WHERE ${AFTER}) AS indexable,
       count(*) FILTER (WHERE NOT (${AFTER})) AS noindex,
       count(*) AS total
FROM pop GROUP BY 1 ORDER BY 1;

\\echo ''
\\echo '== 6. AFTER — by failing arm (mutually exclusive, priority order) ========'
WITH pop AS (SELECT * FROM "Auction" WHERE ${POP})
SELECT ${failLabel(
  AFTER,
  `WHEN NOT ("saleResult" IN (${q(OUTCOMES)})) THEN 'stub: no outcome'
       WHEN NOT ${filled('municipality')} THEN 'stub: no municipality'
       WHEN NOT ${filled('province')} THEN 'stub: no province'
       WHEN (${SIG.map((s) => `(${s})::int`).join(' + ')}) < ${MIN_SIGNALS} THEN '< ${MIN_SIGNALS} signals'`,
)} AS arm, count(*) FROM pop GROUP BY 1 ORDER BY 2 DESC;

\\echo ''
\\echo '== 7. DELTA =============================================================='
WITH pop AS (SELECT * FROM "Auction" WHERE ${POP})
SELECT count(*) FILTER (WHERE ${BEFORE}) AS before_indexable,
       count(*) FILTER (WHERE ${AFTER}) AS after_indexable,
       count(*) FILTER (WHERE ${AFTER} AND NOT (${BEFORE})) AS gained,
       count(*) FILTER (WHERE ${BEFORE} AND NOT (${AFTER})) AS lost
FROM pop;

\\echo ''
\\echo '== 8. INVARIANT: sitemap subset of indexable ============================='
\\echo '   The sitemap band is concludedIndexableWhere() + inScope, and v2 makes'
\\echo '   that WHERE the whole predicate. The only way a sitemapped URL could'
\\echo '   render noindex is the documented trim asymmetry (Prisma cannot trim),'
\\echo '   whitespace_only_rows must be 0. indexable_but_out_of_scope is'
\echo '   INFORMATIONAL, not a violation: the sitemap ANDs inScope=true and the'
\echo '   detail route 404s an out-of-scope row, so those rows are simply a'
\echo '   strict subset never published and never rendered.'
WITH pop AS (SELECT * FROM "Auction" WHERE ${POP})
SELECT count(*) FILTER (WHERE
         (province IS NOT NULL AND province <> '' AND NOT ${filled('province')})
      OR (municipality IS NOT NULL AND municipality <> '' AND NOT ${filled('municipality')})
      OR ("lotDescription" IS NOT NULL AND "lotDescription" <> '' AND NOT ${filled('"lotDescription"')})
      OR (address IS NOT NULL AND address <> '' AND NOT ${filled('address')})
       ) AS whitespace_only_rows,
       count(*) FILTER (WHERE ${AFTER} AND NOT "inScope") AS indexable_but_out_of_scope
FROM pop;
`;

function main() {
  console.log('Predicate transcribed by this script (diff against concluded-indexable.ts):');
  for (const [k, e] of ARMS) console.log(`  ${k}  ${e}`);
  console.log(`  threshold: >= ${MIN_SIGNALS} of ${SIG.length} signals\n`);

  if (PRINT_ONLY) {
    console.log(SQL);
    return;
  }
  const cmd = process.env.CENSUS_PSQL;
  if (!cmd) {
    console.error('CENSUS_PSQL is not set. Pass --print-sql, or see the usage block at the top.');
    process.exit(2);
  }
  const child = spawn(cmd, { shell: true, stdio: ['pipe', 'inherit', 'inherit'] });
  child.stdin.end(SQL);
  child.on('exit', (code) => process.exit(code ?? 1));
}

main();
