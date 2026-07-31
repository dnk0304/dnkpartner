/**
 * /subastas/pagina/[page] — path-based pagination for the ROOT /subastas hub
 * (P2, 2026-07-31). Serves pages >= 2; page 1 is the bare /subastas URL. The
 * static `pagina` segment wins routing precedence over the sibling `[slug]`
 * dynamic segment, so this never collides with province/category resolution.
 */

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getLocale, getTranslations } from 'next-intl/server';
import { buildAlternates, ogLocale } from '@/lib/seo/alternates';
import type { Locale } from '@/i18n/routing';
import { countActiveAuctions, findScopedAuctionsPage } from '@/lib/seo/page-data';
import { Breadcrumbs } from '@/components/seo/Breadcrumbs';
import SubastasListClient from '../../SubastasListClient';
import { seoAuctionsNode } from '../../_shared/seo-auctions';

type PageProps = { params: Promise<{ page: string }> };

function parsePage(raw: string): number | null {
  if (!/^[1-9][0-9]*$/.test(raw)) return null;
  return Number.parseInt(raw, 10);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { page } = await params;
  const tRoot = await getTranslations('subastasList');
  const t = await getTranslations('listTemplates');
  const locale = (await getLocale()) as Locale;
  const n = parsePage(page);
  const [count, data] = await Promise.all([
    countActiveAuctions({}),
    n ? findScopedAuctionsPage({ page: n }) : Promise.resolve(null),
  ]);
  const inRange = !!(n && n >= 2 && data && n <= data.totalPages);
  return {
    title: tRoot('metaTitle') + (n ? t('pageSuffix', { page: n }) : ''),
    description: tRoot('metaDescription'),
    ...buildAlternates(`/subastas/pagina/${page}`, locale),
    openGraph: { locale: ogLocale(locale) },
    robots: inRange && count > 0 ? 'index,follow' : 'noindex,follow',
  };
}

export default async function SubastasRootPaginaPage({ params }: PageProps) {
  const { page } = await params;
  const n = parsePage(page);
  if (n === null) notFound();
  if (n === 1) redirect('/subastas');

  const t = await getTranslations('listTemplates');
  const data = await findScopedAuctionsPage({ page: n });
  if (n > data.totalPages) notFound();
  const node = await seoAuctionsNode(data, '/subastas', t('spain'));

  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--color-page)]" />}>
      <SubastasListClient
        seoIntroSlot={
          <Breadcrumbs
            items={[
              { label: t('breadcrumbHome'), href: '/' },
              { label: t('breadcrumbSubastas'), href: '/subastas' },
            ]}
          />
        }
        seoAuctionsSlot={node}
      />
    </Suspense>
  );
}
