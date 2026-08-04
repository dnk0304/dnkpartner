import { guardDescriptor, type GuardSignal } from '@/lib/seo/descriptor-guard';
import { categoryKeyword } from '@/lib/seo/slug-v2';
import { slugify } from '@/lib/seo/slugs';

/**
 * URL-v3 DESCRIPTOR PIPELINE — the single definition of how a row's `address`
 * becomes the descriptor segment of a PERMANENT url.
 *
 * Order matters and is load-bearing:
 *   1. guardDescriptor  — strip plates / CSV tokens / URLs from the RAW text,
 *                         before slugification (after slugging, `E6037HTP` is
 *                         `e6037htp` and `https://` is `https-`, both far
 *                         harder to match). Runs on EVERY row and EVERY
 *                         category; the category rule is defence-in-depth only.
 *   2. slugify
 *   3. compactUnit      — fold verbose cadastral unit tokens ("es 1 pl 3 pt d"
 *                         -> "pl3-d") so the slug reads like an address.
 *   4. stripTrailingLocality — drop trailing town / province / postcode. All
 *                         three are ALREADY path segments; repeating them is
 *                         pure keyword duplication and it was inflating the
 *                         measured cap-hit count by ~3x (19,091 -> 6,653).
 *   5. capDescriptorV3  — truncate on a word boundary. Never touches the ref.
 */

/**
 * ⭐ DESCRIPTOR CAP: 100 (raised from 80 on 2026-08-04).
 *
 * Ken's decision rule was: *if truncation drops IDENTIFYING detail raise to
 * ~100; if it drops trailing noise keep 80.* Measured over the full corpus
 * (194,932 minted rows), truncation at 80 produced 6,653 cap hits of which
 * **3,148 (47.3%) dropped identifying detail** — a unit designator, a street
 * marker or a house number. So the rule resolves to RAISE.
 *
 * Why the loss happens: on rows whose `address` is Registro de la Propiedad
 * legalese ("urbana numero quince, piso duplex letra b …"), the ACTUAL STREET
 * sits at the END of the string, so a naive cap removes precisely the part that
 * distinguishes the door. One measured row literally reads
 * "…siendo la dirección exacta Rúa da Praia nº 29" and the cap cut the exact
 * address.
 *
 * Proven safe at 100 over the whole corpus — 0 duplicate urls, max url 190,
 * **0 rows over the 200-char ceiling** (110 peaks at 199; 120 breaches on 16
 * rows). 100 keeps ~10 chars of headroom.
 *
 * ⚠️ Honest limit: 100 HALVES the identifying loss (3,148 -> 1,718) but does not
 * eliminate it — 1,718 rows still truncate away identifying detail, and no cap
 * fixes that because the root cause is registry legalese in `address`, i.e. the
 * same upstream scraper field-mapping defect that put plates and verification
 * tokens there. Fix that at source and the cap stops mattering.
 */
export const MAX_DESCRIPTOR_LEN_V3 = 100;

/** Hard total-URL ceiling. Anti-pathological backstop, not a style rule. */
export const MAX_URL_LEN_V3 = 200;

/** Fold verbose cadastral unit tokens: "es 1 pl 3 pt d" -> "pl3-d". */
export function compactUnit(folded: string): string {
  return folded
    .replace(/\bes-\d+\b/g, '') // escalera — low search value
    .replace(/\bpl-(-?\d+)\b/g, 'pl$1') // pl 3 -> pl3
    .replace(/\bpt-([a-z0-9]+)\b/g, '$1') // pt d -> d
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Drop a trailing town / province / postcode from a descriptor — each is
 * already a path segment. Only a TRAILING match is stripped, so a street
 * genuinely named after its town ("calle valencia 12" in Valencia) keeps its
 * name. Looped because the tail is often town+province+postcode stacked.
 */
export function stripTrailingLocality(seg: string, ...localities: string[]): string {
  let out = seg;
  for (let pass = 0; pass < 4; pass += 1) {
    const before = out;
    for (const loc of localities) {
      if (!loc || loc === 'sin-municipio') continue;
      if (out === loc) return '';
      if (out.endsWith(`-${loc}`)) out = out.slice(0, -(loc.length + 1));
    }
    out = out.replace(/-\d{5}$/, '');
    if (out === before) break;
  }
  return out.replace(/-+$/, '');
}

/** Truncate on a hyphen (word) boundary. Never mid-word, never a dangling `-`. */
export function capDescriptorV3(seg: string, max: number = MAX_DESCRIPTOR_LEN_V3): string {
  if (seg.length <= max) return seg;
  const cut = seg.slice(0, max);
  const lastHyphen = cut.lastIndexOf('-');
  return (lastHyphen > 0 ? cut.slice(0, lastHyphen) : cut).replace(/-+$/, '');
}

export type DescriptorResult = {
  /** The capped descriptor, ready to place in the path. May be ''. */
  descriptor: string;
  /** The descriptor BEFORE capping — lets the caller log a cap hit as a signal. */
  full: string;
  /** True when the cap actually truncated something (spec §3: log, don't hide). */
  truncated: boolean;
  /** Every identifier stripped by the guard — logged for the upstream fix. */
  signals: GuardSignal[];
};

/**
 * Build the descriptor for one row. Pure and deterministic.
 * `townSlug` / `provinceSlug` are passed in (not derived) so this stays
 * independent of the town precedence ladder that produced them.
 */
export function buildDescriptorV3(args: {
  address: string | null | undefined;
  townSlug: string;
  provinceSlug: string;
  max?: number;
}): DescriptorResult {
  const guarded = guardDescriptor(args.address);
  const folded = compactUnit(slugify(guarded.text));
  const full = stripTrailingLocality(folded, args.townSlug, args.provinceSlug);
  const descriptor = capDescriptorV3(full, args.max ?? MAX_DESCRIPTOR_LEN_V3);
  return { descriptor, full, truncated: full.length > descriptor.length, signals: guarded.signals };
}

/**
 * Assemble the full v3 path.
 *
 * Shape: `/subastas/{province}/{town}/{tipo}-{descriptor}-{ref}` — the
 * `/subastas/` prefix and two-segment location are what the LIVE indexed town
 * hubs already use (`/subastas/barcelona/barcelona` -> 200), verified against
 * production. The ref tail is inviolable and is never truncated.
 */
export function buildAuctionPathV3(args: {
  provinceSlug: string;
  townSlug: string;
  category: string | null;
  descriptor: string;
  ref: string;
}): string {
  const kw = categoryKeyword(args.category);
  const body = args.descriptor || args.townSlug; // keep it findable if empty
  return `/subastas/${args.provinceSlug}/${args.townSlug}/${kw}-${body}-${args.ref}`;
}

/** The official BOE/portal ref tail, with lotes expanded. Never truncated. */
export function refTail(boeId: string): string {
  const m = boeId.match(/^(.*)-L(\d+)$/);
  return m ? `${m[1].toLowerCase()}-lote-${m[2]}` : boeId.toLowerCase();
}
