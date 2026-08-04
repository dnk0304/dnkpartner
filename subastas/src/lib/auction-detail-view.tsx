/**
 * SHARED AUCTION DETAIL VIEW — the one body behind both detail routes.
 *
 * Two routes now reach the same auction:
 *
 *   legacy  /subastas/subasta/{tipo}-{prov}-{muni}-{uuid}
 *   v3      /subastas/{province}/{town}/{tipo}-{descriptor}-{ref}
 *
 * ⭐ They are not two pages. They are two shells over this module.
 *
 * Ken's ruling was *"canonical and URL must agree on the same render"*. If the
 * v3 route were a copy of the legacy page, the two would drift — and the FIRST
 * thing to drift in a copied Next page is always the metadata block, which is
 * precisely where the canonical lives. Then you have a page whose canonical
 * disagrees with the URL it was reached by, which Ken called *"worse than
 * either choice alone"*. A shared module makes that failure unavailable: there
 * is one metadata builder, one JSON-LD call, one render, and the canonical is
 * an ARGUMENT to it.
 *
 * The behaviour below — every gate, every select, every comment — is carried
 * over verbatim from `app/subastas/subasta/[slug]/page.tsx`. The ONLY change is
 * that the canonical path arrives as a parameter instead of being re-derived.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * GATE BOUNDARY (Dennis 2026-07-31, wave-B2 FULL UNGATE):
 *   The detail page is FULLY PUBLIC. Every viewer — anonymous, trial, paid —
 *   gets the full <AuctionDetailClient>, SSR-seeded with the complete payload
 *   (address, pricing/valuation, description, legal/cadastral data, documents,
 *   timeline). The full information renders in the initial HTML stream so
 *   Googlebot and no-JS clients see everything without executing JS.
 *
 *   The "go to the official auction / place a bid" ACTION is an auth-gated
 *   "Participar" button (wave169): the official URL is resolved server-side by
 *   GET /api/participar/[id] and never rendered into this page. It gates NO
 *   information. The paid product is alerts — see /api/alerts/route.ts.
 * ────────────────────────────────────────────────────────────────────────────
 */

import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { buildAlternates, ogLocale, SITE_ORIGIN } from '@/lib/seo/alternates';
import type { Locale } from '@/i18n/routing';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { isLegacyRow } from '@/lib/seo/legacy-rows';
import { isConcludedIndexable } from '@/lib/seo/concluded-indexable';
import AuctionDetailClient from '@/app/auction/[id]/AuctionDetailClient';
import { FollowConfirmBanner } from '@/components/auction/FollowConfirmBanner';
import { auctionMetaTitle, auctionDisplayTitle } from '@/lib/seo/display-title';
import { buildAuctionJsonLd } from '@/lib/seo/json-ld';
import { buildAuctionDetailPayload } from '@/lib/auction-detail-payload';

/**
 * Lighter loader — id → the fields metadata and the gates need.
 * Both routes resolve an auction id first (the legacy one out of the slug, the
 * v3 one out of `auction_url_v3`), so this takes an id, not a slug.
 */
export async function loadAuctionMeta(id: string) {
  if (!id) return null;
  const auction = await prisma.auction.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      category: true,
      province: true,
      municipality: true,
      status: true,
      auctionType: true,
      // Scope soft-hide gate (wave155) — out-of-scope / empty-shell rows are
      // notFound()'d (never rendered, never indexed).
      inScope: true,
      // Surfaced for the title-from-address helper (wave-A, 2026-06-07).
      address: true,
      // Bug 2 (2026-06-09): read-time fallback source for the title street.
      // When `address` is junk (mis-captured "Localización" blob), the clean
      // street lives in the lotDescription "Dirección" tab.
      lotDescription: true,
      propertyType: true,
      // Price hint for SERP CTR — appraisal first, valorSubasta secondary.
      appraisalValue: true,
      valorSubasta: true,
      boeId: true,
      // Sale-outcome fields (wave142) — drive the concluded-page index gate.
      saleResult: true,
      resultCheckedAt: true,
      // Recency floor input for the concluded index gate (wave-seoslug).
      endsAt: true,
    },
  });
  return auction;
}

