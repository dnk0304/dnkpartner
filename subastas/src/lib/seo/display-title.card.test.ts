/**
 * Unit tests for the bare-address card-title flag (ITEM 0, 2026-08-01,
 * Dennis-locked). Run with: npx tsx src/lib/seo/display-title.card.test.ts
 * No test framework — plain assertions, exit-code-driven (repo convention).
 *
 * Contract: `bareAddress:true` is opt-in and only affects the real-estate
 * `useFullStreet` street branch. When a street resolves it drops the
 * "{Tipo} – " prefix (bare "Calle Mayor 12, Murcia"); when no street resolves
 * it falls through to the existing "{Tipo} en {town}" fallback; vehicles
 * (movable) are untouched.
 */
import { auctionCardTitle } from './display-title';

let failures = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.error(`  FAIL ${name}`);
  }
}

// (1) street present + bareAddress → bare "Calle X 12, Town" (no tipo, no dash).
const bare = auctionCardTitle({
  propertyType: 'Solar',
  address: 'Calle Mayor 12',
  municipality: 'Murcia',
  categoryGroup: 'real_estate',
  useFullStreet: true,
  bareAddress: true,
});
check(
  'street + bareAddress → "Calle Mayor 12, Murcia" (no "Solar –")',
  bare === 'Calle Mayor 12, Murcia',
);
check('bare title carries no en-dash type prefix', !bare.includes('–'));
check('bare title carries no tipo token', !bare.includes('Solar'));

// (2) baseline (no bareAddress) is unchanged — keeps "{Tipo} – {street}, town".
const baseline = auctionCardTitle({
  propertyType: 'Solar',
  address: 'Calle Mayor 12',
  municipality: 'Murcia',
  categoryGroup: 'real_estate',
  useFullStreet: true,
});
check(
  'no bareAddress → "Solar – Calle Mayor 12, Murcia" (unchanged)',
  baseline === 'Solar – Calle Mayor 12, Murcia',
);

// (3) no resolvable street + bareAddress → "{Tipo} en {town}" fallback.
const fallback = auctionCardTitle({
  propertyType: 'Solar',
  address: null,
  municipality: 'Murcia',
  categoryGroup: 'real_estate',
  useFullStreet: true,
  bareAddress: true,
});
check(
  'no street + bareAddress → "Solar en Murcia" fallback',
  fallback === 'Solar en Murcia',
);

// (4) vehicle (movable) + bareAddress → untouched vehicle phrasing.
const vehicle = auctionCardTitle({
  propertyType: 'Turismo',
  municipality: 'Murcia',
  categoryGroup: 'movable',
  vehicleMake: 'SEAT',
  vehicleModel: 'León',
  useFullStreet: false,
  bareAddress: true,
});
check(
  'vehicle + bareAddress → "Turismo - Seat León en Murcia" (unchanged, tipo+make preserved)',
  vehicle === 'Turismo - Seat León en Murcia',
);

if (failures > 0) {
  console.error(`\n${failures} test(s) FAILED`);
  process.exit(1);
}
console.log('\nAll bare-address card-title tests passed.');
