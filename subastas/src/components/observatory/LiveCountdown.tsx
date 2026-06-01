"use client";

/**
 * LiveCountdown — ticking time-remaining widget for an auction's endsAt.
 *
 * Updates once per second (cheap — pure local state, no re-fetch).
 * Tabular numerals so digits don't jiggle as they change.
 *
 * Thresholds — visual emphasis ramps up as time runs out:
 *   > 1 day      → calm, normal weight
 *   1d to 1h     → bold
 *   < 1h         → bold + gold accent
 *   passed       → "Finalizada" muted graphite
 *
 * Honors prefers-reduced-motion (no pulse).
 *
 * Used in: detail-page sticky panel, list row "termina en" column,
 *          home feed "termina en" suffix.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export type LiveCountdownProps = {
  /** ISO string, Date, or epoch ms. */
  target: string | Date | number | null | undefined;
  /** Visual size. "sm" for inline list usage, "lg" for the detail panel. */
  size?: "sm" | "lg";
  /** Optional prefix like "Termina en" or "Abre en". */
  prefix?: string;
  /** Optional callback fired the moment target time passes. */
  onElapsed?: () => void;
  /**
   * Effective (clock-wins) status of the auction. When supplied and the
   * status is non-terminal (live/upcoming/suspended-active) but `target` is
   * already in the past — i.e. stale data where the row hasn't transitioned
   * yet — the countdown renders "—" instead of "Finalizada". This preserves
   * the invariant: the badge and the time field can never contradict.
   *
   * When effective status IS terminal (concluida/finalizada/cancelada), the
   * existing "Finalizada" past-text is consistent with the badge and remains.
   * When omitted, behaviour is unchanged (legacy callers).
   */
  effectiveStatus?: string | null;
  className?: string;
};

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

type Parts = {
  totalMs: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isPast: boolean;
};

function diffParts(targetMs: number): Parts {
  const now = Date.now();
  const totalMs = targetMs - now;
  const isPast = totalMs <= 0;
  const abs = Math.abs(totalMs);
  const days = Math.floor(abs / (24 * 60 * 60 * 1000));
  const hours = Math.floor((abs / (60 * 60 * 1000)) % 24);
  const minutes = Math.floor((abs / (60 * 1000)) % 60);
  const seconds = Math.floor((abs / 1000) % 60);
  return { totalMs, days, hours, minutes, seconds, isPast };
}

// Terminal status set — kept local to avoid a circular import with status.ts.
// Mirrors the concluded/cancelled buckets in STATUS_META there.
const TERMINAL_STATUSES = new Set<string>([
  "concluida-portal",
  "finalizada-autoridad",
  "finished",
  "cancelada",
]);

export function LiveCountdown({
  target,
  size = "sm",
  prefix,
  onElapsed,
  effectiveStatus,
  className,
}: LiveCountdownProps) {
  const targetMs = React.useMemo(() => {
    if (!target) return null;
    if (target instanceof Date) return target.getTime();
    if (typeof target === "number") return target;
    const t = new Date(target).getTime();
    return Number.isFinite(t) ? t : null;
  }, [target]);

  const [parts, setParts] = React.useState<Parts | null>(() =>
    targetMs == null ? null : diffParts(targetMs),
  );

  React.useEffect(() => {
    if (targetMs == null) {
      setParts(null);
      return;
    }
    setParts(diffParts(targetMs));
    const id = window.setInterval(() => {
      const next = diffParts(targetMs);
      setParts(next);
      if (next.isPast) {
        window.clearInterval(id);
        onElapsed?.();
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [targetMs, onElapsed]);

  if (!targetMs || !parts) {
    return (
      <span
        className={cn(
          "tnum text-[--color-ink-tertiary]",
          size === "lg" ? "text-base" : "text-xs",
          className,
        )}
      >
        Sin fecha
      </span>
    );
  }

  if (parts.isPast) {
    // Invariant guard: if the caller told us the auction's effective status
    // is NON-terminal (still live / upcoming / suspended-as-active) but the
    // target timestamp is already in the past, this is stale data — the row
    // hasn't transitioned yet. Showing "Finalizada" here would contradict the
    // badge alongside it. Render a neutral em-dash instead.
    const isNonTerminalActive =
      effectiveStatus != null && !TERMINAL_STATUSES.has(effectiveStatus);
    if (isNonTerminalActive) {
      return (
        <span
          className={cn(
            "tnum text-[--color-ink-quiet]",
            size === "lg" ? "text-base" : "text-xs",
            className,
          )}
          aria-label="Fecha de cierre no disponible"
        >
          —
        </span>
      );
    }
    return (
      <span
        className={cn(
          "tnum text-[--color-status-concluded]",
          size === "lg" ? "text-base" : "text-xs",
          className,
        )}
      >
        Finalizada
      </span>
    );
  }

  const lastHour = parts.days === 0 && parts.hours === 0;
  const lastDay = parts.days === 0 && !lastHour;
  const emphasis = lastHour ? "font-semibold" : lastDay ? "font-semibold" : "font-medium";
  const colorClass = lastHour ? "text-[--color-gold]" : "text-[--color-ink-primary]";

  // Format depends on remaining time
  let body: React.ReactNode;
  if (parts.days >= 1) {
    body = (
      <>
        <span>{parts.days}d</span>{" "}
        <span>{parts.hours}h</span>{" "}
        <span>{parts.minutes}m</span>
      </>
    );
  } else if (parts.hours >= 1) {
    body = (
      <>
        <span>{parts.hours}h</span>{" "}
        <span>{pad(parts.minutes)}m</span>{" "}
        <span>{pad(parts.seconds)}s</span>
      </>
    );
  } else {
    body = (
      <>
        <span>{pad(parts.minutes)}m</span>{" "}
        <span>{pad(parts.seconds)}s</span>
      </>
    );
  }

  return (
    <span
      className={cn(
        "tnum inline-flex items-baseline gap-0.5",
        emphasis,
        colorClass,
        size === "lg" ? "text-xl md:text-2xl" : "text-xs",
        className,
      )}
      aria-live="off"
    >
      {prefix && (
        <span className="mr-1 font-normal text-[--color-ink-secondary]">{prefix}</span>
      )}
      {body}
    </span>
  );
}
