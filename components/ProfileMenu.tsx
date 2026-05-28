'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';

/**
 * ProfileMenu — avatar-circle trigger + minimal dropdown.
 *
 * Phase 1 surface:
 *   - Avatar circle showing the email's first initial.
 *   - Dropdown card: email (informational) + Sign out.
 *
 * Stripped from the ComputerCaller original (2026-05-28):
 *   - Subscription / Whop billing surfaces (no billing in Phase 1).
 *   - Phone Mode / popup window controls (no phone product here).
 *   - Days-left trial chip + progress bar.
 *   - usePhone disconnect side-effects.
 *
 * Open/close behaviour:
 *   - Click avatar to toggle.
 *   - Click outside the dropdown card OR press Escape to close.
 *   - Clicking Sign out posts /api/auth/logout then routes to / (landing).
 */

interface MeResponse {
  user: {
    id: string;
    email: string;
  } | null;
}

function emailToInitial(email: string | null | undefined): string {
  if (!email) return '?';
  const first = email.trim().charAt(0).toUpperCase();
  return first || '?';
}

export const ProfileMenu = () => {
  const router = useRouter();
  const [user, setUser] = useState<MeResponse['user']>(null);
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Hydrate from /api/auth/me on mount. Silently swallow errors — if the user
  // isn't authenticated, the menu renders nothing (header layout treats this
  // slot as optional).
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/auth/me', { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: MeResponse | null) => setUser(d?.user ?? null))
      .catch(() => { /* unauth or offline — keep null */ });
    return () => controller.abort();
  }, []);

  // Outside-click + Escape handlers. Bind only while the menu is open.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (cardRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;

  const email = user.email;
  const initial = emailToInitial(email);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Best-effort — even if it fails, the user wants to leave; route them
      // to / regardless. The cookie will expire and middleware gates the rest.
    }
    setOpen(false);
    setSigningOut(false);
    router.push('/');
  };

  return (
    <div className="flex items-center relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className={clsx(
          'w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold',
          'bg-gradient-to-br from-slate-700 to-slate-900 text-white shadow-sm',
          'hover:shadow-md transition-shadow',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/60 focus-visible:ring-offset-2'
        )}
      >
        {initial}
      </button>

      {open && (
        <div
          ref={cardRef}
          role="menu"
          aria-label="Account menu"
          className={clsx(
            'absolute top-full right-0 mt-2 w-64 bg-white rounded-xl border border-slate-200',
            'shadow-xl shadow-slate-900/10 overflow-hidden z-50'
          )}
        >
          <div className="px-4 py-3 flex items-center gap-3 border-b border-slate-100 bg-slate-50/60">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
              {initial}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-800 truncate" title={email}>
                {email}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">Signed in</p>
            </div>
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            disabled={signingOut}
            className={clsx(
              'w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-700',
              'hover:bg-red-50 transition-colors',
              'focus:outline-none focus:bg-red-50',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {signingOut ? (
              <Loader2 className="w-4 h-4 text-red-500 motion-safe:animate-spin" aria-hidden="true" />
            ) : (
              <LogOut className="w-4 h-4 text-red-500" aria-hidden="true" />
            )}
            <span className="flex-1 text-left">
              {signingOut ? 'Signing out…' : 'Sign out'}
            </span>
          </button>
        </div>
      )}
    </div>
  );
};
