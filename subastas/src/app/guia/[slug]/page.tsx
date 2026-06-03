/**
 * Public article page — /guia/[slug]
 *
 * Renders ONE published article. Drafts return 404 (helper hard-filters by
 * status=PUBLISHED). Slug pattern `/guia/<slug>` matches the SEO plan's
 * canonical URL intent from the 56 imported articles.
 *
 * SEO:
 *   - generateMetadata: title (seoTitle ?? title), description, canonical,
 *     OpenGraph + Twitter card.
 *   - JSON-LD Article schema injected in the body.
 *
 * Markdown: react-markdown + remark-gfm (tables + strikethrough + task lists).
 * No raw HTML allowed — react-markdown's default refuses raw HTML, which is
 * what we want for trust + security on Dennis-authored content.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublishedArticleBySlug } from "@/lib/articles";
import { ArticleContent } from "@/components/blog/ArticleContent";

const SITE = "https://subastasactivas.com";

// Revalidate every 5 minutes — articles change rarely, but publish actions
// should propagate without a deploy. Rendered on-demand (no
// generateStaticParams) so the build does not require a live DB connection.
export const dynamic = "force-dynamic";
export const revalidate = 300;

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const article = await getPublishedArticleBySlug(slug);
  if (!article) {
    return { title: "Artículo no encontrado · SubastasActivas" };
  }
  const title = article.seoTitle?.trim() || article.title;
  const description = article.metaDescription?.trim() || undefined;
  const canonical = article.canonicalUrl?.trim() || `${SITE}/guia/${article.slug}`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "article",
      title,
      description,
      url: canonical,
      siteName: "SubastasActivas",
      locale: "es_ES",
      publishedTime: article.publishedAt?.toISOString(),
      modifiedTime: article.updatedAt.toISOString(),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function ArticlePage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const article = await getPublishedArticleBySlug(slug);
  if (!article) notFound();

  const url = `${SITE}/guia/${article.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.metaDescription ?? undefined,
    inLanguage: "es-ES",
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
    datePublished: article.publishedAt?.toISOString(),
    dateModified: article.updatedAt.toISOString(),
    publisher: {
      "@type": "Organization",
      name: "SubastasActivas",
      url: SITE,
    },
    keywords: [
      article.primaryKeyword,
      ...(article.secondaryKeywords ?? []),
    ]
      .filter(Boolean)
      .join(", ") || undefined,
  };

  return (
    <div className="min-h-screen bg-[--color-page]">
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Header + footer come from SiteChrome in the root layout. */}

      <main className="mx-auto max-w-3xl px-6 py-10">
        {/* Breadcrumb */}
        <nav
          aria-label="Migas de pan"
          className="mb-6 text-xs text-[--color-ink-quiet]"
        >
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/" className="hover:text-[--color-ink-primary]">
                Inicio
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li>
              <Link
                href="/blog"
                className="hover:text-[--color-ink-primary]"
              >
                Guías
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li className="text-[--color-ink-secondary]" aria-current="page">
              {article.title}
            </li>
          </ol>
        </nav>

        <article>
          <header className="mb-8 border-b border-[--color-hairline-soft] pb-6">
            <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight text-[--color-ink-primary] sm:text-4xl">
              {article.title}
            </h1>
            {article.metaDescription ? (
              <p className="mt-3 text-base leading-relaxed text-[--color-ink-secondary]">
                {article.metaDescription}
              </p>
            ) : null}
            {article.publishedAt ? (
              <p className="mt-4 text-xs text-[--color-ink-quiet]">
                <time dateTime={article.publishedAt.toISOString()}>
                  Publicado el{" "}
                  {article.publishedAt.toLocaleDateString("es-ES", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </time>
              </p>
            ) : null}
          </header>

          {/*
            Prose container — rendered via the shared <ArticleContent />
            component so the admin editor's "Previsualizar" pane is the
            EXACT same render path as this public page (true WYSIWYG).
            Typography pinned to design tokens in `.article-prose`
            (globals.css) rather than @tailwindcss/typography.
          */}
          <ArticleContent body={article.bodyMarkdown} />
        </article>

        <div className="mt-12 border-t border-[--color-hairline-soft] pt-6">
          <Link
            href="/blog"
            className="text-sm text-[--color-action] hover:underline"
          >
            ← Ver todas las guías
          </Link>
        </div>
      </main>
    </div>
  );
}
