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
 *
 * FORGE 2026-06-02 — P1 connection exhaustion (P2037) fix:
 *   Previously the singleton was ONLY cached when `NODE_ENV !== 'production'`.
 *   In production every `getClient()` call ran `buildClient()` — a brand new
 *   PrismaClient + brand new `PrismaPg` adapter pool (default max 10). Worse,
 *   the lazy proxy invokes `getClient()` on EVERY property access, so a single
 *   `prisma.auction.findUnique({...})` spawned multiple pools per call. Under
 *   burst load the app trivially blew past PG's `max_connections=100`.
 *
 *   We now cache the singleton in production too — globalThis survives every
 *   warm Lambda/Node invocation and we want exactly ONE pool per process.
 *   The cached client is memoized on first access so the proxy stops thrashing
 *   pools.
 *
 *   Pool size is taken from `PRISMA_POOL_MAX` (env). Ken's recommended split
 *   on the 100-conn box (see DISPATCH-BRIEF-FORGE-pg-connection-exhaustion-
 *   P2037.md): app gets PG_POOL_MAX=15 + PRISMA_POOL_MAX=10 = 25; scheduler +
 *   superuser keep the remaining ~75. The pool also honors `pool_timeout`
 *   (ms) via the adapter so a brief queue beats an instant 500 under burst.
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
  // Pool tuning — keep in sync with the PG_POOL_MAX setting used by @/lib/db.
  // App total = PG_POOL_MAX + PRISMA_POOL_MAX. Budget against PG max_connections.
  const max = Number(process.env.PRISMA_POOL_MAX ?? 10);
  const connectionTimeoutMillis = Number(process.env.PRISMA_POOL_TIMEOUT_MS ?? 5_000);
  const adapter = new PrismaPg({
    connectionString: url,
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis,
  });
  return new PrismaClient({
    adapter,
    log: ['warn', 'error'],
  });
}

function getClient(): PrismaClient {
  if (globalForPrisma.__subastasPrisma) return globalForPrisma.__subastasPrisma;
  // FORGE 2026-06-02: cache in production too (was dev-only). See file header.
  const client = buildClient();
  globalForPrisma.__subastasPrisma = client;
  return client;
}

/**
 * Lazy proxy: any property access reuses the cached client (memoized on first
 * call). Build-time imports (no DATABASE_URL) don't trigger construction
 * unless a route actually calls `prisma.someModel.…` — which it doesn't
 * during "Collect page data".
 *
 * FORGE 2026-06-02: getClient() is now globally memoized, so this proxy no
 * longer spawns a new PrismaClient per property access in production.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === 'function' ? value.bind(client) : value;
  },
}) as PrismaClient;
