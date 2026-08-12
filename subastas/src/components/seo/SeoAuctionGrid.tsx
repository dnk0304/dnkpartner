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
import { ParticiparButton } from '@/components/auction/ParticiparButton';

type Row = AuctionForSlug & {
  /**
   * The detail path this card must link at — the minted v3 url, or the legacy
   * path when the auction has no minted row / the switch is off.
   *
   * ADDITIVE + OPTIONAL (Forge 2026-08-05) so pre-projection call sites still
   * compile; absent falls back to the legacy builder below, which is exactly
   * what this component did unconditionally before.
   */
  detailPath?: string | null;
  title: string | null;
  category: string;
  status: string;
  currentBid: number | null;
  minimumBid: number | null;
  appraisalValue: number | null;
  /**
   * Valor subasta — distinct from `appraisalValue` (Tasación) after Ghost's
   * 2026-06-04 split (commit `443a864`). Optional on the SEO row type — the
   * SEO read path will pick it up automatically once the query selects it,
   * and the renderer below stays honest-NULL when absent.
   */
  valorSubasta?: number | null;
  /**
   * Cantidad reclamada — third labelled value rendered on each SEO card when
   * present (honest-NULL). Optional so existing SEO routes pre-projection
   * compile without change.
   */
  claimedAmount?: number | null;
  endsAt: Date | null;
  /**
   * Street address — PUBLIC (Dennis 2026-07-31: auction data is fully
   * ungated). Shown as the card's location line when present; falls back to
   * municipality + province. Optional so pre-projection call sites still
   * compile.
   */
  address?: string | null;
};

const EUR = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

// Three-value display (Dennis-locked 2026-06-04, brief
// `three-values-card-display`): Tasación + Valor subasta + Cantidad reclamada
// as three labelled lines. Honest-NULL: each line is OMITTED when its field
// is null/≤0. The first present value (in display order) is shown larger as
// the SEO card's headline; the rest read as compact secondary captions
// underneath.
type ValueLine = { key: string; label: string; amount: number };

function valueLinesFor(r: Row): ValueLine[] {
  const out: ValueLine[] = [];
  if (r.appraisalValue && r.appraisalValue > 0) {
    out.push({ key: 'tasacion', label: 'Tasación', amount: r.appraisalValue });
  }
  if (r.valorSubasta && r.valorSubasta > 0) {
    out.push({ key: 'valorSubasta', label: 'Valor subasta', amount: r.valorSubasta });
  }
  if (r.claimedAmount && r.claimedAmount > 0) {
    out.push({ key: 'claimedAmount', label: 'Cantidad reclamada', amount: r.claimedAmount });
  }
  return out;
}

export function SeoAuctionGrid({ auctions, emptyMessage }: { auctions: Row[]; emptyMessage?: string }) {
  if (!auctions.length) {
    return (
      <div className="rounded-md border border-[var(--color-border)] p-6 text-sm text-[var(--color-text-muted)]">
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
      // Same resolved path as the anchor below — the ItemList and the <a> must
      // not disagree about where an item lives.
      url: `https://subastasactivas.com${a.detailPath ?? `/subastas/subasta/${buildAuctionSlug(a)}`}`,
      name: a.title || `Subasta ${a.category}`,
    })),
  };

  return (
    <>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {auctions.map((a) => {
          // v3 when minted, legacy otherwise. Resolved server-side in
          // `findScopedAuctionsPage` (one batched probe per page); the fallback
          // here keeps any caller that has not projected the field working.
          const slug = buildAuctionSlug(a);
          const href = a.detailPath ?? `/subastas/subasta/${slug}`;
          // Full public location line: prefer the real street address (ungated
          // 2026-07-31), append the town/province for context; fall back to
          // town + province when no address is stored.
          const region = [a.municipality, a.province].filter(Boolean).join(', ');
          const addr = (a.address ?? '').trim();
          const where = addr ? [addr, region].filter(Boolean).join(' · ') : region;
          const lines = valueLinesFor(a);
          // Fallback to currentBid only when NONE of the three primary values
          // exist (keeps the existing "Sin precio publicado" affordance).
          const fallbackBid =
            lines.length === 0 && a.currentBid && a.currentBid > 0
              ? { key: 'currentBid', label: 'Puja actual', amount: a.currentBid }
              : null;
          return (
            <li key={a.id} className="rounded-md border border-[var(--color-border)] p-4 hover:shadow-md transition-shadow">
              <Link href={href} className="block">
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">{a.category}</div>
                <h3 className="text-sm font-semibold mt-1 line-clamp-2">
                  {a.title || `${a.category} en ${a.province ?? 'España'}`}
                </h3>
                {where ? <div className="text-xs text-[var(--color-text-muted)] mt-1">{where}</div> : null}
                {/* Three-value labelled stack — first value is the SEO card's
                    headline, others render as compact secondary captions.
                    Honest-NULL: each line is OMITTED when absent. */}
                {lines.length > 0 ? (
                  <div className="mt-2 space-y-0.5">
                    {lines.map((line, i) => (
                      <div key={line.key} className="flex items-baseline gap-1.5">
                        <span
                          className={
                            i === 0
                              ? 'text-sm font-semibold'
                              : 'text-xs font-medium text-[var(--color-text-muted)]'
                          }
                        >
                          {EUR.format(line.amount)}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
                          {line.label}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : fallbackBid ? (
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="text-sm font-semibold">{EUR.format(fallbackBid.amount)}</span>
                    <span className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
                      {fallbackBid.label}
                    </span>
                  </div>
                ) : (
                  <div className="mt-2 text-sm text-[var(--color-text-muted)]">Sin precio publicado</div>
                )}
              </Link>
              {/* Participar CTA — client island, a SIBLING of the crawlable
                  <Link> above (never nested inside it: a <button> inside an
                  <a> is invalid HTML and would break the wave167 crawl path).
                  Carries only the auction id + slug; the official URL is
                  resolved server-side by /api/participar/[id]. */}
              <div className="mt-3">
                <ParticiparButton auctionId={a.id} slug={slug} detailPath={href} size="sm" />
              </div>
            </li>
          );
        })}
      </ul>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
