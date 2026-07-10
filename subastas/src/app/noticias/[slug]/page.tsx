/**
 * Noticia detail — /noticias/[slug] (es) and /en/noticias/[slug] (en).
 *
 * Markdown-file-driven (content/noticias/<slug>.<locale>.md — see
 * src/lib/noticias.ts). Zero DB access.
 *
 * generateStaticParams() doubles as the BUILD-TIME VALIDATION GATE: it calls
 * getAllSlugs(), which parses + hard-validates every content file — a
 * malformed frontmatter fails `next build`, never production. The render
 * itself is dynamic because locale arrives via the middleware-injected
 * `x-locale` header (same one-route-both-locales scheme as /precios).
 *
 * Missing .en.md → notFound() on /en/noticias/<slug> and NO en hreflang
 * (locked decision: 404 + omit).
 *
 * Body renders through the SHARED <ArticleContent /> — the repo's single
 * ReactMarkdown call site. Do not add another markdown renderer.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { getAllSlugs, getNoticia, formatNoticiaDate } from "@/lib/noticias";
import { ArticleContent } from "@/components/blog/ArticleContent";

const SITE = "https://subastasactivas.com";

export function generateStaticParams(): Array<{ slug: string }> {
  // Also the build-time content validation gate — see file header.
  return getAllSlugs().map((slug) => ({ slug }));
}

function urlFor(slug: string, locale: Locale): string {
  return locale === "en" ? `${SITE}/en/noticias/${slug}` : `${SITE}/noticias/${slug}`;
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const locale = (await getLocale()) as Locale;
  const noticia = getNoticia(slug, locale);
  if (!noticia) {
    return {
      title:
        locale === "en"
          ? "Article not found · SubastasActivas"
          : "Noticia no encontrada · SubastasActivas",
    };
  }
  const canonical = urlFor(slug, locale);
  const title = `${noticia.title} — SubastasActivas`;
  return {
    title,
    description: noticia.description,
    alternates: {
      canonical,
      // hreflang pair ONLY when both locale files exist (locked: 404 + omit).
      ...(noticia.hasBothLocales
        ? {
            languages: {
              es: urlFor(slug, "es"),
              en: urlFor(slug, "en"),
              "x-default": urlFor(slug, "es"),
            },
          }
        : {}),
    },
    openGraph: {
      type: "article",
      title,
      description: noticia.description,
      url: canonical,
      siteName: "SubastasActivas",
      locale: locale === "en" ? "en_US" : "es_ES",
      publishedTime: noticia.date,
      modifiedTime: noticia.updated ?? noticia.date,
      ...(noticia.ogImage ? { images: [{ url: `${SITE}${noticia.ogImage}` }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: noticia.description,
    },
  };
}

export default async function NoticiaPage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const locale = (await getLocale()) as Locale;
  const noticia = getNoticia(slug, locale);
  if (!noticia) notFound();

  const prefix = locale === "en" ? "/en" : "";
  const url = urlFor(slug, locale);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: noticia.title,
    description: noticia.description,
    inLanguage: locale === "en" ? "en-US" : "es-ES",
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
    datePublished: noticia.date,
    dateModified: noticia.updated ?? noticia.date,
    author: { "@type": "Organization", name: noticia.author },
    publisher: {
      "@type": "Organization",
      name: "SubastasActivas",
      url: SITE,
    },
    ...(noticia.ogImage ? { image: [`${SITE}${noticia.ogImage}`] } : {}),
  };

  const backLabel = locale === "en" ? "← All news" : "← Ver todas las noticias";
  const publishedLabel = locale === "en" ? "Published on" : "Publicado el";
  const homeLabel = locale === "en" ? "Home" : "Inicio";
  const sectionLabel = locale === "en" ? "News" : "Noticias";

  return (
    <div className="min-h-screen bg-[var(--color-page)]">
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
          aria-label={locale === "en" ? "Breadcrumb" : "Migas de pan"}
          className="mb-6 text-xs text-[var(--color-ink-quiet)]"
        >
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href={prefix || "/"} className="hover:text-[var(--color-ink-primary)]">
                {homeLabel}
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li>
              <Link
                href={`${prefix}/noticias`}
                className="hover:text-[var(--color-ink-primary)]"
              >
                {sectionLabel}
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li className="text-[var(--color-ink-secondary)]" aria-current="page">
              {noticia.title}
            </li>
          </ol>
        </nav>

        <article>
          <header className="mb-8 border-b border-[var(--color-hairline-soft)] pb-6">
            <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight text-[var(--color-ink-primary)] sm:text-4xl">
              {noticia.title}
            </h1>
            <p className="mt-3 text-base leading-relaxed text-[var(--color-ink-secondary)]">
              {noticia.description}
            </p>
            <p className="mt-4 text-xs text-[var(--color-ink-quiet)]">
              <time dateTime={noticia.date}>
                {publishedLabel} {formatNoticiaDate(noticia.date, locale)}
              </time>
            </p>
          </header>

          {/* Shared prose renderer — single ReactMarkdown call site. */}
          <ArticleContent body={noticia.content} />
        </article>

        <div className="mt-12 border-t border-[var(--color-hairline-soft)] pt-6">
          <Link
            href={`${prefix}/noticias`}
            className="text-sm text-[var(--color-action)] hover:underline"
          >
            {backLabel}
          </Link>
        </div>
      </main>
    </div>
  );
}
