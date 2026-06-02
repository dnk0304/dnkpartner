/**
 * /subastas/provincia/[provincia] — province programmatic SEO page.
 *
 * 52 provinces. Always indexable (07 §6.1 — single-dimension head/mid keyword).
 * Empty province (valid entity, 0 active) → 200 + noindex,follow + helpful state.
 * Invalid slug → 404.
 *
 * SEO template (07 §3.1): live count in title, H1, meta 150-155, ≥90-word intro
 * with min price + date variables, BreadcrumbList + ItemList + CollectionPage JSON-LD.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  PROVINCE_SLUG_TO_DB_KEY,
  provinceLabelForSlug,
  TIPO_SLUGS,
  TIPO_LABEL_PLURAL,
} from '@/lib/seo/slugs';
import { countActiveAuctions, findActiveAuctions, minStartingPrice } from '@/lib/seo/page-data';
import { SeoIntroBlock } from '@/components/seo/SeoIntroBlock';
import { Breadcrumbs } from '@/components/seo/Breadcrumbs';
import { SeoAuctionGrid } from '@/components/seo/SeoAuctionGrid';

type PageProps = { params: Promise<{ provincia: string }> };

const SITE = 'https://subastasactivas.com';

async function loadProvince(slug: string) {
  const dbKey = PROVINCE_SLUG_TO_DB_KEY[slug];
  if (!dbKey) return null;
  const label = provinceLabelForSlug(slug) ?? dbKey;
  const [count, auctions, minPrice] = await Promise.all([
    countActiveAuctions({ province: dbKey }),
    findActiveAuctions({ province: dbKey, take: 24 }),
    minStartingPrice({ province: dbKey }),
  ]);
  return { dbKey, label, count, auctions, minPrice };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { provincia } = await params;
  const data = await loadProvince(provincia);
  if (!data) return { title: 'Provincia no encontrada' };
  const { label, count } = data;
  const title = `${count.toLocaleString('es-ES')} subastas en ${label} · estado en vivo | dnksubastas`;
  const description = `${count.toLocaleString('es-ES')} subastas públicas activas en ${label}: judiciales, de Hacienda, notariales y más, con su estado en vivo y enlace oficial al BOE. Actualizado a diario.`.slice(0, 158);
  const canonical = `${SITE}/subastas/provincia/${provincia}`;
  // Empty province: noindex,follow — still 200 (07 §6.2)
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
  const { label, count, auctions, minPrice } = data;

  const collectionLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `Subastas públicas en ${label}`,
    description: `Subastas públicas activas en ${label}.`,
    url: `${SITE}/subastas/provincia/${provincia}`,
  };

  return (
    <main className="mx-auto max-w-editorial px-4 md:px-6 py-8">
      <Breadcrumbs
        items={[
          { label: 'Inicio', href: '/' },
          { label: 'Subastas', href: '/subastas' },
          { label, href: `/subastas/provincia/${provincia}` },
        ]}
      />
      <header className="mb-4">
        <h1 className="text-2xl md:text-3xl font-bold">Subastas públicas en {label}</h1>
        <div className="text-sm text-[--color-text-muted] mt-1">
          {count.toLocaleString('es-ES')} subastas activas
        </div>
      </header>

      <SeoIntroBlock
        count={count}
        noun="subastas públicas"
        location={label}
        minPrice={minPrice}
        guideHref="/guia/como-funcionan-las-subastas-boe"
        guideLabel="Cómo funcionan las subastas BOE"
      />

      <SeoAuctionGrid auctions={auctions as any} />

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
    </main>
  );
}
