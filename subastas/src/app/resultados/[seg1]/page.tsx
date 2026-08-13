/**
 * /resultados/{seg1} — province results archive OR national outcome archive.
 *
 * seg1 resolves (resolveResultadosSeg) to an outcome slug (adjudicadas /
 * desiertas / …) or a province slug (madrid / …). Both render a count-gated,
 * indexable archive whose rows are real SSR <a href>s into the concluded
 * detail pages (the crawl-path fix). Empty region → noindex,follow, still 200.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import type { Locale as AppLocale } from '@/i18n/routing';
import { buildAlternates, ogLocale, SITE_ORIGIN } from '@/lib/seo/alternates';
import { PROVINCE_DB_KEY_TO_SLUG } from '@/lib/seo/slugs';
import { capitalizeLocation } from '@/lib/utils';
import { readSummary, readList, concludedMunicipioRegions, concludedProvinceRegions } from '@/lib/registro/registro-read';
import { resolveResultadosSeg } from '@/lib/registro/resultados-routing';
import { SeoPagination } from '@/components/seo/SeoPagination';
import { ARCHIVE_PAGE_SIZE } from '../_shared/archive-page';
// HUB_MUNI_PREVIEW is the SAME constant `/municipios` uses to decide whether it
// renders or redirects here, so the hub can never link a redirect nor orphan a
// live index page. MUNI_INDEX_PAGE_SIZE is the SAME constant that route pages
// by, so the "jump to index page N" row below can never advertise a 404.
import { MUNI_INDEX_PAGE_SIZE, HUB_MUNI_PREVIEW } from '@/lib/registro/archive-paging';
import {
  getResultadosCopy,
  pickArchiveCopy,
  buildOutcomeOptions,
  buildCategoryOptions,
  OUTCOME_META,
  type Locale,
} from '@/lib/registro/registro-ui';
import { StatTiles } from '@/components/registro/StatTiles';
import { RegistroCharts } from '@/components/registro/RegistroCharts';
import { RegistryArchiveClient } from '@/components/registro/RegistryArchiveClient';
import {
  ProvinceResultGrid,
  OutcomeChips,
  ChipLinks,
  RegistryBreadcrumb,
  RegistryBackLink,
} from '@/components/registro/RegistryNav';
import { ArchiveNodeView, archiveNodeMetadata } from '../_shared/archive-node-view';

type PageProps = { params: Promise<{ seg1: string }> };

function toLocale(v: string): Locale {
  return v === 'en' ? 'en' : 'es';
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { seg1 } = await params;
  const r = resolveResultadosSeg(seg1);
  const locale = toLocale((await getLocale()) as AppLocale);
  const copy = getResultadosCopy(locale);
  const nf = (n: number) => n.toLocaleString(locale === 'en' ? 'en-US' : 'es-ES');

  // Not an outcome and not a province → the LOCATION-FREE shelf root
  // /resultados/{tipo}. Ken's release gate: /resultados must link all of these,
  // because the province-less rows have no other parent in the tree.
  if (r.kind === 'invalid') return archiveNodeMetadata([seg1]);
  if (r.kind === 'redirect') return { title: copy.brandSuffix };

  if (r.kind === 'outcome') {
    const summary = await readSummary({});
    const count = summary.headline.counts[r.outcome];
    const label = locale === 'en' ? OUTCOME_META[r.outcome].en : OUTCOME_META[r.outcome].es;
    const h1 = copy.outcomeNationalH1(label.toLowerCase());
    return {
      title: `${h1} | ${copy.brandSuffix}`,
      description: copy.regionLead(nf(count), copy.landingH1).slice(0, 158),
      ...buildAlternates(`/resultados/${r.slug}`, locale as AppLocale),
      openGraph: { locale: ogLocale(locale as AppLocale) },
      robots: count > 0 ? 'index,follow' : 'noindex,follow',
    };
  }

  // province
  const summary = await readSummary({ province: r.dbKey });
  const count = summary.headline.registryTotal;
  return {
    title: `${copy.regionH1(r.label)} | ${copy.brandSuffix}`,
    description: copy.regionLead(nf(count), r.label).slice(0, 158),
    ...buildAlternates(`/resultados/${r.slug}`, locale as AppLocale),
    openGraph: { locale: ogLocale(locale as AppLocale) },
    robots: count > 0 ? 'index,follow' : 'noindex,follow',
  };
}

export default async function ResultadosSegPage({ params }: PageProps) {
  const { seg1 } = await params;
  const r = resolveResultadosSeg(seg1);
  if (r.kind === 'invalid') return <ArchiveNodeView segs={[seg1]} />;
  if (r.kind === 'redirect') redirect(r.to);

  const locale = toLocale((await getLocale()) as AppLocale);
  const copy = getResultadosCopy(locale);

  // -------- National outcome archive --------
  if (r.kind === 'outcome') {
    const [summary, list] = await Promise.all([
      readSummary({}),
      readList({ outcome: r.outcome, page: 1, pageSize: ARCHIVE_PAGE_SIZE }),
    ]);
    const label = locale === 'en' ? OUTCOME_META[r.outcome].en : OUTCOME_META[r.outcome].es;
    const blurb = locale === 'en' ? OUTCOME_META[r.outcome].blurbEn : OUTCOME_META[r.outcome].blurbEs;
    const h1 = copy.outcomeNationalH1(label.toLowerCase());
    const count = summary.headline.counts[r.outcome];

    const breadcrumbLd = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: copy.crumbHome, item: `${SITE_ORIGIN}/` },
        { '@type': 'ListItem', position: 2, name: copy.crumbRegistry, item: `${SITE_ORIGIN}/resultados` },
        { '@type': 'ListItem', position: 3, name: label, item: `${SITE_ORIGIN}/resultados/${r.slug}` },
      ],
    };

    return (
      <main className="mx-auto max-w-editorial px-4 py-8 sm:px-6">
        <RegistryBreadcrumb homeLabel={copy.crumbHome} registryLabel={copy.crumbRegistry} trail={[{ label }]} />
        <header className="mb-8 max-w-readable">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink-primary)] sm:text-3xl">{h1}</h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-tertiary)]">
            {copy.regionLead(count.toLocaleString(locale === 'en' ? 'en-US' : 'es-ES'), copy.landingH1)} {blurb}
          </p>
        </header>

        <section className="mb-10">
          <RegistryArchiveClient
            initial={{ items: list.items, total: list.total, page: list.page, totalPages: list.totalPages }}
            locale={locale}
            copy={pickArchiveCopy(copy)}
            outcomeOptions={buildOutcomeOptions(locale)}
            categoryOptions={buildCategoryOptions()}
            provinceOptions={summary.regions
              .filter((x) => PROVINCE_DB_KEY_TO_SLUG[x.province] && x.counts[r.outcome] > 0)
              .map((x) => ({ value: x.province, label: capitalizeLocation(x.province) }))}
            lockedOutcome={r.outcome}
          />
          {/* Path-based crawl path into page 2+. The island's "load more"
              fetches a querystring URL that robots.txt disallows. */}
          <SeoPagination
            basePath={`/resultados/${r.slug}`}
            page={list.page}
            totalPages={list.totalPages}
            ariaLabel={copy.pagLabel}
            prevLabel={copy.pagPrev}
            nextLabel={copy.pagNext}
          />
        </section>

        <section className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-[var(--color-ink-primary)]">{copy.byProvinceHeading}</h2>
          <ProvinceResultGrid
            regions={summary.regions}
            locale={locale}
            concludedNoun={copy.concludedNoun}
            outcome={r.outcome}
            outcomeSlug={r.slug}
            outcomeNoun={label.toLowerCase()}
          />
        </section>

        <RegistryBackLink label={copy.backToRegistry} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      </main>
    );
  }

  // -------- Province archive --------
  const [summary, list, munis, provinces] = await Promise.all([
    readSummary({ province: r.dbKey }),
    readList({ province: r.dbKey, page: 1, pageSize: ARCHIVE_PAGE_SIZE }),
    concludedMunicipioRegions(r.dbKey),
    concludedProvinceRegions(),
  ]);
  const count = summary.headline.registryTotal;
  const nf = (n: number) => n.toLocaleString(locale === 'en' ? 'en-US' : 'es-ES');

  // The hub shows the highest-inventory towns inline (they earn a depth-3 link),
  // and hands the REST to the paginated municipality index. Before this, the
  // slice was the whole story and everything past rank 60 was link-orphaned:
  // 8,673 of 11,677 town archives, 50 of 52 provinces (measured on prod
  // 2026-08-12). Every index page is linked directly below, so no town is more
  // than one hop past this hub.
  const municipioLinks = munis.slice(0, HUB_MUNI_PREVIEW).map((m) => ({
    href: `/resultados/${r.slug}/${m.municipioSlug}`,
    label: capitalizeLocation(m.municipalityName),
    count: m.total,
  }));
  const muniIndexPages = Math.max(1, Math.ceil(munis.length / MUNI_INDEX_PAGE_SIZE));
  // Only worth a separate surface when the hub does not already show them all.
  const showMuniIndex = munis.length > HUB_MUNI_PREVIEW;
  const otherProvinceLinks = provinces
    .filter((p) => p.provinceDbKey !== r.dbKey)
    .slice(0, 24)
    .map((p) => ({
      href: `/resultados/${p.provinceSlug}`,
      label: capitalizeLocation(p.provinceDbKey),
      count: p.total,
    }));

  const collectionLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: copy.regionH1(r.label),
    description: copy.regionLead(nf(count), r.label),
    url: `${SITE_ORIGIN}/resultados/${r.slug}`,
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: copy.crumbHome, item: `${SITE_ORIGIN}/` },
      { '@type': 'ListItem', position: 2, name: copy.crumbRegistry, item: `${SITE_ORIGIN}/resultados` },
      { '@type': 'ListItem', position: 3, name: r.label, item: `${SITE_ORIGIN}/resultados/${r.slug}` },
    ],
  };

  return (
    <main className="mx-auto max-w-editorial px-4 py-8 sm:px-6">
      <RegistryBreadcrumb homeLabel={copy.crumbHome} registryLabel={copy.crumbRegistry} trail={[{ label: r.label }]} />
      <header className="mb-8 max-w-readable">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink-primary)] sm:text-3xl">
          {copy.regionH1(r.label)}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-tertiary)]">{copy.regionLead(nf(count), r.label)}</p>
      </header>

      {count > 0 ? (
        <section className="mb-10">
          <StatTiles summary={summary} locale={locale} copy={copy} />
          <div className="mt-6">
            <RegistroCharts summary={summary} locale={locale} copy={copy} />
          </div>
        </section>
      ) : null}

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-[var(--color-ink-primary)]">{copy.byOutcomeHeading}</h2>
        <OutcomeChips counts={summary.headline.counts} locale={locale} provinceSlug={r.slug} />
      </section>

      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold text-[var(--color-ink-primary)]">{copy.archiveHeading}</h2>
        <RegistryArchiveClient
          initial={{ items: list.items, total: list.total, page: list.page, totalPages: list.totalPages }}
          locale={locale}
          copy={pickArchiveCopy(copy)}
          outcomeOptions={buildOutcomeOptions(locale)}
          categoryOptions={buildCategoryOptions()}
          provinceOptions={[]}
          lockedProvince={r.dbKey}
        />
        <SeoPagination
          basePath={`/resultados/${r.slug}`}
          page={list.page}
          totalPages={list.totalPages}
          ariaLabel={copy.pagLabel}
          prevLabel={copy.pagPrev}
          nextLabel={copy.pagNext}
        />
      </section>

      {municipioLinks.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-[var(--color-ink-primary)]">{copy.townsHeading(r.label)}</h2>
          <ChipLinks items={municipioLinks} locale={locale} />

          {/* The de-orphaning link. Page 1 gets a prose affordance; every FURTHER
              index page is linked too, so the deepest town archive sits at click
              depth 4 (/ → /resultados → hub → index page N → town) instead of
              being buried behind a prev/next chain. At MUNI_INDEX_PAGE_SIZE=200
              this is at most 5 anchors (Barcelona, 839 municipios). */}
          {showMuniIndex ? (
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
              <Link
                href={`/resultados/${r.slug}/municipios`}
                className="font-medium text-[var(--color-action)] hover:underline"
              >
                {copy.muniIndexLink(nf(munis.length))} →
              </Link>
              {muniIndexPages > 1 ? (
                <nav aria-label={copy.muniIndexPagesLabel} className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[var(--color-ink-quiet)]">{copy.page}</span>
                  {Array.from({ length: muniIndexPages }, (_, i) => i + 1).map((n) => (
                    <Link
                      key={n}
                      href={n === 1 ? `/resultados/${r.slug}/municipios` : `/resultados/${r.slug}/municipios/pagina/${n}`}
                      className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-[var(--color-hairline)] px-2 text-xs hover:bg-[var(--color-surface-muted)]"
                    >
                      {n}
                    </Link>
                  ))}
                </nav>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {otherProvinceLinks.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-[var(--color-ink-primary)]">{copy.otherProvincesHeading}</h2>
          <ChipLinks items={otherProvinceLinks} locale={locale} />
        </section>
      ) : null}

      <RegistryBackLink label={copy.backToRegistry} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
    </main>
  );
}
