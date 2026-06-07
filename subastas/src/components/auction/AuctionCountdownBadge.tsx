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
import { cn } from "@/lib/utils";

export type AuctionCountdownBadgeProps = {
  /** ISO string, Date, or epoch ms. */
  endDate: string | Date | number | null | undefined;
  /** Resolved bid-status string from the API (e.g. "Sin pujas", "3 pujas"). */
  bidStatus?: string | null;
  /**
   * Effective (clock-wins) status string. Passed through to LiveCountdown so
   * the past-text behavior agrees with the StatusBadge alongside.
   */
  effectiveStatus?: string | null;
  /**
   * When true (default), the badge hides itself gracefully when both
   * endDate is null AND no bidStatus is available — instead of rendering
   * an empty "Fecha por confirmar" pill. Used by PLABI rows that are
   * CELEBRÁNDOSE without any end date (QC fix, Pixel 2026-06-07).
   */
  hideWhenEmpty?: boolean;
  className?: string;
};

type Tier = "calm" | "soon" | "imminent" | "past" | "missing";

function tierFor(endDate: AuctionCountdownBadgeProps["endDate"]): Tier {
  if (!endDate) return "missing";
  const ms =
    endDate instanceof Date
      ? endDate.getTime()
      : typeof endDate === "number"
        ? endDate
        : new Date(endDate).getTime();
  if (!Number.isFinite(ms)) return "missing";
  const delta = ms - Date.now();
  if (delta <= 0) return "past";
  if (delta < 60 * 60 * 1000) return "imminent";
  if (delta < 24 * 60 * 60 * 1000) return "soon";
  return "calm";
}

export function AuctionCountdownBadge({
  endDate,
  bidStatus,
  effectiveStatus,
  hideWhenEmpty = true,
  className,
}: AuctionCountdownBadgeProps) {
  // Re-tier every minute so the surface escalates on its own. Cheaper than
  // mirroring LiveCountdown's per-second loop — the tier only changes a few
  // times per auction lifetime.
  const [tier, setTier] = React.useState<Tier>(() => tierFor(endDate));
  React.useEffect(() => {
    setTier(tierFor(endDate));
    const id = window.setInterval(() => setTier(tierFor(endDate)), 60 * 1000);
    return () => window.clearInterval(id);
  }, [endDate]);

  // QC fix (Pixel 2026-06-07): PLABI rows are CELEBRÁNDOSE with NO end date.
  // We previously rendered an empty "Tiempo restante / Fecha por confirmar"
  // pill that read as broken. Hide gracefully when there's no end date AND
  // no bid status to anchor the row. The status badge above already conveys
  // "Celebrándose" — the countdown row is purely additive urgency.
  if (hideWhenEmpty && tier === "missing" && !bidStatus) return null;

  const isPast = tier === "past";
  const tone =
    tier === "imminent"
      ? "border-red-300 bg-red-50 text-red-900"
      : tier === "soon"
        ? "border-amber-300 bg-amber-50 text-amber-900"
        : isPast
          ? "border-[--color-hairline] bg-[--color-surface-muted] text-[--color-ink-tertiary]"
          : tier === "missing"
            ? "border-[--color-hairline] bg-[--color-surface-muted] text-[--color-ink-tertiary]"
            : // calm — the winter-green default
              "border-[--color-brand]/20 bg-[--color-brand]/5 text-[--color-ink-primary]";

  const label = isPast
    ? "Finalizada"
    : tier === "missing"
      ? "Fecha por confirmar"
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
        {!isPast && tier !== "missing" && (
          <LiveCountdown
            target={endDate ?? null}
            size="sm"
            effectiveStatus={effectiveStatus ?? null}
            className="text-sm font-semibold"
          />
        )}
      </span>
      {bidStatus && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[--color-hairline] bg-[--color-surface] px-3 py-1.5 text-xs font-medium text-[--color-ink-secondary]">
          <Gavel className="h-3 w-3" aria-hidden="true" />
          {bidStatus}
        </span>
      )}
    </div>
  );
}
