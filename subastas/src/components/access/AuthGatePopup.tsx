'use client';

/**
 * AuthGatePopup — a floating register / log-in modal shown when a
 * logged-out viewer clicks an auction CARD on the landing carousels.
 *
 * Why this exists (Pixel, 2026-06-07, Dennis brief contrast-popup-c5):
 *  - The home page carousels (`ForexCarousel` "Últimos inmuebles" /
 *    "Últimos vehículos") are a teaser surface — image + quick info only.
 *  - Auction DETAIL is behind the same access gate as the rest of the site
 *    (the `/subastas/subasta/{slug}` page renders the public teaser SSR
 *    above `FullInfoWall`, which gates the full expediente).
 *  - Sending logged-out users straight to the detail page works for SEO
 *    but adds an extra hop on the conversion path: the user lands on a
 *    page mostly hidden behind a wall before deciding to register.
 *  - Surfacing the gate at click-time turns the carousel into a softer
 *    funnel: the user has already shown intent (clicked a specific card),
 *    we ask them to register/sign-in WITH `next=` set to that auction's
 *    detail URL so they bounce straight back after auth.
 *
 * Logged-IN viewers never see this — `HomeCarouselSection` checks
 * `useAccess().state` and bypasses the popup, letting cards navigate
 * directly to `/subastas/subasta/{slug}` (which is the route this popup
 * itself points the registered user back to).
 *
 * Styling discipline:
 *  - Reuses the brand auth pattern from `FullInfoWall`:
 *      • lock icon on action-soft chip
 *      • action-green primary CTA (white text on saturated mint — AA-pass)
 *      • ghost "Ya tengo cuenta" secondary
 *  - No white text on light-green surfaces. The lock chip uses dark ink
 *    on the soft tint (`--color-action-soft`), CTA uses white on solid
 *    `--color-action`. Both pass WCAG-AA.
 *  - Card teaser visuals stay visible behind the dimmed overlay so the
 *    user remembers WHAT they were about to look at.
 */

import * as React from 'react';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

export interface AuthGatePopupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Where to bounce the user after a successful register / log-in. We pass
   * this as `?next=…` to `/register` and `/login` so the auth flow lands
   * them right back on the auction they clicked.
   */
  nextHref: string;
  /** Optional headline copy override. Defaults to the carousel-teaser line. */
  headline?: string;
}

export function AuthGatePopup({
  open,
  onOpenChange,
  nextHref,
  headline,
}: AuthGatePopupProps) {
  // Set BOTH `next` + `callbackUrl` for belt-and-braces compatibility.
  //   - `next=` matches the existing site convention (FullInfoWall, the
  //     /admin redirect chain).
  //   - `callbackUrl=` is the param `next-auth/react` `signIn(...)` consumes
  //     when the post-auth bounce is taken via NextAuth itself (same pattern
  //     as CrearAlertaCTA).
  // The login/register pages don't all parse `next` today (Pixel 2026-06-07
  // — see /app/login + /app/register). Wiring both means this modal stays
  // correct the moment either side is plumbed in.
  const next = encodeURIComponent(nextHref);
  const registerHref = `/register?next=${next}&callbackUrl=${next}`;
  const loginHref = `/login?next=${next}&callbackUrl=${next}`;

  const title = headline ?? 'Crea tu cuenta gratis para ver los detalles';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        // bg-white (not the token alias) guarantees an opaque surface across
        // Tailwind 4 @theme-inline resolutions. We can't rely on the shadcn
        // primitive's default `bg-background` (#FBFCFD, the page frame) —
        // it's a *near*-white and reads as translucent over the dimmed
        // overlay in some browsers.
        className="sm:max-w-[440px] bg-white border border-[var(--color-hairline)] rounded-2xl p-0 overflow-hidden shadow-[var(--shadow-lift)]"
      >
        <div className="px-6 pt-7 pb-6 md:px-8 md:pt-8 md:pb-7 text-center">
          {/* Lock chip — dark ink on action-soft (pale mint), passes AA. */}
          <div
            className="mx-auto mb-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-action-soft)]"
            aria-hidden="true"
          >
            <Lock className="h-5 w-5 text-[var(--color-action)]" />
          </div>

          <DialogTitle className="font-serif text-xl md:text-2xl text-[var(--color-ink-primary)] leading-tight">
            {title}
          </DialogTitle>

          <DialogDescription className="mx-auto mt-2.5 max-w-[360px] text-sm leading-relaxed text-[var(--color-ink-secondary)]">
            Regístrate gratis para ver dirección exacta, documentos, edicto y
            crear alertas. Sin tarjeta.
          </DialogDescription>

          <div className="mt-6 flex flex-col gap-2.5">
            {/* The bracket-shortcut syntax `bg-[var(--color-action)]` emits
                invalid CSS in Tailwind 4 (`background-color:--color-action`),
                which fails silently and renders the button transparent. The
                `bg-[var(--…)]` form wraps the var() call and works. We use
                the longhand form throughout this file. */}
            <Link
              href={registerHref}
              className="inline-flex items-center justify-center rounded-md bg-[var(--color-action)] px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[var(--color-action-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-action)]/40 focus-visible:ring-offset-2 transition-colors"
              aria-label="Crear una cuenta gratuita"
            >
              Regístrate gratis
            </Link>
            <Link
              href={loginHref}
              className="inline-flex items-center justify-center rounded-md border border-[var(--color-hairline)] bg-white px-5 py-2.5 text-sm font-medium text-[var(--color-ink-primary)] hover:bg-[var(--color-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-action)]/30 transition-colors"
            >
              Iniciar sesión
            </Link>
          </div>

          <p className="mt-5 text-[11px] text-[var(--color-ink-tertiary)]">
            Buscar y navegar el catálogo es siempre gratis. La cuenta desbloquea
            el detalle completo de cada subasta.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default AuthGatePopup;
