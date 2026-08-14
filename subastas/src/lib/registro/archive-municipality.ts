import { resolveTownName } from '@/lib/geo/resolve-town';
import { safeMunicipioSegment } from '@/lib/seo/archive-partitions';
import { slugify } from '@/lib/seo/slugs';
import { isUrlV4SwitchOn } from '@/lib/seo/url-v4-switch';

/**
 * ⭐ THE ARCHIVE'S ONE MUNICIPALITY RESOLUTION POINT (Ken's MUNI-A ruling,
 * 2026-08-13).
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 * `/resultados/madrid/municipios` said "Los 302 municipios de Madrid". Madrid
 * has 179. The archive was deriving its town list from `DISTINCT(municipality)`
 * over scraped `Auction` rows, so every scraper artefact became a permanent URL:
 * nine misspellings of Madrid (`Msdrid`, `Madrdi`, `Madrd`, `Maddrid`, `Mdrid`,
 * `Madird`, `Madid`, `Madri`, `Madridd`), districts posing as municipalities
 * (`Carabanchel Alto`, `Puente de Vallecas`, `Villaverde`, `Aravaca`), and other
 * provinces' capitals misfiled (`Valencia`, `Murcia` under Madrid). Each one was
 * a town archive URL and, after P3, a sitemap entry.
 *
 * The ruling was structural: **do not build a typo list.** A blacklist is
 * unbounded and the scraper invents new entries every week. Instead the INE
 * register becomes the ONLY source of towns. A municipality absent from the
 * gazetteer cannot mint a URL, cannot appear in a list, and cannot enter the
 * sitemap, no matter how many rows carry it. Rows that fail to resolve fall back
 * to the PROVINCE level, exactly as `sin-municipio` already does.
 *
 * That inverts the failure mode permanently: dirty data now costs us COVERAGE,
 * which Ghost's MUNI-B normalisation pass recovers, instead of JUNK URLS, which
 * nothing recovers. It also makes the count self-correcting — Madrid reads what
 * the register says, not what someone deduplicated once.
 *
 * ── WHY IT IS ONE FUNCTION AND NOT SEVEN ────────────────────────────────────
 * Before this, seven places independently turned a corpus municipality into a
 * URL segment, and they disagreed with each other in two ways that were already
 * producing wrong output:
 *
 *   • `registro-read.ts` (×2), `page-data.ts` (×2) and the partition report used
 *     BARE `slugify`, while `archive-node-read.ts` and `archive-legacy-target.ts`
 *     applied `safeMunicipioSegment`. So the planner's child keys and the
 *     resolver's slugs disagreed for any town colliding with a reserved segment.
 *   • collision folds disagreed on the operator — `archive-node-read` SUMMED
 *     totals across names sharing a slug; everyone else took the MAX, silently
 *     discarding rows.
 *
 * Ken: "One resolution point, not four. If you find four, extract one; a second
 * copy is how this comes back." Both defects above are what a second copy looks
 * like eighteen months in, so the fix is the extraction, not seven patches.
 *
 * The gazetteer work itself is NOT duplicated here either — this delegates to
 * `resolveTownName`, which is rung 2 of the v3 mint's own precedence ladder.
 * The archive and the detail-URL mint therefore cannot drift apart on what
 * counts as a real town.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT DO ──────────────────────────────────────
 * No fuzzy matching, no edit distance, no nearest-neighbour snap. `Msdrid`
 * resolves to NOTHING and its rows go to the province hub. Mapping `Msdrid` to
 * `madrid` requires knowing it was a typo for Madrid, which is a DATA question
 * owned by MUNI-B; guessing it here would mint a permanently wrong URL, and a
 * wrong permanent URL is worse than a missing one.
 *
 * Districts likewise: the gazetteer carries no district→parent relation (it
 * discards sub-municipal INE codes on purpose), so `Carabanchel Alto` degrades
 * to the province rather than being guessed into `madrid`. Ken ruled that row
 * Ghost's.
 */

export type ArchiveMunicipality = {
  /** INE official denomination — the display name. */
  name: string;
  /** 5-digit INE code. The stable identity two spellings collapse onto. */
  ine: string;
  /**
   * URL segment, reserved-word-escaped. Always derived HERE so the planner's
   * child keys and the route resolver's slugs cannot disagree.
   */
  slug: string;
};

