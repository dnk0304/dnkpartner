"use client";

/**
 * ForexCarousel — endless auto-scroll marquee for the home "Últimas
 * actualizaciones" strip.
 *
 * Cards drift sideways at a slow, readable pace like a stock-ticker or
 * airport departures board. As a card exits one edge, the duplicated track
 * makes it look like it re-enters the other — a seamless infinite loop. The
 * track is rendered TWICE back-to-back and translated by exactly -50% over a
 * long linear-infinite keyframe, so there is no visible seam.
 *
 * Driven by `HomeQuickFilterChips` (one section, one component sharing state
 * upstream). The `category` / `province` / `when` props are passed straight
 * through to `/api/auctions/recent` — the route already accepts them (Forge
 * §6, commit 2a7259f). Properties-first default ordering happens on the
 * server when no category is pinned.
 *
 * a11y / motion:
 *   - Pause-on-hover (cards stay clickable mid-drift).
 *   - `prefers-reduced-motion` REQUIRED: the auto-motion is suspended and the
 *     row becomes a manually scrollable flat strip with drag + arrow buttons.
 *     We never ship motion the OS setting can't stop.
 *   - When paused (via `pause` prop — modal open), the keyframe halts so the
 *     card behind the modal stays still.
 *
 * Source: `/api/auctions/recent?limit=...&types=auction,status,bid&activeOnly=1`,
 * polls every 60s, refetches the moment any chip changes.
 *
 * Card clicks fire `onCardClick(auction)` (no `<Link>` navigation). Item G
 * wires this to open `AuctionDetailModal` in the parent.
 */

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, ChevronRight, ArrowRight, Loader2, MapPin } from "lucide-react";
import { apiFetch } from "@/lib/api-path";
import { StatusBadge } from "./StatusBadge";
import { resolveCardImage, isVariosLotesTitle } from "@/lib/resolve-card-image";
import {
  formatPrice,
  formatDaysLeft,
  daysLeft,
  displayTitle,
  capitalize,
  titleCase,
} from "./format";
import { cn } from "@/lib/utils";

export type FeedAuction = {
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
  claimedAmount: number | null;
  endsAt: string | null;
  endDateTime: string | null;
  lotNumber: string | null;
  imageUrl: string | null;
  boeLink: string | null;
  latitude: number | null;
  longitude: number | null;
  // Detail-modal extras when the server projects them (recent route adds
  // these in the same shape /api/auctions does — null-safe everywhere).
  address?: string | null;
  pujaStatus?: 'CON_PUJA' | 'SIN_PUJA' | null;
  currentBidAmount?: number | null;
  occupancy?: 'OCUPADO' | 'NO_OCUPADO' | 'NO_CONSTA' | null;
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

/**
 * Marquee pixels-per-second. Slow enough to read a card as it passes (a
 * 260px card takes ~13s to cross at 20 px/s). The keyframe duration is
 * derived from this + the measured track width so adding/removing cards
 * keeps the same perceived speed.
 */
const MARQUEE_PX_PER_SEC = 22;

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

  /* ── Chip-driven server filters (Forge §6 recent-route params) ─────────── */
  /** Exact DB category label. */
  category?: string | null;
  /** Exact DB province label. */
  province?: string | null;
  /** Bucket alias ("termina-esta-semana" maps to a future-window filter). */
  when?: string | null;

  /** Card click handler — receives the underlying FeedAuction. When provided,
   * the marquee uses `<button>` cards instead of `<Link>` so Item G can wire
   * a modal without per-card navigation. */
  onCardClick?: (auction: FeedAuction) => void;

  /** External pause signal (e.g. modal is open). When true, the marquee
   * animation pauses regardless of hover state. */
  pause?: boolean;

  /** Notify parent of the current drifting card count (for the "Todas" pill). */
  onItemsCountChange?: (count: number) => void;
};

