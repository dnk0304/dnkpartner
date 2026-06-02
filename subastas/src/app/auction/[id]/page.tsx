/**
 * /auction/[id] — LEGACY route. Now 301-redirects to /subastas/subasta/{slug}.
 *
 * Standing rule 07 §1.7 (Dennis directive #15, 2026-06-02): the detail page
 * lives at /subastas/subasta/{slug}. This route stays only to issue a
 * permanent 301 so old indexed URLs + inbound links don't 404.
 *
 * The middleware (src/middleware.ts) also handles this at the edge; this
 * file-route is the in-app fallback for cases where middleware doesn't
 * intercept (e.g. internal navigation).
 */

import { redirect, permanentRedirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { buildAuctionSlug } from '@/lib/seo/auction-slug';

type PageProps = { params: Promise<{ id: string }> };

export default async function LegacyAuctionRedirect({ params }: PageProps) {
  const { id } = await params;
  if (!id) notFound();
  const auction = await prisma.auction.findUnique({
    where: { id },
    select: { id: true, auctionType: true, province: true, municipality: true },
  });
  if (!auction) notFound();
  const slug = buildAuctionSlug(auction);
  permanentRedirect(`/subastas/subasta/${slug}`);
}
