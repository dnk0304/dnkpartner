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
import { SourceBadge } from "./SourceBadge";
import { PujaBadge, OccupancyBadge } from "./PujaOccupancyBadges";
import { LiveCountdown } from "./LiveCountdown";
import { FollowButton } from "@/components/notifications/FollowButton";
import {
  formatPrice,
  capitalize,
  titleCase,
  formatDaysLeft,
  formatDateMed,
} from "./format";
import { auctionCardTitle } from "@/lib/seo/display-title";
import { effectiveStatus } from "./status";
import { cn } from "@/lib/utils";
import {
  resolveCardImage,
  fallbackImageFor,
} from "@/lib/resolve-card-image";
import { statusDateLabel } from "@/lib/auction-status";
import { AuctionCardTypeBanner } from "./AuctionCardTypeBanner";
import { OFFICIAL_CATEGORIES } from "@/lib/constants";

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

  // Row title (Wave C3, 2026-06-07):
  //   - PROPERTY: short-street "{Tipo} – {Calle X}" (helper from C2),
  //     fallback "{Tipo} en {town}" when street parse fails.
  //   - VEHICLE: "{Make} {Model}" when present, else "{Tipo} en {town}".
  const isVehicle = item.category
    ? (OFFICIAL_CATEGORIES.MOVABLE as readonly string[]).includes(item.category)
    : false;
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

  // Three-value display (Dennis-locked 2026-06-04, brief
  // `three-values-card-display`): the BOE-distinct figures Tasación
  // (`appraisalValue`), Valor subasta (`valorSubasta`, NEW after Ghost's
  // 2026-06-04 split) and Cantidad reclamada (`claimedAmount`) are rendered
  // as three labelled values. Honest-NULL: a missing value is OMITTED — we
  // never coerce to 0 or "—".
  //
  // Visual hierarchy: the first present of (Tasación → Valor subasta →
  // currentBid) becomes the prominent headline number; the others render as
  // small secondary captions on the same row. Each line vanishes cleanly
  // when its field is null, so judicial rows (often Tasación=null,
  // valorSubasta=real) and AEAT rows (Tasación-only) both look clean.
  const hasTasacion = item.appraisalValue != null && Number.isFinite(item.appraisalValue) && (item.appraisalValue as number) > 0;
  const hasValorSubasta = item.valorSubasta != null && Number.isFinite(item.valorSubasta as number) && (item.valorSubasta as number) > 0;
  const hasClaimed = item.claimedAmount != null && Number.isFinite(item.claimedAmount as number) && (item.claimedAmount as number) > 0;
  const hasCurrentBid = item.currentBid != null && Number.isFinite(item.currentBid) && (item.currentBid as number) > 0;
  // Pick the headline: Tasación wins when present; else Valor subasta; else
  // currentBid (rare last resort). Whichever wins is rendered large; the
  // others slide into the secondary caption row below.
  const primaryPrice = hasTasacion
    ? { key: "tasacion", label: "Tasación", amount: item.appraisalValue as number }
    : hasValorSubasta
    ? { key: "valorSubasta", label: "Valor subasta", amount: item.valorSubasta as number }
    : hasCurrentBid
    ? { key: "currentBid", label: "Puja actual", amount: item.currentBid as number }
    : null;
  // Secondary lines — only the values NOT used as the headline, and only
  // when present (honest-NULL).
  const secondaryLines: Array<{ key: string; label: string; amount: number }> = [];
  if (hasValorSubasta && primaryPrice?.key !== "valorSubasta") {
    secondaryLines.push({ key: "valorSubasta", label: "Valor subasta", amount: item.valorSubasta as number });
  }
  if (hasClaimed) {
    secondaryLines.push({ key: "claimedAmount", label: "Cantidad reclamada", amount: item.claimedAmount as number });
  }
  if (hasCurrentBid && primaryPrice?.key !== "currentBid" && primaryPrice?.key === "tasacion") {
    // Only show "Puja actual" as a secondary caption when Tasación is the
    // headline (matches the original Pixel intent — never bury a bid under
    // the lower-tier Valor subasta).
    secondaryLines.push({ key: "currentBid", label: "Puja actual", amount: item.currentBid as number });
  }

  const hasEndDate =
    item.endDate instanceof Date
      ? !Number.isNaN(item.endDate.getTime()) && item.endDate.getTime() > 0
      : Boolean(item.endDate);
  // Status-branched date line (Wave52, Pixel 2026-06-04). The countdown +
  // "Termina en" + days-left badge are gated to active status only. PROXIMA
  // shows "Próxima apertura · opensAt / Fecha por confirmar" with NO
  // countdown — pre-auctions have no real end date. SUSPENDIDA shows
  // "Fecha prevista de reanudación · resumeAt / Fecha por confirmar".
  // Terminal status returns null and renders nothing here (the status badge
  // already says Finalizada / Concluida elsewhere).
  const dateLabel = statusDateLabel(effective);
  const isActiveLabel = dateLabel === "Termina";
  const daysBadge = isActiveLabel && hasEndDate ? formatDaysLeft(item.endDate) : null;
  const opensLabel = (() => {
    if (!item.opensAt) return null;
    const d = new Date(item.opensAt);
    return Number.isNaN(d.getTime()) ? null : formatDateMed(d);
  })();
  const resumeDateStr = (() => {
    const v = (item as { resumeAt?: string | null }).resumeAt;
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : formatDateMed(d);
  })();

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
            {/* Vehicle subtitle — año from primera matriculación. (Wave C3.) */}
            {isVehicle && item.vehicleYear && (
              <p className="mt-0.5 text-xs text-[--color-ink-tertiary] tnum">
                {item.vehicleYear}
              </p>
            )}
            {where && (
              <p className="mt-0.5 text-xs text-[--color-ink-tertiary] truncate">{where}</p>
            )}
          </Link>
        </div>

        {/* Price row — headline value (Tasación → Valor subasta → currentBid)
            shown large; remaining values appear as compact labelled captions
            on the same row. Honest-NULL: any absent value vanishes (no "—",
            no "0 €", no reserved cell). Falls back to "Precio no disponible"
            when ALL numeric fields are null. */}
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
            {secondaryLines.map((line) => (
              <span key={line.key} className="tnum text-xs text-[--color-ink-tertiary]">
                {line.label}{" "}
                <span className="text-[--color-ink-secondary]">
                  {formatPrice(line.amount)}
                </span>
              </span>
            ))}
          </div>
        ) : (
          <div className="mt-2 text-sm text-[--color-ink-secondary]">
            Precio no disponible
          </div>
        )}

        {/* Status + TYPE banner + puja/occupancy badges. The TYPE banner sits
            DIRECTLY AFTER the status badge so it reads as the "kind of bien"
            chip immediately under the status word (Wave C3, 2026-06-07). Each
            badge is null-safe so the row collapses cleanly when fields are
            absent. */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <StatusBadge status={effective} size="sm" />
          <AuctionCardTypeBanner item={item} size="sm" />
          <PujaBadge
            status={item.pujaStatus ?? null}
            amountEuros={item.currentBidAmount ?? null}
          />
          <OccupancyBadge occupancy={item.occupancy ?? null} />
          {item.auctionType && <AuctionTypeBadge type={item.auctionType} size="sm" />}
          {/* SourceBadge — null-safe (returns null for blank/unknown sources). */}
          <SourceBadge source={item.source} size="sm" />
        </div>

        {/* Short description excerpt. Hidden on the smallest viewports to keep
            the row scannable; expanded on sm+. Two-line clamp. */}
        {excerpt && (
          <p className="mt-2 hidden sm:block text-sm text-[--color-ink-secondary] line-clamp-2">
            {excerpt}
          </p>
        )}

        {/* Footer — status-branched date line (wave52 Pixel 2026-06-04).
            ACTIVE  → live "Termina en …" countdown (the real endsAt).
            PROXIMA → "Próxima apertura: opensAt" or "· Fecha por confirmar".
                      NO countdown, NO days badge — pre-auctions have no end.
            SUSPENDIDA → "Fecha prevista de reanudación: resumeAt" or "·
                         Fecha por confirmar".
            Terminal → nothing (status badge already labels it). */}
        {dateLabel === "Termina" && hasEndDate && (
          <div className="mt-2 text-xs text-[--color-ink-tertiary]">
            <LiveCountdown
              target={item.endDate}
              size="sm"
              prefix="Termina en"
              effectiveStatus={effective}
            />
          </div>
        )}
        {dateLabel === "Próxima apertura" && (
          <div className="mt-2 text-xs text-[--color-ink-tertiary] tnum">
            <span className="text-[--color-ink-secondary]">Próxima apertura</span>
            {opensLabel ? (
              <>: <span className="text-[--color-ink-primary]">{opensLabel}</span></>
            ) : (
              <> · <span className="text-[--color-ink-quiet]">Fecha por confirmar</span></>
            )}
          </div>
        )}
        {dateLabel === "Fecha prevista de reanudación" && (
          <div className="mt-2 text-xs text-[--color-ink-tertiary] tnum">
            <span className="text-[--color-ink-secondary]">Fecha prevista de reanudación</span>
            {resumeDateStr ? (
              <>: <span className="text-[--color-ink-primary]">{resumeDateStr}</span></>
            ) : (
              <> · <span className="text-[--color-ink-quiet]">Fecha por confirmar</span></>
            )}
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