export function ForexCarousel({
  limit = 30,
  seeAllHref = "/subastas?when=activas",
  className,
  category = null,
  province = null,
  when = null,
  onCardClick,
  pause = false,
  onItemsCountChange,
}: ForexCarouselProps) {
  const [items, setItems] = React.useState<FeedAuction[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [hovered, setHovered] = React.useState(false);
  const [reducedMotion, setReducedMotion] = React.useState(false);
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const [trackWidth, setTrackWidth] = React.useState<number | null>(null);

  // Detect the OS reduced-motion preference. Honour live changes (some users
  // toggle this between sessions / via system shortcut).
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const load = React.useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("types", "auction,status,bid");
      params.set("activeOnly", "1");
      if (category) params.set("category", category);
      if (province) params.set("province", province);
      if (when) params.set("when", when);
      const res = await apiFetch(`/api/auctions/recent?${params.toString()}`);
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
  }, [limit, category, province, when]);

  React.useEffect(() => {
    setLoading(true);
    load();
    const id = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  React.useEffect(() => {
    onItemsCountChange?.(items.length);
  }, [items.length, onItemsCountChange]);

  // Measure the unduplicated track width so we can derive a keyframe
  // duration proportional to content length (keeps perceived speed constant
  // whether 6 cards or 30 are drifting). ResizeObserver re-fires on layout
  // shifts and when the chip filter mutates the row set.
  React.useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () => {
      // The track contains TWO copies of the list. Halve to get one copy.
      const w = el.scrollWidth / 2;
      if (Number.isFinite(w) && w > 0) setTrackWidth(w);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [items.length]);

  // Manual scroll (used in reduced-motion fallback). Falls back gracefully if
  // the scroller ref isn't mounted yet.
  const scrollBy = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const step = Math.max(el.clientWidth * 0.7, 320);
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  // Animation runs unless: reduced-motion, external pause, hover, or empty.
  const animationPaused = reducedMotion || pause || hovered || items.length === 0;
  const animationDurationSec =
    trackWidth && trackWidth > 0 ? Math.max(20, trackWidth / MARQUEE_PX_PER_SEC) : 60;

  // Decide once which surface to render: a duplicated marquee (default) or a
  // single manually-scrolled row (reduced-motion fallback).
  const useStaticScroller = reducedMotion;

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
            className="font-display text-base md:text-lg text-[--color-ink-primary] whitespace-nowrap"
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
          {/* Arrow buttons only useful in the reduced-motion fallback — hide
              them when the marquee is auto-drifting (they would scroll only
              the visible window of an `overflow-hidden` track, surprising the
              user). */}
          {useStaticScroller && (
            <div className="hidden sm:inline-flex rounded-md border border-[--color-hairline] overflow-hidden">
              <button
                type="button"
                onClick={() => scrollBy(-1)}
                aria-label="Anterior"
                className="h-8 w-8 inline-flex items-center justify-center text-[--color-ink-secondary] hover:bg-[--color-surface-muted] focus-visible:outline-none focus-visible:bg-[--color-surface-muted] cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => scrollBy(1)}
                aria-label="Siguiente"
                className="h-8 w-8 inline-flex items-center justify-center text-[--color-ink-secondary] hover:bg-[--color-surface-muted] focus-visible:outline-none focus-visible:bg-[--color-surface-muted] cursor-pointer"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}

          <Link
            href={seeAllHref}
            className={cn(
              "inline-flex h-8 items-center gap-1 rounded-md border border-[--color-ink-primary] bg-[--color-surface] px-3 text-xs font-semibold cursor-pointer",
              "text-[--color-ink-primary]",
              "hover:bg-[--color-surface-muted] transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-action]/40",
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
          Sin subastas activas con este filtro.
        </div>
      ) : useStaticScroller ? (
        /* Reduced-motion fallback: a plain horizontally-scrollable strip. No
           auto-motion, no duplicate track. Drag + arrows are the affordance. */
        <div
          ref={scrollerRef}
          role="region"
          aria-label="Carrusel de subastas activas"
          className={cn(
            "flex gap-2 overflow-x-auto overflow-y-hidden px-3 py-3",
            "snap-x snap-mandatory scroll-px-3 scroll-smooth",
            "[scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5",
            "[&::-webkit-scrollbar-thumb]:bg-[--color-hairline] [&::-webkit-scrollbar-thumb]:rounded-full",
          )}
        >
          {items.map((a) => (
            <ExpandedCard key={a.id} auction={a} onCardClick={onCardClick} />
          ))}
        </div>
      ) : (
        /* Marquee: a duplicated track translated -50% over a long linear loop.
           `overflow-hidden` clips the off-screen half — the duplicate is what
           hides the seam. Edge fade-mask softens cards appearing/leaving. */
        <div
          className={cn(
            "relative overflow-hidden",
            // Subtle horizontal fade so cards don't pop in/out at hard edges.
            "[mask-image:linear-gradient(to_right,transparent,black_24px,black_calc(100%-24px),transparent)]",
            "[-webkit-mask-image:linear-gradient(to_right,transparent,black_24px,black_calc(100%-24px),transparent)]",
          )}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocusCapture={() => setHovered(true)}
          onBlurCapture={(e) => {
            // Only release pause when focus leaves the marquee entirely.
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              setHovered(false);
            }
          }}
        >
          <div
            ref={trackRef}
            role="region"
            aria-label="Carrusel de subastas activas"
            className="flex gap-2 px-3 py-3 w-max will-change-transform"
            style={{
              animation: `dnk-marquee ${animationDurationSec}s linear infinite`,
              animationPlayState: animationPaused ? "paused" : "running",
            }}
          >
            {/* First copy. */}
            {items.map((a) => (
              <ExpandedCard
                key={`a-${a.id}`}
                auction={a}
                onCardClick={onCardClick}
              />
            ))}
            {/* Second copy — `duplicate` flag makes each card aria-hidden and
                untabbable so screen readers + keyboard nav only see the
                original set. Cards stay direct flex children of the track so
                the -50% translate aligns exactly to the first copy's start. */}
            {items.map((a) => (
              <ExpandedCard
                key={`b-${a.id}`}
                auction={a}
                onCardClick={onCardClick}
                duplicate
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/* ── Expanded richer card ────────────────────────────────────────────────── */

function ExpandedCard({
  auction,
  onCardClick,
  duplicate = false,
}: {
  auction: FeedAuction;
  onCardClick?: (auction: FeedAuction) => void;
  duplicate?: boolean;
}) {
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
  const valorSubasta = pickPrice(auction.appraisalValue);
  const reclamada = pickPrice(auction.claimedAmount);
  const minBid = pickPrice(auction.minimumBid);
  const deposit =
    valorSubasta == null && reclamada == null && minBid == null
      ? pickPrice(auction.depositAmount)
      : null;
  const [imgFailed, setImgFailed] = React.useState(false);
  const resolved = resolveCardImage({
    imageUrl: auction.imageUrl,
    latitude: auction.latitude,
    longitude: auction.longitude,
    category: auction.category,
    title: title,
    size: "thumbnail",
  });
  const imageSrc =
    imgFailed && resolved.rung !== "placeholder"
      ? resolveCardImage({ category: auction.category, title: title, size: "thumbnail" }).src
      : resolved.src;
  const showMapPin = resolved.isMap && !imgFailed;
  const effectiveStatus = ended ? "concluida-portal" : auction.status;
  const noPriceData =
    valorSubasta == null && reclamada == null && minBid == null && deposit == null;
  const isVariosLotes = isVariosLotesTitle(title);

  const cardClass = cn(
    "snap-start shrink-0 w-[260px] rounded-lg border bg-[--color-surface] overflow-hidden",
    "flex flex-col transition-colors text-left cursor-pointer",
    "hover:border-[--color-brand-soft]/50 hover:shadow-[var(--shadow-card)]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-brand-soft]/40",
    urgent ? "border-[--color-warn-critical]/60" : "border-[--color-hairline]",
  );

  const innerBody = (
    <>
      <div className="relative aspect-[16/9] bg-[--color-surface-muted]">
        <Image
          src={imageSrc}
          alt={resolved.alt}
          fill
          sizes="260px"
          className={
            resolved.isPlaceholder || (imgFailed && resolved.rung !== "placeholder")
              ? "object-contain p-4 opacity-80"
              : "object-cover"
          }
          style={
            showMapPin && resolved.mapPin
              ? { objectPosition: `${resolved.mapPin.xPct}% ${resolved.mapPin.yPct}%` }
              : undefined
          }
          loading="lazy"
          unoptimized={resolved.isMap && !imgFailed}
          onError={() => setImgFailed(true)}
        />
        {showMapPin && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[--color-warn-critical] text-white shadow-[0_2px_6px_rgba(0,0,0,0.35)] ring-2 ring-white">
              <MapPin className="h-3.5 w-3.5" strokeWidth={2.5} />
            </span>
          </span>
        )}
        {showMapPin && (
          <span
            aria-hidden="true"
            className="absolute bottom-1 right-1 inline-flex items-center gap-1 rounded-full border border-[--color-hairline] bg-[--color-surface]/90 px-1.5 py-0.5 text-[9px] font-medium text-[--color-ink-secondary]"
          >
            <MapPin className="h-2.5 w-2.5" />
            Ubicación
          </span>
        )}
        <span className="absolute top-1.5 left-1.5">
          <StatusBadge status={effectiveStatus} size="sm" />
        </span>
        <span
          className={cn(
            "absolute top-1.5 right-1.5 tnum rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
            "text-[--color-ink-primary] border",
            urgent
              ? "bg-[--color-warn-critical-soft] border-[--color-warn-critical]/40"
              : "bg-[--color-surface] border-[--color-hairline]",
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
        <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-1.5 pt-1.5 border-t border-[--color-hairline]">
          {noPriceData && (
            <div className="col-span-2 min-w-0">
              <div className="text-[9px] uppercase tracking-wide text-[--color-ink-tertiary]">
                {isVariosLotes ? "Varios lotes" : "Precio"}
              </div>
              <div className="text-[12px] font-medium text-[--color-ink-secondary]">
                Precio no disponible
              </div>
            </div>
          )}
          {reclamada != null && (
            <div className="min-w-0">
              <div className="text-[9px] uppercase tracking-wide text-[--color-ink-tertiary]">
                Cantidad reclamada
              </div>
              <div className="tnum text-[13px] font-semibold text-[--color-ink-primary] truncate">
                {formatPrice(reclamada)}
              </div>
            </div>
          )}
          {valorSubasta != null && (
            <div className={cn("min-w-0", reclamada != null && "text-right")}>
              <div className="text-[9px] uppercase tracking-wide text-[--color-ink-tertiary]">
                Valor subasta
              </div>
              <div className="tnum text-[13px] font-semibold text-[--color-ink-primary] truncate">
                {formatPrice(valorSubasta)}
              </div>
            </div>
          )}
          {minBid != null && (
            <div className="min-w-0">
              <div className="text-[9px] uppercase tracking-wide text-[--color-ink-tertiary]">
                Puja mín.
              </div>
              <div className="tnum text-[13px] font-semibold text-[--color-ink-primary] truncate">
                {formatPrice(minBid)}
              </div>
            </div>
          )}
          {deposit != null && (
            <div className="min-w-0 col-span-2">
              <div className="text-[9px] uppercase tracking-wide text-[--color-ink-tertiary]">
                Depósito
              </div>
              <div className="tnum text-[13px] font-semibold text-[--color-ink-primary] truncate">
                {formatPrice(deposit)}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );

  // Click handler: when wired (Item G), the card becomes a `<button>` that
  // opens the detail modal in the parent. When not wired, it falls back to a
  // `<Link>` to the canonical auction page (G-not-shipped fallback).
  if (onCardClick) {
    return (
      <button
        type="button"
        onClick={() => onCardClick(auction)}
        // Duplicate-track copies are presentational — hide from a11y tree and
        // the tab order, so the user only ever focuses one copy of a card.
        aria-hidden={duplicate || undefined}
        tabIndex={duplicate ? -1 : 0}
        className={cardClass}
        title={title}
        aria-label={`Ver detalles de ${title}`}
      >
        {innerBody}
      </button>
    );
  }

  return (
    <Link
      href={`/auction/${encodeURIComponent(auction.id)}`}
      aria-hidden={duplicate || undefined}
      tabIndex={duplicate ? -1 : 0}
      className={cardClass}
      title={title}
    >
      {innerBody}
    </Link>
  );
}
