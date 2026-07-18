/**
 * /subastas/[slug] — MERGED province + category SEO page (Wave 56, Option A).
 *
 * After the URL re-architecture both province and category pages live at the
 * same 1-segment dynamic slot under /subastas — Next.js forbids sibling
 * dynamic segments at the same depth, so the two route bodies were merged
 * here behind `resolveSubastasSlug`. The slug sets are DISJOINT (asserted at
 * module-load in `src/lib/seo/slugs.ts`), so resolution is deterministic.
 *
 * Behavior preservation:
 *  - kind='category' renders byte-identical to the prior /subastas/[categoria]
 *    page (verbatim relocation of the body, only the param name changes).
 *  - kind='province' renders the body relocated from
 *    /subastas/provincia/[provincia]/page.tsx — same H1, breadcrumb shape,
 *    intro, footer-cluster, JSON-LD. ONLY the canonical/self-link/JSON-LD
 *    `url` field changes to the new clean URL (else canonical would point at
 *    a 301 source).
 *
 * Reserved-word guard, alias 301s, index gating: unchanged semantics.
 */

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { getLocale, getTranslations } from 'next-intl/server';
import { buildAlternates, ogLocale } from '@/lib/seo/alternates';
import type { Locale } from '@/i18n/routing';
import {
  resolveSubastasSlug,
  isOfficialCategory,
  CATEGORY_INDEX_THRESHOLD,
  TIPO_SLUGS,
  type CategorySlug,
} from '@/lib/seo/slugs';
import {
  countActiveAuctions,
  minStartingPrice,
  municipalitiesInProvince,
} from '@/lib/seo/page-data';
import { SeoIntroBlock } from '@/components/seo/SeoIntroBlock';
import { Breadcrumbs } from '@/components/seo/Breadcrumbs';
import { capitalizeLocation } from '@/lib/utils';
import SubastasListClient from '../SubastasListClient';

type PageProps = { params: Promise<{ slug: string }> };
const SITE = 'https://subastasactivas.com';

// ---------------------------------------------------------------------------
// generateMetadata — branches on resolver kind.
// ---------------------------------------------------------------------------

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const r = resolveSubastasSlug(slug);
  const t = await getTranslations('listTemplates');
  if (r.kind === 'reserved' || r.kind === 'invalid' || r.kind === 'redirect') {
    return { title: t('notFoundTitle') };
  }
  const locale = (await getLocale()) as Locale;
  const nf = locale === 'en' ? 'en-US' : 'es-ES';

  if (r.kind === 'category') {
    const plural = t(`categoryLabel.${r.slug}`);
    const count = await countActiveAuctions({ category: r.dbLabel });
    const title = t('categoryMetaTitle', { count: count.toLocaleString(nf), plural });
    const description = t('categoryMetaDescription', { count: count.toLocaleString(nf), plural }).slice(0, 158);
    const indexable = isOfficialCategory(r.dbLabel) && count >= CATEGORY_INDEX_THRESHOLD;
    return {
      title,
      description,
      // Self-canonical per locale + es/en/x-default hreflang (i18n Phase 1).
      ...buildAlternates(`/subastas/${slug}`, locale),
      openGraph: { locale: ogLocale(locale) },
      robots: indexable ? 'index,follow' : 'noindex,follow',
    };
  }

  // kind === 'province'
  const count = await countActiveAuctions({ province: r.dbKey });
  const title = t('provinceMetaTitle', { count: count.toLocaleString(nf), province: r.label });
  const description = t('provinceMetaDescription', { count: count.toLocaleString(nf), province: r.label }).slice(0, 158);
  return {
    title,
    description,
    // CLEAN canonical (Wave 56 — no /provincia/ prefix), self-canonical per
    // locale + hreflang cluster (i18n Phase 1).
    ...buildAlternates(`/subastas/${slug}`, locale),
    openGraph: { locale: ogLocale(locale) },
    robots: count > 0 ? 'index,follow' : 'noindex,follow',
  };
}

// ---------------------------------------------------------------------------
// Category branch — RELOCATED VERBATIM from the prior [categoria]/page.tsx.
// ---------------------------------------------------------------------------

