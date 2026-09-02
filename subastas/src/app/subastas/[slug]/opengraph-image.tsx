/**
 * OG image for the merged province + category hub (`/subastas/[slug]`).
 * Branded template — no per-item photo; shows the hub title + live active
 * count. Node runtime (Prisma count), revalidated hourly.
 */
import { ImageResponse } from 'next/og';
import { ogFonts } from '@/lib/og/fonts';
import { OG_SIZE, OG_CONTENT_TYPE, OG_ALT } from '@/lib/og/brand';
import { CategoryOgTemplate } from '@/lib/og/templates';
import { resolveSubastasSlug, CATEGORY_LABEL_PLURAL } from '@/lib/seo/slugs';
import { countActiveAuctions } from '@/lib/seo/page-data';

export const runtime = 'nodejs';
export const revalidate = 3600;
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

type Props = { params: Promise<{ slug: string }> };

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function Image({ params }: Props) {
  const { slug } = await params;
  const r = resolveSubastasSlug(slug);

  let eyebrow = 'Subastas en España';
  let title = 'Subastas judiciales y notariales';
  let count: number | null = null;

  try {
    if (r.kind === 'category') {
      eyebrow = 'Subastas por categoría';
      title = `Subastas de ${CATEGORY_LABEL_PLURAL[r.slug]}`;
      count = await countActiveAuctions({ category: r.dbLabel });
    } else if (r.kind === 'province') {
      eyebrow = 'Subastas por provincia';
      title = `Subastas en ${r.label}`;
      count = await countActiveAuctions({ province: r.dbKey });
    }
  } catch {
    count = null;
  }

  return new ImageResponse(<CategoryOgTemplate eyebrow={cap(eyebrow)} title={title} count={count} />, {
    ...size,
    fonts: await ogFonts(),
  });
}
