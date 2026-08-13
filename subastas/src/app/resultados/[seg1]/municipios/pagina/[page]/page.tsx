/**
 * /resultados/{provincia}/municipios/pagina/{n} — deep pages of the province
 * municipality index.
 *
 * Precedent-matched to the /resultados archive pagination shipped in `c0e9f8d`:
 *   • `pagina/1` → redirect to the bare index (one canonical URL per page-1)
 *   • non-numeric / leading-zero / negative segment → 404, never a duplicate alias
 *   • page > totalPages → 404
 *   • self-canonical to this URL, `index,follow`, rel prev/next in <head>
 */

import type { Metadata } from 'next';
import { notFound, redirect, permanentRedirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import type { Locale as AppLocale } from '@/i18n/routing';
import { getResultadosCopy } from '@/lib/registro/registro-ui';
import {
  MuniIndexBody,
  muniIndexMetadata,
  muniIndexRedirectTarget,
  parseArchivePage,
  resolveOr404,
  toLocale,
} from '../../../../_shared/muni-index';
import { isUrlV4SwitchOn } from '@/lib/seo/url-v4-switch';

type PageProps = { params: Promise<{ seg1: string; page: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { seg1, page } = await params;
  const n = parseArchivePage(page);
  if (n == null || n === 1) return {};
  return muniIndexMetadata(seg1, n);
}

export default async function MunicipiosIndexPaginaPage({ params }: PageProps) {
  const { seg1, page } = await params;
  const n = parseArchivePage(page);
  if (n == null) notFound();
  if (n === 1) redirect(`/resultados/${seg1}/municipios`);

  // v4 (P2): the index is de-paginated onto one A–Z page, so every `/pagina/{n}`
  // retires. 301 rather than 404 — these were live, crawlable URLs linked from
  // the province hub, and 404ing them is a de-index signal on pages Google
  // already knows. Target resolved (not templated) so the ≤60-town provinces
  // land on the hub directly instead of 301→307.
  if (isUrlV4SwitchOn()) {
    const target = await muniIndexRedirectTarget(seg1);
    if (!target) notFound();
    permanentRedirect(target);
  }

  const resolved = await resolveOr404(seg1, n);
  const locale = toLocale((await getLocale()) as AppLocale);
  return <MuniIndexBody resolved={resolved} page={n} locale={locale} copy={getResultadosCopy(locale)} />;
}
