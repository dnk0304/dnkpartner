'use client';

import { useEffect, useState } from 'react';
import { cn } from '../_lib/cn';

/**
 * LiveIndicator — "Live • Updated Xs ago" pulse. PORTED verbatim in behaviour
 * from studio/src/components/AITrends/components/LiveIndicator.tsx (which lives
 * in the separate studio package and can't be imported here). Same dot-pulse,
 * same stale/error states, same all-black label rule.
 */
export interface LiveIndicatorProps {
  lastUpdatedAt: Date | null;
  isRefreshing?: boolean;
  hasError?: boolean;
  intervalMs?: number;
  className?: string;
}

function formatRelative(date: Date, now: number): string {
  const seconds = Math.max(0, Math.floor((now - date.getTime()) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function LiveIndicator({
  lastUpdatedAt,
  isRefreshing = false,
  hasError = false,
  intervalMs = 3000,
  className,
}: LiveIndicatorProps) {
  // Re-render every 5s with a fresh `now` so the relative label ticks up and the
  // staleness check stays current — without reading the impure Date.now() during
  // render (React 19 purity rule).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const ageMs = lastUpdatedAt ? now - lastUpdatedAt.getTime() : Infinity;
  const isStale = ageMs > intervalMs * 4;

  const dotColor = hasError ? 'bg-amber-500' : isStale ? 'bg-gray-400' : 'bg-emerald-500';

  const label = !lastUpdatedAt
    ? 'Connecting…'
    : hasError
      ? `Stale (last ok ${formatRelative(lastUpdatedAt, now)})`
      : `Live • Updated ${formatRelative(lastUpdatedAt, now)}`;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-gray-50 border border-gray-200',
        'text-xs font-medium text-black select-none',
        className,
      )}
      title={lastUpdatedAt ? `Last updated ${lastUpdatedAt.toLocaleString()}` : 'No data yet'}
      aria-live="polite"
    >
      <span className="relative flex h-2 w-2">
        {!hasError && !isStale && (
          <span
            className={cn(
              'absolute inline-flex h-full w-full rounded-full opacity-60 bg-emerald-400',
              isRefreshing ? 'animate-ping' : 'motion-safe:animate-ping',
            )}
          />
        )}
        <span className={cn('relative inline-flex h-2 w-2 rounded-full', dotColor)} />
      </span>
      <span>{label}</span>
    </div>
  );
}
