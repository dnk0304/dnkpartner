import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useLivePolling — generic auto-refresh hook for the AI Trends views.
 *
 * Wraps a fetcher in a setInterval poll. Designed to mirror the pattern already
 * proven in DataSources.tsx / ScraperHealth.tsx but as a reusable primitive so
 * every section in the Trends UI can opt in to live updates without duplicating
 * the loading/error/interval boilerplate.
 *
 * Behavior:
 * - Fires the fetcher immediately on mount.
 * - Re-fires every `intervalMs` (default 60s).
 * - Tracks `lastUpdatedAt` (set on each successful fetch) so the UI can render
 *   a "Updated Xs ago" indicator.
 * - Surfaces `isRefreshing` distinct from `isLoading` so the UI can show a
 *   subtle indicator on background refreshes WITHOUT swapping back to the
 *   full-section loading state (which would flicker).
 * - `staggerMs` shifts the first interval tick by N ms so multiple views
 *   sharing the page don't all hammer the backend on the same second.
 */
export interface UseLivePollingOptions {
  /** Polling interval in ms. Default 60000 (60s). */
  intervalMs?: number;
  /** Offset (ms) applied to the first scheduled tick. Lets callers stagger. */
  staggerMs?: number;
  /** When false, the hook does not fetch or schedule. Default true. */
  enabled?: boolean;
}

export interface UseLivePollingResult<T> {
  data: T | null;
  /** True on the first load only — switches off forever after first success/failure. */
  isLoading: boolean;
  /** True while a background refresh is in flight (NOT the initial load). */
  isRefreshing: boolean;
  error: string | null;
  /** Wall-clock time of the last successful fetch (null until first success). */
  lastUpdatedAt: Date | null;
  /** Manual trigger. Same code path as the interval. */
  refresh: () => Promise<void>;
}

export function useLivePolling<T>(
  fetcher: () => Promise<T>,
  options: UseLivePollingOptions = {}
): UseLivePollingResult<T> {
  const { intervalMs = 60000, staggerMs = 0, enabled = true } = options;

  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  // Keep the latest fetcher in a ref so the interval doesn't capture a stale
  // closure (callers usually inline a fresh arrow function each render).
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // Track whether the FIRST load has resolved. After that, subsequent fetches
  // are background refreshes and must not flip `isLoading` back to true.
  const hasLoadedOnce = useRef(false);

  const run = useCallback(async () => {
    if (hasLoadedOnce.current) {
      setIsRefreshing(true);
    }
    try {
      const result = await fetcherRef.current();
      setData(result);
      setError(null);
      setLastUpdatedAt(new Date());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load';
      setError(message);
    } finally {
      hasLoadedOnce.current = true;
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // Fire immediately, then schedule.
    run();

    let intervalId: ReturnType<typeof setInterval> | null = null;
    const startId = setTimeout(() => {
      intervalId = setInterval(run, intervalMs);
    }, Math.max(0, staggerMs));

    return () => {
      clearTimeout(startId);
      if (intervalId) clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs, staggerMs]);

  return { data, isLoading, isRefreshing, error, lastUpdatedAt, refresh: run };
}
