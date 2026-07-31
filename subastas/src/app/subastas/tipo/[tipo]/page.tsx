/**
 * /subastas/tipo/[tipo] — auction-type programmatic SEO page (5 pages).
 *
 * Always indexable (07 §6.1 — head keyword).
 *
 * Layout (2026-06-03): renders the shared SubastasListClient with
 * `lockedFilter.type` so users see the 2-col sidebar + card-row list,
 * pre-filtered for this BOE family. SEO H1, breadcrumb, intro block, JSON-LD,
 * canonical/robots metadata preserved server-side.
 */

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getLocale, getTranslations } from 'next-intl/server';
import { buildAlternates, ogLocale } from '@/lib/seo/alternates';
import type { Locale } from '@/i18n/routing';
import {
  TIPO_SLUG_TO_DB_KEYS,
  TIPO_ALIAS_TO_CANONICAL,
  type TipoSlug,
} from '@/lib/seo/slugs';
import { countActiveAuctions, minStartingPrice } from '@/lib/seo/page-data';
import { SeoIntroBlock } from '@/components/seo/SeoIntroBlock';
import { Breadcrumbs } from '@/components/seo/Breadcrumbs';
import { AuctionType } from '@/types';
import SubastasListClient from '../../SubastasListClient';
import { buildSeoAuctions } from '../../_shared/seo-auctions';

type PageProps = { params: Promise<{ tipo: string }> };

/**
 * Map the SEO TipoSlug to the canonical lowercase AuctionType the URL filter
 * layer uses (`filters.types[]` + `auctionTypes=` query param).
 *
 * DB UPPERCASE keys feed the prisma queries in page-data.ts; the API filter
 * layer normalises the lowercase ids. We mirror that mapping here so the
 * locked filter the client sees matches what the user sees in the URL chip.
 */
const TIPO_SLUG_TO_AUCTION_TYPE: Readonly<Record<TipoSlug, AuctionType>> = {
  judicial: 'judicial',
  hacienda: 'aeat',
  'otras-tributarias': 'otras_tributarias',
  notarial: 'notarial',
  administrativas: 'administrativas',
};

function asTipoSlug(slug: string): TipoSlug | { redirectTo: TipoSlug } | null {
  if (slug in TIPO_SLUG_TO_DB_KEYS) return slug as TipoSlug;
  const alias = TIPO_ALIAS_TO_CANONICAL[slug];
  if (alias) return { redirectTo: alias };
  return null;
}

async function loadTipo(slug: TipoSlug) {
  const keys = TIPO_SLUG_TO_DB_KEYS[slug];
  const [count, minPrice] = await Promise.all([
    countActiveAuctions({ auctionTypeKeys: keys }),
    minStartingPrice({ auctionTypeKeys: keys }),
  ]);
  return { count, minPrice };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { tipo } = await params;
  const r = asTipoSlug(tipo);
  const t = await getTranslations('listTemplates');
  if (!r || (typeof r === 'object' && 'redirectTo' in r)) return { title: t('tipoNotFoundTitle') };
  const locale = (await getLocale()) as Locale;
  const nf = locale === 'en' ? 'en-US' : 'es-ES';
  const { count } = await loadTipo(r);
  const label = t(`tipoLabel.${r}`);
  const title = t('tipoMetaTitle', { count: count.toLocaleString(nf), label });
  const description = t('tipoMetaDescription', { count: count.toLocaleString(nf), label }).slice(0, 158);
  return {
    title,
    description,
    // Self-canonical per locale + es/en/x-default hreflang (i18n Phase 1).
    ...buildAlternates(`/subastas/tipo/${tipo}`, locale),
    openGraph: { locale: ogLocale(locale) },
    robots: count > 0 ? 'index,follow' : 'noindex,follow',
  };
}

export default async function TipoPage({ params }: PageProps) {
  const { tipo } = await params;
  const r = asTipoSlug(tipo);
  if (!r) notFound();
  if (typeof r === 'object' && 'redirectTo' in r) redirect(`/subastas/tipo/${r.redirectTo}`);
  const slug = r as TipoSlug;
  const t = await getTranslations('listTemplates');
  const data = await loadTipo(slug);
  const { count, minPrice } = data;
  const label = t(`tipoLabel.${slug}`);
  const lockedAuctionType = TIPO_SLUG_TO_AUCTION_TYPE[slug];

  // SSR crawlable auction block (P1/P2) — page 1 for this tipo.
  const auctions = await buildSeoAuctions({
    filter: { auctionTypeKeys: TIPO_SLUG_TO_DB_KEYS[slug] },
    basePath: `/subastas/tipo/${tipo}`,
    locationLabel: label,
  });

  const introSlot = (
    <>
      <Breadcrumbs
        items={[
          { label: t('breadcrumbHome'), href: '/' },
          { label: t('breadcrumbSubastas'), href: '/subastas' },
          { label: t('tipoBreadcrumb', { label }), href: `/subastas/tipo/${tipo}` },
        ]}
      />
      <SeoIntroBlock
        count={count}
        noun={t('tipoNoun', { label })}
        location={t('spain')}
        minPrice={minPrice}
        guideHref={`/guia/subastas-${tipo}-como-funcionan`}
        guideLabel={t('tipoGuideLabel')}
      />
    </>
  );

  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--color-page)]" />}>
      <SubastasListClient
        lockedFilter={{ type: lockedAuctionType }}
        seoTitle={t('tipoTitle', { label })}
        seoIntroSlot={introSlot}
        seoAuctionsSlot={auctions.node}
      />
    </Suspense>
  );
}
