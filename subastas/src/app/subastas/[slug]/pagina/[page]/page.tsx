/**
 * /subastas/[slug]/pagina/[page] — path-based pagination for the province AND
 * category hubs (P2, SEO crawl-path unlock 2026-07-31).
 *
 * robots.txt blocks `/*?`, so pagination MUST be path-based (not `?page=`).
 * Page 1 lives at the bare hub URL; this route serves pages >= 2. Each page is
 * self-canonical + index,follow (when in range with inventory) so Googlebot can
 * walk the whole hub down to every in-scope auction.
 *
 * Resolver + lockedFilter mirror ../page.tsx exactly (same disjoint province/
 * category slug sets). Deep pages render a lean body: breadcrumb + H1 + the SSR
 * crawlable auction grid + pagination — the page-1 footer link clusters stay on
 * page 1 only.
 */

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getLocale, getTranslations } from 'next-intl/server';
import { buildAlternates, ogLocale } from '@/lib/seo/alternates';
import type { Locale } from '@/i18n/routing';
import {
  resolveSubastasSlug,
  isOfficialCategory,
  CATEGORY_INDEX_THRESHOLD,
} from '@/lib/seo/slugs';
import { countActiveAuctions, findScopedAuctionsPage } from '@/lib/seo/page-data';
import { Breadcrumbs } from '@/components/seo/Breadcrumbs';
import SubastasListClient from '../../../SubastasListClient';
import { seoAuctionsNode } from '../../../_shared/seo-auctions';

type PageProps = { params: Promise<{ slug: string; page: string }> };

/** Strict positive-int parse; returns null for anything non-canonical. */
function parsePage(raw: string): number | null {
  if (!/^[1-9][0-9]*$/.test(raw)) return null;
  return Number.parseInt(raw, 10);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, page } = await params;
  const t = await getTranslations('listTemplates');
  const r = resolveSubastasSlug(slug);
  if (r.kind === 'reserved' || r.kind === 'invalid' || r.kind === 'redirect') {
    return { title: t('notFoundTitle') };
  }
  const n = parsePage(page);
  const locale = (await getLocale()) as Locale;
  const nf = locale === 'en' ? 'en-US' : 'es-ES';
  const suffix = n ? t('pageSuffix', { page: n }) : '';
  const canonical = `/subastas/${slug}/pagina/${page}`;

  if (r.kind === 'category') {
    const plural = t(`categoryLabel.${r.slug}`);
    const count = await countActiveAuctions({ category: r.dbLabel });
    const data = n ? await findScopedAuctionsPage({ category: r.dbLabel, page: n }) : null;
    const inRange = !!(n && n >= 2 && data && n <= data.totalPages);
    const indexable = inRange && isOfficialCategory(r.dbLabel) && count >= CATEGORY_INDEX_THRESHOLD;
    return {
      title: t('categoryMetaTitle', { count: count.toLocaleString(nf), plural }) + suffix,
      ...buildAlternates(canonical, locale),
      openGraph: { locale: ogLocale(locale) },
      robots: indexable ? 'index,follow' : 'noindex,follow',
    };
  }

  // province
  const count = await countActiveAuctions({ province: r.dbKey });
  const data = n ? await findScopedAuctionsPage({ province: r.dbKey, page: n }) : null;
  const inRange = !!(n && n >= 2 && data && n <= data.totalPages);
  return {
    title: t('provinceMetaTitle', { count: count.toLocaleString(nf), province: r.label }) + suffix,
    ...buildAlternates(canonical, locale),
    openGraph: { locale: ogLocale(locale) },
    robots: inRange && count > 0 ? 'index,follow' : 'noindex,follow',
  };
}

export default async function SubastasSlugPaginaPage({ params }: PageProps) {
  const { slug, page } = await params;
  const r = resolveSubastasSlug(slug);
  if (r.kind === 'reserved' || r.kind === 'invalid') notFound();
  if (r.kind === 'redirect') redirect(r.to);
  const n = parsePage(page);
  // Page 1 has a single canonical home (the bare hub URL) — never /pagina/1.
  if (n === null) notFound();
  if (n === 1) redirect(`/subastas/${slug}`);

  const t = await getTranslations('listTemplates');

  if (r.kind === 'category') {
    const plural = t(`categoryLabel.${r.slug}`);
    const data = await findScopedAuctionsPage({ category: r.dbLabel, page: n });
    if (n > data.totalPages) notFound();
    const node = await seoAuctionsNode(data, `/subastas/${slug}`, plural);
    return (
      <Suspense fallback={<div className="min-h-screen bg-[var(--color-page)]" />}>
        <SubastasListClient
          lockedFilter={{ category: r.dbLabel }}
          seoTitle={t('categoryTitle', { plural }) + t('pageSuffix', { page: n })}
          seoIntroSlot={
            <Breadcrumbs
              items={[
                { label: t('breadcrumbHome'), href: '/' },
                { label: t('breadcrumbSubastas'), href: '/subastas' },
                { label: t('categoryTitle', { plural }), href: `/subastas/${slug}` },
              ]}
            />
          }
          seoAuctionsSlot={node}
        />
      </Suspense>
    );
  }

  // province
  const data = await findScopedAuctionsPage({ province: r.dbKey, page: n });
  if (n > data.totalPages) notFound();
  const node = await seoAuctionsNode(data, `/subastas/${slug}`, r.label);
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--color-page)]" />}>
      <SubastasListClient
        lockedFilter={{ province: r.dbKey }}
        seoTitle={t('provinceTitle', { province: r.label }) + t('pageSuffix', { page: n })}
        seoIntroSlot={
          <Breadcrumbs
            items={[
              { label: t('breadcrumbHome'), href: '/' },
              { label: t('breadcrumbSubastas'), href: '/subastas' },
              { label: r.label, href: `/subastas/${slug}` },
            ]}
          />
        }
        seoAuctionsSlot={node}
      />
    </Suspense>
  );
}
