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
 * FREEMIUM GATE (Dennis 2026-06-04, locked):
 *   The page ALWAYS returns 200 + the SSR-rendered <AuctionTeaser>
 *   (title, type, province/municipality, status, headline figure, snippet)
 *   so Google indexes the teaser regardless of session state. NO noindex,
 *   NO login redirect on this route.
 *
 *   Then:
 *     - trial-active OR paid-active → mount <AuctionDetailClient> below the
 *       teaser → fetches /api/auctions/[id] (full payload) → renders the
 *       full info (exact map, address, financials, documents, edicto,
 *       contact panel).
 *     - logged-out OR trial-expired → render <FullInfoWall> below the
 *       teaser. The Detail API also projects the sensitive fields OUT, so
 *       even a hand-crafted JSON request returns the teaser-equivalent.
 */

import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { buildAuctionSlug, resolveAuctionIdFromSlug } from '@/lib/seo/auction-slug';
import { isLegacyRow } from '@/lib/seo/legacy-rows';
import AuctionDetailClient from '@/app/auction/[id]/AuctionDetailClient';
import { AuctionTeaser, type AuctionTeaserData } from '@/components/auction/AuctionTeaser';
import { FullInfoWall } from '@/components/access/FullInfoWall';
import { hasFullAccessServer } from '@/lib/access';

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
      boeId: true,
    },
  });
  return auction;
}

/**
 * Full teaser-shape loader for the page render. Selects exactly the fields
 * the SSR <AuctionTeaser> needs — keeps the SSR payload small and lets
 * the gated detail fetch (`/api/auctions/[id]`) own the rest.
 */
async function loadTeaserData(slug: string): Promise<AuctionTeaserData | null> {
  const id = resolveAuctionIdFromSlug(slug);
  if (!id) return null;
  const auction = await prisma.auction.findUnique({
    where: { id },
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
      appraisalValue: true,
      valorSubasta: true,
      // propertyDescription / lotDescription / boeAnnouncement are
      // intentionally NOT selected — the public teaser snippet is built
      // from structured fields only (type, municipality, province, status)
      // by `pickTeaserSnippet`. Keeping the raw free-text columns OUT of
      // the SSR payload guarantees they cannot leak via `__next_f` JSON.
      // The gated detail fetch owns the full description.
      publishedAt: true,
      opensAt: true,
      endsAt: true,
    },
  });
  if (!auction) return null;
  return auction as AuctionTeaserData;
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
  const where = [a.municipality, a.province].filter(Boolean).join(', ') || 'España';
  const title = `${a.title || a.category} en ${where} · subasta pública | SubastasActivas`;
  const description = `Subasta pública de ${a.category} en ${where}. Estado en vivo, datos del BOE y enlace oficial. Sigue la subasta y recibe alertas en SubastasActivas.`.slice(0, 158);
  // Only index ACTIVE / PRE-AUCTION states (07 §1.7 — CONCLUIDA stays noindex).
  // The freemium gate does NOT change this — teaser is ALWAYS in the SSR
  // HTML, so the indexable states stay indexable regardless of gate state.
  const activeStates = ['ACTIVE', 'CELEBRANDOSE', 'PRE_AUCTION', 'PROXIMA_APERTURA', 'SUSPENDIDA', 'SUSPENDED'];
  const indexable = activeStates.includes(a.status as string);
  return {
    title: title.slice(0, 70),
    description,
    alternates: { canonical: `${SITE}/subastas/subasta/${canonicalSlug}` },
    robots: indexable ? 'index,follow' : 'noindex,follow',
  };
}

export default async function SubastaDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const a = await loadTeaserData(slug);
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

  // Freemium gate (Dennis 2026-06-04). The teaser is ALWAYS rendered in
  // the SSR HTML stream — Google sees it whether or not the request had a
  // session cookie. Then either the full client UI (with-access) or the
  // wall (without-access) renders below.
  const hasAccess = await hasFullAccessServer();

  return (
    <div className="min-h-screen bg-[--color-page] pb-12">
      <main className="mx-auto max-w-editorial px-4 md:px-6 py-6 md:py-8">
        {/* Public, SSR, indexable teaser — same markup for every viewer. */}
        <AuctionTeaser data={a} />

        {/* Gated full info OR conversion wall. Only one renders. */}
        {hasAccess ? (
          <div className="mt-8">
            <AuctionDetailClient id={a.id} hideHeader />
          </div>
        ) : (
          <FullInfoWall />
        )}
      </main>
    </div>
  );
}
