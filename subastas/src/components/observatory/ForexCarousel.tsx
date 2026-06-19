"use client";

/**
 * ForexCarousel — endless auto-scroll marquee for the home "Últimas
 * actualizaciones" strip.
 *
 * Cards drift sideways at a slow, readable pace like a stock-ticker or
 * airport departures board. As a card exits one edge, the duplicated track
 * makes it look like it re-enters the other — a seamless infinite loop. The
 * track is rendered TWICE back-to-back and translated negatively by JS rAF
 * (modulo trackWidth) so the loop is invisible.
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
 *   - When paused (via `pause` prop — modal open), the rAF loop freezes so
 *     the card behind the modal stays still.
 *
 * Drag-to-scrub (2026-06-03, Dennis):
 *   - On the motion-OK path the marquee track is a JS rAF translate loop
 *     (not a CSS keyframe) so a pointer-drag can SCRUB on top of the drift.
 *   - Pointer-down + horizontal move past a 5px threshold = the user is
 *     scrubbing: we pause the auto-drift and translate the track by the
 *     drag delta. On release the rAF auto-drift resumes from the current
 *     position — no jump back to 0.
 *   - A click that doesn't cross the threshold still fires `onCardClick`.
 *   - Reduced-motion path is UNTOUCHED: it's already a native overflow-x
 *     scroller — manual drag is free, no JS motion to clean up.
 *
 * Source: `/api/auctions/carousel-mix?limit=...` — the home composed feed
 * (50% celebrandose / 30% próxima-apertura / 20% suspendida, weighted-
 * interleaved by Forge). Polls every 60s, refetches the moment any chip
 * changes. Envelope is identical to `/api/auctions/recent` so the
 * `body.data.map(it => it.auction)` projection unchanged.
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
import { AuctionCardTypeBanner } from "./AuctionCardTypeBanner";
import { resolveCardImage, fallbackImageFor, isVariosLotesTitle } from "@/lib/resolve-card-image";
import { statusDateLabel } from "@/lib/auction-status";
import { OFFICIAL_CATEGORIES } from "@/lib/constants";
import { buildAuctionSlug } from "@/lib/seo/auction-slug";
import { auctionCardTitle } from "@/lib/seo/display-title";
import {
  formatPrice,
  formatDaysLeft,
  formatDateMed,
  daysLeft,
  capitalize,
  titleCase,
  prettifyAuctionType,
} from "./format";
import { cn } from "@/lib/utils";

/**
 * Category-group predicates — used by HomeCarouselSection to split the home
 * marquee into "Últimos inmuebles" (REAL_ESTATE) and "Últimos vehículos"
 * (MOVABLE) rows from a single carousel-mix fetch. The endpoint only accepts
 * a single category filter, so we filter client-side after fetch.
 */
const REAL_ESTATE_SET = new Set<string>(OFFICIAL_CATEGORIES.REAL_ESTATE);
const MOVABLE_SET = new Set<string>(OFFICIAL_CATEGORIES.MOVABLE);
export type CategoryGroup = "real_estate" | "movable";

function matchesCategoryGroup(category: string | null | undefined, group: CategoryGroup): boolean {
  if (!category) return false;
  return group === "real_estate" ? REAL_ESTATE_SET.has(category) : MOVABLE_SET.has(category);
}

export type FeedAuction = {
  id: string;
  /** BOE reference (e.g. "SUB-NH-2026-1646077"). Server projection (see
   *  `/api/auctions/recent` route, `FeedAuctionProjection.boeId`). Surfaced as
   *  the small secondary line on the card — never the headline. */
  boeId?: string | null;
  title: string;
  /**
   * Wave C1a (2026-06-07). Server-derived address-led title from the
   * carousel-mix endpoint — same body the detail page H1 renders
   * (`auctionDisplayTitle` in `lib/seo/display-title.ts`). Cards can
   * surface this as the headline ("Subasta de Vivienda en Calle Tollo, 19,
   * Ontur") without re-running the tipo/address fallback ladder per
   * component. Optional + nullable for older cached fetches; the resolver
   * UI falls back to the existing `prettifyAuctionType` path when absent.
   */
  displayTitle?: string | null;
  category: string;
  province: string | null;
  municipality: string | null;
  status: string;
  auctionType: string | null;
  /** BOE bien-heading type ("Trastero", "Garaje", …). Populated by the
   *  doc-archive scraper backfill — most active rows are still null today,
   *  so the card falls back to `category`. Drives the type headline. */
  propertyType: string | null;
  currentBid: number | null;
  appraisalValue: number | null;
  /**
   * Valor subasta — DISTINCT from `appraisalValue` (Tasación) since Ghost's
   * 2026-06-04 split (commit `443a864`). Projected by the carousel-mix
   * endpoint (Forge `c921b0c`). Honest-NULL — the carousel card renders the
   * "Valor subasta" line only when this field is non-null and > 0; otherwise
   * the line is omitted entirely.
   */
  valorSubasta?: number | null;
  minimumBid: number | null;
  depositAmount: number | null;
  claimedAmount: number | null;
  endsAt: string | null;
  endDateTime: string | null;
  /** Official start date ("Fecha de inicio"). Server-projected ISO string;
   *  null until the doc-archive scraper backfill populates it. */
  opensAt?: string | null;
  /** Suspended-scraper "fecha prevista de reanudación" (Wave52). Drives the
   *  SUSPENDIDA card date line. Null on every non-SUSPENDIDA row. */
  resumeAt?: string | null;
  lotNumber: string | null;
  imageUrl: string | null;
  /**
   * Wave B0 (2026-06-07) — authoritative "this URL is the resolver-served
   * real photo" flag from `/api/auctions/carousel-mix`. Drives the rung-1
   * choice inside `resolveCardImage`. Optional / nullable: pre-fix carousel
   * payloads (older cached fetches) won't carry it, and the resolver falls
   * back to URL-prefix inference in that case.
   */
  hasImage?: boolean | null;
  boeLink: string | null;
  latitude: number | null;
  longitude: number | null;
  // Detail-modal extras when the server projects them (recent route adds
  // these in the same shape /api/auctions does — null-safe everywhere).
  address?: string | null;
  pujaStatus?: 'CON_PUJA' | 'SIN_PUJA' | null;
  currentBidAmount?: number | null;
  occupancy?: 'OCUPADO' | 'NO_OCUPADO' | 'NO_CONSTA' | null;
  /** True when the auction has at least one AuctionDocument row. Drives a
   *  compact "documentos" indicator on the carousel card. */
  hasDocuments?: boolean | null;
  /** Wave E2 (2026-06-07) — vehicle make/model/year. Server-projected by
   *  /api/auctions/carousel-mix + /api/auctions/recent. Null on non-VEHICLE
   *  rows and on VEHICLE rows pre-backfill. When both make+model are present
   *  on a vehicle row the card headline upgrades from "Turismo en Murcia" to
   *  "Turismo - SEAT León en Murcia" via `auctionCardTitle`. */
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  vehicleYear?: number | null;
};

