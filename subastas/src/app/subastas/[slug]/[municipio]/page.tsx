/**
 * /subastas/[slug]/[municipio] — town (province + municipality) SEO page.
 *
 * Wave 56, Option A: nested directly under the clean province URL. The
 * `[slug]` segment is the PROVINCE slug; if it resolves as a category we
 * 404 (categories have no municipality children). The `[municipio]` segment
 * is resolved within that province via `municipalitySlugToDbName` — case +
 * accent folded against the distinct-municipality set (ANY status since
 * town-pages Phase 2 — towns with only finished inventory resolve too),
 * highest-count casing wins per slug (per-province collision guard).
 *
 * Locked filter: `{ province: dbKey, municipality: dbMunicipalityName }`
 * — the new server-side `municipality` filter on /api/auctions (Wave 56
 * additive) makes counts/list/badge correct at the server.
 *
 * Index gate: count>0 → index,follow; count==0 → noindex,follow (still 200).
 * `count` is the ACTIVE count (`countActiveAuctions`) — it MUST stay
 * active-only so finished-only towns get noindex. Those pages still render
 * content: the list defaults to `when=todas` (all user-facing states), so a
 * 0-active town shows its finished inventory rather than an empty state.
 *
 * SEO body (intro/footer/internal-link clusters) is Pixel's brief — this file
 * owns the route skeleton + data + canonical + JSON-LD + lockedFilter wiring.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { getLocale, getTranslations } from 'next-intl/server';
import { buildAlternates, ogLocale } from '@/lib/seo/alternates';
import type { Locale } from '@/i18n/routing';
import {
  resolveSubastasSlug,
  RESERVED_SEGMENTS,
  TIPO_SLUGS,
} from '@/lib/seo/slugs';
import {
  countActiveAuctions,
  minStartingPrice,
  municipalitySlugToDbName,
  municipalitiesInProvince,
} from '@/lib/seo/page-data';
import { SeoIntroBlock } from '@/components/seo/SeoIntroBlock';
import { Breadcrumbs } from '@/components/seo/Breadcrumbs';
import { capitalizeLocation } from '@/lib/utils';
import SubastasListClient from '../../SubastasListClient';
import { buildSeoAuctions } from '../../_shared/seo-auctions';

type PageProps = { params: Promise<{ slug: string; municipio: string }> };
const SITE = 'https://subastasactivas.com';

type SiblingMuni = { name: string; count: number; municipioSlug: string };

type Resolved = {
  provinceSlug: string;
  provinceDbKey: string;
  provinceLabel: string;
  municipioSlug: string;
  municipalityName: string;
  count: number;
  minPrice: number | null;
  siblings: SiblingMuni[];
  provinceTotal: number;
};

async function loadTown(slug: string, municipio: string): Promise<Resolved | null> {
  // Belt-and-braces — middleware (D) catches reserved first-segments before
  // routing, but if anything slips through we 404 here too.
  if (RESERVED_SEGMENTS.has(slug) || RESERVED_SEGMENTS.has(municipio)) return null;
  const r = resolveSubastasSlug(slug);
  if (r.kind !== 'province') return null; // categories have no town children

  const municipalityName = await municipalitySlugToDbName(r.dbKey, municipio);
  if (!municipalityName) return null;

  const [count, minPrice, allMunis, provinceTotal] = await Promise.all([
    countActiveAuctions({ province: r.dbKey, municipality: municipalityName }),
    minStartingPrice({ province: r.dbKey, municipality: municipalityName }),
    municipalitiesInProvince(r.dbKey),
    countActiveAuctions({ province: r.dbKey }),
  ]);

  // Sibling cluster: every municipality in the same province (any status —
  // counts shown are ACTIVE counts) EXCEPT the current one. Already sorted
  // by count desc.
  const siblings: SiblingMuni[] = allMunis
    .filter((m) => m.municipioSlug !== municipio)
    .map((m) => ({ name: m.name, count: m.count, municipioSlug: m.municipioSlug }));

  return {
    provinceSlug: r.slug,
    provinceDbKey: r.dbKey,
    provinceLabel: r.label,
    municipioSlug: municipio,
    municipalityName,
    count,
    minPrice,
    siblings,
    provinceTotal,
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, municipio } = await params;
  const data = await loadTown(slug, municipio);
  const t = await getTranslations('listTemplates');
  if (!data) return { title: t('notFoundTitle') };
  const locale = (await getLocale()) as Locale;
  const nf = locale === 'en' ? 'en-US' : 'es-ES';
  const muniLabel = capitalizeLocation(data.municipalityName);
  const title = t('townMetaTitle', {
    count: data.count.toLocaleString(nf),
    town: muniLabel,
    province: data.provinceLabel,
  });
  const description = t('townMetaDescription', {
    count: data.count.toLocaleString(nf),
    town: muniLabel,
    province: data.provinceLabel,
  }).slice(0, 158);
  return {
    title,
    description,
    // Self-canonical per locale + es/en/x-default hreflang (i18n Phase 1).
    ...buildAlternates(`/subastas/${data.provinceSlug}/${data.municipioSlug}`, locale),
    openGraph: { locale: ogLocale(locale) },
    robots: data.count > 0 ? 'index,follow' : 'noindex,follow',
  };
}

export default async function MunicipioPage({ params }: PageProps) {
  const { slug, municipio } = await params;
  const data = await loadTown(slug, municipio);
  if (!data) notFound();
  const t = await getTranslations('listTemplates');
  const muniLabel = capitalizeLocation(data.municipalityName);

  // SSR crawlable auction block (P1/P2) — page 1 for this town.
  const auctions = await buildSeoAuctions({
    filter: { province: data.provinceDbKey, municipality: data.municipalityName },
    basePath: `/subastas/${data.provinceSlug}/${data.municipioSlug}`,
    locationLabel: `${muniLabel} (${data.provinceLabel})`,
  });

  // BreadcrumbList + CollectionPage JSON-LD (mirror province page).
  const collectionLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `Subastas en ${muniLabel} (${data.provinceLabel})`,
    description: `Subastas públicas activas en ${muniLabel}, ${data.provinceLabel}.`,
    url: `${SITE}/subastas/${data.provinceSlug}/${data.municipioSlug}`,
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'Subastas', item: `${SITE}/subastas` },
      {
        '@type': 'ListItem',
        position: 3,
        name: data.provinceLabel,
        item: `${SITE}/subastas/${data.provinceSlug}`,
      },
      {
        '@type': 'ListItem',
        position: 4,
        name: muniLabel,
        item: `${SITE}/subastas/${data.provinceSlug}/${data.municipioSlug}`,
      },
    ],
  };

  const introSlot = (
    <>
      <Breadcrumbs
        items={[
          { label: t('breadcrumbHome'), href: '/' },
          { label: t('breadcrumbSubastas'), href: '/subastas' },
          { label: data.provinceLabel, href: `/subastas/${data.provinceSlug}` },
          { label: muniLabel, href: `/subastas/${data.provinceSlug}/${data.municipioSlug}` },
        ]}
      />
      <SeoIntroBlock
        count={data.count}
        noun={t('publicAuctionsNoun')}
        location={`${muniLabel} (${data.provinceLabel})`}
        minPrice={data.minPrice}
        guideHref="/guia/como-funcionan-las-subastas-boe"
        guideLabel={t('boeGuideLabel')}
      />
    </>
  );

  const footerSlot = (
    <>
      {/* Back-to-province CTA — single prominent link to the parent province
          page (full inventory). This is the primary back-link the brief asks
          for ("Ver todas las subastas en {Provincia}"). */}
      <section className="mt-2">
        <Link
          href={`/subastas/${data.provinceSlug}`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[var(--color-border)] text-sm font-medium hover:bg-[var(--color-surface-muted)]"
        >
          <span>{t('viewAllInProvince', { province: data.provinceLabel })}</span>
          <span className="text-[var(--color-text-muted)] tnum">
            ({data.provinceTotal.toLocaleString('es-ES')})
          </span>
        </Link>
      </section>

      {/* Sibling-municipality cluster — every OTHER active municipality in
          the same province, each linking to its own clean town URL. Drives
          the lateral crawl path between siblings (the SEO win). */}
      {data.siblings.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold mb-3">
            {t('otherMunicipalities', { province: data.provinceLabel })}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {data.siblings.map((m) => (
              <li key={m.municipioSlug}>
                <Link
                  href={`/subastas/${data.provinceSlug}/${m.municipioSlug}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-[var(--color-border)] text-xs hover:bg-[var(--color-surface-muted)]"
                >
                  <span>{capitalizeLocation(m.name)}</span>
                  <span className="text-[var(--color-text-muted)] tnum">
                    ({m.count.toLocaleString('es-ES')})
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Tipo cluster — mirrors the province page. Tipo pages are
          location-agnostic so this is the same set everywhere; it preserves
          the crawl path the brief calls out. */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold mb-3">{t('byTipoHeading')}</h2>
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

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
    </>
  );

  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--color-page)]" />}>
      <SubastasListClient
        lockedFilter={{
          province: data.provinceDbKey,
          municipality: data.municipalityName,
        }}
        // Single indexable H1, mirrors the brief: "Subastas en {Municipio}
        // ({Provincia})" — proper-cased via capitalizeLocation.
        seoTitle={t('townTitle', { town: muniLabel, province: data.provinceLabel })}
        seoIntroSlot={introSlot}
        seoFooterSlot={footerSlot}
        seoAuctionsSlot={auctions.node}
      />
    </Suspense>
  );
}
