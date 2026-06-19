'use client';

import { useEffect, useRef, useState } from 'react';
import { Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '../_lib/cn';

/**
 * DeleteRunControl — a guarded delete affordance shared by the card and the
 * list row. Single click reveals an inline confirm ("Delete?" · Cancel /
 * Delete) so a stray click can never destroy a project; only the explicit
 * second click fires DELETE /api/factory/runs/:id. On success it calls
 * `onDeleted` so the board re-polls and the row/card disappears.
 *
 * Two layouts via `variant`:
 *   - "icon"  → a ghost trash button (used on the kanban card, top-right).
 *   - "inline" → a text "Delete" button (used in the list-row action cell).
 */
export function DeleteRunControl({
  runId,
  seed,
  variant = 'icon',
  onDeleted,
}: {
  runId: string;
  seed: string;
  variant?: 'icon' | 'inline';
  /** Fires after a successful (or already-gone 404) delete. */
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  // Move focus to the destructive button when the confirm step appears, so a
  // keyboard user lands on the action they just asked to see.
  useEffect(() => {
    if (confirming) confirmBtnRef.current?.focus();
  }, [confirming]);

  async function doDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/factory/runs/${runId}`, { method: 'DELETE' });
      // 404 = already deleted elsewhere → treat as success and let the board reconcile.
      if (!res.ok && res.status !== 404) {
        const data = await res.json().catch(() => ({}));
        setError(data.error?.message ?? `Delete failed (${res.status}).`);
        setBusy(false);
        return;
      }
      onDeleted();
      // Component unmounts when the card disappears; no need to reset state.
    } catch {
      setError('Network error.');
      setBusy(false);
    }
  }

  if (confirming) {
    return (
      <span
        className="inline-flex items-center gap-1.5"
        // Stop the card/row open-on-click from firing while confirming.
        onClick={(e) => e.stopPropagation()}
      >
        {error ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            {error}
          </span>
        ) : (
          <span className="text-[11px] font-medium text-brand-dark/55">Delete?</span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setConfirming(false);
            setError(null);
          }}
          disabled={busy}
          className="rounded-md px-2 py-1 text-[11px] font-semibold text-brand-dark/60 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          ref={confirmBtnRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void doDelete();
          }}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-2 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <Trash2 className="h-3 w-3" aria-hidden="true" />}
          Delete
        </button>
      </span>
    );
  }

  if (variant === 'inline') {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setConfirming(true);
        }}
        aria-label={`Delete ${seed}`}
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold text-brand-dark/50 transition-colors hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        Delete
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setConfirming(true);
      }}
      aria-label={`Delete ${seed}`}
      className={cn(
        'rounded-md p-1 text-brand-dark/30 transition-colors',
        'hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40',
        // Reveal on card hover/focus to keep the resting card clean, but keep it
        // always-visible for keyboard/touch via focus-within on the parent.
        'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:opacity-100',
      )}
    >
      <Trash2 className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
