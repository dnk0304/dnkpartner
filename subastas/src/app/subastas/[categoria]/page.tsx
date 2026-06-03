/**
 * /subastas/[categoria] — property/asset category programmatic SEO page.
 *
 * Reserved-word guard (07 §1.6): the slot rejects provincia / tipo / subasta /
 * en / guia / page / api / studio / etc. — those belong to other grammar.
 * Alias slugs (07 §2.6) → 301 to canonical.
 *
 * Index/noindex gating (Forge flag (b) + 07 §6.1):
 *  - In OFFICIAL_CATEGORIES allowlist AND active count ≥ 5  → index,follow
 *  - In allowlist but below threshold                       → noindex,follow (200, empty-state)
 *  - Outside allowlist (stray "Oficinas" etc.)              → noindex,follow (200)
 *  - Reserved word                                          → 404 (notFound)
 *  - Unknown non-DB slug                                    → 404
 *
 * Layout (2026-06-03): renders the shared SubastasListClient with
 * `lockedFilter.category` so users see the 2-col sidebar + card-row list,
 * pre-filtered for this category. SEO H1, breadcrumb, intro block, JSON-LD,
 * metadata preserved server-side.
 */

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import {
  CATEGORY_SLUG_TO_DB_LABEL,
  CATEGORY_LABEL_PLURAL,
  CATEGORY_ALIAS_TO_CANONICAL,
  RESERVED_SEGMENTS,
  isOfficialCategory,
  CATEGORY_INDEX_THRESHOLD,
  type CategorySlug,
} from '@/lib/seo/slugs';
import { countActiveAuctions, minStartingPrice } from '@/lib/seo/page-data';
import { SeoIntroBlock } from '@/components/seo/SeoIntroBlock';
import { Breadcrumbs } from '@/components/seo/Breadcrumbs';
import SubastasListClient from '../SubastasListClient';

type PageProps = { params: Promise<{ categoria: string }> };
const SITE = 'https://subastasactivas.com';

type Resolved =
  | { kind: 'canonical'; slug: CategorySlug; dbLabel: string }
  | { kind: 'redirect'; to: CategorySlug }
  | { kind: 'reserved' | 'invalid' };

function resolve(slug: string): Resolved {
  if (RESERVED_SEGMENTS.has(slug)) return { kind: 'reserved' };
  if (slug in CATEGORY_SLUG_TO_DB_LABEL) {
    const s = slug as CategorySlug;
    return { kind: 'canonical', slug: s, dbLabel: CATEGORY_SLUG_TO_DB_LABEL[s] };
  }
  const aliased = CATEGORY_ALIAS_TO_CANONICAL[slug];
  if (aliased) return { kind: 'redirect', to: aliased };
  return { kind: 'invalid' };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { categoria } = await params;
  const r = resolve(categoria);
  if (r.kind !== 'canonical') return { title: 'Categoría no encontrada' };
  const plural = CATEGORY_LABEL_PLURAL[r.slug];
  const count = await countActiveAuctions({ category: r.dbLabel });
  const title = `${count.toLocaleString('es-ES')} subastas de ${plural} · estado en vivo | dnksubastas`;
  const description = `${count.toLocaleString('es-ES')} subastas de ${plural} activas en toda España con estado en vivo, precio de salida y enlace al BOE. Encuentra ${plural} embargadas. Actualizado a diario.`.slice(0, 158);
  const indexable = isOfficialCategory(r.dbLabel) && count >= CATEGORY_INDEX_THRESHOLD;
  return {
    title,
    description,
    alternates: { canonical: `${SITE}/subastas/${categoria}` },
    robots: indexable ? 'index,follow' : 'noindex,follow',
  };
}

export default async function CategoriaPage({ params }: PageProps) {
  const { categoria } = await params;
  const r = resolve(categoria);
  if (r.kind === 'reserved' || r.kind === 'invalid') notFound();
  if (r.kind === 'redirect') redirect(`/subastas/${r.to}`);
  if (r.kind !== 'canonical') notFound();
  const { slug, dbLabel } = r;
  const plural = CATEGORY_LABEL_PLURAL[slug];

  const [count, minPrice] = await Promise.all([
    countActiveAuctions({ category: dbLabel }),
    minStartingPrice({ category: dbLabel }),
  ]);

  const introSlot = (
    <>
      <Breadcrumbs
        items={[
          { label: 'Inicio', href: '/' },
          { label: 'Subastas', href: '/subastas' },
          { label: `Subastas de ${plural}`, href: `/subastas/${categoria}` },
        ]}
      />
      <SeoIntroBlock
        count={count}
        noun={`subastas de ${plural}`}
        location="España"
        minPrice={minPrice}
        guideHref={`/guia/subastas-de-${categoria}`}
        guideLabel={`Guía: subastas de ${plural}`}
      />
    </>
  );

  return (
    <Suspense fallback={<div className="min-h-screen bg-[--color-page]" />}>
      <SubastasListClient
        lockedFilter={{ category: dbLabel }}
        seoTitle={`Subastas de ${plural}`}
        seoIntroSlot={introSlot}
      />
    </Suspense>
  );
}
