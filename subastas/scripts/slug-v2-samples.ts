/**
 * Sample-URL extraction for Dennis's slug-shape sign-off. Reads the base64
 * corpus dump, runs BOTH the live (old) and v2 (new) generators, and picks
 * rows covering every case the dispatch brief demands.
 */
import * as fs from 'node:fs';
import { buildAuctionPathV2 } from '../src/lib/seo/slug-v2';
import { buildAuctionSlug } from '../src/lib/seo/auction-slug';

type Row = {
  id: string; category: string | null; province: string | null; municipality: string | null;
  address: string | null; title: string | null; auctionType?: string | null;
  vehicleMake: string | null; vehicleModel: string | null; vehicleYear: number | null;
};

const rows: Row[] = fs.readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean)
  .map((l) => JSON.parse(Buffer.from(l.trim(), 'base64').toString('utf8')));

const oldUrl = (r: Row) => `/subastas/subasta/${buildAuctionSlug({ id: r.id, auctionType: r.auctionType ?? null, province: r.province, municipality: r.municipality })}`;
const newUrl = (r: Row) => buildAuctionPathV2(r);

const has = (s: string | null) => !!s && s.trim().length > 3 && s.trim().toLowerCase() !== 'unknown';
const PROP = new Set(['Viviendas', 'Garajes', 'Trasteros', 'Locales', 'Fincas rústicas', 'Terrenos', 'Otros inmuebles', 'Naves industriales']);
const VEH = new Set(['Turismos', 'Motocicletas', 'Vehículos Industriales', 'Barcos']);

// same-address pair: two rows whose NEW slug differs ONLY in the id suffix
const byBare = new Map<string, Row[]>();
for (const r of rows) {
  if (!PROP.has(r.category ?? '') || !has(r.address)) continue;
  const p = newUrl(r);
  const bare = p.slice(0, p.lastIndexOf('-'));
  (byBare.get(bare) ?? byBare.set(bare, []).get(bare)!).push(r);
}
const pair = [...byBare.values()].find((g) => g.length === 2 && g[0].municipality && !/^\w{0,3}$/.test(g[0].address ?? ''));

const pick = (f: (r: Row) => boolean) => rows.find(f);

const chosen: Array<[string, Row | undefined]> = [
  ['property · plain street + number', pick((r) => r.category === 'Viviendas' && has(r.address) && /^[A-Za-z\/. ]+\s?\d+,?\s*[A-Za-z]*$/.test((r.address ?? '').trim()) && !!r.municipality)],
  ['property · ACCENTED street (á/é/í/ó/ú)', pick((r) => r.category === 'Viviendas' && has(r.address) && /[áéíóúÁÉÍÓÚ]/.test(r.address ?? '') && !!r.municipality)],
  ['property · ñ in street or town', pick((r) => PROP.has(r.category ?? '') && has(r.address) && /ñ|Ñ/.test((r.address ?? '') + (r.municipality ?? '')))],
  ['property · UNIT-BEARING (planta/puerta/escalera)', pick((r) => r.category === 'Viviendas' && has(r.address) && /\b(pl|planta)\b.*\b(pt|puerta)\b/i.test(r.address ?? ''))],
  ['property · very long cadastral address (length cap)', pick((r) => PROP.has(r.category ?? '') && (r.address ?? '').length > 80 && !!r.municipality)],
  ['property · MISSING address → town fallback', pick((r) => r.category === 'Viviendas' && !has(r.address) && !has(r.title) && !!r.municipality)],
  ['property · address absent, street parsed from house-style TITLE', pick((r) => r.category === 'Viviendas' && !has(r.address) && /^subasta\b.*?\ben\s+\S/i.test((r.title ?? '').trim()))],
  ['property · address absent, title is BOILERPLATE (must NOT parse)', pick((r) => r.category === 'Viviendas' && !has(r.address) && !!r.title && !/^subasta\b/i.test(r.title.trim()) && /\ben\s+/i.test(r.title) && !!r.municipality)],
  ['vehicle · WITH make/model/year extract', pick((r) => VEH.has(r.category ?? '') && !!r.vehicleMake && !!r.vehicleModel && !!r.vehicleYear)],
  ['vehicle · NO extract → town fallback (~95% today)', pick((r) => r.category === 'Turismos' && !r.vehicleMake && !!r.municipality)],
  ['property · SAME-ADDRESS PAIR (1/2) — collision case', pair?.[0]],
  ['property · SAME-ADDRESS PAIR (2/2) — collision case', pair?.[1]],
  ['edge · municipality NULL → sin-municipio', pick((r) => !r.municipality && has(r.address))],
];

const esc = (s: string | null | undefined) => (s ?? '—').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

console.log('| # | case | DB address / vehicle | OLD URL | NEW URL |');
console.log('|---|---|---|---|---|');
chosen.forEach(([label, r], i) => {
  if (!r) { console.log(`| ${i + 1} | ${label} | **NO ROW FOUND** | — | — |`); return; }
  const src = VEH.has(r.category ?? '')
    ? esc([r.vehicleMake, r.vehicleModel, r.vehicleYear].filter(Boolean).join(' ') || null)
    : esc(r.address ?? r.title);
  console.log(`| ${i + 1} | ${label} | \`${src}\` | \`${oldUrl(r)}\` | \`${newUrl(r)}\` |`);
});

// stats for the report
const lens = rows.map((r) => newUrl(r).length).sort((a, b) => a - b);
console.log('URL length — max', lens[lens.length - 1], 'p99', lens[Math.floor(lens.length * 0.99)], 'median', lens[Math.floor(lens.length / 2)]);
const townLong = rows.filter((r) => (newUrl(r).split('/')[2] ?? '').length > 30).length;
console.log('rows whose TOWN segment >30 chars (municipality column polluted with a full address):', townLong);
