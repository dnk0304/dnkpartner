'use client';

import { useLayoutEffect, useRef } from 'react';
import { cn } from '../_lib/cn';
import {
  ACTIVE_STAGES,
  headlineScoreForStage,
  type RunSummary,
  type RunDetail,
} from '../_lib/types';
import { RunCard } from './RunCard';

/**
 * KanbanBoard — the hero. Columns = the active stages (1–6 by default; stages
 * 7–8 are parked, see ACTIVE_STAGES); each run is a card in its
 * current-stage column. When a run's `stage` increments between polls the card
 * physically MOVES to the next column with a FLIP animation (slide from its old
 * position) + an arrival pulse. Respects prefers-reduced-motion (the slide is
 * skipped; arrival cross-fades instead).
 *
 * FLIP without a motion library: before each paint we read every card's screen
 * rect; after the DOM updates we compare to the previous rect and, for cards
 * that moved, apply an inverse transform then transition it to zero — the
 * browser interpolates the real layout change.
 */
export function KanbanBoard({
  runs,
  detailsById,
  recentlyMoved,
  onOpen,
  onReview,
  onResume,
  onDelete,
}: {
  runs: RunSummary[];
  /** Cached detail (for the per-stage headline score on a card). */
  detailsById: Record<string, RunDetail | undefined>;
  /** run ids that changed stage on the last poll — get the arrival pulse. */
  recentlyMoved: ReadonlySet<string>;
  onOpen: (id: string) => void;
  onReview: (id: string) => void;
  onResume: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const prevRects = useRef<Map<string, DOMRect>>(new Map());

  // FLIP: after the DOM commits, animate any card whose position changed.
  useLayoutEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const nextRects = new Map<string, DOMRect>();
    const nodes = document.querySelectorAll<HTMLElement>('[data-run-id]');

    nodes.forEach((node) => {
      const id = node.dataset.runId;
      if (!id) return;
      const rect = node.getBoundingClientRect();
      nextRects.set(id, rect);

      if (reduce) return;
      const prev = prevRects.current.get(id);
      if (!prev) return;
      const dx = prev.left - rect.left;
      const dy = prev.top - rect.top;
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;

      // Invert, then play.
      node.style.transform = `translate(${dx}px, ${dy}px)`;
      node.style.transition = 'transform 0s';
      // Force reflow so the inverted transform is committed before we clear it.
      void node.getBoundingClientRect();
      requestAnimationFrame(() => {
        node.style.transition = 'transform 480ms cubic-bezier(0.22, 1, 0.36, 1)';
        node.style.transform = '';
        const clear = () => {
          node.style.transition = '';
          node.removeEventListener('transitionend', clear);
        };
        node.addEventListener('transitionend', clear);
      });
    });

    prevRects.current = nextRects;
  }, [runs]);

  return (
    <div
      className="flex gap-4 overflow-x-auto pb-3"
      role="list"
      aria-label="Product Factory kanban board — projects by stage"
    >
      {ACTIVE_STAGES.map((stage, idx) => {
        // Cards sit in their own stage's column. A run that somehow sits beyond
        // the last active stage (a parked 7/8 run) is shown in the final active
        // column so it never silently vanishes from the board.
        const isLastActive = idx === ACTIVE_STAGES.length - 1;
        const inColumn = runs.filter(
          (r) => r.stage === stage.n || (isLastActive && r.stage > stage.n),
        );
        return (
          <section
            key={stage.n}
            role="listitem"
            aria-label={`Stage ${stage.n}: ${stage.name} — ${inColumn.length} ${
              inColumn.length === 1 ? 'project' : 'projects'
            }`}
            className="flex w-72 shrink-0 flex-col rounded-2xl bg-slate-50/80 ring-1 ring-slate-200/70"
          >
            <header className="flex items-center justify-between gap-2 px-3.5 pb-2 pt-3">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-primary/10 text-xs font-bold text-brand-primary"
                  aria-hidden="true"
                >
                  {stage.n}
                </span>
                <h3 className="truncate text-sm font-semibold text-brand-accent">{stage.short}</h3>
              </div>
              <span
                className={cn(
                  'inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-xs font-semibold',
                  inColumn.length > 0
                    ? 'bg-brand-primary/15 text-brand-primary'
                    : 'bg-slate-200 text-brand-dark/40',
                )}
              >
                {inColumn.length}
              </span>
            </header>

            <ul className="flex flex-1 flex-col gap-2.5 px-2.5 pb-3" aria-label={`${stage.name} projects`}>
              {inColumn.length === 0 ? (
                <li className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-brand-dark/30">
                  No projects here
                </li>
              ) : (
                inColumn.map((run) => (
                  <RunCard
                    key={run.id}
                    run={run}
                    gate={detailsById[run.id]?.pendingGate?.gate}
                    headlineScore={headlineScoreForStage(detailsById[run.id]?.artifacts, run.stage)}
                    onOpen={() => onOpen(run.id)}
                    onReview={() => onReview(run.id)}
                    onResume={() => onResume(run.id)}
                    onDelete={() => onDelete(run.id)}
                    justArrived={recentlyMoved.has(run.id)}
                  />
                ))
              )}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
