import { allGazetteerEntries } from '@/lib/geo/municipality-gazetteer';
import { safeMunicipioSegment } from '@/lib/seo/archive-partitions';
import { PROVINCE_DB_KEY_TO_SLUG, slugify } from '@/lib/seo/slugs';

/**
 * WHERE A NOW-INVALID TOWN ARCHIVE URL GOES (Ken's MUNI-A task 2).
 *
 * The gazetteer whitelist removes ~7,100 town hubs from the v4 tree. Those URLs
 * are LIVE today and answer 200. Removing a hub without redirecting it converts
 * every one of them into a new 404 — which is the failure the v4 suite asserts
 * against ("lit: zero new 404s") and, more to the point, the thing that teaches
 * a young domain it cannot be trusted.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────
 *   1. The slug is a canonical town of that province  -> NO redirect.
 *   2. The slug is an ALTERNATE DENOMINATION of one   -> 301 to the canonical
 *      canonical town of that province                   town.
 *   3. Anything else (typos, districts, misfiles)     -> 301 to the PROVINCE
 *                                                        archive.
 *
 * Rule 3 is the floor that makes "no 301 may land on a 404" hold: the province
 * archive always exists, so there is no input for which this returns a target
 * that does not resolve.
 *
 * ⭐ RULE 1 IS AN IDENTITY, AND THAT IS DELIBERATE. Returning `null` (rather
 * than a redirect to itself) for an already-canonical slug is what makes the
 * maximum chain length STRUCTURALLY 1 instead of merely observed to be 1: a
 * redirect target is always canonical, and a canonical slug never redirects, so
 * no target can itself redirect. This mirrors `mapLegacyArchivePage`, which
 * maps an in-range page number to itself for exactly the same reason — a rule
 * that can match its own output is how redirect chains are born.
 *
 * ── WHY ONLY ALIASES GET RULE 2 ─────────────────────────────────────────────
 * Ken asked for "the canonical town where one is identifiable (`Msdrid` ->
 * `madrid`), otherwise the province". The register can identify an ALIAS —
 * `Elx` and `Elche` are two recorded names of one INE code, and the archive now
 * publishes only the official one, so the alternate slug has a known canonical
 * twin. It cannot identify a TYPO: nothing in the register says `Msdrid` was
 * meant to be Madrid, and inventing that mapping here would be the fuzzy
 * matching the whole ruling exists to forbid. Typos therefore take rule 3 and
 * land on the province archive, which is correct rather than merely safe — the
 * rows behind them are being served at province level too.
 *
 * When Ghost's MUNI-B pass repairs the corpus, those rows resolve normally and
 * gain their real town hub; no redirect written here has to be revisited,
 * because a province target never becomes wrong.
 */

type ProvinceRedirects = {
  /** Slugs that ARE canonical towns here — these must never redirect. */
  canonical: Set<string>;
  /** Alternate-denomination slug -> canonical town slug. */
  aliases: Map<string, string>;
};

let CACHE: Map<string, ProvinceRedirects> | null = null;

function townSlug(name: string): string {
  const s = slugify(name);
  return s ? safeMunicipioSegment(s) : '';
}

function build(): Map<string, ProvinceRedirects> {
  const byProvince = new Map<string, ProvinceRedirects>();

  for (const entry of allGazetteerEntries()) {
    const provSlug = PROVINCE_DB_KEY_TO_SLUG[entry.province] ?? slugify(entry.province);
    if (!provSlug) continue;
    let bucket = byProvince.get(provSlug);
    if (!bucket) {
      bucket = { canonical: new Set(), aliases: new Map() };
      byProvince.set(provSlug, bucket);
    }
    const official = townSlug(entry.official);
    if (!official) continue;
    bucket.canonical.add(official);
    for (const alias of entry.names) {
      const slug = townSlug(alias);
      if (!slug || slug === official) continue;
      // Two municipalities of one province claiming the same alias slug is not
      // resolvable — record nothing and let rule 3 send it to the province.
      // (Measured against the current register: this never fires. The check is
      // here so that a future register edit degrades safely instead of silently
      // picking whichever municipality was parsed last.)
      const existing = bucket.aliases.get(slug);
      if (existing && existing !== official) {
        bucket.aliases.set(slug, '');
        continue;
      }
      bucket.aliases.set(slug, official);
    }
  }

  // An alias slug that is ALSO some other municipality's canonical slug must
  // stay canonical — a live, correct hub outranks an alias claim on the name.
  for (const bucket of byProvince.values()) {
    for (const slug of [...bucket.aliases.keys()]) {
      if (bucket.canonical.has(slug)) bucket.aliases.delete(slug);
    }
  }

  return byProvince;
}

function index(): Map<string, ProvinceRedirects> {
  if (!CACHE) CACHE = build();
  return CACHE;
}

/**
 * The canonical town slug for a town segment that no longer resolves, or the
 * province itself.
 *
 * Returns `null` when `slug` is already canonical — meaning "do not redirect".
 * Returns `{ kind: 'town', slug }` for an identifiable alternate denomination,
 * or `{ kind: 'province' }` for everything else.
 *
 * Pure and synchronous: it consults only the INE register, never the corpus.
 */
export function archiveTownRedirect(
  provinceSlug: string,
  slug: string,
): { kind: 'town'; slug: string } | { kind: 'province' } | null {
  const bucket = index().get(provinceSlug);
  if (!bucket) return { kind: 'province' };
  if (bucket.canonical.has(slug)) return null;
  const alias = bucket.aliases.get(slug);
  if (alias) return { kind: 'town', slug: alias };
  return { kind: 'province' };
}

/** Test seam: drop the memoized map so a test can rebuild it. */
export function __resetArchiveTownRedirectCache(): void {
  CACHE = null;
}
