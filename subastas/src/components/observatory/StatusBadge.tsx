"use client";

/**
 * StatusBadge — the SINGLE status chip for an auction.
 *
 * REDESIGN #3 RULES (locked):
 *   - One auction = exactly ONE status badge. Never render two state
 *     chips on the same card. Use a typographic meta line for history
 *     ("Finalizada el 28/05/2026") instead of a second pill.
 *   - Black ink (--color-ink-primary) always; soft-tint fill; status-colour
 *     dot + 35% border. Never white-on-saturated.
 *   - Status value is the single source of truth from getStatusMeta().
 *
 * Two sizes: "sm" (default, card overlays/list rows), "lg" (detail page).
 * The dot pulses only for "Celebrándose" and respects prefers-reduced-motion.
 */

import * as React from "react";
import { useLocale } from "next-intl";
import { AuctionStatus } from "@/types";
import { getStatusMeta } from "./status";
import { cn } from "@/lib/utils";

export type StatusBadgeProps = {
  status: AuctionStatus | string | null | undefined;
  size?: "sm" | "lg";
  className?: string;
  /** Hide the dot (label-only). Rare — use only when the chip's color is already context-enough. */
  hideDot?: boolean;
};

export function StatusBadge({ status, size = "sm", className, hideDot = false }: StatusBadgeProps) {
  const locale = useLocale() as "es" | "en";
  const meta = getStatusMeta(status, locale);
  const isSm = size === "sm";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-semibold uppercase tracking-wide whitespace-nowrap",
        "text-[var(--color-ink-primary)]",
        isSm ? "h-5 px-2 text-[10px]" : "h-7 px-3 text-xs",
        className,
      )}
      style={{
        backgroundColor: meta.tint,
        borderColor: meta.border,
      }}
      aria-label={`Estado: ${meta.label}`}
    >
      {!hideDot && (
        <span
          aria-hidden="true"
          className={cn("inline-block rounded-full", isSm ? "h-1.5 w-1.5" : "h-2 w-2", meta.pulse && "dnk-pulse")}
          style={{ backgroundColor: meta.color }}
        />
      )}
      <span>{meta.label}</span>
    </span>
  );
}

/**
 * StatusDot — bare colored dot, no label. Used as a pre-text glyph
 * in tabular list rows where label space is scarce.
 */
export function StatusDot({
  status,
  className,
  size = 8,
}: {
  status: AuctionStatus | string | null | undefined;
  className?: string;
  size?: number;
}) {
  const locale = useLocale() as "es" | "en";
  const meta = getStatusMeta(status, locale);
  return (
    <span
      aria-label={`Estado: ${meta.label}`}
      title={meta.label}
      className={cn("inline-block rounded-full shrink-0", meta.pulse && "dnk-pulse", className)}
      style={{ backgroundColor: meta.color, width: size, height: size }}
    />
  );
}
