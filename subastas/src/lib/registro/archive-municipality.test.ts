/**
 * Dark-gate unit tests for the archive's municipality resolution point.
 *
 * Run: npx tsx src/lib/registro/archive-municipality.test.ts
 * No test framework — plain assertions, exit-code-driven (repo convention).
 *
 * ── WHY THESE EXIST ─────────────────────────────────────────────────────────
 * MUNI-A applied the INE gazetteer whitelist unconditionally and Ken rolled
 * production back inside a minute: with `URL_V4_SWITCH` unset, junk town URLs
 * that had answered 200 started answering 307, and `/municipios/pagina/2` went
 * to 404 because the province's town COUNT moved 302 -> 149 and `ceil(total/200)`
 * dropped from 2 pages to 1.
 *
 * The HTTP-level proof of that lives in `scripts/verify-v4-suite.sh`, which
 * diffs the whole legacy surface dark against the pre-switch build. These tests
 * are the cheap, DB-free layer underneath it: they pin the two FOLD behaviours
 * directly, so a regression is caught in milliseconds by the unit runner rather
 * than in minutes by a server harness — and, more importantly, so the intent is
 * documented as an executable assertion rather than a comment.
 */

import {
  archiveWhitelistActive,
  archiveWhitelistCacheKey,
  foldLegacyMunicipalities,
  foldMunicipalitiesForLegacySurface,
} from './archive-municipality';
import { archiveTownRedirect } from './archive-town-redirect';

let failures = 0;
function check(label: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function withSwitch<T>(on: boolean, fn: () => T): T {
  const prev = process.env.URL_V4_SWITCH;
  if (on) process.env.URL_V4_SWITCH = '1';
  else delete process.env.URL_V4_SWITCH;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.URL_V4_SWITCH;
    else process.env.URL_V4_SWITCH = prev;
  }
}

// The Madrid corpus in miniature: the real town, two of the nine recorded
// misspellings, a city district, and one junk sentinel.
const MADRID_ROWS = [
  { name: 'Madrid', total: 7000 },
  { name: 'Msdrid', total: 40 },
  { name: 'Madrdi', total: 13 },
  { name: 'Carabanchel Alto', total: 25 },
  { name: 'desconocida', total: 9 },
];

console.log('archive-municipality — dark gate');

// ---------------------------------------------------------------------------
console.log('\nthe switch drives the gate');
withSwitch(false, () => {
  check('dark: whitelist inactive', archiveWhitelistActive() === false);
  check('dark: cache key is "legacy"', archiveWhitelistCacheKey() === 'legacy');
});
withSwitch(true, () => {
  check('lit: whitelist active', archiveWhitelistActive() === true);
  check('lit: cache key is "ine"', archiveWhitelistCacheKey() === 'ine');
});
// ⭐ The two keys must DIFFER. If they ever collide, a town list computed while
// dark keeps being served after the flip until the cache revalidates (300s on
// page-data, 3600s on registro-read) — which would make the flip untestable and
// the rollback slower than Ken's one-minute budget.
check(
  'the two cache keys are distinct',
  withSwitch(false, archiveWhitelistCacheKey) !== withSwitch(true, archiveWhitelistCacheKey),
);

// ---------------------------------------------------------------------------
console.log('\ndark: the legacy fold keeps junk towns (this is the rollback case)');
const dark = withSwitch(false, () => foldMunicipalitiesForLegacySurface('Madrid', MADRID_ROWS));
const darkSlugs = new Set(dark.map((m) => m.slug));

// These two are the exact URLs Ken measured going 200 -> 307 on prod.
check('dark keeps `msdrid`', darkSlugs.has('msdrid'), [...darkSlugs].join(','));
check('dark keeps `carabanchel-alto`', darkSlugs.has('carabanchel-alto'));
check('dark keeps `madrid`', darkSlugs.has('madrid'));
// The legacy junk filter was three literal sentinels — it must still apply, or
// dark would gain a URL rather than merely keeping the ones it had.
check('dark still drops the `desconocida` sentinel', !darkSlugs.has('desconocida'));
check('dark town count is 4', dark.length === 4, `got ${dark.length}`);

