"use client";

/**
 * ForexCarousel — sideways-scrolling auction ticker.
 *
 * Two states, same horizontal row:
 *   - COMPACT (default): tiny ticker-cards, each shows ONLY a days-left
 *     countdown + tasación. Reads like a FX news-trading board.
 *   - EXPANDED: same row, cards grow taller to surface title, photo, location,
 *     minimum bid, status badge, end time. Still horizontal — NOT a vertical
 *     list. Toggle back collapses.
 *
 * Always horizontal. Drag/wheel/swipe to scroll. Prev/next arrow buttons.
 * Respects prefers-reduced-motion (no auto-scroll, instant snap).
 *
 * Source: /api/auctions/recent (ACTIVE auctions only — same feed as LiveFeed).
 * Polls every 60s.
 *
 * "Ver todas" button NAVIGATES to /subastas?when=activas — it does NOT expand
 * inline (the expand arrow is a separate control next to it).
 *
 * Sits at the TOP of the home so the map stays visible near the fold.
 */

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, ChevronRight, ChevronsUpDown, ChevronsDownUp, ArrowRight, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api-path";
import { StatusBadge } from "./StatusBadge";
import {
  formatPrice,
  formatDaysLeft,
  daysLeft,
  displayTitle,
  capitalize,
  titleCase,
} from "./format";
import { cn } from "@/lib/utils";

type FeedAuction = {
  id: string;
  title: string;
  category: string;
  province: string | null;
  municipality: string | null;
  status: string;
  auctionType: string | null;
  propertyType: string | null;
  currentBid: number | null;
  appraisalValue: number | null;
  minimumBid: number | null;
  depositAmount: number | null;
  endsAt: string | null;
  endDateTime: string | null;
  lotNumber: string | null;
  imageUrl: string | null;
  boeLink: string | null;
};

type FeedItem = {
  id: string;
  kind: "status" | "bid" | "auction";
  at: string;
  auctionId: string;
  auction: FeedAuction;
};

const POLL_MS = 60_000;
const ACTIVE_STATUSES = new Set([
  "celebrandose",
  "proxima-apertura",
  "suspendida",
]);

function isRealPhotoUrl(url?: string | null): boolean {
  if (!url) return false;
  return url.startsWith("/api/auction-image/") || url.startsWith("/streetview/");
}

/**
 * Pick the first numeric value that is finite AND > 0. The `recent` feed
 * routinely surfaces literal `0` for appraisal/minimum-bid where the upstream
 * scraper has no value (~46% of active rows on 2026-06-01). Treat 0 as "no
 * data" — never render "0 €" to the user.
 */
function pickPrice(...vals: Array<number | null | undefined>): number | null {
  for (const v of vals) {
    if (v != null && Number.isFinite(v) && v > 0) return v;
  }
  return null;
}

/**
 * True when `endsAt` is in the past. The `recent` feed can return rows that
 * still carry a DB status of `celebrandose` even though their auction window
 * already closed (no cleanup transition fired yet). The carousel treats clock
 * as the source of truth — never paint "Live" on a row whose end time is gone.
 */
function isEffectivelyEnded(endsAt: string | null | undefined): boolean {
  if (!endsAt) return false;
  const ms = new Date(endsAt).getTime();
  if (!Number.isFinite(ms)) return false;
  return ms <= Date.now();
}

/** Treat literal "unknown" (any case) as junk — same convention as displayTitle. */
function cleanLoc(value: string | null | undefined): string {
  if (!value) return "";
  const t = value.trim();
  if (!t || t.toLowerCase() === "unknown") return "";
  return t;
}

export type ForexCarouselProps = {
  /** Max auctions to fetch. Default 30. */
  limit?: number;
  /** Where "Ver todas" routes. Default /subastas?when=activas. */
  seeAllHref?: string;
  className?: string;
};

