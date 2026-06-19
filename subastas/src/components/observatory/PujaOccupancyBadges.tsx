/**
 * PujaBadge + OccupancyBadge — #16 / #17 card chips.
 *
 * Renders the BOE "Pujas" + "Situación posesoria" signals on auction cards.
 * Both badges are **null-safe**: when the upstream field is null (unscraped /
 * unknown), the component returns `null` — never an empty pill, never a
 * misleading "Sin puja" / "No consta" placeholder.
 *
 * Visual language reuses <WarnFlag/> so the pujas/occupancy chips share the
 * existing badge system (all-black text, soft-tint fill, hairline border).
 * Spanish labels per the brief.
 *
 * Level mapping rationale (decision-signal, not severity alarm):
 *   #16 pujas:
 *     CON_PUJA  → info     (bid activity is positive market signal)
 *     SIN_PUJA  → positive (still open to a first bid — buyer opportunity)
 *   #17 occupancy:
 *     OCUPADO     → attention (real risk — bidder must factor possession)
 *     NO_OCUPADO  → positive  (clean, ready-to-take possession)
 *     NO_CONSTA   → neutral   (grey — honest "unknown", not a buyer signal.
 *                              Dennis-approved 2026-06-19: a blue/info tint
 *                              read as a positive cue; grey is more honest.)
 */

import * as React from "react";
import { WarnFlag } from "./WarnFlag";
import { formatPrice } from "./format";
import { cn } from "@/lib/utils";

export type PujaStatus = "CON_PUJA" | "SIN_PUJA" | string;
export type Occupancy = "OCUPADO" | "NO_OCUPADO" | "NO_CONSTA" | string;

interface PujaBadgeProps {
  status: PujaStatus | null | undefined;
  /**
   * Highest bid in EUROS (already converted from the BIGINT cents the DB
   * stores). Optional — most CON_PUJA rows have null amount because BOE
   * hides the figure behind login.
   */
  amountEuros?: number | null;
  className?: string;
}

/**
 * Inline puja indicator. Returns null when status is null/unknown so the
 * card layout doesn't render an empty chip.
 */
export function PujaBadge({ status, amountEuros, className }: PujaBadgeProps) {
  if (status !== "CON_PUJA" && status !== "SIN_PUJA") return null;

  const hasAmount =
    status === "CON_PUJA" &&
    amountEuros != null &&
    Number.isFinite(amountEuros) &&
    amountEuros > 0;

  if (status === "CON_PUJA") {
    return (
      <WarnFlag level="info" className={cn("cursor-pointer", className)}>
        {hasAmount ? `Con puja · ${formatPrice(amountEuros!)}` : "Con puja"}
      </WarnFlag>
    );
  }

  return (
    <WarnFlag level="positive" className={cn("cursor-pointer", className)}>
      Sin puja
    </WarnFlag>
  );
}

interface OccupancyBadgeProps {
  occupancy: Occupancy | null | undefined;
  className?: string;
}

/**
 * Inline occupancy indicator. Returns null when occupancy is null/unknown.
 */
export function OccupancyBadge({ occupancy, className }: OccupancyBadgeProps) {
  if (
    occupancy !== "OCUPADO" &&
    occupancy !== "NO_OCUPADO" &&
    occupancy !== "NO_CONSTA"
  ) {
    return null;
  }

  if (occupancy === "OCUPADO") {
    return (
      <WarnFlag level="attention" className={cn("cursor-pointer", className)}>
        Ocupado
      </WarnFlag>
    );
  }
  if (occupancy === "NO_OCUPADO") {
    return (
      <WarnFlag level="positive" className={cn("cursor-pointer", className)}>
        No ocupado
      </WarnFlag>
    );
  }
  return (
    <WarnFlag level="neutral" className={cn("cursor-pointer", className)}>
      No consta
    </WarnFlag>
  );
}
