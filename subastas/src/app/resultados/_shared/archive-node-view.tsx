/**
 * archive-node-view — ONE body for every v4 archive node, at every depth.
 *
 * WHY ONE BODY. The v4 ladder needs six route files
 * (`{prov}/{tipo}`, `{prov}/{muni}/{tipo}`, `…/{año}`, `…/t{n}`, each plus a
 * `/pagina/{n}` sibling), and the SEO contract they must satisfy is identical
 * and unforgiving: index,follow · self-canonical to the paginated URL ·
 * `pagina/1` → 307 to the bare hub · out-of-range → 404 · `rel=prev/next` in
 * `<head>` · a real server-rendered `<a href>` per auction. Six copies of that
 * is six chances to get one of them wrong in a way nobody notices until a
 * quarter of the tree drops out of the index. So the route files below are
 * ~15 lines each and this is the only place the contract is written down.
 *
 * ⛔ DARK BY DEFAULT. While `URL_V4_SWITCH` is off these pages SERVE (Ken:
 * "new routes may exist and serve") but declare `noindex,follow`. That is
 * stronger than the v3 precedent's "canonical to the legacy URL", and
 * deliberately so: most v4 nodes have NO legacy twin to point a canonical at
 * (`/resultados/madrid/madrid/judicial/2017` does not exist today), so the only
 * honest way to keep Googlebot from telling the flag is there is to decline
 * indexing until the flag flips. `follow` is kept so the tree is walkable for
 * verification on the live container before the flip.
 *
 * SCOPE FENCE: no redirects for legacy shapes (P2), no sitemap (P3), no visual
 * redesign (P4). Auction DETAIL urls are frozen and are not touched here —
 * every row link comes from `item.detailPath`, i.e. `resolveAuctionPath`.
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';
import type { Locale as AppLocale } from '@/i18n/routing';
import { buildAlternates, ogLocale, SITE_ORIGIN } from '@/lib/seo/alternates';
import { capitalizeLocation } from '@/lib/utils';
import { readList } from '@/lib/registro/registro-read';
import { readArchivePlan } from '@/lib/registro/archive-node-read';
import {
  archiveNodePath,
  archivePagePath,
  archivePageLinks,
  type ArchiveNode,
} from '@/lib/seo/archive-partitions';
import { isUrlV4SwitchOn } from '@/lib/seo/url-v4-switch';
import { parseArchivePage } from '@/lib/registro/archive-paging';
import { resolveArchiveSegments } from './resolve-child';
import { ArchivePageBody } from './archive-page';
import { getResultadosCopy, type Locale } from '@/lib/registro/registro-ui';
import { RegistryBreadcrumb, RegistryBackLink, ChipLinks } from '@/components/registro/RegistryNav';
import { TIPO_LABEL_PLURAL } from '@/lib/seo/slugs';

function toLocale(v: string): Locale {
  return v === 'en' ? 'en' : 'es';
}

/** Human label for a node, used in the H1, the title and the last crumb. */
function nodeLabel(node: ArchiveNode, provLabel?: string, muniLabel?: string): string {
  const bits: string[] = [];
  if (node.tipo) bits.push(`Subastas ${TIPO_LABEL_PLURAL[node.tipo]}`);
  else bits.push('Subastas');
  if (muniLabel) bits.push(`en ${capitalizeLocation(muniLabel)}`);
  else if (provLabel) bits.push(`en ${provLabel}`);
  if (node.anio !== undefined) {
    // ⚠️ "de {año}" deliberately, never "que terminaron en {año}": the año rung
    // keys on COALESCE(endsAt, publishedAt), so for the 17,848 endsAt-NULL rows
    // this is the PUBLICATION year. Claiming an end date would be wrong for all
    // of them (see archive-partitions.ts).
    bits.push(node.trimestre !== undefined ? `de ${node.anio} (T${node.trimestre})` : `de ${node.anio}`);
  }
  return bits.join(' ');
}

