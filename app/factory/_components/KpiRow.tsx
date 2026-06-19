'use client';

import { useEffect, useState } from 'react';
import { Boxes, Activity, PauseCircle, PackageCheck } from 'lucide-react';
import { cn } from '../_lib/cn';
import { deriveCardState, type RunSummary } from '../_lib/types';

/**
 * KpiRow — the dnk-trends 4-up gradient stat row (AITrends "Stats Cards"
 * pattern). Computes honest counts from the live run list.
 */
interface Kpi {
  label: string;
  value: number;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  /** card bg gradient · border · label text · value text · icon text */
  tone: { card: string; label: string; value: string; icon: string };
}

const TONES = {
  amber: {
    card: 'from-amber-50 to-orange-50 border-amber-200',
    label: 'text-amber-700',
    value: 'text-amber-900',
    icon: 'text-amber-500',
  },
  blue: {
    card: 'from-blue-50 to-indigo-50 border-blue-200',
    label: 'text-blue-700',
    value: 'text-blue-900',
    icon: 'text-blue-500',
  },
  purple: {
    card: 'from-purple-50 to-pink-50 border-purple-200',
    label: 'text-purple-700',
    value: 'text-purple-900',
    icon: 'text-purple-500',
  },
  emerald: {
    card: 'from-emerald-50 to-green-50 border-emerald-200',
    label: 'text-emerald-700',
    value: 'text-emerald-900',
    icon: 'text-emerald-500',
  },
} as const;

export function KpiRow({ runs }: { runs: RunSummary[] }) {
  // Stall derivation reads `now`; capture it in state on a slow interval so the
  // counts re-evaluate as runs age, without an impure Date.now() during render.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

  let inProgress = 0;
  let stalled = 0;
  let ready = 0;
  for (const r of runs) {
    const state = deriveCardState(r, now);
    if (state === 'running' || state === 'awaiting_gate') inProgress += 1;
    if (state === 'draft_stalled') stalled += 1;
    if (state === 'draft_ready' || state === 'published') ready += 1;
  }

  const kpis: Kpi[] = [
    { label: 'Total projects', value: runs.length, hint: 'In the factory', icon: Boxes, tone: TONES.blue },
    { label: 'In progress', value: inProgress, hint: 'Running or awaiting you', icon: Activity, tone: TONES.amber },
    { label: 'Drafts (stopped)', value: stalled, hint: 'Resumable', icon: PauseCircle, tone: TONES.purple },
    { label: 'Drafts ready', value: ready, hint: 'Completed pipeline', icon: PackageCheck, tone: TONES.emerald },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {kpis.map((k) => {
        const Icon = k.icon;
        return (
          <div
            key={k.label}
            className={cn('rounded-xl border bg-gradient-to-br p-4 shadow-sm', k.tone.card)}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className={cn('text-sm font-medium', k.tone.label)}>{k.label}</span>
              <Icon className={cn('h-4 w-4', k.tone.icon)} aria-hidden="true" />
            </div>
            <div className={cn('text-3xl font-bold tabular-nums', k.tone.value)}>{k.value}</div>
            <p className={cn('mt-1 text-xs', k.tone.label)}>{k.hint}</p>
          </div>
        );
      })}
    </div>
  );
}
