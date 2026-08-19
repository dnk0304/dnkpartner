"use client";

/**
 * AuctionCountdownBadge — urgency row near the title.
 *
 * Composes:
 *   - The existing LiveCountdown (ticks every second, respects reduced motion,
 *     handles past/missing endDate gracefully) wrapped in an urgency pill.
 *   - A bid-status chip from the server-projected `bidStatus` string
 *     ("Sin pujas" / "{N} pujas"). When null we render nothing — never
 *     "null pujas" or a fake "0 pujas".
 *
 * The visual contract: this is THE urgency block. We escalate styling as
 * time runs out, mirroring LiveCountdown's own threshold logic for the
 * background tint:
 *   > 1 day      → calm winter-green tint
 *   < 1 day      → amber tint
 *   < 1 hour     → red tint (the only red on the page)
 *   past         → muted graphite (renders as "Finalizada")
 *   missing      → muted, "Sin fecha"
 *
 * a11y: aria-live="polite" so screen readers announce the time once per
 * meaningful threshold (LiveCountdown's interior is aria-live="off" — this
 * outer wrapper carries the polite announcement).
 */

import * as React from "react";
import { Clock, Gavel } from "lucide-react";
import { LiveCountdown } from "@/components/observatory/LiveCountdown";
import { isUpcoming } from "@/components/observatory/status";
import { cn } from "@/lib/utils";

export type AuctionCountdownBadgeProps = {
  /** ISO string, Date, or epoch ms. The END of the auction window. */
  endDate: string | Date | number | null | undefined;
  /**
   * ISO string, Date, or epoch ms — the OPENING moment (opensAt / startedAt).
   * For an UPCOMING (próxima apertura) row the countdown targets this, not
   * `endDate`: the pill must read "Abre en 58d…", never "Termina en 58d…".
   * Null-safe; when absent on an upcoming row the pill hides gracefully.
   * Ignored for live/terminal rows (they count down to `endDate`).
   */
  opensAt?: string | Date | number | null;
  /** Resolved bid-status string from the API (e.g. "Sin pujas", "3 pujas"). */
  bidStatus?: string | null;
  /**
   * Effective (clock-wins) status string. Drives BOTH the label/target
   * (upcoming → "Abre en"/opensAt; live → "Termina en"/endDate) — reusing the
   * SAME status predicates the sidebar (DetailStatusPanel) uses, so the two
   * never disagree — and LiveCountdown's past-text behavior.
   */
  effectiveStatus?: string | null;
  /**
   * When true (default), the badge hides itself gracefully when both
   * endDate is null AND no bidStatus is available — instead of rendering
   * an empty "Fecha por confirmar" pill. Used by PLABI rows that are
   * CELEBRÁNDOSE without any end date (QC fix, Pixel 2026-06-07).
   */
  hideWhenEmpty?: boolean;
  /**
   * The single authoritative "now" for the initial render, in epoch ms,
   * sampled ONCE by the owning server component and threaded down.
   *
   * HYDRATION CONTRACT (React #418): the tier below is seeded in a lazy
   * `useState` initializer, which runs on BOTH the server render and the
   * first client render. If that initializer read the ambient clock, an
   * auction sitting near a tier boundary (0 / 1h / 24h) would tier
   * differently in the two renders and React would report a hydration
   * mismatch. One clock, one value, both renders.
   *
   * Deliberately REQUIRED with no default — a defaulted `Date.now()` is
   * exactly the foot-gun that reintroduces this bug silently.
   */
  nowMs: number;
  className?: string;
};

type Tier = "calm" | "soon" | "imminent" | "past" | "missing";

/**
 * Pure: `nowMs` is a required parameter on purpose. Do NOT give it a
 * `= Date.now()` default — see the `nowMs` prop doc above.
 */
function tierFor(endDate: AuctionCountdownBadgeProps["endDate"], nowMs: number): Tier {
  if (!endDate) return "missing";
  const ms =
    endDate instanceof Date
      ? endDate.getTime()
      : typeof endDate === "number"
        ? endDate
        : new Date(endDate).getTime();
  if (!Number.isFinite(ms)) return "missing";
  const delta = ms - nowMs;
  if (delta <= 0) return "past";
  if (delta < 60 * 60 * 1000) return "imminent";
  if (delta < 24 * 60 * 60 * 1000) return "soon";
  return "calm";
}