export type AuctionMeta = NonNullable<Awaited<ReturnType<typeof loadAuctionMeta>>>;

/**
 * Build the page metadata for an already-loaded row.
 *
 * ⭐ `path` is the RESOLVED canonical path — legacy or v3, decided once by
 * `resolveAuctionPath`. It is the same string the JSON-LD gets below, so the
 * canonical, the OpenGraph url and every JSON-LD `@id` on a given render are
 * literally the same variable. They cannot disagree.
 */
export function buildDetailMetadata(args: {
  a: AuctionMeta;
  locale: Locale;
  path: string;
  t: Awaited<ReturnType<typeof getTranslations>>;
}): Metadata {
  const { a, locale, path, t } = args;

  // Title-from-address (wave-A, 2026-06-07): the <title> leads with the real
  // street address (or municipality fallback for vehicles/land) — the page is
  // fully public so this is safe, and it dramatically improves SERP CTR.
  const title = auctionMetaTitle({
    address: a.address,
    lotDescription: a.lotDescription,
    propertyType: a.propertyType,
    auctionType: a.auctionType,
    category: a.category,
    municipality: a.municipality,
    province: a.province,
    title: a.title,
  });
  const where = [a.municipality, a.province].filter(Boolean).join(', ') || t('metaWhereFallback');

  // Headline price in the meta description for CTR (Ken brief). Appraisal
  // first; fall back to valorSubasta when there is no appraisal.
  const priceForDescription = (() => {
    const v = a.appraisalValue ?? a.valorSubasta;
    if (v == null) return null;
    const n = typeof v === 'bigint' ? Number(v) : Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    try {
      return new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
      }).format(n);
    } catch {
      return null;
    }
  })();
  const description = (priceForDescription
    ? t('metaDescriptionWithPrice', { category: a.category, where, price: priceForDescription })
    : t('metaDescription', { category: a.category, where })
  ).slice(0, 158);

  // Indexability gate. Two ways in:
  //   1. ACTIVE / PRE-AUCTION states (unchanged — always were indexable).
  //   2. CONCLUDED property/vehicle WITH a resolved sale outcome (wave142) —
  //      via isConcludedIndexable, the SAME predicate the sitemap membership
  //      query uses. Keeping them identical means a sitemap URL is never
  //      noindex. Everything else stays noindex,follow.
  const activeStates = ['ACTIVE', 'CELEBRANDOSE', 'PRE_AUCTION', 'PROXIMA_APERTURA', 'SUSPENDIDA', 'SUSPENDED'];
  const indexable = activeStates.includes(a.status as string) || isConcludedIndexable(a);

  // Wave-B (2026-06-07): Open Graph + Twitter card, from the same strings.
  const ogTitle = auctionDisplayTitle({
    address: a.address,
    lotDescription: a.lotDescription,
    propertyType: a.propertyType,
    auctionType: a.auctionType,
    category: a.category,
    municipality: a.municipality,
    province: a.province,
    title: a.title,
  });
  const canonicalUrl = locale === 'en' ? `${SITE_ORIGIN}/en${path}` : `${SITE_ORIGIN}${path}`;

  return {
    title,
    description,
    ...buildAlternates(path, locale),
    robots: indexable ? 'index,follow' : 'noindex,follow',
    openGraph: {
      title: ogTitle,
      description,
      url: canonicalUrl,
      siteName: 'SubastasActivas',
      locale: ogLocale(locale),
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description,
    },
  };
}

/**
 * The rendered detail body.
 *
 * `path` is the same resolved canonical path the metadata got, and it is what
 * the JSON-LD `@id` / `url` / breadcrumb are built from — so the tags in <head>
 * and the graph in <body> describe the SAME url on the SAME render.
 *
 * Returns null when the payload cannot be built, so the calling route can
 * `notFound()` (a shared module must not reach for `notFound()` itself — that
 * would hide a 404 decision inside a helper).
 */
