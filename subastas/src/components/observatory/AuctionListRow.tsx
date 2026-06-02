"use client";

/**
 * AuctionListRow — the dense "Bloomberg of subastas" list row.
 *
 * Layout (desktop):
 *   ● | Title + ID + source           | type | curr.bid | tasación | termina en | ★
 *
 * Mobile collapses into a card (use <AuctionListCard /> for that — same
 * data, different layout).
 *
 * Click anywhere in the row → /auction/[id]. Star handled by FollowButton.
 */

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { MapPin } from "lucide-react";
import { AuctionItem, type AuctionStatus } from "@/types";
import { StatusDot } from "./StatusBadge";
import { AuctionTypeBadge } from "./AuctionTypeBadge";
import { PujaBadge, OccupancyBadge } from "./PujaOccupancyBadges";
import { LiveCountdown } from "./LiveCountdown";
import { FollowButton } from "@/components/notifications/FollowButton";
import { formatPrice, capitalize, titleCase, displayTitle } from "./format";
import { getStatusMeta, effectiveStatus } from "./status";
import { cn } from "@/lib/utils";
import { resolveCardImage, isVariosLotesTitle } from "@/lib/resolve-card-image";

export type AuctionListRowProps = {
  item: AuctionItem & { hasImage?: boolean | null };
  className?: string;
};

