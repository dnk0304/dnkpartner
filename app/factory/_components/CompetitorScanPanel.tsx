'use client';

import { useState } from 'react';
import {
  Swords,
  Target,
  CheckCircle2,
  DoorOpen,
  ShieldAlert,
  TrendingDown,
  ChevronDown,
  Database,
  Sparkles,
} from 'lucide-react';
import { cn } from '../_lib/cn';
import { getTier, type CompetitorScan } from '../_lib/types';

/**
 * CompetitorScanPanel — the Stage-4 "Competitive Edge" trust panel.
 *
 * The S4 sibling of RunDetail's WorkbookLens: detect a field on the audit
 * artifact, render a dedicated trust-building panel. It surfaces the competitor
 * scan that Forge embeds under `audit_report.payload.competitorScan` — the
 * sharpened "how we win" strategy that SURVIVED a 2-expert spar.
 *
 * The story is the spar. An edge thesis a model produced in one shot is a sales
 * pitch; one that survived a real red-team is a strategy. So this panel makes the
 * EDGE-vs-RED-TEAM tension visible on purpose — the honest counter-case (where
 * competitors are stronger, the challenges the thesis had to answer) sits right
 * next to the wins. That tension is the feature.
 *
 * HONESTY DISCIPLINE (mirrors the WorkbookLens "should have failed the gate"
 * guard): when `dataSource === 'llm-analysis'` the source tag reads as model
 * analysis, NOT live scraped competitor data — we never overclaim provenance.
 *
 * Renders nothing when `competitorScan` is absent (the caller passes null for
 * older runs / a flaked scan), exactly like WorkbookLens is inert for prose.
 */
