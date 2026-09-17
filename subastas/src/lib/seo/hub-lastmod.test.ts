/**
 * Hub `<lastmod>` resolver — the fold/join that has now been wrong TWICE.
 *
 * Run with: npx tsx src/lib/seo/hub-lastmod.test.ts
 * No test framework — plain assertions, exit-code-driven (repo convention).
 *
 * ─── WHAT THIS PINS ──────────────────────────────────────────────────────
 *
 * Failure #1 (fixed c574a5e): the map was KEYED ON `slugify(municipality)`
 * while the URL slug comes from `foldMunicipalitiesForLegacySurface`. For an
 * aliased town ("Alicante/Alacant" → `alicante/alacant`) the two never met, so
 * the town shipped with no date.
 *
 * Failure #2 (this file): the map's SOURCE SET was active-only
 * (`status in ACTIVE_STATUSES, inScope: true`) while the URL set was
 * all-status. Measured live on wave215: 5,595 town hubs, 617 dated. Every
 * phase-C town whose history is entirely CONCLUDED — index,follow, real
 * content, and precisely the recrawl target — was permanently dateless.
 *
 * Both failures are silent: a missing `<lastmod>` is valid XML and the sitemap
 * still validates. Nothing goes red. So the cases below are the only alarm.
 *
 * The resolver is deliberately STATUS-AGNOSTIC: it takes whatever rows it is
 * given. The guarantee that those rows are the same rows the URL was minted
 * from is structural — `_municipalityPairs` builds the index from its OWN
 * `groupBy`, under its OWN `where`, and returns `lastModified` on the pair. A
 * caller can no longer pair one row set with another's dates.
 */
import {
  buildHubLastmodIndex,
  resolveTownLastmod,
  resolveProvinceLastmod,
  municipalityLastmodKey,
  type HubLastmodRow,
} from './hub-lastmod';

let failures = 0;
function check(label: string, cond: boolean) {
  if (cond) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.error(`  FAIL ${label}`);
  }
}

const D = (s: string) => new Date(s);

// The `groupBy(['province','municipality'], { _max: { updatedAt } })` shape,
// flattened exactly as `_municipalityPairs` flattens it.
const rows: HubLastmodRow[] = [
  // ACTIVE-ONLY town: one live auction, nothing concluded.
  { province: 'Madrid', municipality: 'Alcorcón', updatedAt: D('2026-09-10T00:00:00Z') },
  // CONCLUDED-ONLY town (phase-C "finalizadas bucket"). Under the wave215 code
  // this row was NOT in the source set at all and the town shipped dateless.
  { province: 'Madrid', municipality: 'Villarejo de Salvanés', updatedAt: D('2024-03-02T00:00:00Z') },
  // ALIAS town: the DB spelling is NOT what `slugify` would produce from the
  // URL segment `alicante/alacant`.
  { province: 'Alicante', municipality: 'Alicante/Alacant', updatedAt: D('2026-08-01T00:00:00Z') },
  // COLLISION FOLD: two raw spellings, one page. The page's date must be the
  // MAX of the group, not whichever row happened to be read last.
  { province: 'Alicante', municipality: 'Elx', updatedAt: D('2025-01-05T00:00:00Z') },
  { province: 'Alicante', municipality: 'Elche', updatedAt: D('2026-02-20T00:00:00Z') },
  // Untrimmed DB spelling — real data has these.
  { province: 'Teruel', municipality: '  Tramacastiel  ', updatedAt: D('2023-06-06T00:00:00Z') },
  // Rows that must be ignored rather than crash or key on ''.
  { province: null, municipality: 'Nowhere', updatedAt: D('2026-09-16T00:00:00Z') },
  { province: 'Madrid', municipality: null, updatedAt: D('2026-09-15T00:00:00Z') },
  { province: 'Madrid', municipality: 'Getafe', updatedAt: null },
];

const idx = buildHubLastmodIndex(rows);

console.log('hub-lastmod: town resolution');

