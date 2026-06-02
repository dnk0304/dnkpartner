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
 */

import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { buildAuctionSlug, resolveAuctionIdFromSlug } from '@/lib/seo/auction-slug';
import { isLegacyRow } from '@/lib/seo/legacy-rows';
import AuctionDetailClient from '@/app/auction/[id]/AuctionDetailClient';

type PageProps = { params: Promise<{ slug: string }> };
const SITE = 'https://subastasactivas.com';

async function loadAuction(slug: string) {
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

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const a = await loadAuction(slug);
  if (!a) return { title: 'Subasta no encontrada', robots: 'noindex' };
  // Legacy "junk auction" row → middleware normally serves 410 for the cuid
  // shape; this catches the residual boeId-0x edge case (UUID id but legacy
  // boeId). noindex metadata + the page itself returns notFound() (404).
  // See: src/lib/seo/legacy-rows.ts
  if (isLegacyRow(a)) return { title: 'Subasta retirada', robots: 'noindex,follow' };
  const canonicalSlug = buildAuctionSlug(a);
  const where = [a.municipality, a.province].filter(Boolean).join(', ') || 'España';
  const title = `${a.title || a.category} en ${where} · subasta pública | dnksubastas`;
  const description = `Subasta pública de ${a.category} en ${where}. Estado en vivo, datos del BOE y enlace oficial. Sigue la subasta y recibe alertas en dnksubastas.`.slice(0, 158);
  // Only index ACTIVE / PRE-AUCTION states (07 §1.7 — CONCLUIDA stays noindex).
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
  const a = await loadAuction(slug);
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
  return (
    <Suspense fallback={<div className="min-h-screen bg-[--color-page]" />}>
      <AuctionDetailClient id={a.id} />
    </Suspense>
  );
}