export async function renderAuctionDetail(args: {
  a: AuctionMeta;
  path: string;
  followFlag?: string;
}) {
  const { a, path, followFlag } = args;

  // Server-resolve a fuller row for JSON-LD. The same row gives us
  // coords/price/endsAt/postalCode without a second roundtrip through the API.
  // Kept to a `select` (NOT findUnique-with-include) so the build never breaks
  // on additive migrations.
  const seo = await prisma.auction.findUnique({
    where: { id: a.id },
    select: {
      id: true,
      boeId: true,
      title: true,
      category: true,
      province: true,
      municipality: true,
      status: true,
      auctionType: true,
      propertyType: true,
      address: true,
      latitude: true,
      longitude: true,
      postalCode: true,
      appraisalValue: true,
      valorSubasta: true,
      endsAt: true,
      opensAt: true,
      publishedAt: true,
      // Sale-outcome fields (wave142) — feed the "Resultado de la subasta"
      // block in the SSR teaser. soldPrice is BigInt CENTS (÷100 → €).
      // Aggregate financial fact only, NOT PII.
      saleResult: true,
      soldPrice: true,
      soldDate: true,
      resultCheckedAt: true,
      propertyDescription: true,
      lotDescription: true,
      source: true,
      // Wave-B2 — imageUrl for the 3-rung imagery ladder in the SSR teaser.
      imageUrl: true,
      // Wave E2 — vehicle fields for the SSR teaser and JSON-LD.
      vehicleMake: true,
      vehicleModel: true,
      vehicleYear: true,
    },
  });

  // ⭐ The resolved path is PASSED IN, not re-derived inside the JSON-LD
  // builder. That is the whole mechanism behind "canonical and URL agree".
  const jsonLd = seo ? buildAuctionJsonLd(seo, `${SITE_ORIGIN}${path}`) : null;

  // Wave-B2 ungate (Dennis 2026-07-31): the page is FULLY PUBLIC. The session
  // is resolved ONLY to personalise `isFollowing` — it never withholds
  // information. Best-effort; any failure falls through to the client path.
  let viewerUserId: string | undefined;
  try {
    const session = await auth();
    viewerUserId = session?.user?.id;
  } catch {
    viewerUserId = undefined;
  }

  // Build the full payload with the SAME shared builder the API route uses, so
  // the SSR HTML and the client's revalidation fetch can never disagree. The
  // builder has already coerced every BigInt, so JSON.stringify is safe.
  const payload = await buildAuctionDetailPayload(a.id, { viewerUserId });
  if (!payload) return null;
  const initialData = JSON.parse(JSON.stringify(payload));

  return (
    <div className="min-h-screen bg-[var(--color-page)] pb-12">
      {jsonLd && (
        <script
          type="application/ld+json"
          // JSON.stringify is safe here — no user-supplied <, > in the graph
          // keys; the values come from our schema columns.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <main className="mx-auto max-w-editorial px-4 md:px-6 py-6 md:py-8">
        {followFlag && <FollowConfirmBanner flag={followFlag} auctionId={a.id} />}
        {/* Full public detail — SSR-seeded so the complete auction information
            renders in the initial HTML for EVERYONE. The official-auction / bid
            ACTION is the auth-gated Participar button (wave169); the official
            URL is resolved server-side and never enters this HTML. */}
        <AuctionDetailClient id={a.id} initialData={initialData} />
      </main>
    </div>
  );
}

/**
 * The shared "is this row servable at all?" gate.
 *
 * Returns the reason it is not, or null when it is. Both routes apply it
 * identically — a row that 404s on the legacy URL must 404 on the v3 URL too,
 * or the switch would quietly resurrect rows we de-indexed on purpose.
 */
export function detailBlockReason(a: AuctionMeta | null): 'missing' | 'out-of-scope' | 'retired' | null {
  if (!a) return 'missing';
  // Out-of-scope / empty-shell row (wave155) → not part of the catalog.
  if (!a.inScope) return 'out-of-scope';
  // Retire predicate (CORRECTED wave155): dead `0x` boeId AND terminal status
  // only. Suspended / live / upcoming / real-SUB rows render normally. The old
  // edge cuid-shape 410 (which killed 1,176 legit rows) is gone; this is the
  // single retire gate now. See legacy-rows.ts.
  if (isLegacyRow(a)) return 'retired';
  return null;
}
