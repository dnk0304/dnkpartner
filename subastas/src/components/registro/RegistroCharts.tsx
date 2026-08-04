/**
 * RegistroCharts — server-rendered, zero-JS, zero-CLS SVG/HTML charts for the
 * /resultados overview. No charting library (none in the stack) and no client
 * hydration: the charts are in the server HTML so they paint instantly, never
 * shift layout (intrinsic width/height on every SVG), and are crawlable.
 *
 * Colours come from the VALIDATED data-viz palette (see registro-ui.ts —
 * passes every CVD/contrast check in light and dark). Each chart ships direct
 * labels + a text legend, so identity never rests on colour alone (the CVD
 * secondary-encoding rule) and it degrades gracefully for screen readers.
 * Native <title> elements give a no-JS hover tooltip.
 */

import {
  REGISTRY_OUTCOME_ORDER,
  OUTCOME_META,
  OUTCOME_VIZ,
  outcomeVizStyle,
  type Locale,
  type OutcomeCounts,
  type RegistrySummary,
  type TrendPoint,
} from '@/lib/registro/registro-ui';
import { APP_TIME_ZONE } from '@/components/observatory/format';

const VIZ_SCOPE = 'reg-viz';

function pct(n: number, total: number): number {
  return total > 0 ? (n / total) * 100 : 0;
}

function monthLabel(period: string, locale: Locale): string {
  // period = 'YYYY-MM'
  const [y, m] = period.split('-');
  // Hydration (#418), not style: build the instant in UTC and format it in UTC. The old
  // `new Date(y, m-1, 1)` was HOST-local midnight, which in Europe/Madrid is the previous
  // month in UTC — the browser and the container labelled the same bar differently.
  const d = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-ES', { month: 'short', timeZone: APP_TIME_ZONE }).format(d);
}

/** Keep a clean, recent window: drop pre-2015 strays + empty months, last 24. */
function trendWindow(trend: TrendPoint[], months = 24): TrendPoint[] {
  return trend
    .filter((t) => t.period >= '2015-01')
    .filter((t) => REGISTRY_OUTCOME_ORDER.reduce((s, o) => s + t.counts[o], 0) > 0)
    .slice(-months);
}

function fmtInt(n: number, locale: Locale): string {
  return n.toLocaleString(locale === 'en' ? 'en-US' : 'es-ES');
}

// ---------------------------------------------------------------------------
// 1. Outcome breakdown — 100% stacked horizontal bar + legend (HTML, crisp).
// ---------------------------------------------------------------------------

