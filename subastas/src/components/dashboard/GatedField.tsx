'use client';

/**
 * GatedField — registration / paid-tier blur gate (Item H, 2026-06-03).
 *
 * Wraps a piece of auction intel that is NOT SEO-public — exact address,
 * full juzgado contact, edict PDF link (and optionally an "advanced"
 * paid-tier field). Renders the children plainly when the viewer qualifies;
 * renders a frosted CSS-blur tease with a small "Regístrate para ver" CTA
 * when they don't.
 *
 * Tiers (mirrors `lib/whop/plan-map.ts`):
 *   - level="register" → unlocks for ANY signed-in user (including FREE).
 *   - level="paid"     → unlocks only when `isPaid(session.user.tier)`.
 *
 * Behavior matrix:
 *   ┌──────────────────────┬──────────────┬─────────────────┐
 *   │ Viewer               │ register     │ paid            │
 *   ├──────────────────────┼──────────────┼─────────────────┤
 *   │ signed-OUT           │ blur + /reg  │ blur + /reg     │
 *   │ signed-in FREE       │ unlocked     │ blur + Upgrade  │
 *   │ signed-in PAID       │ unlocked     │ unlocked        │
 *   └──────────────────────┴──────────────┴─────────────────┘
 *
 * V1 is a Pixel-only CSS tease — the actual value is still in the DOM. The
 * intent is to spark curiosity and drive sign-ups, not to hard-hide BOE-
 * public data. Server-side projection (auth-aware redaction in the API) is
 * a known follow-up if/when product wants true withholding.
 *
 * Reuses: NextAuth `useSession()`, `isPaid()` from plan-map, and the dormant
 * `UpgradeModal` from `components/dashboard/UpgradeModal.tsx` — no parallel
 * auth or upsell logic.
 */

import React, { useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Lock } from 'lucide-react';
import { isPaid } from '@/lib/whop/plan-map';
import { UpgradeModal } from './UpgradeModal';

export type GateLevel = 'register' | 'paid';

interface GatedFieldProps {
  /**
   * Which gate to apply. `register` unlocks for any signed-in user (incl.
   * FREE). `paid` requires `isPaid(tier)` (ACCESO+).
   */
  level: GateLevel;
  /** Short human label, used in the CTA copy and aria-label fallback. */
  label?: string;
  /** The real content. Always rendered (blurred when gated). */
  children: React.ReactNode;
  /** Optional className applied to the outer wrapper. */
  className?: string;
}

/**
 * Resolve whether the viewer has access for the requested gate level.
 * Treats `loading` as "no access" (we'd rather show the tease and let it
 * unblur once session resolves than briefly leak the value to a logged-out
 * viewer on a stale render).
 */
function useGateAccess(level: GateLevel): {
  hasAccess: boolean;
  isAuthenticated: boolean;
} {
  const { data: session, status } = useSession();
  const isAuthenticated = status === 'authenticated' && !!session?.user;
  if (!isAuthenticated) return { hasAccess: false, isAuthenticated: false };
  if (level === 'register') return { hasAccess: true, isAuthenticated: true };
  // level === 'paid'
  return { hasAccess: isPaid(session?.user?.tier), isAuthenticated: true };
}

export const GatedField: React.FC<GatedFieldProps> = ({
  level,
  label,
  children,
  className,
}) => {
  const { hasAccess, isAuthenticated } = useGateAccess(level);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  if (hasAccess) {
    // Render children plainly — no wrapper noise, no extra DOM.
    return <>{children}</>;
  }

  // Gate copy.
  //   signed-OUT          → "Regístrate para ver"
  //   signed-in FREE @paid → "Mejora tu plan"
  const ctaText = isAuthenticated ? 'Mejora tu plan' : 'Regístrate para ver';
  const ariaLabel = label
    ? `${ctaText} ${label.toLowerCase()}`
    : ctaText;

  // The blur-tease block. The real value stays in the DOM (V1 = CSS tease)
  // but is non-selectable, non-focusable, and aria-hidden so AT users get
  // the gate copy instead of garbled blur.
  const blurredChild = (
    <div
      aria-hidden="true"
      className="select-none pointer-events-none [filter:blur(6px)] [-webkit-filter:blur(6px)] opacity-90 motion-reduce:[filter:blur(4px)]"
    >
      {children}
    </div>
  );

  // Frosted overlay + CTA. CTA routes:
  //   signed-OUT → /register (NextAuth signin path)
  //   signed-in FREE on a paid field → open existing UpgradeModal
  const overlay = isAuthenticated ? (
    <button
      type="button"
      onClick={() => setUpgradeOpen(true)}
      aria-label={ariaLabel}
      className="absolute inset-0 z-10 flex items-center justify-center cursor-pointer
                 bg-white/40 backdrop-blur-[2px]
                 hover:bg-white/55 focus-visible:bg-white/55
                 transition-colors
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/60
                 rounded-md"
    >
      <span className="inline-flex items-center gap-1.5 rounded-full
                       bg-[var(--color-surface)] border border-[var(--color-hairline)]
                       px-3 py-1 text-xs font-medium text-[var(--color-ink-primary)]
                       shadow-[var(--shadow-lift,0_1px_2px_rgba(0,0,0,0.06))]">
        <Lock className="h-3 w-3 text-[var(--color-ink-tertiary)]" aria-hidden="true" />
        {ctaText}
      </span>
    </button>
  ) : (
    <Link
      href="/register"
      aria-label={ariaLabel}
      className="absolute inset-0 z-10 flex items-center justify-center cursor-pointer
                 bg-white/40 backdrop-blur-[2px]
                 hover:bg-white/55 focus-visible:bg-white/55
                 transition-colors
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/60
                 rounded-md"
    >
      <span className="inline-flex items-center gap-1.5 rounded-full
                       bg-[var(--color-surface)] border border-[var(--color-hairline)]
                       px-3 py-1 text-xs font-medium text-[var(--color-ink-primary)]
                       shadow-[var(--shadow-lift,0_1px_2px_rgba(0,0,0,0.06))]">
        <Lock className="h-3 w-3 text-[var(--color-ink-tertiary)]" aria-hidden="true" />
        {ctaText}
      </span>
    </Link>
  );

  return (
    <>
      <div
        className={
          'relative inline-block w-full overflow-hidden rounded-md' +
          (className ? ' ' + className : '')
        }
      >
        {blurredChild}
        {overlay}
      </div>
      {isAuthenticated && (
        <UpgradeModal open={upgradeOpen} onOpenChange={setUpgradeOpen} />
      )}
    </>
  );
};

export default GatedField;
