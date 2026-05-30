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
import { AuctionItem } from "@/types";
import { StatusBadge } from "./StatusBadge";
import { LiveCountdown } from "./LiveCountdown";
import { FollowButton } from "@/components/notifications/FollowButton";
import { formatPrice, capitalize, titleCase } from "./format";
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
  const where = [item.municipality && titleCase(item.municipality), item.province && capitalize(item.province)]
    .filter(Boolean)
    .join(" · ");

  const realPhoto = isRealPhotoUrl(item.imageUrl);
  const [imgFailed, setImgFailed] = React.useState(false);
  const showImage = realPhoto && !imgFailed;

  return (
    <article
      className={cn(
        "relative flex flex-col rounded-lg border border-[--color-hairline] bg-[--color-surface] overflow-hidden",
        "hover:border-[--color-brand]/40 transition-colors",
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
          <StatusBadge status={item.status} size="sm" />
        </span>
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
          {item.title}
        </h3>
        {where && (
          <p className="mt-1 text-xs text-[--color-ink-tertiary]">{where}</p>
        )}
      </Link>

      <div className="grid grid-cols-2 gap-3 pt-2 hairline-t">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-[--color-ink-tertiary]">
            Puja actual
          </div>
          <div className="tnum text-sm font-semibold text-[--color-ink-primary]">
            {formatPrice(item.currentBid)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-[--color-ink-tertiary]">
            Tasación
          </div>
          <div className="tnum text-sm text-[--color-ink-secondary]">
            {formatPrice(item.appraisalValue)}
          </div>
        </div>
      </div>

      <div className="hairline-t pt-2 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-[--color-ink-tertiary]">
          {item.category}
        </span>
        <LiveCountdown target={item.endDate} size="sm" prefix="Termina en" />
      </div>
      </div>
    </article>
  );
}
