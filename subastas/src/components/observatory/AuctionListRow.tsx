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
import { AuctionItem } from "@/types";
import { StatusDot } from "./StatusBadge";
import { LiveCountdown } from "./LiveCountdown";
import { FollowButton } from "@/components/notifications/FollowButton";
import { formatPrice, capitalize, titleCase } from "./format";
import { getStatusMeta } from "./status";
import { cn } from "@/lib/utils";

export type AuctionListRowProps = {
  item: AuctionItem;
  className?: string;
};

export function AuctionListRow({ item, className }: AuctionListRowProps) {
  const meta = getStatusMeta(item.status);
  const where = [item.municipality && titleCase(item.municipality), item.province && capitalize(item.province)]
    .filter(Boolean)
    .join(" · ");

  return (
    <tr
      className={cn(
        "group hover:bg-[--color-surface-muted] transition-colors",
        className,
      )}
    >
      <td className="w-6 align-top py-3 pl-4">
        <StatusDot status={item.status} size={8} className="mt-1.5" />
      </td>

      <td className="align-top py-3 pr-3 min-w-0">
        <Link
          href={`/auction/${encodeURIComponent(item.id)}`}
          className="block text-sm font-medium text-[--color-ink-primary] hover:underline focus-visible:outline-none focus-visible:underline line-clamp-2"
        >
          {item.title}
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
        </div>
      </td>

      <td className="hidden md:table-cell align-top py-3 pr-3 text-xs text-[--color-ink-secondary] whitespace-nowrap">
        {item.category}
      </td>

      <td className="align-top py-3 pr-3 text-right whitespace-nowrap">
        <div className="tnum text-sm font-semibold text-[--color-ink-primary]">
          {formatPrice(item.currentBid)}
        </div>
        <div className="text-[10px] uppercase tracking-wide text-[--color-ink-tertiary]">
          puja actual
        </div>
      </td>

      <td className="hidden lg:table-cell align-top py-3 pr-3 text-right whitespace-nowrap">
        <div className="tnum text-sm text-[--color-ink-secondary]">
          {formatPrice(item.appraisalValue)}
        </div>
        <div className="text-[10px] uppercase tracking-wide text-[--color-ink-tertiary]">
          tasación
        </div>
      </td>

      <td className="hidden md:table-cell align-top py-3 pr-3 text-right whitespace-nowrap">
        <LiveCountdown target={item.endDate} size="sm" />
      </td>

      <td className="align-top py-3 pr-4 whitespace-nowrap">
        <FollowButton auctionId={item.id} variant="icon" />
      </td>
    </tr>
  );
}
