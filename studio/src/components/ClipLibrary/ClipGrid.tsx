/**
 * The virtualised clip grid.
 *
 * Renders only the rows intersecting the viewport and asks for the next API
 * page as the window nears the loaded tail, so the full 3868-clip corpus
 * scrolls without ever holding more than ~30 <video> elements in the DOM.
 */
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { ClipTile } from './ClipTile';
import { useVirtualGrid } from '../../hooks/useVirtualGrid';
import type { Clip } from '../../types/ClipLibrary';

/** Must match the meta strip's rendered height in ClipTile. */
const META_HEIGHT = 62;
const MIN_TILE_WIDTH = 232;
const GAP = 12;

export interface ClipGridProps {
  clips: Clip[];
  total: number;
  selectedIds: Set<string>;
  onToggleSelect: (clip: Clip) => void;
  onReachedIndex: (index: number) => void;
  isLoading: boolean;
  isFetchingMore: boolean;
  error: Error | null;
  onRetry: () => void;
  onClearFilters: () => void;
}

export function ClipGrid({
  clips,
  total,
  selectedIds,
  onToggleSelect,
  onReachedIndex,
  isLoading,
  isFetchingMore,
  error,
  onRetry,
  onClearFilters,
}: ClipGridProps) {
  const grid = useVirtualGrid({
    itemCount: clips.length,
    minTileWidth: MIN_TILE_WIDTH,
    metaHeight: META_HEIGHT,
    gap: GAP,
  });

  const { endIndex } = grid;
  useEffect(() => {
    onReachedIndex(endIndex);
  }, [endIndex, onReachedIndex]);

  const visible = clips.slice(grid.startIndex, grid.endIndex);

  return (
    <div ref={grid.scrollRef} className="h-full overflow-y-auto overflow-x-hidden px-4 pb-6">
      {error && (
        <div
          role="alert"
          className="mt-6 rounded-[var(--radius-lg)] border border-[var(--color-error)]/40 bg-[var(--color-error)]/10 p-4"
        >
          <p className="text-sm text-[var(--color-text)]">
            The clip library didn&rsquo;t load. {error.message}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 rounded-[var(--radius-md)] bg-[var(--color-surface-hover)] px-3 py-1.5 text-sm text-[var(--color-text)] hover:bg-[var(--color-border)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary-hover)]"
          >
            Try again
          </button>
        </div>
      )}

      {isLoading && !error && (
        <p className="mt-10 flex items-center justify-center gap-2 text-sm text-[var(--color-text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading clips&hellip;
        </p>
      )}

      {!isLoading && !error && total === 0 && (
        <div className="mt-16 text-center">
          <p className="text-sm text-[var(--color-text)]">No clips match these filters.</p>
          <button
            type="button"
            onClick={onClearFilters}
            className="mt-3 rounded-[var(--radius-md)] bg-[var(--color-surface-hover)] px-3 py-1.5 text-sm text-[var(--color-text)] hover:bg-[var(--color-border)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary-hover)]"
          >
            Clear all filters
          </button>
        </div>
      )}

      {/* The spacer carries the full scroll height; the rendered window is
          translated into place inside it. */}
      <div style={{ height: grid.totalHeight, position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            transform: `translateY(${grid.offsetTop}px)`,
            display: 'grid',
            gridTemplateColumns: `repeat(${grid.columnCount}, minmax(0, 1fr))`,
            gap: `${GAP}px`,
            alignContent: 'start',
          }}
        >
          {visible.map((clip) => (
            <ClipTile
              key={clip.id}
              clip={clip}
              selected={selectedIds.has(clip.id)}
              onToggleSelect={onToggleSelect}
            />
          ))}
        </div>
      </div>

      {isFetchingMore && (
        <p className="flex items-center justify-center gap-2 py-4 text-xs text-[var(--color-text-dim)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Loading more
        </p>
      )}
    </div>
  );
}
