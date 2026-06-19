'use client';

import { useEffect, useState } from 'react';
import { cn } from '../_lib/cn';
import {
  deriveProgress,
  formatActivityAgo,
  type RunSummary,
} from '../_lib/types';

/**
 * ProgressBar — the honest, REAL progress signal for a factory run.
 *
 * Two layers of truth:
 *   1. The filled bar = (completedStages + within-stage fraction) / N. It moves
 *      WITHIN a stage — call-by-call against the per-stage budget (≈9) — then
 *      snaps a whole stage forward when the engine advances, so stage-to-stage
 *      movement is obvious and a grinding stage never looks frozen.
 *   2. The live line = token-log liveness. "Processing · stage X/N · k/9 this
 *      stage · last activity Ns ago" with a pulse WHILE the engine is firing
 *      calls. When no call has landed recently we show an honest "Idle / no
 *      recent activity" state — never a fake pulse or fake creep.
 *
 * Owns a 5s self-tick so the "Ns ago" label keeps counting up and the
 * processing→idle transition still happens between the board's polls. `now` is
 * read only inside the tick (not during render) to respect React 19 purity.
 */
export function ProgressBar({
  run,
  size = 'card',
  className,
}: {
  run: RunSummary;
  /** card = compact (board); detail = roomier (drawer header). */
  size?: 'card' | 'detail';
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    // 3s self-tick (matches the board poll) keeps the "Ns ago" label and the
    // processing→idle flip live between polls. The bar fill itself moves off the
    // real callsThisStage signal that lands on each poll — no fabricated creep.
    const id = setInterval(() => setNow(Date.now()), 3000);
    return () => clearInterval(id);
  }, []);

  const view = deriveProgress(run, now);
  if (!view) return null;

  const {
    percent,
    currentStage,
    totalStages,
    callsThisStage,
    expectedPerStage,
    lastActivitySeconds,
    tone,
  } = view;
  const ago = formatActivityAgo(lastActivitySeconds);

  const barFill =
    tone === 'done'
      ? 'bg-emerald-500'
      : tone === 'processing'
        ? 'bg-brand-primary'
        : 'bg-slate-400';

  const dotColor =
    tone === 'done' ? 'bg-emerald-500' : tone === 'processing' ? 'bg-brand-primary' : 'bg-slate-400';

  // Honest live label.
  const label =
    tone === 'done'
      ? 'Complete'
      : tone === 'processing'
        ? `Processing · stage ${currentStage}/${totalStages}`
        : `Idle · stage ${currentStage}/${totalStages}`;

  const detail = size === 'detail';

  return (
    <div className={cn('w-full', className)}>
      {/* The bar. role=progressbar so SR users get the same X/N truth. */}
      <div
        className={cn('w-full overflow-hidden rounded-full bg-slate-200', detail ? 'h-2' : 'h-1.5')}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={
          tone === 'done'
            ? 'Complete'
            : `Stage ${currentStage} of ${totalStages}, ${callsThisStage} of ${expectedPerStage} calls this stage (${percent}% overall)`
        }
        aria-label={`Progress: stage ${currentStage} of ${totalStages}`}
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-500 ease-out', barFill)}
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Live readout. */}
      <div
        className={cn(
          'mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5',
          detail ? 'text-xs' : 'text-[11px]',
        )}
      >
        <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
          {tone === 'processing' && (
            <span
              className={cn(
                'absolute inline-flex h-full w-full rounded-full bg-brand-primary opacity-60',
                'motion-safe:animate-ping',
              )}
            />
          )}
          <span className={cn('relative inline-flex h-2 w-2 rounded-full', dotColor)} />
        </span>
        <span
          className={cn(
            'font-semibold',
            tone === 'done'
              ? 'text-emerald-700'
              : tone === 'processing'
                ? 'text-brand-primary'
                : 'text-brand-dark/55',
          )}
        >
          {label}
        </span>
        {tone === 'processing' && (
          <span className="text-brand-dark/45 tabular-nums">
            · {callsThisStage}/{expectedPerStage} this stage
          </span>
        )}
        {tone !== 'done' && ago && (
          <span className="text-brand-dark/40">· last activity {ago}</span>
        )}
        {tone === 'idle' && !ago && (
          <span className="text-brand-dark/40">· no recent activity</span>
        )}
      </div>
    </div>
  );
}
