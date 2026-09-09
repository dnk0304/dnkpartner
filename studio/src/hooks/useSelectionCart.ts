/**
 * The Clip Library selection cart.
 *
 * Holds the picked clips in the order they'll be cut, survives reloads via
 * localStorage, and derives the running total from the stored durations so the
 * total is correct even before the grid has re-fetched those clips.
 *
 * CP2 scope: the cart serialises to a selection.json download. Writing it into
 * studio_video_project is CP4 — deliberately not built here.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Clip, ClipSelectionFile } from '../types/ClipLibrary';

/** The minimum we keep per pick: enough to render the cart without a refetch. */
export interface CartItem {
  id: string;
  comedian: string;
  duration: number;
}

/**
 * The studio SPA has no client-side user identity — auth is enforced by the
 * Next.js gate in front of /studio/*, and the server treats the studio as
 * single-tenant (siteBuilder.ts uses DEFAULT_TENANT_ID the same way). The key
 * is shaped for a real user id so CP4 can pass one through without migrating
 * anyone's stored cart to a different key by accident.
 */
export const DEFAULT_CART_USER = 'default';

export function cartStorageKey(user: string): string {
  return `dnk.studio.clipLibrary.cart.${user}`;
}

function readCart(key: string): CartItem[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Stored data is user-writable and may predate a field — validate per item
    // rather than trusting the blob.
    return parsed.filter(
      (v): v is CartItem =>
        !!v &&
        typeof v === 'object' &&
        typeof (v as CartItem).id === 'string' &&
        typeof (v as CartItem).duration === 'number'
    );
  } catch {
    // Private mode, blocked site data, or corrupt JSON — start empty.
    return [];
  }
}

/** Seconds → m:ss, or h:mm:ss once a selection passes an hour. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

export function useSelectionCart(user: string = DEFAULT_CART_USER) {
  const key = cartStorageKey(user);
  const [items, setItems] = useState<CartItem[]>(() => readCart(key));

  // Re-read when the identity changes, so switching users never inherits a cart.
  useEffect(() => {
    setItems(readCart(key));
  }, [key]);

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(items));
    } catch {
      // Storage unavailable — the cart still works for this session.
    }
  }, [key, items]);

  const ids = useMemo(() => new Set(items.map((i) => i.id)), [items]);
  const totalDuration = useMemo(
    () => items.reduce((sum, i) => sum + (i.duration || 0), 0),
    [items]
  );

  const add = useCallback((clip: Clip) => {
    setItems((prev) =>
      prev.some((i) => i.id === clip.id)
        ? prev
        : [...prev, { id: clip.id, comedian: clip.comedian, duration: clip.duration }]
    );
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const toggle = useCallback((clip: Clip) => {
    setItems((prev) =>
      prev.some((i) => i.id === clip.id)
        ? prev.filter((i) => i.id !== clip.id)
        : [...prev, { id: clip.id, comedian: clip.comedian, duration: clip.duration }]
    );
  }, []);

  const clear = useCallback(() => setItems([]), []);

  /** Move the item at `from` to `to`, keeping every other item's order. */
  const move = useCallback((from: number, to: number) => {
    setItems((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  /** The CP2 hand-off shape. CP4 consumes this same object. */
  const toSelectionFile = useCallback(
    (): ClipSelectionFile => ({
      version: 1,
      created_at: new Date().toISOString(),
      clip_ids: items.map((i) => i.id),
      total_duration: Number(totalDuration.toFixed(3)),
    }),
    [items, totalDuration]
  );

  return {
    items,
    ids,
    totalDuration,
    add,
    remove,
    toggle,
    clear,
    move,
    toSelectionFile,
  };
}