/**
 * Resolve a raw corpus `(province, municipality)` pair to a canonical town, or
 * `null` when it is not a municipality of that province.
 *
 * `null` is not an error — it is the instruction to place those rows at the
 * province level. Callers must treat it that way and must never fall through to
 * the raw name.
 */
export function resolveArchiveMunicipality(
  province: string | null | undefined,
  rawMunicipality: string | null | undefined,
): ArchiveMunicipality | null {
  const resolved = resolveTownName({ province, storedMunicipality: rawMunicipality });
  if (resolved.status !== 'resolved') return null;

  const slug = slugify(resolved.municipality);
  // A register name that slugifies to nothing would be a gazetteer defect, not a
  // corpus one; refuse rather than mint an empty segment.
  if (!slug) return null;

  return { name: resolved.municipality, ine: resolved.ine, slug: safeMunicipioSegment(slug) };
}

/**
 * Fold a list of raw corpus municipality names, with counts, into the canonical
 * town list for one province.
 *
 * This is the shape every archive enumerator actually needs, and centralising it
 * settles the sum-vs-max disagreement noted above: totals are **summed** onto
 * the canonical town. Summing is the only correct operator once names are
 * canonicalised — `Madrid`, `Msdrid` and `Madrdi`… are not competing labels for
 * a slug, they are the SAME town, and a town hub that lists 7,353 auctions must
 * paginate for 7,353, not for the largest single spelling.
 *
 * Unresolved names are returned separately rather than dropped: they are the
 * coverage cost, they are what MUNI-B recovers, and a caller that cannot see
 * them cannot report them.
 */
export function foldArchiveMunicipalities(
  province: string | null | undefined,
  rows: Array<{ name: string | null | undefined; total: number }>,
): {
  resolved: Array<ArchiveMunicipality & { total: number; dbNames: string[] }>;
  unresolvedTotal: number;
  unresolvedNames: string[];
} {
  const byIne = new Map<string, ArchiveMunicipality & { total: number; dbNames: string[] }>();
  const unresolvedNames = new Set<string>();
  let unresolvedTotal = 0;

  for (const row of rows) {
    const total = Number.isFinite(row.total) ? row.total : 0;
    const hit = resolveArchiveMunicipality(province, row.name);
    if (!hit) {
      const raw = (row.name ?? '').trim();
      if (raw) unresolvedNames.add(raw);
      unresolvedTotal += total;
      continue;
    }
    // `dbNames` carries every RAW corpus spelling that folded onto this town.
    // The display name is the INE official denomination, which need not equal
    // any stored `Auction.municipality` value — so a caller that has to build a
    // `where` clause must query `municipality: { in: dbNames }`, never the
    // official name. Without this the gazetteer gate would fix the URL set and
    // break the queries behind it.
    const raw = (row.name ?? '').trim();
    const existing = byIne.get(hit.ine);
    if (existing) {
      existing.total += total;
      if (raw && !existing.dbNames.includes(raw)) existing.dbNames.push(raw);
    } else {
      byIne.set(hit.ine, { ...hit, total, dbNames: raw ? [raw] : [] });
    }
  }

  const resolved = [...byIne.values()]
    // Zero-row towns are not archive nodes: the partition planner refuses to
    // emit zero-row partitions, so emitting one here would mint a 404.
    .filter((m) => m.total > 0)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'es'));

  return { resolved, unresolvedTotal, unresolvedNames: [...unresolvedNames] };
}

