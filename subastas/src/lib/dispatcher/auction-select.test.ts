/**
 * Runtime guard for `AUCTION_MATCH_SELECT` (SN-1b).
 *
 * wave218 shipped a `select` naming `generalInfo` — a field that does not exist
 * on `model Auction`. `as const` alone typed it as `{ generalInfo: true }` and
 * tsc was happy; Prisma threw at runtime on every single `auction.go_live` row,
 * which then never got `processedAt` and was retried forever. No pure test
 * caught it because they all mock the auction row.
 *
 * This asserts against the GENERATED SCHEMA, not against a hand-kept list:
 * every key of the select must be a scalar field of the `Auction` model in
 * `Prisma.dmmf.datamodel`. It needs no database — dmmf is static metadata
 * emitted by `prisma generate`.
 *
 * Pure — no DB, no network, no clock.
 * Run: npx tsx src/lib/dispatcher/auction-select.test.ts
 */
import { Prisma } from '@prisma/client';
import { AUCTION_MATCH_SELECT } from './auction-select';

let failures = 0;
let checks = 0;

function ok(label: string, cond: boolean) {
  checks += 1;
  if (cond) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${label}`);
  }
}

const auctionModel = Prisma.dmmf.datamodel.models.find((m) => m.name === 'Auction');

// If this ever fails, the test below would pass vacuously — refuse instead.
ok('the Auction model is present in Prisma.dmmf.datamodel', Boolean(auctionModel));
if (!auctionModel) {
  console.error('auction-select.test: no Auction model in dmmf — run `prisma generate`');
  process.exit(1);
}

const scalarFields = new Set(
  auctionModel.fields.filter((f) => f.kind === 'scalar' || f.kind === 'enum').map((f) => f.name),
);

ok('the Auction model exposes scalar fields at all (guard is not vacuous)', scalarFields.size > 10);

const selectedKeys = Object.keys(AUCTION_MATCH_SELECT);
ok('AUCTION_MATCH_SELECT is not empty (guard is not vacuous)', selectedKeys.length > 0);

for (const key of selectedKeys) {
  ok(
    `AUCTION_MATCH_SELECT.${key} is a real scalar field of model Auction`,
    scalarFields.has(key),
  );
}

// Every selected key must also be `true` — a relation include or a nested
// select would change the row shape the matcher and the mail template expect.
for (const [key, value] of Object.entries(AUCTION_MATCH_SELECT)) {
  ok(`AUCTION_MATCH_SELECT.${key} selects the column itself (=== true)`, value === true);
}

// Named negative control: the exact field that caused the SN-1b outage must
// never come back. If someone adds it to the schema for real, this line is the
// place to make that decision consciously.
ok(
  'generalInfo is not a field of model Auction (the SN-1b root cause)',
  !scalarFields.has('generalInfo'),
);

console.log(`\nauction-select: ${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
