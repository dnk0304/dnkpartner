'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Compass,
  Lightbulb,
  HeartCrack,
  Hammer,
  ChevronDown,
  AlertTriangle,
  Loader2,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';
import { cn } from '../_lib/cn';
import {
  candidateOverall,
  candidateCompetition,
  SCORE_LABELS,
  type NicheCandidate,
  type RunDetail as RunDetailData,
} from '../_lib/types';
import { TierBadge, CompetitionPill } from './Badges';

/**
 * NichePicker — the Stage-1 "choose one niche" screen. Renders the N candidate
 * niches the factory discovered (the run is `awaiting_selection`) as a choosable
 * scored grid, and POSTs the pick to /api/factory/runs/:id/select.
 *
 * Each candidate card carries, transparently:
 *   - niche · productIdea · painArea
 *   - the tier badge (composed 0-100 overall) + the 5 raw 1-10 sub-scores
 *   - the Easy/Medium/Hard competition pill (inverted competitionGap)
 *   - demandEvidence + a collapsible rationale
 *   - advisoryFlags from the 3-expert cross-check, shown as HONEST caveats —
 *     never hidden. This transparency is the wedge vs. canned competitor scores.
 *
 * Picking one fires onAction (workspace re-polls → the run advances into the
 * kanban at the niche human-gate). Only ONE candidate is chosen; the rest are
 * discarded — S2→S6 build the chosen niche only.
 *
 * Accessibility: a labelled modal dialog, Escape to close, each card is a real
 * <button> (keyboard-selectable, focus-visible ring), the collapse is a real
 * disclosure button, advisory flags carry role="note".
 */
