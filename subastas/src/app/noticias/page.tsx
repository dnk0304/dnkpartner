/**
 * Noticias index — /noticias (es) and /en/noticias (en).
 *
 * Markdown-file-driven news listing (PARALLEL system to the DB-backed /blog +
 * /guia — see src/lib/noticias.ts). Zero DB access: the catalogue is read from
 * `content/noticias/` at render time and cached per server process (content
 * changes only with a redeploy, so this is effectively static output served
 * dynamically — the dynamic render exists ONLY because locale arrives via the
 * middleware-injected `x-locale` header, same as every locale-aware page).
 *
 * en listing shows ONLY articles that have an .en.md file (locked decision:
 * missing en = 404 + omit — no thin duplicates).
 */
import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { buildAlternates, ogLocale } from "@/lib/seo/alternates";
import { listNoticias, formatNoticiaDate } from "@/lib/noticias";
import { resolveArticleCoverImage } from "@/lib/article-cover";
import { ArticleCard } from "@/components/blog/ArticleCard";

const SITE = "https://subastasactivas.com";

const COPY: Record<
  Locale,
  { title: string; metaTitle: string; intro: string; empty: string; emptySub: string; chip: string }
> = {
  es: {
    title: "Noticias",
    metaTitle: "Noticias sobre subastas judiciales — SubastasActivas",
    intro:
      "Actualidad sobre subastas judiciales del BOE: cambios normativos, datos del mercado y novedades de SubastasActivas.",
    empty: "Próximamente.",
    emptySub: "Estamos preparando las primeras noticias. Vuelve pronto.",
    chip: "Noticia",
  },
  en: {
    title: "News",
    metaTitle: "Judicial auction news — SubastasActivas",
    intro:
      "News on Spanish judicial (BOE) auctions: regulatory changes, market data and SubastasActivas product updates.",
    empty: "Coming soon.",
    emptySub: "We are preparing the first news posts. Check back soon.",
    chip: "News",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as Locale;
  const c = COPY[locale];
  const canonical = locale === "en" ? `${SITE}/en/noticias` : `${SITE}/noticias`;
  return {
    title: c.metaTitle,
    description: c.intro,
    // Shared hreflang + self-canonical builder (i18n Phase 1) — /noticias always
    // exists in both locales, so the unconditional es/en/x-default set is correct.
    ...buildAlternates("/noticias", locale),
    openGraph: {
      type: "website",
      title: c.metaTitle,
      description: c.intro,
      url: canonical,
      siteName: "SubastasActivas",
      locale: ogLocale(locale),
    },
  };
}

export default async function NoticiasIndexPage() {
  const locale = (await getLocale()) as Locale;
  const c = COPY[locale];
  const noticias = listNoticias(locale);
  const prefix = locale === "en" ? "/en" : "";

  const [featured, ...rest] = noticias;

  const coverFor = (slug: string, ogImage?: string) =>
    resolveArticleCoverImage({ imageUrl: ogImage ?? null, cluster: null, slug });

  return (
    <div className="min-h-screen bg-[var(--color-page)]">
      {/* Header + footer come from SiteChrome in the root layout. */}

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-10 max-w-2xl">
          <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight text-[var(--color-ink-primary)] sm:text-4xl">
            {c.title}
          </h1>
          <p className="mt-3 text-base leading-relaxed text-[var(--color-ink-secondary)]">
            {c.intro}
          </p>
        </div>

        {noticias.length === 0 ? (
          <div className="rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface)] p-8 text-center">
            <p className="text-base font-medium text-[var(--color-ink-primary)]">
              {c.empty}
            </p>
            <p className="mt-2 text-sm text-[var(--color-ink-secondary)]">
              {c.emptySub}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {/* Featured lead — the newest story, full width. */}
            <ArticleCard
              variant="feature"
              href={`${prefix}/noticias/${featured.slug}`}
              title={featured.title}
              description={featured.description}
              theme="generic"
              chipLabel={c.chip}
              coverSrc={coverFor(featured.slug, featured.ogImage).src}
              coverAlt={featured.title}
              dateISO={featured.date}
              dateLabel={formatNoticiaDate(featured.date, locale)}
              priority
            />

            {rest.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((n) => (
                  <ArticleCard
                    key={n.slug}
                    href={`${prefix}/noticias/${n.slug}`}
                    title={n.title}
                    description={n.description}
                    theme="generic"
                    chipLabel={c.chip}
                    coverSrc={coverFor(n.slug, n.ogImage).src}
                    coverAlt={n.title}
                    dateISO={n.date}
                    dateLabel={formatNoticiaDate(n.date, locale)}
                  />
                ))}
              </div>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}