type FeedItem = {
  id: string;
  kind: "status" | "bid" | "auction";
  at: string;
  auctionId: string;
  auction: FeedAuction;
};

const POLL_MS = 60_000;
/**
 * Frontend-canonical status keys the carousel-mix endpoint can return.
 * The server is the authoritative selector (50/30/20 ratio of celebrandose
 * / proxima-apertura / suspendida), so this set is belt-and-suspenders only:
 * it prevents a stray unexpected status (e.g. concluida-portal) from
 * sneaking into the marquee if the route ever widens its bucket selection.
 * The client MUST NOT re-strip `suspendida` — that bucket is part of the mix.
 */
const CAROUSEL_STATUSES = new Set([
  "celebrandose",
  "proxima-apertura",
  "suspendida",
]);

/**
 * Marquee pixels-per-second. Slow enough to read a card as it passes (a
 * 260px card takes ~13s to cross at 22 px/s). Drives the rAF loop's per-
 * frame translate delta.
 */
const MARQUEE_PX_PER_SEC = 22;

/** Drag threshold (px). Movement below this counts as a click — preserves
 *  the card's `onCardClick` for a tap that didn't intend to scrub. */
const DRAG_THRESHOLD_PX = 5;

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

// (Wave C1b) `isBoeRefLike` was used to decide whether to surface the BOE
// ref label on the card. The ref label has been removed from the carousel
// card (teaser-only); the helper is dropped along with it.

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

  /** Header text — defaults to "Últimas actualizaciones" for backwards
   *  compatibility. The home page passes "Últimos inmuebles" / "Últimos
   *  vehículos" via this prop. */
  heading?: string;

  /** Compact card mode — shrinks card width + image + typography by ~25 %
   *  so two stacked rows fit comfortably on the home page. */
  compact?: boolean;

  /** Client-side category-group predicate. When set, fetched rows whose
   *  `category` is not in the group are dropped before render. We also
   *  bump the fetch limit upstream (×2) so the post-filter row stays
   *  populated. */
  categoryGroup?: CategoryGroup | null;
};

