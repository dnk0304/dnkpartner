"use client";

/**
 * AuctionTypeBadge — small pill identifying which BOE family an auction
 * belongs to (Judicial / Notarial / Hacienda / Otras tributarias /
 * Administrativas). Surfaced on every card + list row so the list is
 * scannable by type.
 *
 * Visual rules — consistent with the modern-register redesign:
 *   - all-black text (never colored)
 *   - subtle tinted soft background per family for at-a-glance recognition
 *   - 1-px hairline border, no shadow, no gradient
 *   - tabular nums OFF (text only — no number)
 *
 * `size="xs"` is the default; `size="sm"` is for the hero overlay where the
 * badge sits next to StatusBadge.
 */

import * as React from "react";
import { AuctionType } from "@/types";
import { AUCTION_TYPE_LABEL } from "./filters";
import { cn } from "@/lib/utils";

type Size = "xs" | "sm";

/**
 * Background tints — derived from the design-token palette so a future theme
 * swap propagates. Each tint pairs with the same all-black text per the
 * project rule (never colored text on badges).
 */
const TYPE_TINT: Record<string, string> = {
  judicial:          "bg-[--color-info-soft] border-[--color-brand-soft]/30",
  aeat:              "bg-[--color-warn-soft] border-[--color-warn]/30",
  otras_tributarias: "bg-[--color-warn-soft] border-[--color-warn]/30",
  notarial:          "bg-[--color-action-soft] border-[--color-action]/30",
  administrativas:   "bg-[--color-surface-muted] border-[--color-hairline]",
  bancaria:          "bg-[--color-surface-muted] border-[--color-hairline]",
  // Legacy singular ids — same tint as their canonical plural so any stale
  // payload still renders consistently.
  tributaria:        "bg-[--color-warn-soft] border-[--color-warn]/30",
  administrativa:    "bg-[--color-surface-muted] border-[--color-hairline]",
};

export type AuctionTypeBadgeProps = {
  type?: AuctionType | string | null;
  size?: Size;
  /** Force the short label even on `size="sm"`. */
  short?: boolean;
  className?: string;
};

export function AuctionTypeBadge({
  type,
  size = "xs",
  short,
  className,
}: AuctionTypeBadgeProps) {
  if (!type) return null;
  const meta = AUCTION_TYPE_LABEL[type as string];
  if (!meta) return null;

  const label = short || size === "xs" ? meta.shortLabel : meta.label;
  const tint = TYPE_TINT[type as string] ?? "bg-[--color-surface-muted] border-[--color-hairline]";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-medium text-[--color-ink-primary] whitespace-nowrap",
        tint,
        size === "xs" ? "px-2 py-0.5 text-[10px] tracking-wide" : "px-2.5 py-0.5 text-[11px]",
        className,
      )}
      aria-label={`Tipo de subasta: ${meta.label}`}
      title={meta.label}
    >
      {label}
    </span>
  );
}
