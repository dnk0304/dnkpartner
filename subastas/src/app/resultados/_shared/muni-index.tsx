/**
 * /resultados/{prov}/municipios[/pagina/N] — the province municipality index.
 *
 * WHY THIS EXISTS (Forge, 2026-08-12)
 * -----------------------------------
 * `/resultados/{prov}` rendered `munis.slice(0, 60)` and offered no other route
 * into the rest. Measured on prod: 11,677 town archives exist, **8,673 (74%,
 * across 50 of 52 provinces) had zero inbound internal links** — 10,376 of them
 * are already advertised in sitemap child 0, so they were sitemap-present and
 * link-orphaned, which is exactly the *Discovered – currently not indexed*
 * profile the /resultados pagination brief was written to eliminate one level
 * further down the tree.
 *
 * The fix is a real linked surface, NOT more sitemap entries. A sitemap entry
 * says a page exists; an internal link says it matters. **These index pages are
 * deliberately NOT emitted into the sitemap** — they are navigation, reached by
 * crawling the province hub (which is in the sitemap), and the town archives
 * they link to are already in child 0. Net sitemap delta: **0 URLs**, which is
 * what keeps the aggregation band at 16,516 / 20,000 and leaves the D1 widening
 * headroom untouched.
 *
 * SHAPE — mirrors the /resultados archive-pagination precedent exactly, so the
 * two surfaces cannot drift:
 *   • page 1 is the bare `/resultados/{prov}/municipios` (no `/pagina/1`)
 *   • `/pagina/1` → redirect to the bare index
 *   • out-of-range page → 404
 *   • `index,follow` + self-canonical to the paginated URL
 *   • prev/next in `<head>` via `<SeoPagination>` (one emission point)
 *
 * seg1 here must be a PROVINCE. The outcome archives (adjudicadas / desiertas /
 * canceladas / finalizadas) have no municipality dimension at this depth, so
 * `/resultados/adjudicadas/municipios` is a 404, not an empty page.
 */

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import type { Locale as AppLocale } from '@/i18n/routing';
import { capitalizeLocation } from '@/lib/utils';
import { concludedMunicipioRegions, type MunicipioRegionEntry } from '@/lib/registro/registro-read';
import { resolveResultadosSeg } from '@/lib/registro/resultados-routing';
import { MUNI_INDEX_PAGE_SIZE, HUB_MUNI_PREVIEW } from '@/lib/registro/archive-paging';
import { getResultadosCopy, type Locale, type ResultadosCopy } from '@/lib/registro/registro-ui';
import { SeoPagination } from '@/components/seo/SeoPagination';
import { ChipLinks, RegistryBreadcrumb, RegistryBackLink } from '@/components/registro/RegistryNav';
import { SITE_ORIGIN, buildAlternates, ogLocale } from '@/lib/seo/alternates';

export { MUNI_INDEX_PAGE_SIZE, parseArchivePage } from '@/lib/registro/archive-paging';

export function toLocale(v: string): Locale {
  return v === 'en' ? 'en' : 'es';
}

export type MuniIndexResolved = {
  provSlug: string;
  provLabel: string;
  munis: MunicipioRegionEntry[];
  total: number;
  totalPages: number;
};

/**
 * Resolve `seg1` + a 1-indexed page into the index payload.
 *
 * Returns `null` for "not a province" (→ 404) and throws Next's redirect for an
 * alias slug, so both route files share ONE definition of which URLs are
 * 200 / 301 / 404. A second copy would eventually disagree with the hub about
 * which province slug is canonical.
 *
 * `totalPages` is clamped to >= 1 so a province with zero concluded municipios
 * still renders one (empty, noindex-able by the caller) page rather than 404ing
 * a URL the hub might link.
 */
export async function resolveMuniIndex(
  seg1: string,
  page: number,
): Promise<MuniIndexResolved | null> {
  const r = resolveResultadosSeg(seg1);
  if (r.kind === 'redirect') redirect(`${r.to}/municipios`);
  if (r.kind !== 'province') return null;

  const all = await concludedMunicipioRegions(r.dbKey);
  const total = all.length;
  // The hub already lists every municipality at this size, so it IS the index.
  // Redirecting (rather than rendering a duplicate list, or 404ing a plausible
  // URL) keeps ONE canonical URL for "the municipalities of this province" and
  // guarantees this page is never an orphan — the hub only links it when the
  // same predicate says it renders.
  if (total <= HUB_MUNI_PREVIEW) redirect(`/resultados/${r.slug}`);

  const totalPages = Math.max(1, Math.ceil(total / MUNI_INDEX_PAGE_SIZE));
  if (page > totalPages) return null;

  const start = (page - 1) * MUNI_INDEX_PAGE_SIZE;
  return {
    provSlug: r.slug,
    provLabel: r.label,
    munis: all.slice(start, start + MUNI_INDEX_PAGE_SIZE),
    total,
    totalPages,
  };
}

