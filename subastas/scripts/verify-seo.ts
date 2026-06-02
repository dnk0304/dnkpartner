/**
 * verify-seo.mjs — DB-less smoke test for the SEO grammar + auction-slug logic.
 *
 * Validates the deterministic, non-DB pieces of the SEO work:
 *  - province slug map (52 canonical slugs)
 *  - tipo slug map (5)
 *  - category allowlist (15 OFFICIAL_CATEGORIES)
 *  - reserved-word guard rejects `subasta` and friends
 *  - auction-slug composition + resolveAuctionIdFromSlug round-trip
 *  - province alias 301 targets (la-coruna → a-coruna etc.)
 *
 * Designed to run in CI / on any box without a live Postgres.
 */
import {
  PROVINCE_SLUGS,
  PROVINCE_SLUG_TO_DB_KEY,
  PROVINCE_ALIAS_TO_CANONICAL,
  TIPO_SLUGS,
  TIPO_SLUG_TO_DB_KEYS,
  CATEGORY_SLUGS,
  CATEGORY_SLUG_TO_DB_LABEL,
  OFFICIAL_CATEGORIES,
  RESERVED_SEGMENTS,
  isOfficialCategory,
  CATEGORY_ALIAS_TO_CANONICAL,
} from '../src/lib/seo/slugs.ts';
import { buildAuctionSlug, resolveAuctionIdFromSlug } from '../src/lib/seo/auction-slug.ts';

let failed = 0;
function eq(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n      actual=${JSON.stringify(actual)}\n      expected=${JSON.stringify(expected)}`}`);
  if (!ok) failed++;
}

// 1. Province coverage
eq('province slug count == 52', PROVINCE_SLUGS.length, 52);
eq('barcelona maps to Barcelona', PROVINCE_SLUG_TO_DB_KEY['barcelona'], 'Barcelona');
eq('a-coruna canonical present', PROVINCE_SLUGS.includes('a-coruna'), true);
eq('araba-alava canonical present', PROVINCE_SLUGS.includes('araba-alava'), true);
eq('baleares canonical present', PROVINCE_SLUGS.includes('baleares'), true);

// 2. Province alias 301s
eq('alias la-coruna -> a-coruna', PROVINCE_ALIAS_TO_CANONICAL['la-coruna'], 'a-coruna');
eq('alias vizcaya -> bizkaia', PROVINCE_ALIAS_TO_CANONICAL['vizcaya'], 'bizkaia');
eq('alias gerona -> girona', PROVINCE_ALIAS_TO_CANONICAL['gerona'], 'girona');

// 3. Tipo
eq('tipo count == 5', TIPO_SLUGS.length, 5);
eq('hacienda maps to AEAT', TIPO_SLUG_TO_DB_KEYS['hacienda'], ['AEAT']);
eq('otras-tributarias has legacy fold', TIPO_SLUG_TO_DB_KEYS['otras-tributarias'], ['OTRAS_TRIBUTARIAS', 'TRIBUTARIA']);

// 4. Categories — OFFICIAL_CATEGORIES allowlist == 15
eq('category slug count == 15', CATEGORY_SLUGS.length, 15);
eq('OFFICIAL_CATEGORIES size == 15', OFFICIAL_CATEGORIES.size, 15);
eq('vivienda -> Viviendas (no rollup)', CATEGORY_SLUG_TO_DB_LABEL['vivienda'], 'Viviendas');
eq('turismo -> Turismos (no rollup)', CATEGORY_SLUG_TO_DB_LABEL['turismo'], 'Turismos');
eq('motocicleta -> Motocicletas (separate from turismo)', CATEGORY_SLUG_TO_DB_LABEL['motocicleta'], 'Motocicletas');
eq('Oficinas NOT in OFFICIAL_CATEGORIES (flag b)', isOfficialCategory('Oficinas'), false);
eq('Viviendas IS in OFFICIAL_CATEGORIES', isOfficialCategory('Viviendas'), true);

// 5. Category alias 301s
eq('alias pisos -> vivienda', CATEGORY_ALIAS_TO_CANONICAL['pisos'], 'vivienda');
eq('alias vehiculo -> turismo', CATEGORY_ALIAS_TO_CANONICAL['vehiculo'], 'turismo');
eq('alias coches -> turismo', CATEGORY_ALIAS_TO_CANONICAL['coches'], 'turismo');

// 6. Reserved-word guard (07 §1.6, §1.7)
eq('subasta reserved', RESERVED_SEGMENTS.has('subasta'), true);
eq('provincia reserved', RESERVED_SEGMENTS.has('provincia'), true);
eq('tipo reserved', RESERVED_SEGMENTS.has('tipo'), true);
eq('en reserved (07 §1.4)', RESERVED_SEGMENTS.has('en'), true);
eq('studio reserved', RESERVED_SEGMENTS.has('studio'), true);

// 7. Auction slug composition + resolver round-trip
const sample = {
  id: 'cmt9abc12345',
  auctionType: 'JUDICIAL',
  province: 'Barcelona',
  municipality: 'L’Hospitalet de Llobregat',
};
const slug = buildAuctionSlug(sample);
eq('auction slug starts with tipo-province', slug.startsWith('judicial-barcelona-'), true);
eq('auction slug ends with auction id', slug.endsWith('-cmt9abc12345'), true);
eq('auction slug uses Spanish (judicial not auction)', slug.includes('-auction-'), false);
eq('municipality slugified', slug.includes('hospitalet-de-llobregat'), true);
eq('resolve round-trip', resolveAuctionIdFromSlug(slug), 'cmt9abc12345');

// Missing municipality -> sin-municipio placeholder, id still trailing
const noMuni = buildAuctionSlug({ id: 'abc999', auctionType: 'AEAT', province: 'Madrid', municipality: null });
eq('no muni placeholder', noMuni, 'hacienda-madrid-sin-municipio-abc999');
eq('no muni resolve', resolveAuctionIdFromSlug(noMuni), 'abc999');

// Resolver edge cases
eq('resolve bare id with no dashes', resolveAuctionIdFromSlug('cm12abc'), 'cm12abc');
eq('resolve empty -> null', resolveAuctionIdFromSlug(''), null);

console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAIL'}`);
process.exit(failed === 0 ? 0 : 1);
