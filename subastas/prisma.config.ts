/**
 * Prisma 7 configuration. The DATABASE_URL is read at runtime instead of
 * being embedded in schema.prisma. Reads from .env via dotenv loaded here.
 *
 * For the dnksubastas Coolify deploy, DATABASE_URL is the managed secret
 * `DATABASE_URL_SUBASTAS` mapped into the container env as `DATABASE_URL`.
 */
import type { PrismaConfig } from 'prisma';
import { config as dotenv } from 'dotenv';

import { guardDestructivePrismaCommand } from './prisma/db-target-guard';

dotenv({ path: '.env', quiet: true } as any);
dotenv({ path: '.env.local', quiet: true } as any);

/**
 * ⭐ Destructive-command guard (Ken, 2026-08-04).
 *
 * Runs on EVERY prisma invocation because Prisma loads this config file every
 * time — which is the point. An npm script would only guard `npm run db:push`
 * and would be walked past by `npx prisma db push`, the exact shape of the
 * original SEC-CREDS incident.
 *
 * It is a NO-OP for every non-destructive command, so `prisma generate` (Docker
 * build, `npm run build`) and `prisma migrate deploy` (the production container
 * CMD) are untouched. See prisma/db-target-guard.ts.
 *
 * Called AFTER dotenv so it sees the same DATABASE_URL Prisma is about to use —
 * a guard that reads a different value than the command it is guarding is
 * decoration.
 */
guardDestructivePrismaCommand();

const config: PrismaConfig = {
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
} as any;

export default config;