export function ForexCarousel({
  limit = 30,
  seeAllHref = "/subastas?when=activas",
  className,
}: ForexCarouselProps) {
  const [items, setItems] = React.useState<FeedAuction[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [expanded, setExpanded] = React.useState(false);
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await apiFetch(`/api/auctions/recent?limit=${limit}&types=auction,status,bid&activeOnly=1`);
      if (!res.ok) return;
      const body = await res.json();
      if (body?.success && Array.isArray(body.data)) {
        const rows = (body.data as FeedItem[])
          .map((it) => it.auction)
          .filter((a) => ACTIVE_STATUSES.has(a.status));
        // Dedupe by id keeping first occurrence (most recent activity).
        const seen = new Set<string>();
        const deduped: FeedAuction[] = [];
        for (const a of rows) {
          if (seen.has(a.id)) continue;
          seen.add(a.id);
          deduped.push(a);
        }
        setItems(deduped);
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [limit]);

  React.useEffect(() => {
    load();
    const id = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const scrollBy = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const step = Math.max(el.clientWidth * 0.7, 320);
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  return (
    <section
      aria-labelledby="forex-carousel-heading"
      className={cn(
        "rounded-xl border border-[--color-hairline] bg-[--color-surface]",
        "shadow-[var(--shadow-card)]",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3 px-4 py-3 hairline-b">
        <div className="min-w-0 flex items-baseline gap-3">
          <h2
            id="forex-carousel-heading"
            className="font-serif text-base md:text-lg text-[--color-ink-primary] whitespace-nowrap"
          >
            Últimas actualizaciones
          </h2>
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] text-[--color-ink-tertiary] tnum">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full bg-[--color-status-live] dnk-pulse"
            />
            {items.length} activas
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-pressed={expanded}
            aria-label={expanded ? "Contraer tarjetas" : "Expandir tarjetas"}
            title={expanded ? "Vista compacta" : "Ver más detalles"}
            className={cn(
              "inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-brand-soft]/40",
              expanded
                ? "border-[--color-brand] bg-[--color-brand] text-white"
                : "border-[--color-hairline] bg-[--color-surface] text-[--color-ink-secondary] hover:border-[--color-brand-soft]/40 hover:text-[--color-brand-soft]",
            )}
          >
            {expanded ? (
              <ChevronsDownUp className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronsUpDown className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">{expanded ? "Compacto" : "Expandir"}</span>
          </button>

          <div className="hidden sm:inline-flex rounded-md border border-[--color-hairline] overflow-hidden">
            <button
              type="button"
              onClick={() => scrollBy(-1)}
              aria-label="Anterior"
              className="h-8 w-8 inline-flex items-center justify-center text-[--color-ink-secondary] hover:bg-[--color-surface-muted] focus-visible:outline-none focus-visible:bg-[--color-surface-muted]"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => scrollBy(1)}
              aria-label="Siguiente"
              className="h-8 w-8 inline-flex items-center justify-center text-[--color-ink-secondary] hover:bg-[--color-surface-muted] focus-visible:outline-none focus-visible:bg-[--color-surface-muted]"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <Link
            href={seeAllHref}
            className={cn(
              "inline-flex h-8 items-center gap-1 rounded-md bg-[--color-brand] px-3 text-xs font-semibold text-white",
              "hover:bg-[--color-brand-hover] transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-brand-soft]/40",
            )}
          >
            Ver todas
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </header>

      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-[--color-ink-tertiary]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Cargando subastas activas…
        </div>
      ) : items.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-[--color-ink-tertiary]">
          Sin subastas activas ahora mismo.
        </div>
      ) : (
        <div
          ref={scrollerRef}
          role="region"
          aria-label="Carrusel de subastas activas"
          className={cn(
            "flex gap-2 overflow-x-auto overflow-y-hidden px-3 py-3",
            // Smooth horizontal scrolling, snap to cards, scrollbar minimized
            "snap-x snap-mandatory scroll-px-3 scroll-smooth",
            "[scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5",
            "[&::-webkit-scrollbar-thumb]:bg-[--color-hairline] [&::-webkit-scrollbar-thumb]:rounded-full",
          )}
        >
          {items.map((a) =>
            expanded ? (
              <ExpandedCard key={a.id} auction={a} />
            ) : (
              <CompactCard key={a.id} auction={a} />
            ),
          )}
        </div>
      )}
    </section>
  );
}

/* ── Compact ticker card ─────────────────────────────────────────────────── */

function CompactCard({ auction }: { auction: FeedAuction }) {
  const endsAt = auction.endsAt ?? auction.endDateTime;
  const ended = isEffectivelyEnded(endsAt);
  const dl = daysLeft(endsAt);
  const urgent = !ended && dl != null && dl <= 1;
  const value = pickPrice(auction.appraisalValue, auction.minimumBid, auction.currentBid);

  // Clock wins over stale DB status: if endsAt is in the past, never paint Live/Próx.
  const effectiveStatus = ended ? "concluida-portal" : auction.status;
  const prov = cleanLoc(auction.province);

  return (
    <Link
      href={`/auction/${encodeURIComponent(auction.id)}`}
      className={cn(
        "snap-start shrink-0 w-[140px] rounded-lg border bg-[--color-surface] px-2.5 py-2",
        "flex flex-col gap-1 transition-colors",
        "hover:border-[--color-brand-soft]/50 hover:bg-[--color-info-soft]/40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-brand-soft]/40",
        urgent ? "border-[--color-gold]/60" : "border-[--color-hairline]",
      )}
      title={displayTitle(auction)}
    >
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-[--color-ink-tertiary]">
        <span className="inline-flex items-center gap-1">
          <span
            aria-hidden="true"
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              effectiveStatus === "celebrandose"
                ? "bg-[--color-status-live] dnk-pulse"
                : effectiveStatus === "proxima-apertura"
                  ? "bg-[--color-status-upcoming]"
                  : "bg-[--color-ink-tertiary]",
            )}
          />
          {effectiveStatus === "celebrandose"
            ? "Live"
            : effectiveStatus === "proxima-apertura"
              ? "Próx"
              : "—"}
        </span>
        <span
          className={cn(
            "tnum font-semibold",
            urgent ? "text-[--color-gold]" : "text-[--color-ink-secondary]",
          )}
        >
          {ended ? "Finalizada" : formatDaysLeft(endsAt)}
        </span>
      </div>
      <div className="tnum text-sm font-semibold text-[--color-ink-primary] truncate">
        {value != null ? formatPrice(value) : "Sin tasación"}
      </div>
      <div className="text-[10px] text-[--color-ink-tertiary] truncate">
        {prov ? capitalize(prov) : "España"}
      </div>
    </Link>
  );
}

