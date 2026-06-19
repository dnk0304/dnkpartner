/**
 * WarnFlag — single inline importance/warning chip.
 *
 * Distinct from <StatusBadge/>. StatusBadge communicates lifecycle state
 * (one per auction). WarnFlag communicates FACTS about the auction
 * (deadlines, deposit, source attribution). Multiple per card allowed,
 * capped at 3 by the parent <WarnFlagRow/>.
 *
 * Anatomy: black ink on soft-tint fill, hairline border in the
 * saturated colour. Optional leading icon (single char or short symbol).
 *
 * Levels:
 *   critical  — termina hoy, cierre <24h, cancelada, sin tasación
 *   attention — cierre 24–72h, suspendida, depósito alto
 *   info      — nueva puja, reanudada, lote modificado
 *   positive  — abierta a pujas, BOE oficial enlazado
 *   neutral   — honest "unknown" facts (occupancy "No consta"): grey, not a
 *               coloured signal. Reuses the project's muted surface + hairline
 *               so the chip reads as disclosed-but-unknown, never as a
 *               positive/negative buyer cue.
 */

import React from "react";
import { cn } from "@/lib/utils";

export type WarnLevel = "critical" | "attention" | "info" | "positive" | "neutral";

interface WarnFlagProps {
  level: WarnLevel;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

const LEVEL_TOKENS: Record<
  WarnLevel,
  { bg: string; border: string }
> = {
  critical: {
    bg: "bg-[var(--color-warn-critical-soft)]",
    border: "border-[var(--color-warn-critical)]/40",
  },
  attention: {
    bg: "bg-[var(--color-warn-attention-soft)]",
    border: "border-[var(--color-warn-attention)]/40",
  },
  info: {
    bg: "bg-[var(--color-warn-info-soft)]",
    border: "border-[var(--color-warn-info)]/40",
  },
  positive: {
    bg: "bg-[var(--color-warn-positive-soft)]",
    border: "border-[var(--color-warn-positive)]/40",
  },
  neutral: {
    bg: "bg-[var(--color-surface-muted)]",
    border: "border-[var(--color-hairline)]",
  },
};

export function WarnFlag({ level, icon, children, className }: WarnFlagProps) {
  const tokens = LEVEL_TOKENS[level];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5",
        "text-[11px] font-semibold leading-[1.4]",
        "text-[var(--color-ink-primary)]",
        tokens.bg,
        tokens.border,
        className
      )}
    >
      {icon ? <span aria-hidden className="text-[10px]">{icon}</span> : null}
      <span>{children}</span>
    </span>
  );
}

interface WarnFlagRowProps {
  flags: Array<{ level: WarnLevel; icon?: React.ReactNode; label: React.ReactNode }>;
  /** Order: critical first, then attention, then info, then positive. Caps at 3. */
  max?: number;
  className?: string;
}

/**
 * WarnFlagRow — orders flags by severity and caps at max (default 3).
 * Critical always wins position 1.
 */
export function WarnFlagRow({ flags, max = 3, className }: WarnFlagRowProps) {
  const order: WarnLevel[] = ["critical", "attention", "info", "positive", "neutral"];
  const sorted = [...flags].sort(
    (a, b) => order.indexOf(a.level) - order.indexOf(b.level)
  );
  const visible = sorted.slice(0, max);
  if (visible.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {visible.map((f, i) => (
        <WarnFlag key={i} level={f.level} icon={f.icon}>
          {f.label}
        </WarnFlag>
      ))}
    </div>
  );
}

/**
 * Returns the className to put a solid left-edge bar on a card when
 * the card carries a critical (or attention) warning. The bar replaces
 * the AI-template "glow"/"shadow" pattern with a scannable register cue.
 */
export function warnBarClass(level: WarnLevel | null): string {
  if (level === "critical") return "warn-bar-critical";
  if (level === "attention") return "warn-bar-attention";
  return "";
}
