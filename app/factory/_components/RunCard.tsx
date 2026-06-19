'use client';

import { useEffect, useRef, useState } from 'react';
import { Play, ArrowRight, ListChecks } from 'lucide-react';
import { cn } from '../_lib/cn';
import {
  deriveCardState,
  isResumable,
  TOTAL_STAGES,
  type RunSummary,
  type CardState,
} from '../_lib/types';
import { StatusChip } from './StatusChip';
import { TierBadge, ScoreValue } from './Badges';
import { DeleteRunControl } from './DeleteRunControl';
import { ProgressBar } from './ProgressBar';

function relativeTime(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** When a card's state offers a forward action, what does the button say. */
function actionFor(state: CardState): { label: string; icon: React.ComponentType<{ className?: string }> } | null {
  switch (state) {
    // A processing run still shows Resume — but disabled (see RunCard) — so the
    // control is visible-but-greyed rather than vanishing while work is in flight.
    case 'running':
    case 'draft_stalled':
      return { label: 'Resume', icon: Play };
    case 'awaiting_selection':
      return { label: 'Pick a niche', icon: ListChecks };
    case 'awaiting_gate':
      return { label: 'Review', icon: ArrowRight };
    default:
      return null;
  }
}

export function RunCard({
  run,
  gate,
  headlineScore,
  onOpen,
  onReview,
  onResume,
  onDelete,
  justArrived,
}: {
  run: RunSummary;
  gate?: string | null;
  /** 0-100 score for the current stage, or null when no scored artifact. */
  headlineScore: number | null;
  /** Card-body click → the readable project view (read/download files). */
  onOpen: () => void;
  /** "Review" (awaiting-gate) → the live pipeline & gates drawer. */
  onReview: () => void;
  onResume: () => void;
  /** Fires after the run is deleted so the board re-polls. */
  onDelete: () => void;
  /** True briefly after the card moved columns — triggers the arrival pulse. */
  justArrived?: boolean;
}) {
  const state = deriveCardState(run);
  const action = actionFor(state);
  // A Resume action is only enabled when the run is genuinely idle/stopped and
  // tickable. While it is processing we render Resume greyed + non-clickable so
  // the user can't fire a /tick that the server would reject (and nothing would
  // happen). Review (awaiting_gate) is always actionable.
  const isResumeAction = state === 'running' || state === 'draft_stalled';
  const resumeEnabled = isResumable(run);
  const actionDisabled = isResumeAction && !resumeEnabled;

  // Re-render the relative timestamp every 10s without a refetch.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 10000);
    return () => clearInterval(id);
  }, []);

  const ref = useRef<HTMLLIElement>(null);

  return (
    <li
      ref={ref}
      data-run-id={run.id}
      className={cn(
        'group relative rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm transition-shadow',
        'hover:shadow-md focus-within:ring-2 focus-within:ring-brand-primary/40',
        justArrived && 'motion-safe:animate-[factory-arrive_900ms_ease-out]',
      )}
    >
      {/* Guarded delete — revealed on hover/focus-within, top-right. */}
      <div className="absolute right-2 top-2 z-10">
        <DeleteRunControl runId={run.id} seed={run.seed} variant="icon" onDeleted={onDelete} />
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="block w-full text-left focus:outline-none"
        aria-label={`Open ${run.seed} — stage ${run.stage} of ${TOTAL_STAGES}`}
      >
        <div className="flex items-start gap-2.5 pr-7">
          {headlineScore !== null && <TierBadge score={headlineScore} size="sm" className="mt-0.5" />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-snug text-brand-accent">
              {run.seed}
            </p>
            <p className="mt-0.5 text-xs text-brand-dark/45">
              Stage {run.stage} / {TOTAL_STAGES}
              {headlineScore !== null && (
                <>
                  {' · '}
                  <ScoreValue score={headlineScore} className="text-xs" />
                  <span className="text-brand-dark/35">/100</span>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="mt-2.5">
          <StatusChip state={state} stage={run.stage} gate={gate} />
        </div>

        {/* Real progress — stage fill + live token-log liveness. */}
        <div className="mt-2.5">
          <ProgressBar run={run} size="card" />
        </div>

        <p className="mt-2 text-[11px] text-brand-dark/40">Updated {relativeTime(run.updatedAt)}</p>
      </button>

      {action && (
        <div className="mt-2.5 border-t border-slate-100 pt-2.5">
          <button
            type="button"
            disabled={actionDisabled}
            aria-disabled={actionDisabled}
            title={actionDisabled ? 'Processing — Resume is available once the run is idle.' : undefined}
            onClick={(e) => {
              e.stopPropagation();
              if (actionDisabled) return;
              if (isResumeAction) onResume();
              else onReview();
            }}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40',
              actionDisabled
                ? 'cursor-not-allowed bg-slate-100 text-brand-dark/35'
                : state === 'awaiting_selection'
                  ? 'bg-violet-100 text-violet-800 hover:bg-violet-200'
                  : state === 'awaiting_gate'
                    ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                    : 'bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20',
            )}
          >
            <action.icon className="h-3.5 w-3.5" />
            {actionDisabled ? 'Processing…' : action.label}
          </button>
        </div>
      )}
    </li>
  );
}
