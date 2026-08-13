/**
 * /resultados/{seg1}/{seg2}/pagina/{n} — deep pages of the two-segment archive
 * (Forge, 2026-08-12). Serves n >= 2; n = 1 redirects to the bare hub.
 *
 * Covers BOTH shapes `[seg1]/[seg2]` resolves, via the SAME resolver
 * (`resolveResultadosChild`) the hub uses:
 *   • /resultados/{outcome}/{provincia}/pagina/{n}
 *   • /resultados/{provincia}/{municipio}/pagina/{n}   ← the deep archive node
 *
 * Mirrors the shipped /subastas pagination precedent exactly (verified live on
 * /subastas/madrid/pagina/2): index,follow when in range and non-empty,
 * self-canonical to the paginated URL, pagina/1 → redirect to the hub,
 * out-of-range → 404. See `_shared/archive-page.tsx` for why this is the
 * prerequisite for widening the sitemap to the full concluded archive.
 */

import type { Metadata } from 'next';
import { notFound, redirect, permanentRedirect } from 'next/navigation';
import { isUrlV4SwitchOn } from '@/lib/seo/url-v4-switch';
import { archivePagePath, type ArchiveNode } from '@/lib/seo/archive-partitions';
import { legacyArchivePageTarget } from '@/lib/registro/archive-legacy-target';
import { getLocale } from 'next-intl/server';
import type { Locale as AppLocale } from '@/i18n/routing';
import { buildAlternates, ogLocale, SITE_ORIGIN } from '@/lib/seo/alternates';
import { capitalizeLocation } from '@/lib/utils';
import { readList } from '@/lib/registro/registro-read';
import {
  getResultadosCopy,
  OUTCOME_META,
  type Locale,
} from '@/lib/registro/registro-ui';
import { RegistryBreadcrumb, RegistryBackLink } from '@/components/registro/RegistryNav';
import { resolveResultadosChild, type ResultadosChildShape } from '../../../../_shared/resolve-child';
import { ArchivePageBody, ARCHIVE_PAGE_SIZE, parseArchivePage } from '../../../../_shared/archive-page';
import { ArchiveNodeView, archiveNodeMetadata, archivePageParam } from '../../../../_shared/archive-node-view';

type PageProps = { params: Promise<{ seg1: string; seg2: string; page: string }> };

function toLocale(v: string): Locale {
  return v === 'en' ? 'en' : 'es';
}

/** The hub URL this page paginates — the base for canonical + prev/next. */
function basePathFor(shape: ResultadosChildShape): string {
  if (shape.kind === 'outcome-province') return `/resultados/${shape.outcomeSlug}/${shape.provSlug}`;
  if (shape.kind === 'province-muni') return `/resultados/${shape.provSlug}/${shape.muniSlug}`;
  return '/resultados';
}

/** One read serving both shapes — the page's rows AND its range guard. */
function readFor(shape: ResultadosChildShape, page: number) {
  if (shape.kind === 'outcome-province') {
    return readList({
      outcome: shape.outcome,
      province: shape.provDbKey,
      page,
      pageSize: ARCHIVE_PAGE_SIZE,
    });
  }
  if (shape.kind === 'province-muni') {
    return readList({
      province: shape.provDbKey,
      municipio: shape.muniName,
      page,
      pageSize: ARCHIVE_PAGE_SIZE,
    });
  }
  return null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { seg1, seg2, page } = await params;
  const locale = toLocale((await getLocale()) as AppLocale);
  const copy = getResultadosCopy(locale);
  const shape = await resolveResultadosChild(seg1, seg2);
  if (shape.kind === 'notfound') {
    const n = Number.parseInt(page, 10);
    return archiveNodeMetadata([seg1, seg2], Number.isFinite(n) ? n : 1);
  }
  if (shape.kind === 'redirect') return { title: copy.brandSuffix };

  // v4 (P2). The outcome×province page MOVES, so its metadata is never used —
  // the body 301s. The town archive is a ladder node and keeps serving, so it
  // takes the node's metadata (v4 page count, self-canonical, index,follow).
  if (isUrlV4SwitchOn()) {
    if (shape.kind === 'outcome-province') return { title: copy.brandSuffix };
    const n4 = parseArchivePage(page);
    return archiveNodeMetadata([shape.provSlug, shape.muniSlug], n4 ?? 1);
  }

  const n = parseArchivePage(page);
  const nf = (x: number) => x.toLocaleString(locale === 'en' ? 'en-US' : 'es-ES');
  const read = n ? readFor(shape, n) : null;
  const list = read ? await read : null;
  // In range == a page that actually holds rows. Out-of-range is a 404 in the
  // body; the noindex here only covers the window where metadata is generated
  // for a page the body will refuse.
  const inRange = !!(n && n >= 2 && list && n <= list.totalPages && list.total > 0);

  const region =
    shape.kind === 'outcome-province'
      ? shape.provLabel
      : `${capitalizeLocation(shape.muniName)} (${shape.provLabel})`;
  const h1 =
    shape.kind === 'outcome-province'
      ? copy.outcomeRegionH1(
          (locale === 'en' ? OUTCOME_META[shape.outcome].en : OUTCOME_META[shape.outcome].es).toLowerCase(),
          shape.provLabel,
        )
      : copy.regionH1(region);
  const total = list?.total ?? 0;

  return {
    title: `${h1}${n ? copy.pageSuffix(n) : ''} | ${copy.brandSuffix}`,
    description: copy.regionLead(nf(total), region).slice(0, 158),
    // Self-canonical to the PAGINATED url — matches the /subastas precedent.
    // Canonicalising a deep page back to the hub is what un-indexes the very
    // rows this route exists to expose.
    ...buildAlternates(`${basePathFor(shape)}/pagina/${page}`, locale as AppLocale),
    openGraph: { locale: ogLocale(locale as AppLocale) },
    robots: inRange ? 'index,follow' : 'noindex,follow',
  };
}

