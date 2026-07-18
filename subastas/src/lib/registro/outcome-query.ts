/**
 * src/lib/registro/outcome-query.ts — translate a requested AuctionOutcome into
 * a Prisma WHERE fragment over the raw Auction columns, for the /api/registro/list
 * archive query.
 *
 * ⚠️ This MUST stay faithful to the canonical classifier `auctionOutcome()`
 * (src/lib/seo/auction-outcome.ts) — same precedence, same stale-suspended
 * window. It is a SQL projection of that function, not a second definition. The
 * list route additionally re-classifies every returned row through
 * `auctionOutcome()` and attaches the label, so any divergence would surface
 * immediately as a mismatch (defensive). The staleness threshold is imported
 * from the taxonomy so the window can never drift.
 */
import type { Prisma } from '@prisma/client';
import { SaleResult } from '@prisma/client';
import { STALE_SUSPENDED_DAYS, type AuctionOutcome } from '@/lib/seo/auction-outcome';

const CANCELLED_STATUSES = ['CANCELADA', 'CANCELLED'] as const;
const SUSPENDED_STATUSES = ['SUSPENDIDA', 'SUSPENDED'] as const;

/** saleResult is unresolved (NULL or SIN_RESULTADO) → status decides the bucket.
 * A resolved ADJUDICADA/DESIERTA would win as VENDIDA/DESIERTA (precedence). */
const NOT_SOLD: Prisma.AuctionWhereInput = {
  OR: [{ saleResult: null }, { saleResult: SaleResult.SIN_RESULTADO }],
};

/** SQL projection of isStaleSuspended(): suspended, resumption past/absent,
 * untouched for >= STALE_SUSPENDED_DAYS. */
function staleSuspendedWhere(now: Date): Prisma.AuctionWhereInput {
  const cutoff = new Date(now.getTime() - STALE_SUSPENDED_DAYS * 24 * 60 * 60 * 1000);
  return {
    status: { in: [...SUSPENDED_STATUSES] as unknown as Prisma.EnumAuctionStatusFilter['in'] },
    OR: [{ resumeAt: null }, { resumeAt: { lt: now } }],
    updatedAt: { lt: cutoff },
  };
}

const asStatusIn = (s: readonly string[]) =>
  ({ in: [...s] } as unknown as Prisma.EnumAuctionStatusFilter);

/** WHERE for a single outcome bucket. INDETERMINADO is not queryable here (it's
 * the residual — everything the four registry buckets don't claim). */
export function outcomeWhere(outcome: AuctionOutcome, now: Date): Prisma.AuctionWhereInput {
  switch (outcome) {
    case 'VENDIDA':
      return { saleResult: SaleResult.ADJUDICADA };
    case 'DESIERTA':
      return { saleResult: SaleResult.DESIERTA };
    case 'CANCELADA':
      return {
        AND: [
          NOT_SOLD,
          { OR: [{ status: asStatusIn(CANCELLED_STATUSES) }, staleSuspendedWhere(now)] },
        ],
      };
    case 'FINALIZADA_SIN_RESULTADO':
      return { AND: [NOT_SOLD, { status: asStatusIn(['FINALIZADA_AUTORIDAD']) }] };
    case 'INDETERMINADO':
    default:
      // Not directly queryable — return an impossible predicate so callers that
      // ask for it get nothing rather than everything.
      return { id: '__never__' };
  }
}

/** WHERE matching ANY registry outcome (the archive's default set — excludes
 * INDETERMINADO). Precise OR of the four registry buckets. */
export function registryBaseWhere(now: Date): Prisma.AuctionWhereInput {
  return {
    OR: [
      outcomeWhere('VENDIDA', now),
      outcomeWhere('DESIERTA', now),
      outcomeWhere('CANCELADA', now),
      outcomeWhere('FINALIZADA_SIN_RESULTADO', now),
    ],
  };
}