check(
  'ACTIVE-ONLY town resolves its date',
  resolveTownLastmod(idx, 'Madrid', ['Alcorcón'])?.toISOString() === '2026-09-10T00:00:00.000Z',
);

check(
  'CONCLUDED-ONLY town resolves a date (regression: wave215 shipped these dateless)',
  resolveTownLastmod(idx, 'Madrid', ['Villarejo de Salvanés'])?.toISOString() ===
    '2024-03-02T00:00:00.000Z',
);

check(
  'ALIAS town (alicante/alacant) resolves via the RAW dbName, not the slug',
  resolveTownLastmod(idx, 'Alicante', ['Alicante/Alacant'])?.toISOString() ===
    '2026-08-01T00:00:00.000Z',
);

check(
  'a slugified key does NOT resolve — proving the index is raw-keyed (failure #1)',
  resolveTownLastmod(idx, 'Alicante', ['alicante-alacant']) === undefined,
);

check(
  'COLLISION FOLD takes the MAX across every folded spelling, not the last one',
  resolveTownLastmod(idx, 'Alicante', ['Elx', 'Elche'])?.toISOString() ===
    '2026-02-20T00:00:00.000Z',
);

check(
  'fold order does not change the answer',
  resolveTownLastmod(idx, 'Alicante', ['Elche', 'Elx'])?.toISOString() ===
    resolveTownLastmod(idx, 'Alicante', ['Elx', 'Elche'])?.toISOString(),
);

check(
  'raw spellings are trimmed on both sides of the join',
  resolveTownLastmod(idx, 'Teruel', ['Tramacastiel'])?.toISOString() ===
    '2023-06-06T00:00:00.000Z',
);

console.log('hub-lastmod: absence stays ABSENT (never a fabricated date)');

check(
  'NO-HISTORY town yields undefined, not `now`',
  resolveTownLastmod(idx, 'Madrid', ['Ningún Sitio']) === undefined,
);
check('empty dbNames yields undefined', resolveTownLastmod(idx, 'Madrid', []) === undefined);
check('undefined dbNames yields undefined', resolveTownLastmod(idx, 'Madrid', undefined) === undefined);
check(
  'a town whose only row has a NULL updatedAt yields undefined',
  resolveTownLastmod(idx, 'Madrid', ['Getafe']) === undefined,
);
check(
  'a row with no province is dropped entirely',
  resolveTownLastmod(idx, '', ['Nowhere']) === undefined &&
    resolveProvinceLastmod(idx, '') === undefined,
);
check(
  'a row with no municipality does not mint a `province|` municipality key',
  idx.byMunicipality.has(municipalityLastmodKey('Madrid', '')) === false,
);

console.log('hub-lastmod: province resolution');

check(
  'province = MAX over ALL its towns, including the null-municipality row',
  resolveProvinceLastmod(idx, 'Madrid')?.toISOString() === '2026-09-15T00:00:00.000Z',
);
check(
  'province with only concluded history still gets a date',
  resolveProvinceLastmod(idx, 'Teruel')?.toISOString() === '2023-06-06T00:00:00.000Z',
);
check('unknown province yields undefined', resolveProvinceLastmod(idx, 'Soria') === undefined);

console.log('hub-lastmod: the resolver holds no opinion about STATUS');

// The wave215 bug was a status filter upstream of this index, not a bug inside
// it. Pin that the index itself never filters: an index built ONLY from towns
// whose rows are all concluded must be fully populated.
const concludedOnly = buildHubLastmodIndex([
  { province: 'Cádiz', municipality: 'Ubrique', updatedAt: D('2019-04-04T00:00:00Z') },
]);
check(
  'a corpus of purely concluded towns yields a full index',
  concludedOnly.byMunicipality.size === 1 &&
    resolveTownLastmod(concludedOnly, 'Cádiz', ['Ubrique'])?.toISOString() ===
      '2019-04-04T00:00:00.000Z',
);

console.log(failures === 0 ? '\nhub-lastmod: PASS' : `\nhub-lastmod: ${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
