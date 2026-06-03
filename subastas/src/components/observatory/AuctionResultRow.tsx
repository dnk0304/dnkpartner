"use client";

/**
 * AuctionResultRow — horizontal "card-row" used by the 2-col /subastas listing.
 *
 * Layout (desktop):
 *   ┌──────────────┐  Title (street + municipality + province)        ❤
 *   │              │  €Price (large)         · status badges
 *   │  ~square     │  short excerpt (propertyDescription / lotDescription)
 *   │  map-thumb   │  Judicial · vía de apremio (auction type tag)
 *   │  + pin       │
 *   └──────────────┘
 *
 * Reuse contracts (NO regression):
 *   - imagery 3-rung ladder via resolveCardImage(size:"card") — real photo →
 *     static map+pin → category SVG. The pin overlay and onError fallback
 *     mirror AuctionListCard exactly.
 *   - StatusBadge / AuctionTypeBadge / PujaBadge / OccupancyBadge
 *   - LiveCountdown / formatDaysLeft
 *   - FollowButton (icon variant) — the favourite heart, lives OUTSIDE the
 *     row's main <Link> so we don't nest interactive elements (a11y).
 *   - BigInt-safe formatPrice
 *
 * Mobile: keeps the same horizontal layout but the map-thumb shrinks and the
 * description excerpt is truncated harder. No table cells — semantic <article>.
 */

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { MapPin, ImageOff } from "lucide-react";
import { AuctionItem, type AuctionStatus } from "@/types";
import { StatusBadge } from "./StatusBadge";
import { AuctionTypeBadge } from "./AuctionTypeBadge";
import { PujaBadge, OccupancyBadge } from "./PujaOccupancyBadges";
import { LiveCountdown } from "./LiveCountdown";
import { FollowButton } from "@/components/notifications/FollowButton";
import {
  formatPrice,
  capitalize,
  titleCase,
  displayTitle,
  formatDaysLeft,
} from "./format";
import { effectiveStatus } from "./status";
import { cn } from "@/lib/utils";
import {
  resolveCardImage,
  fallbackImageFor,
} from "@/lib/resolve-card-image";

export type AuctionResultRowProps = {
  item: AuctionItem & { hasImage?: boolean | null };
  className?: string;
};

