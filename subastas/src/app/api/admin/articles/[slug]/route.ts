/**
 * /api/admin/articles/[slug]
 *
 * GET    — fetch one article (full body) for the editor.
 * PATCH  — update editable fields. Only fields present in the JSON body are touched.
 *           If `slug` is included AND differs, the article is renamed (slug change).
 * DELETE — delete the article.
 *
 * Admin-only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const EDITABLE_STRING_FIELDS = [
  'title',
  'seoTitle',
  'metaDescription',
  'primaryKeyword',
  'cluster',
  'imageAlt',
  'canonicalUrl',
  'bodyMarkdown',
] as const;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  const { slug } = await ctx.params;

  const article = await prisma.article.findUnique({ where: { slug } });
  if (!article) return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });
  return NextResponse.json({ success: true, article });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  const { slug } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'invalid_json' }, { status: 400 });
  }

  const existing = await prisma.article.findUnique({ where: { slug } });
  if (!existing) return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });

  const data: Record<string, unknown> = {};

  for (const field of EDITABLE_STRING_FIELDS) {
    if (field in body) {
      const v = body[field];
      if (v === null || typeof v === 'string') data[field] = v;
    }
  }

  if ('secondaryKeywords' in body) {
    const v = body.secondaryKeywords;
    if (Array.isArray(v)) data.secondaryKeywords = v.map(String);
  }

  if ('slug' in body && typeof body.slug === 'string') {
    const newSlug = body.slug.trim();
    if (newSlug !== slug) {
      if (!/^[a-z0-9-]+$/.test(newSlug)) {
        return NextResponse.json({ success: false, error: 'invalid_slug' }, { status: 400 });
      }
      data.slug = newSlug;
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ success: false, error: 'no_changes' }, { status: 400 });
  }

  try {
    const updated = await prisma.article.update({
      where: { slug },
      data,
      select: { id: true, slug: true, status: true, updatedAt: true },
    });
    return NextResponse.json({ success: true, article: updated });
  } catch (e) {
    const msg = String(e);
    if (msg.includes('Unique constraint') || msg.includes('P2002')) {
      return NextResponse.json({ success: false, error: 'slug_taken' }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: 'update_failed' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  const { slug } = await ctx.params;
  try {
    await prisma.article.delete({ where: { slug } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });
  }
}
