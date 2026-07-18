/**
 * StatTiles — the headline KPI row for the registry overview + region headers.
 * Server-safe (pure). Numbers come from readSummary(); the sold figure is the
 * median PUJA MÁXIMA (highest bid) and is labelled as such, never as a sale.
 */

import { formatPrice } from '@/components/observatory/format';
import {
  OUTCOME_VIZ,
  type Locale,
  type RegistrySummary,
  type ResultadosCopy,
} from '@/lib/registro/registro-ui';

function nf(locale: Locale) {
  return (n: number) => n.toLocaleString(locale === 'en' ? 'en-US' : 'es-ES');
}

function share(part: number, total: number): string {
  if (total <= 0) return '—';
  return `${((part / total) * 100).toFixed(1)}%`;
}

interface Tile {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  big?: boolean;
}

export function StatTiles({
  summary,
  locale,
  copy,
}: {
  summary: RegistrySummary;
  locale: Locale;
  copy: ResultadosCopy;
}) {
  const fmt = nf(locale);
  const h = summary.headline;
  const total = h.registryTotal;
  const medianBid = h.soldPriceMedianCents != null ? formatPrice(h.soldPriceMedianCents / 100) : '—';
  const medianDisc = h.discountToAppraisalMedian != null ? `${h.discountToAppraisalMedian}%` : '—';

  const tiles: Tile[] = [
    { label: copy.statTotal, value: fmt(total), big: true },
    { label: copy.statSold, value: fmt(h.counts.VENDIDA), sub: share(h.counts.VENDIDA, total), accent: OUTCOME_VIZ.VENDIDA.light },
    { label: copy.statNoBids, value: fmt(h.counts.DESIERTA), sub: share(h.counts.DESIERTA, total), accent: OUTCOME_VIZ.DESIERTA.light },
    { label: copy.statCancelled, value: fmt(h.counts.CANCELADA), sub: share(h.counts.CANCELADA, total), accent: OUTCOME_VIZ.CANCELADA.light },
    { label: copy.statMedianBid, value: medianBid },
    { label: copy.statMedianDiscount, value: medianDisc, sub: copy.discountVsAppraisal },
  ];

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((t, i) => (
        <div
          key={i}
          className={`rounded-[var(--radius-lg)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-3.5 ${
            t.big ? 'col-span-2 sm:col-span-1' : ''
          }`}
        >
          <dt className="flex items-center gap-1.5 text-xs text-[var(--color-ink-tertiary)]">
            {t.accent ? (
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: t.accent }} aria-hidden />
            ) : null}
            {t.label}
          </dt>
          <dd className="tnum mt-1 text-xl font-semibold text-[var(--color-ink-primary)]">{t.value}</dd>
          {t.sub ? <dd className="tnum mt-0.5 text-xs text-[var(--color-ink-quiet)]">{t.sub}</dd> : null}
        </div>
      ))}
    </dl>
  );
}
