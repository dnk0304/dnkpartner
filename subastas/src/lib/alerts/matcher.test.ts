/**
 * Tests for the shared saved-search matcher (`src/lib/alerts/matcher.ts`).
 *
 * This is the file that decides who gets mailed, in BOTH engines. Every
 * assertion below is about a real rule Dennis can name: "Las Palmas means Las
 * Palmas", "an empty filter means everything", "a price bound never invents a
 * price it doesn't have".
 *
 * Pure — no DB, no network, no clock.
 * Run: npx tsx src/lib/alerts/matcher.test.ts
 */
import {
  alertMatchesAuction,
  parseCsv,
  type AlertCriteria,
  type AuctionForMatch,
} from './matcher';

let failures = 0;
let checks = 0;
function ok(name: string, cond: boolean, detail?: string) {
  checks += 1;
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`);
  }
}
const section = (t: string) => console.log(`\n# ${t}`);

/** A fully-populated Las Palmas auction; individual tests override fields. */
const lasPalmas = (over: Partial<AuctionForMatch> = {}): AuctionForMatch => ({
  province: 'Las Palmas',
  municipality: 'Telde',
  category: 'INMUEBLE',
  source: 'BOE',
  auctionType: 'JUDICIAL',
  propertyType: 'VIVIENDA',
  status: 'CELEBRANDOSE',
  appraisalValue: 120000,
  title: 'Piso en Calle Mayor 3',
  generalInfo: 'Procedimiento ordinario',
  propertyDescription: 'Vivienda con garaje y trastero',
  lotDescription: 'Lote unico',
  ...over,
});

// ── province ────────────────────────────────────────────────────────────────
section('province — the rule Dennis actually asked for');
{
  const alert: AlertCriteria = { province: 'Las Palmas' };
  ok('matches a Las Palmas auction', alertMatchesAuction(alert, lasPalmas()) === true);
  ok(
    'does NOT match a Madrid auction',
    alertMatchesAuction(alert, lasPalmas({ province: 'Madrid' })) === false,
  );
  ok(
    'province match is exact, not substring',
    alertMatchesAuction(alert, lasPalmas({ province: 'Palmas' })) === false,
  );
  ok(
    'a null province on the auction cannot match a province filter',
    alertMatchesAuction(alert, lasPalmas({ province: null })) === false,
  );
}

// ── empty / null filters ────────────────────────────────────────────────────
section('null and empty filters match everything');
{
  ok('a completely empty alert matches', alertMatchesAuction({}, lasPalmas()) === true);
  const allNull: AlertCriteria = {
    province: null,
    municipality: null,
    category: null,
    source: null,
    auctionType: null,
    propertyType: null,
    statuses: null,
    minPrice: null,
    maxPrice: null,
    keywords: null,
  };
  ok('an all-null alert matches', alertMatchesAuction(allNull, lasPalmas()) === true);
  const allEmpty: AlertCriteria = {
    province: '',
    municipality: '',
    statuses: '',
    keywords: '',
    propertyType: '',
  };
  ok('an all-empty-string alert matches', alertMatchesAuction(allEmpty, lasPalmas()) === true);
  ok(
    'a blank-only statuses CSV is no constraint',
    alertMatchesAuction({ statuses: ' , , ' }, lasPalmas({ status: 'CELEBRANDOSE' })) === true,
  );
  ok(
    'a blank-only keywords CSV is no constraint',
    alertMatchesAuction({ keywords: ' , ' }, lasPalmas()) === true,
  );
  ok(
    'an all-null auction still matches an empty alert',
    alertMatchesAuction({}, {}) === true,
  );
}

// ── propertyType — THE wave218 behaviour change ─────────────────────────────
section('propertyType (wave218: persisted since F2a, matched for the first time)');
{
  ok(
    'a VIVIENDA alert matches a VIVIENDA auction',
    alertMatchesAuction({ propertyType: 'VIVIENDA' }, lasPalmas()) === true,
  );
  ok(
    'a VIVIENDA alert REJECTS a GARAJE auction (was accepted before wave218)',
    alertMatchesAuction({ propertyType: 'VIVIENDA' }, lasPalmas({ propertyType: 'GARAJE' })) === false,
  );
  ok(
    'a VIVIENDA alert rejects an auction with no propertyType',
    alertMatchesAuction({ propertyType: 'VIVIENDA' }, lasPalmas({ propertyType: null })) === false,
  );
  ok(
    'an alert with no propertyType is unaffected by the change',
    alertMatchesAuction({ province: 'Las Palmas' }, lasPalmas({ propertyType: 'GARAJE' })) === true,
  );
}

// ── the other equality filters ──────────────────────────────────────────────
section('municipality / category / source / auctionType equality');
{
  ok('municipality hit', alertMatchesAuction({ municipality: 'Telde' }, lasPalmas()) === true);
  ok(
    'municipality miss',
    alertMatchesAuction({ municipality: 'Aguimes' }, lasPalmas()) === false,
  );
  ok('category hit', alertMatchesAuction({ category: 'INMUEBLE' }, lasPalmas()) === true);
  ok(
    'category miss',
    alertMatchesAuction({ category: 'VEHICLE' }, lasPalmas()) === false,
  );
  ok('source hit', alertMatchesAuction({ source: 'BOE' }, lasPalmas()) === true);
  ok('source miss', alertMatchesAuction({ source: 'PLABI' }, lasPalmas()) === false);
  ok(
    'auctionType hit',
    alertMatchesAuction({ auctionType: 'JUDICIAL' }, lasPalmas()) === true,
  );
  ok(
    'auctionType miss',
    alertMatchesAuction({ auctionType: 'NOTARIAL' }, lasPalmas()) === false,
  );
  section('every filter is AND-ed');
  ok(
    'right province + wrong municipality does NOT match',
    alertMatchesAuction({ province: 'Las Palmas', municipality: 'Aguimes' }, lasPalmas()) === false,
  );
}

// ── statuses CSV ────────────────────────────────────────────────────────────
section('statuses CSV edges');
{
  ok(
    'single value hit',
    alertMatchesAuction({ statuses: 'CELEBRANDOSE' }, lasPalmas()) === true,
  );
  ok(
    'single value miss',
    alertMatchesAuction({ statuses: 'PROXIMA_APERTURA' }, lasPalmas()) === false,
  );
  ok(
    'multi-value hit',
    alertMatchesAuction({ statuses: 'PROXIMA_APERTURA,CELEBRANDOSE' }, lasPalmas()) === true,
  );
  ok(
    'surrounding whitespace is trimmed',
    alertMatchesAuction({ statuses: ' PROXIMA_APERTURA , CELEBRANDOSE ' }, lasPalmas()) === true,
  );
  ok(
    'empty segments are dropped, not treated as a match',
    alertMatchesAuction({ statuses: 'PROXIMA_APERTURA,,' }, lasPalmas()) === false,
  );
  ok(
    'status comparison is case-sensitive (enum values, not free text)',
    alertMatchesAuction({ statuses: 'celebrandose' }, lasPalmas()) === false,
  );
  ok(
    'an auction with no status cannot satisfy a statuses filter',
    alertMatchesAuction({ statuses: 'CELEBRANDOSE' }, lasPalmas({ status: null })) === false,
  );
}

// ── price bounds ────────────────────────────────────────────────────────────
section('minPrice / maxPrice against appraisalValue');
{
  ok('above the floor', alertMatchesAuction({ minPrice: 100000 }, lasPalmas()) === true);
  ok('below the floor', alertMatchesAuction({ minPrice: 200000 }, lasPalmas()) === false);
  ok('under the ceiling', alertMatchesAuction({ maxPrice: 200000 }, lasPalmas()) === true);
  ok('over the ceiling', alertMatchesAuction({ maxPrice: 100000 }, lasPalmas()) === false);
  ok(
    'bounds are inclusive at both ends',
    alertMatchesAuction({ minPrice: 120000, maxPrice: 120000 }, lasPalmas()) === true,
  );
  ok(
    'a band that brackets the value matches',
    alertMatchesAuction({ minPrice: 50000, maxPrice: 500000 }, lasPalmas()) === true,
  );
  ok(
    'a band that misses the value does not',
    alertMatchesAuction({ minPrice: 200000, maxPrice: 500000 }, lasPalmas()) === false,
  );

  section('NULL appraisalValue is ASYMMETRIC — pinning pre-existing behaviour');
  // JS coerces null to 0 in a relational comparison, so the floor bites and the
  // ceiling does not. This is Engine A's historic behaviour, carried over
  // verbatim; these two assertions exist so that nobody "fixes" one side of it
  // by accident. Flagged to Ken for a Dennis ruling (wave218).
  ok(
    'a minPrice floor EXCLUDES an auction with no appraisal value (null -> 0)',
    alertMatchesAuction({ minPrice: 100000 }, lasPalmas({ appraisalValue: null })) === false,
  );
  ok(
    'a maxPrice ceiling KEEPS an auction with no appraisal value',
    alertMatchesAuction({ maxPrice: 1000 }, lasPalmas({ appraisalValue: null })) === true,
  );
  // ...and `undefined` is NOT the same as `null`: an undefined operand makes the
  // comparison NaN, which is false, so the row is KEPT. Prisma returns `null`
  // for an unset Float column, so the null branch above is the production one —
  // but this is pinned too, because a future in-memory caller that omits the
  // field entirely would silently get the opposite answer.
  ok(
    'undefined survives a minPrice floor (NaN comparison), unlike null',
    alertMatchesAuction({ minPrice: 100000 }, lasPalmas({ appraisalValue: undefined })) === true,
  );
  ok(
    'minPrice 0 is falsy and imposes no floor (preserved quirk)',
    alertMatchesAuction({ minPrice: 0 }, lasPalmas({ appraisalValue: -1 })) === true,
  );
  ok(
    'maxPrice 0 is falsy and imposes no ceiling (preserved quirk)',
    alertMatchesAuction({ maxPrice: 0 }, lasPalmas()) === true,
  );
}

// ── keywords ────────────────────────────────────────────────────────────────
section('keywords — OR-ed, case-insensitive, across four prose fields');
{
  ok(
    'hits the title',
    alertMatchesAuction({ keywords: 'calle mayor' }, lasPalmas()) === true,
  );
  ok(
    'hits generalInfo',
    alertMatchesAuction({ keywords: 'ordinario' }, lasPalmas()) === true,
  );
  ok(
    'hits propertyDescription',
    alertMatchesAuction({ keywords: 'trastero' }, lasPalmas()) === true,
  );
  ok(
    'hits lotDescription',
    alertMatchesAuction({ keywords: 'lote unico' }, lasPalmas()) === true,
  );
  ok(
    'is case-insensitive in both directions',
    alertMatchesAuction({ keywords: 'GARAJE' }, lasPalmas()) === true,
  );
  ok(
    'any one keyword is enough (OR, not AND)',
    alertMatchesAuction({ keywords: 'nonexistent,garaje' }, lasPalmas()) === true,
  );
  ok(
    'no keyword present means no match',
    alertMatchesAuction({ keywords: 'chalet,finca' }, lasPalmas()) === false,
  );
  ok(
    'an auction with no prose at all cannot satisfy a keyword filter',
    alertMatchesAuction(
      { keywords: 'garaje' },
      { province: 'Las Palmas', title: null, generalInfo: null, propertyDescription: null, lotDescription: null },
    ) === false,
  );
  ok(
    'keyword whitespace is trimmed',
    alertMatchesAuction({ keywords: '  trastero  ' }, lasPalmas()) === true,
  );
}

// ── parseCsv ────────────────────────────────────────────────────────────────
section('parseCsv helper');
{
  ok('null -> []', parseCsv(null).length === 0);
  ok('undefined -> []', parseCsv(undefined).length === 0);
  ok('empty string -> []', parseCsv('').length === 0);
  ok('blank segments dropped', JSON.stringify(parseCsv(' a , , b ')) === '["a","b"]');
  ok('single value', JSON.stringify(parseCsv('x')) === '["x"]');
}

// ── the composite case the fan-out actually runs ────────────────────────────
section('the production shape: a Las Palmas saved search vs a go_live auction');
{
  const savedSearch: AlertCriteria = {
    province: 'Las Palmas',
    municipality: null,
    category: null,
    source: null,
    auctionType: null,
    propertyType: null,
    statuses: null,
    minPrice: null,
    maxPrice: null,
    keywords: null,
  };
  ok(
    'matches the auction that just went live',
    alertMatchesAuction(savedSearch, lasPalmas({ status: 'CELEBRANDOSE' })) === true,
  );
  ok(
    'still matches it while it was upcoming (status is not implicitly filtered)',
    alertMatchesAuction(savedSearch, lasPalmas({ status: 'PROXIMA_APERTURA' })) === true,
  );
  ok(
    'does not match Madrid',
    alertMatchesAuction(savedSearch, lasPalmas({ province: 'Madrid' })) === false,
  );
}

console.log(`\nmatcher: ${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
