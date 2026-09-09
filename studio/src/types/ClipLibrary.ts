/**
 * Clip Library (CP2) — client-side contract for the read API in
 * studio/server/clipLibrary.ts.
 *
 * Field names mirror the `studio_library_clip` columns exactly, so the row the
 * API selects is the object the UI renders. Nothing here is written back: CP2
 * is read-only browse + pick. Persisting a selection into studio_video_project
 * is CP4.
 */

export type ClipQuality = 'killer' | 'good' | 'usable' | 'skip';

export type ClipSort = 'laugh_desc' | 'duration_asc' | 'duration_desc' | 'newest';

/** One row of `studio_library_clip`, as returned by GET /api/library/clips. */
export interface Clip {
  id: string;
  comedian: string;
  tags: string[];
  /** 1–5. Null for clips the scorer never reached. */
  laugh_score: number | null;
  quality: ClipQuality;
  /** Seconds. */
  duration: number;
  source_file: string;
  t_in: number;
  t_out: number;
  /** "clip-previews/<id>.mp4" — informational; the UI streams via the API route. */
  preview_path: string;
  created_at: string;
}

export interface ClipsResponse {
  items: Clip[];
  total: number;
  page: number;
  limit: number;
  sort: ClipSort;
}

/** A facet row: the value plus how many clips still match it. */
export interface FacetBucket<V = string> {
  value: V;
  count: number;
}

/**
 * GET /api/library/facets. Every facet is counted against the OTHER active
 * filters, so the sidebar keeps showing the alternatives you could still add
 * rather than collapsing to what you already picked.
 */
export interface FacetsResponse {
  comedian: FacetBucket[];
  quality: FacetBucket<ClipQuality>[];
  laugh_score: FacetBucket<number | null>[];
  tag: FacetBucket[];
  /** Bucket labels: '0-10' | '10-20' | '20-40' | '40+'. */
  duration: FacetBucket[];
  total: number;
}

/** The user's current query. Empty arrays / undefined mean "no constraint". */
export interface ClipFilters {
  comedian: string[];
  tag: string[];
  quality: ClipQuality[];
  laugh_min?: number;
  dur_min?: number;
  dur_max?: number;
  q?: string;
  sort: ClipSort;
}

export const EMPTY_FILTERS: ClipFilters = {
  comedian: [],
  tag: [],
  quality: [],
  sort: 'laugh_desc',
};

/**
 * The payload "Create Project" emits in CP2 — download + console only.
 * CP4 turns this exact shape into a studio_video_project row, so the field
 * names are the contract and should not drift.
 */
export interface ClipSelectionFile {
  version: 1;
  created_at: string;
  clip_ids: string[];
  total_duration: number;
}
