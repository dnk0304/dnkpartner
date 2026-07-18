/**
 * ResultadoRow — one concluded-auction row in the /resultados archive.
 *
 * Framework-neutral (no 'use client', no async, no server-only imports) so the
 * SSR region pages AND the client filter island render the IDENTICAL markup.
 * The whole row is a real <a href={detailPath}> — this is the crawl path that
 * de-orphans the ~200k concluded detail pages, so it MUST render as an anchor
 * in the server HTML (view-source shows the href).
 *
 * Honesty: VENDIDA shows the sold figure labelled "Puja máxima" (highest bid),
 * NEVER "precio de venta". CANCELADA carries no fabricated price.
 */

import Link from 'next/link';
import { auctionCardTitle } from '@/lib/seo/display-title';
import { formatPrice, formatDateMed } from '@/components/observatory/format';
import { capitalizeLocation } from '@/lib/utils';
import {
  OUTCOME_META,
  OUTCOME_VIZ,
  PUJA_MAXIMA_LABEL,
  type Locale,
  type RegistroListItem,
  type RegistryOutcome,
} from '@/lib/registro/registro-ui';

function discountPct(soldCents: number | null, appraisalEuros: number | null): number | null {
  if (soldCents == null || appraisalEuros == null || appraisalEuros <= 0) return null;
  const soldEuros = soldCents / 100;
  const pct = Math.round((1 - soldEuros / appraisalEuros) * 100);
  return pct > 0 && pct < 100 ? pct : null;
}

export function ResultadoRow({ item, locale }: { item: RegistroListItem; locale: Locale }) {
  const isRegistry = (item.outcome as string) in OUTCOME_META;
  const outcome = (isRegistry ? item.outcome : 'FINALIZADA_SIN_RESULTADO') as RegistryOutcome;
  const meta = OUTCOME_META[outcome];
  const label = locale === 'en' ? meta.en : meta.es;
  const dot = OUTCOME_VIZ[outcome].light;

  const title = auctionCardTitle({
    category: item.category,
    propertyType: item.category,
    municipality: item.municipality,
    province: item.province,
  });

  const place = [item.municipality, item.province]
    .filter(Boolean)
    .map((s) => capitalizeLocation(s as string))
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(', ');

  const soldEuros = item.soldPriceCents != null ? item.soldPriceCents / 100 : null;
  const disc = discountPct(item.soldPriceCents, item.appraisalValue);
  const dateStr = formatDateMed(item.soldDate ?? item.endsAt, locale);

  return (
    <li>
      <Link
        href={item.detailPath}
        className="group flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-3.5 transition-colors hover:bg-[var(--color-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-action)] sm:flex-row sm:items-center sm:gap-4"
      >
        {/* Outcome badge */}
        <span
          className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border border-[var(--color-hairline)] bg-[var(--color-page)] px-2.5 py-1 text-xs font-medium sm:w-[172px]"
          aria-hidden={false}
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: dot }}
          />
          {label}
        </span>

        {/* Title + place */}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-[var(--color-ink-primary)] group-hover:underline">
            {title}
          </span>
          {place ? (
            <span className="block truncate text-xs text-[var(--color-ink-tertiary)]">{place}</span>
          ) : null}
        </span>

        {/* Result figure */}
        <span className="shrink-0 text-left sm:w-[164px] sm:text-right">
          {outcome === 'VENDIDA' && soldEuros ? (
            <>
              <span className="block text-[11px] uppercase tracking-wide text-[var(--color-ink-quiet)]">
                {PUJA_MAXIMA_LABEL[locale]}
              </span>
              <span className="tnum block text-sm font-semibold text-[var(--color-ink-primary)]">
                {formatPrice(soldEuros)}
              </span>
              {disc != null ? (
                <span className="tnum block text-[11px] text-[var(--color-ink-tertiary)]">
                  −{disc}% {locale === 'en' ? 'vs appraisal' : 'sobre tasación'}
                </span>
              ) : null}
            </>
          ) : (
            <span className="tnum block text-xs text-[var(--color-ink-quiet)]">{dateStr}</span>
          )}
        </span>
      </Link>
    </li>
  );
}