export function AuctionListRow({ item, className }: AuctionListRowProps) {
  // Clock-wins: a stale celebrandose row whose endDate has passed must render
  // as concluded so the dot + label + countdown agree.
  const effective = effectiveStatus(item.status, item.endDate) as AuctionStatus;
  const meta = getStatusMeta(effective);
  const where = [item.municipality && titleCase(item.municipality), item.province && capitalize(item.province)]
    .filter(Boolean)
    .join(" · ");
  // Never render the literal "Unknown" — synthesize from location.
  const title = displayTitle({
    title: item.title,
    municipality: item.municipality,
    province: item.province,
  });
  const [imgFailed, setImgFailed] = React.useState(false);
  // Tiny row thumbnail: 64×48. Use 'thumbnail' size on rung 2 so the static
  // map fetch matches the rendered box.
  const resolved = resolveCardImage({
    imageUrl: item.imageUrl,
    hasImage: item.hasImage,
    latitude: item.latitude,
    longitude: item.longitude,
    category: item.category,
    title: item.title,
    size: "thumbnail",
  });
  const imageSrc =
    imgFailed && resolved.rung !== "placeholder"
      ? resolveCardImage({ category: item.category, title: item.title, size: "thumbnail" }).src
      : resolved.src;
  const hasCurrentBid = item.currentBid != null && Number.isFinite(item.currentBid);
  const hasTasacion = item.appraisalValue != null && Number.isFinite(item.appraisalValue);
  const hasMinBid = item.minimumBid != null && Number.isFinite(item.minimumBid as number);
  const noPriceData = !hasTasacion && !hasMinBid && !hasCurrentBid;
  const isVariosLotes = isVariosLotesTitle(item.title);

  return (
    <tr
      className={cn(
        "group hover:bg-[--color-surface-muted] transition-colors",
        className,
      )}
    >
      <td className="w-6 align-top py-3 pl-4">
        <StatusDot status={effective} size={8} className="mt-1.5" />
      </td>

      <td className="align-top py-3 pr-3 min-w-0">
        <div className="flex items-start gap-3 min-w-0">
          {/* Row thumbnail — always rendered through the 3-rung ladder. Hidden
              below sm: to keep the dense row scannable on mobile. */}
          <Link
            href={`/auction/${encodeURIComponent(item.id)}`}
            tabIndex={-1}
            aria-hidden="true"
            className="relative shrink-0 w-16 h-12 rounded overflow-hidden bg-[--color-surface-muted] border border-[--color-hairline] hidden sm:block cursor-pointer"
          >
            <Image
              src={imageSrc}
              alt=""
              fill
              sizes="64px"
              className={cn(
                resolved.isPlaceholder ? "object-contain p-1 opacity-80" : "object-cover",
              )}
              loading="lazy"
              unoptimized={resolved.isMap}
              onError={() => setImgFailed(true)}
            />
            {resolved.isMap && !imgFailed && (
              <span
                aria-hidden="true"
                className="absolute bottom-0 right-0 inline-flex h-3.5 w-3.5 items-center justify-center rounded-tl bg-[--color-surface]/90 text-[--color-ink-secondary]"
              >
                <MapPin className="h-2.5 w-2.5" />
              </span>
            )}
          </Link>
          <div className="min-w-0 flex-1">
        <Link
          href={`/auction/${encodeURIComponent(item.id)}`}
          className="block text-sm font-medium text-[--color-ink-primary] hover:underline focus-visible:outline-none focus-visible:underline line-clamp-2"
        >
          {title}
        </Link>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-[--color-ink-tertiary] tnum">
          <span className="uppercase tracking-wide" style={{ color: meta.color }}>
            {meta.label}
          </span>
          {where && (
            <>
              <span aria-hidden="true">·</span>
              <span className="truncate">{where}</span>
            </>
          )}
          {item.auctionType && (
            <span className="hidden sm:inline-flex">
              <AuctionTypeBadge type={item.auctionType} size="xs" />
            </span>
          )}
          {/* #16 / #17 — puja + occupancy chips. Hidden on tight viewports
              so the row's title stays scannable; cards carry both fields
              at every breakpoint. Null-safe (each badge renders null when
              its field is null). */}
          <span className="hidden lg:inline-flex items-center gap-1.5">
            <PujaBadge
              status={item.pujaStatus ?? null}
              amountEuros={item.currentBidAmount ?? null}
            />
            <OccupancyBadge occupancy={item.occupancy ?? null} />
          </span>
        </div>
          </div>
        </div>
      </td>

      <td className="hidden md:table-cell align-top py-3 pr-3 text-xs text-[--color-ink-secondary] whitespace-nowrap">
        {item.category}
      </td>

      {/* Puja column = current bid if present, else min bid (active rows usually
          have no current bid). Hides cleanly when both are null. */}
      <td className="align-top py-3 pr-3 text-right whitespace-nowrap">
        {hasCurrentBid ? (
          <>
            <div className="tnum text-sm font-semibold text-[--color-ink-primary]">
              {formatPrice(item.currentBid)}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-[--color-ink-tertiary]">
              puja actual
            </div>
          </>
        ) : hasMinBid ? (
          <>
            <div className="tnum text-sm font-semibold text-[--color-brand-soft]">
              {formatPrice(item.minimumBid)}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-[--color-ink-tertiary]">
              puja mín.
            </div>
          </>
        ) : noPriceData ? (
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-[--color-ink-tertiary]">
              {isVariosLotes ? "Varios lotes" : "Sin datos"}
            </div>
            <div className="text-[11px] text-[--color-ink-secondary]">
              Precio no disponible
            </div>
          </div>
        ) : (
          <span className="text-[10px] text-[--color-ink-tertiary]">—</span>
        )}
      </td>

      <td className="hidden lg:table-cell align-top py-3 pr-3 text-right whitespace-nowrap">
        {hasTasacion ? (
          <>
            <div className="tnum text-sm text-[--color-ink-secondary]">
              {formatPrice(item.appraisalValue)}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-[--color-ink-tertiary]">
              tasación
            </div>
          </>
        ) : (
          <span className="text-[10px] text-[--color-ink-tertiary]">—</span>
        )}
      </td>

      <td className="hidden md:table-cell align-top py-3 pr-3 text-right whitespace-nowrap">
        <LiveCountdown target={item.endDate} size="sm" effectiveStatus={effective} />
      </td>

      <td className="align-top py-3 pr-4 whitespace-nowrap">
        <FollowButton auctionId={item.id} variant="icon" />
      </td>
    </tr>
  );
}
