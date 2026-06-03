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

// Card price hierarchy (Dennis-locked 2026-06-03): Tasación PRIMARY on every
// card surface. SEO cards previously led with currentBid → minimumBid; both
// are demoted. minimumBid is no longer surfaced as the headline (lives on
// detail page only). currentBid stays as the last-resort fallback when no
// Tasación is projected for the row.
function priceLabel(r: Row): { value: string; label: string } {
  if (r.appraisalValue && r.appraisalValue > 0) {
    return { value: EUR.format(r.appraisalValue), label: 'Tasación' };
  }
  if (r.currentBid && r.currentBid > 0) {
    return { value: EUR.format(r.currentBid), label: 'Puja actual' };
  }
  return { value: 'Sin precio publicado', label: '' };
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
          const price = priceLabel(a);
          return (
            <li key={a.id} className="rounded-md border border-[--color-border] p-4 hover:shadow-md transition-shadow">
              <Link href={`/subastas/subasta/${slug}`} className="block">
                <div className="text-[10px] uppercase tracking-wider text-[--color-text-muted]">{a.category}</div>
                <h3 className="text-sm font-semibold mt-1 line-clamp-2">
                  {a.title || `${a.category} en ${a.province ?? 'España'}`}
                </h3>
                {where ? <div className="text-xs text-[--color-text-muted] mt-1">{where}</div> : null}
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="text-sm font-semibold">{price.value}</span>
                  {price.label ? (
                    <span className="text-[10px] uppercase tracking-wide text-[--color-text-muted]">{price.label}</span>
                  ) : null}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