/** Canonical path for index page N (page 1 = bare, matching SeoPagination). */
export function muniIndexPath(provSlug: string, page: number): string {
  const base = `/resultados/${provSlug}/municipios`;
  return page <= 1 ? base : `${base}/pagina/${page}`;
}

/**
 * Shared render for both index routes. Intentionally light: no stat tiles, no
 * charts, no client archive island — this page exists to carry links, and
 * keeping it cheap is what let us pick 200 links per page.
 */
export function MuniIndexBody({
  resolved,
  page,
  locale,
  copy,
}: {
  resolved: MuniIndexResolved;
  page: number;
  locale: Locale;
  copy: ResultadosCopy;
}) {
  const { provSlug, provLabel, munis, total, totalPages } = resolved;
  const nf = (n: number) => n.toLocaleString(locale === 'en' ? 'en-US' : 'es-ES');
  const basePath = `/resultados/${provSlug}/municipios`;

  const items = munis.map((m) => ({
    href: `/resultados/${provSlug}/${m.municipioSlug}`,
    label: capitalizeLocation(m.municipalityName),
    count: m.total,
  }));

  const h1 = `${copy.muniIndexH1(provLabel)}${page > 1 ? copy.pageSuffix(page) : ''}`;

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: copy.crumbHome, item: `${SITE_ORIGIN}/` },
      { '@type': 'ListItem', position: 2, name: copy.crumbRegistry, item: `${SITE_ORIGIN}/resultados` },
      { '@type': 'ListItem', position: 3, name: provLabel, item: `${SITE_ORIGIN}/resultados/${provSlug}` },
      { '@type': 'ListItem', position: 4, name: copy.crumbMunicipios, item: `${SITE_ORIGIN}${basePath}` },
    ],
  };

  return (
    <main className="mx-auto max-w-editorial px-4 py-8 sm:px-6">
      <RegistryBreadcrumb
        homeLabel={copy.crumbHome}
        registryLabel={copy.crumbRegistry}
        trail={[
          { label: provLabel, href: `/resultados/${provSlug}` },
          { label: copy.crumbMunicipios },
        ]}
      />
      <header className="mb-8 max-w-readable">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink-primary)] sm:text-3xl">{h1}</h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-tertiary)]">
          {copy.muniIndexLead(nf(total), provLabel)}
        </p>
      </header>

      <section aria-label={copy.muniIndexH1(provLabel)}>
        {items.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-hairline)] bg-[var(--color-surface-muted)] p-8 text-center text-sm text-[var(--color-ink-tertiary)]">
            {copy.empty}
          </div>
        ) : (
          <ChipLinks items={items} locale={locale} />
        )}
        <SeoPagination
          basePath={basePath}
          page={page}
          totalPages={totalPages}
          ariaLabel={copy.pagLabel}
          prevLabel={copy.pagPrev}
          nextLabel={copy.pagNext}
        />
      </section>

      <div className="mt-10">
        <RegistryBackLink label={copy.backToRegistry} />
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
    </main>
  );
}

/**
 * Shared metadata for both index routes. Self-canonical to the PAGINATED URL
 * (never back to the bare index) — the precedent the /resultados and /subastas
 * paginated hubs already set; canonicalising page N to page 1 would tell Google
 * the deep index pages are duplicates and re-orphan everything on them.
 */
export async function muniIndexMetadata(seg1: string, page: number): Promise<Metadata> {
  const locale = toLocale((await getLocale()) as AppLocale);
  const copy = getResultadosCopy(locale);
  const r = resolveResultadosSeg(seg1);
  if (r.kind !== 'province') return { title: copy.brandSuffix };

  const all = await concludedMunicipioRegions(r.dbKey);
  const nf = (n: number) => n.toLocaleString(locale === 'en' ? 'en-US' : 'es-ES');
  const h1 = `${copy.muniIndexH1(r.label)}${page > 1 ? copy.pageSuffix(page) : ''}`;

  return {
    title: `${h1} | ${copy.brandSuffix}`,
    description: copy.muniIndexLead(nf(all.length), r.label).slice(0, 158),
    ...buildAlternates(muniIndexPath(r.slug, page), locale as AppLocale),
    openGraph: { locale: ogLocale(locale as AppLocale) },
    robots: all.length > 0 ? 'index,follow' : 'noindex,follow',
  };
}

/** Guard used by both routes: `notFound()` unless resolution succeeded. */
export async function resolveOr404(seg1: string, page: number): Promise<MuniIndexResolved> {
  const resolved = await resolveMuniIndex(seg1, page);
  if (!resolved) notFound();
  return resolved;
}
