/**
 * /resultados — the auction-outcomes registry landing + stats overview.
 *
 * Public, indexable hub for CONCLUDED auctions classified by outcome. Double
 * duty (see the dispatch brief): (1) a genuinely useful filterable archive of
 * what happened to auctions; (2) the internal-link / crawl surface that
 * de-orphans the ~200k concluded detail pages (the region grid + archive rows
 * are real SSR <a href>s into those pages).
 *
 * SSR: headline stats, charts and the first archive page are all in the server
 * HTML (no CLS, crawlable). Filtering hydrates client-side; querystrings are
 * intentionally not the crawl path (robots disallows /*?) — the path-based
 * region pages are.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale } from 'next-intl/server';
import type { Locale as AppLocale } from '@/i18n/routing';
import { buildAlternates, ogLocale, SITE_ORIGIN } from '@/lib/seo/alternates';
import { PROVINCE_DB_KEY_TO_SLUG, TIPO_LABEL_PLURAL } from '@/lib/seo/slugs';
import { capitalizeLocation } from '@/lib/utils';
import { readSummary, readList } from '@/lib/registro/registro-read';
import {
  getResultadosCopy,
  pickArchiveCopy,
  buildOutcomeOptions,
  buildCategoryOptions,
  type Locale,
} from '@/lib/registro/registro-ui';
import { StatTiles } from '@/components/registro/StatTiles';
import { RegistroCharts } from '@/components/registro/RegistroCharts';
import { RegistryArchiveClient } from '@/components/registro/RegistryArchiveClient';
import { ProvinceResultGrid, OutcomeChips, ChipLinks } from '@/components/registro/RegistryNav';
import { readShelfRoots } from '@/lib/registro/archive-node-read';
import { archiveNodePath } from '@/lib/seo/archive-partitions';

const PATH = '/resultados';

export async function generateMetadata(): Promise<Metadata> {
  const locale = ((await getLocale()) as AppLocale) === 'en' ? 'en' : 'es';
  const copy = getResultadosCopy(locale as Locale);
  const summary = await readSummary({});
  const nfmt = summary.headline.registryTotal.toLocaleString(locale === 'en' ? 'en-US' : 'es-ES');
  return {
    title: `${copy.landingH1} | ${copy.brandSuffix}`,
    description: copy.landingLead(nfmt).slice(0, 158),
    ...buildAlternates(PATH, locale as AppLocale),
    openGraph: { locale: ogLocale(locale as AppLocale) },
    robots: 'index,follow',
  };
}

export default async function ResultadosPage() {
  const locale: Locale = ((await getLocale()) as AppLocale) === 'en' ? 'en' : 'es';
  const copy = getResultadosCopy(locale);

  const [summary, list, shelfRoots] = await Promise.all([
    readSummary({}),
    readList({ page: 1, pageSize: 24 }),
    readShelfRoots(),
  ]);

  const nfmt = summary.headline.registryTotal.toLocaleString(locale === 'en' ? 'en-US' : 'es-ES');

  const provinceOptions = summary.regions
    .filter((r) => PROVINCE_DB_KEY_TO_SLUG[r.province])
    .map((r) => ({ value: r.province, label: capitalizeLocation(r.province) }));

  const collectionLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: copy.landingH1,
    description: copy.landingLead(nfmt),
    url: `${SITE_ORIGIN}${PATH}`,
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: copy.crumbHome, item: `${SITE_ORIGIN}/` },
      { '@type': 'ListItem', position: 2, name: copy.crumbRegistry, item: `${SITE_ORIGIN}${PATH}` },
    ],
  };

  return (
    <main className="mx-auto max-w-editorial px-4 py-8 sm:px-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-3 text-xs text-[var(--color-ink-tertiary)]">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link href="/" className="hover:underline">
              {copy.crumbHome}
            </Link>
          </li>
          <li aria-hidden>›</li>
          <li aria-current="page" className="text-[var(--color-ink-primary)]">
            {copy.crumbRegistry}
          </li>
        </ol>
      </nav>

      {/* Hero */}
      <header className="mb-8 max-w-readable">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink-primary)] sm:text-3xl">
          {copy.landingH1}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-tertiary)]">{copy.landingLead(nfmt)}</p>
      </header>

      {/* Overview */}
      <section aria-labelledby="overview-h" className="mb-10">
        <h2 id="overview-h" className="sr-only">
          {copy.overviewHeading}
        </h2>
        <StatTiles summary={summary} locale={locale} copy={copy} />
        <div className="mt-6">
          <RegistroCharts summary={summary} locale={locale} copy={copy} />
        </div>
      </section>

      {/* Browse by outcome */}
      <section aria-labelledby="byoutcome-h" className="mb-10">
        <h2 id="byoutcome-h" className="mb-3 text-lg font-semibold text-[var(--color-ink-primary)]">
          {copy.byOutcomeHeading}
        </h2>
        <OutcomeChips counts={summary.headline.counts} locale={locale} />
      </section>

      {/* Filterable archive */}
      <section aria-labelledby="archive-h" className="mb-12">
        <h2 id="archive-h" className="mb-4 text-lg font-semibold text-[var(--color-ink-primary)]">
          {copy.archiveHeading}
        </h2>
        <RegistryArchiveClient
          initial={{ items: list.items, total: list.total, page: list.page, totalPages: list.totalPages }}
          locale={locale}
          copy={pickArchiveCopy(copy)}
          outcomeOptions={buildOutcomeOptions(locale)}
          categoryOptions={buildCategoryOptions()}
          provinceOptions={provinceOptions}
        />
      </section>

      {/* Results by province — the crawl grid */}
      <section aria-labelledby="byprov-h" className="mb-8">
        <h2 id="byprov-h" className="mb-4 text-lg font-semibold text-[var(--color-ink-primary)]">
          {copy.byProvinceHeading}
        </h2>
        <ProvinceResultGrid regions={summary.regions} locale={locale} concludedNoun={copy.concludedNoun} />
      </section>

      {/*
        ⛔ RELEASE GATE (Ken, 2026-08-13) — the LOCATION-FREE SHELF ROOTS.

        The province grid above is keyed on province, so it cannot reach a single
        row whose province we do not know. Those rows (949 measured on prod) live
        on `/resultados/{tipo}`, and that shelf hangs off `/resultados` and
        NOWHERE else — it has no other parent in the tree. Without these anchors
        every shelf node is a link orphan, which orphans precisely the rows the
        shelf was built for. That is why this block is a release gate and not a
        nicety, and why it is rendered from `readShelfRoots()` rather than a
        hardcoded list: the set is data-dependent (bounded by the 5 tipo slugs),
        so a hardcoded list would silently stop covering a tipo the corpus gains.

        ⚠️ These are unconditional, not switch-gated. A shelf root is a NEW URL
        with no legacy twin, so linking it cannot change any existing behaviour —
        and leaving it dark would ship the orphan this gate exists to prevent.
      */}
      {shelfRoots.length > 0 ? (
        <section aria-labelledby="byshelf-h" className="mb-8">
          <h2 id="byshelf-h" className="mb-4 text-lg font-semibold text-[var(--color-ink-primary)]">
            {copy.archiveHeading}
          </h2>
          <ChipLinks
            items={shelfRoots.map((s) => ({
              href: archiveNodePath({ tipo: s.tipo }),
              label: capitalizeLocation(TIPO_LABEL_PLURAL[s.tipo]),
              count: s.total,
            }))}
            locale={locale}
          />
        </section>
      ) : null}

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
    </main>
  );
}
