/**
 * Data access for the Clip Library (CP2).
 *
 * All requests go to relative `/api/library/*` URLs. In production the SPA is
 * served from `/studio/`, and main.tsx installs a global fetch shim that
 * rewrites `/api/...` → `/studio/api/...`. So these paths must stay relative
 * and un-prefixed — hardcoding `/studio` here would double the prefix.
 */
import { useCallback, useMemo } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type {
  ClipFilters,
  ClipsResponse,
  FacetsResponse,
} from '../types/ClipLibrary';

/** Page size. The API caps limit at 200; a big page keeps scroll ahead of the user. */
export const PAGE_SIZE = 120;

/**
 * Serialise filters to the query string the API parses. Repeated params for
 * arrays (?comedian=a&comedian=b); empty values are omitted entirely so the
 * URL — and therefore the react-query cache key — stays stable.
 */
export function filtersToParams(filters: ClipFilters): URLSearchParams {
  const p = new URLSearchParams();
  filters.comedian.forEach((v) => p.append('comedian', v));
  filters.tag.forEach((v) => p.append('tag', v));
  filters.quality.forEach((v) => p.append('quality', v));
  if (filters.laugh_min !== undefined) p.set('laugh_min', String(filters.laugh_min));
  if (filters.dur_min !== undefined) p.set('dur_min', String(filters.dur_min));
  if (filters.dur_max !== undefined) p.set('dur_max', String(filters.dur_max));
  if (filters.q?.trim()) p.set('q', filters.q.trim());
  p.set('sort', filters.sort);
  return p;
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

/** Stream URL for one clip's 480p preview. Range-served by the API. */
export function previewUrl(clipId: string): string {
  return `/api/library/clips/${encodeURIComponent(clipId)}/preview`;
}

/**
 * Paged clip fetch. Pages accumulate into one flat list so the virtualiser can
 * index straight into it; `loadUntil` is called by the grid as the window
 * approaches the end of what's loaded.
 */
export function useClips(filters: ClipFilters) {
  const params = useMemo(() => filtersToParams(filters).toString(), [filters]);

  const query = useInfiniteQuery({
    queryKey: ['library', 'clips', params],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      getJson<ClipsResponse>(
        `/api/library/clips?${params}&page=${pageParam}&limit=${PAGE_SIZE}`,
        signal
      ),
    getNextPageParam: (last) =>
      last.page * last.limit < last.total ? last.page + 1 : undefined,
  });

  const clips = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data]
  );
  const total = query.data?.pages[0]?.total ?? 0;

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;

  /**
   * Ask for more once the grid has scrolled within `index` of the loaded tail.
   * Guarded so repeated scroll events don't queue duplicate page requests.
   */
  const loadUntil = useCallback(
    (index: number) => {
      if (hasNextPage && !isFetchingNextPage && index >= clips.length - PAGE_SIZE / 2) {
        void fetchNextPage();
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage, clips.length]
  );

  return {
    clips,
    total,
    loadUntil,
    isLoading: query.isLoading,
    isFetchingNextPage,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}

/** Facet counts for the sidebar, recounted against the active filters. */
export function useFacets(filters: ClipFilters) {
  const params = useMemo(() => filtersToParams(filters).toString(), [filters]);

  const query = useQuery({
    queryKey: ['library', 'facets', params],
    queryFn: ({ signal }) => getJson<FacetsResponse>(`/api/library/facets?${params}`, signal),
    // Keep the previous counts on screen while the next ones load, so the
    // sidebar doesn't collapse and reflow under the pointer mid-click.
    placeholderData: (prev) => prev,
  });

  return {
    facets: query.data,
    isLoading: query.isLoading,
    error: query.error as Error | null,
  };
}