// ---------------------------------------------------------------------------
// ⛔ THE DARK GATE (Ken's MUNI-A2 ruling, 2026-08-13 — after a prod rollback)
// ---------------------------------------------------------------------------
/**
 * Is the gazetteer whitelist ALLOWED to change what the legacy surface serves?
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * MUNI-A applied the whitelist UNCONDITIONALLY. Ken deployed it dark and rolled
 * production back inside a minute, because with `URL_V4_SWITCH` unset the legacy
 * surface had visibly moved:
 *
 *   /resultados/madrid/msdrid              200 -> 307 (junk town, now unresolvable)
 *   /resultados/madrid/carabanchel-alto    200 -> 307 (district, now unresolvable)
 *   /resultados/madrid/municipios/pagina/2 200 -> 404
 *
 * ⭐ THE THIRD ONE IS THE INSTRUCTIVE ONE, because nobody wrote a paging change.
 * The `/municipios` de-pagination was ALREADY switch-gated correctly. The 404
 * came from arithmetic: `ceil(total / MUNI_INDEX_PAGE_SIZE)`, and the whitelist
 * moved Madrid's `total` from 302 to 149, so 2 pages became 1 and page 2 fell
 * out of range. A gate on the redirects alone would not have caught it.
 *
 * That is the general lesson and the reason the gate lives HERE, at the one
 * resolution point, rather than on the redirects: **the whitelist is not a
 * redirect feature, it is a change to the SET OF TOWNS THAT EXIST**, and every
 * count, list, link cluster, page total and sitemap entry is downstream of that
 * set. Gate the set and all of them follow; gate the redirects and only the
 * symptom Ken happened to measure goes away.
 *
 * ⚠️ Read at CALL time, never at module load — see `url-v4-switch.ts`. A
 * module-load constant bakes into the build and turns the flip into a redeploy.
 *
 * ⚠️ Any `unstable_cache` wrapping a function that consults this MUST carry the
 * switch state in its KEY, or the flip serves entries computed in the other
 * state. Every call site in this repo does; grep `archiveWhitelistCacheKey`
 * before adding another.
 *
 * 🗑️ DELETE AT THE FLIP. Once `URL_V4_SWITCH=1` is permanent, this function and
 * every `foldLegacyMunicipalities` branch behind it are dead code. They exist to
 * make the dark state byte-identical to the pre-MUNI-A release, nothing more.
 */
export function archiveWhitelistActive(): boolean {
  return isUrlV4SwitchOn();
}

/** Cache-key fragment so a memoized enumeration cannot survive the flip. */
export function archiveWhitelistCacheKey(): string {
  return archiveWhitelistActive() ? 'ine' : 'legacy';
}

/**
 * The PRE-MUNI-A fold, preserved verbatim in behaviour, for the dark state.
 *
 * ⭐ This is a faithful reproduction, not a tidied one, and the two ugly parts
 * are the point:
 *
 *   • BARE `slugify`, not `safeMunicipioSegment`. The legacy surface never
 *     escaped reserved segments, and escaping them now would move live URLs.
 *   • **MAX, not SUM.** When two spellings fold onto one slug the legacy code
 *     kept the highest-count entry and DISCARDED the others' rows. That is a
 *     real bug — one of the two defects MUNI-A fixed — and reproducing it here
 *     is deliberate. A dark build must serve today's numbers, including today's
 *     wrong ones; the flip is what releases the fix. Summing here would shift
 *     page counts and totals on the live site with the flag off, which is the
 *     exact class of change that caused the rollback.
 *
 * Returns the same shape as `foldArchiveMunicipalities`'s `resolved` so callers
 * branch once and stay otherwise identical. `dbNames` is the single winning
 * spelling, which makes the caller's `municipality: { in: [name] }` select the
 * same rows the legacy `municipality: name` did.
 */
export function foldLegacyMunicipalities(
  rows: Array<{ name: string | null | undefined; total: number }>,
): Array<{ name: string; slug: string; total: number; dbNames: string[] }> {
  const best = new Map<string, { name: string; slug: string; total: number; dbNames: string[] }>();
  for (const row of rows) {
    const name = (row.name ?? '').trim();
    if (!name) continue;
    const lc = name.toLowerCase();
    // The legacy junk filter, exactly as it was: three literal sentinels and
    // nothing else. No gazetteer, so `Msdrid` and `Carabanchel Alto` survive —
    // which is precisely what keeps their URLs answering 200 while dark.
    if (lc === 'null' || lc === 'undefined' || lc === 'desconocida') continue;
    const slug = slugify(name);
    if (!slug) continue;
    const total = Number.isFinite(row.total) ? row.total : 0;
    const prev = best.get(slug);
    if (!prev || total > prev.total) best.set(slug, { name, slug, total, dbNames: [name] });
  }
  return [...best.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'es'));
}

/**
 * Switch-aware enumeration — the ONE call the legacy surface should make.
 *
 * Lit: the INE register decides, spellings SUM onto one town, segments are
 * reserved-word-escaped. Dark: the pre-MUNI-A fold above, byte for byte.
 */
export function foldMunicipalitiesForLegacySurface(
  province: string | null | undefined,
  rows: Array<{ name: string | null | undefined; total: number }>,
): Array<{ name: string; slug: string; total: number; dbNames: string[] }> {
  if (!archiveWhitelistActive()) return foldLegacyMunicipalities(rows);
  return foldArchiveMunicipalities(province, rows).resolved.map((m) => ({
    name: m.name,
    slug: m.slug,
    total: m.total,
    dbNames: m.dbNames,
  }));
}
