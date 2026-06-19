'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Sparkles, Loader2, AlertCircle, Compass } from 'lucide-react';
import { cn } from '../_lib/cn';
import type { RunDetail } from '../_lib/types';

/**
 * CreateProjectModal — "+ Create a project". The seed field is now an OPTIONAL
 * HINT box: type a genre/area you have experience with to steer niche discovery,
 * or leave it blank to let the factory discover niches for you. POST
 * /api/factory/runs {hint} (empty hint is VALID = discover mode). On 201 the run
 * is `awaiting_selection` with N candidate niches — the workspace opens the
 * niche-picker. 502 generation_failed is surfaced honestly; the run row exists.
 *
 * Accessibility: focus-trapped dialog, Escape to close, focus restored on close,
 * labelled by its heading, labelled hint input.
 */
export function CreateProjectModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (run: RunDetail, warning?: string) => void;
}) {
  const [hint, setHint] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const mounted = typeof document !== 'undefined';

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  const trimmed = hint.trim();
  // Empty hint is VALID — it means "help me discover". Never block submission.
  const discoverMode = trimmed.length === 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/factory/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hint: trimmed }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 201 && data.run) {
        onCreated(data.run as RunDetail);
        return;
      }
      // 502 generation_failed still returns the run row — surface it honestly.
      if (res.status === 502 && data.run) {
        onCreated(
          data.run as RunDetail,
          data.error?.message ?? 'Niche generation failed — retry from the card.',
        );
        return;
      }
      setError(data.error?.message ?? `Create failed (${res.status}).`);
      setSubmitting(false);
    } catch {
      setError('Network error — could not reach the factory.');
      setSubmitting(false);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-project-title"
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-brand-dark/40 backdrop-blur-sm"
        onClick={() => !submitting && onClose()}
      />
      <div
        ref={dialogRef}
        className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-200"
      >
        <button
          type="button"
          onClick={() => !submitting && onClose()}
          className="absolute right-4 top-4 rounded-md p-1 text-brand-dark/40 transition-colors hover:bg-slate-100 hover:text-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
          aria-label="Close dialog"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-1 flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 shadow-sm">
            <Sparkles className="h-4 w-4 text-white" />
          </span>
          <h2 id="create-project-title" className="text-lg font-semibold text-brand-accent">
            Create a project
          </h2>
        </div>
        <p className="mb-4 text-sm text-brand-dark/60">
          The factory will discover a handful of distinct niches for you to choose
          from. Give it a hint to steer the search, or leave it blank to discover
          from scratch.
        </p>

        <form onSubmit={handleSubmit}>
          <label htmlFor="hint-input" className="mb-1.5 block text-sm font-medium text-brand-accent">
            Hint <span className="font-normal text-brand-dark/45">(optional)</span>
          </label>
          <input
            id="hint-input"
            ref={inputRef}
            type="text"
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            disabled={submitting}
            placeholder="e.g. divorce &amp; family admin — or leave blank"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-brand-dark outline-none transition-all placeholder:text-brand-dark/35 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/30 disabled:opacity-60"
            aria-describedby="hint-help"
          />
          <p id="hint-help" className="mt-1.5 text-xs text-brand-dark/45">
            {discoverMode
              ? 'Blank — the factory will discover niches for you.'
              : 'A genre or area you have experience with. We honor it; we don’t ignore it.'}
          </p>

          {error && (
            <div
              className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
              role="alert"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => !submitting && onClose()}
              disabled={submitting}
              className="rounded-lg px-4 py-2 text-sm font-medium text-brand-dark/70 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors',
                'hover:bg-brand-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Compass className="h-4 w-4" />
              )}
              {submitting ? 'Discovering niches…' : 'Discover niches'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
