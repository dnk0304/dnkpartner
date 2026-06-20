'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, FolderOpen, AlertCircle } from 'lucide-react';
import { cn } from '../_lib/cn';
import { stageMeta, TOTAL_STAGES, type RunSummary } from '../_lib/types';

/**
 * ProjectsSidebar — the persistent left nav (Monetise-style). Lists EVERY
 * project from the runs API and lets Dennis jump straight into any one's
 * readable view. It is the project-level index; the per-section nav inside a
 * project (ProjectView) is a separate, finer-grained thing.
 *
 * Shown on BOTH the board (`/factory`) and a project view (`/factory/:id`). It
 * derives the active project from the pathname so the open project is
 * highlighted. Pulls from GET /api/factory/runs (same owner gate as everything
 * else) and polls lightly so newly-created projects appear without a reload.
 *
 * The whole nav is a labelled landmark and every project is a real <Link>, so
 * it is fully keyboard-navigable and announced as a list of N projects.
 */

const POLL_INTERVAL_MS = 8000;

export function ProjectsSidebar() {
  const pathname = usePathname();
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [error, setError] = useState(false);

  // Active project id from /factory/<id> (the board itself has no id).
  const match = /^\/factory\/([^/?#]+)/.exec(pathname ?? '');
  const activeId = match ? match[1] : null;
  const onBoard = !activeId;

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch('/api/factory/runs', { cache: 'no-store' });
        if (!res.ok) {
          if (alive) setError(true);
          return;
        }
        const data = (await res.json()) as { runs: RunSummary[] };
        if (alive) {
          setRuns(data.runs ?? []);
          setError(false);
        }
      } catch {
        if (alive) setError(true);
      }
    };
    load();
    const id = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <nav
      aria-label="All projects"
      className="flex h-full flex-col border-r border-slate-200/70 bg-white/70"
    >
      <div className="px-4 pb-3 pt-5">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-dark/40">
          Product Factory
        </p>
        <Link
          href="/factory"
          className={cn(
            'mt-2 flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40',
            onBoard
              ? 'bg-brand-primary/10 text-brand-primary'
              : 'text-brand-dark/70 hover:bg-slate-50 hover:text-brand-accent',
          )}
          aria-current={onBoard ? 'page' : undefined}
        >
          <LayoutGrid className="h-4 w-4 shrink-0" />
          Board (all stages)
        </Link>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-4 pb-5">
        <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-dark/40">
          Projects{runs ? ` (${runs.length})` : ''}
        </p>

        {error && !runs ? (
          <p className="flex items-center gap-1.5 px-1 py-2 text-xs text-rose-600">
            <AlertCircle className="h-3.5 w-3.5" />
            Couldn&apos;t load projects.
          </p>
        ) : runs === null ? (
          <ul className="space-y-1" aria-hidden="true">
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="h-9 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </ul>
        ) : runs.length === 0 ? (
          <p className="px-1 py-2 text-xs text-brand-dark/45">
            No projects yet. Create one on the board.
          </p>
        ) : (
          <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
            {runs.map((run) => {
              const isActive = run.id === activeId;
              return (
                <li key={run.id}>
                  <Link
                    href={`/factory/${run.id}`}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'group flex flex-col gap-0.5 rounded-lg px-2.5 py-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40',
                      isActive
                        ? 'bg-brand-primary/10'
                        : 'hover:bg-slate-50',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <FolderOpen
                        className={cn(
                          'h-4 w-4 shrink-0',
                          isActive ? 'text-brand-primary' : 'text-brand-dark/35',
                        )}
                      />
                      <span
                        className={cn(
                          'truncate text-sm font-medium',
                          isActive ? 'text-brand-primary' : 'text-brand-dark/80 group-hover:text-brand-accent',
                        )}
                      >
                        {run.seed}
                      </span>
                    </span>
                    <span className="pl-6 text-[11px] text-brand-dark/40">
                      Stage {Math.min(run.stage, TOTAL_STAGES)} / {TOTAL_STAGES} · {stageMeta(run.stage).short}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </nav>
  );
}
