/**
 * /subastas/{province}/{town}/{detalle} — the URL-v3 auction detail route.
 *
 * This is the route that serves the 192,589 permanent URLs minted into
 * `auction_url_v3`. Before this dispatch the table existed and **every one of
 * those URLs 404'd**, because nothing read it.
 *
 * Shape (defined by `buildAuctionPathV3`, and only there):
 *
 *     /subastas/{provinceSlug}/{townSlug}/{tipo}-{descriptor}-{ref}
 *          ^1         ^2            ^3                ^4
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⭐ LOOKUP: match the WHOLE minted string, never parse it.
 *
 * The request path is reassembled and matched against `auction_url_v3.url` on
 * its UNIQUE index — one probe, no parsing. Decomposing `{tipo}-{descriptor}-
 * {ref}` back into parts here would be a SECOND definition of the URL grammar,
 * living apart from the writer that produced it, and the two would drift the
 * first time the descriptor pipeline changed. There is one grammar and the
 * minter owns it; this route only recognises what the minter wrote down.
 *
 * ⭐ WHY THIS ROUTE CANNOT SWALLOW ANYTHING
 *
 * Adding `[detalle]` means a 4-segment `/subastas/a/b/c` path now MATCHES a
 * route where it previously fell through to a 404. Two things keep that safe:
 *   - a path with no row in `auction_url_v3` calls `notFound()` — same 404 the
 *     visitor got before, so no previously-404ing URL changes behaviour;
 *   - `pagina` is a LITERAL sibling directory, and Next resolves literals in
 *     preference to dynamic segments, so `/subastas/madrid/madrid/pagina/2`
 *     still hits the paginated town hub. That is exactly the invariant
 *     `src/lib/seo/reserved-segments.ts` encodes and `npm run build` proves
 *     (RESERVED_UNDER_TOWN), enumerated from the real route tree rather than
 *     from memory.
 *
 * ⭐ IT SERVES WHILE THE SWITCH IS OFF — DELIBERATELY
 *
 * Ken: *"new routes may exist and serve, but nothing advertises them and no
 * redirect fires until the switch dispatch flips it."* So with the switch off
 * this route returns 200, while:
 *   - nothing links to it,
 *   - the sitemap does not contain it,
 *   - and its own canonical points at the LEGACY url (below) — so a crawler
 *     that guessed the path is told which url is the real one.
 * That combination is what makes the dark code verifiable in a browser without
 * changing anything a user or Googlebot sees.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { notFound, permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { fetchAuctionIdByV3Url, resolveAuctionPath, resolveV3Alias } from '@/lib/seo/auction-url';
import { isUrlV3SwitchOn } from '@/lib/seo/url-v3-switch';
import { resolveProvinceSlugToCanonicalSlug } from '@/lib/province-slug';
import { isReachableV3Path } from '@/lib/seo/reserved-segments';
import {
  loadAuctionMeta,
  buildDetailMetadata,
  renderAuctionDetail,
  detailBlockReason,
} from '@/lib/auction-detail-view';

type PageProps = {
  params: Promise<{ slug: string; municipio: string; detalle: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

/** Reassemble the request path exactly as the minter wrote it. */
function v3PathOf(p: { slug: string; municipio: string; detalle: string }): string {
  return `/subastas/${p.slug}/${p.municipio}/${p.detalle}`;
}

/**
 * The canonical v3 path for a request whose PROVINCE segment was spelled with a
 * co-official / Castilian alias, or null when the request is already canonical
 * (or the alias does not resolve to anything).
 *
 * Why this exists: every minted url uses the CANONICAL province slug, so
 * `/subastas/gerona/...` matches no row even though `/subastas/girona/...`
 * does. The province hubs have folded aliases with a live 301 since long before
 * this dispatch (`PROVINCE_ALIAS_TO_CANONICAL`, consumed in `middleware.ts`),
 * and detail urls silently not doing the same would be an inconsistency a
 * visitor would meet as a 404.
 *
 * ⚠️ Deliberately NOT applied while the switch is off. It is a redirect, and
 * Ken's ruling is that **no redirect fires** until the switch dispatch flips.
 * While off, an alias v3 path 404s — which is exactly what it does today,
 * before this route existed. No behaviour changes on a dark deploy.
 */
