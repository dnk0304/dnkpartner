'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Play, ArrowRight } from 'lucide-react';
import { cn } from '../_lib/cn';
import { deriveCardState, isResumable, stageMeta, TOTAL_STAGES, type RunSummary } from '../_lib/types';
import { StatusChip } from './StatusChip';
import { DeleteRunControl } from './DeleteRunControl';

function relativeTime(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

type SortKey = 'seed' | 'stage' | 'updatedAt';

/** ListView — the CRM directory backbone: a sortable table of every project. */
export function ListView({
  runs,
  gates,
  onOpen,
  onReview,
  onResume,
  onDelete,
}: {
  runs: RunSummary[];
  gates: Record<string, string | null | undefined>;
  onOpen: (id: string) => void;
  onReview: (id: string) => void;
  onResume: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [sortBy, setSortBy] = useState<SortKey>('updatedAt');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');

  const sorted = [...runs].sort((a, b) => {
    const dir = order === 'asc' ? 1 : -1;
    if (sortBy === 'seed') return a.seed.localeCompare(b.seed) * dir;
    if (sortBy === 'stage') return (a.stage - b.stage) * dir;
    return (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * dir;
  });

  function toggle(key: SortKey) {
    if (sortBy === key) setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(key);
      setOrder('desc');
    }
  }

  const renderSortHead = (label: string, k: SortKey, align: 'left' | 'right' = 'left') => (
    <th
      className={cn(
        'cursor-pointer select-none px-4 py-3 font-semibold text-brand-accent/80 hover:text-brand-accent',
        align === 'right' ? 'text-right' : 'text-left',
      )}
      onClick={() => toggle(k)}
      aria-sort={sortBy === k ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span className={cn('inline-flex items-center gap-1', align === 'right' && 'flex-row-reverse')}>
        {label}
        {sortBy === k &&
          (order === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </span>
    </th>
  );

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              {renderSortHead('Project', 'seed')}
              {renderSortHead('Stage', 'stage')}
              <th className="px-4 py-3 font-semibold text-brand-accent/80">Status</th>
              {renderSortHead('Updated', 'updatedAt', 'right')}
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((run) => {
              const state = deriveCardState(run);
              const meta = stageMeta(run.stage);
              // Resume shows for any running/stalled draft, but is greyed +
              // non-clickable while the engine is actively processing (a /tick
              // would be rejected). Other states fall through to Open.
              const isResumeRow = state === 'running' || state === 'draft_stalled';
              const isGateRow = state === 'awaiting_gate';
              const resumeDisabled = isResumeRow && !isResumable(run);
              return (
                <tr
                  key={run.id}
                  className="cursor-pointer transition-colors hover:bg-brand-light/60"
                  onClick={() => onOpen(run.id)}
                >
                  <td className="px-4 py-3 font-medium text-brand-accent">{run.seed}</td>
                  <td className="px-4 py-3 text-brand-dark/70">
                    {run.stage} / {TOTAL_STAGES} · {meta.short}
                  </td>
                  <td className="px-4 py-3">
                    <StatusChip state={state} stage={run.stage} gate={gates[run.id]} />
                  </td>
                  <td className="px-4 py-3 text-right text-brand-dark/45">
                    {relativeTime(run.updatedAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        disabled={resumeDisabled}
                        aria-disabled={resumeDisabled}
                        title={resumeDisabled ? 'Processing — Resume is available once the run is idle.' : undefined}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (resumeDisabled) return;
                          if (isResumeRow) onResume(run.id);
                          else if (isGateRow) onReview(run.id);
                          else onOpen(run.id);
                        }}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40',
                          resumeDisabled
                            ? 'cursor-not-allowed bg-slate-100 text-brand-dark/35'
                            : isGateRow
                              ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                              : 'bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20',
                        )}
                      >
                        {isResumeRow ? (
                          <>
                            <Play className="h-3.5 w-3.5" /> {resumeDisabled ? 'Processing…' : 'Resume'}
                          </>
                        ) : isGateRow ? (
                          <>
                            Review <ArrowRight className="h-3.5 w-3.5" />
                          </>
                        ) : (
                          <>
                            Open <ArrowRight className="h-3.5 w-3.5" />
                          </>
                        )}
                      </button>
                      <DeleteRunControl
                        runId={run.id}
                        seed={run.seed}
                        variant="inline"
                        onDeleted={() => onDelete(run.id)}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
