'use client';

/**
 * Soft-blurred logo backdrop for /auth/* pages.
 *
 * Renders the DNK Partner logo as a fixed, full-viewport background layer
 * behind the auth card. Blurred heavily (60-80px) and dropped to ~18% opacity
 * so it reads as a color/texture wash, not a recognisable logo — establishes
 * brand presence without competing with the form chrome on top.
 *
 * Why fixed (not absolute on the page wrapper):
 *   The auth card sits inside a `flex items-center` parent that uses
 *   min-h-screen. On short viewports, the form can scroll; fixing the
 *   backdrop to the viewport keeps the wash steady behind everything,
 *   matching desktop-app feel (the chrome never moves under content).
 *
 * Mobile considerations:
 *   - Decorative — `aria-hidden`, no alt text needed.
 *   - We load eager-priority via next/image because the page above it is
 *     already render-blocking on the form card; pulling the backdrop in
 *     parallel doesn't hurt LCP.
 *   - On viewports < 640px we drop blur/opacity slightly — heavy blur on
 *     small low-end GPUs can stutter on scroll.
 *
 * Accessibility:
 *   - The card on top uses `bg-white` (not translucent) so form text stays
 *     fully crisp — WCAG AA contrast is unaffected by the backdrop.
 *   - Decorative only; semantic SR users get nothing.
 */

import Image from 'next/image';

export function AuthBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* Layer 1 — the logo, scaled up + blurred. We oversize via `scale-125`
          so the blur halo doesn't reveal the source rectangle edges at the
          viewport corners. */}
      <div className="absolute inset-0 scale-125">
        <Image
          src="/brand/dnk-partner-logo.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="
            object-cover
            opacity-[0.18]
            blur-3xl
            saturate-[0.9]
            sm:blur-[80px]
            sm:opacity-[0.22]
          "
        />
      </div>

      {/* Layer 2 — soft top-to-bottom white wash. Anchors visual weight toward
          the center and keeps the upper edge calm near the nav-less auth header. */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-50 via-slate-50/40 to-slate-50/80" />
    </div>
  );
}
