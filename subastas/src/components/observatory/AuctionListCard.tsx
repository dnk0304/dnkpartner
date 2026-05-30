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
import { AuctionItem } from "@/types";
import { StatusBadge } from "./StatusBadge";
import { LiveCountdown } from "./LiveCountdown";
import { FollowButton } from "@/components/notifications/FollowButton";
import { formatPrice, capitalize, titleCase } from "./format";
import { cn } from "@/lib/utils";

export type AuctionListCardProps = {
  item: AuctionItem;
  className?: string;
};

export function AuctionListCard({ item, className }: AuctionListCardProps) {
  const where = [item.municipality && titleCase(item.municipality), item.province && capitalize(item.province)]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      className={cn(
        "relative flex flex-col gap-3 rounded-lg border border-[--color-hairline] bg-[--color-surface] p-4",
        "hover:border-[--color-brand]/40 transition-colors",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <StatusBadge status={item.status} size="sm" />
        <FollowButton auctionId={item.id} variant="icon" />
      </header>

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
    </article>
  );
}
