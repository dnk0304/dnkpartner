/**
 * NoticiaCharts — server-rendered, zero-JS dataviz for the monthly per-province
 * recap article (/noticias/[provincia]/[period]). Pixel, 2026-07-20.
 *
 * ONE SYSTEM with /resultados: this composes the SAME validated primitives as
 * RegistroCharts / StatTiles — the CVD/contrast-validated OUTCOME_VIZ palette,
 * the outcomeVizStyle() theme scope, OUTCOME_META honest labels — so noticias
 * and resultados read identically. We do NOT fork the palette or invent colours;
 * we only add month-snapshot layouts (MoM pair, IQR range) that the multi-month
 * RegistrySummary components don't have, because a NoticiaStats row is a single
 * month, not a trend series.
 *
 * Every chart is pure SSR SVG/HTML (no client island → no RSC boundary hazard),
 * carries role="img" + aria-label, direct labels + a text legend (identity never
 * rests on colour alone), and native <title> hover tooltips.
 *
 * HONEST DEGRADE (the /resultados honesty rule):
 *  - median/IQR suppressed at small N → "muestra insuficiente", never a fake €.
 *  - price is ALWAYS "puja máxima" (highest bid), never "precio de venta".
 *  - zero-concluded month → outcome chart omitted, not drawn empty.
 *  - first edition (no prior month) → MoM comparison shows a note, not a fake 0.
 */
import {
  OUTCOME_VIZ,
  OUTCOME_META,
  outcomeVizStyle,
  PUJA_MAXIMA_LABEL,
  type Locale,
  type RegistryOutcome,
} from '@/lib/registro/registro-ui';
import { formatEur, type NoticiaStats } from '@/lib/noticias-monthly';

const VIZ_SCOPE = 'not-viz';

function nf(locale: Locale) {
  return (n: number) => n.toLocaleString(locale === 'en' ? 'en-US' : 'es-ES');
}

// --- bilingual chrome copy (kept local + typed, mirrors registro-ui's pattern) ---

interface ChartCopy {
  intake: string;
  concluded: string;
  awarded: string;
  medianBid: string;
  vsPrevMonth: (pct: string) => string;
  firstEdition: string;
  ofConcluded: string; // "% of concluded"
  outcomeTitle: string;
  outcomeSub: string;
  momTitle: string;
  momSub: string;
  thisMonth: string;
  prevMonth: string;
  priceTitle: string;
  priceSub: string;
  insufficient: string;
  insufficientNote: string;
  rangeNote: string;
  rankBadge: (rank: string) => string;
  rankSub: string;
  discountLabel: string;
  discountSub: string;
  notableTitle: string;
}

function copyFor(locale: Locale): ChartCopy {
  return locale === 'en'
    ? {
        intake: 'New auctions',
        concluded: 'Concluded',
        awarded: 'Awarded',
        medianBid: 'Median highest bid',
        vsPrevMonth: (p) => `${p} vs previous month`,
        firstEdition: 'First report — no previous month to compare.',
        ofConcluded: 'of concluded',
        outcomeTitle: 'Outcome of this month’s concluded auctions',
        outcomeSub: 'Share by result',
        momTitle: 'New auctions vs previous month',
        momSub: 'Auctions that entered the registry each month',
        thisMonth: 'This month',
        prevMonth: 'Previous',
        priceTitle: 'Award price range',
        priceSub: 'Highest bid on awarded lots — median with the middle 50%',
        insufficient: 'Insufficient sample',
        insufficientNote: 'Too few awarded lots this month to publish a reliable median.',
        rangeNote: 'p25 – median – p75',
        rankBadge: (r) => `#${r} of 52`,
        rankSub: 'provinces by new auctions this month',
        discountLabel: 'Median discount to appraisal',
        discountSub: 'How far the median highest bid sat below the official appraisal',
        notableTitle: 'Notable figures',
      }
    : {
        intake: 'Nuevas subastas',
        concluded: 'Concluidas',
        awarded: 'Adjudicadas',
        medianBid: 'Puja máxima mediana',
        vsPrevMonth: (p) => `${p} respecto al mes anterior`,
        firstEdition: 'Primer informe — sin mes anterior para comparar.',
        ofConcluded: 'de las concluidas',
        outcomeTitle: 'Resultado de las subastas concluidas este mes',
        outcomeSub: 'Reparto por resultado',
        momTitle: 'Nuevas subastas frente al mes anterior',
        momSub: 'Subastas que entraron en el registro cada mes',
        thisMonth: 'Este mes',
        prevMonth: 'Anterior',
        priceTitle: 'Rango de adjudicación',
        priceSub: 'Puja máxima de lo adjudicado — mediana con el 50% central',
        insufficient: 'Muestra insuficiente',
        insufficientNote: 'Muy pocas adjudicaciones este mes para publicar una mediana fiable.',
        rangeNote: 'p25 – mediana – p75',
        rankBadge: (r) => `#${r} de 52`,
        rankSub: 'provincias por nuevas subastas este mes',
        discountLabel: 'Descuento mediano sobre la tasación',
        discountSub: 'Cuánto quedó la puja máxima mediana por debajo de la tasación oficial',
        notableTitle: 'Datos destacados',
      };
}

