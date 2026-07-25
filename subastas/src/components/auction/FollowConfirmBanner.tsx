'use client';

/**
 * FollowConfirmBanner — minimal confirmation strip shown on the auction detail
 * page after a one-click "Seguir esta subasta" email link lands here via
 * GET /api/follow/confirm (Ken brief 2026-07-25).
 *
 * Driven by the `?follow=` query flag the confirm endpoint sets:
 *   ok      → newly following      (green + "Deshacer")
 *   exists  → already following    (green + "Deshacer")
 *   expired → link expired         (amber, log-in-and-Seguir hint)
 *   gone    → auction not found    (amber)
 *   error   → transient failure    (amber, retry hint)
 *
 * "Deshacer" (Undo) calls the existing authenticated DELETE /api/favorites.
 * Deliberately minimal (Ken: route a Pixel follow-up if real polish is wanted).
 */

import { useState } from 'react';

type FollowFlag = 'ok' | 'exists' | 'expired' | 'gone' | 'error';

export function FollowConfirmBanner({
  flag,
  auctionId,
}: {
  flag: string | undefined;
  auctionId: string;
}) {
  const initial: FollowFlag | null =
    flag === 'ok' || flag === 'exists' || flag === 'expired' || flag === 'gone' || flag === 'error'
      ? flag
      : null;

  const [state, setState] = useState<FollowFlag | 'undone' | null>(initial);
  const [busy, setBusy] = useState(false);
  const [undoError, setUndoError] = useState<string | null>(null);

  if (!state) return null;

  const isFollowing = state === 'ok' || state === 'exists';
  const undo = async () => {
    setBusy(true);
    setUndoError(null);
    try {
      const res = await fetch(`/api/favorites?auctionId=${encodeURIComponent(auctionId)}`, {
        method: 'DELETE',
      });
      if (res.status === 401) {
        setUndoError('Inicia sesión para gestionar el seguimiento.');
        return;
      }
      if (!res.ok) {
        setUndoError('No se pudo deshacer. Inténtalo de nuevo.');
        return;
      }
      setState('undone');
    } catch {
      setUndoError('No se pudo deshacer. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  // Palette per state.
  const green = state === 'undone' || isFollowing;
  const wrap = green
    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
    : 'border-amber-200 bg-amber-50 text-amber-900';

  let message: string;
  if (state === 'undone') message = 'Has dejado de seguir esta subasta.';
  else if (isFollowing) message = 'Ya sigues esta subasta ✓ · Te avisaremos de novedades.';
  else if (state === 'expired') message = 'El enlace para seguir ha expirado. Inicia sesión y pulsa «Seguir» para seguir esta subasta.';
  else if (state === 'gone') message = 'Esta subasta ya no está disponible.';
  else message = 'No pudimos completar el seguimiento. Prueba con el botón «Seguir».';

  return (
    <div role="status" className={`mb-4 rounded-lg border px-4 py-3 text-sm ${wrap}`}>
      <div className="flex items-center justify-between gap-3">
        <span>{message}</span>
        <div className="flex items-center gap-3">
          {isFollowing && (
            <button
              type="button"
              onClick={undo}
              disabled={busy}
              className="shrink-0 rounded-md border border-emerald-300 bg-white px-3 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
            >
              {busy ? '…' : 'Deshacer'}
            </button>
          )}
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => setState(null)}
            className="shrink-0 text-lg leading-none opacity-60 hover:opacity-100"
          >
            &times;
          </button>
        </div>
      </div>
      {undoError && <p className="mt-2 text-xs text-red-700">{undoError}</p>}
    </div>
  );
}
