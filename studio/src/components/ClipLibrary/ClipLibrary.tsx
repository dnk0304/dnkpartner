/**
 * Clip Library — browse the 3868-clip corpus and pick a cut.
 *
 * Layout: facets left, grid centre, selection right. Below `lg` the two rails
 * become toggleable panels and the grid drops to a single column, so the view
 * stays usable on a phone without a second implementation.
 *
 * The visual brief here is "get out of the way of the footage": the tiles are
 * the only colourful thing on screen, the chrome is flat surface and border
 * tokens, and the warm accent is reserved for exactly one meaning — this clip
 * is in your selection.
 */
import { useCallback, useMemo, useState } from 'react';
import { ArrowLeft, ListVideo, SlidersHorizontal, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { ClipGrid } from './ClipGrid';
import { FacetSidebar } from './FacetSidebar';
import { SelectionCart } from './SelectionCart';
import { useClips, useFacets } from '../../hooks/useClipLibrary';
import { formatDuration, useSelectionCart } from '../../hooks/useSelectionCart';
import { EMPTY_FILTERS, type ClipFilters, type ClipSort } from '../../types/ClipLibrary';

const SORT_LABELS: Record<ClipSort, string> = {
  laugh_desc: 'Funniest first',
  duration_asc: 'Shortest first',
  duration_desc: 'Longest first',
  newest: 'Newest first',
};

/** One removable summary of an active constraint. */
interface Chip {
  key: string;
  label: string;
  clear: (f: ClipFilters) => ClipFilters;
}

function activeChips(filters: ClipFilters): Chip[] {
  const chips: Chip[] = [];
  filters.comedian.forEach((v) =>
    chips.push({
      key: `comedian:${v}`,
      label: v,
      clear: (f) => ({ ...f, comedian: f.comedian.filter((x) => x !== v) }),
    })
  );
  filters.quality.forEach((v) =>
    chips.push({
      key: `quality:${v}`,
      label: v,
      clear: (f) => ({ ...f, quality: f.quality.filter((x) => x !== v) }),
    })
  );
  filters.tag.forEach((v) =>
    chips.push({
      key: `tag:${v}`,
      label: `#${v}`,
      clear: (f) => ({ ...f, tag: f.tag.filter((x) => x !== v) }),
    })
  );
  if (filters.laugh_min !== undefined) {
    chips.push({
      key: 'laugh_min',
      label: `laugh ${filters.laugh_min}+`,
      clear: (f) => ({ ...f, laugh_min: undefined }),
    });
  }
  if (filters.dur_min !== undefined || filters.dur_max !== undefined) {
    chips.push({
      key: 'duration',
      label:
        filters.dur_max === undefined
          ? `${filters.dur_min}s and over`
          : `${filters.dur_min}–${filters.dur_max}s`,
      clear: (f) => ({ ...f, dur_min: undefined, dur_max: undefined }),
    });
  }
  if (filters.q?.trim()) {
    chips.push({
      key: 'q',
      label: `"${filters.q.trim()}"`,
      clear: (f) => ({ ...f, q: undefined }),
    });
  }
  return chips;
}

export function ClipLibrary() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<ClipFilters>(EMPTY_FILTERS);
  const [showFacets, setShowFacets] = useState(false);
  const [showCart, setShowCart] = useState(false);

  const { clips, total, loadUntil, isLoading, isFetchingNextPage, error, refetch } =
    useClips(filters);
  const { facets } = useFacets(filters);
  const cart = useSelectionCart();

  const chips = useMemo(() => activeChips(filters), [filters]);
  const clearAll = useCallback(() => setFilters(EMPTY_FILTERS), []);

  return (
    <div className="flex h-screen flex-col bg-[var(--color-background)] text-[var(--color-text)]">
      {/* Header */}
      <header className="flex shrink-0 items-center gap-3 border-b border-[var(--color-border)] px-4 py-3">
        <button
          type="button"
          onClick={() => navigate('/')}
          aria-label="Back to studio"
          className="rounded-[var(--radius-md)] p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary-hover)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>

        <h1 className="text-base font-bold">Clip Library</h1>

        <p className="font-[var(--font-mono)] text-[12px] tabular-nums text-[var(--color-text-muted)]">
          <span aria-live="polite">{total.toLocaleString()} clips</span>
        </p>

        <label className="ml-auto flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]">
          <span className="hidden sm:inline">Sort</span>
          <select
            value={filters.sort}
            onChange={(e) => setFilters({ ...filters, sort: e.target.value as ClipSort })}
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[12px] text-[var(--color-text)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-primary-hover)]"
          >
            {(Object.keys(SORT_LABELS) as ClipSort[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABELS[k]}
              </option>
            ))}
          </select>
        </label>

        {/* Mobile panel toggles. */}
        <button
          type="button"
          onClick={() => setShowFacets(true)}
          className="rounded-[var(--radius-md)] p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary-hover)] lg:hidden"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">Show filters</span>
        </button>
        <button
          type="button"
          onClick={() => setShowCart(true)}
          className="flex items-center gap-1.5 rounded-[var(--radius-md)] px-2 py-1.5 text-[12px] text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary-hover)] lg:hidden"
        >
          <ListVideo className="h-4 w-4" aria-hidden="true" />
          <span className="font-[var(--font-mono)] tabular-nums">
            {cart.items.length} · {formatDuration(cart.totalDuration)}
          </span>
          <span className="sr-only">Show selection</span>
        </button>
      </header>

      {/* Active filter chips */}
      {chips.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-[var(--color-border)] px-4 py-2">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => setFilters(chip.clear(filters))}
              aria-label={`Remove filter ${chip.label}`}
              className="flex items-center gap-1 rounded-full bg-[var(--color-surface)] px-2 py-0.5 text-[11px] text-[var(--color-text-muted)] ring-1 ring-[var(--color-border)] hover:text-[var(--color-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary-hover)]"
            >
              {chip.label}
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          ))}
          <button
            type="button"
            onClick={clearAll}
            className="ml-1 text-[11px] text-[var(--color-text-dim)] underline underline-offset-2 hover:text-[var(--color-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary-hover)]"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[248px] shrink-0 border-r border-[var(--color-border)] lg:block">
          <FacetSidebar facets={facets} filters={filters} onChange={setFilters} />
        </aside>

        <main className="min-w-0 flex-1">
          <ClipGrid
            clips={clips}
            total={total}
            selectedIds={cart.ids}
            onToggleSelect={cart.toggle}
            onReachedIndex={loadUntil}
            isLoading={isLoading}
            isFetchingMore={isFetchingNextPage}
            error={error}
            onRetry={() => void refetch()}
            onClearFilters={clearAll}
          />
        </main>

        <aside className="hidden w-[300px] shrink-0 border-l border-[var(--color-border)] lg:block">
          <SelectionCart
            items={cart.items}
            totalDuration={cart.totalDuration}
            onRemove={cart.remove}
            onMove={cart.move}
            onClear={cart.clear}
            buildSelectionFile={cart.toSelectionFile}
          />
        </aside>
      </div>

      {/* Mobile overlays — same components, presented as sheets. */}
      {showFacets && (
        <MobileSheet title="Filters" side="left" onClose={() => setShowFacets(false)}>
          <FacetSidebar facets={facets} filters={filters} onChange={setFilters} />
        </MobileSheet>
      )}
      {showCart && (
        <MobileSheet title="Selection" side="right" onClose={() => setShowCart(false)}>
          <SelectionCart
            items={cart.items}
            totalDuration={cart.totalDuration}
            onRemove={cart.remove}
            onMove={cart.move}
            onClear={cart.clear}
            buildSelectionFile={cart.toSelectionFile}
          />
        </MobileSheet>
      )}
    </div>
  );
}

interface MobileSheetProps {
  title: string;
  side: 'left' | 'right';
  onClose: () => void;
  children: React.ReactNode;
}

function MobileSheet({ title, side, onClose, children }: MobileSheetProps) {
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        aria-label={`Close ${title}`}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/60"
      />
      <div
        role="dialog"
        aria-label={title}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
        className={cn(
          'absolute inset-y-0 flex w-[86%] max-w-[340px] flex-col bg-[var(--color-background)]',
          side === 'left' ? 'left-0 border-r' : 'right-0 border-l',
          'border-[var(--color-border)]'
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary-hover)]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
