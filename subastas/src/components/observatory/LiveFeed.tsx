"use client";

/**
 * LiveFeed — the home page "Últimas actualizaciones" stream.
 *
 * This is the *centerpiece* of the observatory thesis: a calm, chronological
 * feed of real recent events (status changes + new bids) that proves we're
 * actually tracking auctions in real time.
 *
 * Behavior:
 *   - First load on mount via /api/auctions/recent
 *   - Polls every 60s and merges new events at the top (subtle fade-in)
 *   - Each row is a Link to /auction/[id]
 *   - Each row shows: status glyph + relative timestamp + event description
 *     + auction title/location + "Seguir" affordance (FollowButton compact).
 *   - Empty state: explicit "Sin actualizaciones por ahora" — never lies
 *     about data.
 *
 * Visual signature:
 *   - hairline-divided rows, no shadows
 *   - tabular numerals on prices and times
 *   - serif Spanish, plain language
 */

import * as React from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api-path";
import { FollowButton } from "@/components/notifications/FollowButton";
import { StatusDot } from "./StatusBadge";
import { formatPrice, formatRelativeEs, capitalize, titleCase, displayTitle } from "./format";
import { getStatusMeta } from "./status";
import { cn } from "@/lib/utils";

type FeedAuction = {
  id: string;
  title: string;
  category: string;
  province: string | null;
  municipality: string | null;
  status: string;
  auctionType: string | null;
  currentBid: number | null;
  appraisalValue: number | null;
  endsAt: string | null;
  boeLink: string | null;
};

type FeedItem = {
  id: string;
  kind: "status" | "bid";
  at: string;
  auctionId: string;
  auction: FeedAuction;
  payload:
    | { type: "status"; fromStatus: string | null; toStatus: string; reason: string | null }
    | { type: "bid"; bid: number; bidType: string };
};

const POLL_MS = 60_000;

export type LiveFeedProps = {
  /** How many rows to show. Default 12. */
  limit?: number;
  className?: string;
};

export function LiveFeed({ limit = 12, className }: LiveFeedProps) {
  const [items, setItems] = React.useState<FeedItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await apiFetch(`/api/auctions/recent?limit=${limit}`);
      if (!res.ok) {
        setError("No pudimos cargar las últimas actualizaciones.");
        return;
      }
      const body = await res.json();
      if (body?.success && Array.isArray(body.data)) {
        setItems(body.data as FeedItem[]);
        setError(null);
      }
    } catch {
      setError("Sin conexión. Reintentando…");
    } finally {
      setLoading(false);
    }
  }, [limit]);

  React.useEffect(() => {
    load();
    const id = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  return (
    <section
      aria-labelledby="livefeed-heading"
      className={cn(
        "rounded-lg border border-[--color-hairline] bg-[--color-surface]",
        className,
      )}
    >
      <header className="flex items-baseline justify-between px-4 py-3 hairline-b">
        <h2
          id="livefeed-heading"
          className="font-serif text-lg md:text-xl text-[--color-ink-primary]"
        >
          Últimas actualizaciones
        </h2>
        <span className="text-xs text-[--color-ink-tertiary] tnum">
          Se actualiza automáticamente cada 60 s
        </span>
      </header>

      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-[--color-ink-tertiary]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Cargando las últimas actualizaciones…
        </div>
      ) : error && items.length === 0 ? (
        <div className="px-4 py-6 text-sm text-[--color-gold]">{error}</div>
      ) : items.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-[--color-ink-tertiary]">
          Sin actualizaciones por ahora.
        </div>
      ) : (
        <ul role="list" className="divide-y divide-[--color-hairline]">
          {items.map((it) => (
            <FeedRow key={`${it.kind}-${it.id}`} item={it} />
          ))}
        </ul>
      )}
    </section>
  );
}

function FeedRow({ item }: { item: FeedItem }) {
  const a = item.auction;
  const meta = getStatusMeta(a.status);
  const where = [a.municipality && titleCase(a.municipality), a.province && capitalize(a.province)]
    .filter(Boolean)
    .join(" · ");

  let eventLine: React.ReactNode;
  if (item.payload.type === "bid") {
    eventLine = (
      <>
        Nueva puja:{" "}
        <span className="tnum font-semibold text-[--color-ink-primary]">
          {formatPrice(item.payload.bid)}
        </span>
      </>
    );
  } else {
    const to = getStatusMeta(item.payload.toStatus);
    eventLine = (
      <>
        Cambio de estado:{" "}
        <span className="font-medium" style={{ color: to.color }}>
          {to.label}
        </span>
        {item.payload.reason ? (
          <span className="text-[--color-ink-tertiary]"> · {item.payload.reason}</span>
        ) : null}
      </>
    );
  }

  return (
    <li className="group relative flex items-start gap-3 px-4 py-3.5 hover:bg-[--color-surface-muted] transition-colors">
      <StatusDot status={a.status} size={10} className="mt-1.5" />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 text-xs text-[--color-ink-tertiary] tnum">
          <span>{formatRelativeEs(item.at)}</span>
          <span aria-hidden="true">·</span>
          <span className="uppercase tracking-wide" style={{ color: meta.color }}>
            {meta.label}
          </span>
          {a.category && (
            <>
              <span aria-hidden="true">·</span>
              <span>{a.category}</span>
            </>
          )}
        </div>

        <Link
          href={`/auction/${encodeURIComponent(a.id)}`}
          className="mt-1 block text-sm text-[--color-ink-primary] line-clamp-2 hover:underline focus-visible:outline-none focus-visible:underline"
        >
          {eventLine}
          <span className="text-[--color-ink-secondary]"> — {displayTitle(a)}</span>
        </Link>

        {where && (
          <div className="mt-0.5 text-xs text-[--color-ink-tertiary]">{where}</div>
        )}
      </div>

      <div className="shrink-0">
        <FollowButton auctionId={a.id} variant="compact" />
      </div>
    </li>
  );
}
