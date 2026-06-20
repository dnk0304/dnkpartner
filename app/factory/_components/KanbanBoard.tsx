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
import { guideFor } from './StageGuide';

/**
 * KanbanBoard — the hero. Panels = the active stages (1–6 by default; stages
 * 7–8 are parked, see ACTIVE_STAGES); each run is a card in its
 * current-stage panel. When a run's `stage` increments between polls the card
 * physically MOVES to the next panel with a FLIP animation (slide from its old
 * position) + an arrival pulse. Respects prefers-reduced-motion (the slide is
 * skipped; arrival cross-fades instead).
 *
 * LAYOUT (2026-06-20 redesign — Vinci spec): the old `flex … overflow-x-auto`
 * with fixed `w-72` columns is GONE. The panels now live in a FLUID auto-fit
 * grid that always sums to 100% of the container — six panels share the row at
 * ≥~1180px and WRAP (never side-scroll) below that. Each panel is `min-w-0`
 * so a track can shrink below its content width and truncate instead of forcing
 * a horizontal scrollbar. There is NO `overflow-x-auto` anywhere in this file.
 *
 * Each panel is self-explaining: numbered badge + lucide icon + a LOCKED
 * plain-language label + a ≤10-word explainer, so a newcomer reads the journey
 * (1 Find Your Market → 6 Launch It) without prior context. Populated panels
 * stack RunCards and scroll VERTICALLY when many; empty panels read as a guide.
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

  // FLIP: after the DOM commits, animate any card whose position changed. The
  // grid (not a scroll container) is the positioning context now, but the FLIP
  // math is layout-agnostic — it diffs screen rects, so it works unchanged.
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
    <div>
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-brand-accent">The 6-stage build</h2>
        <p className="text-xs text-brand-muted">Each step is quality-checked before the next begins.</p>
      </div>

      {/*
        THE no-horizontal-scroll grid (audit §2 — fixed, deliberate columns).
        A DELIBERATE breakpoint ladder, not auto-fit wrap: 6-up ≥1280 (xl),
        3×2 at lg, 2-up at md, 1-up below. `items-stretch` + a min-height floor
        give equal-height panels and a predictable rhythm at every width. Every
        panel is `min-w-0` so content truncates instead of forcing a side-scroll —
        there is no `overflow-x-auto` anywhere, so ZERO horizontal scroll holds.
      */}
      <div
        className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
        role="list"
        aria-label="Product Factory pipeline — projects by stage"
      >
        {ACTIVE_STAGES.map((stage, idx) => {
          // Cards sit in their own stage's panel. A run beyond the last active
          // stage (a parked 7/8 run) shows in the final active panel so it never
          // silently vanishes from the board.
          const isLastActive = idx === ACTIVE_STAGES.length - 1;
          const inColumn = runs.filter(
            (r) => r.stage === stage.n || (isLastActive && r.stage > stage.n),
          );
          // A panel is "active" (teal wash) when at least one project sits in it.
          const active = inColumn.length > 0;
          const guide = guideFor(stage.n, stage.short);
          const Icon = guide.icon;

          return (
            <section
              key={stage.n}
              role="listitem"
              aria-label={`Stage ${stage.n}: ${guide.label} — ${inColumn.length} ${
                inColumn.length === 1 ? 'project' : 'projects'
              }`}
              className={cn(
                'flex min-h-[14rem] min-w-0 flex-col gap-2 overflow-hidden rounded-xl p-4 shadow-sm ring-1 transition-colors',
                active
                  ? 'bg-brand-tint ring-brand-primary/30'
                  : 'bg-brand-surface ring-brand-line',
              )}
            >
              {/* Numbered badge + stage icon */}
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-bold',
                    active ? 'bg-brand-primary text-white' : 'bg-brand-primary/10 text-brand-primary',
                  )}
                  aria-hidden="true"
                >
                  {stage.n}
                </span>
                <Icon className="h-4 w-4 shrink-0 text-brand-primary" aria-hidden="true" />
              </div>

              {/* Locked plain-language label + explainer */}
              <div>
                <h3 className="truncate text-sm font-semibold text-brand-accent">{guide.label}</h3>
                <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-brand-dark/70">
                  {guide.explainer}
                </p>
              </div>

              {/* Count pill — only when populated (newcomer panels stay un-cluttered) */}
              {active && (
                <span
                  className="mt-0.5 inline-flex h-5 w-fit min-w-[1.25rem] items-center justify-center rounded-full bg-brand-primary/15 px-2 text-xs font-semibold text-brand-primary"
                  aria-hidden="true"
                >
                  {inColumn.length} {inColumn.length === 1 ? 'project' : 'projects'}
                </span>
              )}

              {/* Cards (vertical scroll inside the panel when many) or empty tile */}
              <ul
                className="mt-1 flex max-h-[28rem] flex-col gap-2.5 overflow-y-auto"
                aria-label={`${guide.label} projects`}
              >
                {inColumn.length === 0 ? (
                  <li className="rounded-lg border border-dashed border-brand-line px-3 py-5 text-center text-xs text-brand-muted">
                    Nothing here yet
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
    </div>
  );
}
