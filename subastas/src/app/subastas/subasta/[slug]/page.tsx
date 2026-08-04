/**
 * /subastas/subasta/[slug] — the LEGACY auction detail route.
 *
 * STANDING RULE (07 §1.7, Dennis directive #15, 2026-06-02): the detail page
 * is `/subastas/subasta/{slug}` — Spanish + nested under /subastas. The old
 * `/auction/{id}` route 301-redirects here (handled in src/middleware.ts).
 *
 * Slug composition: see src/lib/seo/auction-slug.ts
 *   {tipo}-{provincia}-{municipio}-{auctionId}
 * The trailing token is the auction's uuid — extracted to resolve the row.
 *
 * The page body, metadata and gates live in `@/lib/auction-detail-view`, shared
 * with the v3 route so the two can never render differently. See that file.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⭐ THE PERMANENT-REDIRECT LAYER (URL-v3, this dispatch)
 *
 * This route is where old → new happens. Three things about it are deliberate:
 *
 * 1. **308, not 301 — and that is the ruling, not a shortcut.** Ken amended the
 *    brief: *"the requirement is a PERMANENT redirect; 301 or 308 both satisfy
 *    it … do not force a Node runtime per request purely to emit the literal
 *    number 301."* The only place that could emit a literal 301 cheaply is
 *    `middleware.ts`, which runs on the **edge runtime** — where the `pg` pool
 *    behind `@/lib/db` cannot open a socket. Redirecting from middleware would
 *    therefore cost either a forced Node runtime or an extra network hop, on
 *    every one of 192,589 URLs, to change a number Google treats identically.
 *    `permanentRedirect()` runs inside this page's EXISTING Node render, on a
 *    primary-key probe, and emits 308: permanent, method-preserving, equity-
 *    preserving.
 *
 * 2. **It fires before the non-canonical-slug redirect.** An old link with a
 *    derived/stale slug would otherwise go slug → canonical slug → v3: two
 *    hops, and every hop leaks link equity and adds latency. Resolving v3
 *    first makes it one hop from wherever the visitor started.
 *
 * 3. **No v3 row ⇒ no redirect, and the page serves 200 exactly as today.**
 *    That is the entire handling of the hex-legacy (12,346), held (1,713),
 *    degraded (13,964) and quarantined (20,279) sets — 48,303 rows that keep
 *    their old shape. Ken's invariant *"every old URL must resolve, never a
 *    404"* holds by construction: the redirect is conditional on finding a
 *    target, so failing to find one falls through to the behaviour that was
 *    already correct.
 *
 * With `URL_V3_SWITCH` unset (the shipped state) `fetchV3Url` returns null
 * without querying at all, so none of this executes and the route behaves
 * byte-identically to before this dispatch.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { notFound, redirect, permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { buildAuctionSlug, resolveAuctionIdFromSlug } from '@/lib/seo/auction-slug';
import { fetchV3Url, resolveAuctionPath } from '@/lib/seo/auction-url';
import {
  loadAuctionMeta,
  buildDetailMetadata,
  renderAuctionDetail,
  detailBlockReason,
} from '@/lib/auction-detail-view';

type PageProps = {
  params: Promise<{ slug: string }>;
  // `?follow=` flag set by the one-click follow confirm endpoint (optional;
  // only present when the user arrived from an email "Seguir esta subasta" link).
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations('auctionDetail');

  const id = resolveAuctionIdFromSlug(slug);
  const a = id ? await loadAuctionMeta(id) : null;

  const blocked = detailBlockReason(a);
  if (blocked === 'missing') return { title: t('metaNotFound'), robots: 'noindex' };
  // Out-of-scope / empty-shell row (wave155) → hidden from the catalog; the
  // page notFound()s below. noindex so a crawler that remembers the URL drops it.
  if (blocked === 'out-of-scope') return { title: t('metaNotFound'), robots: 'noindex,follow' };
  // Retire predicate (CORRECTED wave155). noindex metadata + notFound() in the
  // body de-index the genuine dead-link junk.
  if (blocked === 'retired') return { title: t('metaRetired'), robots: 'noindex,follow' };

  // ⭐ Resolve the canonical ONCE. Switch off (or no minted row) ⇒ this is the
  // legacy self-canonical, exactly as before. Switch on with a minted row ⇒ the
  // canonical points at the v3 url this request is about to be redirected to,
  // so even a crawler that ignores the 308 is told where the page really lives.
  const v3Url = await fetchV3Url(a!.id);
  const path = resolveAuctionPath(a!, v3Url);

  return buildDetailMetadata({ a: a!, locale, path, t });
}

export default async function SubastaDetailPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = searchParams ? await searchParams : undefined;
  const followFlag = typeof sp?.follow === 'string' ? sp.follow : undefined;

  const id = resolveAuctionIdFromSlug(slug);
  const a = id ? await loadAuctionMeta(id) : null;
  // notFound() = 404. Unchanged gates: unresolvable slug, out-of-scope shell
  // row, and the retire predicate (dead `0x` boeId AND terminal status).
  if (detailBlockReason(a) !== null) notFound();

  // ── the permanent-redirect layer ────────────────────────────────────────
  // Switch OFF ⇒ `fetchV3Url` returns null without touching the database, so
  // this is dead weight in the shipped build and nothing below it changes.
  const v3Url = await fetchV3Url(a!.id);
  if (v3Url) {
    // 308 Permanent Redirect. See the header note for why not 301.
    permanentRedirect(v3Url);
  }
  // ────────────────────────────────────────────────────────────────────────

  // If the slug arrived non-canonical (e.g. somebody linked a derived form),
  // redirect to the canonical composition. Belt-and-braces dedup — only
  // reachable for rows with NO v3 url, since a v3 row left above.
  const canonical = buildAuctionSlug(a!);
  if (canonical !== slug) {
    redirect(`/subastas/subasta/${canonical}`);
  }

  // No v3 url here by construction, so the path is the legacy self-canonical —
  // the same string `generateMetadata` resolved for this render.
  const path = resolveAuctionPath(a!, null);
  const body = await renderAuctionDetail({ a: a!, path, followFlag });
  if (!body) notFound();
  return body;
}
