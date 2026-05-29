/**
 * Prisma Client singleton for the subastas app.
 *
 * Use this for any NEW data-access code (Notification CRUD, Favorite prefs,
 * AuctionStatusHistory / AuctionBidHistory inserts, event_outbox writes, etc.).
 * Legacy raw-SQL routes continue to use `@/lib/db` (which is also Postgres-backed
 * via `pg`, just without the type-safety of Prisma).
 */
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  __subastasPrisma?: PrismaClient;
};

function buildClient(): PrismaClient {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['warn', 'error'],
  });
}

export const prisma: PrismaClient =
  globalForPrisma.__subastasPrisma ?? buildClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__subastasPrisma = prisma;
}
