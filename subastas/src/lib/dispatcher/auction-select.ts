import { Prisma } from '@prisma/client';
import type { AuctionForMatch } from '@/lib/alerts/matcher';

/**
 * The Prisma `select` Engine B uses to load the auction behind an
 * `auction.go_live` outbox row: the exact `Auction` columns the shared matcher
 * reads, plus the three the go-live mail renders.
 *
 * Lives in its OWN module (not in `dispatcher/index.ts`) so the runtime guard
 * in `auction-select.test.ts` can import it without dragging in the Prisma
 * client singleton, Resend and web-push.
 *
 * wave218 shipped this selecting `generalInfo`, which is NOT a column on
 * `model Auction`. Engine A never noticed — it reads a FULL row and just saw
 * `undefined` — but an explicit `select` makes Prisma reject the whole query,
 * so every go_live row threw and was retried forever (SN-1b). Two guards now
 * stand against that: `satisfies Prisma.AuctionSelect` below (compile time)
 * and the dmmf assertion in `auction-select.test.ts` (runtime).
 */
export const AUCTION_MATCH_SELECT = {
  id: true,
  province: true,
  municipality: true,
  category: true,
  source: true,
  auctionType: true,
  propertyType: true,
  status: true,
  appraisalValue: true,
  title: true,
  propertyDescription: true,
  lotDescription: true,
  endsAt: true,
} as const satisfies Prisma.AuctionSelect;

/**
 * REAL anti-drift guard, not a vibes one.
 *
 * A plain `const x: AuctionForMatch = row` proves nothing here, because every
 * field on `AuctionForMatch` is optional — a row missing `propertyType` still
 * satisfies the interface, and the dispatcher would just silently match against
 * `undefined`. (Verified: adding a field to the matcher left tsc green.)
 *
 * This instead asserts at the TYPE level that every key the matcher reads is
 * present in the select. Add a filter to `AuctionForMatch` without widening
 * `AUCTION_MATCH_SELECT` and `MissingMatchFields` becomes that key's literal
 * type, which `true` is not assignable to — the build fails with the missing
 * field named in the error.
 */
type MissingMatchFields = Exclude<keyof AuctionForMatch, keyof typeof AUCTION_MATCH_SELECT>;
const _selectCoversEveryMatcherField: MissingMatchFields extends never
  ? true
  : MissingMatchFields = true;
void _selectCoversEveryMatcherField;
