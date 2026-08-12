/**
 * Orphan proof for the /resultados town archives (Forge, 2026-08-12).
 *
 * Ken's release gate for the D1 sitemap widening is "town archives with zero
 * inbound internal links: must be 0, proven by a crawl or by the query, not
 * asserted". This is the crawl.
 *
 * BFS from `/` over REAL SSR anchors only (the server HTML, no JS execution —
 * which is the point: the client archive island's "load more" fetches a
 * robots-disallowed querystring URL, so anything only reachable that way is
 * orphaned as far as Googlebot is concerned). Reports, per province, the set of
 * town archives that EXIST versus the set the crawl actually reached, plus the
 * depth at which each was first seen.
 *
 * Run against a `next start` on the verify fixture:
 *   BASE=http://localhost:3991 npx tsx scripts/forge-crawl-orphan-proof.ts
 */

import { config as loadEnv } from 'dotenv';
loadEnv();

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { PROVINCE_DB_KEY_TO_SLUG, slugify } from '../src/lib/seo/slugs';

const BASE = process.env.BASE ?? 'http://localhost:3991';
/** Depth cap — the claim under test is 4, so 8 leaves generous headroom. */
const MAX_DEPTH = Number(process.env.MAX_DEPTH ?? 8);

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const REGISTRY_OUTCOMES = ['VENDIDA', 'DESIERTA', 'CANCELADA', 'FINALIZADA_SIN_RESULTADO'];

/** Every town archive that EXISTS, as `/resultados/{prov}/{muni}`. */
async function expectedTownArchives(): Promise<Set<string>> {
  const rows = await prisma.auctionOutcomeStats.findMany({
    where: { period: 'ALL', periodBasis: 'CONCLUDED', category: '' },
    select: { province: true, municipality: true, outcome: true, count: true },
  });
  const totals = new Map<string, number>();
  for (const r of rows) {
    if (!r.municipality || !r.province) continue;
    if (!REGISTRY_OUTCOMES.includes(r.outcome)) continue;
    const provSlug = PROVINCE_DB_KEY_TO_SLUG[r.province];
    if (!provSlug) continue;
    const muniSlug = slugify(r.municipality);
    if (!muniSlug) continue;
    const key = `/resultados/${provSlug}/${muniSlug}`;
    totals.set(key, (totals.get(key) ?? 0) + r.count);
  }
  return new Set([...totals.entries()].filter(([, n]) => n > 0).map(([k]) => k));
}

/** Extract same-origin, crawlable `/resultados` + `/subastas` anchors. */
function anchorsOf(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/href="(\/[^"#?]*)"/g)) {
    const href = m[1].replace(/\/$/, '') || '/';
    if (href === '/' || href.startsWith('/resultados') || href.startsWith('/subastas')) {
      out.add(href);
    }
  }
  return [...out];
}

async function run() {
  const expected = await expectedTownArchives();

  const depth = new Map<string, number>([['/', 0]]);
  let frontier = ['/'];

  for (let d = 1; d <= MAX_DEPTH && frontier.length; d++) {
    const next: string[] = [];
    // Bounded concurrency — this walks thousands of URLs on a real corpus.
    for (let i = 0; i < frontier.length; i += 16) {
      const batch = frontier.slice(i, i + 16);
      const pages = await Promise.all(
        batch.map(async (u) => {
          const res = await fetch(`${BASE}${u}`, { redirect: 'follow' });
          return res.ok ? res.text() : '';
        }),
      );
      for (const html of pages) {
        for (const href of anchorsOf(html)) {
          if (!depth.has(href)) {
            depth.set(href, d);
            next.push(href);
          }
        }
      }
    }
    const reachedNow = [...expected].filter((t) => depth.has(t)).length;
    console.log(`depth ${d}: frontier ${frontier.length} → ${next.length} new · town archives reached ${reachedNow}/${expected.size}`);
    frontier = next;
  }

  const missing = [...expected].filter((t) => !depth.has(t)).sort();
  const reached = [...expected].filter((t) => depth.has(t));
  const maxTownDepth = reached.reduce((m, t) => Math.max(m, depth.get(t)!), 0);

  console.log('');
  console.log(`town archives that exist   : ${expected.size}`);
  console.log(`town archives reached      : ${reached.length}`);
  console.log(`ORPHANS (zero inbound link): ${missing.length}`);
  console.log(`max click depth to a town archive: ${maxTownDepth}`);
  if (missing.length) console.log('missing:\n  ' + missing.slice(0, 40).join('\n  '));

  await prisma.$disconnect();
  if (missing.length) process.exit(1);
  console.log('\nORPHAN PROOF PASSED — every town archive has an inbound internal link.');
}

run().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