/** Breadcrumb trail, one crumb per ladder rung, each linking its own node. */
function crumbsFor(node: ArchiveNode, provLabel?: string, muniLabel?: string) {
  const trail: Array<{ label: string; href?: string }> = [];
  const acc: ArchiveNode = {};
  if (node.prov) {
    Object.assign(acc, { prov: node.prov });
    trail.push({ label: provLabel ?? node.prov, href: archiveNodePath({ ...acc }) });
  }
  if (node.muni) {
    Object.assign(acc, { muni: node.muni });
    trail.push({
      label: capitalizeLocation(muniLabel ?? node.muni),
      href: archiveNodePath({ ...acc }),
    });
  }
  if (node.tipo) {
    Object.assign(acc, { tipo: node.tipo });
    trail.push({ label: TIPO_LABEL_PLURAL[node.tipo], href: archiveNodePath({ ...acc }) });
  }
  if (node.anio !== undefined) {
    Object.assign(acc, { anio: node.anio });
    trail.push({ label: String(node.anio), href: archiveNodePath({ ...acc }) });
  }
  if (node.trimestre !== undefined) {
    trail.push({ label: `T${node.trimestre}` });
  }
  // The LAST crumb is the current page: drop its href so it is not self-linking.
  if (trail.length > 0) delete trail[trail.length - 1].href;
  return trail;
}

type Resolved = {
  node: ArchiveNode;
  provLabel?: string;
  muniLabel?: string;
  total: number;
  pages: number;
  pageSize: number;
  children: readonly ArchiveNode[];
  childTotals: ReadonlyMap<string, number>;
};

/**
 * Resolve + plan, or bail with the right status.
 *
 * A ladder node with 0 rows is a 404, not an empty 200: the planner refuses to
 * emit a zero-row partition, so such a URL was never advertised and answering it
 * with a thin page would mint indexable duplicates of the parent.
 */
async function load(segs: string[]): Promise<Resolved | { redirectTo: string } | null> {
  const r = await resolveArchiveSegments(segs);
  if (r.kind === 'redirect') return { redirectTo: r.to };
  if (r.kind === 'notfound') return null;
  const { plan, childTotals } = await readArchivePlan(r.node);
  if (plan.total === 0) return null;
  return {
    node: r.node,
    provLabel: r.provLabel,
    muniLabel: r.muniLabel,
    total: plan.total,
    pages: plan.pages,
    pageSize: plan.pageSize,
    children: plan.children,
    childTotals,
  };
}

export async function archiveNodeMetadata(segs: string[], page = 1): Promise<Metadata> {
  const locale = toLocale((await getLocale()) as AppLocale);
  const copy = getResultadosCopy(locale);
  const loaded = await load(segs);
  if (!loaded || 'redirectTo' in loaded) return { title: copy.brandSuffix };

  const { node, provLabel, muniLabel, total, pages } = loaded;
  if (page > 1 && page > pages) return { title: copy.brandSuffix };

  const label = nodeLabel(node, provLabel, muniLabel);
  const nf = (n: number) => n.toLocaleString(locale === 'en' ? 'en-US' : 'es-ES');
  // SELF-canonical to the PAGINATED url, never to the bare hub — matching the
  // shipped /subastas precedent. Collapsing page N onto page 1 tells Google the
  // deep pages are duplicates, which un-does the crawl path they exist for.
  const path = archivePagePath(node, page);

  return {
    title: `${label}${page > 1 ? copy.pageSuffix(page) : ''} | ${copy.brandSuffix}`,
    description: copy.regionLead(nf(total), label).slice(0, 158),
    ...buildAlternates(path, locale as AppLocale),
    openGraph: { locale: ogLocale(locale as AppLocale) },
    // ⛔ Dark until Ken flips the switch. See the module header.
    robots: isUrlV4SwitchOn() ? 'index,follow' : 'noindex,follow',
  };
}

