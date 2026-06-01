"use client";

/**
 * DetailStatusPanel — the sticky right-rail "state" panel on the detail page.
 *
 * The single most important block in the product. It must answer in one
 * glance:
 *   - What's the auction doing right now?
 *   - When does it open / close?
 *   - What's the current bid?
 *   - How do I act (follow / configure alerts / go to BOE to bid)?
 *
 * The panel docks sticky-top once the user scrolls past the hero so the live
 * countdown and "Ir al Portal del BOE" CTA never leave the viewport on
 * desktop. On mobile it lives above the description (not sticky — the mobile
 * action bar handles the persistent CTAs).
 */

import * as React from "react";
import { ExternalLink } from "lucide-react";
import { AuctionItem } from "@/types";
import { StatusBadge } from "./StatusBadge";
import { LiveCountdown } from "./LiveCountdown";
import { FollowButton } from "@/components/notifications/FollowButton";
import { NotifyPrefsPopover } from "@/components/notifications/NotifyPrefsPopover";
import { formatPrice, formatDateLong } from "./format";
import { getStatusMeta, isLive, isUpcoming } from "./status";
import { cn } from "@/lib/utils";

export type DetailStatusPanelProps = {
  auction: AuctionItem & {
    startedAt?: string | Date | null;
    endsAt?: string | Date | null;
    minimumBid?: number | null;
    depositAmount?: number | null;
    bidIncrement?: number | null;
    claimedAmount?: number | null;
  };
  initialFollowing: boolean;
  className?: string;
};

export function DetailStatusPanel({
  auction,
  initialFollowing,
  className,
}: DetailStatusPanelProps) {
  const meta = getStatusMeta(auction.status);
  const live = isLive(auction.status);
  const upcoming = isUpcoming(auction.status);

  // Pick the right countdown target: live → endsAt, upcoming → startedAt,
  // otherwise nothing (finished states).
  const countdownTarget = live
    ? (auction.endsAt ?? auction.endDate ?? null)
    : upcoming
      ? (auction.startedAt ?? auction.endsAt ?? auction.endDate ?? null)
      : null;
  const countdownPrefix = live ? "Termina en" : upcoming ? "Abre en" : undefined;

  const [following, setFollowing] = React.useState(initialFollowing);

  return (
    <aside
      className={cn(
        "rounded-lg border border-[--color-hairline] bg-[--color-surface] p-5 md:p-6 space-y-5",
        className,
      )}
      aria-labelledby="detail-state-heading"
    >
      <header>
        <h2 id="detail-state-heading" className="sr-only">
          Estado actual de la subasta
        </h2>
        <StatusBadge status={auction.status} size="lg" />
        <p className="mt-2 text-xs text-[--color-ink-tertiary]">{meta.helper}</p>
      </header>

      {/* Live countdown — the most important moving element on the page. */}
      {countdownTarget ? (
        <div className="rounded-md bg-[--color-surface-muted] px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[--color-ink-tertiary]">
            {live ? "Tiempo restante" : "Abre en"}
          </div>
          <LiveCountdown target={countdownTarget} size="lg" className="mt-1" />
          <div className="mt-1.5 text-xs text-[--color-ink-tertiary] tnum">
            {live
              ? auction.endsAt
                ? `Termina el ${formatDateLong(auction.endsAt)}`
                : null
              : auction.startedAt
                ? `Abre el ${formatDateLong(auction.startedAt)}`
                : null}
          </div>
        </div>
      ) : null}

      {/* Current bid */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[--color-ink-tertiary]">
          Puja actual
        </div>
        <div className="mt-1 tnum font-serif text-2xl md:text-3xl text-[--color-ink-primary]">
          {formatPrice(auction.currentBid)}
        </div>
      </div>

      {/* Values */}
      <dl className="space-y-2 hairline-t pt-4 text-sm">
        <ValueRow label="Tasación" value={formatPrice(auction.appraisalValue)} />
        {auction.minimumBid != null && (
          <ValueRow label="Puja mínima" value={formatPrice(auction.minimumBid)} />
        )}
        {auction.depositAmount != null && (
          <ValueRow label="Depósito" value={formatPrice(auction.depositAmount)} />
        )}
        {auction.bidIncrement != null && (
          <ValueRow label="Tramo entre pujas" value={formatPrice(auction.bidIncrement)} />
        )}
        {auction.claimedAmount != null && (
          <ValueRow label="Cantidad reclamada" value={formatPrice(auction.claimedAmount)} />
        )}
      </dl>

      {/* Action cluster */}
      <div className="space-y-3 hairline-t pt-4">
        <a
          href={auction.boeLink ?? "https://subastas.boe.es"}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-semibold transition-colors",
            "bg-[--color-action-soft] border border-[--color-action] text-[--color-ink-primary] hover:bg-[--color-action-soft]/80",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-brand]/40 focus-visible:ring-offset-2",
          )}
        >
          Ir al Portal del BOE
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
        <p className="text-[11px] text-[--color-ink-tertiary] text-center">
          Las pujas se realizan únicamente en el portal oficial.
        </p>

        <div className="flex items-stretch gap-2">
          <FollowButton
            auctionId={auction.id}
            initialFollowing={initialFollowing}
            onChange={setFollowing}
            className="flex-1 justify-center"
          />
          <NotifyPrefsPopover
            auctionId={auction.id}
            isFollowing={following}
            triggerVariant="default"
          />
        </div>
      </div>
    </aside>
  );
}

function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-[--color-ink-secondary]">{label}</dt>
      <dd className="tnum text-sm text-[--color-ink-primary]">{value}</dd>
    </div>
  );
}