export function AuctionResultRow({ item, className }: AuctionResultRowProps) {
  const effective = effectiveStatus(item.status, item.endDate) as AuctionStatus;

  const where = [
    item.municipality && titleCase(item.municipality),
    item.province && capitalize(item.province),
  ]
    .filter(Boolean)
    .join(" · ");

  const title = displayTitle({
    title: item.title,
    municipality: item.municipality,
    province: item.province,
  });

  // 3-rung imagery ladder. `card` size feeds rung-2 a static-map URL sized for
  // the ~square thumbnail; rung-3 is the neutral placeholder. Vehicle rows
  // fall back to the vehicle SVG, never the property cartoon (imagery rule).
  const [imgFailed, setImgFailed] = React.useState(false);
  const resolved = resolveCardImage({
    imageUrl: item.imageUrl,
    hasImage: item.hasImage,
    latitude: item.latitude,
    longitude: item.longitude,
    category: item.category,
    title: item.title,
    size: "card",
  });
  const imageSrc =
    imgFailed && resolved.rung !== "placeholder"
      ? fallbackImageFor(resolved, item.category)
      : resolved.src;

  // Price hierarchy (Dennis-locked 2026-06-03):
  //   PRIMARY  = Tasación (`appraisalValue`) — the prominent headline number.
  //   SECONDARY = Cantidad reclamada (`claimedAmount`) — only when present.
  //   Puja mínima is NEVER the card headline anymore (lives on detail/modal).
  //
  // Tasación is populated on ~100% of active rows (scraper falls back to
  // valor-subasta when judicial Tasación=0). We label it simply "Tasación"
  // in every case — there is no payload flag distinguishing the two and the
  // label decision is locked.
  //
  // Cantidad reclamada coverage is uneven (~30% overall, near-zero on AEAT)
  // so the line MUST be omitted when null/≤0 — never reserve empty space.
  //
  // currentBid stays available as an optional small caption only when a real
  // bid exists (rare on active rows); it never displaces Tasación as primary.
  const hasTasacion = item.appraisalValue != null && Number.isFinite(item.appraisalValue) && (item.appraisalValue as number) > 0;
  const hasClaimed = item.claimedAmount != null && Number.isFinite(item.claimedAmount as number) && (item.claimedAmount as number) > 0;
  const hasCurrentBid = item.currentBid != null && Number.isFinite(item.currentBid) && (item.currentBid as number) > 0;
  const primaryPrice = hasTasacion
    ? { label: "Tasación", amount: item.appraisalValue as number }
    : hasCurrentBid
    ? { label: "Puja actual", amount: item.currentBid as number }
    : null;
  const claimedLine = hasClaimed
    ? { label: "Cantidad reclamada", amount: item.claimedAmount as number }
    : null;
  // Tiny "puja actual" caption only if the primary is Tasación AND there's a
  // real current bid worth showing — never the headline.
  const currentBidLine =
    primaryPrice?.label === "Tasación" && hasCurrentBid
      ? { label: "Puja actual", amount: item.currentBid as number }
      : null;

  const hasEndDate =
    item.endDate instanceof Date
      ? !Number.isNaN(item.endDate.getTime()) && item.endDate.getTime() > 0
      : Boolean(item.endDate);
  const daysBadge = hasEndDate ? formatDaysLeft(item.endDate) : null;

  // Short description excerpt — propertyDescription wins when present, else
  // lotDescription. Trimmed to ~160 chars and clamped to 2 lines so the row
  // height stays predictable. Hidden cleanly when both are null.
  const rawExcerpt =
    (item.propertyDescription && item.propertyDescription.trim()) ||
    (item.lotDescription && item.lotDescription.trim()) ||
    "";
  const excerpt = rawExcerpt.length > 220 ? `${rawExcerpt.slice(0, 220).trimEnd()}…` : rawExcerpt;

  return (
    <article
      className={cn(
        "relative flex gap-4 rounded-lg border border-[--color-hairline] bg-[--color-surface] p-3 md:p-4",
        "transition-shadow hover:shadow-[var(--shadow-card)]",
        "focus-within:ring-2 focus-within:ring-[--color-brand]/30",
        className,
      )}
    >
      {/* LEFT — ~square map-thumb (responsive). The whole tile is a Link to
          the detail page. Pin marker sits at the centre because the static
          map is panned to put lat/lng under the centre point. */}
      <Link
        href={`/auction/${encodeURIComponent(item.id)}`}
        aria-label={`Ver detalle de ${title}`}
        className={cn(
          "relative shrink-0 overflow-hidden rounded-md bg-[--color-surface-muted]",
          "border border-[--color-hairline]",
          // ~square tile. ~120px on tablet+, smaller on mobile.
          "h-24 w-24 sm:h-28 sm:w-28 md:h-32 md:w-32",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-brand]/40",
        )}
      >
        <Image
          src={imageSrc}
          alt={resolved.alt}
          fill
          sizes="128px"
          className={cn(
            resolved.isPlaceholder ? "object-contain p-3 opacity-80" : "object-cover",
          )}
          style={
            resolved.isMap && !imgFailed && resolved.mapPin
              ? { objectPosition: `${resolved.mapPin.xPct}% ${resolved.mapPin.yPct}%` }
              : undefined
          }
          loading="lazy"
          unoptimized={resolved.isMap}
          onError={() => setImgFailed(true)}
        />
        {resolved.isMap && !imgFailed && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[--color-warn-critical] text-white shadow-[0_2px_5px_rgba(0,0,0,0.35)] ring-2 ring-white">
              <MapPin className="h-3.5 w-3.5" strokeWidth={2.5} />
            </span>
          </span>
        )}
        {imgFailed && resolved.rung !== "placeholder" && (
          <span className="sr-only">
            <ImageOff aria-hidden="true" /> Imagen no disponible
          </span>
        )}
        {daysBadge && (
          <span
            className={cn(
              "pointer-events-none absolute bottom-1 left-1 tnum rounded-full px-1.5 py-0.5 text-[10px] font-semibold border",
              "text-[--color-ink-primary]",
              daysBadge === "Hoy" || daysBadge === "1 d"
                ? "bg-[--color-warn-critical-soft] border-[--color-warn-critical]/40"
                : "bg-[--color-surface]/95 border-[--color-hairline] backdrop-blur-sm",
            )}
          >
            {daysBadge}
          </span>
        )}
      </Link>

      {/* RIGHT — text column. min-w-0 so the title/excerpt truncate cleanly
          inside the flex row instead of forcing overflow. */}
      <div className="min-w-0 flex-1">
        {/* Title row — title links to detail; favourite heart is positioned
            in the article's top-right, outside this Link, so click/keyboard
            targets stay disjoint (no nested interactives). */}
        <div className="flex items-start gap-2">
          <Link
            href={`/auction/${encodeURIComponent(item.id)}`}
            className="block min-w-0 flex-1 focus-visible:outline-none"
          >
            <h3 className="font-serif text-base md:text-lg leading-snug text-[--color-ink-primary] line-clamp-2 hover:underline">
              {title}
            </h3>
            {where && (
              <p className="mt-0.5 text-xs text-[--color-ink-tertiary] truncate">{where}</p>
            )}
          </Link>
        </div>

        {/* Price row — Tasación as the prominent headline; Cantidad reclamada
            as a small secondary line ONLY when present; optional "Puja actual"
            mini-caption when a real currentBid exists. Hides cleanly to a soft
            "Precio no disponible" when no numeric price exists. */}
        {primaryPrice ? (
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <div className="flex items-baseline gap-1.5">
              <span className="tnum font-serif text-xl md:text-2xl font-semibold text-[--color-ink-primary]">
                {formatPrice(primaryPrice.amount)}
              </span>
              <span className="text-[10px] uppercase tracking-wide text-[--color-ink-tertiary]">
                {primaryPrice.label}
              </span>
            </div>
            {claimedLine && (
              <span className="tnum text-xs text-[--color-ink-tertiary]">
                {claimedLine.label}{" "}
                <span className="text-[--color-ink-secondary]">
                  {formatPrice(claimedLine.amount)}
                </span>
              </span>
            )}
            {currentBidLine && (
              <span className="tnum text-xs text-[--color-ink-tertiary]">
                {currentBidLine.label}{" "}
                <span className="text-[--color-ink-secondary]">
                  {formatPrice(currentBidLine.amount)}
                </span>
              </span>
            )}
          </div>
        ) : (
          <div className="mt-2 text-sm text-[--color-ink-secondary]">
            Precio no disponible
          </div>
        )}

        {/* Status + puja/occupancy badges row. Each badge is null-safe so the
            row collapses to empty when no field is populated. */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <StatusBadge status={effective} size="sm" />
          <PujaBadge
            status={item.pujaStatus ?? null}
            amountEuros={item.currentBidAmount ?? null}
          />
          <OccupancyBadge occupancy={item.occupancy ?? null} />
          {item.auctionType && <AuctionTypeBadge type={item.auctionType} size="sm" />}
        </div>

        {/* Short description excerpt. Hidden on the smallest viewports to keep
            the row scannable; expanded on sm+. Two-line clamp. */}
        {excerpt && (
          <p className="mt-2 hidden sm:block text-sm text-[--color-ink-secondary] line-clamp-2">
            {excerpt}
          </p>
        )}

        {/* Footer — live countdown. Mirrors AuctionListCard's bottom strip.
            Hidden when no endDate is projected. */}
        {hasEndDate && (
          <div className="mt-2 text-xs text-[--color-ink-tertiary]">
            <LiveCountdown
              target={item.endDate}
              size="sm"
              prefix="Termina en"
              effectiveStatus={effective}
            />
          </div>
        )}
      </div>

      {/* Favourite heart — absolute top-right. Lives OUTSIDE the title Link
          so we never nest interactives (invalid HTML + breaks keyboard nav). */}
      <div className="absolute top-2 right-2 z-10">
        <FollowButton auctionId={item.id} variant="icon" />
      </div>
    </article>
  );
}
