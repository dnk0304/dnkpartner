/**
 * /resultados/{seg1}/{seg2} — two shapes, disambiguated by seg1:
 *   • seg1 = outcome  → /resultados/{outcome}/{provincia}  (outcome-in-province,
 *                        strong long-tail: "subastas adjudicadas en Madrid")
 *   • seg1 = province → /resultados/{provincia}/{municipio} (town archive, the
 *                        deepest crawl node — rows link straight to detail pages)
 *
 * Count-gated index,follow; empty but resolvable region → noindex,follow, 200.
 * All archive rows are real SSR <a href>s into concluded detail pages.
 */

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getLocale } from 'next-intl/server';
import type { Locale as AppLocale } from '@/i18n/routing';
import { buildAlternates, ogLocale, SITE_ORIGIN } from '@/lib/seo/alternates';
import { slugify } from '@/lib/seo/slugs';
import { capitalizeLocation } from '@/lib/utils';
import { readSummary, readList, readRegions } from '@/lib/registro/registro-read';
import { resolveResultadosChild } from '../../_shared/resolve-child';
import { ARCHIVE_PAGE_SIZE } from '../../_shared/archive-page';
import { SeoPagination } from '@/components/seo/SeoPagination';
import {
  getResultadosCopy,
  pickArchiveCopy,
  buildOutcomeOptions,
  buildCategoryOptions,
  OUTCOME_META,
  type Locale,
  type OutcomeCounts,
  type RegistryOutcome,
} from '@/lib/registro/registro-ui';
import { RegistryArchiveClient } from '@/components/registro/RegistryArchiveClient';
import {
  OutcomeChips,
  ChipLinks,
  RegistryBreadcrumb,
  RegistryBackLink,
} from '@/components/registro/RegistryNav';
import { ArchiveNodeView, archiveNodeMetadata } from '../../_shared/archive-node-view';

type PageProps = { params: Promise<{ seg1: string; seg2: string }> };

function toLocale(v: string): Locale {
  return v === 'en' ? 'en' : 'es';
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { seg1, seg2 } = await params;
  const shape = await resolveResultadosChild(seg1, seg2);
  const locale = toLocale((await getLocale()) as AppLocale);
  const copy = getResultadosCopy(locale);
  const nf = (n: number) => n.toLocaleString(locale === 'en' ? 'en-US' : 'es-ES');
  if (shape.kind === 'notfound') return archiveNodeMetadata([seg1, seg2]);
  if (shape.kind === 'redirect') return { title: copy.brandSuffix };

  if (shape.kind === 'outcome-province') {
    const summary = await readSummary({ province: shape.provDbKey });
    const count = summary.headline.counts[shape.outcome];
    const label = locale === 'en' ? OUTCOME_META[shape.outcome].en : OUTCOME_META[shape.outcome].es;
    const h1 = copy.outcomeRegionH1(label.toLowerCase(), shape.provLabel);
    return {
      title: `${h1} | ${copy.brandSuffix}`,
      description: copy.regionLead(nf(count), shape.provLabel).slice(0, 158),
      ...buildAlternates(`/resultados/${shape.outcomeSlug}/${shape.provSlug}`, locale as AppLocale),
      openGraph: { locale: ogLocale(locale as AppLocale) },
      robots: count > 0 ? 'index,follow' : 'noindex,follow',
    };
  }

  // province-muni
  const region = `${capitalizeLocation(shape.muniName)} (${shape.provLabel})`;
  return {
    title: `${copy.regionH1(region)} | ${copy.brandSuffix}`,
    description: copy.regionLead(nf(shape.total), region).slice(0, 158),
    ...buildAlternates(`/resultados/${shape.provSlug}/${shape.muniSlug}`, locale as AppLocale),
    openGraph: { locale: ogLocale(locale as AppLocale) },
    robots: shape.total > 0 ? 'index,follow' : 'noindex,follow',
  };
}

