/**
 * /subastas/subasta/[slug] — the auction detail page (Spanish, nested).
 *
 * STANDING RULE (07 §1.7, Dennis directive #15, 2026-06-02): the detail page
 * is `/subastas/subasta/{slug}` — Spanish + nested under /subastas. The old
 * `/auction/{id}` route 301-redirects here (handled in src/middleware.ts).
 *
 * Slug composition: see src/lib/seo/auction-slug.ts
 *   {tipo}-{provincia}-{municipio}-{auctionId}
 * The trailing token is the auction's cuid — extracted to resolve the row.
 *
 * Self-canonical: every detail page declares rel=canonical to its own
 * /subastas/subasta/{slug}. CONCLUIDA / FINALIZADA → noindex (don't index
 * expired auctions).
 *
 * GATE BOUNDARY (Dennis 2026-07-31, wave-B2 FULL UNGATE):
 *   The detail page is FULLY PUBLIC. Every viewer — anonymous, trial, paid —
 *   gets the full <AuctionDetailClient>, SSR-seeded with the complete payload
 *   (address, pricing/valuation, description, legal/cadastral data, documents,
 *   timeline). The full information renders in the initial HTML stream so
 *   Googlebot and no-JS clients see everything without executing JS. The old
 *   logged-out teaser + <FullInfoWall> "Regístrate para ver la dirección" gate
 *   is GONE. The page stays 200 + indexable per the robots gate below.
 *
 *   The ONLY optionally-gated surface is the "go to the official auction /
 *   place a bid" ACTION link, behind the SHOW_OFFICIAL_AUCTION_LINK runtime
 *   flag (default OPEN, flippable without a rebuild — see lib/feature-flags.ts).
 *   It gates NO information.
 *
 *   The paid product is alerts/notifications — see /api/alerts/route.ts. That
 *   is the only paid-gated surface left in the app.
 */

import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { buildAlternates, ogLocale, SITE_ORIGIN } from '@/lib/seo/alternates';
import type { Locale } from '@/i18n/routing';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { buildAuctionSlug, resolveAuctionIdFromSlug } from '@/lib/seo/auction-slug';
import { isLegacyRow } from '@/lib/seo/legacy-rows';
import { isConcludedIndexable } from '@/lib/seo/concluded-indexable';
import AuctionDetailClient from '@/app/auction/[id]/AuctionDetailClient';
import { FollowConfirmBanner } from '@/components/auction/FollowConfirmBanner';
import { auctionMetaTitle, auctionDisplayTitle } from '@/lib/seo/display-title';
import { buildAuctionJsonLd } from '@/lib/seo/json-ld';
import { buildAuctionDetailPayload } from '@/lib/auction-detail-payload';
import { showOfficialAuctionLink } from '@/lib/feature-flags';

type PageProps = {
  params: Promise<{ slug: string }>;
  // `?follow=` flag set by the one-click follow confirm endpoint (optional;
  // only present when the user arrived from an email "Seguir esta subasta" link).
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

/**
 * Lighter loader for metadata only — slug → id → 5 fields used in metadata.
 */
async function loadAuctionMeta(slug: string) {
  const id = resolveAuctionIdFromSlug(slug);
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
      // The page is now fully public so the address can lead the <title>.
      address: true,
      // Bug 2 (2026-06-09): read-time fallback source for the title street.
      // When `address` is junk (mis-captured "Localización" blob), the clean
      // street lives in the lotDescription "Dirección" tab — the title helper
      // extracts ONLY that field, then keeps street + first number.
      lotDescription: true,
      propertyType: true,
      // Price hint for SERP CTR — appraisal first (always populated when
      // present), valorSubasta as a secondary if the row lacks an appraisal.
      appraisalValue: true,
      valorSubasta: true,
      boeId: true,
      // Sale-outcome fields (wave142) — drive the concluded-page index gate.
      // A concluded property/vehicle with a resolved outcome becomes indexable
      // (see isConcludedIndexable) so its sold-price comp can rank.
      saleResult: true,
      resultCheckedAt: true,
    },
  });
  return auction;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations('auctionDetail');
  const a = await loadAuctionMeta(slug);
  if (!a) return { title: t('metaNotFound'), robots: 'noindex' };
  // Out-of-scope / empty-shell row (wave155) → hidden from the catalog; the
  // page notFound()s below. noindex so a crawler that remembers the URL drops it.
  if (!a.inScope) return { title: t('metaNotFound'), robots: 'noindex,follow' };
  // Retire predicate (CORRECTED wave155): dead `0x` boeId AND terminal status.
  // The edge middleware 410 was removed; this page is now the single place the
  // retire decision is made (it has the row's boeId + status). Suspended /
  // live / real-SUB rows are NOT retired. noindex metadata + notFound() (404)
  // in the body de-index the genuine dead-link junk. See legacy-rows.ts.
  if (isLegacyRow(a)) return { title: t('metaRetired'), robots: 'noindex,follow' };
  const canonicalSlug = buildAuctionSlug(a);
  // Title-from-address (wave-A, 2026-06-07): the <title> now leads with the
  // real street address (or municipality fallback for vehicles/land) — the
  // page is fully public so this is safe, and it dramatically improves SERP
  // CTR vs the previous reference-code title.
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
  // Include the headline price in the meta description for CTR (Ken brief).
  // Appraisal first; fall back to valorSubasta when no appraisal.
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
  //      query uses (concludedIndexableWhere). Keeping them identical (shared
  //      module) means a sitemap URL is never noindex. Everything else
  //      (SIN_RESULTADO, excluded categories, un-checked, cancelled, legacy)
  //      stays noindex,follow.
  const activeStates = ['ACTIVE', 'CELEBRANDOSE', 'PRE_AUCTION', 'PROXIMA_APERTURA', 'SUSPENDIDA', 'SUSPENDED'];
  const indexable =
    activeStates.includes(a.status as string) || isConcludedIndexable(a);

  // Wave-B (2026-06-07): Open Graph + Twitter card. Auto-generated from the
  // same address+tipo+price+where strings the description uses. Neither
  // competitor portal emits these — easy SERP leapfrog.
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
  const path = `/subastas/subasta/${canonicalSlug}`;
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

