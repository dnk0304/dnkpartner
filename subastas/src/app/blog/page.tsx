/**
 * Public guides index — /blog (the "Guías" library; nav + breadcrumb label
 * "Guías", canonical article URLs are /guia/<slug>).
 *
 * Lists PUBLISHED articles grouped BY CATEGORY. Each article's raw `cluster`
 * collapses to one of 12 stable theme keys (Forge's `clusterToThemeKey`), and
 * each category renders as a cover-led scroll-snap carousel that expands to a
 * grid. A category jump-nav at the top doubles as wayfinding + showcase.
 *
 * Empty state is real: while all imports remain DRAFT, this shows "próximamente".
 * Drafts MUST NOT leak — the data helper hard-filters status=PUBLISHED.
 *
 * SEO: server-rendered, crawlable; covers carry alt text + reserved aspect
 * ratio (no CLS); no noindex.
 */
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { listPublishedArticles, type PublicArticleListItem } from "@/lib/articles";
import { buildAlternates, ogLocale, SITE_ORIGIN } from "@/lib/seo/alternates";
import type { Locale } from "@/i18n/routing";
import { resolveArticleCoverImage, type ThemeKey } from "@/lib/article-cover";
import {
  resolveTheme,
  THEME_META,
  THEME_ORDER,
  ThemeGlyph,
} from "@/components/blog/article-theme";
import { ArticleCard } from "@/components/blog/ArticleCard";
import { CategoryCarousel } from "@/components/blog/CategoryCarousel";
import { APP_TIME_ZONE } from "@/components/observatory/format";

// Rendered on-demand; revalidate every 5 min for cheap caching without
// requiring a DB at build time.
export const dynamic = "force-dynamic";
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations("blogPage");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    ...buildAlternates("/blog", locale as Locale),
    openGraph: {
      type: "website",
      title: t("metaTitle"),
      description: t("ogDescription"),
      url: `${SITE_ORIGIN}/blog`,
      siteName: "SubastasActivas",
      locale: ogLocale(locale as Locale),
    },
  };
}

export default async function BlogIndexPage() {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("blogPage");
  const articles = await listPublishedArticles({ take: 200 });

  // Hydration (#418), not style: an unpinned formatter uses the HOST zone (UTC in the
  // container, Europe/Madrid in the browser) and renders a different day on each side.
  const dateFmt = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: APP_TIME_ZONE });
  const fmtDate = (d: Date | null): string | undefined => (d ? dateFmt.format(d) : undefined);

  // Group by resolved theme key (stable, matches Vinci's 12 cover themes).
  const groups = new Map<ThemeKey, PublicArticleListItem[]>();
  for (const a of articles) {
    const theme = resolveTheme(a.cluster);
    const arr = groups.get(theme) ?? [];
    arr.push(a);
    groups.set(theme, arr);
  }
  const orderedThemes = THEME_ORDER.filter(
    (th) => (groups.get(th)?.length ?? 0) > 0,
  );

  const renderCard = (a: PublicArticleListItem, priority = false) => {
    const theme = resolveTheme(a.cluster);
    const cover = resolveArticleCoverImage({
      imageUrl: a.imageUrl,
      cluster: a.cluster,
      slug: a.slug,
    });
    return (
      <ArticleCard
        key={a.slug}
        href={`/guia/${a.slug}`}
        title={a.title}
        description={a.metaDescription}
        theme={theme}
        chipLabel={THEME_META[theme].label[locale]}
        coverSrc={cover.src}
        coverAlt={a.imageAlt ?? a.title}
        dateISO={a.publishedAt?.toISOString()}
        dateLabel={fmtDate(a.publishedAt)}
        priority={priority}
      />
    );
  };

  return (
    <div className="min-h-screen bg-[var(--color-page)]">
      {/* Header + footer come from SiteChrome in the root layout. */}

      <main className="mx-auto max-w-6xl px-6 py-10">
        {/* Hero */}
        <div className="max-w-2xl">
          <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight text-[var(--color-ink-primary)] sm:text-4xl">
            {t("title")}
          </h1>
          <p className="mt-3 text-base leading-relaxed text-[var(--color-ink-secondary)]">
            {t("intro")}
          </p>
        </div>

        {articles.length === 0 ? (
          <div className="mt-10 rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface)] p-8 text-center">
            <p className="text-base font-medium text-[var(--color-ink-primary)]">
              {t("comingSoonTitle")}
            </p>
            <p className="mt-2 text-sm text-[var(--color-ink-secondary)]">
              {t("comingSoonText")}
            </p>
          </div>
        ) : (
          <>
            {/* Category jump-nav — the library index (wayfinding + showcase). */}
            {orderedThemes.length > 1 ? (
              <nav
                aria-label={t("browseByCategory")}
                className="mt-8 border-y border-[var(--color-hairline)] py-4"
              >
                <ul className="flex flex-wrap gap-2">
                  {orderedThemes.map((th) => (
                    <li key={th}>
                      <a
                        href={`#cat-${th}`}
                        className="group inline-flex items-center gap-2 rounded-full border border-[var(--color-hairline)] bg-[var(--color-surface)] py-1.5 pl-2.5 pr-3 text-sm text-[var(--color-ink-secondary)] transition-colors hover:border-[var(--color-action)] hover:text-[var(--color-action)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
                      >
                        <span
                          className="grid h-5 w-5 place-items-center rounded-full text-white"
                          style={{
                            background: `linear-gradient(135deg, ${THEME_META[th].tint[1]}, ${THEME_META[th].tint[0]})`,
                          }}
                        >
                          <ThemeGlyph theme={th} className="h-3.5 w-3.5" />
                        </span>
                        <span className="font-medium">
                          {THEME_META[th].label[locale]}
                        </span>
                        <span className="tabular-nums text-[var(--color-ink-quiet)]">
                          {groups.get(th)!.length}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            ) : null}

            {/* Category sections */}
            <div className="mt-10 flex flex-col gap-14">
              {orderedThemes.map((th, sectionIdx) => {
                const items = groups.get(th)!;
                return (
                  <CategoryCarousel
                    key={th}
                    theme={th}
                    label={THEME_META[th].label[locale]}
                    blurb={THEME_META[th].blurb[locale]}
                    count={items.length}
                    viewAllLabel={t("viewAll")}
                    viewLessLabel={t("viewLess")}
                    prevLabel={t("prevAria")}
                    nextLabel={t("nextAria")}
                  >
                    {items.map((a, i) =>
                      renderCard(a, sectionIdx === 0 && i === 0),
                    )}
                  </CategoryCarousel>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
