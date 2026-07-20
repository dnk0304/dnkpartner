/**
 * /noticias/[provincia]/[period] — the monthly per-province recap ARTICLE
 * (Forge 2026-07-20). Reads ONE NoticiaMonthly row (single-row indexed lookup)
 * and renders proseEs/En + charts from the immutable statsJson snapshot.
 *
 * ISR: revalidate = 86400 so a newly-generated month surfaces with no redeploy.
 * generateStaticParams prebuilds the LATEST month's provinces; older months are
 * rendered on-demand and then cached.
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
  listProvincesWithEditions,
  latestPeriod,
  periodLabel,
  periodEndISO,
  formatEur,
  proseParagraphs,
  type NoticiaStats,
} from "@/lib/noticias-monthly";

export const revalidate = 86400; // ISR — new months surface without a redeploy

const SITE = "https://subastasactivas.com";

export async function generateStaticParams(): Promise<
  Array<{ provincia: string; period: string }>
> {
  // Prebuild only the LATEST month's provinces; older months render on-demand
  // (ISR). Build-SAFE: the build must not require a live DB (mirrors /guia) — a
  // DB-less build returns [] and every page renders on demand + is then cached.
  try {
    const period = await latestPeriod();
    if (!period) return [];
    const provinces = await listProvincesWithEditions();
    return provinces.map((provincia) => ({ provincia, period }));
  } catch {
    return [];
  }
}

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

// --- tiny SSR chart primitives (no client JS) ----------------------------

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface)] p-4">
      <div className="text-2xl font-semibold tabular-nums text-[var(--color-ink-primary)]">
        {value}
      </div>
      <div className="mt-1 text-xs text-[var(--color-ink-quiet)]">{label}</div>
    </div>
  );
}

/** Sold vs unsold split as a labelled horizontal bar (pure CSS width). */
function OutcomeBar({
  sold,
  desierta,
  soldLabel,
  desiertaLabel,
}: {
  sold: number;
  desierta: number;
  soldLabel: string;
  desiertaLabel: string;
}) {
  const total = sold + desierta;
  if (total === 0) return null;
  const soldPct = Math.round((sold / total) * 100);
  return (
    <div>
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-[var(--color-hairline)]">
        <div
          className="h-full bg-[var(--color-action)]"
          style={{ width: `${soldPct}%` }}
          aria-hidden
        />
      </div>
      <div className="mt-2 flex justify-between text-xs text-[var(--color-ink-secondary)]">
        <span>
          {soldLabel}: <strong className="tabular-nums">{sold}</strong> ({soldPct}%)
        </span>
        <span>
          {desiertaLabel}: <strong className="tabular-nums">{desierta}</strong>
        </span>
      </div>
    </div>
  );
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
          intake: "New auctions",
          concluded: "Concluded",
          sold: "Awarded",
          desierta: "Unsold",
          median: "Median price",
          outcome: "Outcome",
          noMedian: "n/a",
          back: "← All reports for",
          published: "Report for",
        }
      : {
          home: "Inicio",
          news: "Noticias",
          intake: "Nuevas subastas",
          concluded: "Concluidas",
          sold: "Adjudicadas",
          desierta: "Desiertas",
          median: "Precio mediano",
          outcome: "Resultado",
          noMedian: "s/d",
          back: "← Todos los informes de",
          published: "Informe de",
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
        { "@type": "PropertyValue", name: t.intake, value: stats.intake },
        { "@type": "PropertyValue", name: t.sold, value: stats.sold },
        { "@type": "PropertyValue", name: t.desierta, value: stats.desierta },
      ],
    },
  };

  const medianStr = formatEur(stats.soldMedianCents, shortLoc) ?? t.noMedian;

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

          {/* Stat tiles from the immutable snapshot */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label={t.intake} value={String(stats.intake)} />
            <StatTile label={t.concluded} value={String(stats.totalConcluded)} />
            <StatTile label={t.sold} value={String(stats.sold)} />
            <StatTile label={t.median} value={medianStr} />
          </div>

          {/* Outcome split chart */}
          {stats.totalConcluded > 0 ? (
            <div className="mb-8 rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface)] p-4">
              <div className="mb-3 text-xs font-medium uppercase tracking-wide text-[var(--color-ink-quiet)]">
                {t.outcome}
              </div>
              <OutcomeBar
                sold={stats.sold}
                desierta={stats.desierta}
                soldLabel={t.sold}
                desiertaLabel={t.desierta}
              />
            </div>
          ) : null}

          {/* Prose */}
          <div className="flex flex-col gap-4">
            {paragraphs.map((p, i) => (
              <p
                key={i}
                className="text-base leading-relaxed text-[var(--color-ink-secondary)]"
              >
                {p}
              </p>
            ))}
          </div>
        </article>

        <div className="mt-12 border-t border-[var(--color-hairline-soft)] pt-6">
          <Link
            href={`${prefix}/noticias/${provincia}`}
            className="text-sm text-[var(--color-action)] hover:underline"
          >
            {t.back} {label}
          </Link>
        </div>
      </main>
    </div>
  );
}
