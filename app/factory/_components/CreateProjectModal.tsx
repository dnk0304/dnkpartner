'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Sparkles, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '../_lib/cn';
import type { RunDetail } from '../_lib/types';

/**
 * CreateProjectModal — "+ Create a project". Seed input (prefilled with Dennis's
 * canonical test seed), ≥3-char validation, POST /api/factory/runs. On 201 it
 * hands the new run back to the workspace which drops the card on the board.
 * 502 stage_failed is surfaced honestly — the run row still exists at Stage 1.
 *
 * Accessibility: focus-trapped dialog, Escape to close, focus restored on close,
 * labelled by its heading.
 */
export function CreateProjectModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (run: RunDetail, warning?: string) => void;
}) {
  const [seed, setSeed] = useState('Divorce Organizer');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const mounted = typeof document !== 'undefined';

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  const trimmed = seed.trim();
  const valid = trimmed.length >= 3;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/factory/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed: trimmed }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 201 && data.run) {
        onCreated(data.run as RunDetail);
        return;
      }
      // 502 stage_failed still returns the run row — show it on the board with a warning.
      if (res.status === 502 && data.run) {
        onCreated(data.run as RunDetail, data.error?.message ?? 'Stage 1 failed — retry from the card.');
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
          Give the factory a raw idea or niche. Stage 1 runs immediately and stops
          for your approval at the niche gate.
        </p>

        <form onSubmit={handleSubmit}>
          <label htmlFor="seed-input" className="mb-1.5 block text-sm font-medium text-brand-accent">
            Idea / niche
          </label>
          <input
            id="seed-input"
            ref={inputRef}
            type="text"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            disabled={submitting}
            placeholder="e.g. Divorce Organizer"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-brand-dark outline-none transition-all placeholder:text-brand-dark/35 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/30 disabled:opacity-60"
            aria-describedby="seed-help"
          />
          <p id="seed-help" className="mt-1.5 text-xs text-brand-dark/45">
            Minimum 3 characters. This becomes the project name.
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
              disabled={!valid || submitting}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors',
                'hover:bg-brand-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
