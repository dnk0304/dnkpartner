/**
 * Bulk-publish CLI for /guia SEO articles. Flips every DRAFT Article to
 * PUBLISHED and stamps publishedAt (COALESCE — never overwrites an existing
 * timestamp, so re-runs are idempotent). Reads DATABASE_URL from the process
 * env (same connection the app uses).
 *
 * Usage (inside the app container, which has tsx + @prisma/client + src/):
 *   tsx scripts/import-articles/publish-drafts.ts --dry-run   # report only
 *   tsx scripts/import-articles/publish-drafts.ts             # flip DRAFT→PUBLISHED
 *
 * --dry-run : SELECT counts only, NO writes. Prints how many DRAFT rows would
 *             flip. ALWAYS run this first and confirm the count (~55).
 *
 * Idempotent: a second run finds 0 DRAFT rows and is a no-op.
 */
import { prisma } from '../../src/lib/prisma';

interface Counts {
  total: bigint;
  draft: bigint;
  published: bigint;
}

async function counts(): Promise<Counts> {
  const rows = await prisma.$queryRaw<Counts[]>`
    SELECT count(*)                                   AS total,
           count(*) FILTER (WHERE status = 'DRAFT')     AS draft,
           count(*) FILTER (WHERE status = 'PUBLISHED') AS published
    FROM "Article"`;
  return rows[0];
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  try {
    const before = await counts();
    console.log(
      `Article rows: total=${before.total}  DRAFT=${before.draft}  PUBLISHED=${before.published}`,
    );

    if (dryRun) {
      console.log(`[dry-run] Would flip ${before.draft} DRAFT → PUBLISHED. No writes performed.`);
      return;
    }

    if (before.draft === 0n) {
      console.log(`Nothing to do: 0 DRAFT rows. (idempotent no-op)`);
      return;
    }

    const affected = await prisma.$executeRaw`
      UPDATE "Article"
      SET status = 'PUBLISHED',
          "publishedAt" = COALESCE("publishedAt", now())
      WHERE status = 'DRAFT'`;
    console.log(`Flipped ${affected} rows DRAFT → PUBLISHED.`);

    const after = await counts();
    console.log(
      `After: total=${after.total}  DRAFT=${after.draft}  PUBLISHED=${after.published}`,
    );
    if (after.draft !== 0n) {
      console.error(`WARNING: ${after.draft} DRAFT rows still remain.`);
      process.exitCode = 4;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
