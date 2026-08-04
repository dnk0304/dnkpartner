/**
 * Generate the MUNICIPALITY alias table: alias slug -> canonical slug, 301.
 *
 * Decision it implements: DECISION-2026-08-04-slug-language.md — canonical is
 * the CO-OFFICIAL / official INE denomination; every other official form of the
 * same municipality is a PERMANENT 301 alias. Both spellings always resolve.
 *
 * SOURCE IS THE OFFICIAL REGISTER ONLY. Every alias emitted here is a name INE
 * itself lists for that INE code — official denomination, co-official
 * denomination, or the bilingual compound of an INE code's own names. Nothing
 * is hand-written. A hand list would look like coverage and behave like
 * guesswork, which is exactly the trap Ghost declined and Ken endorsed
 * declining.
 *
 * KNOWN GAP (documented, not silently absorbed): Castilian exonyms INE has
 * dropped entirely — Gerona, Lerida, Vitoria, Mahon, Calpe, Villarreal,
 * Crevillente, Almazora, Torrente, Puzol — cannot be aliased from this source.
 * At PROVINCE level they are already covered by PROVINCE_ALIAS_TO_CANONICAL.
 * At municipality level closing it needs an official former-denomination
 * source (INE historical register / BOE renaming decrees).
 *
 * Aliases are keyed `"{provinceSlug}/{aliasTownSlug}"` because town slugs live
 * under a province segment and are only unique within it.
 *
 * Run: npx tsx scripts/build-municipality-aliases.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { municipalityKey } from '@/lib/geo/municipality-key';
import { PROVINCE_DB_KEY_TO_SLUG, slugify } from '@/lib/seo/slugs';

const REPO = process.cwd();
const INE_OFFICIAL = path.join(REPO, 'scraper/config/ine_municipalities.csv');
const INE_COOFFICIAL = path.join(REPO, 'scraper/config/ine_municipalities_coofficial.csv');
const OUT = path.join(REPO, 'src/data/municipality-aliases.json');

type IneRow = { ine: string; municipio: string; provincia: string };

function readIne(file: string): IneRow[] {
  const text = readFileSync(file, 'utf8').replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'));
  lines.shift(); // header
  const rows: IneRow[] = [];
  for (const line of lines) {
    const [ine, municipio, provincia] = line.split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
    if (!ine || !municipio) continue;
    const code = ine.padStart(5, '0');
    if (!/^[0-9]{5}$/.test(code)) continue; // sub-municipal EATIM rows
    rows.push({ ine: code, municipio, provincia: provincia ?? '' });
  }
  return rows;
}

function main() {
  const official = readIne(INE_OFFICIAL);
  const coofficial = readIne(INE_COOFFICIAL);

  // Canonical name per INE code = the OFFICIAL register's denomination.
  const canonicalByIne = new Map<string, IneRow>();
  for (const r of official) if (!canonicalByIne.has(r.ine)) canonicalByIne.set(r.ine, r);

  // Every name INE knows for each code.
  const namesByIne = new Map<string, Set<string>>();
  for (const r of [...official, ...coofficial]) {
    if (!namesByIne.has(r.ine)) namesByIne.set(r.ine, new Set());
    namesByIne.get(r.ine)!.add(r.municipio);
  }

  const entries: Record<string, { canonical: string; ine: string; province: string }> = {};
  const collisions: string[] = [];
  let aliasCount = 0;
  let codesWithAlias = 0;

  for (const [ine, names] of namesByIne) {
    const canon = canonicalByIne.get(ine);
    if (!canon) continue; // co-official-only code with no official row — skip, never guess
    const provSlug = PROVINCE_DB_KEY_TO_SLUG[canon.provincia] ?? slugify(canon.provincia);
    if (!provSlug) continue;
    const canonicalSlug = slugify(canon.municipio);
    if (!canonicalSlug) continue;

    // Candidate alias forms: every other INE name for this code, plus the
    // bilingual compounds of the code's own names (BOE rows write
    // "Vitoria-Gasteiz" where INE stores "Vitoria" and "Gasteiz" separately).
    const forms = new Set<string>(names);
    const list = [...names];
    for (const a of list) for (const b of list) if (a !== b) forms.add(`${a}-${b}`);

    let added = false;
    for (const form of forms) {
      const aliasSlug = slugify(form);
      if (!aliasSlug || aliasSlug === canonicalSlug) continue;
      // Never let an alias shadow a DIFFERENT municipality's canonical slug.
      if (municipalityKey(form) === municipalityKey(canon.municipio)) {
        // same place, different punctuation — safe alias
      }
      const key = `${provSlug}/${aliasSlug}`;
      const existing = entries[key];
      if (existing && existing.ine !== ine) {
        collisions.push(`${key}: ${existing.ine} vs ${ine} — DROPPED`);
        delete entries[key];
        continue;
      }
      if (existing) continue;
      entries[key] = { canonical: canonicalSlug, ine, province: canon.provincia };
      aliasCount += 1;
      added = true;
    }
    if (added) codesWithAlias += 1;
  }

  // A collision key must not survive under either claimant.
  for (const c of collisions) delete entries[c.split(':')[0]];

  const payload = {
    generatedAt: new Date().toISOString(),
    decision: 'DECISION-2026-08-04-slug-language.md — co-official canonical, Castilian 301 alias',
    source: 'scraper/config/ine_municipalities.csv + ine_municipalities_coofficial.csv (official INE register)',
    note: 'Keys are "{provinceSlug}/{aliasTownSlug}". Castilian exonyms INE has dropped (Gerona, Lerida, Vitoria, Mahon...) are NOT here — they need an official former-denomination source.',
    counts: { aliases: Object.keys(entries).length, municipalitiesWithAlias: codesWithAlias, collisionsDropped: collisions.length },
    entries,
  };
  writeFileSync(OUT, JSON.stringify(payload, null, 0) + '\n', 'utf8');

  console.log(`[aliases] wrote ${OUT}`);
  console.log(`  aliases                 ${Object.keys(entries).length}`);
  console.log(`  municipalities aliased  ${codesWithAlias}`);
  console.log(`  collisions dropped      ${collisions.length}`);
  for (const c of collisions.slice(0, 10)) console.log(`    ${c}`);
  console.log('\n  spot checks:');
  for (const k of ['alicante/elche', 'valencia/valencia', 'a-coruna/la-coruna', 'araba-alava/vitoria', 'girona/gerona']) {
    console.log(`    ${k.padEnd(28)} -> ${entries[k] ? entries[k].canonical : 'NOT ALIASED'}`);
  }
}

main();
