/**
 * /subastas/tipo/[tipo] — auction-type programmatic SEO page (5 pages).
 *
 * Always indexable (07 §6.1 — head keyword).
 */

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import {
  TIPO_LABEL_PLURAL,
  TIPO_SLUG_TO_DB_KEYS,
  TIPO_ALIAS_TO_CANONICAL,
  type TipoSlug,
} from '@/lib/seo/slugs';
import { countActiveAuctions, findActiveAuctions, minStartingPrice } from '@/lib/seo/page-data';
import { SeoIntroBlock } from '@/components/seo/SeoIntroBlock';
import { Breadcrumbs } from '@/components/seo/Breadcrumbs';
import { SeoAuctionGrid } from '@/components/seo/SeoAuctionGrid';

type PageProps = { params: Promise<{ tipo: string }> };
const SITE = 'https://subastasactivas.com';

function asTipoSlug(slug: string): TipoSlug | { redirectTo: TipoSlug } | null {
  if (slug in TIPO_SLUG_TO_DB_KEYS) return slug as TipoSlug;
  const alias = TIPO_ALIAS_TO_CANONICAL[slug];
  if (alias) return { redirectTo: alias };
  return null;
}

async function loadTipo(slug: TipoSlug) {
  const keys = TIPO_SLUG_TO_DB_KEYS[slug];
  const [count, auctions, minPrice] = await Promise.all([
    countActiveAuctions({ auctionTypeKeys: keys }),
    findActiveAuctions({ auctionTypeKeys: keys, take: 24 }),
    minStartingPrice({ auctionTypeKeys: keys }),
  ]);
  return { count, auctions, minPrice, label: TIPO_LABEL_PLURAL[slug] };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { tipo } = await params;
  const r = asTipoSlug(tipo);
  if (!r || (typeof r === 'object' && 'redirectTo' in r)) return { title: 'Tipo no encontrado' };
  const { count, label } = await loadTipo(r);
  const title = `${count.toLocaleString('es-ES')} subastas ${label} en España · en vivo | dnksubastas`;
  const description = `Todas las subastas ${label} activas en España (${count.toLocaleString('es-ES')}), con estado en vivo, pujas y enlace oficial. Actualizado a diario por dnksubastas.`.slice(0, 158);
  return {
    title,
    description,
    alternates: { canonical: `${SITE}/subastas/tipo/${tipo}` },
    robots: count > 0 ? 'index,follow' : 'noindex,follow',
  };
}

export default async function TipoPage({ params }: PageProps) {
  const { tipo } = await params;
  const r = asTipoSlug(tipo);
  if (!r) notFound();
  if (typeof r === 'object' && 'redirectTo' in r) redirect(`/subastas/tipo/${r.redirectTo}`);
  const data = await loadTipo(r as TipoSlug);
  const { count, auctions, minPrice, label } = data;

  return (
    <main className="mx-auto max-w-editorial px-4 md:px-6 py-8">
      <Breadcrumbs
        items={[
          { label: 'Inicio', href: '/' },
          { label: 'Subastas', href: '/subastas' },
          { label: `Subastas ${label}`, href: `/subastas/tipo/${tipo}` },
        ]}
      />
      <header className="mb-4">
        <h1 className="text-2xl md:text-3xl font-bold">Subastas {label} en España</h1>
        <div className="text-sm text-[--color-text-muted] mt-1">
          {count.toLocaleString('es-ES')} subastas activas
        </div>
      </header>

      <SeoIntroBlock
        count={count}
        noun={`subastas ${label}`}
        location="España"
        minPrice={minPrice}
        guideHref={`/guia/subastas-${(r as string).replace(/-/g, '-')}-como-funcionan`}
        guideLabel="Cómo funcionan estas subastas"
      />

      <SeoAuctionGrid auctions={auctions as any} />
    </main>
  );
}