export function AuctionCountdownBadge({
  endDate,
  opensAt,
  bidStatus,
  effectiveStatus,
  hideWhenEmpty = true,
  nowMs,
  className,
}: AuctionCountdownBadgeProps) {
  // Status-aware countdown target — the fix for the "TERMINA EN" mislabel on
  // próxima-apertura rows. An UPCOMING auction counts down to its OPENING
  // (opensAt); everything else counts down to its END (endDate). This mirrors
  // DetailStatusPanel's sidebar logic exactly (live → endsAt, upcoming →
  // startedAt) via the shared `isUpcoming` predicate — one classification,
  // never a forked second mapping.
  const upcoming = isUpcoming(effectiveStatus);
  const countdownTarget = upcoming ? (opensAt ?? null) : endDate;

  // Seeded from the SERVER-sampled clock so SSR and the first client render
  // agree (React #418). The effect below re-syncs to the real client clock
  // immediately after hydration.
  const [tier, setTier] = React.useState<Tier>(() => tierFor(countdownTarget, nowMs));
  // Re-tier every minute so the surface escalates on its own. Cheaper than
  // mirroring LiveCountdown's per-second loop — the tier only changes a few
  // times per auction lifetime. `Date.now()` is CORRECT here: effects are
  // client-only and run after hydration has already committed.
  React.useEffect(() => {
    setTier(tierFor(countdownTarget, Date.now()));
    const id = window.setInterval(
      () => setTier(tierFor(countdownTarget, Date.now())),
      60 * 1000,
    );
    return () => window.clearInterval(id);
  }, [countdownTarget]);

  // QC fix (Pixel 2026-06-07): PLABI rows are CELEBRÁNDOSE with NO end date.
  // We previously rendered an empty "Tiempo restante / Fecha por confirmar"
  // pill that read as broken. Hide gracefully when there's no end date AND
  // no bid status to anchor the row. The status badge above already conveys
  // "Celebrándose" — the countdown row is purely additive urgency.
  if (hideWhenEmpty && tier === "missing" && !bidStatus) return null;

  const isPast = tier === "past";
  // The urgency escalation (amber → red) is END-of-auction semantics — "time
  // is running out to bid". An OPENING countdown is anticipatory, not urgent,
  // so an upcoming row always wears the calm winter-green tint regardless of
  // how close the opening is. (Past/missing still degrade to muted below.)
  const tone =
    upcoming && !isPast && tier !== "missing"
      ? "border-[var(--color-brand)]/20 bg-[var(--color-brand)]/5 text-[var(--color-ink-primary)]"
      : tier === "imminent"
        ? "border-red-300 bg-red-50 text-red-900"
        : tier === "soon"
          ? "border-amber-300 bg-amber-50 text-amber-900"
          : isPast
            ? "border-[var(--color-hairline)] bg-[var(--color-surface-muted)] text-[var(--color-ink-tertiary)]"
            : tier === "missing"
              ? "border-[var(--color-hairline)] bg-[var(--color-surface-muted)] text-[var(--color-ink-tertiary)]"
              : // calm — the winter-green default
                "border-[var(--color-brand)]/20 bg-[var(--color-brand)]/5 text-[var(--color-ink-primary)]";

  const label =
    tier === "missing"
      ? "Fecha por confirmar"
      : upcoming
        ? // Próxima apertura — count down to the OPENING, not the end.
          "Abre en"
        : isPast
          ? "Finalizada"
          : "Termina en";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2",
        className,
      )}
      aria-live="polite"
    >
      <span
        className={cn(
          "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium",
          tone,
        )}
      >
        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
          {label}
        </span>
        {(upcoming || !isPast) && tier !== "missing" && (
          <LiveCountdown
            target={countdownTarget ?? null}
            size="sm"
            effectiveStatus={effectiveStatus ?? null}
            nowMs={nowMs}
            className="text-sm font-semibold"
          />
        )}
      </span>
      {bidStatus && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-hairline)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-ink-secondary)]">
          <Gavel className="h-3 w-3" aria-hidden="true" />
          {bidStatus}
        </span>
      )}
    </div>
  );
}
