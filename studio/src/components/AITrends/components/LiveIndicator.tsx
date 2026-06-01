import { useEffect, useState } from 'react';
import { cn } from '../../../lib/utils';

/**
 * LiveIndicator — small "Live • Updated Xs ago" badge shown next to the
 * Refresh button on auto-polling views.
 *
 * Design intent:
 * - Tiny, subtle, never the loudest thing in the header.
 * - The dot pulses green when the data is fresh, dims when stale (>2×
 *   interval), and turns amber when there's been an error.
 * - The relative timestamp re-renders every 10s so users see it tick up
 *   without re-fetching anything.
 * - Respects the all-black-text rule for the LABEL itself; only the dot
 *   carries the status color so the indicator stays legible against any
 *   background.
 */
export interface LiveIndicatorProps {
  /** Time of the last successful fetch. null = never loaded. */
  lastUpdatedAt: Date | null;
  /** True while a background refresh is in flight. Pulses the dot brighter. */
  isRefreshing?: boolean;
  /** True if the most recent fetch errored. Shows amber dot + tooltip. */
  hasError?: boolean;
  /** Polling cadence in ms. Used to decide when data is "stale". */
  intervalMs?: number;
  className?: string;
}

function formatRelative(date: Date): string {
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
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
  intervalMs = 60000,
  className,
}: LiveIndicatorProps) {
  // Force a re-render every 10s so the "Xs ago" label stays current even
  // when no fetch has happened.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 10000);
    return () => clearInterval(id);
  }, []);

  const ageMs = lastUpdatedAt ? Date.now() - lastUpdatedAt.getTime() : Infinity;
  const isStale = ageMs > intervalMs * 2;

  // Dot color: amber on error, dim gray when stale, pulsing green when live.
  const dotColor = hasError
    ? 'bg-amber-500'
    : isStale
    ? 'bg-gray-400'
    : 'bg-emerald-500';

  const label = !lastUpdatedAt
    ? 'Connecting…'
    : hasError
    ? `Stale (last ok ${formatRelative(lastUpdatedAt)})`
    : `Live • Updated ${formatRelative(lastUpdatedAt)}`;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-gray-50 border border-gray-200',
        'text-xs font-medium text-black select-none',
        className
      )}
      title={lastUpdatedAt ? `Last updated ${lastUpdatedAt.toLocaleString()}` : 'No data yet'}
      aria-live="polite"
    >
      <span className="relative flex h-2 w-2">
        {!hasError && !isStale && (
          <span
            className={cn(
              'absolute inline-flex h-full w-full rounded-full opacity-60',
              isRefreshing ? 'bg-emerald-400 animate-ping' : 'bg-emerald-400 motion-safe:animate-ping'
            )}
          />
        )}
        <span className={cn('relative inline-flex h-2 w-2 rounded-full', dotColor)} />
      </span>
      <span>{label}</span>
    </div>
  );
}
