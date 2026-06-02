/**
 * Article import CLI. Idempotent: upserts by slug.
 *
 * Usage:
 *   tsx scripts/import-articles/import.ts [--dry-run] [--articles-dir <path>]
 *
 * --dry-run : parse only, no DB writes. Prints summary + sample.
 * --articles-dir : override source directory (default: marketing/content-seo/articles/).
 *
 * NOTE on idempotency: if an Article exists with status=PUBLISHED, the import
 * does NOT demote it. It updates the body/meta fields but preserves status +
 * publishedAt. This is the safe behaviour Dennis asked for: re-run import to
 * refresh drafts without un-publishing live articles.
 */
import * as fs from 'fs';
import * as path from 'path';
import { parseArticleFile, ParsedArticle, ParseResult } from './parser';

const DEFAULT_ARTICLES_DIR = String.raw`C:\Users\D\.claude\agent-memory\marketing\PROJECTS\dnksubastas\content-seo\articles`;

interface CliOpts {
  dryRun: boolean;
  articlesDir: string;
  verbose: boolean;
}

function parseArgs(argv: string[]): CliOpts {
  const opts: CliOpts = { dryRun: false, articlesDir: DEFAULT_ARTICLES_DIR, verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--verbose' || a === '-v') opts.verbose = true;
    else if (a === '--articles-dir') opts.articlesDir = argv[++i];
    else if (a.startsWith('--articles-dir=')) opts.articlesDir = a.split('=')[1];
  }
  return opts;
}

interface ParseRow {
  file: string;
  result: ParseResult;
}

function parseAll(dir: string): ParseRow[] {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f.toUpperCase() !== 'INDEX.MD')
    .map((f) => path.join(dir, f));
  return files.map((f) => ({ file: f, result: parseArticleFile(f) }));
}

async function importToDb(rows: ParseRow[]): Promise<{ inserted: number; updated: number; skippedPublished: number; failed: string[] }> {
  // Lazy import so --dry-run never touches Prisma (and we don't need DATABASE_URL).
  const { prisma } = await import('../../src/lib/prisma');
  let inserted = 0;
  let updated = 0;
  let skippedPublished = 0;
  const failed: string[] = [];

  try {
    // Sequential — single PrismaClient, one row at a time. Avoids the
    // "too many clients" exhaustion that killed the wave12 first run.
    for (const row of rows) {
      if (!row.result.ok || !row.result.article) continue;
      const a = row.result.article;
      try {
        const existing = await prisma.article.findUnique({ where: { slug: a.slug } });
        if (existing) {
          const preservePublished = existing.status === 'PUBLISHED';
          // Update content/SEO fields only. Never touch status (unless explicitly
          // resetting drafts), publishedAt, or authorEmail — those are owned by
          // the publish flow and must survive a re-import.
          await prisma.article.update({
            where: { slug: a.slug },
            data: {
              title: a.title,
              seoTitle: a.seoTitle,
              metaDescription: a.metaDescription,
              primaryKeyword: a.primaryKeyword,
              secondaryKeywords: a.secondaryKeywords,
              cluster: a.cluster,
              imageAlt: a.imageAlt,
              canonicalUrl: a.canonicalUrl,
              bodyMarkdown: a.bodyMarkdown,
              // never demote, never reset publishedAt, never overwrite authorEmail
              ...(preservePublished ? {} : { status: 'DRAFT' as const }),
            },
          });
          if (preservePublished) skippedPublished++;
          updated++;
        } else {
          await prisma.article.create({
            data: {
              slug: a.slug,
              title: a.title,
              seoTitle: a.seoTitle,
              metaDescription: a.metaDescription,
              primaryKeyword: a.primaryKeyword,
              secondaryKeywords: a.secondaryKeywords,
              cluster: a.cluster,
              imageAlt: a.imageAlt,
              canonicalUrl: a.canonicalUrl,
              bodyMarkdown: a.bodyMarkdown,
              status: 'DRAFT',
              authorEmail: 'dennis.kotlenko@gmail.com',
            },
          });
          inserted++;
        }
      } catch (e) {
        failed.push(`${a.slug}: ${String(e)}`);
      }
    }
  } finally {
    // Always release the connection pool so the script exits cleanly.
    await prisma.$disconnect();
  }
  return { inserted, updated, skippedPublished, failed };
}

/**
 * Dry-run diff: parse-only, no DB connection required. For each parsed slug,
 * prints body length + a short body head so Ken can eyeball what will be
 * written. Junk patterns (H1:/H2:/featured-snippet bait) MUST be absent
 * from these previews.
 */
