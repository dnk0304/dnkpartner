"use client";

/**
 * AuctionListCard — mobile/card-view representation of an auction.
 *
 * Used by:
 *   - /subastas in "Tarjetas" view (toggle)
 *   - mobile breakpoints of the list view (when AuctionListRow's table layout
 *     becomes uncomfortable)
 *
 * Layout: status badge + title + location + price block + countdown + follow.
 * Click target is the whole card except the FollowButton.
 */

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { ImageOff, MapPin } from "lucide-react";
import { AuctionItem, type AuctionStatus } from "@/types";
import { StatusBadge } from "./StatusBadge";
import { LiveCountdown } from "./LiveCountdown";
import { FollowButton } from "@/components/notifications/FollowButton";
import { formatPrice, capitalize, titleCase, displayTitle, formatDaysLeft } from "./format";
import { effectiveStatus } from "./status";
import { cn } from "@/lib/utils";

/**
 * Real photo = a resolver-served image (Catastro / Street View / migrated).
 * Anything else (category placeholder URL, missing) → render the soft fallback
 * tile instead of an actual <img>.
 */
function isRealPhotoUrl(url?: string | null): boolean {
  if (!url) return false;
  return url.startsWith("/api/auction-image/") || url.startsWith("/streetview/");
}

export type AuctionListCardProps = {
  item: AuctionItem;
  className?: string;
};

export function AuctionListCard({ item, className }: AuctionListCardProps) {
  // Clock-wins: stale celebrandose row with past endDate renders as concluded
  // so badge + countdown agree.
  const effective = effectiveStatus(item.status, item.endDate) as AuctionStatus;
  const where = [item.municipality && titleCase(item.municipality), item.province && capitalize(item.province)]
    .filter(Boolean)
    .join(" · ");

  // Synthesize a readable title — never render the literal "Unknown" the
  // upstream scraper emits for ~40% of active rows.
  const title = displayTitle({
    title: item.title,
    municipality: item.municipality,
    province: item.province,
  });

  const realPhoto = isRealPhotoUrl(item.imageUrl);
  const [imgFailed, setImgFailed] = React.useState(false);
  const showImage = realPhoto && !imgFailed;

  // Field availability — drives conditional hiding.
  const hasTasacion = item.appraisalValue != null && Number.isFinite(item.appraisalValue);
  const hasMinBid = item.minimumBid != null && Number.isFinite(item.minimumBid as number);
  const hasCurrentBid = item.currentBid != null && Number.isFinite(item.currentBid);
  const hasEndDate =
    item.endDate instanceof Date
      ? !Number.isNaN(item.endDate.getTime()) && item.endDate.getTime() > 0
      : Boolean(item.endDate);
  const daysBadge = hasEndDate ? formatDaysLeft(item.endDate) : null;

  return (
    <article
      className={cn(
        "relative flex flex-col rounded-xl border border-[--color-hairline] bg-[--color-surface] overflow-hidden",
        "shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-lift)] hover:border-[--color-brand-soft]/40 transition-shadow",
        className,
      )}
    >
      {/* Real-photo hero — keeps a stable 16:9 box even when there's no photo
          (soft fallback tile) so there's never a layout shift. */}
      <Link
        href={`/auction/${encodeURIComponent(item.id)}`}
        aria-label={`Ver detalle de ${item.title}`}
        className="relative block aspect-[16/9] w-full bg-[--color-surface-muted] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-brand]/40"
      >
        {showImage ? (
          <Image
            src={item.imageUrl}
            alt={`Foto de ${item.title}`}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
            className="object-cover"
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-[--color-ink-tertiary]">
            {imgFailed ? (
              <ImageOff className="h-6 w-6 mb-1" aria-hidden="true" />
            ) : (
              <MapPin className="h-6 w-6 mb-1" aria-hidden="true" />
            )}
            <span className="text-[10px] uppercase tracking-wide">Sin foto disponible</span>
          </div>
        )}
        <span className="pointer-events-none absolute top-2 left-2">
          <StatusBadge status={effective} size="sm" />
        </span>
        {daysBadge && (
          <span
            className={cn(
              "pointer-events-none absolute bottom-2 left-2 tnum rounded-full px-2 py-0.5 text-[11px] font-semibold border",
              "text-[--color-ink-primary]",
              daysBadge === "Hoy" || daysBadge === "1 d"
                ? "bg-[--color-warn-critical-soft] border-[--color-warn-critical]/40"
                : "bg-[--color-surface] border-[--color-hairline]",
            )}
          >
            {daysBadge}
          </span>
        )}
      </Link>

      {/* FollowButton sits OUTSIDE the hero Link — nesting interactive elements
          inside an anchor is invalid HTML and breaks keyboard navigation. */}
      <div className="absolute top-2 right-2 z-10">
        <FollowButton auctionId={item.id} variant="icon" />
      </div>

      <div className="flex flex-col gap-3 p-4">
        <Link
          href={`/auction/${encodeURIComponent(item.id)}`}
          className="block focus-visible:outline-none"
        >
          <h3 className="font-serif text-lg leading-tight text-[--color-ink-primary] line-clamp-2 hover:underline">
            {title}
          </h3>
          {where && (
            <p className="mt-1 text-xs text-[--color-ink-tertiary]">{where}</p>
          )}
        </Link>

        {/* PRIMARY hierarchy: Tasación (left, largest) + Puja mínima (right).
            Both hide cleanly when the field is null — no "—" walls. */}
        {(hasTasacion || hasMinBid) && (
          <div className="grid grid-cols-2 gap-3 pt-2 hairline-t">
            {hasTasacion ? (
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[--color-ink-tertiary]">
                  Tasación
                </div>
                <div className="tnum text-base font-semibold text-[--color-ink-primary]">
                  {formatPrice(item.appraisalValue)}
                </div>
              </div>
            ) : (
              <div />
            )}
            {hasMinBid && (
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wide text-[--color-ink-tertiary]">
                  Puja mínima
                </div>
                <div className="tnum text-base font-semibold text-[--color-brand-soft]">
                  {formatPrice(item.minimumBid)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Secondary row: current bid (only when present — most active rows have none). */}
        {hasCurrentBid && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-[--color-ink-tertiary] uppercase tracking-wide text-[10px]">
              Puja actual
            </span>
            <span className="tnum font-semibold text-[--color-ink-primary]">
              {formatPrice(item.currentBid)}
            </span>
          </div>
        )}

        {/* Bottom meta strip: category + live countdown. */}
        <div className="hairline-t pt-2 flex items-center justify-between gap-2">
          {item.category && (
            <span className="text-[10px] uppercase tracking-wide text-[--color-ink-tertiary] truncate">
              {item.category}
            </span>
          )}
          {hasEndDate && (
            <LiveCountdown target={item.endDate} size="sm" prefix="Termina en" effectiveStatus={effective} />
          )}
        </div>

        {/* BOE direct link — primary differentiator: lets bidders act
            without entering our detail page. */}
        {item.boeLink && (
          <a
            href={item.boeLink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "mt-1 inline-flex items-center justify-center gap-1 rounded-md",
              "border border-[--color-brand-soft]/30 px-2.5 py-1.5 text-xs font-medium",
              "text-[--color-brand-soft] hover:bg-[--color-info-soft]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-brand-soft]/40",
            )}
          >
            Ir al BOE oficial →
          </a>
        )}
      </div>
    </article>
  );
}
