/**
 * POST /api/admin/articles/[slug]/unpublish
 *
 * Set status=DRAFT. Keeps publishedAt so re-publish is idempotent for SEO.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

export async function POST(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  const { slug } = await ctx.params;

  try {
    const updated = await prisma.article.update({
      where: { slug },
      data: { status: 'DRAFT' },
      select: { slug: true, status: true, publishedAt: true },
    });
    return NextResponse.json({ success: true, article: updated });
  } catch {
    return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });
  }
}
