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
import { ChevronLeft, ChevronRight, ArrowRight, Loader2, MapPin, FileText } from "lucide-react";
import { apiFetch } from "@/lib/api-path";
import { StatusBadge } from "./StatusBadge";
import { resolveCardImage, fallbackImageFor, isVariosLotesTitle } from "@/lib/resolve-card-image";
import { statusDateLabel } from "@/lib/auction-status";
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

export type FeedAuction = {
  id: string;
  /** BOE reference (e.g. "SUB-NH-2026-1646077"). Server projection (see
   *  `/api/auctions/recent` route, `FeedAuctionProjection.boeId`). Surfaced as
   *  the small secondary line on the card — never the headline. */
  boeId?: string | null;
  title: string;
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

/** True when `raw` looks like a BOE auction reference (SUB-…), not a real
 *  human title. Used to decide whether to hide the upstream `title` from the
 *  card — refs go in the small secondary line, never in the headline. */
function isBoeRefLike(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return /^SUB[-A-Z0-9]+/i.test(raw.trim());
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
  // `when` is accepted for API stability with HomeCarouselSection (chip
  // value still flows through the section), but the carousel-mix endpoint
  // does not honour it — the mix is its own ratio-driven slice. Renamed to
  // _when so lint doesn't flag it as unused.
  when: _when = null,
  onCardClick,
  pause = false,
  onItemsCountChange,
}: ForexCarouselProps) {
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
      // (active / próxima-apertura / suspendida, interleaved). It only
      // accepts `limit`, `province`, `category` — `when` and the old
      // recent-route knobs (`types`, `activeOnly`) are not used. The chip-
      // driven `when` bucket no longer applies here: the carousel-mix is
      // its own ratio-driven slice. Pixel keeps the `when` prop on the
      // component for API stability with HomeCarouselSection.
      if (category) params.set("category", category);
      if (province) params.set("province", province);
      const res = await apiFetch(`/api/auctions/carousel-mix?${params.toString()}`);
      if (!res.ok) return;
      const body = await res.json();
      if (body?.success && Array.isArray(body.data)) {
        // The server is authoritative — `CAROUSEL_STATUSES` is a safety net,
        // never a re-strip of the mix. Critically, `suspendida` MUST pass
        // through (it's part of the composed feed by design).
        const rows = (body.data as FeedItem[])
          .map((it) => it.auction)
          .filter((a) => CAROUSEL_STATUSES.has(a.status));
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
    // `when` intentionally NOT in deps: the carousel-mix endpoint doesn't
    // accept a `when` bucket (it composes its own ratio across active /
    // próxima / suspendida), so changing the chip shouldn't refetch on
    // that axis. Kept on the prop signature for API stability with
    // HomeCarouselSection.
  }, [limit, category, province]);

  React.useEffect(() => {
    setLoading(true);
    load();
    const id = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  React.useEffect(() => {
    onItemsCountChange?.(items.length);
  }, [items.length, onItemsCountChange]);

  // Measure the unduplicated track width so the rAF loop knows where to wrap.
  // ResizeObserver re-fires on layout shifts and when the chip filter mutates
  // the row set.
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
}: {
  auction: FeedAuction;
  onCardClick?: (auction: FeedAuction) => void;
  duplicate?: boolean;
  /** True while the marquee is being scrubbed — suppress the card click so
   *  a drag-release doesn't accidentally open the modal. */
  isDragging?: boolean;
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

  // Headline = auction TYPE (propertyType → category → generic).
  // The BOE ref (boeId, or the upstream title when it's a SUB-… ref) becomes
  // the small secondary line — never the headline.
  const typeHeadline = prettifyAuctionType(
    auction.propertyType ?? auction.category ?? null,
  );
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

  // Prefer the explicit boeId when projected; fall back to the upstream
  // `title` if it itself is a SUB- ref (legacy projection where boeId hasn't
  // made it to the client yet). Never surface a non-ref title here — the
  // headline already covers that.
  const refLabel = (() => {
    if (auction.boeId && auction.boeId.trim()) return auction.boeId.trim();
    if (isBoeRefLike(auction.title)) return auction.title.trim();
    return null;
  })();

  const muni = cleanLoc(auction.municipality);
  const prov = cleanLoc(auction.province);
  const where = [muni && titleCase(muni), prov && capitalize(prov)]
    .filter(Boolean)
    .join(" · ");
  // Price hierarchy (Dennis-locked 2026-06-03): Tasación PRIMARY (the
  // prominent number — label is "Tasación", NOT "Valor subasta"; the
  // scraper's valor-subasta fallback still shows under the same "Tasación"
  // label, locked by Ken — no flag exists to distinguish on the payload).
  // Cantidad reclamada SECONDARY (when present). Puja mínima REMOVED from
  // the carousel card. Depósito only as a last-resort fallback when nothing
  // else exists.
  const tasacion = pickPrice(auction.appraisalValue);
  const reclamada = pickPrice(auction.claimedAmount);
  const deposit =
    tasacion == null && reclamada == null
      ? pickPrice(auction.depositAmount)
      : null;
  const [imgFailed, setImgFailed] = React.useState(false);
  // Image resolver still wants a "title" for the placeholder alt text; pass
  // the type headline (always populated and human-readable) rather than the
  // raw upstream title (which might be "Unknown" or a SUB- ref).
  const resolved = resolveCardImage({
    imageUrl: auction.imageUrl,
    latitude: auction.latitude,
    longitude: auction.longitude,
    category: auction.category,
    title: typeHeadline,
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
    tasacion == null && reclamada == null && deposit == null;
  const isVariosLotes = isVariosLotesTitle(auction.title);

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
              "text-[--color-ink-primary] border",
              urgent
                ? "bg-[--color-warn-critical-soft] border-[--color-warn-critical]/40"
                : "bg-[--color-surface] border-[--color-hairline]",
            )}
          >
            {ended ? "Finalizada" : formatDaysLeft(endsAt)}
          </span>
        )}
      </div>

      <div className="p-2.5 flex flex-col gap-1 min-w-0">
        {/* Headline = TYPE (Vivienda / Trastero / …). Falls back to category
            then "Subasta" — never to the BOE ref. */}
        <div
          className="text-[13px] font-semibold text-[--color-ink-primary] line-clamp-1 leading-snug"
          title={typeHeadline}
        >
          {typeHeadline}
        </div>
        {where && (
          <div className="text-[11px] text-[--color-ink-tertiary] truncate">
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
              <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[10.5px] text-[--color-ink-secondary]">
                <span className="tnum">
                  <span className="text-[--color-ink-tertiary]">Próxima apertura</span>
                  {opensLabel ? (
                    <> · <span className="text-[--color-ink-primary]">{opensLabel}</span></>
                  ) : (
                    <> · <span className="text-[--color-ink-quiet]">Fecha por confirmar</span></>
                  )}
                </span>
              </div>
            );
          }
          // SUSPENDIDA: single "Reanudación …" line.
          if (dateLabel === "Fecha prevista de reanudación") {
            return (
              <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[10.5px] text-[--color-ink-secondary]">
                <span className="tnum">
                  <span className="text-[--color-ink-tertiary]">Reanudación</span>
                  {resumeLabel ? (
                    <> · <span className="text-[--color-ink-primary]">{resumeLabel}</span></>
                  ) : (
                    <> · <span className="text-[--color-ink-quiet]">Fecha por confirmar</span></>
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
                <span className="text-[--color-ink-tertiary]">Inicio </span>
                <span className="text-[--color-ink-primary]">{opensLabel}</span>
              </span>,
            );
          }
          if (terminaEn) {
            parts.push(
              <span key="ends" className="tnum">
                <span className="text-[--color-ink-tertiary]">Termina en </span>
                <span className="font-semibold text-[--color-ink-primary]">{terminaEn}</span>
              </span>,
            );
          }
          if (endDateLabel !== "—") {
            parts.push(
              <span key="enddate" className="tnum text-[--color-ink-tertiary]">
                {endDateLabel}
              </span>,
            );
          }
          return (
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[10.5px] text-[--color-ink-secondary]">
              {parts.map((p, i) => (
                <React.Fragment key={i}>
                  {i > 0 && (
                    <span className="text-[--color-ink-quiet]" aria-hidden="true">·</span>
                  )}
                  {p}
                </React.Fragment>
              ))}
            </div>
          );
        })()}
        <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 pt-1.5 border-t border-[--color-hairline]">
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
          {tasacion != null && (
            <div className={cn("min-w-0", reclamada == null && "col-span-2")}>
              <div className="text-[9px] uppercase tracking-wide text-[--color-ink-tertiary]">
                Tasación
              </div>
              <div className="tnum text-[15px] font-semibold text-[--color-ink-primary] truncate">
                {formatPrice(tasacion)}
              </div>
            </div>
          )}
          {reclamada != null && (
            <div className={cn("min-w-0", tasacion != null && "text-right")}>
              <div className="text-[9px] uppercase tracking-wide text-[--color-ink-tertiary]">
                Cantidad reclamada
              </div>
              <div className="tnum text-[13px] font-semibold text-[--color-ink-secondary] truncate">
                {formatPrice(reclamada)}
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
          {/* BOE ref + documents indicator — small + muted; bottom row stays
              clean. The "Docs" pill sits inline with Ref. BOE so the card
              keeps a single bottom strip; full download links live on the
              detail modal/page, never here (Dennis's "keep cards clean" rule). */}
          {(refLabel || auction.hasDocuments) && (
            <div className="col-span-2 min-w-0 pt-1 flex items-end justify-between gap-2">
              {refLabel ? (
                <div className="min-w-0 flex-1">
                  <div className="text-[9px] uppercase tracking-wide text-[--color-ink-quiet]">
                    Ref. BOE
                  </div>
                  <div
                    className="text-[10px] font-mono text-[--color-ink-tertiary] truncate select-text"
                    title={refLabel}
                  >
                    {refLabel}
                  </div>
                </div>
              ) : <span />}
              {auction.hasDocuments && (
                <span
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[--color-hairline] bg-[--color-surface-muted] px-1.5 py-0.5 text-[9px] font-medium text-[--color-ink-secondary]"
                  title="Esta subasta tiene documentos oficiales"
                  aria-label="Documentos disponibles"
                >
                  <FileText className="h-2.5 w-2.5" aria-hidden="true" />
                  Docs
                </span>
              )}
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
        title={typeHeadline}
        aria-label={`Ver detalles: ${typeHeadline}${refLabel ? ` (ref. ${refLabel})` : ""}`}
      >
        {innerBody}
      </button>
    );
  }

  return (
    <Link
      href={`/auction/${encodeURIComponent(auction.id)}`}
      onClickCapture={handleClickCapture}
      aria-hidden={duplicate || undefined}
      tabIndex={duplicate ? -1 : 0}
      className={cardClass}
      title={typeHeadline}
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
