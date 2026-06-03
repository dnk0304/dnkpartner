/**
 * /subastas/tipo/[tipo] — auction-type programmatic SEO page (5 pages).
 *
 * Always indexable (07 §6.1 — head keyword).
 *
 * Layout (2026-06-03): renders the shared SubastasListClient with
 * `lockedFilter.type` so users see the 2-col sidebar + card-row list,
 * pre-filtered for this BOE family. SEO H1, breadcrumb, intro block, JSON-LD,
 * canonical/robots metadata preserved server-side.
 */

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import {
  TIPO_LABEL_PLURAL,
  TIPO_SLUG_TO_DB_KEYS,
  TIPO_ALIAS_TO_CANONICAL,
  type TipoSlug,
} from '@/lib/seo/slugs';
import { countActiveAuctions, minStartingPrice } from '@/lib/seo/page-data';
import { SeoIntroBlock } from '@/components/seo/SeoIntroBlock';
import { Breadcrumbs } from '@/components/seo/Breadcrumbs';
import { AuctionType } from '@/types';
import SubastasListClient from '../../SubastasListClient';

type PageProps = { params: Promise<{ tipo: string }> };
const SITE = 'https://subastasactivas.com';

/**
 * Map the SEO TipoSlug to the canonical lowercase AuctionType the URL filter
 * layer uses (`filters.types[]` + `auctionTypes=` query param).
 *
 * DB UPPERCASE keys feed the prisma queries in page-data.ts; the API filter
 * layer normalises the lowercase ids. We mirror that mapping here so the
 * locked filter the client sees matches what the user sees in the URL chip.
 */
const TIPO_SLUG_TO_AUCTION_TYPE: Readonly<Record<TipoSlug, AuctionType>> = {
  judicial: 'judicial',
  hacienda: 'aeat',
  'otras-tributarias': 'otras_tributarias',
  notarial: 'notarial',
  administrativas: 'administrativas',
};

function asTipoSlug(slug: string): TipoSlug | { redirectTo: TipoSlug } | null {
  if (slug in TIPO_SLUG_TO_DB_KEYS) return slug as TipoSlug;
  const alias = TIPO_ALIAS_TO_CANONICAL[slug];
  if (alias) return { redirectTo: alias };
  return null;
}

async function loadTipo(slug: TipoSlug) {
  const keys = TIPO_SLUG_TO_DB_KEYS[slug];
  const [count, minPrice] = await Promise.all([
    countActiveAuctions({ auctionTypeKeys: keys }),
    minStartingPrice({ auctionTypeKeys: keys }),
  ]);
  return { count, minPrice, label: TIPO_LABEL_PLURAL[slug] };
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
  const slug = r as TipoSlug;
  const data = await loadTipo(slug);
  const { count, minPrice, label } = data;
  const lockedAuctionType = TIPO_SLUG_TO_AUCTION_TYPE[slug];

  const introSlot = (
    <>
      <Breadcrumbs
        items={[
          { label: 'Inicio', href: '/' },
          { label: 'Subastas', href: '/subastas' },
          { label: `Subastas ${label}`, href: `/subastas/tipo/${tipo}` },
        ]}
      />
      <SeoIntroBlock
        count={count}
        noun={`subastas ${label}`}
        location="España"
        minPrice={minPrice}
        guideHref={`/guia/subastas-${tipo}-como-funcionan`}
        guideLabel="Cómo funcionan estas subastas"
      />
    </>
  );

  return (
    <Suspense fallback={<div className="min-h-screen bg-[--color-page]" />}>
      <SubastasListClient
        lockedFilter={{ type: lockedAuctionType }}
        seoTitle={`Subastas ${label} en España`}
        seoIntroSlot={introSlot}
      />
    </Suspense>
  );
}
