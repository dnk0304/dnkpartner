'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, LayoutGrid, List, RefreshCw, Sparkles, AlertCircle } from 'lucide-react';
import { cn } from '../_lib/cn';
import {
  isNonTerminal,
  stageMeta,
  type RunSummary,
  type RunDetail as RunDetailData,
} from '../_lib/types';
import { LiveIndicator } from './LiveIndicator';
import { KpiRow } from './KpiRow';
import { KanbanBoard } from './KanbanBoard';
import { ListView } from './ListView';
import { CreateProjectModal } from './CreateProjectModal';
import { RunDetail } from './RunDetail';
import { NichePicker } from './NichePicker';

const POLL_INTERVAL_MS = 3000;

type View = 'kanban' | 'list';

/**
 * FactoryWorkspace — the live CRM shell. Polls GET /api/factory/runs every 3s
 * while any run is non-terminal, detects stage changes between polls (to move
 * cards + announce them), and owns the create modal + detail drawer. Detail JSON
 * is cached per run so cards can show their current-stage score without N extra
 * requests; the open run gets its own faster detail poll.
 */
export function FactoryWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [detailsById, setDetailsById] = useState<Record<string, RunDetailData | undefined>>({});
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const [view, setView] = useState<View>('kanban');
  const [createOpen, setCreateOpen] = useState(false);
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const [detailRefreshing, setDetailRefreshing] = useState(false);

  const [recentlyMoved, setRecentlyMoved] = useState<ReadonlySet<string>>(new Set());
  const [announcement, setAnnouncement] = useState('');

  // Stage snapshot from the previous poll, for move detection.
  const prevStages = useRef<Map<string, number>>(new Map());
  const moveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchRuns = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/factory/runs', { cache: 'no-store' });
      if (!res.ok) {
        setError(true);
        return;
      }
      const data = (await res.json()) as { runs: RunSummary[] };
      const next = data.runs ?? [];

      // Detect cards that changed stage since the last poll.
      const moved = new Set<string>();
      const announcements: string[] = [];
      for (const r of next) {
        const prev = prevStages.current.get(r.id);
        if (prev !== undefined && r.stage > prev) {
          moved.add(r.id);
          announcements.push(`${r.seed} advanced to stage ${r.stage} — ${stageMeta(r.stage).short}`);
        }
      }
      prevStages.current = new Map(next.map((r) => [r.id, r.stage]));

      setRuns(next);
      setError(false);
      setLastUpdatedAt(new Date());
      setLoaded(true);

      if (moved.size > 0) {
        setRecentlyMoved(moved);
        setAnnouncement(announcements.join('. '));
        if (moveTimer.current) clearTimeout(moveTimer.current);
        moveTimer.current = setTimeout(() => setRecentlyMoved(new Set()), 1200);
      }
    } catch {
      setError(true);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Lazily hydrate per-run detail so cards can show the current-stage score.
  const fetchDetail = useCallback(async (id: string, markRefreshing = false) => {
    if (markRefreshing) setDetailRefreshing(true);
    try {
      const res = await fetch(`/api/factory/runs/${id}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { run: RunDetailData };
      if (data.run) setDetailsById((m) => ({ ...m, [id]: data.run }));
    } catch {
      /* non-fatal */
    } finally {
      if (markRefreshing) setDetailRefreshing(false);
    }
  }, []);

  // Board poll loop. The initial fetch is deferred to a microtask so no state
  // update runs synchronously in the effect body (React 19 set-state-in-effect)
  // — fetchRuns sets state only inside its async continuation, which is allowed.
  useEffect(() => {
    queueMicrotask(fetchRuns);
    const id = setInterval(fetchRuns, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchRuns]);

  // Hydrate details for runs we don't have yet (one-time per run id seen).
  useEffect(() => {
    const missing = runs.filter((r) => detailsById[r.id] === undefined);
    if (missing.length === 0) return;
    queueMicrotask(() => {
      for (const r of missing) fetchDetail(r.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs]);

  // Faster detail poll for the open run while it's non-terminal.
  useEffect(() => {
    if (!openRunId) return;
    queueMicrotask(() => fetchDetail(openRunId, true));
    const id = setInterval(() => {
      const open = runs.find((r) => r.id === openRunId);
      if (open && isNonTerminal(open.status)) fetchDetail(openRunId);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRunId]);

  // Card click → the readable PROJECT view (read/download the files).
  const openProject = useCallback(
    (id: string) => {
      router.push(`/factory/${id}`);
    },
    [router],
  );

  // Deep-link: /factory?run=<id> opens the live pipeline & gates drawer (the
  // project view links here for in-flight gate approvals).
  useEffect(() => {
    const runParam = searchParams.get('run');
    if (runParam) setOpenRunId(runParam);
  }, [searchParams]);

  const handleCreated = useCallback(
    (run: RunDetailData, warning?: string) => {
      setCreateOpen(false);
      // Seed local state immediately so the card appears without waiting a poll.
      prevStages.current.set(run.id, run.stage);
      setDetailsById((m) => ({ ...m, [run.id]: run }));
      setRuns((prev) => {
        const exists = prev.some((r) => r.id === run.id);
        const summary: RunSummary = {
          id: run.id,
          seed: run.seed,
          stage: run.stage,
          status: run.status,
          createdAt: run.createdAt,
          updatedAt: run.updatedAt,
        };
        return exists ? prev.map((r) => (r.id === run.id ? summary : r)) : [summary, ...prev];
      });
      setAnnouncement(
        warning ? `${run.seed} created — ${warning}` : `${run.seed} created — now at stage ${run.stage}`,
      );
      setOpenRunId(run.id);
    },
    [],
  );

  const handleResume = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/factory/runs/${id}/tick`, { method: 'POST' });
      } catch {
        /* surfaced on next poll */
      }
      fetchRuns();
      fetchDetail(id);
    },
    [fetchRuns, fetchDetail],
  );

  // The DELETE request itself lives in DeleteRunControl; this fires after it
  // succeeds. Optimistically drop the run from local state so the card vanishes
  // instantly, purge its caches, close the drawer if it was open, then re-poll
  // to reconcile against the server.
  const handleDeleted = useCallback(
    (id: string) => {
      const removed = runs.find((r) => r.id === id);
      setRuns((prev) => prev.filter((r) => r.id !== id));
      setDetailsById((m) => {
        const { [id]: _omit, ...rest } = m;
        return rest;
      });
      prevStages.current.delete(id);
      if (openRunId === id) setOpenRunId(null);
      setAnnouncement(removed ? `${removed.seed} deleted.` : 'Project deleted.');
      fetchRuns();
    },
    [runs, openRunId, fetchRuns],
  );

  const gatesById: Record<string, string | null | undefined> = {};
  for (const id of Object.keys(detailsById)) {
    gatesById[id] = detailsById[id]?.pendingGate?.gate ?? null;
  }

  const openDetail = openRunId ? detailsById[openRunId] : undefined;

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-8 sm:py-10">
      {/* Live region for card-move announcements (visually hidden). */}
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>

      {/* Slim status bar (KPIs demoted to quiet chrome) + live indicator. */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <KpiRow runs={runs} />
        <LiveIndicator
          lastUpdatedAt={lastUpdatedAt}
          isRefreshing={refreshing}
          hasError={error}
          intervalMs={POLL_INTERVAL_MS}
        />
      </div>

      {/* Welcome hero — one clear idea, one low-friction CTA. The optional hint
          field lives INSIDE the create modal, never here, so the hero stays a
          single button. */}
      <section className="mb-6 rounded-2xl bg-gradient-to-br from-brand-light to-brand-surface px-8 py-10 text-center ring-1 ring-brand-line">
        <p className="flex items-center justify-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-primary">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Product Factory
        </p>
        <h1 className="mx-auto mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-brand-accent md:text-4xl">
          From a raw idea to a ready-to-sell product.
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-base text-brand-dark/70">
          Pick a market, let the factory build it, and get a finished digital product — automated and
          quality-checked at every step.
        </p>
        <div className="mt-6 flex flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
          >
            <Plus className="h-4 w-4" />
            Create a new project
          </button>
          <p className="text-xs text-brand-muted">Optional: add a hint to steer the genre.</p>
        </div>
      </section>

      {/* Toolbar: view toggle + manual refresh */}
      <div className="mb-4 flex items-center justify-between">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm" role="tablist" aria-label="Board view">
          <ViewTab active={view === 'kanban'} onClick={() => setView('kanban')} icon={LayoutGrid} label="Kanban" />
          <ViewTab active={view === 'list'} onClick={() => setView('list')} icon={List} label="List" />
        </div>
        <button
          type="button"
          onClick={() => fetchRuns()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-brand-dark/70 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
        >
          <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Content */}
      {!loaded ? (
        <BoardSkeleton />
      ) : error && runs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-6 py-16 text-center">
          <AlertCircle className="mb-3 h-10 w-10 text-rose-400" />
          <p className="font-semibold text-rose-800">Couldn&apos;t reach the factory</p>
          <p className="mt-1 text-sm text-rose-600">Retrying automatically…</p>
        </div>
      ) : runs.length === 0 ? (
        <EmptyState onCreate={() => setCreateOpen(true)} />
      ) : view === 'kanban' ? (
        <KanbanBoard
          runs={runs}
          detailsById={detailsById}
          recentlyMoved={recentlyMoved}
          onOpen={openProject}
          onReview={setOpenRunId}
          onResume={handleResume}
          onDelete={handleDeleted}
        />
      ) : (
        <ListView runs={runs} gates={gatesById} onOpen={openProject} onReview={setOpenRunId} onResume={handleResume} onDelete={handleDeleted} />
      )}

      {createOpen && (
        <CreateProjectModal onClose={() => setCreateOpen(false)} onCreated={handleCreated} />
      )}

      {/* A run stopped at `awaiting_selection` opens the niche-picker (choose one
          of N candidates) instead of the live pipeline drawer. */}
      {openRunId && openDetail && openDetail.status === 'awaiting_selection' ? (
        <NichePicker
          detail={openDetail}
          onClose={() => setOpenRunId(null)}
          onAction={() => {
            fetchRuns();
            fetchDetail(openRunId);
          }}
        />
      ) : openRunId && openDetail ? (
        <RunDetail
          detail={openDetail}
          refreshing={detailRefreshing}
          onClose={() => setOpenRunId(null)}
          onAction={() => {
            fetchRuns();
            fetchDetail(openRunId);
          }}
        />
      ) : null}
    </div>
  );
}

function ViewTab({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40',
        active ? 'bg-brand-primary text-white shadow-sm' : 'text-brand-dark/60 hover:bg-slate-50',
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-20 text-center">
      <span className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-sm">
        <Sparkles className="h-7 w-7 text-white" />
      </span>
      <h2 className="text-lg font-semibold text-brand-accent">No projects yet</h2>
      <p className="mt-1 max-w-sm text-sm text-brand-dark/55">
        Create your first product. Drop in a raw idea and the factory runs Stage 1 immediately.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
      >
        <Plus className="h-4 w-4" />
        Create a project
      </button>
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div
      className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4"
      aria-hidden="true"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="min-w-0 rounded-xl bg-brand-surface p-4 shadow-sm ring-1 ring-brand-line">
          <div className="h-7 w-7 animate-pulse rounded-lg bg-brand-line" />
          <div className="mt-2 h-4 w-24 animate-pulse rounded bg-brand-line" />
          <div className="mt-2 h-3 w-full animate-pulse rounded bg-brand-line-soft" />
          <div className="mt-3 h-20 animate-pulse rounded-lg bg-brand-line-soft" />
        </div>
      ))}
    </div>
  );
}
