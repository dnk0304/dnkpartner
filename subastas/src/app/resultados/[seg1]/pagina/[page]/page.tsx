/**
 * /resultados/{seg1}/pagina/{n} — deep pages of the one-segment archive
 * (Forge, 2026-08-12). Serves n >= 2; n = 1 redirects to the bare hub.
 *
 * Covers both shapes `resolveResultadosSeg` resolves:
 *   • /resultados/{outcome}/pagina/{n}     (national outcome archive)
 *   • /resultados/{provincia}/pagina/{n}   (province archive)
 *
 * NOTE ON THE ROUTE TREE: `pagina` is a LITERAL sibling of `[seg1]`'s child
 * `[seg2]`, and Next resolves a literal segment ahead of a dynamic one. That is
 * exactly why this file can exist at all — but it also means a province could
 * never have a municipality whose slug is `pagina`. It cannot (no Spanish
 * municipality slugifies to that word), and the same shadowing rule already
 * governs `/subastas/[slug]/pagina`, where it is enforced by
 * `src/lib/seo/reserved-segments.ts`.
 *
 * Precedent match and rationale: see `_shared/archive-page.tsx`.
 */

import type { Metadata } from 'next';
import { notFound, redirect, permanentRedirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import type { Locale as AppLocale } from '@/i18n/routing';
import { buildAlternates, ogLocale, SITE_ORIGIN } from '@/lib/seo/alternates';
import { readList } from '@/lib/registro/registro-read';
import { resolveResultadosSeg, type ResultadosSeg } from '@/lib/registro/resultados-routing';
import { getResultadosCopy, OUTCOME_META, type Locale } from '@/lib/registro/registro-ui';
import { RegistryBreadcrumb, RegistryBackLink } from '@/components/registro/RegistryNav';
import { ArchivePageBody, ARCHIVE_PAGE_SIZE, parseArchivePage } from '../../../_shared/archive-page';
import { isUrlV4SwitchOn } from '@/lib/seo/url-v4-switch';
import { archivePagePath } from '@/lib/seo/archive-partitions';
import { legacyArchivePageTarget } from '@/lib/registro/archive-legacy-target';
import { ArchiveNodeView, archiveNodeMetadata } from '../../../_shared/archive-node-view';

type PageProps = { params: Promise<{ seg1: string; page: string }> };

function toLocale(v: string): Locale {
  return v === 'en' ? 'en' : 'es';
}

function readFor(seg: ResultadosSeg, page: number) {
  if (seg.kind === 'outcome') {
    return readList({ outcome: seg.outcome, page, pageSize: ARCHIVE_PAGE_SIZE });
  }
  if (seg.kind === 'province') {
    return readList({ province: seg.dbKey, page, pageSize: ARCHIVE_PAGE_SIZE });
  }
  return null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { seg1, page } = await params;
  const locale = toLocale((await getLocale()) as AppLocale);
  const copy = getResultadosCopy(locale);
  const seg = resolveResultadosSeg(seg1);
  if (seg.kind === 'invalid' || seg.kind === 'redirect') return { title: copy.brandSuffix };

  // v4: the province archive IS a ladder node, so its deep pages take the node's
  // metadata (v4 page count, self-canonical, index,follow). See the body.
  if (isUrlV4SwitchOn() && seg.kind === 'province') {
    const n4 = parseArchivePage(page);
    return archiveNodeMetadata([seg.slug], n4 ?? 1);
  }

  const n = parseArchivePage(page);
  const nf = (x: number) => x.toLocaleString(locale === 'en' ? 'en-US' : 'es-ES');
  const read = n ? readFor(seg, n) : null;
  const list = read ? await read : null;
  const inRange = !!(n && n >= 2 && list && n <= list.totalPages && list.total > 0);

  const label =
    seg.kind === 'outcome'
      ? locale === 'en'
        ? OUTCOME_META[seg.outcome].en
        : OUTCOME_META[seg.outcome].es
      : seg.label;
  const h1 =
    seg.kind === 'outcome' ? copy.outcomeNationalH1(label.toLowerCase()) : copy.regionH1(label);
  const region = seg.kind === 'outcome' ? copy.landingH1 : label;

  return {
    title: `${h1}${n ? copy.pageSuffix(n) : ''} | ${copy.brandSuffix}`,
    description: copy.regionLead(nf(list?.total ?? 0), region).slice(0, 158),
    ...buildAlternates(`/resultados/${seg.slug}/pagina/${page}`, locale as AppLocale),
    openGraph: { locale: ogLocale(locale as AppLocale) },
    robots: inRange ? 'index,follow' : 'noindex,follow',
  };
}

export default async function ResultadosSegPaginaPage({ params }: PageProps) {
  const { seg1, page } = await params;
  const seg = resolveResultadosSeg(seg1);
  if (seg.kind === 'invalid') notFound();
  if (seg.kind === 'redirect') redirect(`${seg.to}/pagina/${page}`);

  const n = parseArchivePage(page);
  if (n === null) notFound();

  const basePath = `/resultados/${seg.slug}`;
  if (n === 1) redirect(basePath);

  // ---- v4 (P2) — province deep pages ------------------------------------
  //
  // The province hub is a v4 LADDER ROOT, so `/resultados/{prov}/pagina/{n}` is
  // a URL both grammars own. Under v4 it therefore MEANS the node's page n and
  // is served, not redirected — for n inside the 10-page cap. Past the cap the
  // page has no v4 twin, and rather than 404 a URL Google already crawled we
  // 301 it onto the PARTITION that now holds its rows (see
  // `archive-legacy-target.ts` for why that is computable and not a guess).
  //
  // The national OUTCOME archive (`/resultados/adjudicadas/pagina/{n}`) is a
  // hand-built hub outside the ladder and v4 does not move it — untouched here.
  if (isUrlV4SwitchOn() && seg.kind === 'province') {
    const node = { prov: seg.slug };
    const target = await legacyArchivePageTarget(node, n);
    // Identity means "this page survives v4" — never redirect a URL onto itself.
    if (target !== archivePagePath(node, n)) permanentRedirect(target);
    return <ArchiveNodeView segs={[seg.slug]} page={n} />;
  }

  const read = readFor(seg, n);
  if (!read) notFound();
  const list = await read;
  if (n > list.totalPages) notFound();

  const locale = toLocale((await getLocale()) as AppLocale);
  const copy = getResultadosCopy(locale);
  const nf = (x: number) => x.toLocaleString(locale === 'en' ? 'en-US' : 'es-ES');

  const label =
    seg.kind === 'outcome'
      ? locale === 'en'
        ? OUTCOME_META[seg.outcome].en
        : OUTCOME_META[seg.outcome].es
      : seg.label;
  const h1 =
    seg.kind === 'outcome' ? copy.outcomeNationalH1(label.toLowerCase()) : copy.regionH1(label);
  const region = seg.kind === 'outcome' ? copy.landingH1 : label;

  const trail = [
    { label, href: basePath },
    { label: `${copy.page} ${n}` },
  ];

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: copy.crumbHome, item: `${SITE_ORIGIN}/` },
      { '@type': 'ListItem', position: 2, name: copy.crumbRegistry, item: `${SITE_ORIGIN}/resultados` },
      { '@type': 'ListItem', position: 3, name: label, item: `${SITE_ORIGIN}${basePath}` },
      {
        '@type': 'ListItem',
        position: 4,
        name: `${copy.page} ${n}`,
        item: `${SITE_ORIGIN}${basePath}/pagina/${n}`,
      },
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