function OutcomeBreakdown({
  counts,
  total,
  locale,
  title,
}: {
  counts: OutcomeCounts;
  total: number;
  locale: Locale;
  title: string;
}) {
  const segs = REGISTRY_OUTCOME_ORDER.map((o) => ({
    o,
    count: counts[o],
    share: pct(counts[o], total),
    label: locale === 'en' ? OUTCOME_META[o].en : OUTCOME_META[o].es,
  })).filter((s) => s.count > 0);

  const aria = segs.map((s) => `${s.label} ${s.share.toFixed(1)}%`).join(', ');

  return (
    <figure className="m-0">
      <figcaption className="mb-3 text-sm font-semibold text-[var(--color-ink-primary)]">{title}</figcaption>
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
            title={`${s.label}: ${fmtInt(s.count, locale)} (${s.share.toFixed(1)}%)`}
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
                {fmtInt(s.count, locale)} · {s.share.toFixed(1)}%
              </span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// 2. Monthly volume — stacked columns (SVG).
// ---------------------------------------------------------------------------

function VolumeTrend({
  trend,
  locale,
  title,
  subtitle,
  windowNote,
}: {
  trend: TrendPoint[];
  locale: Locale;
  title: string;
  subtitle: string;
  windowNote: string;
}) {
  const data = trendWindow(trend);
  const W = 720;
  const H = 240;
  const padL = 4;
  const padR = 4;
  const padT = 8;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = data.length;
  const totals = data.map((d) => REGISTRY_OUTCOME_ORDER.reduce((s, o) => s + d.counts[o], 0));
  const maxTotal = Math.max(1, ...totals);
  const slot = n > 0 ? plotW / n : plotW;
  const barW = Math.max(2, slot * 0.68);

  if (n === 0) return null;

  return (
    <figure className={`${VIZ_SCOPE} m-0`}>
      <figcaption className="mb-0.5 flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-[var(--color-ink-primary)]">{title}</span>
        <span className="text-[11px] text-[var(--color-ink-quiet)]">{windowNote}</span>
      </figcaption>
      <p className="mb-3 mt-0 text-xs text-[var(--color-ink-tertiary)]">{subtitle}</p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        role="img"
        aria-label={subtitle}
        style={{ width: '100%', height: 'auto', display: 'block' }}
      >
        {/* baseline */}
        <line x1={padL} y1={padT + plotH} x2={W - padR} y2={padT + plotH} stroke="var(--color-hairline)" strokeWidth={1} />
        {data.map((d, i) => {
          const x = padL + i * slot + (slot - barW) / 2;
          let yCursor = padT + plotH;
          const total = totals[i];
          const parts = REGISTRY_OUTCOME_ORDER.map((o) => {
            const h = (d.counts[o] / maxTotal) * plotH;
            const y = yCursor - h;
            yCursor = y;
            return { o, h, y, count: d.counts[o] };
          }).filter((p) => p.h > 0);
          const tip = `${monthLabel(d.period, locale)} ${d.period.slice(0, 4)} · ${fmtInt(total, locale)}`;
          const isYearStart = d.period.endsWith('-01') || i === 0;
          return (
            <g key={d.period}>
              {parts.map((p) => (
                <rect
                  key={p.o}
                  x={x}
                  y={p.y + 0.5}
                  width={barW}
                  height={Math.max(0.5, p.h - 1)}
                  rx={1}
                  fill={`var(${OUTCOME_VIZ[p.o].cssVar})`}
                >
                  <title>{`${tip} — ${locale === 'en' ? OUTCOME_META[p.o].en : OUTCOME_META[p.o].es}: ${fmtInt(p.count, locale)}`}</title>
                </rect>
              ))}
              {isYearStart ? (
                <text
                  x={x + barW / 2}
                  y={H - 8}
                  textAnchor="middle"
                  fontSize={11}
                  fill="var(--color-ink-quiet)"
                >
                  {d.period.endsWith('-01') ? d.period.slice(0, 4) : monthLabel(d.period, locale)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// 3. Award rate over time — single-series line (SVG). No legend (title names it).
// ---------------------------------------------------------------------------

function SoldRateLine({
  trend,
  locale,
  title,
  subtitle,
  windowNote,
}: {
  trend: TrendPoint[];
  locale: Locale;
  title: string;
  subtitle: string;
  windowNote: string;
}) {
  const data = trendWindow(trend).filter((d) => d.pctSold != null);
  const W = 720;
  const H = 170;
  const padL = 30;
  const padR = 6;
  const padT = 10;
  const padB = 24;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = data.length;
  if (n < 2) return null;

  const x = (i: number) => padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => padT + plotH - (v / 100) * plotH;
  const pts = data.map((d, i) => ({ i, x: x(i), y: y(d.pctSold as number), d }));
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const gridVals = [0, 25, 50, 75, 100];

  return (
    <figure className={`${VIZ_SCOPE} m-0`}>
      <figcaption className="mb-0.5 flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-[var(--color-ink-primary)]">{title}</span>
        <span className="text-[11px] text-[var(--color-ink-quiet)]">{windowNote}</span>
      </figcaption>
      <p className="mb-3 mt-0 text-xs text-[var(--color-ink-tertiary)]">{subtitle}</p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        role="img"
        aria-label={subtitle}
        style={{ width: '100%', height: 'auto', display: 'block' }}
      >
        {gridVals.map((v) => (
          <g key={v}>
            <line x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} stroke="var(--color-hairline)" strokeWidth={1} />
            <text x={0} y={y(v) + 3} fontSize={10} fill="var(--color-ink-quiet)" className="tnum">
              {v}%
            </text>
          </g>
        ))}
        <path d={linePath} fill="none" stroke={`var(${OUTCOME_VIZ.VENDIDA.cssVar})`} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p) => {
          const showLabel = p.i === 0 || p.i === n - 1;
          return (
            <g key={p.d.period}>
              <circle cx={p.x} cy={p.y} r={2.5} fill={`var(${OUTCOME_VIZ.VENDIDA.cssVar})`}>
                <title>{`${monthLabel(p.d.period, locale)} ${p.d.period.slice(0, 4)}: ${(p.d.pctSold as number).toFixed(1)}%`}</title>
              </circle>
              {showLabel ? (
                <text x={p.x} y={H - 8} textAnchor={p.i === 0 ? 'start' : 'end'} fontSize={10} fill="var(--color-ink-quiet)">
                  {monthLabel(p.d.period, locale)} {p.d.period.slice(0, 4)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Panel — lays the three out; injects the theme-aware colour scope ONCE.
// ---------------------------------------------------------------------------

export function RegistroCharts({
  summary,
  locale,
  copy,
}: {
  summary: RegistrySummary;
  locale: Locale;
  copy: {
    chartOutcomeTitle: string;
    chartVolumeTitle: string;
    chartVolumeSub: string;
    chartSoldRateTitle: string;
    chartSoldRateSub: string;
    chartWindowNote: string;
  };
}) {
  return (
    <div className={VIZ_SCOPE}>
      <style dangerouslySetInnerHTML={{ __html: outcomeVizStyle(`.${VIZ_SCOPE}`) }} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-[var(--radius-xl)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-4 sm:p-5 lg:col-span-2">
          <OutcomeBreakdown
            counts={summary.headline.counts}
            total={summary.headline.registryTotal}
            locale={locale}
            title={copy.chartOutcomeTitle}
          />
        </div>
        <div className="rounded-[var(--radius-xl)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-4 sm:p-5">
          <VolumeTrend
            trend={summary.trend}
            locale={locale}
            title={copy.chartVolumeTitle}
            subtitle={copy.chartVolumeSub}
            windowNote={copy.chartWindowNote}
          />
        </div>
        <div className="rounded-[var(--radius-xl)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-4 sm:p-5">
          <SoldRateLine
            trend={summary.trend}
            locale={locale}
            title={copy.chartSoldRateTitle}
            subtitle={copy.chartSoldRateSub}
            windowNote={copy.chartWindowNote}
          />
        </div>
      </div>
    </div>
  );
}
