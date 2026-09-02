/**
 * /api/admin/articles
 *
 * GET  — list articles. Query: ?status=DRAFT|PUBLISHED (optional), ?q=<search>.
 * POST — create a new article. Body: { slug, title, bodyMarkdown, ...optional }.
 *
 * Admin-only (requireAdmin → ADMIN_EMAILS allowlist gate).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get('status');
  const q = searchParams.get('q')?.trim() ?? '';

  const where: Record<string, unknown> = {};
  if (statusParam === 'DRAFT' || statusParam === 'PUBLISHED') {
    where.status = statusParam;
  }
  if (q) {
    where.OR = [
      { slug: { contains: q, mode: 'insensitive' } },
      { title: { contains: q, mode: 'insensitive' } },
      { primaryKeyword: { contains: q, mode: 'insensitive' } },
    ];
  }

  const articles = await prisma.article.findMany({
    where,
    select: {
      id: true,
      slug: true,
      title: true,
      seoTitle: true,
      metaDescription: true,
      primaryKeyword: true,
      cluster: true,
      status: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    take: 200,
  });

  return NextResponse.json({ success: true, articles });
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'invalid_json' }, { status: 400 });
  }

  const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const bodyMarkdown = typeof body.bodyMarkdown === 'string' ? body.bodyMarkdown : '';

  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json(
      { success: false, error: 'invalid_slug', detail: 'lowercase letters, digits, hyphen only' },
      { status: 400 },
    );
  }
  if (!title) {
    return NextResponse.json({ success: false, error: 'title_required' }, { status: 400 });
  }
  if (!bodyMarkdown) {
    return NextResponse.json({ success: false, error: 'body_required' }, { status: 400 });
  }

  const secondaryKeywords = Array.isArray(body.secondaryKeywords)
    ? (body.secondaryKeywords as unknown[]).map(String)
    : [];

  try {
    const created = await prisma.article.create({
      data: {
        slug,
        title,
        seoTitle: typeof body.seoTitle === 'string' ? body.seoTitle : null,
        metaDescription: typeof body.metaDescription === 'string' ? body.metaDescription : null,
        primaryKeyword: typeof body.primaryKeyword === 'string' ? body.primaryKeyword : null,
        secondaryKeywords,
        cluster: typeof body.cluster === 'string' ? body.cluster : null,
        imageAlt: typeof body.imageAlt === 'string' ? body.imageAlt : null,
        canonicalUrl: typeof body.canonicalUrl === 'string' ? body.canonicalUrl : null,
        bodyMarkdown,
        status: 'DRAFT',
        authorEmail: gate.email,
      },
      select: { id: true, slug: true, status: true },
    });
    return NextResponse.json({ success: true, article: created }, { status: 201 });
  } catch (e) {
    const msg = String(e);
    if (msg.includes('Unique constraint') || msg.includes('P2002')) {
      return NextResponse.json({ success: false, error: 'slug_taken' }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: 'create_failed' }, { status: 500 });
  }
}
