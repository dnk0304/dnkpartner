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
 */

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import {
  CATEGORY_SLUG_TO_DB_LABEL,
  CATEGORY_LABEL_PLURAL,
  CATEGORY_ALIAS_TO_CANONICAL,
  RESERVED_SEGMENTS,
  isOfficialCategory,
  CATEGORY_INDEX_THRESHOLD,
  type CategorySlug,
} from '@/lib/seo/slugs';
import { countActiveAuctions, findActiveAuctions, minStartingPrice } from '@/lib/seo/page-data';
import { SeoIntroBlock } from '@/components/seo/SeoIntroBlock';
import { Breadcrumbs } from '@/components/seo/Breadcrumbs';
import { SeoAuctionGrid } from '@/components/seo/SeoAuctionGrid';

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
  // After the two guards above, r is narrowed to { kind: 'canonical', ... }.
  if (r.kind !== 'canonical') notFound();
  const { slug, dbLabel } = r;
  const plural = CATEGORY_LABEL_PLURAL[slug];

  const [count, auctions, minPrice] = await Promise.all([
    countActiveAuctions({ category: dbLabel }),
    findActiveAuctions({ category: dbLabel, take: 24 }),
    minStartingPrice({ category: dbLabel }),
  ]);

  return (
    <main className="mx-auto max-w-editorial px-4 md:px-6 py-8">
      <Breadcrumbs
        items={[
          { label: 'Inicio', href: '/' },
          { label: 'Subastas', href: '/subastas' },
          { label: `Subastas de ${plural}`, href: `/subastas/${categoria}` },
        ]}
      />
      <header className="mb-4">
        <h1 className="text-2xl md:text-3xl font-bold">Subastas de {plural}</h1>
        <div className="text-sm text-[--color-text-muted] mt-1">
          {count.toLocaleString('es-ES')} subastas activas
        </div>
      </header>

      <SeoIntroBlock
        count={count}
        noun={`subastas de ${plural}`}
        location="España"
        minPrice={minPrice}
        guideHref={`/guia/subastas-de-${categoria}`}
        guideLabel={`Guía: subastas de ${plural}`}
      />

      <SeoAuctionGrid auctions={auctions as any} />
    </main>
  );
}