/* ── Expanded richer card ────────────────────────────────────────────────── */

function ExpandedCard({ auction }: { auction: FeedAuction }) {
  const endsAt = auction.endsAt ?? auction.endDateTime;
  const ended = isEffectivelyEnded(endsAt);
  const dl = daysLeft(endsAt);
  const urgent = !ended && dl != null && dl <= 1;
  const title = displayTitle(auction);
  const muni = cleanLoc(auction.municipality);
  const prov = cleanLoc(auction.province);
  const where = [muni && titleCase(muni), prov && capitalize(prov)]
    .filter(Boolean)
    .join(" · ");
  // Treat 0 as "no data" (see pickPrice).
  const tasacion = pickPrice(auction.appraisalValue);
  const minBid = pickPrice(auction.minimumBid);
  const photo = isRealPhotoUrl(auction.imageUrl) ? auction.imageUrl : null;
  // Clock wins over stale DB status — same rule as CompactCard.
  const effectiveStatus = ended ? "concluida-portal" : auction.status;

  return (
    <Link
      href={`/auction/${encodeURIComponent(auction.id)}`}
      className={cn(
        "snap-start shrink-0 w-[260px] rounded-lg border bg-[--color-surface] overflow-hidden",
        "flex flex-col transition-colors",
        "hover:border-[--color-brand-soft]/50 hover:shadow-[var(--shadow-card)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-brand-soft]/40",
        urgent ? "border-[--color-gold]/60" : "border-[--color-hairline]",
      )}
    >
      <div className="relative aspect-[16/9] bg-[--color-surface-muted]">
        {photo ? (
          <Image
            src={photo}
            alt=""
            fill
            sizes="260px"
            className="object-cover"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] uppercase tracking-wide text-[--color-ink-tertiary]">
            Sin foto
          </div>
        )}
        <span className="absolute top-1.5 left-1.5">
          <StatusBadge status={effectiveStatus} size="sm" />
        </span>
        <span
          className={cn(
            "absolute top-1.5 right-1.5 tnum rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
            urgent
              ? "bg-[--color-gold] text-white"
              : "bg-[--color-brand] text-white",
          )}
        >
          {ended ? "Finalizada" : formatDaysLeft(endsAt)}
        </span>
      </div>

      <div className="p-2.5 flex flex-col gap-1.5 min-w-0">
        <div className="text-[13px] font-medium text-[--color-ink-primary] line-clamp-2 leading-snug">
          {title}
        </div>
        {where && (
          <div className="text-[11px] text-[--color-ink-tertiary] truncate">
            {where}
          </div>
        )}
        <div className="mt-1 grid grid-cols-2 gap-2 pt-1.5 border-t border-[--color-hairline]">
          {tasacion != null && (
            <div className="min-w-0">
              <div className="text-[9px] uppercase tracking-wide text-[--color-ink-tertiary]">
                Tasación
              </div>
              <div className="tnum text-[13px] font-semibold text-[--color-ink-primary] truncate">
                {formatPrice(tasacion)}
              </div>
            </div>
          )}
          {minBid != null && (
            <div className="min-w-0 text-right">
              <div className="text-[9px] uppercase tracking-wide text-[--color-ink-tertiary]">
                Puja mín.
              </div>
              <div className="tnum text-[13px] font-semibold text-[--color-brand-soft] truncate">
                {formatPrice(minBid)}
              </div>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