// ---------------------------------------------------------------------------
// 1. Stat tiles — headline KPI row (mirrors StatTiles visual language).
// ---------------------------------------------------------------------------

function DeltaBadge({ pct, locale }: { pct: number; locale: Locale }) {
  const up = pct > 0;
  const flat = pct === 0;
  const color = flat
    ? 'var(--color-ink-quiet)'
    : up
      ? `var(${OUTCOME_VIZ.VENDIDA.cssVar})`
      : `var(${OUTCOME_VIZ.CANCELADA.cssVar})`;
  const arrow = flat ? '→' : up ? '↑' : '↓';
  const abs = Math.abs(pct);
  const str = `${arrow} ${abs.toLocaleString(locale === 'en' ? 'en-US' : 'es-ES')}%`;
  return (
    <span className="tnum inline-flex items-center gap-0.5 font-medium" style={{ color }}>
      {str}
    </span>
  );
}

function StatTiles({ stats, locale, c }: { stats: NoticiaStats; locale: Locale; c: ChartCopy }) {
  const fmt = nf(locale);
  const median = formatEur(stats.soldMedianCents, locale);
  const pctSold = stats.pctVendidas != null ? `${stats.pctVendidas}%` : null;

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {/* intake + MoM delta */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-3.5">
        <dt className="text-xs text-[var(--color-ink-tertiary)]">{c.intake}</dt>
        <dd className="tnum mt-1 text-xl font-semibold text-[var(--color-ink-primary)]">
          {fmt(stats.intake)}
        </dd>
        <dd className="tnum mt-0.5 text-xs">
          {stats.momIntakeDeltaPct != null ? (
            <span className="text-[var(--color-ink-quiet)]">
              <DeltaBadge pct={stats.momIntakeDeltaPct} locale={locale} />
            </span>
          ) : (
            <span className="text-[var(--color-ink-quiet)]">&nbsp;</span>
          )}
        </dd>
      </div>

      {/* concluded */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-3.5">
        <dt className="text-xs text-[var(--color-ink-tertiary)]">{c.concluded}</dt>
        <dd className="tnum mt-1 text-xl font-semibold text-[var(--color-ink-primary)]">
          {fmt(stats.totalConcluded)}
        </dd>
        <dd className="mt-0.5 text-xs text-[var(--color-ink-quiet)]">&nbsp;</dd>
      </div>

      {/* awarded + share */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-3.5">
        <dt className="flex items-center gap-1.5 text-xs text-[var(--color-ink-tertiary)]">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: OUTCOME_VIZ.VENDIDA.light }}
            aria-hidden
          />
          {c.awarded}
        </dt>
        <dd className="tnum mt-1 text-xl font-semibold text-[var(--color-ink-primary)]">
          {fmt(stats.sold)}
        </dd>
        <dd className="tnum mt-0.5 text-xs text-[var(--color-ink-quiet)]">
          {pctSold ? `${pctSold} ${c.ofConcluded}` : ' '}
        </dd>
      </div>

      {/* median highest bid — honest suppress */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-3.5">
        <dt className="text-xs text-[var(--color-ink-tertiary)]">{c.medianBid}</dt>
        <dd className="tnum mt-1 text-xl font-semibold text-[var(--color-ink-primary)]">
          {median ?? (
            <span className="text-base font-medium text-[var(--color-ink-quiet)]">
              {c.insufficient}
            </span>
          )}
        </dd>
        <dd className="mt-0.5 text-xs text-[var(--color-ink-quiet)]">
          {median ? PUJA_MAXIMA_LABEL[locale] : ' '}
        </dd>
      </div>
    </dl>
  );
}

// ---------------------------------------------------------------------------
// 2. Outcome breakdown — 100% stacked bar over the 4 registry outcomes.
//    Reuses OUTCOME_VIZ (validated) + OUTCOME_META labels verbatim.
// ---------------------------------------------------------------------------

function OutcomeBreakdown({ stats, locale, c }: { stats: NoticiaStats; locale: Locale; c: ChartCopy }) {
  const total = stats.totalConcluded;
  if (total <= 0) return null;

  const raw: Array<{ o: RegistryOutcome; count: number }> = [
    { o: 'VENDIDA', count: stats.sold },
    { o: 'DESIERTA', count: stats.desierta },
    { o: 'CANCELADA', count: stats.cancelada },
    { o: 'FINALIZADA_SIN_RESULTADO', count: stats.finalizadaSinResultado },
  ];
  const segs = raw
    .map((s) => ({
      ...s,
      share: (s.count / total) * 100,
      label: locale === 'en' ? OUTCOME_META[s.o].en : OUTCOME_META[s.o].es,
    }))
    .filter((s) => s.count > 0);

  if (segs.length === 0) return null;
  const fmt = nf(locale);
  const aria = segs.map((s) => `${s.label} ${s.share.toFixed(1)}%`).join(', ');

  return (
    <figure className="m-0 rounded-[var(--radius-xl)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-4 sm:p-5">
      <figcaption className="mb-0.5 text-sm font-semibold text-[var(--color-ink-primary)]">
        {c.outcomeTitle}
      </figcaption>
      <p className="mb-3 mt-0 text-xs text-[var(--color-ink-tertiary)]">{c.outcomeSub}</p>
      <div
        className="flex h-7 w-full gap-0.5 overflow-hidden rounded-[var(--radius-sm)]"
        role="img"
        aria-label={aria}
      >
        {segs.map((s) => (
          <div
            key={s.o}
            className="h-full first:rounded-l-[var(--radius-sm)] last:rounded-r-[var(--radius-sm)]"
            style={{ width: `${s.share}%`, backgroundColor: `var(${OUTCOME_VIZ[s.o].cssVar})` }}
            title={`${s.label}: ${fmt(s.count)} (${s.share.toFixed(1)}%)`}
          />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
        {segs.map((s) => (
          <li key={s.o} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
              style={{ backgroundColor: `var(${OUTCOME_VIZ[s.o].cssVar})` }}
            />
            <span className="min-w-0">
              <span className="block truncate text-[var(--color-ink-primary)]">{s.label}</span>
              <span className="tnum block text-[var(--color-ink-quiet)]">
                {fmt(s.count)} · {s.share.toFixed(1)}%
              </span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// 3. MoM intake — this month vs previous (single-hue change-over-time pair).
// ---------------------------------------------------------------------------

function MoMIntake({ stats, locale, c }: { stats: NoticiaStats; locale: Locale; c: ChartCopy }) {
  const fmt = nf(locale);
  const cur = stats.intake;
  const prev = stats.prevIntake;
  const hasPrev = prev > 0;
  const max = Math.max(cur, prev, 1);
  const curPct = (cur / max) * 100;
  const prevPct = (prev / max) * 100;

  return (
    <figure className="m-0 rounded-[var(--radius-xl)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-4 sm:p-5">
      <figcaption className="mb-0.5 flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-[var(--color-ink-primary)]">{c.momTitle}</span>
        {stats.momIntakeDeltaPct != null ? (
          <span className="text-[11px]">
            <DeltaBadge pct={stats.momIntakeDeltaPct} locale={locale} />
          </span>
        ) : null}
      </figcaption>
      <p className="mb-4 mt-0 text-xs text-[var(--color-ink-tertiary)]">{c.momSub}</p>

      {hasPrev ? (
        <div
          className="flex flex-col gap-3"
          role="img"
          aria-label={`${c.thisMonth}: ${fmt(cur)}. ${c.prevMonth}: ${fmt(prev)}.`}
        >
          {/* this month — emphasised */}
          <div>
            <div className="mb-1 flex items-baseline justify-between text-xs">
              <span className="text-[var(--color-ink-secondary)]">{c.thisMonth}</span>
              <span className="tnum font-semibold text-[var(--color-ink-primary)]">{fmt(cur)}</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-[var(--color-hairline)]">
              <div
                className="h-full rounded-full"
                style={{ width: `${curPct}%`, backgroundColor: 'var(--color-action)' }}
              />
            </div>
          </div>
          {/* previous — recessive */}
          <div>
            <div className="mb-1 flex items-baseline justify-between text-xs">
              <span className="text-[var(--color-ink-quiet)]">{c.prevMonth}</span>
              <span className="tnum text-[var(--color-ink-secondary)]">{fmt(prev)}</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-[var(--color-hairline)]">
              <div
                className="h-full rounded-full"
                style={{ width: `${prevPct}%`, backgroundColor: 'var(--color-ink-quiet)' }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div>
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="text-[var(--color-ink-secondary)]">{c.thisMonth}</span>
            <span className="tnum font-semibold text-[var(--color-ink-primary)]">{fmt(cur)}</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-[var(--color-hairline)]">
            <div
              className="h-full rounded-full"
              style={{ width: '100%', backgroundColor: 'var(--color-action)' }}
            />
          </div>
          <p className="mt-3 text-xs italic text-[var(--color-ink-quiet)]">{c.firstEdition}</p>
        </div>
      )}
    </figure>
  );
}

// ---------------------------------------------------------------------------
// 4. Award price range — p25 / median / p75 as an IQR range bar (SVG).
//    Suppressed entirely at small N (median null) → honest "muestra insuficiente".
// ---------------------------------------------------------------------------

function PriceRange({ stats, locale, c }: { stats: NoticiaStats; locale: Locale; c: ChartCopy }) {
  const median = stats.soldMedianCents;

  // Honest suppression: no reliable median → say so, never draw a fake number.
  if (median == null) {
    return (
      <figure className="m-0 rounded-[var(--radius-xl)] border border-dashed border-[var(--color-hairline)] bg-[var(--color-surface)] p-4 sm:p-5">
        <figcaption className="mb-0.5 text-sm font-semibold text-[var(--color-ink-primary)]">
          {c.priceTitle}
        </figcaption>
        <p className="mb-3 mt-0 text-xs text-[var(--color-ink-tertiary)]">{c.priceSub}</p>
        <div className="flex items-center gap-2 text-sm text-[var(--color-ink-quiet)]">
          <span className="font-medium">{c.insufficient}.</span>
          <span className="text-xs">{c.insufficientNote}</span>
        </div>
      </figure>
    );
  }

  const p25 = stats.p25Cents;
  const p75 = stats.p75Cents;
  const hasRange = p25 != null && p75 != null && p75 > p25;

  const medianStr = formatEur(median, locale) as string;

  if (!hasRange) {
    // Median exists but no usable IQR — show median as a single anchored value.
    return (
      <figure className="m-0 rounded-[var(--radius-xl)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-4 sm:p-5">
        <figcaption className="mb-0.5 text-sm font-semibold text-[var(--color-ink-primary)]">
          {c.priceTitle}
        </figcaption>
        <p className="mb-4 mt-0 text-xs text-[var(--color-ink-tertiary)]">{c.priceSub}</p>
        <div className="tnum text-2xl font-semibold text-[var(--color-ink-primary)]">{medianStr}</div>
        <div className="mt-1 text-xs text-[var(--color-ink-quiet)]">{PUJA_MAXIMA_LABEL[locale]}</div>
      </figure>
    );
  }

  // IQR range bar. Domain padded 8% each side so p25/p75 aren't flush to edges.
  const lo = p25 as number;
  const hi = p75 as number;
  const span = hi - lo;
  const domLo = lo - span * 0.15;
  const domHi = hi + span * 0.15;
  const domSpan = domHi - domLo || 1;
  const pos = (v: number) => ((v - domLo) / domSpan) * 100;

  const W = 720;
  const H = 84;
  const padX = 12;
  const trackY = 34;
  const plotW = W - padX * 2;
  const px = (v: number) => padX + (pos(v) / 100) * plotW;

  const p25Str = formatEur(lo, locale) as string;
  const p75Str = formatEur(hi, locale) as string;
  const aria =
    locale === 'en'
      ? `Median highest bid ${medianStr}; middle 50% from ${p25Str} to ${p75Str}.`
      : `Puja máxima mediana ${medianStr}; 50% central de ${p25Str} a ${p75Str}.`;

  return (
    <figure className="m-0 rounded-[var(--radius-xl)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-4 sm:p-5">
      <figcaption className="mb-0.5 flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-[var(--color-ink-primary)]">{c.priceTitle}</span>
        <span className="tnum text-lg font-semibold text-[var(--color-ink-primary)]">{medianStr}</span>
      </figcaption>
      <p className="mb-3 mt-0 text-xs text-[var(--color-ink-tertiary)]">{c.priceSub}</p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        role="img"
        aria-label={aria}
        style={{ width: '100%', height: 'auto', display: 'block' }}
      >
        {/* faint full track */}
        <line
          x1={padX}
          y1={trackY}
          x2={W - padX}
          y2={trackY}
          stroke="var(--color-hairline)"
          strokeWidth={2}
          strokeLinecap="round"
        />
        {/* IQR band (middle 50%) */}
        <rect
          x={px(lo)}
          y={trackY - 5}
          width={Math.max(2, px(hi) - px(lo))}
          height={10}
          rx={5}
          fill={`var(${OUTCOME_VIZ.VENDIDA.cssVar})`}
          opacity={0.22}
        />
        {/* p25 / p75 end caps */}
        {[lo, hi].map((v) => (
          <line
            key={v}
            x1={px(v)}
            y1={trackY - 7}
            x2={px(v)}
            y2={trackY + 7}
            stroke={`var(${OUTCOME_VIZ.VENDIDA.cssVar})`}
            strokeWidth={2}
            strokeLinecap="round"
          />
        ))}
        {/* median marker */}
        <circle
          cx={px(median)}
          cy={trackY}
          r={6}
          fill={`var(${OUTCOME_VIZ.VENDIDA.cssVar})`}
          stroke="var(--color-surface)"
          strokeWidth={2}
        >
          <title>{medianStr}</title>
        </circle>
        {/* value labels */}
        <text x={px(lo)} y={trackY + 26} textAnchor="middle" fontSize={12} fill="var(--color-ink-quiet)" className="tnum">
          {p25Str}
        </text>
        <text x={px(hi)} y={trackY + 26} textAnchor="middle" fontSize={12} fill="var(--color-ink-quiet)" className="tnum">
          {p75Str}
        </text>
      </svg>
      <p className="mt-1 text-center text-[11px] text-[var(--color-ink-quiet)]">
        {c.rangeNote} · {PUJA_MAXIMA_LABEL[locale]}
      </p>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// 5. Notable figures — national rank + discount-to-appraisal (text callouts).
// ---------------------------------------------------------------------------

function NotableFacts({ stats, locale, c }: { stats: NoticiaStats; locale: Locale; c: ChartCopy }) {
  const hasRank = stats.rankByIntake != null && stats.rankByIntake >= 1;
  const hasDiscount = stats.discountAppraisalMedian != null;
  if (!hasRank && !hasDiscount) return null;

  const rankStr = hasRank ? String(stats.rankByIntake) : '';
  const discStr = hasDiscount ? `${stats.discountAppraisalMedian}%` : '';

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {hasRank ? (
        <div className="flex items-center gap-4 rounded-[var(--radius-xl)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-4 sm:p-5">
          <span className="tnum shrink-0 rounded-[var(--radius-lg)] bg-[var(--color-action-soft)] px-3 py-2 text-lg font-semibold text-[var(--color-action-hover)]">
            {c.rankBadge(rankStr)}
          </span>
          <span className="text-sm text-[var(--color-ink-secondary)]">{c.rankSub}</span>
        </div>
      ) : null}
      {hasDiscount ? (
        <div className="rounded-[var(--radius-xl)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-4 sm:p-5">
          <div className="text-xs text-[var(--color-ink-tertiary)]">{c.discountLabel}</div>
          <div className="tnum mt-1 text-2xl font-semibold text-[var(--color-ink-primary)]">{discStr}</div>
          <div className="mt-1 text-xs text-[var(--color-ink-quiet)]">{c.discountSub}</div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel — orchestrates the article's dataviz block. Injects the theme-aware
// colour scope ONCE (same mechanism as RegistroCharts).
// ---------------------------------------------------------------------------

export function NoticiaCharts({ stats, locale }: { stats: NoticiaStats; locale: Locale }) {
  const c = copyFor(locale);
  return (
    <div className={`${VIZ_SCOPE} flex flex-col gap-4`}>
      <style dangerouslySetInnerHTML={{ __html: outcomeVizStyle(`.${VIZ_SCOPE}`) }} />
      <StatTiles stats={stats} locale={locale} c={c} />
      <OutcomeBreakdown stats={stats} locale={locale} c={c} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MoMIntake stats={stats} locale={locale} c={c} />
        <PriceRange stats={stats} locale={locale} c={c} />
      </div>
      <NotableFacts stats={stats} locale={locale} c={c} />
    </div>
  );
}