export async function ArchiveNodeView({ segs, page = 1 }: { segs: string[]; page?: number }) {
  const loaded = await load(segs);
  if (!loaded) notFound();
  if ('redirectTo' in loaded) redirect(loaded.redirectTo);

  const { node, provLabel, muniLabel, total, pages, pageSize, children, childTotals } = loaded;
  // Out-of-range page → 404. Page 1 never lives at /pagina/1 (the route file
  // 307s that away), so a page number above the plan's own count is a URL that
  // never existed and must not answer 200 with an empty list.
  if (page > 1 && page > pages) notFound();

  const locale = toLocale((await getLocale()) as AppLocale);
  const copy = getResultadosCopy(locale);
  const nf = (n: number) => n.toLocaleString(locale === 'en' ? 'en-US' : 'es-ES');

  const list = await readList({ node, page, pageSize });
  const label = nodeLabel(node, provLabel, muniLabel);
  const basePath = archiveNodePath(node);
  // MANDATORY full fan (Ken 2026-08-13) — from the planner, never hand-rolled.
  const pageHrefs = archivePageLinks(node, pages);

  // The ladder children ARE the crawl path for rows past this node's 10 pages.
  // Without these anchors a capped node's overflow is unreachable, which is the
  // exact defect this wave exists to close — so they are rendered even when the
  // node also paginates.
  const childLinks = children.map((c) => {
    // The ladder KEY is the last segment the planner added — the same key the
    // child census counted under, so the count and the link cannot disagree.
    const key =
      c.trimestre !== undefined && node.trimestre === undefined ? String(c.trimestre)
        : c.anio !== undefined && node.anio === undefined ? String(c.anio)
        : c.tipo !== undefined && node.tipo === undefined ? c.tipo
        : (c.muni ?? '');
    return {
      href: archiveNodePath(c),
      label:
        c.trimestre !== undefined && node.trimestre === undefined ? `T${c.trimestre}`
          : c.anio !== undefined && node.anio === undefined ? String(c.anio)
          : c.tipo !== undefined && node.tipo === undefined ? TIPO_LABEL_PLURAL[c.tipo]
          : capitalizeLocation(c.muni ?? ''),
      count: childTotals.get(key) ?? 0,
    };
  });

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: copy.crumbHome, item: `${SITE_ORIGIN}/` },
      { '@type': 'ListItem', position: 2, name: copy.crumbRegistry, item: `${SITE_ORIGIN}/resultados` },
      ...crumbsFor(node, provLabel, muniLabel).map((c, i) => ({
        '@type': 'ListItem',
        position: i + 3,
        name: c.label,
        item: `${SITE_ORIGIN}${c.href ?? basePath}`,
      })),
    ],
  };

  return (
    <main className="mx-auto max-w-editorial px-4 py-8 sm:px-6">
      <RegistryBreadcrumb
        homeLabel={copy.crumbHome}
        registryLabel={copy.crumbRegistry}
        trail={crumbsFor(node, provLabel, muniLabel)}
      />
      <header className="mb-8 max-w-readable">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink-primary)] sm:text-3xl">
          {label}
          {page > 1 ? copy.pageSuffix(page) : ''}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-tertiary)]">
          {copy.regionLead(nf(total), label)}
        </p>
      </header>

      <ArchivePageBody
        items={list.items}
        page={page}
        totalPages={pages}
        basePath={basePath}
        locale={locale}
        copy={copy}
        heading={copy.archiveListHeading}
        pageHrefs={pageHrefs}
      />

      {childLinks.length > 0 ? (
        <section className="mt-10 mb-8" aria-labelledby="archive-children">
          <h2
            id="archive-children"
            className="mb-3 text-lg font-semibold text-[var(--color-ink-primary)]"
          >
            {copy.archiveHeading}
          </h2>
          <ChipLinks items={childLinks} locale={locale} />
        </section>
      ) : null}

      {/* Only offered when this node is BELOW the province root — on the root
          itself the href equals the current page, and a breadcrumb-shaped
          self-link at the bottom of a 5-level tree is exactly the affordance a
          lost user wastes a click on. */}
      {node.prov && (node.muni || node.tipo || node.anio !== undefined) ? (
        <div className="mt-8">
          <Link
            href={archiveNodePath({ prov: node.prov })}
            className="text-sm font-medium text-[var(--color-action)] hover:underline"
          >
            {copy.viewProvinceResults(provLabel ?? node.prov)} →
          </Link>
        </div>
      ) : null}

      <RegistryBackLink label={copy.backToRegistry} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
    </main>
  );
}

/**
 * Shared `/pagina/{raw}` handling: `pagina/1` → 307 to the bare hub (one
 * canonical URL per logical page 1), anything unparseable → 404.
 */
export function archivePageParam(segs: string[], raw: string): number {
  const n = parseArchivePage(raw);
  if (n === null) notFound();
  if (n === 1) redirect(`/resultados/${segs.join('/')}`);
  return n;
}
