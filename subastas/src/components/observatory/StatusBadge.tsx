"use client";

/**
 * StatusBadge — the small chip that shows current auction status.
 *
 * Two sizes:
 *   - "sm" (default): used in list rows, feed rows, card thumbnails
 *   - "lg":            used on the detail page panel
 *
 * Visual rule: a 6px colored dot + label, hairline border, light tint.
 * The dot pulses only for live auctions (status === celebrandose) and
 * respects prefers-reduced-motion via the .dnk-pulse utility.
 */

import * as React from "react";
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
  const meta = getStatusMeta(status);
  const isSm = size === "sm";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium uppercase tracking-wide whitespace-nowrap",
        isSm ? "h-5 px-2 text-[10px]" : "h-7 px-3 text-xs",
        className,
      )}
      style={{
        color: meta.color,
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
  const meta = getStatusMeta(status);
  return (
    <span
      aria-label={`Estado: ${meta.label}`}
      title={meta.label}
      className={cn("inline-block rounded-full shrink-0", meta.pulse && "dnk-pulse", className)}
      style={{ backgroundColor: meta.color, width: size, height: size }}
    />
  );
}
