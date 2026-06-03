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
import { MapPin, FileText, Calendar } from "lucide-react";
import { AuctionItem, type AuctionStatus } from "@/types";
import { StatusDot } from "./StatusBadge";
import { AuctionTypeBadge } from "./AuctionTypeBadge";
import { PujaBadge, OccupancyBadge } from "./PujaOccupancyBadges";
import { LiveCountdown } from "./LiveCountdown";
import { FollowButton } from "@/components/notifications/FollowButton";
import { formatPrice, capitalize, titleCase, displayTitle, formatDateMed, prettifyAuctionType } from "./format";
import { getStatusMeta, effectiveStatus } from "./status";
import { cn } from "@/lib/utils";
import { resolveCardImage, fallbackImageFor, isVariosLotesTitle } from "@/lib/resolve-card-image";

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
  // Rule-respecting fallback on rung-1/2 error: vehicle SVG only for vehicles;
  // neutral map placeholder for property + everything else (never the cartoon).
  const imageSrc =
    imgFailed && resolved.rung !== "placeholder"
      ? fallbackImageFor(resolved, item.category)
      : resolved.src;
  // Price hierarchy (Dennis-locked 2026-06-03): Tasación PRIMARY (formerly
  // the dim right-hand cell, now the prominent number); Cantidad reclamada
  // replaces "puja mín." in the secondary cell when present; Puja mínima is
  // no longer rendered on this row.
  const hasCurrentBid = item.currentBid != null && Number.isFinite(item.currentBid) && (item.currentBid as number) > 0;
  const hasTasacion = item.appraisalValue != null && Number.isFinite(item.appraisalValue) && (item.appraisalValue as number) > 0;
  const hasClaimed = item.claimedAmount != null && Number.isFinite(item.claimedAmount as number) && (item.claimedAmount as number) > 0;
  const noPriceData = !hasTasacion && !hasClaimed && !hasCurrentBid;
  const isVariosLotes = isVariosLotesTitle(item.title);
  // Type label — propertyType (from doc-archive backfill) preferred over the
  // less specific row-level `category`. Pre-backfill rows still show the
  // category, so the row never goes blank.
  const typeLabel = prettifyAuctionType(item.propertyType ?? item.category);
  const opensDate = item.opensAt ? new Date(item.opensAt) : null;
  const opensLabel =
    opensDate && !Number.isNaN(opensDate.getTime())
      ? formatDateMed(opensDate)
      : null;

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
              // Rung-2: pan tile so lat/lng sits under the centred pin overlay.
              style={
                resolved.isMap && !imgFailed && resolved.mapPin
                  ? { objectPosition: `${resolved.mapPin.xPct}% ${resolved.mapPin.yPct}%` }
                  : undefined
              }
              loading="lazy"
              unoptimized={resolved.isMap}
              onError={() => setImgFailed(true)}
            />
            {/* Tiny centred pin marker — at this thumbnail scale (64×48) a
                small filled dot reads more cleanly than a full pin glyph. */}
            {resolved.isMap && !imgFailed && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
              >
                <span className="block h-2.5 w-2.5 rounded-full bg-[--color-warn-critical] ring-2 ring-white shadow-[0_1px_3px_rgba(0,0,0,0.4)]" />
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
        {/* propertyType (when projected) is the BOE bien-heading type and
            supersedes the row-level category. Viviendas keeps the brand
            pill; everything else stays plain. Pre-backfill rows fall back
            to category so this cell is never empty. */}
        {typeLabel.toLowerCase() === "vivienda" || item.category === "Viviendas" ? (
          <span
            className="inline-flex items-center rounded-full border border-[--color-brand]/30 bg-[--color-brand]/[0.06] px-2 py-0.5 text-[11px] font-semibold text-[--color-brand]"
            aria-label={`Tipo: ${typeLabel}`}
            title={typeLabel}
          >
            {typeLabel}
          </span>
        ) : (
          <span title={typeLabel}>{typeLabel}</span>
        )}
        {/* Stacked meta: opensAt + documents — only when projected so the
            cell stays one-line on pre-backfill rows. */}
        {(opensLabel || item.hasDocuments) && (
          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-[--color-ink-tertiary] font-normal tnum">
            {opensLabel && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-2.5 w-2.5" aria-hidden="true" />
                Inicio {opensLabel}
              </span>
            )}
            {item.hasDocuments && (
              <span
                className="inline-flex items-center gap-1"
                title="Esta subasta tiene documentos oficiales adjuntos"
              >
                <FileText className="h-2.5 w-2.5" aria-hidden="true" />
                Docs
              </span>
            )}
          </div>
        )}
      </td>

      {/* Primary price cell = Tasación (the prominent number). When Tasación is
          absent but a real currentBid exists, surface that instead so the row
          still has a number; otherwise the no-price affordance renders. */}
      <td className="align-top py-3 pr-3 text-right whitespace-nowrap">
        {hasTasacion ? (
          <>
            <div className="tnum text-sm font-semibold text-[--color-ink-primary]">
              {formatPrice(item.appraisalValue)}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-[--color-ink-tertiary]">
              tasación
            </div>
          </>
        ) : hasCurrentBid ? (
          <>
            <div className="tnum text-sm font-semibold text-[--color-ink-primary]">
              {formatPrice(item.currentBid)}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-[--color-ink-tertiary]">
              puja actual
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

      {/* Secondary price cell = Cantidad reclamada when present, otherwise
          left empty (dash). Replaces the former dim Tasación column — the
          old "puja mín." cell is gone (Puja mínima no longer headlines). */}
      <td className="hidden lg:table-cell align-top py-3 pr-3 text-right whitespace-nowrap">
        {hasClaimed ? (
          <>
            <div className="tnum text-sm text-[--color-ink-secondary]">
              {formatPrice(item.claimedAmount)}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-[--color-ink-tertiary]">
              cant. reclamada
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