export function CompetitorScanPanel({
  competitorScan,
  variant = 'detail',
}: {
  competitorScan: CompetitorScan | null | undefined;
  /** 'detail' = compact (RunDetail drawer); 'page' = roomier (readable project view). */
  variant?: 'detail' | 'page';
}) {
  const [sparOpen, setSparOpen] = useState(false);
  const [debateOpen, setDebateOpen] = useState(false);

  if (!competitorScan) return null;

  const {
    competitors,
    edgeThesis,
    edgeMoves,
    openGaps,
    redTeamChallenges,
    whereCompetitorsAreStronger,
    confidence,
    dataSource,
    rounds,
  } = competitorScan;

  const isLive = dataSource === 'dnk-trends';
  const hasSpar = redTeamChallenges.length > 0 || whereCompetitorsAreStronger.length > 0;
  const hasDebate = rounds.length > 0;

  return (
    <section
      aria-labelledby="competitor-scan-h"
      className={cn(
        'overflow-hidden rounded-xl border border-brand-primary/25 bg-white shadow-sm',
        variant === 'page' && 'rounded-2xl',
      )}
    >
      {/* Header — title + confidence chip + honest source tag. */}
      <header className="flex flex-wrap items-center gap-3 border-b border-brand-primary/15 bg-brand-light/50 px-4 py-3 sm:px-5">
        <span
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-primary text-white"
          aria-hidden="true"
        >
          <Swords className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3
            id="competitor-scan-h"
            className="text-sm font-semibold text-brand-accent sm:text-base"
          >
            Competitive Edge
          </h3>
          <p className="text-[11px] text-brand-dark/50">
            How we win — and where the edge held under fire.
          </p>
        </div>
        <SourceTag isLive={isLive} />
        <ConfidenceChip confidence={confidence} />
      </header>

      <div className={cn('space-y-4 px-4 py-4 sm:px-5', variant === 'page' && 'sm:px-6 sm:py-5')}>
        {/* The edge thesis — the hero line. */}
        {edgeThesis && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-4 py-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-emerald-700">
              <Target className="h-3.5 w-3.5" aria-hidden="true" />
              The edge
            </p>
            <p className="mt-1 text-sm font-medium leading-snug text-brand-accent">{edgeThesis}</p>
          </div>
        )}

        {/* Edge moves — the concrete checklist. */}
        {edgeMoves.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold text-brand-accent">Moves that win it</p>
            <ul className="space-y-1.5">
              {edgeMoves.map((move, i) => (
                <li key={i} className="flex gap-2 text-sm leading-snug text-brand-dark/75">
                  <CheckCircle2
                    className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                    aria-hidden="true"
                  />
                  <span>{move}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Open gaps — what competitors leave on the table. */}
        {openGaps.length > 0 && (
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-brand-accent">
              <DoorOpen className="h-3.5 w-3.5 text-brand-primary" aria-hidden="true" />
              Gaps we exploit
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {openGaps.map((gap, i) => (
                <li
                  key={i}
                  className="rounded-full border border-brand-primary/20 bg-brand-light/60 px-2.5 py-1 text-[11px] font-medium leading-snug text-brand-primary"
                >
                  {gap}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Competitors — scannable cards (stack on mobile). */}
        {competitors.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold text-brand-accent">
              The field · {competitors.length}{' '}
              {competitors.length === 1 ? 'competitor' : 'competitors'}
            </p>
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {competitors.map((c, i) => (
                <CompetitorCard key={`${c.name}-${i}`} competitor={c} />
              ))}
            </ul>
          </div>
        )}

        {/* The spar — the honesty centerpiece. The edge is what SURVIVED a real
            red-team, not a one-shot pitch, so the pushback it answered and the
            places we honestly lose sit right here, collapsible. */}
        {hasSpar && (
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setSparOpen((v) => !v)}
              aria-expanded={sparOpen}
              className="flex w-full items-center gap-2 bg-slate-50 px-3.5 py-2.5 text-left transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
            >
              <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              <span className="flex-1 text-xs font-semibold text-brand-accent">
                How the edge was stress-tested
              </span>
              <span className="text-[11px] font-medium text-brand-dark/45">
                the honest counter-case
              </span>
              <ChevronDown
                className={cn(
                  'h-4 w-4 shrink-0 text-brand-dark/40 transition-transform motion-safe:duration-200',
                  sparOpen && 'rotate-180',
                )}
                aria-hidden="true"
              />
            </button>
            {sparOpen && (
              <div className="space-y-4 border-t border-slate-200 px-3.5 py-3.5">
                <p className="text-[11px] leading-snug text-brand-dark/55">
                  Two experts sparred: one argued the edge, one red-teamed it. This is what the
                  thesis had to survive — kept honest, not hidden.
                </p>

                {redTeamChallenges.length > 0 && (
                  <SparBlock
                    icon={<ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />}
                    label="Challenges it answered"
                    tone="amber"
                    items={redTeamChallenges}
                  />
                )}

                {whereCompetitorsAreStronger.length > 0 && (
                  <SparBlock
                    icon={<TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />}
                    label="Where competitors are honestly stronger"
                    tone="rose"
                    items={whereCompetitorsAreStronger}
                  />
                )}

                {/* The full round-by-round debate, one expander deeper. */}
                {hasDebate && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setDebateOpen((v) => !v)}
                      aria-expanded={debateOpen}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-primary transition-colors hover:text-brand-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
                    >
                      {debateOpen ? 'Hide' : 'View'} the debate ({rounds.length}{' '}
                      {rounds.length === 1 ? 'round' : 'rounds'})
                      <ChevronDown
                        className={cn(
                          'h-3.5 w-3.5 transition-transform motion-safe:duration-200',
                          debateOpen && 'rotate-180',
                        )}
                        aria-hidden="true"
                      />
                    </button>
                    {debateOpen && (
                      <ol className="mt-2.5 space-y-2.5">
                        {rounds.map((r, i) => (
                          <DebateRound key={`${r.round}-${i}`} round={r} />
                        ))}
                      </ol>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * The honest source tag. `llm-analysis` must NOT imply live scraped competitor
 * data — same overclaim discipline as the WorkbookLens "should have failed"
 * guard. `dnk-trends` earns the green "live data" treatment.
 */
function SourceTag({ isLive }: { isLive: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium',
        isLive
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-slate-200 bg-slate-50 text-brand-dark/55',
      )}
      title={
        isLive
          ? 'Built from dnk-trends live market data.'
          : 'Model market analysis — not live scraped competitor data.'
      }
    >
      {isLive ? (
        <>
          <Database className="h-3 w-3" aria-hidden="true" />
          dnk-trends live data
        </>
      ) : (
        <>
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          LLM market analysis
        </>
      )}
    </span>
  );
}

/** 0-100 confidence chip — same gradient tier band as the score/tier badges. */
function ConfidenceChip({ confidence }: { confidence: number }) {
  const t = getTier(confidence);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br px-2.5 py-1 text-xs font-bold text-white shadow-sm',
        t.color,
      )}
      title={`Edge confidence ${confidence}/100 (tier ${t.tier})`}
      aria-label={`Edge confidence ${confidence} out of 100`}
    >
      <span className="tabular-nums">{confidence}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wide opacity-90">conf</span>
    </span>
  );
}

/** One competitor — name, offer, price, their strengths (warn) + weaknesses (win). */
function CompetitorCard({
  competitor,
}: {
  competitor: CompetitorScan['competitors'][number];
}) {
  const { name, whatTheyOffer, priceRange, strengths, weaknesses } = competitor;
  return (
    <li className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold text-brand-accent">{name}</p>
        {priceRange && (
          <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-brand-dark/60">
            {priceRange}
          </span>
        )}
      </div>
      {whatTheyOffer && (
        <p className="mt-1 text-xs leading-snug text-brand-dark/60">{whatTheyOffer}</p>
      )}

      {strengths.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-700">
            Their strength
          </p>
          <ul className="mt-0.5 space-y-0.5">
            {strengths.map((s, i) => (
              <li key={i} className="text-[11px] leading-snug text-amber-800/90">
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {weaknesses.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-700">
            Our opening
          </p>
          <ul className="mt-0.5 space-y-0.5">
            {weaknesses.map((w, i) => (
              <li key={i} className="text-[11px] leading-snug text-emerald-800/90">
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

/** A toned list block inside the spar (challenges / honest losses). */
function SparBlock({
  icon,
  label,
  tone,
  items,
}: {
  icon: React.ReactNode;
  label: string;
  tone: 'amber' | 'rose';
  items: string[];
}) {
  const toneCls =
    tone === 'amber'
      ? { head: 'text-amber-700', dot: 'bg-amber-400', text: 'text-amber-900/85' }
      : { head: 'text-rose-700', dot: 'bg-rose-400', text: 'text-rose-900/85' };
  return (
    <div>
      <p className={cn('flex items-center gap-1.5 text-[11px] font-semibold', toneCls.head)}>
        {icon}
        {label}
      </p>
      <ul className="mt-1 space-y-1">
        {items.map((item, i) => (
          <li key={i} className={cn('flex gap-2 text-xs leading-snug', toneCls.text)}>
            <span
              className={cn('mt-1.5 h-1 w-1 shrink-0 rounded-full', toneCls.dot)}
              aria-hidden="true"
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One spar round: the edge expert's move, then the red-team's pushback. */
function DebateRound({ round }: { round: CompetitorScan['rounds'][number] }) {
  const { round: n, edge, redTeam } = round;
  return (
    <li className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-brand-dark/45">
        Round {n}
      </p>
      <div className="space-y-2.5">
        <div className="rounded-md border-l-2 border-emerald-300 bg-white px-2.5 py-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Edge</p>
          {edge.thesis && (
            <p className="mt-0.5 text-xs leading-snug text-brand-dark/75">{edge.thesis}</p>
          )}
          {edge.moves.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {edge.moves.map((m, i) => (
                <li key={i} className="text-[11px] leading-snug text-emerald-800/85">
                  + {m}
                </li>
              ))}
            </ul>
          )}
          {edge.note && (
            <p className="mt-1 text-[11px] italic leading-snug text-brand-dark/45">{edge.note}</p>
          )}
        </div>
        <div className="rounded-md border-l-2 border-rose-300 bg-white px-2.5 py-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-700">
            Red team
          </p>
          {redTeam.challenges.length > 0 && (
            <ul className="mt-0.5 space-y-0.5">
              {redTeam.challenges.map((c, i) => (
                <li key={i} className="text-[11px] leading-snug text-rose-800/85">
                  → {c}
                </li>
              ))}
            </ul>
          )}
          {redTeam.competitorsStronger.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {redTeam.competitorsStronger.map((s, i) => (
                <li key={i} className="text-[11px] leading-snug text-rose-700/75">
                  ✗ stronger: {s}
                </li>
              ))}
            </ul>
          )}
          {redTeam.note && (
            <p className="mt-1 text-[11px] italic leading-snug text-brand-dark/45">
              {redTeam.note}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}
