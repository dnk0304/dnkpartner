/**
 * /noticias/[provincia]/[period] — the monthly per-province recap ARTICLE
 * (Forge 2026-07-20). Reads ONE NoticiaMonthly row (single-row indexed lookup)
 * and renders proseEs/En + charts from the immutable statsJson snapshot.
 *
 * Rendering: DYNAMIC (ƒ), like every other content route in this app
 * (/guia, /blog, the /noticias hub, the province index). The locale arrives via
 * the middleware-injected `x-locale` header read by getLocale(), so the render
 * is request-dynamic and CANNOT be statically generated — an `export const
 * revalidate` here opts the page into ISR static generation, which forbids
 * headers() and 500s at request time with DYNAMIC_SERVER_USAGE (Pixel
 * 2026-07-20: removed Forge's revalidate=86400 for this reason). The read is a
 * single indexed NoticiaMonthly lookup, so per-request rendering is cheap and a
 * newly-generated month surfaces immediately (better than a 24h ISR window).
 *
 * No generateStaticParams: a single URL serves BOTH locales depending on the
 * x-locale header, so it cannot be prerendered per-locale — and its presence
 * opts the route into on-demand SSG, which re-triggers the headers() 500. The
 * route is therefore purely dynamic, identical to the /noticias hub.
 *
 * Validation: province ∈ 52 slugs AND period ^\d{4}-\d{2}$ AND a PUBLISHED row
 * exists — else notFound(). Charts are pure SSR (no client component) so there
 * is no "functions cannot be passed to client components" RSC hazard.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { buildAlternates, ogLocale } from "@/lib/seo/alternates";
import {
  getMonthlyArticle,
  isProvinceSlug,
  isValidPeriod,
  provinceLabelForSlug,
  listProvinceEditions,
  periodLabel,
  periodEndISO,
  proseParagraphs,
  type NoticiaStats,
} from "@/lib/noticias-monthly";
import { NoticiaCharts } from "@/components/noticias/NoticiaCharts";

const SITE = "https://subastasactivas.com";

function urlFor(provincia: string, period: string, locale: Locale): string {
  return locale === "en"
    ? `${SITE}/en/noticias/${provincia}/${period}`
    : `${SITE}/noticias/${provincia}/${period}`;
}

export async function generateMetadata(
  { params }: { params: Promise<{ provincia: string; period: string }> },
): Promise<Metadata> {
  const { provincia, period } = await params;
  const locale = (await getLocale()) as Locale;
  const article = await getMonthlyArticle(provincia, period);
  if (!article) {
    return {
      title:
        locale === "en"
          ? "Report not found · SubastasActivas"
          : "Informe no encontrado · SubastasActivas",
      robots: { index: false, follow: false },
    };
  }
  const title = locale === "en" ? article.titleEn : article.titleEs;
  const description = locale === "en" ? article.stats.metaEn : article.stats.metaEs;
  return {
    title: `${title} — SubastasActivas`,
    description,
    ...buildAlternates(`/noticias/${provincia}/${period}`, locale),
    openGraph: {
      type: "article",
      title,
      description,
      url: urlFor(provincia, period, locale),
      siteName: "SubastasActivas",
      locale: ogLocale(locale),
      publishedTime: `${periodEndISO(period)}T00:00:00Z`,
    },
  };
}

export default async function MonthlyArticlePage(
  { params }: { params: Promise<{ provincia: string; period: string }> },
) {
  const { provincia, period } = await params;
  const locale = (await getLocale()) as Locale;
  const shortLoc: "es" | "en" = locale === "en" ? "en" : "es";
  const prefix = locale === "en" ? "/en" : "";

  if (!isProvinceSlug(provincia) || !isValidPeriod(period)) notFound();
  const article = await getMonthlyArticle(provincia, period);
  if (!article) notFound();

  // Adjacent editions for prev/next month navigation (editions are newest-first;
  // "prev" = the older month, "next" = the newer month — reading order for news).
  const editions = await listProvinceEditions(provincia, shortLoc);
  const idx = editions.findIndex((e) => e.period === period);
  const newer = idx > 0 ? editions[idx - 1] : null; // newer month sits earlier
  const older = idx >= 0 && idx < editions.length - 1 ? editions[idx + 1] : null;

  const stats: NoticiaStats = article.stats;
  const label = provinceLabelForSlug(provincia) ?? stats.provinceName ?? provincia;
  const title = locale === "en" ? article.titleEn : article.titleEs;
  const prose = locale === "en" ? article.proseEn : article.proseEs;
  const paragraphs = proseParagraphs(prose);
  const url = urlFor(provincia, period, locale);
  const dateISO = `${periodEndISO(period)}T00:00:00Z`;

  const t =
    locale === "en"
      ? {
          home: "Home",
          news: "News",
          sold: "Awarded",
          desierta: "Unsold",
          back: "All reports for",
          published: "Report for",
          prevMonth: "Previous month",
          nextMonth: "Next month",
          seeResults: `See all auction results in ${label}`,
          seeActive: `See all active auctions in ${label}`,
          moreNav: "Keep reading",
        }
      : {
          home: "Inicio",
          news: "Noticias",
          sold: "Adjudicadas",
          desierta: "Desiertas",
          back: "Todos los informes de",
          published: "Informe de",
          prevMonth: "Mes anterior",
          nextMonth: "Mes siguiente",
          seeResults: `Ver todos los resultados de subastas en ${label}`,
          seeActive: `Ver todas las subastas activas en ${label}`,
          moreNav: "Seguir leyendo",
        };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: title,
    description: locale === "en" ? stats.metaEn : stats.metaEs,
    inLanguage: locale === "en" ? "en-US" : "es-ES",
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
    datePublished: dateISO,
    dateModified: dateISO,
    publisher: { "@type": "Organization", name: "SubastasActivas", url: SITE },
    about: {
      "@type": "Dataset",
      name: `${label} ${periodLabel(period, shortLoc)}`,
      variableMeasured: [
        {
          "@type": "PropertyValue",
          name: locale === "en" ? "New auctions" : "Nuevas subastas",
          value: stats.intake,
        },
        { "@type": "PropertyValue", name: t.sold, value: stats.sold },
        { "@type": "PropertyValue", name: t.desierta, value: stats.desierta },
      ],
    },
  };

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
                {t.home}
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li>
              <Link href={`${prefix}/noticias`} className="hover:text-[var(--color-ink-primary)]">
                {t.news}
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li>
              <Link
                href={`${prefix}/noticias/${provincia}`}
                className="hover:text-[var(--color-ink-primary)]"
              >
                {label}
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li className="text-[var(--color-ink-secondary)]" aria-current="page">
              {periodLabel(period, shortLoc)}
            </li>
          </ol>
        </nav>

        <article>
          <header className="mb-8 border-b border-[var(--color-hairline-soft)] pb-6">
            <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight text-[var(--color-ink-primary)] sm:text-4xl">
              {title}
            </h1>
            <p className="mt-4 text-xs text-[var(--color-ink-quiet)]">
              <time dateTime={dateISO}>
                {t.published} {periodLabel(period, shortLoc)}
              </time>
            </p>
          </header>

          {/* Written recap lede — the editorial prose that makes it read as news. */}
          <div className="flex flex-col gap-4">
            {paragraphs.map((p, i) => (
              <p
                key={i}
                className={
                  i === 0
                    ? "text-lg leading-relaxed text-[var(--color-ink-primary)]"
                    : "text-base leading-relaxed text-[var(--color-ink-secondary)]"
                }
              >
                {p}
              </p>
            ))}
          </div>

          {/* Dataviz block — tiles, outcome breakdown, MoM, price range, notable
              facts. Built from the immutable statsJson snapshot; shares the
              /resultados validated palette so both surfaces read as one system. */}
          <div className="mt-10">
            <NoticiaCharts stats={stats} locale={shortLoc} />
          </div>
        </article>

        {/* Cross-links: prev/next month + this province's live results archive. */}
        <nav
          aria-label={t.moreNav}
          className="mt-12 border-t border-[var(--color-hairline-soft)] pt-6"
        >
          {newer || older ? (
            <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {older ? (
                <Link
                  href={`${prefix}/noticias/${provincia}/${older.period}`}
                  className="group rounded-[var(--radius-lg)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-4 transition-colors hover:border-[var(--color-action)]"
                  rel="prev"
                >
                  <span className="block text-xs text-[var(--color-ink-quiet)]">
                    ← {t.prevMonth}
                  </span>
                  <span className="mt-1 block text-sm font-medium text-[var(--color-ink-primary)]">
                    {periodLabel(older.period, shortLoc)}
                  </span>
                </Link>
              ) : (
                <span aria-hidden />
              )}
              {newer ? (
                <Link
                  href={`${prefix}/noticias/${provincia}/${newer.period}`}
                  className="group rounded-[var(--radius-lg)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-4 text-right transition-colors hover:border-[var(--color-action)]"
                  rel="next"
                >
                  <span className="block text-xs text-[var(--color-ink-quiet)]">
                    {t.nextMonth} →
                  </span>
                  <span className="mt-1 block text-sm font-medium text-[var(--color-ink-primary)]">
                    {periodLabel(newer.period, shortLoc)}
                  </span>
                </Link>
              ) : (
                <span aria-hidden />
              )}
            </div>
          ) : null}

          <div className="flex flex-col gap-2 text-sm">
            <Link
              href={`${prefix}/noticias/${provincia}`}
              className="text-[var(--color-action)] hover:underline"
            >
              ← {t.back} {label}
            </Link>
            <Link
              href={`${prefix}/resultados/${provincia}`}
              className="text-[var(--color-action)] hover:underline"
            >
              {t.seeResults} →
            </Link>
            <Link
              href={`${prefix}/subastas/${provincia}`}
              className="text-[var(--color-action)] hover:underline"
            >
              {t.seeActive} →
            </Link>
          </div>
        </nav>
      </main>
    </div>
  );
}
