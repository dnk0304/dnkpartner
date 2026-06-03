/**
 * Public blog index — /blog
 *
 * Lists PUBLISHED articles, newest first. The list is intentionally simple:
 * title + meta description + publish date. Each card links to /guia/<slug>
 * (the canonical SEO URL of the article).
 *
 * Empty state is real: while all 56 imports remain DRAFT, this page shows
 * the "próximamente" copy. That is correct behaviour — drafts MUST not leak.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { listPublishedArticles } from "@/lib/articles";

const SITE = "https://subastasactivas.com";

// Rendered on-demand; revalidate every 5 min for cheap caching without
// requiring a DB at build time.
export const dynamic = "force-dynamic";
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Guías sobre subastas judiciales — SubastasActivas",
  description:
    "Guías prácticas y comparativas sobre subastas judiciales del BOE: cómo pujar, plazos, fiscalidad, riesgos y casos reales. Información clara, sin tecnicismos vacíos.",
  alternates: { canonical: `${SITE}/blog` },
  openGraph: {
    type: "website",
    title: "Guías sobre subastas judiciales — SubastasActivas",
    description:
      "Guías prácticas sobre subastas judiciales del BOE: cómo pujar, plazos, fiscalidad y riesgos.",
    url: `${SITE}/blog`,
    siteName: "SubastasActivas",
    locale: "es_ES",
  },
};

export default async function BlogIndexPage() {
  const articles = await listPublishedArticles({ take: 200 });

  return (
    <div className="min-h-screen bg-[--color-page]">
      {/* Header + footer come from SiteChrome in the root layout. */}

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-10 max-w-2xl">
          <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight text-[--color-ink-primary] sm:text-4xl">
            Guías sobre subastas judiciales
          </h1>
          <p className="mt-3 text-base leading-relaxed text-[--color-ink-secondary]">
            Material práctico para pujar mejor: plazos, fiscalidad, riesgos y
            comparativas. Datos oficiales del BOE, redactado sin tecnicismos
            vacíos.
          </p>
        </div>

        {articles.length === 0 ? (
          <div className="rounded-lg border border-[--color-hairline] bg-[--color-surface] p-8 text-center">
            <p className="text-base font-medium text-[--color-ink-primary]">
              Próximamente.
            </p>
            <p className="mt-2 text-sm text-[--color-ink-secondary]">
              Estamos preparando las primeras guías. Vuelve pronto.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {articles.map((a) => (
              <li
                key={a.slug}
                className="group rounded-lg border border-[--color-hairline] bg-[--color-surface] p-5 transition hover:shadow-[var(--shadow-card)]"
              >
                <Link href={`/guia/${a.slug}`} className="block">
                  <h2 className="font-display text-lg font-semibold leading-snug tracking-tight text-[--color-ink-primary] group-hover:underline">
                    {a.title}
                  </h2>
                  {a.metaDescription ? (
                    <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-[--color-ink-secondary]">
                      {a.metaDescription}
                    </p>
                  ) : null}
                  <div className="mt-3 flex items-center gap-2 text-xs text-[--color-ink-quiet]">
                    {a.publishedAt ? (
                      <time dateTime={a.publishedAt.toISOString()}>
                        {a.publishedAt.toLocaleDateString("es-ES", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </time>
                    ) : null}
                    {a.cluster ? (
                      <>
                        <span aria-hidden>·</span>
                        <span>{a.cluster}</span>
                      </>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
