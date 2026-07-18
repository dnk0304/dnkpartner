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
import {
  PROVINCE_SLUG_TO_DB_KEY,
  PROVINCE_ALIAS_TO_CANONICAL,
  provinceLabelForSlug,
  slugify,
} from '@/lib/seo/slugs';
import { municipalitySlugToDbName } from '@/lib/seo/page-data';
import { capitalizeLocation } from '@/lib/utils';
import {
  readSummary,
  readList,
  readRegions,
  registroMunicipioSlugToDbName,
} from '@/lib/registro/registro-read';
import { resolveResultadosSeg } from '@/lib/registro/resultados-routing';
import {
  getResultadosCopy,
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

type PageProps = { params: Promise<{ seg1: string; seg2: string }> };

function toLocale(v: string): Locale {
  return v === 'en' ? 'en' : 'es';
}

type Shape =
  | { kind: 'outcome-province'; outcome: RegistryOutcome; outcomeSlug: string; provDbKey: string; provSlug: string; provLabel: string }
  | { kind: 'province-muni'; provDbKey: string; provSlug: string; provLabel: string; muniName: string; muniSlug: string; total: number }
  | { kind: 'redirect'; to: string }
  | { kind: 'notfound' };

async function resolveShape(seg1: string, seg2: string): Promise<Shape> {
  const r1 = resolveResultadosSeg(seg1);
  if (r1.kind === 'redirect') return { kind: 'redirect', to: `${r1.to}/${seg2}` };
  if (r1.kind === 'invalid') return { kind: 'notfound' };

  if (r1.kind === 'outcome') {
    // seg2 must be a province (canonical or alias)
    const dbKey = PROVINCE_SLUG_TO_DB_KEY[seg2];
    if (dbKey) {
      return {
        kind: 'outcome-province',
        outcome: r1.outcome,
        outcomeSlug: r1.slug,
        provDbKey: dbKey,
        provSlug: seg2,
        provLabel: provinceLabelForSlug(seg2) ?? dbKey,
      };
    }
    const canon = PROVINCE_ALIAS_TO_CANONICAL[seg2];
    if (canon) return { kind: 'redirect', to: `/resultados/${r1.slug}/${canon}` };
    return { kind: 'notfound' };
  }

  // r1 = province → seg2 = municipio
  const provDbKey = r1.dbKey;
  const inRegistry = await registroMunicipioSlugToDbName(provDbKey, seg2);
  if (inRegistry) {
    return {
      kind: 'province-muni',
      provDbKey,
      provSlug: r1.slug,
      provLabel: r1.label,
      muniName: inRegistry.municipalityName,
      muniSlug: inRegistry.municipioSlug,
      total: inRegistry.total,
    };
  }
  // Resolvable-but-empty town (any-status): still render, noindex.
  const fallback = await municipalitySlugToDbName(provDbKey, seg2);
  if (fallback) {
    return {
      kind: 'province-muni',
      provDbKey,
      provSlug: r1.slug,
      provLabel: r1.label,
      muniName: fallback,
      muniSlug: seg2,
      total: 0,
    };
  }
  return { kind: 'notfound' };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { seg1, seg2 } = await params;
  const shape = await resolveShape(seg1, seg2);
  const locale = toLocale((await getLocale()) as AppLocale);
  const copy = getResultadosCopy(locale);
  const nf = (n: number) => n.toLocaleString(locale === 'en' ? 'en-US' : 'es-ES');
  if (shape.kind === 'notfound' || shape.kind === 'redirect') return { title: copy.brandSuffix };

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
  const shape = await resolveShape(seg1, seg2);
  if (shape.kind === 'notfound') notFound();
  if (shape.kind === 'redirect') redirect(shape.to);

  const locale = toLocale((await getLocale()) as AppLocale);
  const copy = getResultadosCopy(locale);
  const nf = (n: number) => n.toLocaleString(locale === 'en' ? 'en-US' : 'es-ES');

  // -------- outcome × province --------
  if (shape.kind === 'outcome-province') {
    const [summary, list] = await Promise.all([
      readSummary({ province: shape.provDbKey }),
      readList({ outcome: shape.outcome, province: shape.provDbKey, page: 1, pageSize: 24 }),
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
            copy={copy}
            outcomeOptions={buildOutcomeOptions(locale)}
            categoryOptions={buildCategoryOptions()}
            provinceOptions={[]}
            lockedOutcome={shape.outcome}
            lockedProvince={shape.provDbKey}
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
    readList({ province: shape.provDbKey, municipio: shape.muniName, page: 1, pageSize: 24 }),
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
          copy={copy}
          outcomeOptions={buildOutcomeOptions(locale)}
          categoryOptions={buildCategoryOptions()}
          provinceOptions={[]}
          lockedProvince={shape.provDbKey}
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
