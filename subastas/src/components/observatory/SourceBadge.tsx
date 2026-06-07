"use client";

/**
 * SourceBadge — small pill identifying which DATA SOURCE an auction row came
 * from (BOE / Seguridad Social / future ayuntamiento sources).
 *
 * Distinct from AuctionTypeBadge:
 *   - AuctionTypeBadge → the BOE "Tipo de Subasta" family (Judicial /
 *     Notarial / Hacienda / Otras tributarias / Administrativas) — i.e. WHAT
 *     KIND of auction it is.
 *   - SourceBadge       → the SCRAPER ORIGIN — i.e. WHICH PORTAL we pulled
 *     it from. A BOE-portal row could be Judicial OR Notarial; a Seguridad
 *     Social row sits in its own bucket.
 *
 * Visual rules — consistent with the modern-register redesign:
 *   - all-black text (never colored)
 *   - subtle tinted soft background per source for at-a-glance recognition
 *   - 1-px hairline border, no shadow, no gradient
 *
 * `size="xs"` is the default; `size="sm"` matches StatusBadge/AuctionTypeBadge
 * when used in the card badge row.
 */

import * as React from "react";
import { getSourceLabel } from "@/lib/source-labels";
import { cn } from "@/lib/utils";

type Size = "xs" | "sm";

/**
 * Background tints — derived from the design-token palette. Each tint pairs
 * with the same all-black text per the project rule.
 */
const SOURCE_TINT: Record<string, string> = {
  BOE: "bg-[--color-info-soft] border-[--color-brand-soft]/30",
  TEJU: "bg-[--color-info-soft] border-[--color-brand-soft]/30",
  SEGSOCIAL: "bg-[--color-action-soft] border-[--color-action]/30",
};

export type SourceBadgeProps = {
  source?: string | null;
  size?: Size;
  className?: string;
};

export function SourceBadge({ source, size = "xs", className }: SourceBadgeProps) {
  const label = getSourceLabel(source);
  if (!label) return null;
  const upper = source ? source.trim().toUpperCase() : "";
  const tint = SOURCE_TINT[upper] ?? "bg-[--color-surface-muted] border-[--color-hairline]";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-medium text-[--color-ink-primary] whitespace-nowrap",
        tint,
        size === "xs" ? "px-2 py-0.5 text-[10px] tracking-wide" : "px-2.5 py-0.5 text-[11px]",
        className,
      )}
      aria-label={`Fuente: ${label}`}
      title={label}
    >
      {label}
    </span>
  );
}
