/**
 * verify-v4-dark-parity-corpus — DERIVE the legacy-surface URL corpus.
 *
 *   npx tsx scripts/verify-v4-dark-parity-corpus.ts \
 *     --base http://localhost:3991 --out /tmp/corpus.txt [--sample 3000]
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS DERIVED AND NOT A LIST
 *
 * Ken's four dark-gate regressions on wave193 were:
 *     /resultados/madrid/msdrid                307 -> /resultados/madrid
 *     /resultados/madrid/carabanchel-alto      307 -> /resultados/madrid
 *     /resultados/alicante/elche               307 -> /resultados/alicante/elx
 *     /resultados/madrid/municipios/pagina/2   404
 *
 * Exactly ONE of those (`msdrid`) is a shape a person would have thought to
 * type into a hand-written corpus. The other three are a district name, an
 * official alias spelling, and a pagination tail. A hand-listed corpus proves
 * only what its author already suspected, so every URL here is generated from
 * a source that does not know what the regression was:
 *
 *   SITEMAP   the BASELINE server's own <loc> set, host-rewritten. This is the
 *             exact surface Google holds, so any URL that moves in it is by
 *             definition a dark-gate violation.
 *   DB        every distinct province and (province, municipality) pair in the
 *             seeded corpus, expanded across all eight legacy shapes plus their
 *             /pagina/N tails. Catches #4.
 *   ALIASES   src/data/municipality-aliases.json — the OFFICIAL INE alias
 *             register (identical bytes in 67b7d3f and HEAD, so it is not a
 *             code-dependent source). Catches #3, and 381 more like it.
 *   DIRTY     seeded deterministic mutations of every real municipality slug:
 *             keyboard-adjacent substitution, adjacent transposition, dropped
 *             char, doubled char, and district-style compounding with suffix
 *             tokens mined from the alias register. `msdrid` is a keyboard
 *             substitution of `madrid` (a->s) and `carabanchel-alto` is a
 *             district compound, so #1 and #2 fall out of the generator rather
 *             than out of anyone's memory. The junk/typo population is the one
 *             that MOVED, so it is deliberately over-represented.
 *
 * ⛔ TRAP (already caused one false green on this project): sitemap <loc>s are
 * ABSOLUTE PRODUCTION URLs (https://subastasactivas.com/...). A crawler that
 * follows them verbatim measures the LIVE SITE and passes while testing
 * nothing. Children are host-rewritten onto --base before fetching and the
 * guard below HARD-EXITS if a production host survives anywhere.
 *
 * Sampling, when it happens, is seeded (mulberry32, fixed seed) and the sample
 * size is printed. Nothing is ever silently truncated.
 */

import { writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { slugify } from '../src/lib/seo/slugs';

loadEnv({ path: resolvePath(__dirname, '..', '.env'), override: false });

const PROD_HOST_RE = /subastasactivas\.com/i;
const OUTCOMES = ['adjudicadas', 'desiertas', 'canceladas', 'finalizadas-sin-resultado'];

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  console.error(`FATAL: --${name} is required`);
  process.exit(2);
}

/** Deterministic PRNG. A random sample that is not reproducible is not evidence. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Strip scheme+host so a URL from either server compares as a path. */
function toPath(u: string): string {
  return u.replace(/^https?:\/\/[^/]+/i, '') || '/';
}

async function fetchText(url: string): Promise<string> {
  const r = await fetch(url, { redirect: 'manual' });
  if (!r.ok) throw new Error(`GET ${url} -> ${r.status}`);
  return await r.text();
}

function locs(xml: string): string[] {
  return (xml.match(/<loc>[^<]*<\/loc>/g) ?? []).map((m) => m.slice(5, -6).trim());
}

