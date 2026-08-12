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
import { notFound, redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import type { Locale as AppLocale } from '@/i18n/routing';
import { getResultadosCopy } from '@/lib/registro/registro-ui';
import {
  MuniIndexBody,
  muniIndexMetadata,
  parseArchivePage,
  resolveOr404,
  toLocale,
} from '../../../../_shared/muni-index';

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

  const resolved = await resolveOr404(seg1, n);
  const locale = toLocale((await getLocale()) as AppLocale);
  return <MuniIndexBody resolved={resolved} page={n} locale={locale} copy={getResultadosCopy(locale)} />;
}
