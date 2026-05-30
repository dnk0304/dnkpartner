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

const STATUS_META: Record<AuctionStatus, StatusMeta> = {
  "celebrandose": {
    label: "Celebrándose",
    color: "#1F7A4E",
    tint: "rgba(31, 122, 78, 0.10)",
    border: "rgba(31, 122, 78, 0.30)",
    glyph: "●",
    pulse: true,
    helper: "Abierta a pujas ahora en el Portal del BOE.",
  },
  "active": {
    label: "Celebrándose",
    color: "#1F7A4E",
    tint: "rgba(31, 122, 78, 0.10)",
    border: "rgba(31, 122, 78, 0.30)",
    glyph: "●",
    pulse: true,
    helper: "Abierta a pujas ahora en el Portal del BOE.",
  },
  "proxima-apertura": {
    label: "Próxima apertura",
    color: "#C68A1E",
    tint: "rgba(198, 138, 30, 0.10)",
    border: "rgba(198, 138, 30, 0.30)",
    glyph: "◐",
    pulse: false,
    helper: "Publicada pero todavía no abierta a pujas.",
  },
  "pre-auction": {
    label: "Próxima apertura",
    color: "#C68A1E",
    tint: "rgba(198, 138, 30, 0.10)",
    border: "rgba(198, 138, 30, 0.30)",
    glyph: "◐",
    pulse: false,
    helper: "Publicada pero todavía no abierta a pujas.",
  },
  "suspendida": {
    label: "Suspendida",
    color: "#8A6D2F",
    tint: "rgba(138, 109, 47, 0.10)",
    border: "rgba(138, 109, 47, 0.30)",
    glyph: "▲",
    pulse: false,
    helper: "El juzgado ha suspendido la subasta. Puede reanudarse.",
  },
  "cancelada": {
    label: "Cancelada",
    color: "#7A2727",
    tint: "rgba(122, 39, 39, 0.10)",
    border: "rgba(122, 39, 39, 0.30)",
    glyph: "■",
    pulse: false,
    helper: "Subasta cancelada por la autoridad gestora.",
  },
  "concluida-portal": {
    label: "Concluida",
    color: "#5A5A58",
    tint: "rgba(90, 90, 88, 0.10)",
    border: "rgba(90, 90, 88, 0.30)",
    glyph: "◌",
    pulse: false,
    helper: "Concluida en el Portal de Subastas del BOE.",
  },
  "finalizada-autoridad": {
    label: "Finalizada",
    color: "#5A5A58",
    tint: "rgba(90, 90, 88, 0.10)",
    border: "rgba(90, 90, 88, 0.30)",
    glyph: "◌",
    pulse: false,
    helper: "Finalizada y resuelta por la autoridad gestora.",
  },
  "finished": {
    label: "Finalizada",
    color: "#5A5A58",
    tint: "rgba(90, 90, 88, 0.10)",
    border: "rgba(90, 90, 88, 0.30)",
    glyph: "◌",
    pulse: false,
    helper: "Subasta finalizada.",
  },
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
