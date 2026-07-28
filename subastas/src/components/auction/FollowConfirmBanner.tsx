'use client';

/**
 * FollowConfirmBanner — minimal confirmation strip shown on the auction detail
 * page after a one-click "Seguir esta subasta" email link lands here via
 * GET /api/follow/confirm (Ken brief 2026-07-25).
 *
 * Driven by the `?follow=` query flag the confirm endpoint sets:
 *   ok       → newly following      (green + account name + "Mis favoritas" + "Deshacer")
 *   exists   → already following    (green + account name + "Mis favoritas" + "Deshacer")
 *   mismatch → token belongs to a   (amber — logged in as the wrong account)
 *              different account
 *   expired  → link expired         (amber, log-in-and-Seguir hint)
 *   gone     → auction not found    (amber)
 *   error    → transient failure    (amber, retry hint)
 *
 * Option B (Dennis 2026-07-28): the confirm route now requires a login, so a
 * successful follow is always tied to a proven account. We surface that account
 * here ("como <email>") plus a link to /favoritos so the user KNOWS it worked.
 *
 * "Deshacer" (Undo) calls the existing authenticated DELETE /api/favorites.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

type FollowFlag = 'ok' | 'exists' | 'mismatch' | 'expired' | 'gone' | 'error';

export function FollowConfirmBanner({
  flag,
  auctionId,
}: {
  flag: string | undefined;
  auctionId: string;
}) {
  const { data: session } = useSession();
  const accountLabel = session?.user?.name || session?.user?.email || null;

  const initial: FollowFlag | null =
    flag === 'ok' ||
    flag === 'exists' ||
    flag === 'mismatch' ||
    flag === 'expired' ||
    flag === 'gone' ||
    flag === 'error'
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
  else if (isFollowing)
    message = accountLabel
      ? `Ya sigues esta subasta ✓ como ${accountLabel}. Te avisaremos de novedades.`
      : 'Ya sigues esta subasta ✓ · Te avisaremos de novedades.';
  else if (state === 'mismatch')
    message = 'Este enlace de seguimiento pertenece a otra cuenta. Cierra sesión e inicia sesión con la cuenta correcta para seguir esta subasta.';
  else if (state === 'expired') message = 'El enlace para seguir ha expirado. Inicia sesión y pulsa «Seguir» para seguir esta subasta.';
  else if (state === 'gone') message = 'Esta subasta ya no está disponible.';
  else message = 'No pudimos completar el seguimiento. Prueba con el botón «Seguir».';

  return (
    <div role="status" className={`mb-4 rounded-lg border px-4 py-3 text-sm ${wrap}`}>
      <div className="flex items-center justify-between gap-3">
        <span>{message}</span>
        <div className="flex items-center gap-3">
          {isFollowing && (
            <Link
              href="/favoritos"
              className="shrink-0 rounded-md border border-emerald-300 bg-white px-3 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
            >
              Mis favoritas
            </Link>
          )}
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
