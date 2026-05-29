/**
 * Prisma Client singleton for the subastas app.
 *
 * Use this for any NEW data-access code (Notification CRUD, Favorite prefs,
 * AuctionStatusHistory / AuctionBidHistory inserts, event_outbox writes, etc.).
 * Legacy raw-SQL routes continue to use `@/lib/db` (which is also Postgres-backed
 * via `pg`, just without the type-safety of Prisma).
 *
 * Prisma 7 client engine requires a driver adapter — we use `@prisma/adapter-pg`
 * pointing at the same DATABASE_URL the legacy `@/lib/db` pg.Pool uses. This is
 * a *separate* pool by design: lib/db.ts holds one for raw-SQL routes, this
 * adapter holds its own for Prisma. Both are reused per process via globalThis
 * so Next dev module reloads don't exhaust DB connections.
 *
 * Build-time safety: the adapter / client are *NOT* constructed at module load.
 * Next's "Collect page data" phase imports every server module without runtime
 * env (no DATABASE_URL set), and Prisma 7's constructor throws if the URL is
 * empty. We defer construction to first use via a lazy proxy so build never
 * trips the constructor.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as {
  __subastasPrisma?: PrismaClient;
};

function buildClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Set it before importing @/lib/prisma at runtime.',
    );
  }
  const adapter = new PrismaPg({
    connectionString: url,
    max: Number(process.env.PRISMA_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  return new PrismaClient({
    adapter,
    log: ['warn', 'error'],
  });
}

function getClient(): PrismaClient {
  if (globalForPrisma.__subastasPrisma) return globalForPrisma.__subastasPrisma;
  const client = buildClient();
  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.__subastasPrisma = client;
  }
  return client;
}

/**
 * Lazy proxy: any property access constructs the client on first use, then
 * forwards. Build-time imports (no DATABASE_URL) won't trigger construction
 * unless a route actually calls `prisma.someModel.…` — which it doesn't during
 * "Collect page data".
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === 'function' ? value.bind(client) : value;
  },
}) as PrismaClient;
