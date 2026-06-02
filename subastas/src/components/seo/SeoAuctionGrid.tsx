/**
 * SeoAuctionGrid — server-rendered, SEO-friendly auction grid.
 *
 * Plain server-component cards with crawlable anchor links to the new
 * /subastas/subasta/{slug} detail pages. No client-side JS required for the
 * SEO-load path (the existing /subastas listing UI keeps its richer filters).
 *
 * Emits ItemList JSON-LD (07 §3.3) for the visible auctions.
 */

import Link from 'next/link';
import { buildAuctionSlug, type AuctionForSlug } from '@/lib/seo/auction-slug';

type Row = AuctionForSlug & {
  title: string | null;
  category: string;
  status: string;
  currentBid: number | null;
  minimumBid: number | null;
  appraisalValue: number | null;
  endsAt: Date | null;
};

const EUR = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

function priceLabel(r: Row): string {
  const p = (r.currentBid && r.currentBid > 0 ? r.currentBid : null)
    ?? (r.minimumBid && r.minimumBid > 0 ? r.minimumBid : null)
    ?? (r.appraisalValue && r.appraisalValue > 0 ? r.appraisalValue : null);
  return p ? EUR.format(p) : 'Sin precio publicado';
}

export function SeoAuctionGrid({ auctions, emptyMessage }: { auctions: Row[]; emptyMessage?: string }) {
  if (!auctions.length) {
    return (
      <div className="rounded-md border border-[--color-border] p-6 text-sm text-[--color-text-muted]">
        {emptyMessage ?? 'No hay subastas activas ahora mismo. Crea una alerta y te avisamos en cuanto haya novedades.'}
      </div>
    );
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: auctions.map((a, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `https://subastasactivas.com/subastas/subasta/${buildAuctionSlug(a)}`,
      name: a.title || `Subasta ${a.category}`,
    })),
  };

  return (
    <>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {auctions.map((a) => {
          const slug = buildAuctionSlug(a);
          const where = [a.municipality, a.province].filter(Boolean).join(', ');
          return (
            <li key={a.id} className="rounded-md border border-[--color-border] p-4 hover:shadow-md transition-shadow">
              <Link href={`/subastas/subasta/${slug}`} className="block">
                <div className="text-[10px] uppercase tracking-wider text-[--color-text-muted]">{a.category}</div>
                <h3 className="text-sm font-semibold mt-1 line-clamp-2">
                  {a.title || `${a.category} en ${a.province ?? 'España'}`}
                </h3>
                {where ? <div className="text-xs text-[--color-text-muted] mt-1">{where}</div> : null}
                <div className="text-sm font-medium mt-2">{priceLabel(a)}</div>
              </Link>
            </li>
          );
        })}
      </ul>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
