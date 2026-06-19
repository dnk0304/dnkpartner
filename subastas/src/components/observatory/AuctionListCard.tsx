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
import { ImageOff, MapPin, Calendar } from "lucide-react";
import { AuctionItem, type AuctionStatus } from "@/types";
import { StatusBadge } from "./StatusBadge";
import { AuctionTypeBadge } from "./AuctionTypeBadge";
import { SourceBadge } from "./SourceBadge";
import { PujaBadge, OccupancyBadge } from "./PujaOccupancyBadges";
import { LiveCountdown } from "./LiveCountdown";
import { FollowButton } from "@/components/notifications/FollowButton";
import { formatPrice, capitalize, titleCase, formatDaysLeft, formatDateMed, prettifyAuctionType, formatM2, formatPricePerM2 } from "./format";
import { auctionCardTitle } from "@/lib/seo/display-title";
import { effectiveStatus } from "./status";
import { cn } from "@/lib/utils";
import { resolveCardImage, fallbackImageFor, isVariosLotesTitle } from "@/lib/resolve-card-image";
import { statusDateLabel } from "@/lib/auction-status";
import { AuctionCardTypeBanner } from "./AuctionCardTypeBanner";
import { OFFICIAL_CATEGORIES } from "@/lib/constants";
import { googleMapsSearchUrl } from "@/lib/maps-link";

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

  // Category group hint — drives the dual-card-headline path (vehicle vs
  // property) and the short-street wiring below.
  const isVehicle = item.category
    ? (OFFICIAL_CATEGORIES.MOVABLE as readonly string[]).includes(item.category)
    : false;
  // Card title (Wave C3, 2026-06-07):
  //   - PROPERTY: short-street mode — "{Tipo} – {Calle X}" (helper from C2).
  //     Falls back to "{Tipo} en {town}" when the street parse fails. NEVER
  //     the full address, NEVER the BOE ref.
  //   - VEHICLE: when make+model are present, render "{Make} {Model}" only
  //     (no Tipo prefix, no town suffix — Dennis-locked). Otherwise fall
  //     back to "{Tipo} en {town}" via the standard helper.
  const baseTitle = auctionCardTitle({
    address: item.address,
    propertyType: item.propertyType,
    auctionType: item.auctionType,
    category: item.category,
    municipality: item.municipality,
    province: item.province,
    title: item.title,
    categoryGroup: isVehicle ? "movable" : "real_estate",
    vehicleMake: item.vehicleMake,
    vehicleModel: item.vehicleModel,
    vehicleYear: item.vehicleYear,
    useShortStreet: !isVehicle,
  });
  const vehicleMakeModel =
    isVehicle && item.vehicleMake && item.vehicleModel
      ? `${titleCase(item.vehicleMake)} ${titleCase(item.vehicleModel)}`
      : null;
  const title = vehicleMakeModel ?? baseTitle;

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
  // Three-value display (Dennis-locked 2026-06-04, brief
  // `three-values-card-display`): Tasación + Valor subasta + Cantidad
  // reclamada are surfaced as three labelled lines when present. Honest-NULL:
  // each line is OMITTED when its field is null (never coerced to 0 or "—").
  // Judicial rows that scrape Tasación=null show Valor subasta in its place;
  // AEAT rows that have only Tasación show that alone. currentBid (Puja
  // actual) stays as a small caption when a real bid exists.
  const hasTasacion = item.appraisalValue != null && Number.isFinite(item.appraisalValue) && (item.appraisalValue as number) > 0;
  const hasValorSubasta = item.valorSubasta != null && Number.isFinite(item.valorSubasta as number) && (item.valorSubasta as number) > 0;
  const hasClaimed = item.claimedAmount != null && Number.isFinite(item.claimedAmount as number) && (item.claimedAmount as number) > 0;
  const hasCurrentBid = item.currentBid != null && Number.isFinite(item.currentBid) && (item.currentBid as number) > 0;
  // Build the labelled price-line list in display order (Tasación → Valor
  // subasta → Cantidad reclamada). The first becomes the prominent number;
  // the rest render as smaller secondary lines in the same block. This list
  // is what drives the responsive 1/2/3-column layout in the price block.
  const valueLines: Array<{ key: string; label: string; amount: number }> = [];
  if (hasTasacion) valueLines.push({ key: "tasacion", label: "Tasación", amount: item.appraisalValue as number });
  if (hasValorSubasta) valueLines.push({ key: "valorSubasta", label: "Valor subasta", amount: item.valorSubasta as number });
  if (hasClaimed) valueLines.push({ key: "claimedAmount", label: "Cantidad reclamada", amount: item.claimedAmount as number });
  // Ghost may split multi-lot auctions into per-lote rows tagged "Varios Lotes"
  // with no usable price. Render a clean "Precio no disponible" affordance
  // instead of an empty price block.
  const noPriceData = valueLines.length === 0 && !hasCurrentBid;
  const isVariosLotes = isVariosLotesTitle(item.title);
  // Idealista-style FACT STRIP (property-card-redesign, 2026-06-19): a tight
  // inline key-facts row beneath the price — surface (m²) · derived €/m² ·
  // occupancy. Forge derives surfaceM2 + pricePerM2 server-side (honest-NULL,
  // never 0); we only render. Each pill omits cleanly when its value is null
  // and the whole strip collapses when there's neither m² nor €/m² nor a badge
  // — most historical rows have no m², the card must look intact without it.
  const surfaceLabel = formatM2(item.surfaceM2);
  const pricePerM2Label = formatPricePerM2(item.pricePerM2);
  const occupancyBadge = <OccupancyBadge occupancy={item.occupancy ?? null} />;
  const hasOccupancyBadge =
    item.occupancy === "OCUPADO" ||
    item.occupancy === "NO_OCUPADO" ||
    item.occupancy === "NO_CONSTA";
  const showFactStrip = Boolean(surfaceLabel || pricePerM2Label || hasOccupancyBadge);
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
  // Status-branched date logic (Wave52, Pixel 2026-06-04). Shared helper picks
  // the label intent off (folded) status; countdown + days badge gated to
  // active only. PROXIMA never shows "Termina en" or a fake "N d" badge.
  const dateLabel = statusDateLabel(effective);
  const isActiveLabel = dateLabel === "Termina";
  const daysBadge = isActiveLabel && hasEndDate ? formatDaysLeft(item.endDate) : null;
  const resumeDateStr = (() => {
    const v = (item as { resumeAt?: string | null }).resumeAt;
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : formatDateMed(d);
  })();

  return (
    <article
      className={cn(
        "relative flex flex-col rounded-xl border border-[var(--color-hairline)] bg-[var(--color-surface)] overflow-hidden",
        "shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-lift)] hover:border-[var(--color-brand-soft)]/40 transition-shadow",
        className,
      )}
    >
      {/* Imagery hero — 16:9 box that always shows SOMETHING (3-rung ladder).
          The ladder guarantees no blank tile and no layout shift. */}
      <Link
        href={`/auction/${encodeURIComponent(item.id)}`}
        aria-label={`Ver detalle de ${item.title}`}
        className="relative block aspect-[16/9] w-full bg-[var(--color-surface-muted)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/40"
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
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-warn-critical)] text-white shadow-[0_2px_6px_rgba(0,0,0,0.35)] ring-2 ring-white">
              <MapPin className="h-4 w-4" strokeWidth={2.5} />
            </span>
          </span>
        )}
        {/* Subtle rung-2 affordance chip — labels the thumbnail as a
            location preview rather than a photo. */}
        {resolved.isMap && !imgFailed && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full border border-[var(--color-hairline)] bg-[var(--color-surface)]/90 px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-ink-secondary)] backdrop-blur-sm"
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
        {/* Status / identity column (top-left). Vertical stack so the TYPE
            banner sits directly UNDER the status badge cluster (Wave C3,
            2026-06-07). Each row is its own flex group so badges wrap
            independently when the card is narrow. */}
        <span className="pointer-events-none absolute top-2 left-2 flex flex-col items-start gap-1.5">
          <span className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={effective} size="sm" />
            {item.auctionType && <AuctionTypeBadge type={item.auctionType} size="sm" />}
            {/* SourceBadge — sits with the other identity pills so users can
                tell at a glance whether a row came from the BOE or Seguridad
                Social. Null-safe (returns null for blank/unknown sources). */}
            <SourceBadge source={item.source} size="sm" />
          </span>
          {/* TYPE banner — Vivienda / Garaje / Coche / Moto / … */}
          <AuctionCardTypeBanner item={item} size="sm" />
        </span>
        {daysBadge && (
          <span
            className={cn(
              "pointer-events-none absolute bottom-2 left-2 tnum rounded-full px-2 py-0.5 text-[11px] font-semibold border",
              "text-[var(--color-ink-primary)]",
              daysBadge === "Hoy" || daysBadge === "1 d"
                ? "bg-[var(--color-warn-critical-soft)] border-[var(--color-warn-critical)]/40"
                : "bg-[var(--color-surface)] border-[var(--color-hairline)]",
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

      {/* Info area (Wave C3b, 2026-06-07): Dennis — halve the vertical
          footprint of everything beneath the image. Tighter padding
          (p-4 → px-3 py-2), tighter gaps (gap-3 → gap-1.5), inline price
          rows (formerly multi-row grid, now a horizontal flex with smaller
          type), inline date row. Type chip + countdown collapse into the
          same compact meta strip so the card body reads as 2–3 short lines
          rather than a tall column. */}
      <div className="flex flex-col gap-1.5 px-3 py-2">
        <Link
          href={`/auction/${encodeURIComponent(item.id)}`}
          className="block focus-visible:outline-none"
        >
          <h3 className="font-serif text-[15px] leading-tight text-[var(--color-ink-primary)] line-clamp-2 hover:underline">
            {title}
          </h3>
          {/* Vehicle subtitle + location collapse onto one tnum caption when
              both are present, so the post-title meta is a single line. */}
          {(isVehicle && item.vehicleYear) || where ? (
            <p className="mt-0.5 text-[11px] text-[var(--color-ink-tertiary)] tnum truncate">
              {isVehicle && item.vehicleYear ? item.vehicleYear : null}
              {isVehicle && item.vehicleYear && where ? " · " : null}
              {where}
            </p>
          ) : null}
        </Link>

        {/* Puja chip — own row, only when a puja status exists. Occupancy has
            moved DOWN into the idealista fact strip (under the price) so the
            scannable m²/€/m²/occupancy facts read together. */}
        {item.pujaStatus && (
          <div className="flex flex-wrap items-center gap-1">
            <PujaBadge
              status={item.pujaStatus ?? null}
              amountEuros={item.currentBidAmount ?? null}
            />
          </div>
        )}

        {/* No-price affordance — single inline caption (was a stacked
            label+value block). */}
        {noPriceData && (
          <div className="hairline-t pt-1 flex items-center justify-between gap-2 text-[11px]">
            <span className="uppercase tracking-wide text-[10px] text-[var(--color-ink-tertiary)]">
              {isVariosLotes ? "Varios lotes" : "Precio"}
            </span>
            <span className="font-medium text-[var(--color-ink-secondary)]">
              No disponible
            </span>
          </div>
        )}

        {/* Three-value price block — compact inline rows (Wave C3b). Each
            present value reads as a single row: tiny uppercase label on the
            left, number on the right. The first row reads as the prominent
            number (text-sm semibold); the rest are smaller secondary
            readings. Honest-NULL: an absent value is OMITTED. This trades
            the previous 1/2/3-column grid for a tighter stacked layout that
            costs ~50% the vertical space without compromising legibility. */}
        {valueLines.length > 0 && (
          <div className="hairline-t pt-1 flex flex-col gap-0.5">
            {valueLines.map((line, i) => (
              <div key={line.key} className="flex items-baseline justify-between gap-2 min-w-0">
                <span className="text-[10px] uppercase tracking-wide text-[var(--color-ink-tertiary)] truncate">
                  {line.label}
                </span>
                <span
                  className={cn(
                    "tnum font-semibold text-[var(--color-ink-primary)] shrink-0",
                    i === 0 ? "text-sm" : "text-[12px] text-[var(--color-ink-secondary)]",
                  )}
                >
                  {formatPrice(line.amount)}
                </span>
              </div>
            ))}
            {/* Current bid — folded into the price stack so it doesn't add
                its own padded row. */}
            {hasCurrentBid && (
              <div className="flex items-baseline justify-between gap-2 min-w-0">
                <span className="text-[10px] uppercase tracking-wide text-[var(--color-ink-tertiary)]">
                  Puja actual
                </span>
                <span className="tnum font-semibold text-[12px] text-[var(--color-ink-primary)]">
                  {formatPrice(item.currentBid)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Current bid as fallback when no other values exist (so it doesn't
            sit alone in its own padded row). */}
        {valueLines.length === 0 && hasCurrentBid && !noPriceData && (
          <div className="hairline-t pt-1 flex items-baseline justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wide text-[var(--color-ink-tertiary)]">
              Puja actual
            </span>
            <span className="tnum font-semibold text-sm text-[var(--color-ink-primary)]">
              {formatPrice(item.currentBid)}
            </span>
          </div>
        )}

        {/* Idealista FACT STRIP — surface · €/m² · occupancy. Sits directly
            under the price block. Each pill omits when its value is null
            (no orphan dashes); the whole strip collapses when there's nothing
            to show. tnum keeps the figures aligned. */}
        {showFactStrip && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[var(--color-ink-secondary)]">
            {surfaceLabel && (
              <span className="tnum font-medium text-[var(--color-ink-primary)]">
                {surfaceLabel}
              </span>
            )}
            {surfaceLabel && pricePerM2Label && (
              <span aria-hidden="true" className="text-[var(--color-ink-quiet)]">·</span>
            )}
            {pricePerM2Label && (
              <span className="tnum text-[var(--color-ink-secondary)]">
                {pricePerM2Label}
              </span>
            )}
            {hasOccupancyBadge && (surfaceLabel || pricePerM2Label) && (
              <span aria-hidden="true" className="text-[var(--color-ink-quiet)]">·</span>
            )}
            {hasOccupancyBadge && occupancyBadge}
          </div>
        )}

        {/* Bottom meta strip — type chip + countdown. Same row, no extra
            vertical air. */}
        <div className="hairline-t pt-1 flex items-center justify-between gap-2">
          {typeLabel && (
            typeLabel.toLowerCase() === "vivienda" || item.category === "Viviendas" ? (
              <span
                className="inline-flex items-center rounded-full border border-[var(--color-brand)]/30 bg-[var(--color-brand)]/[0.06] px-2 py-0.5 text-[10px] uppercase tracking-wide font-semibold text-[var(--color-brand)] truncate"
                aria-label={`Tipo: ${typeLabel}`}
                title={typeLabel}
              >
                {typeLabel}
              </span>
            ) : (
              <span
                className="text-[10px] uppercase tracking-wide text-[var(--color-ink-tertiary)] truncate"
                title={typeLabel}
              >
                {typeLabel}
              </span>
            )
          )}
          {/* Status-branched countdown / date line (Wave52, Pixel 2026-06-04).
              ACTIVE only renders the live countdown. PROXIMA / SUSPENDIDA
              never render "Termina en"; their status-appropriate date line
              shows in the row below this strip. */}
          {dateLabel === "Termina" && hasEndDate && (
            <LiveCountdown target={item.endDate} size="sm" prefix="Termina en" effectiveStatus={effective} />
          )}
        </div>

        {/* Status-branched date row + documents indicator (Wave52).
            ACTIVE  → optional "Inicio …" caption (uses opensAt when present).
            PROXIMA → "Próxima apertura: opensAt" or "· Fecha por confirmar".
                      NEVER renders endsAt/countdown for pre-auctions.
            SUSPEND → "Fecha prevista de reanudación: resumeAt" or "· Fecha
                      por confirmar".
            Terminal / unknown label → only the optional Inicio caption when
            opensAt is projected.
            Documents indicator is rendered alongside whichever date line is
            applicable, never null-collapses the row alone. */}
        {(() => {
          let dateNode: React.ReactNode = null;
          if (dateLabel === "Próxima apertura") {
            dateNode = (
              <span className="inline-flex items-center gap-1 tnum">
                <Calendar className="h-3 w-3" aria-hidden="true" />
                <span className="text-[var(--color-ink-secondary)]">Próxima apertura</span>
                {opensLabel ? (
                  <>: <span className="text-[var(--color-ink-primary)]">{opensLabel}</span></>
                ) : (
                  <> · <span className="text-[var(--color-ink-quiet)]">Fecha por confirmar</span></>
                )}
              </span>
            );
          } else if (dateLabel === "Fecha prevista de reanudación") {
            dateNode = (
              <span className="inline-flex items-center gap-1 tnum">
                <Calendar className="h-3 w-3" aria-hidden="true" />
                <span className="text-[var(--color-ink-secondary)]">Fecha prevista de reanudación</span>
                {resumeDateStr ? (
                  <>: <span className="text-[var(--color-ink-primary)]">{resumeDateStr}</span></>
                ) : (
                  <> · <span className="text-[var(--color-ink-quiet)]">Fecha por confirmar</span></>
                )}
              </span>
            );
          } else if (opensLabel) {
            // Active / unknown — keep the existing "Inicio …" caption.
            dateNode = (
              <span className="inline-flex items-center gap-1 tnum">
                <Calendar className="h-3 w-3" aria-hidden="true" />
                <span className="text-[var(--color-ink-quiet)]">Inicio </span>
                <span className="text-[var(--color-ink-secondary)]">{opensLabel}</span>
              </span>
            );
          }
          // Wave C1b (2026-06-07): the "Documentos" pill has been removed
          // from the listing cards (Dennis: ref + docs belong on the detail
          // page, not the card). Only the date line remains in this row;
          // when the date line is null the whole row collapses.
          if (!dateNode) return null;
          return (
            <div className="flex items-center gap-2 text-[10.5px] text-[var(--color-ink-tertiary)]">
              {dateNode}
            </div>
          );
        })()}

        {/* BOE direct link — compact pill, smaller padding to keep the
            info area short. */}
        {item.boeLink && (
          <a
            href={item.boeLink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "inline-flex items-center justify-center gap-1 rounded-md",
              "border border-[var(--color-brand-soft)]/30 px-2 py-1 text-[11px] font-medium",
              "text-[var(--color-brand-soft)] hover:bg-[var(--color-info-soft)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-soft)]/40",
            )}
          >
            Ir al BOE oficial →
          </a>
        )}

        {/* FREE Google Maps search link — plain hyperlink, no API/key/cost.
            Honest-NULL: rendered only when the auction has a usable location
            (address → coords → town). Does NOT replace the OSM map pin. */}
        {(() => {
          const mapsUrl = googleMapsSearchUrl({
            address: item.address,
            latitude: item.latitude,
            longitude: item.longitude,
            municipality: item.municipality,
            province: item.province,
          });
          if (!mapsUrl) return null;
          return (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              aria-label="Ver ubicación en Google Maps"
              className={cn(
                "inline-flex items-center justify-center gap-1 rounded-md",
                "border border-[var(--color-brand-soft)]/30 px-2 py-1 text-[11px] font-medium",
                "text-[var(--color-brand-soft)] hover:bg-[var(--color-info-soft)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-soft)]/40",
              )}
            >
              <MapPin className="h-3 w-3" aria-hidden="true" />
              Ver en Google Maps
            </a>
          );
        })()}
      </div>
    </article>
  );
}
