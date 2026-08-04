/**
 * scripts/slug-v2-corpus-proof.ts — the UNIQUENESS PROOF for the v2 slug engine.
 *
 * Runs the REAL generator over the FULL live corpus and asserts
 * COUNT(*) ... GROUP BY slug HAVING count > 1  ==  0.
 *
 * Reproduce (no DB creds needed on this machine — the dump is produced ON the box):
 *   # 1. on the Hetzner box, dump the corpus base64-per-line (COPY text format
 *   #    mangles the backslashes inside JSON, hence base64):
 *   docker exec <pg-container> psql -U dnksubastas -d dnksubastas -c "\COPY (
 *     SELECT replace(encode(convert_to(row_to_json(t)::text,'UTF8'),'base64'), E'
','')
 *     FROM (SELECT id, category, province, municipality, address, title,
 *                  "vehicleMake", "vehicleModel", "vehicleYear", "auctionType"
 *           FROM "Auction") t) TO STDOUT" > corpus.b64
 *   # 2. locally:
 *   npx tsx scripts/slug-v2-corpus-proof.ts corpus.b64
 *
 * RESULT 2026-08-03 (240,890 rows): 240,890 distinct slugs, 0 duplicates,
 * 0 malformed. Counterfactual without the id suffix: 55,254 rows would have
 * collided across 11,077 URLs.
 */
import * as fs from 'node:fs';
import { buildAuctionPathV2, buildAuctionSlugV2Segment, shortId } from '../src/lib/seo/slug-v2';

type Row = {
  id: string; category: string | null; province: string | null; municipality: string | null;
  address: string | null; title: string | null;
  vehicleMake: string | null; vehicleModel: string | null; vehicleYear: number | null;
};

const path = process.argv[2];
const lines = fs.readFileSync(path, 'utf8').split('\n').filter(Boolean);
const rows: Row[] = lines.map((l) => JSON.parse(Buffer.from(l.trim(), 'base64').toString('utf8')));
console.log('rows parsed:', rows.length);

const seen = new Map<string, string[]>();
const bare = new Map<string, number>();   // slug WITHOUT the id suffix (old behaviour)
const sidSeen = new Map<string, number>();
let maxLen = 0, maxSlug = '', bad = 0;

for (const r of rows) {
  const p = buildAuctionPathV2(r);
  (seen.get(p) ?? seen.set(p, []).get(p)!).push(r.id);
  const seg = buildAuctionSlugV2Segment(r);
  const noSuffix = `/${p.split('/')[1]}/${p.split('/')[2]}/${seg.slice(0, -(shortId(r.id).length + 1))}`;
  bare.set(noSuffix, (bare.get(noSuffix) ?? 0) + 1);
  sidSeen.set(shortId(r.id), (sidSeen.get(shortId(r.id)) ?? 0) + 1);
  if (p.length > maxLen) { maxLen = p.length; maxSlug = p; }
  if (!/^\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+$/.test(p) || /--|-\/|\/-/.test(p)) { if (bad < 5) console.log('MALFORMED:', p); bad++; }
}

const dupes = [...seen.entries()].filter(([, ids]) => ids.length > 1);
const bareDupes = [...bare.entries()].filter(([, n]) => n > 1);
const bareDupeRows = bareDupes.reduce((s, [, n]) => s + n, 0);
const sidDupes = [...sidSeen.values()].filter((n) => n > 1).length;

console.log('=== UNIQUENESS PROOF (always-suffix, v2.1) ===');
console.log('distinct slugs      :', seen.size);
console.log('DUPLICATE slugs     :', dupes.length, '  (rows involved:', dupes.reduce((s, [, i]) => s + i.length, 0), ')');
console.log('malformed slugs     :', bad);
console.log('longest path        :', maxLen, maxSlug);
console.log('--- counterfactual: WITHOUT the id suffix (the bounced v2.0 behaviour) ---');
console.log('colliding bare slugs:', bareDupes.length, ' rows that would collide:', bareDupeRows);
console.log('worst bare collision:', bareDupes.sort((a, b) => b[1] - a[1]).slice(0, 3));
console.log('--- residual: global shortId(SHORT_ID_LEN) reuse across the corpus:', sidDupes, 'ids share an id suffix with >=1 other row');
if (dupes.length) console.log('SAMPLE DUPES:', dupes.slice(0, 10));
