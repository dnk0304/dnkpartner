/**
 * /subastas/[slug]/[municipio]/pagina/[page] — path-based pagination for the
 * town (province + municipality) hub (P2, 2026-07-31). Serves pages >= 2; page
 * 1 is the bare town URL. Resolver mirrors ../page.tsx (province slug + town
 * slug → canonical DB municipality name). Lean deep-page body: breadcrumb + H1
 * + SSR crawlable auction grid + pagination.
 */

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getLocale, getTranslations } from 'next-intl/server';
import { buildAlternates, ogLocale } from '@/lib/seo/alternates';
import type { Locale } from '@/i18n/routing';
import { resolveSubastasSlug, RESERVED_SEGMENTS } from '@/lib/seo/slugs';
import {
  countActiveAuctions,
  findScopedAuctionsPage,
  municipalitySlugToDbName,
} from '@/lib/seo/page-data';
import { Breadcrumbs } from '@/components/seo/Breadcrumbs';
import { capitalizeLocation } from '@/lib/utils';
import SubastasListClient from '../../../../SubastasListClient';
import { seoAuctionsNode } from '../../../../_shared/seo-auctions';

type PageProps = { params: Promise<{ slug: string; municipio: string; page: string }> };

function parsePage(raw: string): number | null {
  if (!/^[1-9][0-9]*$/.test(raw)) return null;
  return Number.parseInt(raw, 10);
}

async function resolveTown(slug: string, municipio: string) {
  if (RESERVED_SEGMENTS.has(slug) || RESERVED_SEGMENTS.has(municipio)) return null;
  const r = resolveSubastasSlug(slug);
  if (r.kind !== 'province') return null;
  const municipalityName = await municipalitySlugToDbName(r.dbKey, municipio);
  if (!municipalityName) return null;
  return { provinceSlug: r.slug, dbKey: r.dbKey, provinceLabel: r.label, municipalityName };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, municipio, page } = await params;
  const t = await getTranslations('listTemplates');
  const town = await resolveTown(slug, municipio);
  if (!town) return { title: t('notFoundTitle') };
  const locale = (await getLocale()) as Locale;
  const nf = locale === 'en' ? 'en-US' : 'es-ES';
  const n = parsePage(page);
  const muniLabel = capitalizeLocation(town.municipalityName);
  const [count, data] = await Promise.all([
    countActiveAuctions({ province: town.dbKey, municipality: town.municipalityName }),
    n ? findScopedAuctionsPage({ province: town.dbKey, municipality: town.municipalityName, page: n }) : Promise.resolve(null),
  ]);
  const inRange = !!(n && n >= 2 && data && n <= data.totalPages);
  return {
    title:
      t('townMetaTitle', { count: count.toLocaleString(nf), town: muniLabel, province: town.provinceLabel }) +
      (n ? t('pageSuffix', { page: n }) : ''),
    ...buildAlternates(`/subastas/${slug}/${municipio}/pagina/${page}`, locale),
    openGraph: { locale: ogLocale(locale) },
    robots: inRange && count > 0 ? 'index,follow' : 'noindex,follow',
  };
}

export default async function TownPaginaPage({ params }: PageProps) {
  const { slug, municipio, page } = await params;
  const town = await resolveTown(slug, municipio);
  if (!town) notFound();
  const n = parsePage(page);
  if (n === null) notFound();
  if (n === 1) redirect(`/subastas/${slug}/${municipio}`);

  const t = await getTranslations('listTemplates');
  const muniLabel = capitalizeLocation(town.municipalityName);
  const data = await findScopedAuctionsPage({
    province: town.dbKey,
    municipality: town.municipalityName,
    page: n,
  });
  if (n > data.totalPages) notFound();
  const node = await seoAuctionsNode(
    data,
    `/subastas/${slug}/${municipio}`,
    `${muniLabel} (${town.provinceLabel})`,
  );

  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--color-page)]" />}>
      <SubastasListClient
        lockedFilter={{ province: town.dbKey, municipality: town.municipalityName }}
        seoTitle={t('townTitle', { town: muniLabel, province: town.provinceLabel }) + t('pageSuffix', { page: n })}
        seoIntroSlot={
          <Breadcrumbs
            items={[
              { label: t('breadcrumbHome'), href: '/' },
              { label: t('breadcrumbSubastas'), href: '/subastas' },
              { label: town.provinceLabel, href: `/subastas/${slug}` },
              { label: muniLabel, href: `/subastas/${slug}/${municipio}` },
            ]}
          />
        }
        seoAuctionsSlot={node}
      />
    </Suspense>
  );
}
