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
import { MapPin, Calendar } from "lucide-react";
import { AuctionItem, type AuctionStatus } from "@/types";
import { StatusDot } from "./StatusBadge";
import { AuctionTypeBadge } from "./AuctionTypeBadge";
import { PujaBadge, OccupancyBadge } from "./PujaOccupancyBadges";
import { LiveCountdown } from "./LiveCountdown";
import { FollowButton } from "@/components/notifications/FollowButton";
import { formatPrice, capitalize, titleCase, formatDateMed, prettifyAuctionType } from "./format";
import { auctionCardTitle } from "@/lib/seo/display-title";
import { getStatusMeta, effectiveStatus } from "./status";
import { cn } from "@/lib/utils";
import { resolveCardImage, fallbackImageFor, isVariosLotesTitle } from "@/lib/resolve-card-image";
import { statusDateLabel } from "@/lib/auction-status";
import { AuctionCardTypeBanner } from "./AuctionCardTypeBanner";
import { OFFICIAL_CATEGORIES } from "@/lib/constants";

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
  // Three-value display (Dennis-locked 2026-06-04, brief
  // `three-values-card-display`): Tasación + Valor subasta + Cantidad
  // reclamada are surfaced as distinct labelled numbers. The dense table
  // row carries them across two cells — the primary (md+) renders the
  // prominent headline number; the secondary (lg+) stacks any extra labelled
  // values present. Honest-NULL across the board.
  const hasCurrentBid = item.currentBid != null && Number.isFinite(item.currentBid) && (item.currentBid as number) > 0;
  const hasTasacion = item.appraisalValue != null && Number.isFinite(item.appraisalValue) && (item.appraisalValue as number) > 0;
  const hasValorSubasta = item.valorSubasta != null && Number.isFinite(item.valorSubasta as number) && (item.valorSubasta as number) > 0;
  const hasClaimed = item.claimedAmount != null && Number.isFinite(item.claimedAmount as number) && (item.claimedAmount as number) > 0;
  const noPriceData = !hasTasacion && !hasValorSubasta && !hasClaimed && !hasCurrentBid;
  // Pick the headline: Tasación → Valor subasta → currentBid. Whichever
  // value wins is the prominent number in the primary price cell; the
  // remaining present values stack in the secondary cell.
  const headlinePrice = hasTasacion
    ? { key: "tasacion", label: "tasación", amount: item.appraisalValue as number }
    : hasValorSubasta
    ? { key: "valorSubasta", label: "valor subasta", amount: item.valorSubasta as number }
    : hasCurrentBid
    ? { key: "currentBid", label: "puja actual", amount: item.currentBid as number }
    : null;
  // Secondary stacked lines — only ones NOT used as the headline, in display
  // order (Valor subasta → Cantidad reclamada).
  const secondaryStack: Array<{ key: string; label: string; amount: number }> = [];
  if (hasValorSubasta && headlinePrice?.key !== "valorSubasta") {
    secondaryStack.push({ key: "valorSubasta", label: "valor subasta", amount: item.valorSubasta as number });
  }
  if (hasClaimed) {
    secondaryStack.push({ key: "claimedAmount", label: "cant. reclamada", amount: item.claimedAmount as number });
  }
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
  // Status-branched date intent (Wave52, Pixel 2026-06-04). The "termina en"
  // column is gated to active rows; PROXIMA and SUSPENDIDA show the static
  // labelled date instead — no countdown, no fake end date.
  const dateLabel = statusDateLabel(effective);
  const resumeDateStr = (() => {
    const v = (item as { resumeAt?: string | null }).resumeAt;
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : formatDateMed(d);
  })();

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
        {/* Vehicle subtitle — año from primera matriculación. Sits under the
            row title before the meta line. Vehicle-only. (Wave C3, 2026-06-07.) */}
        {isVehicle && item.vehicleYear && (
          <div className="mt-0.5 text-[11px] text-[--color-ink-tertiary] tnum">
            {item.vehicleYear}
          </div>
        )}
        <div className="mt-0.5 flex items-center gap-2 text-xs text-[--color-ink-tertiary] tnum">
          <span className="uppercase tracking-wide" style={{ color: meta.color }}>
            {meta.label}
          </span>
          {/* TYPE banner — Vivienda / Coche / Moto / … Sits with the status
              meta line on the dense row (no room for a true under-status
              chip — adjacent reads as the same intent). (Wave C3.) */}
          <AuctionCardTypeBanner item={item} size="sm" />
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
        {/* Stacked meta: opensAt only (Wave C1b 2026-06-07: the "Docs"
            indicator was removed — documents live on the detail page, not the
            row). The "Inicio …" caption is suppressed when the dedicated
            date column already shows the opensAt as "Próx. apertura"
            (PROXIMA rows) — avoids printing the same date twice in one row. */}
        {opensLabel && dateLabel !== "Próxima apertura" && (
          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-[--color-ink-tertiary] font-normal tnum">
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-2.5 w-2.5" aria-hidden="true" />
              Inicio {opensLabel}
            </span>
          </div>
        )}
      </td>

      {/* Primary price cell = the headline number (Tasación → Valor subasta
          → currentBid in order of presence). Below md the secondary cell is
          hidden, so any extra values fall here as small lines so the row
          never loses a number a wider viewport would show. */}
      <td className="align-top py-3 pr-3 text-right whitespace-nowrap">
        {headlinePrice ? (
          <>
            <div className="tnum text-sm font-semibold text-[--color-ink-primary]">
              {formatPrice(headlinePrice.amount)}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-[--color-ink-tertiary]">
              {headlinePrice.label}
            </div>
            {/* Below lg: the secondary cell is hidden — fold the extra
                labelled values here so a narrower viewport still sees
                Valor subasta + Cant. reclamada (just stacked under the
                headline instead of beside it). */}
            {secondaryStack.length > 0 && (
              <div className="lg:hidden mt-1 space-y-0.5">
                {secondaryStack.map((line) => (
                  <div key={line.key}>
                    <div className="tnum text-xs text-[--color-ink-secondary]">
                      {formatPrice(line.amount)}
                    </div>
                    <div className="text-[9px] uppercase tracking-wide text-[--color-ink-tertiary]">
                      {line.label}
                    </div>
                  </div>
                ))}
              </div>
            )}
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

      {/* Secondary price cell (lg+) — stacks Valor subasta + Cantidad
          reclamada when present. Each line vanishes when its field is null
          (honest-NULL). The cell collapses to a dash only when NEITHER
          extra value exists. */}
      <td className="hidden lg:table-cell align-top py-3 pr-3 text-right whitespace-nowrap">
        {secondaryStack.length > 0 ? (
          <div className="space-y-1">
            {secondaryStack.map((line) => (
              <div key={line.key}>
                <div className="tnum text-sm text-[--color-ink-secondary]">
                  {formatPrice(line.amount)}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-[--color-ink-tertiary]">
                  {line.label}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <span className="text-[10px] text-[--color-ink-tertiary]">—</span>
        )}
      </td>

      <td className="hidden md:table-cell align-top py-3 pr-3 text-right whitespace-nowrap text-xs">
        {/* Status-branched date column (Wave52, Pixel 2026-06-04).
            ACTIVE   → ticking countdown.
            PROXIMA  → "Próx. apertura · opensAt / Fecha por confirmar".
            SUSPEND  → "Reanudación · resumeAt / Fecha por confirmar".
            Terminal → em-dash (status badge handles the label). */}
        {dateLabel === "Termina" ? (
          <LiveCountdown target={item.endDate} size="sm" effectiveStatus={effective} />
        ) : dateLabel === "Próxima apertura" ? (
          <span className="tnum">
            <span className="block text-[10px] uppercase tracking-wide text-[--color-ink-tertiary]">
              Próx. apertura
            </span>
            <span className="text-[--color-ink-primary]">
              {opensLabel ?? <span className="text-[--color-ink-quiet]">Fecha por confirmar</span>}
            </span>
          </span>
        ) : dateLabel === "Fecha prevista de reanudación" ? (
          <span className="tnum">
            <span className="block text-[10px] uppercase tracking-wide text-[--color-ink-tertiary]">
              Reanudación
            </span>
            <span className="text-[--color-ink-primary]">
              {resumeDateStr ?? <span className="text-[--color-ink-quiet]">Fecha por confirmar</span>}
            </span>
          </span>
        ) : (
          <span className="tnum text-[--color-ink-quiet]">—</span>
        )}
      </td>

      <td className="align-top py-3 pr-4 whitespace-nowrap">
        <FollowButton auctionId={item.id} variant="icon" />
      </td>
    </tr>
  );
}