export function ForexCarousel({
  limit = 30,
  seeAllHref = "/subastas?when=activas",
  className,
  category = null,
  province = null,
  // `when` is accepted for API stability with HomeCarouselSection (chip
  // value still flows through the section), but the carousel-mix endpoint
  // does not honour it — the mix is its own ratio-driven slice. Renamed to
  // _when so lint doesn't flag it as unused.
  when: _when = null,
  onCardClick,
  pause = false,
  onItemsCountChange,
  heading = "Últimas actualizaciones",
  compact = false,
  categoryGroup = null,
}: ForexCarouselProps) {
  // Unique id so two carousels on the same page (home: properties + vehicles)
  // don't collide on `aria-labelledby`.
  const headingId = React.useId();
  const [items, setItems] = React.useState<FeedAuction[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [hovered, setHovered] = React.useState(false);
  const [reducedMotion, setReducedMotion] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
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
      // /api/auctions/carousel-mix returns the 50/30/20 composed feed
      // (active / próxima-apertura / suspendida, interleaved). Wave C1a
      // (2026-06-07): the endpoint now also accepts `categoryGroup`
      // (`movable` | `real_estate`) so the per-bucket cap is filled with
      // the group's rows server-side — no more over-fetch + client-side
      // post-filter (the old path biased properties-dominant and shipped a
      // ~4-card vehicle row on a 30-card limit).
      if (category) params.set("category", category);
      if (province) params.set("province", province);
      if (categoryGroup) params.set("categoryGroup", categoryGroup);
      const res = await apiFetch(`/api/auctions/carousel-mix?${params.toString()}`);
      if (!res.ok) return;
      const body = await res.json();
      if (body?.success && Array.isArray(body.data)) {
        // The server is authoritative for both status mix and category
        // group. `CAROUSEL_STATUSES` + `matchesCategoryGroup` remain as
        // a defence-in-depth safety net (catches a hypothetical stray
        // status / category leak) but they should be no-ops on every
        // happy-path response after the route change.
        let rows = (body.data as FeedItem[])
          .map((it) => it.auction)
          .filter((a) => CAROUSEL_STATUSES.has(a.status));
        if (categoryGroup) {
          rows = rows.filter((a) => matchesCategoryGroup(a.category, categoryGroup));
        }
        // Dedupe by id keeping first occurrence (most recent activity).
        const seen = new Set<string>();
        const deduped: FeedAuction[] = [];
        for (const a of rows) {
          if (seen.has(a.id)) continue;
          seen.add(a.id);
          deduped.push(a);
        }
        // Cap at the caller-requested limit after filtering so the visible
        // row size matches expectations.
        setItems(deduped.slice(0, limit));
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
    // `when` intentionally NOT in deps: the carousel-mix endpoint doesn't
    // accept a `when` bucket (it composes its own ratio across active /
    // próxima / suspendida), so changing the chip shouldn't refetch on
    // that axis. Kept on the prop signature for API stability with
    // HomeCarouselSection.
  }, [limit, category, province, categoryGroup]);

  React.useEffect(() => {
    setLoading(true);
    load();
    const id = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  React.useEffect(() => {
    onItemsCountChange?.(items.length);
  }, [items.length, onItemsCountChange]);

  // Endless-loop guardrail (Wave C1b, 2026-06-07). When the source set is
  // small (<6 cards), TWO-copy duplication leaves a visible cadence — the
  // same card returns ~every 13s/card. Rendering a THIRD copy smooths the
  // visual rhythm without changing the wrap maths (the modulo loop still
  // wraps after ONE copy of the list — the extra copy just delays the
  // visual "I've seen this before" moment). The track always has at least
  // 2 copies so the wrap point is always backed by visible cards.
  const trackCopies = items.length > 0 && items.length < 6 ? 3 : 2;

  // Measure the unduplicated track width so the rAF loop knows where to wrap.
  // ResizeObserver re-fires on layout shifts and when the chip filter mutates
  // the row set.
  React.useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () => {
      // The track contains `trackCopies` copies of the list. Divide to get
      // one copy. The rAF loop wraps every `trackWidth` px so a single copy
      // worth of width is what we want here.
      const w = el.scrollWidth / trackCopies;
      if (Number.isFinite(w) && w > 0) setTrackWidth(w);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [items.length, trackCopies]);

  // Manual scroll (used in reduced-motion fallback). Falls back gracefully if
  // the scroller ref isn't mounted yet.
  const scrollBy = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const step = Math.max(el.clientWidth * 0.7, 320);
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  // ─── rAF translate loop + drag scrub ─────────────────────────────────────
  // Drift is auto unless: reduced-motion, external pause, hover, dragging,
  // or empty. The same `offsetRef` is the source of truth: rAF advances it
  // each frame, drag adds to it directly. On release the loop continues from
  // wherever the drag left it — no snap-back.
  const offsetRef = React.useRef(0);
  const rafRef = React.useRef<number | null>(null);
  const lastTickMsRef = React.useRef<number | null>(null);
  const draggingRef = React.useRef(false);
  // We also keep a ref mirror of hover/pause/empty so the rAF callback never
  // re-reads stale closure state from the previous frame.
  const pausedRef = React.useRef(false);

  // Apply the current offset to the DOM (transform). One write per frame —
  // `will-change: transform` already promotes it to the compositor.
  const applyOffset = React.useCallback((px: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.style.transform = `translate3d(${px}px, 0, 0)`;
  }, []);

  // Wrap the offset into [-trackWidth, 0]. Modulo keeps it stable as the
  // duplicate-track makes both ends look identical at the wrap point.
  const wrapOffset = React.useCallback((px: number, width: number): number => {
    if (width <= 0) return px;
    // Force into a single period of length `width`. Result is in (-width, 0].
    let next = px % width;
    if (next > 0) next -= width;
    return next;
  }, []);

  // Decide whether motion should be running.
  const useStaticScroller = reducedMotion;
  const isEmpty = items.length === 0;
  const baseShouldPause =
    pause || hovered || isEmpty || trackWidth == null || trackWidth <= 0;
  pausedRef.current = baseShouldPause;

  React.useEffect(() => {
    if (useStaticScroller) return; // reduced-motion → no rAF loop
    if (isEmpty || trackWidth == null || trackWidth <= 0) return;

    const tick = (now: number) => {
      const last = lastTickMsRef.current ?? now;
      const dt = Math.max(0, now - last); // ms
      lastTickMsRef.current = now;

      // Auto-drift only when neither paused nor actively being dragged.
      if (!pausedRef.current && !draggingRef.current) {
        const delta = -(MARQUEE_PX_PER_SEC * dt) / 1000;
        const next = wrapOffset(offsetRef.current + delta, trackWidth);
        offsetRef.current = next;
        applyOffset(next);
      }
      rafRef.current = window.requestAnimationFrame(tick);
    };

    // Ensure the visible position matches state on (re)mount.
    applyOffset(offsetRef.current);
    lastTickMsRef.current = null;
    rafRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [useStaticScroller, isEmpty, trackWidth, applyOffset, wrapOffset]);

  // Reset the offset when the item set fully turns over (e.g. a filter chip
  // changes the underlying card list). Otherwise a long offset from the old
  // set would translate the new (likely narrower) set off-screen.
  React.useEffect(() => {
    offsetRef.current = 0;
    applyOffset(0);
  }, [items, applyOffset]);

  // ─── Drag handlers (pointer events — covers mouse + touch + pen) ────────
  // We track a `startX` + `startOffset` + a `crossedThreshold` flag. Below
  // the threshold the gesture is still ambiguous (might be a click). Once
  // crossed, we pause auto-drift, capture the pointer, and stream the
  // delta straight to the transform.
  const dragStateRef = React.useRef<{
    pointerId: number;
    startX: number;
    startOffset: number;
    crossedThreshold: boolean;
  } | null>(null);

  const onPointerDown = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (useStaticScroller) return;
      // Only react to the primary button (left mouse / single touch / pen tip).
      if (e.pointerType === "mouse" && e.button !== 0) return;
      dragStateRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startOffset: offsetRef.current,
        crossedThreshold: false,
      };
    },
    [useStaticScroller],
  );

  const onPointerMove = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragStateRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      const dx = e.clientX - drag.startX;
      if (!drag.crossedThreshold) {
        if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
        // Cross the threshold: lock in drag mode.
        drag.crossedThreshold = true;
        draggingRef.current = true;
        setDragging(true);
        // Capture so we keep receiving move/up events even if the pointer
        // leaves the element bounds while dragging.
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* setPointerCapture can throw if the pointer is already released */
        }
      }
      const tw = trackWidth ?? 0;
      const next = wrapOffset(drag.startOffset + dx, tw);
      offsetRef.current = next;
      applyOffset(next);
      // Once dragging, we own the gesture — stop the browser from also
      // interpreting it as text selection.
      e.preventDefault();
    },
    [applyOffset, trackWidth, wrapOffset],
  );

  const endDrag = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragStateRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      dragStateRef.current = null;
      if (drag.crossedThreshold) {
        // Release pointer capture; the rAF auto-drift takes over from the
        // current offset on the next frame.
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        draggingRef.current = false;
        setDragging(false);
        // Reset the timer so the next frame doesn't dump an accumulated dt
        // from however long the drag took.
        lastTickMsRef.current = null;
      }
    },
    [],
  );

  // A genuine click (no threshold crossed) should NOT propagate as a drag —
  // and a drag that DID cross the threshold should swallow the click so the
  // card doesn't open a modal we never meant to open. We use the pointerup's
  // `crossedThreshold` flag, but it's reset by endDrag — so capture it first
  // with a click-capture handler on the card surface (see ExpandedCard).

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "rounded-xl border border-[var(--color-hairline)] bg-[var(--color-surface)]",
        "shadow-[var(--shadow-card)]",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3 px-4 py-3 hairline-b">
        <div className="min-w-0 flex items-baseline gap-3">
          <h2
            id={headingId}
            className="font-display text-base md:text-lg text-[var(--color-ink-primary)] whitespace-nowrap"
          >
            {heading}
          </h2>
          {/* Per Dennis (2026-06-03): removed the "{items.length} activas"
              indicator. `items.length` is the carousel's fetch cap (30), not
              the real active total (~541), so surfacing it here read as a
              site-wide count and was misleading. The pulse-dot stays implicit
              in the live cards themselves. */}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Arrow buttons only useful in the reduced-motion fallback — hide
              them when the marquee is auto-drifting (they would scroll only
              the visible window of an `overflow-hidden` track, surprising the
              user). */}
          {useStaticScroller && (
            <div className="hidden sm:inline-flex rounded-md border border-[var(--color-hairline)] overflow-hidden">
              <button
                type="button"
                onClick={() => scrollBy(-1)}
                aria-label="Anterior"
                className="h-8 w-8 inline-flex items-center justify-center text-[var(--color-ink-secondary)] hover:bg-[var(--color-surface-muted)] focus-visible:outline-none focus-visible:bg-[var(--color-surface-muted)] cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => scrollBy(1)}
                aria-label="Siguiente"
                className="h-8 w-8 inline-flex items-center justify-center text-[var(--color-ink-secondary)] hover:bg-[var(--color-surface-muted)] focus-visible:outline-none focus-visible:bg-[var(--color-surface-muted)] cursor-pointer"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}

          <Link
            href={seeAllHref}
            className={cn(
              "inline-flex h-8 items-center gap-1 rounded-md border border-[var(--color-ink-primary)] bg-[var(--color-surface)] px-3 text-xs font-semibold cursor-pointer",
              "text-[var(--color-ink-primary)]",
              "hover:bg-[var(--color-surface-muted)] transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-action)]/40",
            )}
          >
            Ver todas
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </header>

      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--color-ink-tertiary)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Cargando subastas activas…
        </div>
      ) : items.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-[var(--color-ink-tertiary)]">
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
            "[&::-webkit-scrollbar-thumb]:bg-[var(--color-hairline)] [&::-webkit-scrollbar-thumb]:rounded-full",
          )}
        >
          {items.map((a) => (
            <ExpandedCard
              key={a.id}
              auction={a}
              onCardClick={onCardClick}
              compact={compact}
              categoryGroup={categoryGroup}
            />
          ))}
        </div>
      ) : (
        /* Marquee: a duplicated track translated by the rAF loop. The drag
           handlers live on the OUTER overflow-hidden box so the user can
           grab anywhere in the strip; pointer-capture stops escape on fast
           movement.

           touch-action: pan-y lets vertical page scroll pass through on
           touch — we only own horizontal drag, never block the user's
           scroll-down gesture. */
        <div
          className={cn(
            "relative overflow-hidden select-none",
            // Subtle horizontal fade so cards don't pop in/out at hard edges.
            "[mask-image:linear-gradient(to_right,transparent,black_24px,black_calc(100%-24px),transparent)]",
            "[-webkit-mask-image:linear-gradient(to_right,transparent,black_24px,black_calc(100%-24px),transparent)]",
            // Cursor affordance: open hand at rest, closed when scrubbing.
            dragging ? "cursor-grabbing" : "cursor-grab",
          )}
          style={{ touchAction: "pan-y" }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocusCapture={() => setHovered(true)}
          onBlurCapture={(e) => {
            // Only release pause when focus leaves the marquee entirely.
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              setHovered(false);
            }
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div
            ref={trackRef}
            role="region"
            aria-label="Carrusel de subastas activas"
            className="flex gap-2 px-3 py-3 w-max will-change-transform"
            style={{ transform: "translate3d(0,0,0)" }}
          >
            {/* First copy. */}
            {items.map((a) => (
              <ExpandedCard
                key={`a-${a.id}`}
                auction={a}
                onCardClick={onCardClick}
                isDragging={dragging}
                compact={compact}
                categoryGroup={categoryGroup}
              />
            ))}
            {/* Second copy — `duplicate` flag makes each card aria-hidden and
                untabbable so screen readers + keyboard nav only see the
                original set. Cards stay direct flex children of the track so
                the modulo-wrapped translate aligns the second copy seamlessly. */}
            {items.map((a) => (
              <ExpandedCard
                key={`b-${a.id}`}
                auction={a}
                onCardClick={onCardClick}
                duplicate
                isDragging={dragging}
                compact={compact}
                categoryGroup={categoryGroup}
              />
            ))}
            {/* Third copy (small-set guardrail) — only rendered when the
                source list is <6 cards. The rAF loop still wraps after ONE
                copy worth of width; the extra copy just makes the loop point
                visually quieter on a thin vehicle row. */}
            {trackCopies === 3 && items.map((a) => (
              <ExpandedCard
                key={`c-${a.id}`}
                auction={a}
                onCardClick={onCardClick}
                duplicate
                isDragging={dragging}
                compact={compact}
                categoryGroup={categoryGroup}
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
  isDragging = false,
  compact = false,
  categoryGroup = null,
}: {
  auction: FeedAuction;
  onCardClick?: (auction: FeedAuction) => void;
  duplicate?: boolean;
  /** True while the marquee is being scrubbed — suppress the card click so
   *  a drag-release doesn't accidentally open the modal. */
  isDragging?: boolean;
  /** Compact mode: ~25 % smaller card width + tighter typography for the
   *  home page two-row layout. */
  compact?: boolean;
  /** Category-group hint — drives the address-led title path. `'movable'`
   *  cards use "{Tipo} en {town}" (vehicle "address" from BOE is a depot
   *  code, not user-meaningful); `'real_estate'` cards use the full street
   *  address + municipality phrasing. Null → infer from category. */
  categoryGroup?: CategoryGroup | null;
}) {
  // Status-branched date intent (Wave52, Pixel 2026-06-04). The carousel was
  // the surface in Dennis's screenshot showing "Termina en 6d 13h" + a
  // floating "6 d" badge on a PROXIMA card — both fake (pre-auctions have no
  // real endsAt; the column carries a placeholder). The shared helper picks
  // the label intent off status; we then gate every endsAt-derived value
  // (countdown, days badge, end-date trailer) to ACTIVE only.
  const dateLabel = statusDateLabel(auction.status);
  const isActiveLabel = dateLabel === "Termina";
  const endsAt = isActiveLabel ? (auction.endsAt ?? auction.endDateTime) : null;
  const ended = isActiveLabel && isEffectivelyEnded(endsAt);
  const dl = isActiveLabel ? daysLeft(endsAt) : null;
  const urgent = isActiveLabel && !ended && dl != null && dl <= 1;

  // Headline (Wave C3, 2026-06-07):
  //   - PROPERTY: short-street mode — "{Tipo} – {Calle X}" via the C2
  //     helper. Falls back to "{Tipo} en {town}" when the street parse
  //     fails. No full address, no muni suffix on the short path.
  //   - VEHICLE: "{Make} {Model}" only (e.g. "SEAT León") when make+model
  //     are present. Otherwise the standard "{Tipo} en {town}" fallback.
  //     The año subtitle appears as its own line below the headline.
  const typeOnly = prettifyAuctionType(
    auction.propertyType ?? auction.category ?? null,
  );
  // Resolve the category group locally so the short-street + vehicle-title
  // branches behave correctly even when `categoryGroup` prop is unset.
  const inferredGroup: CategoryGroup | null =
    categoryGroup ??
    (auction.category && MOVABLE_SET.has(auction.category)
      ? "movable"
      : auction.category
      ? "real_estate"
      : null);
  const isVehicleRow = inferredGroup === "movable";
  const baseHeadline = auctionCardTitle({
    address: auction.address,
    propertyType: auction.propertyType,
    auctionType: auction.auctionType,
    category: auction.category,
    municipality: auction.municipality,
    province: auction.province,
    title: auction.title,
    categoryGroup: inferredGroup,
    vehicleMake: auction.vehicleMake,
    vehicleModel: auction.vehicleModel,
    vehicleYear: auction.vehicleYear,
    useFullStreet: !isVehicleRow,
  });
  const vehicleMakeModel =
    isVehicleRow && auction.vehicleMake && auction.vehicleModel
      ? `${titleCase(auction.vehicleMake)} ${titleCase(auction.vehicleModel)}`
      : null;
  const cardHeadline = vehicleMakeModel ?? baseHeadline;
  // Compact "Termina en Nd Nh" string — short variant for the ACTIVE card
  // footer only. NEVER computed for PROXIMA / SUSPENDIDA (those rows render
  // their own status-branched date line below). Distinct from the floating
  // top-right badge which shows just days.
  const terminaEn = isActiveLabel ? formatEndsInCompact(endsAt) : null;
  const endDateLabel = isActiveLabel ? formatDateMed(endsAt) : "—";
  // Pre-parsed PROXIMA / SUSPENDIDA date strings used below.
  const opensLabel = (() => {
    if (!auction.opensAt) return null;
    const d = new Date(auction.opensAt);
    return Number.isNaN(d.getTime())
      ? null
      : d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  })();
  const resumeLabel = (() => {
    if (!auction.resumeAt) return null;
    const d = new Date(auction.resumeAt);
    return Number.isNaN(d.getTime())
      ? null
      : d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  })();

  // Wave C1b (2026-06-07): the Ref. BOE + Docs pill have been removed from
  // the carousel card (teaser cards = image + quick info only — those details
  // live on the detail page). The previous `refLabel` derivation has been
  // dropped along with the JSX block; `boeId` / `isBoeRefLike` are no longer
  // surfaced here.

  const muni = cleanLoc(auction.municipality);
  const prov = cleanLoc(auction.province);
  // Town==Province dedupe (2026-06-19): when municipality and province are the
  // same place (e.g. Valencia/Valencia), show the town ONCE — never the
  // redundant "Valencia · Valencia".
  const where = (() => {
    const m = muni ? titleCase(muni) : null;
    const p = prov ? capitalize(prov) : null;
    if (m && p && m.toLowerCase() === p.toLowerCase()) return m;
    return [m, p].filter(Boolean).join(" · ");
  })();
  // Three-value display (Dennis-locked 2026-06-04, brief
  // `three-values-card-display`): Tasación + Valor subasta + Cantidad
  // reclamada are now distinct columns after Ghost's 2026-06-04 split. The
  // carousel card surfaces all three with correct labels — Tasación reads
  // `appraisalValue`, Valor subasta reads the new `valorSubasta` field
  // (NOT the same as Tasación any longer). Honest-NULL — every line is
  // omitted when its field is null/≤0. Depósito remains a last-resort
  // fallback when none of the three primary values exist.
  const tasacion = pickPrice(auction.appraisalValue);
  const valorSubasta = pickPrice(auction.valorSubasta);
  const reclamada = pickPrice(auction.claimedAmount);
  const deposit =
    tasacion == null && valorSubasta == null && reclamada == null
      ? pickPrice(auction.depositAmount)
      : null;
  // Build the labelled price-line list — used by the bottom price grid.
  const priceLines: Array<{ key: string; label: string; amount: number }> = [];
  if (tasacion != null) priceLines.push({ key: 'tasacion', label: 'Tasación', amount: tasacion });
  if (valorSubasta != null) priceLines.push({ key: 'valorSubasta', label: 'Valor subasta', amount: valorSubasta });
  if (reclamada != null) priceLines.push({ key: 'claimedAmount', label: 'Cantidad reclamada', amount: reclamada });
  const [imgFailed, setImgFailed] = React.useState(false);
  // Image resolver still wants a "title" for the placeholder alt text; pass
  // the type headline (always populated and human-readable) rather than the
  // raw upstream title (which might be "Unknown" or a SUB- ref).
  const resolved = resolveCardImage({
    imageUrl: auction.imageUrl,
    // Wave B0 (2026-06-07): pass the server's authoritative `hasImage` flag
    // so rung-1 fires for resolver-served real photos. Before the
    // carousel-mix route projected this flag, the rung-1 check fell through
    // and every card landed on the rung-3 branded placeholder.
    hasImage: auction.hasImage,
    latitude: auction.latitude,
    longitude: auction.longitude,
    category: auction.category,
    title: typeOnly,
    size: "thumbnail",
  });
  // On error (most often the OSM map tile being throttled), use the shared
  // rule-respecting fallback: vehicle category SVG ONLY for vehicles; neutral
  // map placeholder for properties and everything else. The category cartoon
  // must never appear for a property row.
  const imageSrc =
    imgFailed && resolved.rung !== "placeholder"
      ? fallbackImageFor(resolved, auction.category)
      : resolved.src;
  const showMapPin = resolved.isMap && !imgFailed;
  const effectiveStatus = ended ? "concluida-portal" : auction.status;
  const noPriceData =
    tasacion == null && valorSubasta == null && reclamada == null && deposit == null;
  const isVariosLotes = isVariosLotesTitle(auction.title);

  // Card width: full 260px in default mode; ~25 % smaller (195px) in compact
  // mode for the home page properties + vehicles two-row layout.
  const cardClass = cn(
    "snap-start shrink-0 rounded-lg border bg-[var(--color-surface)] overflow-hidden",
    compact ? "w-[195px]" : "w-[260px]",
    "flex flex-col transition-colors text-left cursor-pointer",
    "hover:border-[var(--color-brand-soft)]/50 hover:shadow-[var(--shadow-card)]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-soft)]/40",
    urgent ? "border-[var(--color-warn-critical)]/60" : "border-[var(--color-hairline)]",
  );

  const innerBody = (
    <>
      {/* Image aspect trimmed from 16:9 → 16:10 (Wave C1b, 2026-06-07).
          Combined with the tighter content padding below this lands the
          rendered card at ~90% of the previous compact height — the −10%
          Dennis asked for, without shrinking type into illegibility. */}
      <div className="relative aspect-[16/10] bg-[var(--color-surface-muted)]">
        <Image
          src={imageSrc}
          alt={resolved.alt}
          fill
          sizes={compact ? "195px" : "260px"}
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
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-warn-critical)] text-white shadow-[0_2px_6px_rgba(0,0,0,0.35)] ring-2 ring-white">
              <MapPin className="h-3.5 w-3.5" strokeWidth={2.5} />
            </span>
          </span>
        )}
        {showMapPin && (
          <span
            aria-hidden="true"
            className="absolute bottom-1 right-1 inline-flex items-center gap-1 rounded-full border border-[var(--color-hairline)] bg-[var(--color-surface)]/90 px-1.5 py-0.5 text-[9px] font-medium text-[var(--color-ink-secondary)]"
          >
            <MapPin className="h-2.5 w-2.5" />
            Ubicación
          </span>
        )}
        {/* Status + TYPE banner column (top-left). Vertical stack so the
            type chip sits directly under the status badge — Wave C3,
            2026-06-07. */}
        <span className="absolute top-1.5 left-1.5 flex flex-col items-start gap-1">
          <StatusBadge status={effectiveStatus} size="sm" />
          <AuctionCardTypeBanner item={auction} size="sm" />
        </span>
        {/* Days-left badge — ACTIVE only (Wave52, Pixel 2026-06-04). On a
            PROXIMA / SUSPENDIDA / terminal row this badge is suppressed
            entirely: rendering "6 d" for a pre-auction (which has no real
            end date) was the exact bug Dennis screenshotted. The status
            badge on the left already labels Próxima / Suspendida; the days
            count belongs to the live "Termina en …" reading. */}
        {isActiveLabel && (
          <span
            className={cn(
              "absolute top-1.5 right-1.5 tnum rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
              "text-[var(--color-ink-primary)] border",
              urgent
                ? "bg-[var(--color-warn-critical-soft)] border-[var(--color-warn-critical)]/40"
                : "bg-[var(--color-surface)] border-[var(--color-hairline)]",
            )}
          >
            {ended ? "Finalizada" : formatDaysLeft(endsAt)}
          </span>
        )}
      </div>

      {/* Wave C3b (2026-06-07): info area halved per Dennis. Padding tightened
          (p-2 → px-2 py-1.5), gap (gap-1 → gap-0.5), vehicle year + location
          folded onto a single caption row, price grid replaced with inline
          rows. The whole block now lands at ~50% of the previous height. */}
      <div className="px-2 py-1.5 flex flex-col gap-0.5 min-w-0">
        {/* Headline = "{Tipo} en {dirección}" / "{Tipo} en {town}" (address-
            led, Wave C1b 2026-06-07). The vehicle path uses municipality only
            (BOE depot codes aren't user-meaningful). Never the BOE ref. We
            allow 2 lines now since the address can wrap on a 195px card —
            line-clamp-2 keeps card height stable; truncated tail is shown on
            hover via the native title attribute. */}
        <div
          className="text-[12.5px] font-semibold text-[var(--color-ink-primary)] line-clamp-2 leading-snug"
          title={cardHeadline}
        >
          {cardHeadline}
        </div>
        {/* Vehicle año + location collapse onto one caption row so the
            post-title meta is a single short line. */}
        {((isVehicleRow && auction.vehicleYear) || where) && (
          <div className="text-[10px] text-[var(--color-ink-tertiary)] tnum truncate">
            {isVehicleRow && auction.vehicleYear ? auction.vehicleYear : null}
            {isVehicleRow && auction.vehicleYear && where ? " · " : null}
            {where}
          </div>
        )}
        {/* Status-branched date line (Wave52, Pixel 2026-06-04).
            ACTIVE   → "Inicio <opensAt> · Termina en <Nd Nh> · <endDate>"
                       (the existing Bloomberg-style row).
            PROXIMA  → "Próxima apertura · <opensAt>" or "· Fecha por
                       confirmar". NEVER "Termina en …" — pre-auctions have
                       no real end date and we must not surface a placeholder.
            SUSPEND  → "Fecha prevista de reanudación · <resumeAt>" or
                       "· Fecha por confirmar".
            Terminal → render nothing (the StatusBadge already says
                       Finalizada / Concluida; no live date is meaningful). */}
        {(() => {
          // Terminal / ended → suppress the whole date line.
          if (ended || dateLabel == null) return null;
          // PROXIMA: single "Próxima apertura …" line, NO countdown, NO end.
          if (dateLabel === "Próxima apertura") {
            return (
              <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0 text-[10px] text-[var(--color-ink-secondary)]">
                <span className="tnum">
                  <span className="text-[var(--color-ink-tertiary)]">Próxima apertura</span>
                  {opensLabel ? (
                    <> · <span className="text-[var(--color-ink-primary)]">{opensLabel}</span></>
                  ) : (
                    <> · <span className="text-[var(--color-ink-quiet)]">Fecha por confirmar</span></>
                  )}
                </span>
              </div>
            );
          }
          // SUSPENDIDA: single "Reanudación …" line.
          if (dateLabel === "Fecha prevista de reanudación") {
            return (
              <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0 text-[10px] text-[var(--color-ink-secondary)]">
                <span className="tnum">
                  <span className="text-[var(--color-ink-tertiary)]">Reanudación</span>
                  {resumeLabel ? (
                    <> · <span className="text-[var(--color-ink-primary)]">{resumeLabel}</span></>
                  ) : (
                    <> · <span className="text-[var(--color-ink-quiet)]">Fecha por confirmar</span></>
                  )}
                </span>
              </div>
            );
          }
          // ACTIVE — preserve the existing three-piece row.
          if (!opensLabel && !terminaEn && endDateLabel === "—") return null;
          const parts: React.ReactNode[] = [];
          if (opensLabel) {
            parts.push(
              <span key="opens" className="tnum">
                <span className="text-[var(--color-ink-tertiary)]">Inicio </span>
                <span className="text-[var(--color-ink-primary)]">{opensLabel}</span>
              </span>,
            );
          }
          if (terminaEn) {
            parts.push(
              <span key="ends" className="tnum">
                <span className="text-[var(--color-ink-tertiary)]">Termina en </span>
                <span className="font-semibold text-[var(--color-ink-primary)]">{terminaEn}</span>
              </span>,
            );
          }
          if (endDateLabel !== "—") {
            parts.push(
              <span key="enddate" className="tnum text-[var(--color-ink-tertiary)]">
                {endDateLabel}
              </span>,
            );
          }
          return (
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[10.5px] text-[var(--color-ink-secondary)]">
              {parts.map((p, i) => (
                <React.Fragment key={i}>
                  {i > 0 && (
                    <span className="text-[var(--color-ink-quiet)]" aria-hidden="true">·</span>
                  )}
                  {p}
                </React.Fragment>
              ))}
            </div>
          );
        })()}
        {/* Wave C3b (2026-06-07): inline price rows replace the 2-col grid
            so the price block is ~50% the previous height. Each present
            value reads as a single short row: tiny label left, number right.
            First line is the prominent number, the rest muted secondary. */}
        <div className="pt-1 border-t border-[var(--color-hairline)] flex flex-col gap-0.5">
          {noPriceData && (
            <div className="flex items-baseline justify-between gap-2 min-w-0">
              <span className="text-[9px] uppercase tracking-wide text-[var(--color-ink-tertiary)] truncate">
                {isVariosLotes ? "Varios lotes" : "Precio"}
              </span>
              <span className="text-[11px] font-medium text-[var(--color-ink-secondary)] shrink-0">
                No disponible
              </span>
            </div>
          )}
          {priceLines.map((line, i) => {
            const isHeadline = i === 0;
            return (
              <div key={line.key} className="flex items-baseline justify-between gap-2 min-w-0">
                <span className="text-[9px] uppercase tracking-wide text-[var(--color-ink-tertiary)] truncate">
                  {line.label}
                </span>
                <span
                  className={cn(
                    "tnum font-semibold shrink-0",
                    isHeadline
                      ? "text-[13.5px] text-[var(--color-ink-primary)]"
                      : "text-[11.5px] text-[var(--color-ink-secondary)]",
                  )}
                >
                  {formatPrice(line.amount)}
                </span>
              </div>
            );
          })}
          {deposit != null && (
            <div className="flex items-baseline justify-between gap-2 min-w-0">
              <span className="text-[9px] uppercase tracking-wide text-[var(--color-ink-tertiary)]">
                Depósito
              </span>
              <span className="tnum text-[12.5px] font-semibold text-[var(--color-ink-primary)] shrink-0">
                {formatPrice(deposit)}
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );

  // Click-suppression while dragging: a pointer-up after a real drag still
  // fires `click` on the underlying button. We swallow it in capture phase
  // when `isDragging` is true at click time, so the modal never opens by
  // accident at the end of a scrub.
  const handleClickCapture = (e: React.MouseEvent) => {
    if (isDragging) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  // Click handler: when wired (Item G), the card becomes a `<button>` that
  // opens the detail modal in the parent. When not wired, it falls back to a
  // `<Link>` to the canonical auction page (G-not-shipped fallback).
  if (onCardClick) {
    return (
      <button
        type="button"
        onClick={() => onCardClick(auction)}
        onClickCapture={handleClickCapture}
        // Duplicate-track copies are presentational — hide from a11y tree and
        // the tab order, so the user only ever focuses one copy of a card.
        aria-hidden={duplicate || undefined}
        tabIndex={duplicate ? -1 : 0}
        className={cardClass}
        title={cardHeadline}
        aria-label={`Ver detalles: ${cardHeadline}`}
      >
        {innerBody}
      </button>
    );
  }

  // Canonical detail URL — the auction-detail page lives at
  // /subastas/subasta/{slug}. buildAuctionSlug composes
  // `{tipo}-{provincia}-{municipio}-{id}`. We always route here from the
  // home carousel (Dennis 2026-06-07): the popup modal path is OFF, cards
  // become plain links so clicks land on the SEO + funnel destination.
  const detailHref = `/subastas/subasta/${buildAuctionSlug({
    id: auction.id,
    auctionType: auction.auctionType,
    province: auction.province,
    municipality: auction.municipality,
  })}`;

  return (
    <Link
      href={detailHref}
      onClickCapture={handleClickCapture}
      aria-hidden={duplicate || undefined}
      tabIndex={duplicate ? -1 : 0}
      className={cardClass}
      title={cardHeadline}
    >
      {innerBody}
    </Link>
  );
}

/**
 * Compact "Termina en …" body — distinct from `formatDaysLeft` which is a
 * single token for the top-right badge. Here we surface days + hours so the
 * user can read time-to-close at a glance:
 *   - >= 1 day  → "Nd Nh"
 *   -  < 1 day  → "Nh Nm"
 *   - finalised → null (caller hides the row)
 */
function formatEndsInCompact(target: string | Date | null | undefined): string | null {
  if (!target) return null;
  const ms = target instanceof Date ? target.getTime() : new Date(target).getTime();
  if (!Number.isFinite(ms)) return null;
  const diff = ms - Date.now();
  if (diff <= 0) return null;
  const totalMin = Math.floor(diff / 60_000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  if (days >= 1) return `${days}d ${hours}h`;
  if (hours >= 1) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
