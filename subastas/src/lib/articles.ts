/**
 * Public article data helpers — for Pixel's /guia/[slug] page and /blog index
 * in Phase 9b.
 *
 * Hard rule: these helpers ONLY return PUBLISHED articles. Drafts must never
 * leak to the public site. Admin reads go through the /api/admin/articles/* routes.
 *
 * Cache: callers should use Next's `unstable_cache` or `revalidate` on the
 * page; this module is intentionally cache-agnostic so it composes with whatever
 * Pixel chooses for the index vs. detail pages.
 */
import { prisma } from '@/lib/prisma';

export type PublicArticleListItem = {
  slug: string;
  title: string;
  seoTitle: string | null;
  metaDescription: string | null;
  primaryKeyword: string | null;
  cluster: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  publishedAt: Date | null;
  updatedAt: Date;
};

export type PublicArticle = PublicArticleListItem & {
  id: string;
  secondaryKeywords: string[];
  canonicalUrl: string | null;
  bodyMarkdown: string;
};

/** List all published articles, newest first. Safe for /blog index. */
export async function listPublishedArticles(opts?: { take?: number; skip?: number }): Promise<PublicArticleListItem[]> {
  return prisma.article.findMany({
    where: { status: 'PUBLISHED' },
    select: {
      slug: true,
      title: true,
      seoTitle: true,
      metaDescription: true,
      primaryKeyword: true,
      cluster: true,
      imageUrl: true,
      imageAlt: true,
      publishedAt: true,
      updatedAt: true,
    },
    orderBy: { publishedAt: 'desc' },
    take: opts?.take ?? 200,
    skip: opts?.skip ?? 0,
  });
}

/**
 * Fetch one PUBLISHED article by slug, or null if missing or still DRAFT.
 * Public consumers must treat null as 404.
 */
export async function getPublishedArticleBySlug(slug: string): Promise<PublicArticle | null> {
  const a = await prisma.article.findUnique({ where: { slug } });
  if (!a || a.status !== 'PUBLISHED') return null;
  return {
    id: a.id,
    slug: a.slug,
    title: a.title,
    seoTitle: a.seoTitle,
    metaDescription: a.metaDescription,
    primaryKeyword: a.primaryKeyword,
    secondaryKeywords: a.secondaryKeywords,
    cluster: a.cluster,
    imageUrl: a.imageUrl,
    imageAlt: a.imageAlt,
    canonicalUrl: a.canonicalUrl,
    bodyMarkdown: a.bodyMarkdown,
    publishedAt: a.publishedAt,
    updatedAt: a.updatedAt,
  };
}

/** Slugs only — for `generateStaticParams` in /guia/[slug]/page.tsx. */
export async function listPublishedSlugs(): Promise<string[]> {
  const rows = await prisma.article.findMany({
    where: { status: 'PUBLISHED' },
    select: { slug: true },
  });
  return rows.map((r) => r.slug);
}
