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
 * GATE REVERSAL (Dennis 2026-06-07, wave-A):
 *   The detail page is now FULLY PUBLIC. Every viewer — logged-out,
 *   trial-expired, paid — sees the full info: real H1 + street address,
 *   exact map pin, financials, documents, edicto, BOE/SEGSOCIAL source
 *   links. NO noindex, NO login redirect, NO teaser-vs-full split.
 *
 *   The only gate boundary left is the alert action (POST /api/alerts)
 *   which requires a logged-in (free) account. See
 *   `src/app/api/alerts/route.ts` for the single ALERT_GATE flip point.
 *
 * Dead-code flag (do not delete yet — flagged for the cleanup wave):
 *   - <FullInfoWall> (components/access/FullInfoWall.tsx) is no longer
 *     rendered by this page.
 *   - <AuctionTeaser> (components/auction/AuctionTeaser.tsx) is no longer
 *     rendered by this page either, since AuctionDetailClient renders the
 *     full hero/title/where. AuctionTeaser is still used in list contexts
 *     (snippet builder shared with /api/auctions list cards) — verify
 *     before removing.
 *   - hasFullAccessServer / getAccessState are still consumed by the
 *     account/alerts/favourites surfaces. Keep them.
 */

import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { buildAuctionSlug, resolveAuctionIdFromSlug } from '@/lib/seo/auction-slug';
import { isLegacyRow } from '@/lib/seo/legacy-rows';
import AuctionDetailClient from '@/app/auction/[id]/AuctionDetailClient';
import { auctionMetaTitle, auctionDisplayTitle } from '@/lib/seo/display-title';
import { buildAuctionJsonLd } from '@/lib/seo/json-ld';

type PageProps = { params: Promise<{ slug: string }> };
const SITE = 'https://subastasactivas.com';

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
      // Surfaced for the title-from-address helper (wave-A, 2026-06-07).
      // The page is now fully public so the address can lead the <title>.
      address: true,
      propertyType: true,
      // Price hint for SERP CTR — appraisal first (always populated when
      // present), valorSubasta as a secondary if the row lacks an appraisal.
      appraisalValue: true,
      valorSubasta: true,
      boeId: true,
    },
  });
  return auction;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const a = await loadAuctionMeta(slug);
  if (!a) return { title: 'Subasta no encontrada', robots: 'noindex' };
  // Legacy "junk auction" row → middleware normally serves 410 for the cuid
  // shape; this catches the residual boeId-0x edge case (UUID id but legacy
  // boeId). noindex metadata + the page itself returns notFound() (404).
  // See: src/lib/seo/legacy-rows.ts
  if (isLegacyRow(a)) return { title: 'Subasta retirada', robots: 'noindex,follow' };
  const canonicalSlug = buildAuctionSlug(a);
  // Title-from-address (wave-A, 2026-06-07): the <title> now leads with the
  // real street address (or municipality fallback for vehicles/land) — the
  // page is fully public so this is safe, and it dramatically improves SERP
  // CTR vs the previous reference-code title.
  const title = auctionMetaTitle({
    address: a.address,
    propertyType: a.propertyType,
    auctionType: a.auctionType,
    category: a.category,
    municipality: a.municipality,
    province: a.province,
    title: a.title,
  });
  const where = [a.municipality, a.province].filter(Boolean).join(', ') || 'España';
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
    ? `Subasta pública de ${a.category} en ${where}. Tasación ${priceForDescription}. Estado en vivo, datos del BOE y enlace oficial. Sigue la subasta y recibe alertas en SubastasActivas.`
    : `Subasta pública de ${a.category} en ${where}. Estado en vivo, datos del BOE y enlace oficial. Sigue la subasta y recibe alertas en SubastasActivas.`
  ).slice(0, 158);
  // Only index ACTIVE / PRE-AUCTION states (07 §1.7 — CONCLUIDA stays noindex).
  // The gate reversal does NOT change this — the detail page was already
  // 200+indexable for active states; now it's just richer content.
  const activeStates = ['ACTIVE', 'CELEBRANDOSE', 'PRE_AUCTION', 'PROXIMA_APERTURA', 'SUSPENDIDA', 'SUSPENDED'];
  const indexable = activeStates.includes(a.status as string);

  // Wave-B (2026-06-07): Open Graph + Twitter card. Auto-generated from the
  // same address+tipo+price+where strings the description uses. Neither
  // competitor portal emits these — easy SERP leapfrog.
  const ogTitle = auctionDisplayTitle({
    address: a.address,
    propertyType: a.propertyType,
    auctionType: a.auctionType,
    category: a.category,
    municipality: a.municipality,
    province: a.province,
    title: a.title,
  });
  const canonicalUrl = `${SITE}/subastas/subasta/${canonicalSlug}`;
  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    robots: indexable ? 'index,follow' : 'noindex,follow',
    openGraph: {
      title: ogTitle,
      description,
      url: canonicalUrl,
      siteName: 'SubastasActivas',
      locale: 'es_ES',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description,
    },
  };
}

export default async function SubastaDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const a = await loadAuctionMeta(slug);
  if (!a) notFound();
  // Legacy junk row → retire (Ken brief 2026-06-02). Middleware already
  // 410s the cuid-id case before we get here; this handles the residual
  // boeId-0x edge case where the id is a UUID. notFound() = 404.
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
      publishedAt: true,
      propertyDescription: true,
      lotDescription: true,
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

  // GATE REVERSAL (wave-A, 2026-06-07): the detail page is fully public.
  // No teaser-vs-wall split. Every viewer gets the full client which fetches
  // /api/auctions/[id] (now returning the full payload to everyone) and
  // renders the H1 (address-led), exact map pin, financials, documents,
  // edicto, source links. The only gate boundary left in the app is the
  // alert POST — see /api/alerts/route.ts (ALERT_GATE constant).
  return (
    <div className="min-h-screen bg-[--color-page] pb-12">
      {jsonLd && (
        <script
          type="application/ld+json"
          // JSON.stringify is safe here — no user-supplied <, > in the
          // graph keys; the values come from our schema columns.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <main className="mx-auto max-w-editorial px-4 md:px-6 py-6 md:py-8">
        <AuctionDetailClient id={a.id} />
      </main>
    </div>
  );
}