async function fromSitemap(base: string): Promise<string[]> {
  const index = await fetchText(`${base}/sitemap.xml`);
  const children = locs(index).map((u) => u.replace(/^https?:\/\/[^/]+/i, base));
  // ⛔ the guard. If any production host survived the rewrite we would be
  // measuring the live site, and every assertion downstream would be a lie.
  for (const c of children) {
    if (PROD_HOST_RE.test(c)) {
      console.error(`FATAL: prod host survived the rewrite: ${c}`);
      process.exit(3);
    }
  }
  if (children.length === 0) {
    console.error('FATAL: sitemap index advertised no children — corpus would be vacuous');
    process.exit(3);
  }
  const out: string[] = [];
  for (const c of children) {
    let xml: string;
    try {
      xml = await fetchText(c);
    } catch (e) {
      console.error(`FATAL: could not fetch advertised child ${c}: ${(e as Error).message}`);
      process.exit(3);
    }
    for (const l of locs(xml)) out.push(toPath(l));
  }
  console.error(`  sitemap: ${children.length} children -> ${out.length} <loc>s`);
  return out;
}

interface Aliases {
  entries: Record<string, { canonical: string; province?: string }>;
}

function main() {
  return (async () => {
    const base = arg('base');
    const out = arg('out');
    const sample = Number(arg('sample', '3500'));
    const seed = Number(arg('seed', '20260814'));

    if (PROD_HOST_RE.test(base)) {
      console.error(`FATAL: --base points at production (${base})`);
      process.exit(3);
    }

    const buckets: Record<string, Set<string>> = {
      sitemap: new Set(),
      legacy: new Set(),
      alias: new Set(),
      dirty: new Set(),
    };

    // --- 1. the baseline's own sitemap ------------------------------------
    for (const p of await fromSitemap(base)) buckets.sitemap.add(p);

    // --- 2. the DB's own geography ----------------------------------------
    const url = process.env.DATABASE_URL;
    if (!url) {
      console.error('FATAL: DATABASE_URL unset');
      process.exit(2);
    }
    const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
    const rows = await prisma.$queryRawUnsafe<{ province: string; municipality: string | null }[]>(
      `SELECT DISTINCT province, municipality FROM "Auction"`,
    );
    await prisma.$disconnect();

    const provs = new Set<string>();
    const pairs = new Set<string>(); // "prov/muni"
    for (const r of rows) {
      const p = slugify(r.province ?? '');
      if (!p) continue;
      provs.add(p);
      const m = slugify(r.municipality ?? '');
      if (m) pairs.add(`${p}/${m}`);
    }
    console.error(`  db: ${provs.size} provinces, ${pairs.size} province/municipality pairs`);
    if (provs.size === 0 || pairs.size === 0) {
      console.error('FATAL: DB yielded no geography — corpus would be vacuous');
      process.exit(3);
    }

    // --- 3. every legacy shape, expanded ----------------------------------
    // The eight shapes named in the brief, plus the /pagina/N tails on each —
    // #4 (`/municipios/pagina/2`) lived in a tail nobody enumerated.
    const PAGES = [2, 3, 11];
    for (const p of provs) {
      buckets.legacy.add(`/resultados/${p}`);
      buckets.legacy.add(`/subastas/${p}`);
      buckets.legacy.add(`/resultados/${p}/municipios`);
      for (const n of PAGES) {
        buckets.legacy.add(`/resultados/${p}/pagina/${n}`);
        buckets.legacy.add(`/resultados/${p}/municipios/pagina/${n}`);
      }
      for (const o of OUTCOMES) {
        buckets.legacy.add(`/resultados/${o}/${p}`); // v3 outcome-FIRST
        buckets.legacy.add(`/resultados/${p}/${o}`); // v4 outcome-LAST
        for (const n of PAGES) buckets.legacy.add(`/resultados/${o}/${p}/pagina/${n}`);
      }
    }
    for (const pm of pairs) {
      buckets.legacy.add(`/resultados/${pm}`);
      buckets.legacy.add(`/subastas/${pm}`);
      for (const n of PAGES) buckets.legacy.add(`/resultados/${pm}/pagina/${n}`);
    }

    // --- 4. official alias spellings (catches the elche->elx class) --------
    const aliasPath = resolvePath(__dirname, '..', 'src', 'data', 'municipality-aliases.json');
    const aliases = JSON.parse(readFileSync(aliasPath, 'utf8')) as Aliases;
    const aliasKeys = Object.keys(aliases.entries ?? {});
    for (const k of aliasKeys) {
      const [p] = k.split('/');
      if (!provs.has(p)) continue; // only provinces this corpus actually has
      buckets.alias.add(`/resultados/${k}`);
      buckets.alias.add(`/subastas/${k}`);
    }
    console.error(`  aliases: ${aliasKeys.length} in register, ${buckets.alias.size} urls in-corpus`);

    // --- 5. DIRTY slugs — the population that actually moved ---------------
    // District-style suffix tokens, mined from the alias register's own
    // multi-token slugs rather than invented (so `-alto`/`-bajo`/`-de-arriba`
    // style compounds come from the data).
    const suffixCount = new Map<string, number>();
    for (const k of aliasKeys) {
      const toks = k.split('/')[1]?.split('-') ?? [];
      if (toks.length > 1) {
        const t = toks[toks.length - 1];
        if (t.length > 2) suffixCount.set(t, (suffixCount.get(t) ?? 0) + 1);
      }
    }
    const SUFFIXES = [...suffixCount.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 6)
      .map(([t]) => t);
    // `alto` is a real Madrid district suffix (Carabanchel Alto) and is the
    // shape of regression #2; include it explicitly alongside the mined ones so
    // the district class is covered even on a corpus whose aliases lack it.
    for (const t of ['alto', 'bajo', 'nuevo', 'viejo']) if (!SUFFIXES.includes(t)) SUFFIXES.push(t);

    // Keyboard adjacency — `madrid` -> `msdrid` is a->s on a QWERTY row.
    const ADJ: Record<string, string> = {
      a: 's', b: 'v', c: 'x', d: 's', e: 'r', f: 'g', g: 'h', h: 'j', i: 'o',
      j: 'k', k: 'l', l: 'k', m: 'n', n: 'm', o: 'i', p: 'o', q: 'w', r: 't',
      s: 'a', t: 'y', u: 'i', v: 'b', w: 'q', x: 'z', y: 'u', z: 'x',
    };

    function mutate(slug: string, rnd: () => number): string[] {
      const letters = [...slug].map((c, i) => [c, i] as const).filter(([c]) => /[a-z]/.test(c));
      if (letters.length < 3) return [];
      const out: string[] = [];
      // keyboard-adjacent substitution at a seeded position
      const [, ki] = letters[Math.floor(rnd() * letters.length)];
      const kc = ADJ[slug[ki]];
      if (kc) out.push(slug.slice(0, ki) + kc + slug.slice(ki + 1));
      // adjacent transposition
      const ti = letters[Math.floor(rnd() * (letters.length - 1))][1];
      if (/[a-z]/.test(slug[ti + 1] ?? '')) {
        out.push(slug.slice(0, ti) + slug[ti + 1] + slug[ti] + slug.slice(ti + 2));
      }
      // dropped char
      const di = letters[Math.floor(rnd() * letters.length)][1];
      out.push(slug.slice(0, di) + slug.slice(di + 1));
      // doubled char
      out.push(slug.slice(0, di) + slug[di] + slug.slice(di));
      return out.filter((s) => s && s !== slug);
    }

    const rnd = mulberry32(seed);
    const pairList = [...pairs].sort();
    for (const pm of pairList) {
      const [p, m] = pm.split('/');
      for (const bad of mutate(m, rnd)) {
        buckets.dirty.add(`/resultados/${p}/${bad}`);
        buckets.dirty.add(`/subastas/${p}/${bad}`);
      }
      for (const s of SUFFIXES) {
        buckets.dirty.add(`/resultados/${p}/${m}-${s}`);
      }
    }
    // province-level junk too — a junk PROVINCE segment is a different code path
    for (const p of [...provs].sort()) {
      for (const bad of mutate(p, rnd)) {
        buckets.dirty.add(`/resultados/${bad}`);
        buckets.dirty.add(`/resultados/${bad}/madrid`);
      }
    }

    // --- 6. merge, dedupe, seeded sample ----------------------------------
    const all = new Set<string>();
    const order: [string, Set<string>][] = [
      ['sitemap', buckets.sitemap],
      ['legacy', buckets.legacy],
      ['alias', buckets.alias],
      ['dirty', buckets.dirty],
    ];
    for (const [name, s] of order) {
      console.error(`  bucket ${name.padEnd(8)} = ${s.size}`);
      for (const u of s) all.add(u);
    }

    let list = [...all].sort();
    const total = list.length;

    // ⭐ WHAT MAY BE SAMPLED, AND WHAT MAY NOT.
    //
    // The first proportional-sampling pass over ALL FOUR buckets silently
    // dropped `/resultados/madrid/municipios/pagina/2` — Ken's regression #4 —
    // because the unbounded `dirty` bucket ate most of the quota. A harness
    // that samples away a KNOWN regression is worse than no harness.
    //
    // So the sitemap / legacy / alias buckets are EXHAUSTIVE and never sampled.
    // They are finite (they enumerate the real legacy surface: what Google
    // holds, the eight legacy shapes with their tails, and the official alias
    // register) and they are exactly where three of the four regressions lived.
    // Only `dirty` — the combinatorially generated junk-slug population, which
    // is unbounded by construction — is sampled down to the remaining budget.
    const EXHAUSTIVE = new Set(['sitemap', 'legacy', 'alias']);
    const kept = new Set<string>();
    for (const [name, s] of order) if (EXHAUSTIVE.has(name)) for (const u of s) kept.add(u);

    const budget = Math.max(0, sample - kept.size);
    const dirty = [...buckets.dirty].filter((u) => !kept.has(u)).sort();
    if (Number.isFinite(sample) && sample > 0 && dirty.length > budget) {
      const r2 = mulberry32(seed ^ 0x5f3759df);
      for (let i = dirty.length - 1; i > 0; i--) {
        const j = Math.floor(r2() * (i + 1));
        [dirty[i], dirty[j]] = [dirty[j], dirty[i]];
      }
      const take = dirty.slice(0, budget);
      for (const u of take) kept.add(u);
      console.error(
        `  SAMPLED: ${kept.size} of ${total} urls — sitemap/legacy/alias EXHAUSTIVE ` +
          `(${kept.size - take.length}), dirty sampled ${take.length} of ${dirty.length} (seed=${seed})`,
      );
    } else {
      for (const u of dirty) kept.add(u);
      console.error(`  FULL: ${kept.size} of ${total} urls (no sampling; cap was ${sample})`);
    }
    list = [...kept].sort();

    // final paranoia: nothing absolute, nothing pointing at prod
    for (const u of list) {
      if (PROD_HOST_RE.test(u) || /^https?:/i.test(u)) {
        console.error(`FATAL: non-relative url in corpus: ${u}`);
        process.exit(3);
      }
    }

    writeFileSync(out, list.join('\n') + '\n', 'utf8');

    // Post-sample per-bucket counts, written where the shell can assert on them.
    // The sizes printed further up are PRE-sample; the caller needs to know that
    // every derivation source actually survived into the file it is about to
    // probe, or a bucket can be sampled to nothing and the run goes blind to a
    // whole regression class without saying so.
    const inList = new Set(list);
    const counts = order.map(([name, s]) => {
      let n = 0;
      for (const u of s) if (inList.has(u)) n++;
      return `${name}\t${n}`;
    });
    writeFileSync(out + '.buckets', counts.join('\n') + '\n', 'utf8');
    console.error(`  post-sample buckets: ${counts.map((c) => c.replace('\t', '=')).join(' ')}`);
    console.error(`  wrote ${list.length} urls -> ${out}`);
  })();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
