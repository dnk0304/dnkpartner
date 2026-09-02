/**
 * Per-auction OG image (`/subastas/subasta/[slug]/opengraph-image`).
 *
 * The highest-value preview: the auction's real photo on the left, headline +
 * key facts + price on the right, brand lockup throughout. Photo loading is
 * timed + falls back to a branded no-photo panel (see loadAuctionPhoto).
 *
 * Data is read with a MINIMAL dedicated query (not loadAuctionMeta — that omits
 * imageUrl). Node runtime for Prisma + the self-fetch of the photo; revalidated
 * hourly. On any miss we still emit a branded card rather than erroring, so a
 * shared link never previews blank.
 */
import { ImageResponse } from 'next/og';
import { ogFonts } from '@/lib/og/fonts';
import { OG_SIZE, OG_CONTENT_TYPE, OG_ALT, formatEur } from '@/lib/og/brand';
import { AuctionOgTemplate } from '@/lib/og/templates';
import { resolveAuctionIdFromSlug } from '@/lib/seo/auction-slug';
import { auctionDisplayTitle } from '@/lib/seo/display-title';
import { loadAuctionPhoto } from '@/lib/og/photo';
import { capitalizeLocation } from '@/lib/utils';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const revalidate = 3600;
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

type Props = { params: Promise<{ slug: string }> };

async function loadForOg(id: string) {
  return prisma.auction.findUnique({
    where: { id },
    select: {
      title: true,
      category: true,
      province: true,
      municipality: true,
      auctionType: true,
      address: true,
      lotDescription: true,
      propertyType: true,
      appraisalValue: true,
      valorSubasta: true,
      imageUrl: true,
    },
  });
}

export default async function Image({ params }: Props) {
  const { slug } = await params;
  const id = resolveAuctionIdFromSlug(slug);
  const a = id ? await loadForOg(id) : null;

  const title = a
    ? auctionDisplayTitle({
        address: a.address,
        lotDescription: a.lotDescription,
        propertyType: a.propertyType,
        auctionType: a.auctionType,
        category: a.category,
        municipality: a.municipality,
        province: a.province,
        title: a.title,
      })
    : 'Subasta judicial';

  // Type-guard filter (not `.filter(Boolean)`): only a predicate signature
  // narrows `(string | null | undefined)[]` to `string[]`, which is what
  // `capitalizeLocation(name: string)` requires under strict tsc.
  const where =
    [a?.municipality, a?.province]
      .filter((s): s is string => Boolean(s))
      .map(capitalizeLocation)
      .join(', ') || 'España';

  // Appraisal first, valorSubasta fallback — same precedence as the page meta.
  const appraisal = formatEur(a?.appraisalValue ?? null);
  const price = appraisal ?? formatEur(a?.valorSubasta ?? null);
  const priceLabel = appraisal ? 'Valor de tasación' : 'Valor de subasta';

  const photoSrc = await loadAuctionPhoto(a?.imageUrl);

  return new ImageResponse(
    (
      <AuctionOgTemplate
        title={title}
        where={where}
        category={a?.category ?? null}
        auctionType={a?.auctionType ?? null}
        price={price}
        priceLabel={priceLabel}
        photoSrc={photoSrc}
      />
    ),
    { ...size, fonts: await ogFonts() },
  );
}