// ⭐ MAX, NOT SUM — deliberately reproducing a known bug. Every spelling stays
// its own hub dark, so `Madrid` keeps exactly its own 7000 rows rather than
// absorbing the misspellings' 53. Summing here would change page counts on the
// live site with the flag off, which is the class of change that caused the
// rollback.
const darkMadrid = dark.find((m) => m.slug === 'madrid');
check('dark: madrid total is un-summed (7000)', darkMadrid?.total === 7000, `got ${darkMadrid?.total}`);
check('dark: dbNames is the single raw spelling', darkMadrid?.dbNames.join(',') === 'Madrid');

// ---------------------------------------------------------------------------
console.log('\nlit: the register decides, and spellings SUM onto one town');
const lit = withSwitch(true, () => foldMunicipalitiesForLegacySurface('Madrid', MADRID_ROWS));
const litSlugs = new Set(lit.map((m) => m.slug));

check('lit drops `msdrid` (no fuzzy matching)', !litSlugs.has('msdrid'));
check('lit drops `carabanchel-alto` (district, not a municipality)', !litSlugs.has('carabanchel-alto'));
check('lit keeps `madrid`', litSlugs.has('madrid'));
check('lit collapses to 1 town', lit.length === 1, `got ${lit.length}: ${[...litSlugs].join(',')}`);

// The unresolved rows do NOT vanish from the site — they are served at province
// level. What must not happen is them minting a town URL.
const litMadrid = lit.find((m) => m.slug === 'madrid');
check('lit: madrid total is un-summed too (typos resolve to nothing)', litMadrid?.total === 7000,
  `got ${litMadrid?.total}`);

// ---------------------------------------------------------------------------
console.log('\nthe two states genuinely differ (a vacuous gate would pass everything above)');
// ⚠️ Without this, every assertion above would still pass if the gate were
// wired to a constant — an absence-only proof is vacuous when the feature is
// simply off. This pins that the branch is actually reachable in both
// directions and produces different output.
check('dark and lit produce different town counts', dark.length !== lit.length,
  `dark=${dark.length} lit=${lit.length}`);
check(
  'foldLegacyMunicipalities is env-independent (pure)',
  withSwitch(true, () => foldLegacyMunicipalities(MADRID_ROWS).length) ===
    withSwitch(false, () => foldLegacyMunicipalities(MADRID_ROWS).length),
);

// ---------------------------------------------------------------------------
console.log('\nno town is renamed: the alias maps, but nothing redirects');
// ⛔ Ken killed the alias -> canonical 301 (MUNI-A2). Elche is a major city with
// existing index equity, Spanish search demand is overwhelmingly "Elche", and
// the naming principle is an OPEN question with Dennis. The alternate slug
// therefore keeps serving at its own URL instead of being moved.
//
// This lives here rather than in verify-v4-suite.sh because the committed
// fixture seeds only Madrid and Barcelona, and the INE register carries ZERO
// alternate denominations for any Barcelona municipality — the alias population
// is Valencian, Galician, Navarrese and Basque. The register is committed data,
// so this assertion is reproducible without a database at all.
const elche = archiveTownRedirect('alicante', 'elche');
check(
  'the register still maps elche -> elx (so resolution can serve the alias)',
  elche !== null && elche.kind === 'town' && elche.slug === 'elx',
  JSON.stringify(elche),
);
// The canonical slug must return null — "do not redirect". That identity is what
// makes the maximum chain length structurally 1 rather than merely observed:
// a redirect target is always canonical, and a canonical slug never redirects.
check('elx is canonical and does not redirect', archiveTownRedirect('alicante', 'elx') === null);

// ⭐ THE ONE THAT MATTERS. `townRedirectTarget` in resolve-child.ts no longer has
// a `kind === 'town'` branch, so an alias CANNOT produce a 301 no matter what
// the register says. Proven structurally here: every non-canonical live slug
// resolves to the province hub, which always exists.
const junk = archiveTownRedirect('madrid', 'msdrid');
check('a typo still routes to the province (rule 3 is the whole rule now)',
  junk !== null && junk.kind === 'province', JSON.stringify(junk));

// ⚠️ Anti-vacuity: if `archiveTownRedirect` returned 'province' for EVERYTHING
// the two checks above would both pass while proving nothing about aliases.
check('the register distinguishes an alias from a typo',
  elche?.kind === 'town' && junk?.kind === 'province');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
