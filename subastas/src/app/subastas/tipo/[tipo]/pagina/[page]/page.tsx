/**
 * /subastas/tipo/[tipo]/pagina/[page] — path-based pagination for the auction-
 * type hub (P2, 2026-07-31). Serves pages >= 2; page 1 is the bare tipo URL.
 * Resolver mirrors ../page.tsx.
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
import { countActiveAuctions, findScopedAuctionsPage } from '@/lib/seo/page-data';
import { Breadcrumbs } from '@/components/seo/Breadcrumbs';
import { AuctionType } from '@/types';
import SubastasListClient from '../../../../SubastasListClient';
import { seoAuctionsNode } from '../../../../_shared/seo-auctions';

type PageProps = { params: Promise<{ tipo: string; page: string }> };

// Mirrors the map in ../page.tsx (kept local — small, stable).
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

function parsePage(raw: string): number | null {
  if (!/^[1-9][0-9]*$/.test(raw)) return null;
  return Number.parseInt(raw, 10);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { tipo, page } = await params;
  const t = await getTranslations('listTemplates');
  const r = asTipoSlug(tipo);
  if (!r || (typeof r === 'object' && 'redirectTo' in r)) return { title: t('tipoNotFoundTitle') };
  const slug = r as TipoSlug;
  const locale = (await getLocale()) as Locale;
  const nf = locale === 'en' ? 'en-US' : 'es-ES';
  const n = parsePage(page);
  const label = t(`tipoLabel.${slug}`);
  const keys = TIPO_SLUG_TO_DB_KEYS[slug];
  const [count, data] = await Promise.all([
    countActiveAuctions({ auctionTypeKeys: keys }),
    n ? findScopedAuctionsPage({ auctionTypeKeys: keys, page: n }) : Promise.resolve(null),
  ]);
  const inRange = !!(n && n >= 2 && data && n <= data.totalPages);
  return {
    title: t('tipoMetaTitle', { count: count.toLocaleString(nf), label }) + (n ? t('pageSuffix', { page: n }) : ''),
    ...buildAlternates(`/subastas/tipo/${tipo}/pagina/${page}`, locale),
    openGraph: { locale: ogLocale(locale) },
    robots: inRange && count > 0 ? 'index,follow' : 'noindex,follow',
  };
}

export default async function TipoPaginaPage({ params }: PageProps) {
  const { tipo, page } = await params;
  const r = asTipoSlug(tipo);
  if (!r) notFound();
  if (typeof r === 'object' && 'redirectTo' in r) redirect(`/subastas/tipo/${r.redirectTo}`);
  const slug = r as TipoSlug;
  const n = parsePage(page);
  if (n === null) notFound();
  if (n === 1) redirect(`/subastas/tipo/${tipo}`);

  const t = await getTranslations('listTemplates');
  const label = t(`tipoLabel.${slug}`);
  const data = await findScopedAuctionsPage({ auctionTypeKeys: TIPO_SLUG_TO_DB_KEYS[slug], page: n });
  if (n > data.totalPages) notFound();
  const node = await seoAuctionsNode(data, `/subastas/tipo/${tipo}`, label);

  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--color-page)]" />}>
      <SubastasListClient
        lockedFilter={{ type: TIPO_SLUG_TO_AUCTION_TYPE[slug] }}
        seoTitle={t('tipoTitle', { label }) + t('pageSuffix', { page: n })}
        seoIntroSlot={
          <Breadcrumbs
            items={[
              { label: t('breadcrumbHome'), href: '/' },
              { label: t('breadcrumbSubastas'), href: '/subastas' },
              { label: t('tipoBreadcrumb', { label }), href: `/subastas/tipo/${tipo}` },
            ]}
          />
        }
        seoAuctionsSlot={node}
      />
    </Suspense>
  );
}
