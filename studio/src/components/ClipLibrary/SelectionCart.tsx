/**
 * Selection cart — the clips you've picked, in the order they'd be cut.
 *
 * Order is the point of this panel, so it is reorderable two ways: drag for
 * pointer users, and explicit move up/down buttons, because native HTML5 drag
 * and drop is unreachable by keyboard and by most screen readers. Both drive
 * the same `move` reducer.
 *
 * "Create Project" is CP2-scoped: it serialises {clip_ids, total_duration} to a
 * selection.json download and logs it. Writing it into studio_video_project is
 * CP4.
 */
import { useCallback, useState } from 'react';
import { ChevronDown, ChevronUp, Download, GripVertical, Trash2, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { formatDuration, type CartItem } from '../../hooks/useSelectionCart';
import type { ClipSelectionFile } from '../../types/ClipLibrary';

export interface SelectionCartProps {
  items: CartItem[];
  totalDuration: number;
  onRemove: (id: string) => void;
  onMove: (from: number, to: number) => void;
  onClear: () => void;
  buildSelectionFile: () => ClipSelectionFile;
}

export function SelectionCart({
  items,
  totalDuration,
  onRemove,
  onMove,
  onClear,
  buildSelectionFile,
}: SelectionCartProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const createProject = useCallback(() => {
    const selection = buildSelectionFile();
    // CP2 hand-off: console + file. No persistence — that's CP4.
    console.log('[ClipLibrary] selection.json', selection);

    const blob = new Blob([JSON.stringify(selection, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'selection.json';
    link.click();
    URL.revokeObjectURL(url);
  }, [buildSelectionFile]);

  return (
    <div className="flex h-full flex-col bg-[var(--color-surface)]">
      <div className="flex items-baseline justify-between gap-2 border-b border-[var(--color-border)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Selection</h2>
        <p className="font-[var(--font-mono)] text-[13px] tabular-nums text-[var(--color-text-muted)]">
          {/* aria-live so the running total is announced as clips go in and out. */}
          <span aria-live="polite">
            {items.length} {items.length === 1 ? 'clip' : 'clips'} · {formatDuration(totalDuration)}
          </span>
        </p>
      </div>

      {items.length === 0 ? (
        <p className="px-4 py-6 text-[13px] leading-relaxed text-[var(--color-text-dim)]">
          Pick clips from the grid to build a cut. Press Enter on a focused clip, or use the
          plus button.
        </p>
      ) : (
        <ol className="flex-1 overflow-y-auto px-2 py-2">
          {items.map((item, index) => (
            <li
              key={item.id}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragEnd={() => setDragIndex(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null) onMove(dragIndex, index);
                setDragIndex(null);
              }}
              className={cn(
                'group flex items-center gap-1.5 rounded-[var(--radius-md)] px-1.5 py-1.5',
                'hover:bg-[var(--color-surface-hover)]',
                dragIndex === index && 'opacity-40'
              )}
            >
              <GripVertical
                className="h-3.5 w-3.5 shrink-0 cursor-grab text-[var(--color-text-dim)]"
                aria-hidden="true"
              />
              <span className="w-5 shrink-0 font-[var(--font-mono)] text-[11px] tabular-nums text-[var(--color-text-dim)]">
                {index + 1}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] text-[var(--color-text)]">
                  {item.comedian}
                </span>
                <span className="block truncate font-[var(--font-mono)] text-[10px] text-[var(--color-text-dim)]">
                  {item.id}
                </span>
              </span>

              <span className="shrink-0 font-[var(--font-mono)] text-[11px] tabular-nums text-[var(--color-text-muted)]">
                {formatDuration(item.duration)}
              </span>

              {/* Keyboard-reachable equivalent of dragging. */}
              <button
                type="button"
                onClick={() => onMove(index, index - 1)}
                disabled={index === 0}
                aria-label={`Move ${item.id} earlier`}
                className="shrink-0 rounded p-0.5 text-[var(--color-text-dim)] hover:text-[var(--color-text)] disabled:opacity-25 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-primary-hover)]"
              >
                <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => onMove(index, index + 1)}
                disabled={index === items.length - 1}
                aria-label={`Move ${item.id} later`}
                className="shrink-0 rounded p-0.5 text-[var(--color-text-dim)] hover:text-[var(--color-text)] disabled:opacity-25 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-primary-hover)]"
              >
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                aria-label={`Remove ${item.id} from selection`}
                className="shrink-0 rounded p-0.5 text-[var(--color-text-dim)] hover:text-[var(--color-error)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-primary-hover)]"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-auto flex items-center gap-2 border-t border-[var(--color-border)] px-3 py-3">
        <button
          type="button"
          onClick={onClear}
          disabled={items.length === 0}
          className="flex items-center gap-1.5 rounded-[var(--radius-md)] px-2 py-1.5 text-[12px] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary-hover)]"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          Clear
        </button>

        <button
          type="button"
          onClick={createProject}
          disabled={items.length === 0}
          className="ml-auto flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-accent)] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary-hover)]"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Create project
        </button>
      </div>
    </div>
  );
}
