/**
 * Prisma 7 configuration. The DATABASE_URL is read at runtime instead of
 * being embedded in schema.prisma. Reads from .env via dotenv loaded here.
 *
 * For the dnksubastas Coolify deploy, DATABASE_URL is the managed secret
 * `DATABASE_URL_SUBASTAS` mapped into the container env as `DATABASE_URL`.
 */
import type { PrismaConfig } from 'prisma';
import { config as dotenv } from 'dotenv';

dotenv({ path: '.env', quiet: true } as any);
dotenv({ path: '.env.local', quiet: true } as any);

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