async function renderCategoryPage(slugUrl: string, r: {
  kind: 'category';
  slug: CategorySlug;
  dbLabel: string;
}) {
  const { slug: cat, dbLabel } = r;
  const t = await getTranslations('listTemplates');
  const plural = t(`categoryLabel.${cat}`);

  const [count, minPrice] = await Promise.all([
    countActiveAuctions({ category: dbLabel }),
    minStartingPrice({ category: dbLabel }),
  ]);

  const introSlot = (
    <>
      <Breadcrumbs
        items={[
          { label: t('breadcrumbHome'), href: '/' },
          { label: t('breadcrumbSubastas'), href: '/subastas' },
          { label: t('categoryTitle', { plural }), href: `/subastas/${slugUrl}` },
        ]}
      />
      <SeoIntroBlock
        count={count}
        noun={t('categoryNoun', { plural })}
        location={t('spain')}
        minPrice={minPrice}
        guideHref={`/guia/subastas-de-${slugUrl}`}
        guideLabel={t('categoryGuideLabel', { plural })}
      />
    </>
  );

  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--color-page)]" />}>
      <SubastasListClient
        lockedFilter={{ category: dbLabel }}
        seoTitle={t('categoryTitle', { plural })}
        seoIntroSlot={introSlot}
      />
    </Suspense>
  );
}

// ---------------------------------------------------------------------------
// Province branch — RELOCATED from /subastas/provincia/[provincia]/page.tsx.
// Only change: self-links / canonical / JSON-LD url point at the CLEAN URL
// (/subastas/{slug}) instead of /subastas/provincia/{slug}.
// ---------------------------------------------------------------------------

async function renderProvincePage(slugUrl: string, r: {
  kind: 'province';
  slug: string;
  dbKey: string;
  label: string;
}) {
  const { dbKey, label } = r;
  const t = await getTranslations('listTemplates');
  const [count, minPrice, municipalities] = await Promise.all([
    countActiveAuctions({ province: dbKey }),
    minStartingPrice({ province: dbKey }),
    municipalitiesInProvince(dbKey),
  ]);

  // CollectionPage JSON-LD now points at the clean canonical URL.
  const collectionLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `Subastas públicas en ${label}`,
    description: `Subastas públicas activas en ${label}.`,
    url: `${SITE}/subastas/${slugUrl}`,
  };

  const introSlot = (
    <>
      <Breadcrumbs
        items={[
          { label: t('breadcrumbHome'), href: '/' },
          { label: t('breadcrumbSubastas'), href: '/subastas' },
          { label, href: `/subastas/${slugUrl}` },
        ]}
      />
      <SeoIntroBlock
        count={count}
        noun={t('publicAuctionsNoun')}
        location={label}
        minPrice={minPrice}
        guideHref="/guia/como-funcionan-las-subastas-boe"
        guideLabel={t('boeGuideLabel')}
      />
    </>
  );

  const footerSlot = (
    <>
      {/* Registry cross-link — routes crawlers + users to the concluded-auction
          outcomes archive for this province (de-orphans the concluded detail
          pages; interlinks the two surfaces). */}
      <section className="mt-2">
        <Link
          href={`/resultados/${slugUrl}`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[var(--color-border)] text-sm font-medium hover:bg-[var(--color-surface-muted)]"
        >
          {t('viewConcludedResults', { province: label })}
        </Link>
      </section>

      {municipalities.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold mb-3">{t('byMunicipality', { province: label })}</h2>
          <ul className="flex flex-wrap gap-2">
            {municipalities.map((m) => (
              <li key={m.municipioSlug}>
                <Link
                  href={`/subastas/${slugUrl}/${m.municipioSlug}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-[var(--color-border)] text-xs hover:bg-[var(--color-surface-muted)]"
                >
                  <span>{capitalizeLocation(m.name)}</span>
                  <span className="text-[var(--color-text-muted)] tnum">({m.count.toLocaleString('es-ES')})</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-lg font-semibold mb-3">{t('byTipoIn', { province: label })}</h2>
        <ul className="flex flex-wrap gap-2">
          {TIPO_SLUGS.map((ts) => (
            <li key={ts}>
              <Link
                href={`/subastas/tipo/${ts}`}
                className="inline-block px-3 py-1 rounded-full border border-[var(--color-border)] text-xs hover:bg-[var(--color-surface-muted)]"
              >
                {t(`tipoLabel.${ts}`)}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionLd) }} />
    </>
  );

  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--color-page)]" />}>
      <SubastasListClient
        lockedFilter={{ province: dbKey }}
        seoTitle={t('provinceTitle', { province: label })}
        seoIntroSlot={introSlot}
        seoFooterSlot={footerSlot}
      />
    </Suspense>
  );
}

// ---------------------------------------------------------------------------
// Entry — single resolver, single 1-segment slot.
// ---------------------------------------------------------------------------

export default async function SubastasSlugPage({ params }: PageProps) {
  const { slug } = await params;
  const r = resolveSubastasSlug(slug);
  if (r.kind === 'reserved' || r.kind === 'invalid') notFound();
  if (r.kind === 'redirect') redirect(r.to);
  if (r.kind === 'category') return renderCategoryPage(slug, r);
  if (r.kind === 'province') return renderProvincePage(slug, r);
  notFound();
}
