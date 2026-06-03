/**
 * /subastas/provincia/[provincia] — province programmatic SEO page.
 *
 * 52 provinces. Always indexable (07 §6.1 — single-dimension head/mid keyword).
 * Empty province (valid entity, 0 active) → 200 + noindex,follow + helpful state.
 * Invalid slug → 404.
 *
 * SEO template (07 §3.1): live count in title, H1, meta 150-155, ≥90-word intro
 * with min price + date variables, BreadcrumbList + ItemList + CollectionPage JSON-LD.
 *
 * Layout (2026-06-03): renders SubastasListClient with `lockedFilter.province`
 * so users see the shared 2-col sidebar + card-row list, pre-filtered for this
 * province. The SEO H1, breadcrumb, intro block, JSON-LD, internal-link cluster
 * are all preserved server-rendered in the indexable HTML.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import {
  PROVINCE_SLUG_TO_DB_KEY,
  provinceLabelForSlug,
  TIPO_SLUGS,
  TIPO_LABEL_PLURAL,
} from '@/lib/seo/slugs';
import {
  countActiveAuctions,
  minStartingPrice,
  municipalitiesInProvince,
} from '@/lib/seo/page-data';
import { SeoIntroBlock } from '@/components/seo/SeoIntroBlock';
import { Breadcrumbs } from '@/components/seo/Breadcrumbs';
import { capitalizeLocation } from '@/lib/utils';
import SubastasListClient from '../../SubastasListClient';

type PageProps = { params: Promise<{ provincia: string }> };

const SITE = 'https://subastasactivas.com';

async function loadProvince(slug: string) {
  const dbKey = PROVINCE_SLUG_TO_DB_KEY[slug];
  if (!dbKey) return null;
  const label = provinceLabelForSlug(slug) ?? dbKey;
  // The SubastasListClient fetches the canonical /api/auctions data (BigInt-
  // safe, paginated) just like /subastas does — we only need count + min
  // price + municipalities here for the SEO header/footer slots.
  const [count, minPrice, municipalities] = await Promise.all([
    countActiveAuctions({ province: dbKey }),
    minStartingPrice({ province: dbKey }),
    municipalitiesInProvince(dbKey),
  ]);
  return { dbKey, label, count, minPrice, municipalities };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { provincia } = await params;
  const data = await loadProvince(provincia);
  if (!data) return { title: 'Provincia no encontrada' };
  const { label, count } = data;
  const title = `${count.toLocaleString('es-ES')} subastas en ${label} · estado en vivo | dnksubastas`;
  const description = `${count.toLocaleString('es-ES')} subastas públicas activas en ${label}: judiciales, de Hacienda, notariales y más, con su estado en vivo y enlace oficial al BOE. Actualizado a diario.`.slice(0, 158);
  const canonical = `${SITE}/subastas/provincia/${provincia}`;
  const robots = count > 0 ? 'index,follow' : 'noindex,follow';
  return {
    title,
    description,
    alternates: { canonical },
    robots,
  };
}

export default async function ProvinciaPage({ params }: PageProps) {
  const { provincia } = await params;
  const data = await loadProvince(provincia);
  if (!data) notFound();
  const { dbKey, label, count, minPrice, municipalities } = data;

  const collectionLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `Subastas públicas en ${label}`,
    description: `Subastas públicas activas en ${label}.`,
    url: `${SITE}/subastas/provincia/${provincia}`,
  };

  // SEO intro slot (Breadcrumb + SeoIntroBlock) renders ABOVE the 2-col body
  // so it stays in the indexable HTML. The H1 ("Subastas públicas en {label}")
  // is passed via `seoTitle` so the page has exactly one indexable H1 — the
  // layout suppresses its own "N resultados" H1 when seoTitle is set.
  const introSlot = (
    <>
      <Breadcrumbs
        items={[
          { label: 'Inicio', href: '/' },
          { label: 'Subastas', href: '/subastas' },
          { label, href: `/subastas/provincia/${provincia}` },
        ]}
      />
      <SeoIntroBlock
        count={count}
        noun="subastas públicas"
        location={label}
        minPrice={minPrice}
        guideHref="/guia/como-funcionan-las-subastas-boe"
        guideLabel="Cómo funcionan las subastas BOE"
      />
    </>
  );

  // SEO footer slot — municipality + tipo internal-link clusters (kept for
  // crawl depth) and CollectionPage JSON-LD. Rendered below the result list.
  const footerSlot = (
    <>
      {municipalities.length > 0 && (
        <section className="mt-2">
          <h2 className="text-lg font-semibold mb-3">Por municipio en {label}</h2>
          <ul className="flex flex-wrap gap-2">
            {municipalities.map((m) => (
              <li key={m.name}>
                <Link
                  href={`/subastas?province=${encodeURIComponent(dbKey)}&municipality=${encodeURIComponent(m.name)}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-[--color-border] text-xs hover:bg-[--color-surface-muted]"
                >
                  <span>{capitalizeLocation(m.name)}</span>
                  <span className="text-[--color-text-muted] tnum">({m.count.toLocaleString('es-ES')})</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-lg font-semibold mb-3">Por tipo de subasta en {label}</h2>
        <ul className="flex flex-wrap gap-2">
          {TIPO_SLUGS.map((t) => (
            <li key={t}>
              <Link
                href={`/subastas/tipo/${t}`}
                className="inline-block px-3 py-1 rounded-full border border-[--color-border] text-xs hover:bg-[--color-surface-muted]"
              >
                {TIPO_LABEL_PLURAL[t]}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionLd) }} />
    </>
  );

  return (
    <Suspense fallback={<div className="min-h-screen bg-[--color-page]" />}>
      <SubastasListClient
        lockedFilter={{ province: dbKey }}
        seoTitle={`Subastas públicas en ${label}`}
        seoIntroSlot={introSlot}
        seoFooterSlot={footerSlot}
      />
    </Suspense>
  );
}