function dryRunDiff(rows: ParseRow[]): void {
  console.log(`\n=== DRY-RUN PER-SLUG PREVIEW ===`);
  for (const row of rows) {
    if (!row.result.ok || !row.result.article) {
      console.log(`  FAIL ${path.basename(row.file)}: ${row.result.error}`);
      continue;
    }
    const a = row.result.article;
    const head = a.bodyMarkdown.slice(0, 160).replace(/\n/g, ' ');
    const hasJunk =
      /(^|\n)\s*#{1,6}\s+H[1-6]:/.test(a.bodyMarkdown) ||
      /featured-snippet bait/i.test(a.bodyMarkdown) ||
      /\(~?\d+\s*palabras\)/i.test(a.bodyMarkdown);
    const flag = hasJunk ? ' [JUNK!]' : '';
    console.log(`  ${a.slug.padEnd(48)} body=${String(a.bodyMarkdown.length).padStart(5)}  ${head.slice(0, 80)}…${flag}`);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(opts.articlesDir)) {
    console.error(`articles-dir not found: ${opts.articlesDir}`);
    process.exit(1);
  }

  const rows = parseAll(opts.articlesDir);
  const ok = rows.filter((r) => r.result.ok);
  const failed = rows.filter((r) => !r.result.ok);
  const withWarnings = rows.filter((r) => r.result.warnings.length > 0);

  console.log(`\n=== PARSE REPORT ===`);
  console.log(`Total files: ${rows.length}`);
  console.log(`Parsed OK:   ${ok.length}`);
  console.log(`Failed:      ${failed.length}`);
  console.log(`Warnings:    ${withWarnings.length}`);

  // Header-style breakdown
  const styles = new Map<string, number>();
  for (const r of ok) {
    if (!r.result.article) continue;
    const s = r.result.article.headerStyle;
    styles.set(s, (styles.get(s) ?? 0) + 1);
  }
  console.log(`\nHeader-style breakdown:`);
  for (const [s, n] of [...styles.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${s.padEnd(22)} ${n}`);
  }

  if (failed.length > 0) {
    console.log(`\nFAILED:`);
    for (const r of failed) {
      console.log(`  ${path.basename(r.file)}: ${r.result.error}`);
    }
  }
  if (withWarnings.length > 0 && opts.verbose) {
    console.log(`\nWARNINGS:`);
    for (const r of withWarnings) {
      console.log(`  ${path.basename(r.file)}: ${r.result.warnings.join('; ')}`);
    }
  }

  // Sample one parsed article
  const sample = ok[0]?.result.article;
  if (sample) {
    console.log(`\n=== SAMPLE PARSED ARTICLE ===`);
    console.log(`slug:              ${sample.slug}`);
    console.log(`title:             ${sample.title}`);
    console.log(`seoTitle:          ${sample.seoTitle ?? '(none)'}`);
    console.log(`metaDescription:   ${(sample.metaDescription ?? '(none)').slice(0, 100)}${(sample.metaDescription?.length ?? 0) > 100 ? '…' : ''}`);
    console.log(`primaryKeyword:    ${sample.primaryKeyword ?? '(none)'}`);
    console.log(`secondaryKeywords: [${sample.secondaryKeywords.length}] ${sample.secondaryKeywords.slice(0, 3).join(', ')}${sample.secondaryKeywords.length > 3 ? '…' : ''}`);
    console.log(`cluster:           ${sample.cluster ?? '(none)'}`);
    console.log(`headerStyle:       ${sample.headerStyle}`);
    console.log(`status:            DRAFT (default on import)`);
    console.log(`body length:       ${sample.bodyMarkdown.length} chars`);
    console.log(`body preview:      ${sample.bodyMarkdown.slice(0, 200).replace(/\n/g, ' ')}…`);
  }

  if (opts.dryRun) {
    dryRunDiff(rows);
    console.log(`\n[dry-run] Skipping DB writes.`);
    process.exit(failed.length > 0 ? 2 : 0);
  }

  console.log(`\n=== IMPORTING TO DB ===`);
  const summary = await importToDb(rows);
  console.log(`Inserted: ${summary.inserted}`);
  console.log(`Updated:  ${summary.updated} (of which preserved PUBLISHED: ${summary.skippedPublished})`);
  if (summary.failed.length > 0) {
    console.log(`DB failures: ${summary.failed.length}`);
    for (const f of summary.failed) console.log(`  ${f}`);
    process.exit(3);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
