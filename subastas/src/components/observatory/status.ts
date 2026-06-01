/**
 * Status helpers — the canonical mapping of the 6 BOE statuses to:
 *   - the Spanish label we display
 *   - the visual color (one of our --color-status-* tokens)
 *   - the visual glyph (●, ◐, ▲) used as a pre-text icon in dense lists
 *
 * Used by StatusBadge, AuctionListRow, LiveFeed, and the detail page panel.
 */

import { AuctionStatus } from "@/types";

export type StatusMeta = {
  label: string;
  /** CSS color value — use directly in inline style or via the className map. */
  color: string;
  /** ASCII/Unicode glyph used in dense list rows for at-a-glance status. */
  glyph: string;
  /** Background tint (10% of color, used in chips/badges). */
  tint: string;
  /** Border tint (30% of color). */
  border: string;
  /** Whether the dot should pulse (only "celebrandose" / "active"). */
  pulse: boolean;
  /** Short helper sentence for credibility — what does this status mean? */
  helper: string;
};

/**
 * Redesign #3 palette: black ink on soft tint, status-colour dot + border.
 * Tint values are hex (the new --color-status-*-soft tokens). Dot/border
 * colour stays saturated to keep the status legible at glance.
 */
const LIVE: StatusMeta = {
  label: "Celebrándose",
  color: "#047857",
  tint: "#D1FADF",
  border: "rgba(4, 120, 87, 0.35)",
  glyph: "●",
  pulse: true,
  helper: "Abierta a pujas ahora en el Portal del BOE.",
};
const UPCOMING: StatusMeta = {
  label: "Próxima apertura",
  color: "#B45309",
  tint: "#FEF0CC",
  border: "rgba(180, 83, 9, 0.35)",
  glyph: "◐",
  pulse: false,
  helper: "Publicada pero todavía no abierta a pujas.",
};
const SUSPENDED: StatusMeta = {
  label: "Suspendida",
  color: "#92400E",
  tint: "#FDE7CF",
  border: "rgba(146, 64, 14, 0.35)",
  glyph: "▲",
  pulse: false,
  helper: "El juzgado ha suspendido la subasta. Puede reanudarse.",
};
const CANCELLED: StatusMeta = {
  label: "Cancelada",
  color: "#B91C1C",
  tint: "#FEE2E2",
  border: "rgba(185, 28, 28, 0.35)",
  glyph: "■",
  pulse: false,
  helper: "Subasta cancelada por la autoridad gestora.",
};
const CONCLUDED: StatusMeta = {
  label: "Finalizada",
  color: "#475569",
  tint: "#E2E8F0",
  border: "rgba(71, 85, 105, 0.35)",
  glyph: "◌",
  pulse: false,
  helper: "Subasta finalizada.",
};

const STATUS_META: Record<AuctionStatus, StatusMeta> = {
  "celebrandose": LIVE,
  "active": LIVE,
  "proxima-apertura": UPCOMING,
  "pre-auction": UPCOMING,
  "suspendida": SUSPENDED,
  "cancelada": CANCELLED,
  "concluida-portal": { ...CONCLUDED, label: "Concluida", helper: "Concluida en el Portal de Subastas del BOE." },
  "finalizada-autoridad": { ...CONCLUDED, helper: "Finalizada y resuelta por la autoridad gestora." },
  "finished": CONCLUDED,
};

export function getStatusMeta(status: AuctionStatus | string | null | undefined): StatusMeta {
  if (!status) return STATUS_META["concluida-portal"];
  return STATUS_META[status as AuctionStatus] ?? STATUS_META["concluida-portal"];
}

/** True if the status represents an actively-bidding auction. */
export function isLive(status: AuctionStatus | string | null | undefined): boolean {
  return status === "celebrandose" || status === "active";
}

/** True if the status represents a published-but-not-yet-open auction. */
export function isUpcoming(status: AuctionStatus | string | null | undefined): boolean {
  return status === "proxima-apertura" || status === "pre-auction";
}

/**
 * True when `endsAt` is in the past. The DB status can lag the wall clock —
 * a row may still carry `celebrandose` even though its auction window already
 * closed (no cleanup transition fired yet). Clock-wins is the source of truth.
 *
 * Mirrors the carousel's `isEffectivelyEnded` (ForexCarousel.tsx) — extracted
 * here so carousel + detail + list surfaces share one definition.
 */
export function isEffectivelyEnded(endsAt: string | Date | null | undefined): boolean {
  if (!endsAt) return false;
  const ms = endsAt instanceof Date ? endsAt.getTime() : new Date(endsAt).getTime();
  if (!Number.isFinite(ms)) return false;
  return ms <= Date.now();
}

/**
 * Clock-wins status resolution. If the raw (DB→frontend mapped) status says
 * the auction is live/upcoming/suspended but `endsAt` has already passed,
 * override to `concluida-portal` so every surface (badge, countdown, panel)
 * agrees. Without this, a single un-swept row paints the contradictory
 * "Celebrándose + Finalizada" pair Dennis reports.
 */
export function effectiveStatus(
  rawFrontendStatus: AuctionStatus | string | null | undefined,
  endsAt: string | Date | null | undefined,
): string {
  const status = (rawFrontendStatus ?? "celebrandose") as string;
  if (isEffectivelyEnded(endsAt)) return "concluida-portal";
  return status;
}
