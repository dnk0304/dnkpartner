/**
 * SeoTownContentBlock — the finished-only / upcoming-only town CONTENT BLOCK
 * (Phase B, Forge 2026-08-24).
 *
 * Rendered SERVER-side for a town whose ACTIVE display count is 0 but which is
 * still indexable (it has upcoming and/or finished-with-result inventory). It
 * exists to do two things at once:
 *
 *   1. Anti-thin — give an indexed finished-only town a genuine, unique block
 *      of content (recent sold/deserted results + any upcoming teaser) instead
 *      of the dead-end "no active auctions, create an alert" empty state.
 *   2. Anti-SSR-gap — emit REAL crawlable <a href> to individual detail pages.
 *      The active-only SSR grid (`findScopedAuctionsPage`) renders zero anchors
 *      for these towns, so Googlebot had no internal crawl path into their
 *      detail pages. Every card here is a server-rendered anchor.
 *
 * Section A (Próximas subastas) reuses <SeoAuctionGrid> — the same crawlable
 * card + ItemList JSON-LD the active hubs use. Section B (Resultados recientes)
 * is a compact, capped teaser list — anchors + outcome (Adjudicada/Desierta) +
 * sold price/date — a LINK to the detail/archive, never a full duplicate of the
 * deep /resultados archive.
 */

import Link from 'next/link';
import { SeoAuctionGrid } from '@/components/seo/SeoAuctionGrid';
import type {
  ScopedAuctionCard,
  ConcludedResultCard,
} from '@/lib/seo/page-data';

const EUR = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

export type SeoTownContentBlockLabels = {
  upcomingHeading: string;
  resultsHeading: string;
  /** Fallback empty text (should not show when the block is only rendered for indexable towns). */
  emptyMessage?: string;
  /** es label for an ADJUDICADA outcome. */
  soldLabel: string;
  /** es label for a DESIERTA outcome. */
  desertedLabel: string;
};

export type SeoTownContentBlockProps = {
  upcoming: ScopedAuctionCard[];
  concluded: ConcludedResultCard[];
  labels: SeoTownContentBlockLabels;
};

function outcomeLabel(saleResult: string | null, labels: SeoTownContentBlockLabels): string | null {
  if (saleResult === 'ADJUDICADA') return labels.soldLabel;
  if (saleResult === 'DESIERTA') return labels.desertedLabel;
  return null;
}

export function SeoTownContentBlock({ upcoming, concluded, labels }: SeoTownContentBlockProps) {
  // Pinned time zone (Europe/Madrid): an unpinned formatter renders the
  // container's zone on the server and the visitor's in the browser → SSR/
  // hydration skew. soldDate is a Spanish auction date; Madrid is the site zone.
  const dateFmt = new Intl.DateTimeFormat('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Europe/Madrid',
  });

  // ItemList JSON-LD for the concluded teaser — same url the anchor points at.
  const concludedJsonLd =
    concluded.length > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          itemListElement: concluded.map((a, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            url: `https://subastasactivas.com${a.detailPath}`,
            name: a.title || `Subasta ${a.category}`,
          })),
        }
      : null;

  return (
    <div className="space-y-10">
      {/* Section A — upcoming teaser (crawlable cards + ItemList via SeoAuctionGrid). */}
      {upcoming.length > 0 && (
        <section aria-label={labels.upcomingHeading}>
          <h2 className="text-lg font-semibold mb-3">{labels.upcomingHeading}</h2>
          <SeoAuctionGrid auctions={upcoming} emptyMessage={labels.emptyMessage} />
        </section>
      )}

      {/* Section B — recent results teaser. Compact anchored list, capped. */}
      {concluded.length > 0 && (
        <section aria-label={labels.resultsHeading}>
          <h2 className="text-lg font-semibold mb-3">{labels.resultsHeading}</h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {concluded.map((a) => {
              const region = [a.municipality, a.province].filter(Boolean).join(', ');
              const addr = (a.address ?? '').trim();
              const where = addr ? [addr, region].filter(Boolean).join(' · ') : region;
              const label = outcomeLabel(a.saleResult, labels);
              const priceEuros =
                a.soldPriceCents != null && a.soldPriceCents > 0
                  ? EUR.format(a.soldPriceCents / 100)
                  : null;
              return (
                <li
                  key={a.id}
                  className="rounded-md border border-[var(--color-border)] p-4 hover:shadow-md transition-shadow"
                >
                  <Link href={a.detailPath} className="block">
                    <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                      {a.category}
                    </div>
                    <h3 className="text-sm font-semibold mt-1 line-clamp-2">
                      {a.title || `${a.category} en ${a.province ?? 'España'}`}
                    </h3>
                    {where ? (
                      <div className="text-xs text-[var(--color-text-muted)] mt-1">{where}</div>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      {label ? (
                        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
                      ) : null}
                      {priceEuros ? (
                        <span className="text-sm font-semibold">{priceEuros}</span>
                      ) : null}
                      {a.soldDate ? (
                        <span className="text-[11px] text-[var(--color-text-muted)]">
                          {dateFmt.format(a.soldDate)}
                        </span>
                      ) : null}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          {concludedJsonLd ? (
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{ __html: JSON.stringify(concludedJsonLd) }}
            />
          ) : null}
        </section>
      )}
    </div>
  );
}