export default async function ResultadosChildPage({ params }: PageProps) {
  const { seg1, seg2 } = await params;
  const shape = await resolveResultadosChild(seg1, seg2);
  // v4 fallback. The shipped resolver owns every 2-segment shape that serves a
  // 200 TODAY (outcome×province, province×town) and those are untouched; the
  // only URLs that reach here are ones that currently 404 — `{prov}/{tipo}`,
  // `{prov}/{outcome}` (the reversed facet) and the location-free shelf's
  // `{tipo}/{año}`. So this widens nothing a user or Googlebot can observe as a
  // change of behaviour, which is exactly the bar Ken set for the dark switch.
  if (shape.kind === 'notfound') return <ArchiveNodeView segs={[seg1, seg2]} />;
  if (shape.kind === 'redirect') redirect(shape.to);

  const locale = toLocale((await getLocale()) as AppLocale);
  const copy = getResultadosCopy(locale);
  const nf = (n: number) => n.toLocaleString(locale === 'en' ? 'en-US' : 'es-ES');

  // -------- outcome × province --------
  if (shape.kind === 'outcome-province') {
    const [summary, list] = await Promise.all([
      readSummary({ province: shape.provDbKey }),
      readList({ outcome: shape.outcome, province: shape.provDbKey, page: 1, pageSize: ARCHIVE_PAGE_SIZE }),
    ]);
    const label = locale === 'en' ? OUTCOME_META[shape.outcome].en : OUTCOME_META[shape.outcome].es;
    const blurb = locale === 'en' ? OUTCOME_META[shape.outcome].blurbEn : OUTCOME_META[shape.outcome].blurbEs;
    const h1 = copy.outcomeRegionH1(label.toLowerCase(), shape.provLabel);
    const count = summary.headline.counts[shape.outcome];

    const breadcrumbLd = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: copy.crumbHome, item: `${SITE_ORIGIN}/` },
        { '@type': 'ListItem', position: 2, name: copy.crumbRegistry, item: `${SITE_ORIGIN}/resultados` },
        { '@type': 'ListItem', position: 3, name: label, item: `${SITE_ORIGIN}/resultados/${shape.outcomeSlug}` },
        { '@type': 'ListItem', position: 4, name: shape.provLabel, item: `${SITE_ORIGIN}/resultados/${shape.outcomeSlug}/${shape.provSlug}` },
      ],
    };

    return (
      <main className="mx-auto max-w-editorial px-4 py-8 sm:px-6">
        <RegistryBreadcrumb
          homeLabel={copy.crumbHome}
          registryLabel={copy.crumbRegistry}
          trail={[
            { label, href: `/resultados/${shape.outcomeSlug}` },
            { label: shape.provLabel },
          ]}
        />
        <header className="mb-8 max-w-readable">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink-primary)] sm:text-3xl">{h1}</h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-tertiary)]">
            {copy.regionLead(nf(count), shape.provLabel)} {blurb}
          </p>
        </header>

        <section className="mb-10">
          <RegistryArchiveClient
            initial={{ items: list.items, total: list.total, page: list.page, totalPages: list.totalPages }}
            locale={locale}
            copy={pickArchiveCopy(copy)}
            outcomeOptions={buildOutcomeOptions(locale)}
            categoryOptions={buildCategoryOptions()}
            provinceOptions={[]}
            lockedOutcome={shape.outcome}
            lockedProvince={shape.provDbKey}
          />
          {/* Path-based crawl path into page 2+. The island's "load more"
              fetches a querystring URL that robots.txt disallows, so without
              this every row past 24 is link-orphaned. */}
          <SeoPagination
            basePath={`/resultados/${shape.outcomeSlug}/${shape.provSlug}`}
            page={list.page}
            totalPages={list.totalPages}
            ariaLabel={copy.pagLabel}
            prevLabel={copy.pagPrev}
            nextLabel={copy.pagNext}
          />
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-[var(--color-ink-primary)]">{copy.byOutcomeHeading}</h2>
          <OutcomeChips counts={summary.headline.counts} locale={locale} provinceSlug={shape.provSlug} />
        </section>

        <div className="mt-2">
          <Link href={`/resultados/${shape.provSlug}`} className="text-sm font-medium text-[var(--color-action)] hover:underline">
            {copy.viewProvinceResults(shape.provLabel)} →
          </Link>
        </div>

        <RegistryBackLink label={copy.backToRegistry} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      </main>
    );
  }

  // -------- province × municipio --------
  const [{ regions }, list] = await Promise.all([
    readRegions({ province: shape.provDbKey }),
    readList({ province: shape.provDbKey, municipio: shape.muniName, page: 1, pageSize: ARCHIVE_PAGE_SIZE }),
  ]);
  const muniLabel = capitalizeLocation(shape.muniName);
  const region = `${muniLabel} (${shape.provLabel})`;
  const counts: OutcomeCounts =
    regions.find((x) => x.label === shape.muniName)?.counts ??
    { VENDIDA: 0, DESIERTA: 0, CANCELADA: 0, FINALIZADA_SIN_RESULTADO: 0, INDETERMINADO: 0 };

  // Sibling municipios in the same province (lateral crawl path).
  const siblings = regions
    .filter((x) => x.label !== shape.muniName && x.label)
    .slice(0, 40)
    .map((x) => ({
      href: `/resultados/${shape.provSlug}/${slugify(x.label)}`,
      label: capitalizeLocation(x.label),
      count: x.total,
    }));

  const collectionLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: copy.regionH1(region),
    description: copy.regionLead(nf(shape.total), region),
    url: `${SITE_ORIGIN}/resultados/${shape.provSlug}/${shape.muniSlug}`,
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: copy.crumbHome, item: `${SITE_ORIGIN}/` },
      { '@type': 'ListItem', position: 2, name: copy.crumbRegistry, item: `${SITE_ORIGIN}/resultados` },
      { '@type': 'ListItem', position: 3, name: shape.provLabel, item: `${SITE_ORIGIN}/resultados/${shape.provSlug}` },
      { '@type': 'ListItem', position: 4, name: muniLabel, item: `${SITE_ORIGIN}/resultados/${shape.provSlug}/${shape.muniSlug}` },
    ],
  };

  return (
    <main className="mx-auto max-w-editorial px-4 py-8 sm:px-6">
      <RegistryBreadcrumb
        homeLabel={copy.crumbHome}
        registryLabel={copy.crumbRegistry}
        trail={[
          { label: shape.provLabel, href: `/resultados/${shape.provSlug}` },
          { label: muniLabel },
        ]}
      />
      <header className="mb-8 max-w-readable">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink-primary)] sm:text-3xl">
          {copy.regionH1(region)}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-tertiary)]">{copy.regionLead(nf(shape.total), region)}</p>
      </header>

      {shape.total > 0 ? (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-[var(--color-ink-primary)]">{copy.byOutcomeHeading}</h2>
          <OutcomeChips counts={counts} locale={locale} provinceSlug={shape.provSlug} />
        </section>
      ) : null}

      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold text-[var(--color-ink-primary)]">{copy.archiveHeading}</h2>
        <RegistryArchiveClient
          initial={{ items: list.items, total: list.total, page: list.page, totalPages: list.totalPages }}
          locale={locale}
          copy={pickArchiveCopy(copy)}
          outcomeOptions={buildOutcomeOptions(locale)}
          categoryOptions={buildCategoryOptions()}
          provinceOptions={[]}
          lockedProvince={shape.provDbKey}
        />
        <SeoPagination
          basePath={`/resultados/${shape.provSlug}/${shape.muniSlug}`}
          page={list.page}
          totalPages={list.totalPages}
          ariaLabel={copy.pagLabel}
          prevLabel={copy.pagPrev}
          nextLabel={copy.pagNext}
        />
      </section>

      <div className="mb-8">
        <Link
          href={`/resultados/${shape.provSlug}`}
          className="text-sm font-medium text-[var(--color-action)] hover:underline"
        >
          {copy.viewProvinceResults(shape.provLabel)} →
        </Link>
      </div>

      {siblings.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-[var(--color-ink-primary)]">{copy.townsHeading(shape.provLabel)}</h2>
          <ChipLinks items={siblings} locale={locale} />
        </section>
      ) : null}

      <RegistryBackLink label={copy.backToRegistry} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
    </main>
  );
}
