/**
 * /resultados/{provincia}/municipios — page 1 of the province municipality
 * index. See `../../_shared/muni-index.tsx` for why this surface exists (the
 * 60-town `slice` that link-orphaned 8,673 town archives) and why it is
 * deliberately absent from the sitemap.
 *
 * `municipios` is a LITERAL sibling of `[seg2]`, so Next resolves it in
 * preference to the town route. Verified on prod that no municipality slugifies
 * to `municipios` (or `pagina`), so this shadows nothing reachable.
 */

import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';
import type { Locale as AppLocale } from '@/i18n/routing';
import { getResultadosCopy } from '@/lib/registro/registro-ui';
import { MuniIndexBody, muniIndexMetadata, resolveOr404, toLocale } from '../../_shared/muni-index';

type PageProps = { params: Promise<{ seg1: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { seg1 } = await params;
  return muniIndexMetadata(seg1, 1);
}

export default async function MunicipiosIndexPage({ params }: PageProps) {
  const { seg1 } = await params;
  const resolved = await resolveOr404(seg1, 1);
  const locale = toLocale((await getLocale()) as AppLocale);
  return <MuniIndexBody resolved={resolved} page={1} locale={locale} copy={getResultadosCopy(locale)} />;
}
