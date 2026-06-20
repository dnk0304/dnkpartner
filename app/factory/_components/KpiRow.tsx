'use client';

import { useEffect, useState } from 'react';
import { Activity, PauseCircle, CheckCircle2, LayoutGrid, type LucideIcon } from 'lucide-react';
import { deriveCardState, type RunSummary } from '../_lib/types';

/**
 * KpiRow — the slim status bar (2026-06-20 redesign — Vinci spec). The bulky
 * 4-up gradient KPI cards are GONE; the same honest counts are now demoted to
 * one quiet inline row of stat chips — chrome, not hero. Counts stay visible at
 * zero (greyed) rather than hiding, so the metric set reads consistently.
 */
interface Stat {
  label: string;
  value: number;
  icon: LucideIcon;
  /** One-line plain-language explanation, surfaced as a hover tooltip. */
  tip: string;
}

export function KpiRow({ runs }: { runs: RunSummary[] }) {
  // Stall derivation reads `now`; capture it on a slow interval so the counts
  // re-evaluate as runs age, without an impure Date.now() during render.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

  let inProgress = 0;
  let stopped = 0;
  let ready = 0;
  for (const r of runs) {
    const state = deriveCardState(r, now);
    if (state === 'running' || state === 'awaiting_gate' || state === 'awaiting_selection') inProgress += 1;
    if (state === 'draft_stalled') stopped += 1;
    if (state === 'draft_ready' || state === 'published') ready += 1;
  }

  const stats: Stat[] = [
    { label: 'In progress', value: inProgress, icon: Activity, tip: 'Projects the factory is actively building or waiting on you for.' },
    { label: 'Stopped (resumable)', value: stopped, icon: PauseCircle, tip: 'Drafts that stalled mid-build — open one and hit Resume to continue.' },
    { label: 'Ready', value: ready, icon: CheckCircle2, tip: 'Finished projects ready to review, download, or launch.' },
    { label: 'Total', value: runs.length, icon: LayoutGrid, tip: 'Every project on the board, across all stages.' },
  ];

  return (
    <div className="inline-flex w-fit flex-wrap items-center gap-x-5 gap-y-2 rounded-xl bg-brand-surface px-4 py-2 ring-1 ring-brand-line">
      {stats.map((s) => {
        const Icon = s.icon;
        // The COUNT always reads at brand-accent weight (even at 0) so the metric
        // set is legible; only the icon dims at 0 to keep the row calm.
        const dim = s.value === 0;
        return (
          <div key={s.label} className="flex items-center gap-2 text-sm" title={s.tip}>
            <Icon
              className={dim ? 'h-4 w-4 text-brand-muted' : 'h-4 w-4 text-brand-primary'}
              aria-hidden="true"
            />
            <span className="font-semibold tabular-nums text-brand-accent">{s.value}</span>
            <span className="text-brand-muted">{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}
