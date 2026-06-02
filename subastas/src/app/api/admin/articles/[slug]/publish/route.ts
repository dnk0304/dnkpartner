/**
 * POST /api/admin/articles/[slug]/publish
 *
 * Set status=PUBLISHED. Sets publishedAt=now() if it was NULL (first publish);
 * preserves the original publishedAt on re-publish so SEO/sitemap timestamps
 * stay stable.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

export async function POST(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  const { slug } = await ctx.params;

  const existing = await prisma.article.findUnique({
    where: { slug },
    select: { publishedAt: true },
  });
  if (!existing) return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });

  const updated = await prisma.article.update({
    where: { slug },
    data: {
      status: 'PUBLISHED',
      publishedAt: existing.publishedAt ?? new Date(),
    },
    select: { slug: true, status: true, publishedAt: true },
  });

  return NextResponse.json({ success: true, article: updated });
}