export default async function ResultadosChildPaginaPage({ params }: PageProps) {
  const { seg1, seg2, page } = await params;
  const shape = await resolveResultadosChild(seg1, seg2);
  // v4 fallback — see the sibling hub route. Only ex-404 URLs reach here.
  if (shape.kind === 'notfound') {
    const segs = [seg1, seg2];
    return <ArchiveNodeView segs={segs} page={archivePageParam(segs, page)} />;
  }
  if (shape.kind === 'redirect') redirect(`${shape.to}/pagina/${page}`);

  const n = parseArchivePage(page);
  if (n === null) notFound();

  const basePath = basePathFor(shape);
  if (n === 1) redirect(basePath);

  // ---- v4 (P2) — the two-segment deep pages ------------------------------
  //
  // Two different jobs share this file, and they differ in whether the URL moves:
  //
  //  • outcome×province — the SEGMENTS REVERSE, so every one of these URLs is
  //    retired and 301s. In range it lands on the same page number of the v4
  //    facet; past the facet's 10-page cap it lands on the facet hub, which is
  //    the nearest meaningful ancestor (an outcome facet is a filtered VIEW and
  //    has no ladder to descend — see `isTerminalFacet`).
  //  • province×municipio — the URL is IDENTICAL in both grammars, so it serves
  //    as the v4 town node and only the past-the-cap pages redirect, onto the
  //    partition holding their rows.
  //
  // Both emit exactly ONE hop: every target above is a v4 URL that answers 200,
  // never another legacy shape this same file would rewrite again.
  if (isUrlV4SwitchOn()) {
    if (shape.kind === 'outcome-province') {
      const facet: ArchiveNode = { prov: shape.provSlug, outcome: shape.outcomeSlug };
      permanentRedirect(await legacyArchivePageTarget(facet, n));
    }
    const node: ArchiveNode = {
      prov: shape.provSlug,
      muni: shape.muniSlug,
      muniDbName: shape.muniName,
    };
    const target = await legacyArchivePageTarget(node, n);
    if (target !== archivePagePath(node, n)) permanentRedirect(target);
    return <ArchiveNodeView segs={[shape.provSlug, shape.muniSlug]} page={n} />;
  }

  const read = readFor(shape, n);
  if (!read) notFound();
  const list = await read;
  // Out of range → 404, not an empty 200. An empty 200 at a crawlable URL is a
  // soft-404 factory: every town would expose infinitely many of them.
  if (n > list.totalPages) notFound();

  const locale = toLocale((await getLocale()) as AppLocale);
  const copy = getResultadosCopy(locale);
  const nf = (x: number) => x.toLocaleString(locale === 'en' ? 'en-US' : 'es-ES');

  let region: string;
  let h1: string;
  let trail: Array<{ label: string; href?: string }>;

  if (shape.kind === 'outcome-province') {
    const outcomeLabel =
      locale === 'en' ? OUTCOME_META[shape.outcome].en : OUTCOME_META[shape.outcome].es;
    region = shape.provLabel;
    h1 = copy.outcomeRegionH1(outcomeLabel.toLowerCase(), shape.provLabel);
    trail = [
      { label: outcomeLabel, href: `/resultados/${shape.outcomeSlug}` },
      { label: shape.provLabel, href: basePath },
      { label: `${copy.page} ${n}` },
    ];
  } else {
    region = `${capitalizeLocation(shape.muniName)} (${shape.provLabel})`;
    h1 = copy.regionH1(region);
    trail = [
      { label: shape.provLabel, href: `/resultados/${shape.provSlug}` },
      { label: capitalizeLocation(shape.muniName), href: basePath },
      { label: `${copy.page} ${n}` },
    ];
  }

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: copy.crumbHome, item: `${SITE_ORIGIN}/` },
      { '@type': 'ListItem', position: 2, name: copy.crumbRegistry, item: `${SITE_ORIGIN}/resultados` },
      ...trail.map((c, i) => ({
        '@type': 'ListItem',
        position: 3 + i,
        name: c.label,
        item: `${SITE_ORIGIN}${c.href ?? `${basePath}/pagina/${n}`}`,
      })),
    ],
  };

  return (
    <main className="mx-auto max-w-editorial px-4 py-8 sm:px-6">
      <RegistryBreadcrumb homeLabel={copy.crumbHome} registryLabel={copy.crumbRegistry} trail={trail} />
      <header className="mb-8 max-w-readable">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink-primary)] sm:text-3xl">
          {h1}
          {copy.pageSuffix(n)}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-tertiary)]">
          {copy.regionLead(nf(list.total), region)}
        </p>
      </header>

      <ArchivePageBody
        items={list.items}
        page={list.page}
        totalPages={list.totalPages}
        basePath={basePath}
        locale={locale}
        copy={copy}
        heading={copy.archiveHeading}
      />

      <div className="mt-10">
        <RegistryBackLink label={copy.backToRegistry} />
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
    </main>
  );
}
