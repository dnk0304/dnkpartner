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
import { ImageOff, MapPin, FileText, Calendar } from "lucide-react";
import { AuctionItem, type AuctionStatus } from "@/types";
import { StatusBadge } from "./StatusBadge";
import { AuctionTypeBadge } from "./AuctionTypeBadge";
import { PujaBadge, OccupancyBadge } from "./PujaOccupancyBadges";
import { LiveCountdown } from "./LiveCountdown";
import { FollowButton } from "@/components/notifications/FollowButton";
import { formatPrice, capitalize, titleCase, displayTitle, formatDaysLeft, formatDateMed, prettifyAuctionType } from "./format";
import { effectiveStatus } from "./status";
import { cn } from "@/lib/utils";
import { resolveCardImage, fallbackImageFor, isVariosLotesTitle } from "@/lib/resolve-card-image";

export type AuctionListCardProps = {
  item: AuctionItem & { hasImage?: boolean | null };
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

  // Imagery resolves through the 3-rung ladder: real photo → static map pin
  // → category SVG. Cards are NEVER blank. `imgFailed` only switches us to
  // the category-SVG fallback so a transient 404 on the real photo or the
  // OpenStreetMap host still shows usable imagery.
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
  // After an onError on rung 1 or 2, fall back via the shared rule: vehicle
  // SVG ONLY for vehicles; neutral map placeholder for property + everything
  // else. The property cartoon must never be reachable from a property row.
  const imageSrc =
    imgFailed && resolved.rung !== "placeholder"
      ? fallbackImageFor(resolved, item.category)
      : resolved.src;

  // Field availability — drives conditional hiding.
  // Card price hierarchy (Dennis-locked 2026-06-03): Tasación PRIMARY,
  // Cantidad reclamada SECONDARY (gated on presence), Puja mínima removed
  // from the card headline (lives on detail/modal). currentBid stays as a
  // small "Puja actual" caption when a real bid exists.
  const hasTasacion = item.appraisalValue != null && Number.isFinite(item.appraisalValue) && (item.appraisalValue as number) > 0;
  const hasClaimed = item.claimedAmount != null && Number.isFinite(item.claimedAmount as number) && (item.claimedAmount as number) > 0;
  const hasCurrentBid = item.currentBid != null && Number.isFinite(item.currentBid) && (item.currentBid as number) > 0;
  // Ghost may split multi-lot auctions into per-lote rows tagged "Varios Lotes"
  // with no usable price. Render a clean "Precio no disponible" affordance
  // instead of an empty price block.
  const noPriceData = !hasTasacion && !hasClaimed && !hasCurrentBid;
  const isVariosLotes = isVariosLotesTitle(item.title);
  // Type headline — propertyType (from the doc-archive backfill) is the
  // BOE-accurate bien type; fall back to category for the ~99% of rows still
  // pre-backfill. `prettifyAuctionType` singularises and strips "Inmueble(…)"
  // so the strip reads as a single type label (e.g. "Vivienda", "Trastero").
  const typeLabel = prettifyAuctionType(item.propertyType ?? item.category);
  // Start date row — only rendered when opensAt is projected and parses to a
  // finite date. Pre-backfill the row hides cleanly (no empty box).
  const opensDate = item.opensAt ? new Date(item.opensAt) : null;
  const opensLabel =
    opensDate && !Number.isNaN(opensDate.getTime())
      ? formatDateMed(opensDate)
      : null;
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
      {/* Imagery hero — 16:9 box that always shows SOMETHING (3-rung ladder).
          The ladder guarantees no blank tile and no layout shift. */}
      <Link
        href={`/auction/${encodeURIComponent(item.id)}`}
        aria-label={`Ver detalle de ${item.title}`}
        className="relative block aspect-[16/9] w-full bg-[--color-surface-muted] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-brand]/40"
      >
        <Image
          src={imageSrc}
          alt={resolved.alt}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
          className={cn(
            resolved.isPlaceholder ? "object-contain p-6 opacity-80" : "object-cover",
          )}
          // For rung-2 we pan the 256px tile so the property's lat/lng sits
          // at the centre of the rendered card. The pin overlay below is
          // therefore drawn at 50%/50% and visually marks the real location.
          style={
            resolved.isMap && !imgFailed && resolved.mapPin
              ? { objectPosition: `${resolved.mapPin.xPct}% ${resolved.mapPin.yPct}%` }
              : undefined
          }
          loading="lazy"
          unoptimized={resolved.isMap}
          onError={() => setImgFailed(true)}
        />
        {/* Rung-2 pin marker — sits at the centre of the rendered card
            because the tile underneath has been panned to put the
            property's lat/lng under this point. */}
        {resolved.isMap && !imgFailed && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[--color-warn-critical] text-white shadow-[0_2px_6px_rgba(0,0,0,0.35)] ring-2 ring-white">
              <MapPin className="h-4 w-4" strokeWidth={2.5} />
            </span>
          </span>
        )}
        {/* Subtle rung-2 affordance chip — labels the thumbnail as a
            location preview rather than a photo. */}
        {resolved.isMap && !imgFailed && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full border border-[--color-hairline] bg-[--color-surface]/90 px-1.5 py-0.5 text-[10px] font-medium text-[--color-ink-secondary] backdrop-blur-sm"
          >
            <MapPin className="h-3 w-3" />
            Ubicación
          </span>
        )}
        {imgFailed && resolved.rung !== "placeholder" && (
          <span className="sr-only">
            <ImageOff aria-hidden="true" /> Imagen no disponible
          </span>
        )}
        <span className="pointer-events-none absolute top-2 left-2 flex items-center gap-1.5">
          <StatusBadge status={effective} size="sm" />
          {item.auctionType && <AuctionTypeBadge type={item.auctionType} size="sm" />}
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

        {/* #16 / #17 — puja + occupancy chips. Each badge component is
            null-safe (returns null when its field is null/unknown) so the
            wrapper renders an empty flex row but no visible content when
            neither field is populated — no layout shift. */}
        {(item.pujaStatus || item.occupancy) && (
          <div className="flex flex-wrap items-center gap-1.5">
            <PujaBadge
              status={item.pujaStatus ?? null}
              amountEuros={item.currentBidAmount ?? null}
            />
            <OccupancyBadge occupancy={item.occupancy ?? null} />
          </div>
        )}

        {/* No-price affordance for Ghost's split "Varios Lotes" rows (and any
            other row missing every numeric price field). Avoids the
            otherwise-empty space below the location line. */}
        {noPriceData && (
          <div className="pt-2 hairline-t">
            <div className="text-[10px] uppercase tracking-wide text-[--color-ink-tertiary]">
              {isVariosLotes ? "Varios lotes" : "Precio"}
            </div>
            <div className="text-sm font-medium text-[--color-ink-secondary]">
              Precio no disponible
            </div>
          </div>
        )}

        {/* PRIMARY: Tasación (left, largest). Cantidad reclamada in the right
            cell ONLY when present — when absent, Tasación stretches to span
            the full row width so the card never shows an orphaned empty cell
            (the ~70% AEAT/ADMINISTRATIVAS case). */}
        {hasTasacion && (
          <div
            className={cn(
              "pt-2 hairline-t",
              hasClaimed ? "grid grid-cols-2 gap-3" : "",
            )}
          >
            <div>
              <div className="text-[10px] uppercase tracking-wide text-[--color-ink-tertiary]">
                Tasación
              </div>
              <div className="tnum text-base font-semibold text-[--color-ink-primary]">
                {formatPrice(item.appraisalValue)}
              </div>
            </div>
            {hasClaimed && (
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wide text-[--color-ink-tertiary]">
                  Cantidad reclamada
                </div>
                <div className="tnum text-base font-semibold text-[--color-ink-primary]">
                  {formatPrice(item.claimedAmount)}
                </div>
              </div>
            )}
          </div>
        )}
        {/* Edge case: no Tasación but Cantidad reclamada exists (rare —
            judicial rows where even the valor-subasta fallback is null).
            Render reclamada alone rather than skipping the price block. */}
        {!hasTasacion && hasClaimed && (
          <div className="pt-2 hairline-t">
            <div className="text-[10px] uppercase tracking-wide text-[--color-ink-tertiary]">
              Cantidad reclamada
            </div>
            <div className="tnum text-base font-semibold text-[--color-ink-primary]">
              {formatPrice(item.claimedAmount)}
            </div>
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

        {/* Bottom meta strip: type label + live countdown.
            propertyType (when present) supersedes category — it's the BOE
            bien-heading type (Vivienda, Trastero, Garaje…). Viviendas keeps
            the brand-tinted pill so the hero category stays recognisable;
            other types use the plain caption style. */}
        <div className="hairline-t pt-2 flex items-center justify-between gap-2">
          {typeLabel && (
            typeLabel.toLowerCase() === "vivienda" || item.category === "Viviendas" ? (
              <span
                className="inline-flex items-center rounded-full border border-[--color-brand]/30 bg-[--color-brand]/[0.06] px-2 py-0.5 text-[10px] uppercase tracking-wide font-semibold text-[--color-brand] truncate"
                aria-label={`Tipo: ${typeLabel}`}
                title={typeLabel}
              >
                {typeLabel}
              </span>
            ) : (
              <span
                className="text-[10px] uppercase tracking-wide text-[--color-ink-tertiary] truncate"
                title={typeLabel}
              >
                {typeLabel}
              </span>
            )
          )}
          {hasEndDate && (
            <LiveCountdown target={item.endDate} size="sm" prefix="Termina en" effectiveStatus={effective} />
          )}
        </div>

        {/* Start-date row + documents indicator. Both null-safe — rendered
            only when projected by the document-archive scraper backfill.
            Pre-backfill the whole row is omitted (no empty box). */}
        {(opensLabel || item.hasDocuments) && (
          <div className="flex items-center justify-between gap-2 text-[11px] text-[--color-ink-tertiary]">
            {opensLabel ? (
              <span className="inline-flex items-center gap-1 tnum">
                <Calendar className="h-3 w-3" aria-hidden="true" />
                <span className="text-[--color-ink-quiet]">Inicio </span>
                <span className="text-[--color-ink-secondary]">{opensLabel}</span>
              </span>
            ) : <span />}
            {item.hasDocuments && (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-[--color-hairline] bg-[--color-surface-muted] px-1.5 py-0.5 font-medium text-[--color-ink-secondary]"
                title="Esta subasta tiene documentos oficiales adjuntos"
                aria-label="Documentos disponibles"
              >
                <FileText className="h-3 w-3" aria-hidden="true" />
                Documentos
              </span>
            )}
          </div>
        )}

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
