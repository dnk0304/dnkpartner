"use client";

/**
 * DetailTimeline — chronological "Línea de tiempo" for an auction's status
 * + bid history.
 *
 * Visible proof that we live-track. Every detected event shows here with a
 * timestamp; this is the credibility flex we sell to users worried about the
 * site being stale.
 *
 * Data comes from /api/auctions/[id] (Wave 2c loader): `history.statuses` and
 * `history.bids`. We interleave them by timestamp, paint each row's glyph
 * with the relevant status color (or gold for a bid), and label clearly.
 */

import * as React from "react";
import { StatusDot } from "./StatusBadge";
import { getStatusMeta } from "./status";
import { formatPrice, formatDateLong, formatRelativeEs } from "./format";
import { cn } from "@/lib/utils";

type StatusEvent = {
  id: string;
  kind: "status";
  at: string; // ISO
  fromStatus: string | null;
  toStatus: string;
  reason: string | null;
};

type BidEvent = {
  id: string;
  kind: "bid";
  at: string;
  bid: number;
  bidType: string;
};

type Event = StatusEvent | BidEvent;

export type DetailTimelineProps = {
  statuses: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    changedAt: string | Date;
    reason: string | null;
  }>;
  bids: Array<{
    id: string;
    bid: number;
    bidType: string;
    seenAt: string | Date;
  }>;
  /** Max rows to display initially. Default 8. "Ver todos" expands. */
  initialLimit?: number;
  className?: string;
};

// Map DB status (uppercase) to frontend status (lowercase-hyphen) — kept
// local because the timeline data is rendered without the API normalization.
function normalizeStatus(s: string | null | undefined): string {
  if (!s) return "concluida-portal";
  const map: Record<string, string> = {
    PROXIMA_APERTURA: "proxima-apertura",
    CELEBRANDOSE: "celebrandose",
    SUSPENDIDA: "suspendida",
    CANCELADA: "cancelada",
    CONCLUIDA_PORTAL: "concluida-portal",
    FINALIZADA_AUTORIDAD: "finalizada-autoridad",
    PRE_AUCTION: "proxima-apertura",
    ACTIVE: "celebrandose",
    FINISHED: "concluida-portal",
    SUSPENDED: "suspendida",
    CANCELLED: "cancelada",
  };
  return map[s] ?? s.toLowerCase();
}

export function DetailTimeline({
  statuses,
  bids,
  initialLimit = 8,
  className,
}: DetailTimelineProps) {
  const [expanded, setExpanded] = React.useState(false);

  const events = React.useMemo<Event[]>(() => {
    const out: Event[] = [];
    for (const s of statuses) {
      const at = s.changedAt instanceof Date ? s.changedAt.toISOString() : String(s.changedAt);
      out.push({
        id: s.id,
        kind: "status",
        at,
        fromStatus: s.fromStatus ? normalizeStatus(s.fromStatus) : null,
        toStatus: normalizeStatus(s.toStatus),
        reason: s.reason,
      });
    }
    for (const b of bids) {
      const at = b.seenAt instanceof Date ? b.seenAt.toISOString() : String(b.seenAt);
      out.push({
        id: b.id,
        kind: "bid",
        at,
        bid: b.bid,
        bidType: b.bidType,
      });
    }
    return out.sort((a, b) => b.at.localeCompare(a.at));
  }, [statuses, bids]);

  const visible = expanded ? events : events.slice(0, initialLimit);
  const hasMore = events.length > initialLimit;

  if (events.length === 0) {
    return (
      <div className={cn("text-sm text-[var(--color-ink-tertiary)]", className)}>
        Sin eventos registrados todavía. Esta subasta empezará a generar
        historial en cuanto el portal del BOE publique cambios.
      </div>
    );
  }

  return (
    <div className={className}>
      <ol role="list" className="relative space-y-3">
        {visible.map((e) => (
          <TimelineRow key={`${e.kind}-${e.id}`} event={e} />
        ))}
      </ol>

      {hasMore && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setExpanded((x) => !x)}
            className="text-sm font-medium text-[var(--color-brand)] hover:underline focus-visible:outline-none focus-visible:underline"
          >
            {expanded ? "Mostrar menos" : `Ver todos los cambios (${events.length})`}
          </button>
        </div>
      )}
    </div>
  );
}

function TimelineRow({ event }: { event: Event }) {
  if (event.kind === "bid") {
    return (
      <li className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-1.5 h-2.5 w-2.5 rounded-full shrink-0"
          style={{ backgroundColor: "#B08A3E" }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 text-xs text-[var(--color-ink-tertiary)] tnum">
            <time dateTime={event.at}>{formatRelativeEs(event.at)}</time>
            <span aria-hidden="true">·</span>
            <span>{formatDateLong(event.at)}</span>
          </div>
          <div className="text-sm text-[var(--color-ink-primary)]">
            Nueva puja:{" "}
            <span className="tnum font-semibold">{formatPrice(event.bid)}</span>
            {event.bidType === "final" && (
              <span className="ml-2 text-[10px] uppercase tracking-wide text-[var(--color-gold)]">
                Adjudicación
              </span>
            )}
          </div>
        </div>
      </li>
    );
  }

  const to = getStatusMeta(event.toStatus);
  const from = event.fromStatus ? getStatusMeta(event.fromStatus) : null;
  return (
    <li className="flex items-start gap-3">
      <StatusDot status={event.toStatus} size={10} className="mt-1.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 text-xs text-[var(--color-ink-tertiary)] tnum">
          <time dateTime={event.at}>{formatRelativeEs(event.at)}</time>
          <span aria-hidden="true">·</span>
          <span>{formatDateLong(event.at)}</span>
        </div>
        <div className="text-sm text-[var(--color-ink-primary)]">
          {from ? (
            <>
              <span style={{ color: from.color }}>{from.label}</span>{" "}
              <span aria-hidden="true">→</span>{" "}
              <span className="font-medium" style={{ color: to.color }}>
                {to.label}
              </span>
            </>
          ) : (
            <span className="font-medium" style={{ color: to.color }}>
              {to.label}
            </span>
          )}
          {event.reason && (
            <span className="text-[var(--color-ink-tertiary)]"> · {event.reason}</span>
          )}
        </div>
      </div>
    </li>
  );
}