function canonicalAliasPath(p: { slug: string; municipio: string; detalle: string }): string | null {
  if (!isUrlV3SwitchOn()) return null;
  const canonicalProvince = resolveProvinceSlugToCanonicalSlug(p.slug);
  if (!canonicalProvince || canonicalProvince === p.slug) return null;
  return v3PathOf({ ...p, slug: canonicalProvince });
}

/**
 * Resolve a request to an auction row, or null.
 *
 * `isReachableV3Path` is applied first as a cheap structural reject: a path
 * whose segments collide with a literal route could never have been minted, so
 * there is no reason to spend a query on it.
 */
async function loadByV3Path(p: { slug: string; municipio: string; detalle: string }) {
  const path = v3PathOf(p);
  if (!isReachableV3Path(path)) return null;
  const id = await fetchAuctionIdByV3Url(path);
  if (!id) return null;
  return loadAuctionMeta(id);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const p = await params;
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations('auctionDetail');

  const a = await loadByV3Path(p);
  const blocked = detailBlockReason(a);
  // A path with no minted row is a 404 below; noindex so a crawler that
  // remembers it drops it. Same treatment the legacy route gives a bad slug.
  if (blocked === 'missing') return { title: t('metaNotFound'), robots: 'noindex' };
  if (blocked === 'out-of-scope') return { title: t('metaNotFound'), robots: 'noindex,follow' };
  if (blocked === 'retired') return { title: t('metaRetired'), robots: 'noindex,follow' };

  // ⭐ The canonical comes from the SAME resolver the legacy route uses, so the
  // switch decides it once for the whole app:
  //   switch OFF → the LEGACY url is canonical, even though we are serving the
  //                v3 url. That is correct while off: the legacy url is the one
  //                that is linked, sitemapped and indexed, and this page is not
  //                supposed to compete with it yet.
  //   switch ON  → the v3 url, i.e. self-canonical, matching the url the
  //                visitor actually reached — and matching the 308 the legacy
  //                route now sends here.
  const path = resolveAuctionPath(a!, v3PathOf(p));
  return buildDetailMetadata({ a: a!, locale, path, t });
}

export default async function SubastaDetailV3Page({ params, searchParams }: PageProps) {
  const p = await params;
  const sp = searchParams ? await searchParams : undefined;
  const followFlag = typeof sp?.follow === 'string' ? sp.follow : undefined;

  const a = await loadByV3Path(p);

  // Alias province spelling (`gerona` → `girona`): fold to the canonical path
  // and send a permanent redirect, matching how the province hubs have always
  // treated aliases. Only when the switch is on — see `canonicalAliasPath`.
  if (!a) {
    const aliasTarget = canonicalAliasPath(p);
    if (aliasTarget && (await fetchAuctionIdByV3Url(aliasTarget))) {
      permanentRedirect(aliasTarget);
    }
    // Re-mint 301 alias: this exact path was an OLD minted url (e.g. an
    // abbreviated `cl-…` street type that was re-minted to `calle-…`). Redirect
    // permanently to the auction's CURRENT url. Miss-path only — one indexed
    // join. Locale-aware: middleware stripped any `/en` prefix before this
    // route saw the path, so re-prepend it on the target to keep the visitor in
    // the same locale (the alias table is locale-agnostic).
    const currentUrl = await resolveV3Alias(v3PathOf(p));
    if (currentUrl) {
      const locale = (await getLocale()) as Locale;
      permanentRedirect(locale === 'en' ? `/en${currentUrl}` : currentUrl);
    }
  }

  // Unmatched path, out-of-scope shell row, or retired row → 404. Applying the
  // SAME gate as the legacy route matters: a row we de-indexed on purpose must
  // not come back to life just because it also has a minted url.
  if (detailBlockReason(a) !== null) notFound();

  // Same resolved path the metadata used — one variable behind the canonical,
  // the OpenGraph url and every JSON-LD @id on this render.
  const path = resolveAuctionPath(a!, v3PathOf(p));
  const body = await renderAuctionDetail({ a: a!, path, followFlag });
  if (!body) notFound();
  return body;
}