export default async function SubastaDetailPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = searchParams ? await searchParams : undefined;
  const followFlag = typeof sp?.follow === 'string' ? sp.follow : undefined;
  const a = await loadAuctionMeta(slug);
  if (!a) notFound();
  // Out-of-scope / empty-shell row (wave155) → not part of the catalog. 404.
  if (!a.inScope) notFound();
  // Retire predicate (CORRECTED wave155): dead `0x` boeId AND terminal status
  // only. Suspended / live / upcoming / real-SUB rows render normally. The old
  // edge cuid-shape 410 (which killed 1,176 legit rows) is gone; this is the
  // single retire gate now. notFound() = 404 (de-indexes the genuine junk).
  if (isLegacyRow(a)) notFound();
  // If the slug arrived non-canonical (e.g. somebody linked a derived form),
  // 301 to the canonical composition. This is the dedup belt-and-braces.
  const canonical = buildAuctionSlug(a);
  if (canonical !== slug) {
    redirect(`/subastas/subasta/${canonical}`);
  }

  // Wave-B (2026-06-07): server-resolve a fuller row for JSON-LD. The same
  // row gives us coords/price/endsAt/postalCode without a second roundtrip
  // through the API. Kept to a `select` (NOT findUnique-with-include) so the
  // build never breaks on additive migrations.
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
      // Sale-outcome fields (wave142) — feed the concluded-page "Resultado
      // de la subasta" result block in the SSR teaser (Pixel 2026-07-18).
      // saleResult + resultCheckedAt drive the same isConcludedIndexable gate
      // the robots meta + sitemap use, so the block renders on EXACTLY the
      // rows we index. soldPrice is BigInt CENTS (÷100 → €); soldDate = the
      // recorded conclusion date. Aggregate financial fact only, NOT PII.
      saleResult: true,
      soldPrice: true,
      soldDate: true,
      resultCheckedAt: true,
      propertyDescription: true,
      lotDescription: true,
      source: true,
      // Wave-B2 (Pixel 2026-06-07): surface imageUrl so the SSR teaser can
      // paint the same 3-rung imagery ladder (photo → map → neutral
      // placeholder) the cards already use. Public information; no PII.
      imageUrl: true,
      // Wave E2 (2026-06-07) — vehicle fields surfaced for the SSR teaser
      // so the address-led title resolution upstream can use them too,
      // and so JSON-LD (future enhancement) can describe the vehicle.
      // Honest-NULL on non-VEHICLE rows.
      vehicleMake: true,
      vehicleModel: true,
      vehicleYear: true,
    },
  });
  const jsonLd = seo ? buildAuctionJsonLd(seo) : null;

  // Server-resolve initialFollowing for SSR-correct heart paint on the detail
  // page. The client also reads `isFollowing` from /api/auctions/[id], so
  // this is a small first-paint optimisation, not a correctness gate. When
  // there's no session or no Favorite row, stays false (current behaviour).
  // Best-effort; any failure (session lookup, DB blip) falls through to the
  // existing client-side path.
  // NOTE: passed to AuctionDetailClient via a new optional prop so existing
  // call sites (legacy /auction/[id]) keep working unchanged.

  // Wave-B2 ungate (Dennis 2026-07-31): the detail page is FULLY PUBLIC. Every
  // viewer — anonymous, trial, paid — gets the full <AuctionDetailClient/>,
  // SSR-seeded with the complete payload so the address / pricing / valuation /
  // description / legal data / documents / timeline land in the initial HTML
  // stream. Googlebot (and any no-JS client) sees the full information without
  // executing JavaScript; the previous teaser + FullInfoWall gate is gone. The
  // session is resolved ONLY to personalise `isFollowing` — it never withholds
  // information. The paid product is alerts (see /api/alerts/route.ts).
  let viewerUserId: string | undefined;
  try {
    const session = await auth();
    viewerUserId = session?.user?.id;
  } catch {
    viewerUserId = undefined;
  }

  // Build the full payload with the SAME shared builder the API route uses, so
  // the SSR HTML and the client's revalidation fetch can never disagree
  // (no half-gated state). The JSON round-trip produces the exact wire shape
  // the client already consumes from the API (Dates → ISO strings); the builder
  // has already coerced every BigInt, so JSON.stringify is safe.
  const payload = await buildAuctionDetailPayload(a.id, { viewerUserId });
  if (!payload) notFound();
  const initialData = JSON.parse(JSON.stringify(payload));

  return (
    <div className="min-h-screen bg-[var(--color-page)] pb-12">
      {jsonLd && (
        <script
          type="application/ld+json"
          // JSON.stringify is safe here — no user-supplied <, > in the
          // graph keys; the values come from our schema columns.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <main className="mx-auto max-w-editorial px-4 md:px-6 py-6 md:py-8">
        {followFlag && <FollowConfirmBanner flag={followFlag} auctionId={a.id} />}
        {/* Full public detail — SSR-seeded so the complete auction information
            renders in the initial HTML for EVERYONE. `showOfficialAuctionLink`
            is the ONE runtime-flippable gate, and it governs ONLY the
            official-auction / bid ACTION link (default OPEN) — never info. */}
        <AuctionDetailClient
          id={a.id}
          initialData={initialData}
          showOfficialAuctionLink={showOfficialAuctionLink()}
        />
      </main>
    </div>
  );
}
