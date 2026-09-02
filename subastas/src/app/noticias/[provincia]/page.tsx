/**
 * /noticias/[provincia] — DISPATCHER (Forge 2026-07-20).
 *
 * Next forbids two differently-named dynamic segments at one level, so this
 * single `[provincia]` segment serves BOTH:
 *   1. province ∈ the 52 canonical slugs  → the province's MONTHLY-EDITIONS index
 *      (DB-backed NoticiaMonthly, newest-first).
 *   2. otherwise                          → the legacy editorial markdown article
 *      at /noticias/{slug} (unchanged behaviour — the editorial URL still works).
 *   3. neither                            → notFound().
 * Province wins on collision (checked first). The monthly ARTICLE lives one level
 * deeper at /noticias/[provincia]/[period].
 *
 * Editorial rendering is preserved verbatim from the pre-split [slug] route
 * (markdown, JSON-LD NewsArticle, breadcrumb, shared <ArticleContent/>).
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { ENGLISH_ENABLED, type Locale } from "@/i18n/routing";
import { buildAlternates, ogLocale } from "@/lib/seo/alternates";
import { getAllSlugs, getNoticia, formatNoticiaDate } from "@/lib/noticias";
import { ArticleContent } from "@/components/blog/ArticleContent";
import {
  isProvinceSlug,
  provinceLabelForSlug,
  listProvinceEditions,
  periodLabel,
  formatEur,
} from "@/lib/noticias-monthly";
import { PROVINCE_SLUGS } from "@/lib/seo/slugs";

const SITE = "https://subastasactivas.com";

export function generateStaticParams(): Array<{ provincia: string }> {
  // Editorial getAllSlugs() ALSO runs the build-time content validation gate
  // (malformed frontmatter fails the build) — keep calling it. Union with the
  // 52 province slugs so the latest province indexes prebuild.
  const editorial = getAllSlugs();
  const provinces = [...PROVINCE_SLUGS];
  return [...provinces, ...editorial].map((provincia) => ({ provincia }));
}

// ---------------------------------------------------------------------------
// metadata
// ---------------------------------------------------------------------------
export async function generateMetadata(
  { params }: { params: Promise<{ provincia: string }> },
): Promise<Metadata> {
  const { provincia } = await params;
  const locale = (await getLocale()) as Locale;

  if (isProvinceSlug(provincia)) {
    const label = provinceLabelForSlug(provincia) ?? provincia;
    const title =
      locale === "en"
        ? `Monthly auction reports — ${label} · SubastasActivas`
        : `Informes mensuales de subastas — ${label} · SubastasActivas`;
    const description =
      locale === "en"
        ? `Month-by-month judicial auction reports for ${label}: new auctions, awards, median prices and discount to appraisal.`
        : `Balance mensual de las subastas judiciales de ${label}: nuevas subastas, adjudicaciones, precio mediano y descuento sobre la tasación.`;
    return {
      title,
      description,
      ...buildAlternates(`/noticias/${provincia}`, locale),
      openGraph: {
        type: "website",
        title,
        description,
        url:
          locale === "en"
            ? `${SITE}/en/noticias/${provincia}`
            : `${SITE}/noticias/${provincia}`,
        siteName: "SubastasActivas",
        locale: ogLocale(locale),
      },
    };
  }

  // Editorial article metadata (verbatim from the pre-split route).
  const noticia = getNoticia(provincia, locale);
  if (!noticia) {
    return {
      title:
        locale === "en"
          ? "Article not found · SubastasActivas"
          : "Noticia no encontrada · SubastasActivas",
    };
  }
  const canonical =
    locale === "en" ? `${SITE}/en/noticias/${provincia}` : `${SITE}/noticias/${provincia}`;
  const title = `${noticia.title} — SubastasActivas`;
  return {
    title,
    description: noticia.description,
    alternates: {
      canonical,
      ...(ENGLISH_ENABLED && noticia.hasBothLocales
        ? {
            languages: {
              es: `${SITE}/noticias/${provincia}`,
              en: `${SITE}/en/noticias/${provincia}`,
              "x-default": `${SITE}/noticias/${provincia}`,
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
  };
}

// ---------------------------------------------------------------------------
// render
// ---------------------------------------------------------------------------
export default async function NoticiaProvinciaPage(
  { params }: { params: Promise<{ provincia: string }> },
) {
  const { provincia } = await params;
  const locale = (await getLocale()) as Locale;
  const shortLoc: "es" | "en" = locale === "en" ? "en" : "es";
  const prefix = locale === "en" ? "/en" : "";

  // ---- 1. Province monthly-editions index ----
  if (isProvinceSlug(provincia)) {
    const label = provinceLabelForSlug(provincia) ?? provincia;
    const editions = await listProvinceEditions(provincia, shortLoc);

    const homeLabel = locale === "en" ? "Home" : "Inicio";
    const sectionLabel = locale === "en" ? "News" : "Noticias";
    const heading =
      locale === "en" ? `Monthly auction reports — ${label}` : `Informes mensuales — ${label}`;
    const intro =
      locale === "en"
        ? `Month by month: new auctions, awards and prices for ${label}.`
        : `Mes a mes: nuevas subastas, adjudicaciones y precios de ${label}.`;
    const empty =
      locale === "en"
        ? "No monthly reports yet for this province. Check back after the next month closes."
        : "Aún no hay informes mensuales para esta provincia. Vuelve cuando cierre el próximo mes.";

    return (
      <div className="min-h-screen bg-[var(--color-page)]">
        <main className="mx-auto max-w-3xl px-6 py-10">
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
                <Link href={`${prefix}/noticias`} className="hover:text-[var(--color-ink-primary)]">
                  {sectionLabel}
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li className="text-[var(--color-ink-secondary)]" aria-current="page">
                {label}
              </li>
            </ol>
          </nav>

          <header className="mb-8">
            <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight text-[var(--color-ink-primary)] sm:text-4xl">
              {heading}
            </h1>
            <p className="mt-3 text-base leading-relaxed text-[var(--color-ink-secondary)]">
              {intro}
            </p>
            <p className="mt-3 text-sm">
              <Link
                href={`${prefix}/subastas/${provincia}`}
                className="text-[var(--color-action)] hover:underline"
              >
                {locale === "en"
                  ? `See all active auctions in ${label}`
                  : `Ver todas las subastas activas en ${label}`}{" "}
                →
              </Link>
            </p>
          </header>

          {editions.length === 0 ? (
            <div className="rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface)] p-8 text-center">
              <p className="text-sm text-[var(--color-ink-secondary)]">{empty}</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {editions.map((e, i) => {
                const median = formatEur(e.soldMedianCents, shortLoc);
                return (
                  <li key={e.period}>
                    <Link
                      href={`${prefix}/noticias/${provincia}/${e.period}`}
                      className="block rounded-[var(--radius-xl)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-4 transition-colors hover:border-[var(--color-action)] sm:p-5"
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-ink-quiet)]">
                          {periodLabel(e.period, shortLoc)}
                        </span>
                        {i === 0 ? (
                          <span className="rounded-full bg-[var(--color-action-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-action-hover)]">
                            {locale === "en" ? "Latest" : "Último"}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1.5 block text-base font-medium text-[var(--color-ink-primary)]">
                        {e.title}
                      </span>
                      <span className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--color-ink-secondary)]">
                        <span className="tnum">
                          <strong className="font-semibold text-[var(--color-ink-primary)]">
                            {e.intake.toLocaleString(locale === "en" ? "en-US" : "es-ES")}
                          </strong>{" "}
                          {locale === "en" ? "new auctions" : "nuevas subastas"}
                        </span>
                        <span className="tnum">
                          <strong className="font-semibold text-[var(--color-ink-primary)]">
                            {e.sold.toLocaleString(locale === "en" ? "en-US" : "es-ES")}
                          </strong>{" "}
                          {locale === "en" ? "awarded" : "adjudicadas"}
                        </span>
                        {median ? (
                          <span className="tnum">
                            <strong className="font-semibold text-[var(--color-ink-primary)]">
                              {median}
                            </strong>{" "}
                            {locale === "en" ? "median bid" : "puja mediana"}
                          </span>
                        ) : null}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </main>
      </div>
    );
  }

  // ---- 2. Editorial markdown article (verbatim from the pre-split route) ----
  const noticia = getNoticia(provincia, locale);
  if (!noticia) notFound();

  const url =
    locale === "en" ? `${SITE}/en/noticias/${provincia}` : `${SITE}/noticias/${provincia}`;
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
    publisher: { "@type": "Organization", name: "SubastasActivas", url: SITE },
    ...(noticia.ogImage ? { image: [`${SITE}${noticia.ogImage}`] } : {}),
  };

  const backLabel = locale === "en" ? "← All news" : "← Ver todas las noticias";
  const publishedLabel = locale === "en" ? "Published on" : "Publicado el";
  const homeLabel = locale === "en" ? "Home" : "Inicio";
  const sectionLabel = locale === "en" ? "News" : "Noticias";

  return (
    <div className="min-h-screen bg-[var(--color-page)]">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main className="mx-auto max-w-3xl px-6 py-10">
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
              <Link href={`${prefix}/noticias`} className="hover:text-[var(--color-ink-primary)]">
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