export function NichePicker({
  detail,
  onClose,
  onAction,
}: {
  detail: RunDetailData;
  onClose: () => void;
  /** Fires after a successful selection so the workspace re-polls immediately. */
  onAction: () => void;
}) {
  const mounted = typeof document !== 'undefined';
  const [selecting, setSelecting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selecting === null) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, selecting]);

  if (!mounted) return null;

  const candidates = detail.candidates ?? [];
  const hint = detail.hint?.trim();

  function toggleExpanded(index: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  async function pick(index: number) {
    if (selecting !== null) return;
    setSelecting(index);
    setError(null);
    try {
      const res = await fetch(`/api/factory/runs/${detail.id}/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateIndex: index }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.run) {
        onAction();
        onClose();
        return;
      }
      setError(
        data.error?.message ??
          (res.status === 409
            ? 'This run is no longer awaiting a selection.'
            : `Selection failed (${res.status}).`),
      );
      setSelecting(null);
    } catch {
      setError('Network error — could not reach the factory.');
      setSelecting(null);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-40 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Pick a niche to build"
    >
      <button
        type="button"
        aria-label="Close niche picker"
        className="absolute inset-0 bg-brand-dark/40 backdrop-blur-sm"
        onClick={() => selecting === null && onClose()}
      />
      <div className="relative flex h-full w-full max-w-3xl flex-col bg-brand-light/40 shadow-2xl motion-safe:animate-in motion-safe:slide-in-from-right motion-safe:duration-300">
        {/* Header */}
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-6 py-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-violet-600">
              <Compass className="h-3.5 w-3.5" />
              Stage 1 · pick a niche
            </p>
            <h2 className="mt-1 text-xl font-semibold text-brand-accent">
              {candidates.length} niche{candidates.length === 1 ? '' : 's'} to choose from
            </h2>
            <p className="mt-1 text-sm text-brand-dark/60">
              {hint ? (
                <>
                  Steered by your hint{' '}
                  <span className="rounded bg-violet-50 px-1.5 py-0.5 font-medium text-violet-700">
                    “{hint}”
                  </span>
                  . Pick one — only that niche gets built.
                </>
              ) : (
                <>Discovered for you. Pick one — only that niche gets built (Stages 2–6).</>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => selecting === null && onClose()}
            className="rounded-md p-1.5 text-brand-dark/40 transition-colors hover:bg-slate-100 hover:text-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 disabled:opacity-40"
            aria-label="Close"
            disabled={selecting !== null}
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {error && (
          <div
            className="flex items-start gap-2 border-b border-rose-200 bg-rose-50 px-6 py-3 text-sm text-rose-700"
            role="alert"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Candidate list */}
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {candidates.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-sm text-brand-dark/55">
              No candidates were generated. Close this and retry from the card.
            </div>
          ) : (
            candidates.map((c) => (
              <CandidateCard
                key={c.index}
                candidate={c}
                expanded={expanded.has(c.index)}
                onToggle={() => toggleExpanded(c.index)}
                onPick={() => pick(c.index)}
                busy={selecting !== null}
                picking={selecting === c.index}
              />
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function CandidateCard({
  candidate: c,
  expanded,
  onToggle,
  onPick,
  busy,
  picking,
}: {
  candidate: NicheCandidate;
  expanded: boolean;
  onToggle: () => void;
  onPick: () => void;
  busy: boolean;
  picking: boolean;
}) {
  const overall = candidateOverall(c.scores);
  const competition = candidateCompetition(c.scores);
  const flags = c.advisoryFlags ?? [];

  return (
    <article
      className={cn(
        'rounded-2xl border bg-white shadow-sm transition-all',
        picking ? 'border-brand-primary ring-2 ring-brand-primary/30' : 'border-slate-200 hover:border-slate-300 hover:shadow-md',
      )}
    >
      <div className="p-5">
        {/* Top row: tier + title + competition */}
        <div className="flex items-start gap-3">
          <TierBadge score={overall} className="mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-brand-accent">{c.niche}</h3>
              <CompetitionPill competition={competition} />
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-lg font-bold tabular-nums text-brand-accent">{overall}</div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-brand-dark/40">/ 100</div>
          </div>
        </div>

        {/* Product idea + pain area */}
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex gap-2">
            <dt className="flex shrink-0 items-center gap-1 font-medium text-brand-dark/50">
              <Lightbulb className="h-4 w-4 text-amber-500" aria-hidden="true" />
              <span className="sr-only">Product idea: </span>
              Build
            </dt>
            <dd className="text-brand-dark/80">{c.productIdea}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="flex shrink-0 items-center gap-1 font-medium text-brand-dark/50">
              <HeartCrack className="h-4 w-4 text-rose-500" aria-hidden="true" />
              <span className="sr-only">Pain area: </span>
              Pain
            </dt>
            <dd className="text-brand-dark/80">{c.painArea}</dd>
          </div>
        </dl>

        {/* The 5 sub-scores */}
        <div className="mt-4">
          <ScoreRow scores={c.scores} />
        </div>

        {/* Demand evidence */}
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-brand-dark/70">
          <span className="font-semibold text-brand-dark/60">Demand evidence: </span>
          {c.demandEvidence}
        </p>

        {/* Advisory flags — honest caveats, never hidden */}
        {flags.length > 0 && (
          <ul className="mt-3 space-y-1.5" aria-label="Advisory caveats">
            {flags.map((flag, i) => (
              <li
                key={i}
                role="note"
                className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
                <span>{flag}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Collapsible rationale */}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-primary transition-colors hover:text-brand-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 rounded"
        >
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
          {expanded ? 'Hide rationale' : 'Why this niche?'}
        </button>
        {expanded && (
          <p className="mt-2 border-l-2 border-slate-200 pl-3 text-sm leading-relaxed text-brand-dark/70">
            {c.rationale}
          </p>
        )}
      </div>

      {/* Pick action */}
      <div className="flex items-center justify-between gap-3 rounded-b-2xl border-t border-slate-100 bg-slate-50/60 px-5 py-3">
        <span className="text-xs text-brand-dark/45">
          Only this niche gets built — the rest are discarded.
        </span>
        <button
          type="button"
          onClick={onPick}
          disabled={busy}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors',
            'hover:bg-brand-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          {picking ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Building…
            </>
          ) : (
            <>
              <Hammer className="h-4 w-4" />
              Build this one
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>
    </article>
  );
}

/**
 * The 5 raw 1-10 sub-scores as labelled mini-bars. Color tracks value (low =
 * rose, mid = amber, high = emerald) so the strengths/weaknesses of each
 * candidate read at a glance without relying on color alone (the number + label
 * are always present).
 */
function ScoreRow({ scores }: { scores: NicheCandidate['scores'] }) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {SCORE_LABELS.map(({ key, label, short }) => {
        const value = scores[key];
        const valid = typeof value === 'number' && Number.isFinite(value);
        const v = valid ? Math.max(0, Math.min(10, value)) : 0;
        const tone =
          v >= 7
            ? 'bg-emerald-500'
            : v >= 4
              ? 'bg-amber-400'
              : 'bg-rose-400';
        return (
          <div key={key} title={`${label}: ${valid ? `${v}/10` : 'n/a'}`}>
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] font-medium uppercase tracking-wide text-brand-dark/45">
                {short}
              </span>
              <span className="text-xs font-bold tabular-nums text-brand-dark/80">
                {valid ? v : '—'}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div
                className={cn('h-full rounded-full transition-all', tone)}
                style={{ width: `${v * 10}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
