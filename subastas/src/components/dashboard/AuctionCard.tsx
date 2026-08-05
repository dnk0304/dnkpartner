'use client';

import React from 'react';
import { AuctionItem, UserTier, AuctionType } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PremiumGuard } from './PremiumGuard';
import { Clock, MapPin, Gavel, Building2, Pause, CircleDollarSign, Banknote, CheckCircle, XCircle, TrendingUp, Calendar, Landmark, ArrowUpRight, FileText } from 'lucide-react';
import Image from 'next/image';
import { capitalizeLocation } from '@/lib/utils';
import { resolveCardImage, fallbackImageFor, isVariosLotesTitle } from '@/lib/resolve-card-image';
import { statusDateLabel } from '@/lib/auction-status';
import { formatM2, formatPricePerM2, titleCase, APP_TIME_ZONE } from '@/components/observatory/format';

// Hydration (#418), not style: unpinned toLocaleDateString used the HOST zone — UTC in the
// container, Europe/Madrid in the browser — so the same auction date rendered two different days.
const CARD_FMT_MED = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: APP_TIME_ZONE });
const CARD_FMT_DAY_MONTH = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: APP_TIME_ZONE });
import { OccupancyBadge } from '@/components/observatory/PujaOccupancyBadges';
import { RegionBenchmarkChip } from '@/components/observatory/RegionBenchmarkChip';
import { auctionCardTitle } from '@/lib/seo/display-title';
import { OFFICIAL_CATEGORIES } from '@/lib/constants';
import { SourceBadge } from '@/components/observatory/SourceBadge';
import { ParticiparButton } from '@/components/auction/ParticiparButton';

interface AuctionCardProps {
  item: AuctionItem;
  userTier: UserTier;
  onClick?: () => void;
}

export const AuctionCard: React.FC<AuctionCardProps> = ({ item, userTier, onClick }) => {
  // Status-branched date intent (Wave52, Pixel 2026-06-04). Drives both the
  // "Termina Pronto" urgency badge AND the footer date line — both are gated
  // to ACTIVE rows, so a pre-auction can never paint a fake countdown.
  const dateLabel = statusDateLabel(item.status);
  const isActiveLabel = dateLabel === 'Termina';
  const isUrgent = () => {
    // Only active rows can be "urgent" — a pre-auction has no real end date,
    // and a suspended row's end is the reanudación, which isn't a deadline.
    if (!isActiveLabel) return false;
    // endDate is honest-null (Forge 2026-08-05) — no end published means no
    // deadline, so it can never be urgent.
    if (!item.endDate) return false;
    const diff = item.endDate.getTime() - new Date().getTime();
    return diff > 0 && diff < 48 * 60 * 60 * 1000;
  };

  const urgent = isUrgent();
  
  // Handle both old and new status values
  const isPreAuction = item.status === 'pre-auction' || item.status === 'proxima-apertura';
  const isActive = item.status === 'active' || item.status === 'celebrandose';
  const isSuspendedStatus = item.status === 'suspendida';
  const isCancelled = item.status === 'cancelada';
  const isFinished = item.status === 'finished' || item.status === 'concluida-portal' || 
                      item.status === 'finalizada-autoridad' || isCancelled;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(amount);
  };

  // Check for suspended or rescheduled status
  const isSuspended = item.title?.toLowerCase().includes('suspendida') || 
                      item.title?.toLowerCase().includes('suspensión');
  const isRescheduled = item.title?.toLowerCase().includes('nueva fecha') || 
                        item.title?.toLowerCase().includes('prorrogada') ||
                        item.title?.toLowerCase().includes('ampliada');

  // Status badge configuration - BOE-accurate labels
  const getStatusConfig = () => {
    // New BOE-accurate statuses
    switch (item.status) {
      case 'proxima-apertura':
        return {
          label: 'Prox. apertura',
          className: 'bg-[var(--color-status-upcoming-soft)] text-[var(--color-ink-primary)] border border-[var(--color-status-upcoming)]',
          icon: <Clock className="w-3 h-3" />
        };
      case 'celebrandose':
        return {
          label: 'Celebrándose',
          className: 'bg-[var(--color-status-live-soft)] text-[var(--color-ink-primary)] border border-[var(--color-status-live)]',
          icon: <CheckCircle className="w-3 h-3" />
        };
      case 'suspendida':
        return {
          label: 'Suspendida',
          className: 'bg-[var(--color-status-suspended-soft)] text-[var(--color-ink-primary)] border border-[var(--color-status-suspended)]',
          icon: <Pause className="w-3 h-3" />
        };
      case 'cancelada':
        return {
          label: 'Cancelada',
          className: 'bg-[var(--color-status-cancelled-soft)] text-[var(--color-ink-primary)] border border-[var(--color-status-cancelled)]',
          icon: <XCircle className="w-3 h-3" />
        };
      case 'concluida-portal':
        return {
          label: 'Concluida',
          className: 'bg-[var(--color-status-concluded-soft)] text-[var(--color-ink-primary)] border border-[var(--color-status-concluded)]',
          icon: <CheckCircle className="w-3 h-3" />
        };
      case 'finalizada-autoridad':
        return {
          label: 'Finalizada',
          className: 'bg-[var(--color-status-concluded-soft)] text-[var(--color-ink-primary)] border border-[var(--color-status-concluded)]',
          icon: <CheckCircle className="w-3 h-3" />
        };
      // Legacy statuses
      case 'pre-auction':
        return {
          label: 'Pre-Subasta',
          className: 'bg-[var(--color-status-upcoming-soft)] text-[var(--color-ink-primary)] border border-[var(--color-status-upcoming)]',
          icon: <TrendingUp className="w-3 h-3" />
        };
      case 'active':
        return {
          label: 'Activa',
          className: 'bg-[var(--color-status-live-soft)] text-[var(--color-ink-primary)] border border-[var(--color-status-live)]',
          icon: <CheckCircle className="w-3 h-3" />
        };
      case 'finished':
        return {
          label: 'Finalizada',
          className: 'bg-[var(--color-status-concluded-soft)] text-[var(--color-ink-primary)] border border-[var(--color-status-concluded)]',
          icon: <XCircle className="w-3 h-3" />
        };
      default:
        return null;
    }
  };

  // Auction Type badge configuration
  const getAuctionTypeConfig = (type: AuctionType | undefined) => {
    if (!type) return null;
    
    const typeConfigs: Record<AuctionType, { label: string; className: string; icon: React.ReactNode }> = {
      'judicial': {
        label: 'Judicial',
        className: 'bg-[var(--color-action-soft)] text-[var(--color-ink-primary)] border border-[var(--color-action)]/40',
        icon: <Gavel className="w-3 h-3" />
      },
      'notarial': {
        label: 'Notarial',
        className: 'bg-[var(--color-surface-muted)] text-[var(--color-ink-primary)] border border-[var(--color-hairline)]',
        icon: <Building2 className="w-3 h-3" />
      },
      'aeat': {
        label: 'AEAT',
        className: 'bg-[var(--color-status-cancelled-soft)] text-[var(--color-ink-primary)] border border-[var(--color-status-cancelled)]/40',
        icon: <Landmark className="w-3 h-3" />
      },
      'otras_tributarias': {
        label: 'Otras tributarias',
        className: 'bg-[var(--color-status-suspended-soft)] text-[var(--color-ink-primary)] border border-[var(--color-status-suspended)]/40',
        icon: <CircleDollarSign className="w-3 h-3" />
      },
      'tributaria': {
        label: 'Otras tributarias',
        className: 'bg-[var(--color-status-suspended-soft)] text-[var(--color-ink-primary)] border border-[var(--color-status-suspended)]/40',
        icon: <CircleDollarSign className="w-3 h-3" />
      },
      'administrativas': {
        label: 'Administrativas',
        className: 'bg-[var(--color-surface-muted)] text-[var(--color-ink-primary)] border border-[var(--color-hairline)]',
        icon: <Building2 className="w-3 h-3" />
      },
      'administrativa': {
        label: 'Administrativas',
        className: 'bg-[var(--color-surface-muted)] text-[var(--color-ink-primary)] border border-[var(--color-hairline)]',
        icon: <Building2 className="w-3 h-3" />
      },
      'bancaria': {
        label: 'Bancaria',
        className: 'bg-[var(--color-status-live-soft)] text-[var(--color-ink-primary)] border border-[var(--color-status-live)]/40',
        icon: <Banknote className="w-3 h-3" />
      }
    };
    
    return typeConfigs[type] || null;
  };

  const statusConfig = getStatusConfig();
  const auctionTypeConfig = getAuctionTypeConfig(item.auctionType);

  // Card headline (2026-06-19 fix): this dashboard card previously rendered the
  // RAW `item.title` — the BOE ref code ("SUB-JA-2026-262337") — as its <h3>.
  // Wire it to the shared `auctionCardTitle` so it shows the real street +
  // house number ("Vivienda – Calle Campillo Altobuey 10") like every other
  // card surface. Property → full-street mode (via-optional, includes the
  // number, lotDescription fallback); vehicle → make/model branch.
  const isVehicleCard = item.category
    ? (OFFICIAL_CATEGORIES.MOVABLE as readonly string[]).includes(item.category)
    : false;
  const baseHeadline = auctionCardTitle({
    address: item.address,
    propertyType: item.propertyType,
    auctionType: item.auctionType,
    category: item.category,
    municipality: item.municipality,
    province: item.province,
    title: item.title,
    categoryGroup: isVehicleCard ? 'movable' : 'real_estate',
    vehicleMake: item.vehicleMake,
    vehicleModel: item.vehicleModel,
    vehicleYear: item.vehicleYear,
    lotDescription: item.lotDescription,
    useFullStreet: !isVehicleCard,
  });
  const vehicleMakeModel =
    isVehicleCard && item.vehicleMake && item.vehicleModel
      ? `${titleCase(item.vehicleMake)} ${titleCase(item.vehicleModel)}`
      : null;
  const cardTitle = vehicleMakeModel ?? baseHeadline;

  // Location chip — dedupe Town==Province (no "Valencia, Valencia"). Province
  // "Desconocida" stays the explicit "Sin ubicación" fallback below.
  const chipMuni = item.municipality ? capitalizeLocation(item.municipality) : null;
  const chipProv =
    item.province && item.province !== 'Desconocida'
      ? capitalizeLocation(item.province)
      : null;
  const chipLocation = (() => {
    if (chipMuni && chipProv && chipMuni.toLowerCase() === chipProv.toLowerCase()) {
      return chipMuni;
    }
    if (chipMuni && chipProv) return `${chipMuni}, ${chipProv}`;
    return chipMuni ?? chipProv ?? 'Sin ubicación';
  })();

  // Centralized 3-rung imagery ladder — identical logic across dashboard
  // card, observatory card/row, carousel, detail. See lib/resolve-card-image.
  const [imgFailed, setImgFailed] = React.useState(false);
  const resolved = resolveCardImage({
    imageUrl: item.imageUrl,
    hasImage: (item as { hasImage?: boolean | null }).hasImage,
    latitude: item.latitude,
    longitude: item.longitude,
    category: item.category,
    title: item.title,
    size: 'medium',
  });
  // onError safety net: a transient 404 on the real photo or the OSM tile
  // host drops to the rule-respecting fallback. Property rows fall to the
  // neutral map placeholder (never the category house cartoon); vehicle rows
  // fall to the vehicle category SVG.
  const imageSrc =
    imgFailed && resolved.rung !== 'placeholder'
      ? fallbackImageFor(resolved, item.category)
      : resolved.src;
  const imageAlt = resolved.alt;
  // Pin overlay rules:
  //   - Rung-2 (map tile, still loaded): draw a real pin at the property's
  //     centred lat/lng (the tile is panned so the point is at 50%/50%).
  //   - Rung-3 (category SVG) OR fallen-back image: draw the generic
  //     "we lack precise imagery" pin in the centre.
  const fellBackToPlaceholder = imgFailed && resolved.rung !== 'placeholder';
  const showMapPin = resolved.isMap && !imgFailed;
  const showGenericPin = resolved.isPlaceholder || fellBackToPlaceholder;
  // Ghost's split-multilot rows carry the "Varios Lotes" title and no price.
  // Show "Precio no disponible" treatment instead of "Sin Pujas" in the price
  // slot for those rows.
  // Three-value display (Dennis-locked 2026-06-04, brief
  // `three-values-card-display`): Tasación + Valor subasta + Cantidad
  // reclamada are surfaced as three labelled lines when present. Honest-NULL
  // across the board — each line is OMITTED when its field is null/≤0. The
  // first present value reads as the prominent card number; the rest stack
  // beside/under it. currentBid stays as a small caption when a bid exists.
  const isVariosLotes = isVariosLotesTitle(item.title);
  const hasTasacion = item.appraisalValue != null && Number.isFinite(item.appraisalValue) && (item.appraisalValue as number) > 0;
  const hasValorSubasta = item.valorSubasta != null && Number.isFinite(item.valorSubasta as number) && (item.valorSubasta as number) > 0;
  const hasClaimed = item.claimedAmount != null && Number.isFinite(item.claimedAmount as number) && (item.claimedAmount as number) > 0;
  const hasCurrentBid = item.currentBid != null && Number.isFinite(item.currentBid) && (item.currentBid as number) > 0;
  const noPriceData = !hasTasacion && !hasValorSubasta && !hasClaimed && !hasCurrentBid;
  // Build the labelled value list in display order. First entry becomes the
  // prominent card number; subsequent entries render slightly smaller.
  const valueLines: Array<{ key: string; label: string; amount: number }> = [];
  if (hasTasacion) valueLines.push({ key: 'tasacion', label: 'Tasación', amount: item.appraisalValue as number });
  if (hasValorSubasta) valueLines.push({ key: 'valorSubasta', label: 'Valor subasta', amount: item.valorSubasta as number });
  if (hasClaimed) valueLines.push({ key: 'claimedAmount', label: 'Cantidad reclamada', amount: item.claimedAmount as number });

  // Idealista FACT STRIP (property-card-redesign, 2026-06-19) — wired onto the
  // dashboard card too, for consistency with AuctionListCard. surfaceM2 +
  // pricePerM2 derived server-side by Forge (honest-NULL); we only render.
  // Occupancy badge is added here for the first time (dashboard card had none).
  const surfaceLabel = formatM2(item.surfaceM2);
  const pricePerM2Label = formatPricePerM2(item.pricePerM2);
  const hasOccupancyBadge =
    item.occupancy === 'OCUPADO' ||
    item.occupancy === 'NO_OCUPADO' ||
    item.occupancy === 'NO_CONSTA';
  const showFactStrip = Boolean(surfaceLabel || pricePerM2Label || hasOccupancyBadge);

  return (
    <Card 
      className={`
        group relative overflow-hidden border border-gray-200 bg-white shadow-sm transition-all duration-300 hover:shadow-lg cursor-pointer rounded-xl
        ${isPreAuction ? 'border-amber-200' : ''}
        ${isActive ? 'border-green-200' : ''}
        ${isSuspendedStatus ? 'border-yellow-200' : ''}
        ${isCancelled ? 'border-red-200 opacity-75' : ''}
      `}
      onClick={onClick}
    >
      {/* 1. Image Section - 16:9 Aspect Ratio */}
      <div className="relative aspect-video w-full bg-gray-100 overflow-hidden border-b border-gray-100">
        {/* Removed PremiumGuard from image to show map always */}
        <div className="relative w-full h-full">
          <Image
            src={imageSrc}
            alt={imageAlt}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
            className={
              resolved.isPlaceholder || fellBackToPlaceholder
                ? 'object-contain p-6 opacity-80 transition-transform duration-700 group-hover:scale-105'
                : 'object-cover transition-transform duration-700 group-hover:scale-105'
            }
            // Rung-2: pan tile so lat/lng sits under the centred pin overlay.
            style={
              showMapPin && resolved.mapPin
                ? { objectPosition: `${resolved.mapPin.xPct}% ${resolved.mapPin.yPct}%` }
                : undefined
            }
            unoptimized={resolved.isMap && !imgFailed}
            loading="lazy"
            onError={() => setImgFailed(true)}
          />

          {showMapPin && (
            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-warn-critical)] text-white shadow-[0_2px_8px_rgba(0,0,0,0.35)] ring-2 ring-white">
                <MapPin className="h-5 w-5" strokeWidth={2.5} />
              </div>
            </div>
          )}

          {showGenericPin && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="flex flex-col items-center gap-2">
                <div className="rounded-full bg-white/90 p-2 shadow-lg">
                  <MapPin className="w-6 h-6 text-red-600" />
                </div>
                {/* Honest no-imagery label (Dennis, 2026-07-05) */}
                <span className="rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-gray-700 shadow whitespace-nowrap">
                  Foto no disponible en estos momentos
                </span>
              </div>
            </div>
          )}
          
          {/* (Gradient overlay removed — location chip is now on white per black-text rule.) */}

          {/* STATUS BADGES - Top Right Corner (Simple) */}
          <div className="absolute top-3 right-3 z-20 flex flex-col gap-1.5 items-end">
            {/* Auction Type Badge - Show first if available */}
            {auctionTypeConfig && (
              <Badge className={`${auctionTypeConfig.className} border-none font-medium shadow-sm px-2.5 py-1 text-xs`}>
                <span className="flex items-center gap-1.5">
                  {auctionTypeConfig.label}
                </span>
              </Badge>
            )}
            
            {/* Status Badge */}
            {statusConfig && (
              <Badge className={`${statusConfig.className} border-none font-medium shadow-sm px-2.5 py-1 text-xs`}>
                <span className="flex items-center gap-1.5">
                  {statusConfig.label}
                </span>
              </Badge>
            )}

            {/* Source Badge — WHICH official portal this row was scraped from
                (BOE / Seguridad Social / PLABI …). Distinct from the auction
                TYPE badge above. Sits in the same top-right identity stack for
                consistency with AuctionListCard. Null-safe: renders nothing for
                a blank/unknown source, so an empty chip never appears. */}
            <SourceBadge source={item.source} size="sm" />

            {/* Suspended Badge (from title) - only if not already showing suspended status */}
            {isSuspended && !isSuspendedStatus && (
              <Badge className="bg-[var(--color-status-suspended-soft)] text-[var(--color-ink-primary)] border border-[var(--color-status-suspended)] font-bold shadow-sm px-3 py-1.5 text-xs">
                <span className="flex items-center gap-1.5">
                  <Pause className="w-3 h-3" />
                  Suspendida
                </span>
              </Badge>
            )}
            
            {/* Rescheduled Badge */}
            {isRescheduled && !isSuspended && !isSuspendedStatus && (
              <Badge className="bg-[var(--color-action-soft)] text-[var(--color-ink-primary)] border border-[var(--color-action)] font-bold shadow-sm px-3 py-1.5 text-xs">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3 h-3" />
                  Nueva Fecha
                </span>
              </Badge>
            )}
          </div>

          {/* LOCATION BADGE — moved out of the photo overlay (no white text rule).
              Rendered as a hairline-edged chip on white. */}
          <div className="absolute bottom-2 left-2 right-2 z-10">
            <div className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-hairline)] bg-[var(--color-surface)]/95 px-2 py-1 text-[12px] font-medium text-[var(--color-ink-primary)] backdrop-blur-sm max-w-full">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{chipLocation}</span>
            </div>
          </div>

          {/* URGENT BADGE - Below Location if urgent */}
          {urgent && (
            <div className="absolute top-14 left-3 z-20">
              <Badge className="bg-[var(--color-warn-critical-soft)] text-[var(--color-ink-primary)] border border-[var(--color-warn-critical)] font-bold shadow-sm px-3 py-1.5">
                <Clock className="w-3 h-3 mr-1" />
                Termina Pronto
              </Badge>
            </div>
          )}
        </div>
      </div>

      {/* 2. Content Section - Larger text for better readability */}
      <CardContent className="p-5">
        <PremiumGuard userTier={userTier} auctionStatus={item.status} blurIntensity="blur-sm">
          <div className="space-y-4">
            
            {/* Title - Larger */}
            <div>
              <div className="flex justify-between items-start gap-2">
                <h3 className="font-bold text-gray-900 line-clamp-2 text-base leading-snug group-hover:text-blue-600 transition-colors h-12" title={cardTitle}>
                  {cardTitle}
                </h3>
              </div>
            </div>

            {/* Three-value price block — Tasación · Valor subasta · Cantidad
                reclamada, each on its own labelled cell. The CSS grid
                reflows from 1→2→3 columns based on how many values are
                actually present so the card never reserves empty space.
                Honest-NULL: each cell is OMITTED when its field is null/≤0.
                currentBid demotes to a small caption row when present.
                No-price → "Precio no disponible" affordance. */}
            {noPriceData ? (
              <div className="pt-2 border-t border-gray-100 mt-2">
                <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                  {isVariosLotes ? 'Varios lotes' : 'Precio'}
                </span>
                <div className="text-base font-medium text-gray-700">
                  Precio no disponible
                </div>
              </div>
            ) : (
              <div className="pt-2 border-t border-gray-100 mt-2 space-y-2">
                {valueLines.length > 0 && (
                  <div
                    className={
                      valueLines.length === 1
                        ? ''
                        : valueLines.length === 2
                        ? 'grid grid-cols-2 gap-3'
                        : 'grid grid-cols-3 gap-3'
                    }
                  >
                    {valueLines.map((line, i) => (
                      <div
                        key={line.key}
                        className={`flex flex-col min-w-0 ${
                          i > 0 && valueLines.length === 2
                            ? 'text-right'
                            : i === valueLines.length - 1 && valueLines.length === 3
                            ? 'text-right'
                            : ''
                        }`}
                      >
                        <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                          {line.label}
                        </span>
                        <span
                          className={
                            i === 0
                              ? 'text-lg font-bold text-gray-900'
                              : 'text-base font-semibold text-gray-700'
                          }
                        >
                          {formatCurrency(line.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {hasCurrentBid && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 font-medium uppercase tracking-wide">Puja actual</span>
                    <span className="tnum font-semibold text-gray-700">
                      {formatCurrency(item.currentBid as number)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Idealista FACT STRIP — surface · €/m² · occupancy. Directly
                under the price block; each pill omits cleanly when null and
                the whole strip collapses when there's nothing to show. */}
            {showFactStrip && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--color-ink-secondary)]">
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
                {/* "vs área" value signal — honest-null (absent unless
                    regionBenchmark is present on the payload). */}
                <RegionBenchmarkChip benchmark={item.regionBenchmark} variant="card" />
                {hasOccupancyBadge && (surfaceLabel || pricePerM2Label) && (
                  <span aria-hidden="true" className="text-[var(--color-ink-quiet)]">·</span>
                )}
                {hasOccupancyBadge && <OccupancyBadge occupancy={item.occupancy ?? null} />}
              </div>
            )}

            {/* Footer Metadata — status-branched date line (Wave52, Pixel
                2026-06-04). ACTIVE shows "Termina: <endDate>". PROXIMA shows
                "Próxima apertura: <opensAt>" or "Fecha por confirmar" — NEVER
                endDate (a pre-auction's endDate is a placeholder we must not
                surface). SUSPENDIDA shows "Reanudación: <resumeAt>" or
                "Fecha por confirmar". Terminal status falls back to the
                stored endDate as a "fecha" label (the badge already says
                Finalizada/Concluida — this is just an informational date).
                Documents chip stays on the right column unchanged. */}
            <div className="flex items-center justify-between pt-3 border-t border-gray-100 text-sm mt-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-gray-500">
                {(() => {
                  const opens = item.opensAt ? new Date(item.opensAt) : null;
                  const opensValid = !!opens && !Number.isNaN(opens.getTime());
                  const resumeRaw = (item as { resumeAt?: string | null }).resumeAt;
                  const resume = resumeRaw ? new Date(resumeRaw) : null;
                  const resumeValid = !!resume && !Number.isNaN(resume.getTime());
                  if (dateLabel === 'Próxima apertura') {
                    return (
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="w-4 h-4" aria-hidden="true" />
                        <span className="tnum">
                          <span className="text-gray-400">Próxima apertura </span>
                          {opensValid
                            ? CARD_FMT_MED.format(opens!)
                            : <span className="text-gray-400">· Fecha por confirmar</span>}
                        </span>
                      </span>
                    );
                  }
                  if (dateLabel === 'Fecha prevista de reanudación') {
                    return (
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="w-4 h-4" aria-hidden="true" />
                        <span className="tnum">
                          <span className="text-gray-400">Reanudación </span>
                          {resumeValid
                            ? CARD_FMT_MED.format(resume!)
                            : <span className="text-gray-400">· Fecha por confirmar</span>}
                        </span>
                      </span>
                    );
                  }
                  // ACTIVE (or terminal/unknown): keep the established
                  // "Inicio … · Termina <endDate>" pair.
                  return (
                    <>
                      {opensValid && (
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar className="w-4 h-4" aria-hidden="true" />
                          <span className="tnum">
                            <span className="text-gray-400">Inicio </span>
                            {CARD_FMT_DAY_MONTH.format(opens!)}
                          </span>
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="w-4 h-4" aria-hidden="true" />
                        <span className="tnum">
                          {dateLabel === 'Termina' && (
                            <span className="text-gray-400">Termina </span>
                          )}
                          {item.endDate ? CARD_FMT_MED.format(item.endDate) : 'Fecha por confirmar'}
                        </span>
                      </span>
                    </>
                  );
                })()}
              </div>

              <div className="flex items-center gap-2">
                {item.hasDocuments && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-600"
                    title="Esta subasta tiene documentos oficiales adjuntos"
                    aria-label="Documentos disponibles"
                  >
                    <FileText className="w-3 h-3" aria-hidden="true" />
                    Documentos
                  </span>
                )}
                <span className="text-blue-600 font-medium hover:underline flex items-center gap-1 cursor-pointer">
                  Ver detalles <ArrowUpRight className="w-4 h-4" />
                </span>
              </div>
            </div>

          </div>
        </PremiumGuard>

        {/* Participar — kept OUTSIDE PremiumGuard so the conversion CTA is
            never blurred for a locked tier. The whole Card is clickable
            (onClick → detail), so we stop propagation here: clicking Participar
            triggers ONLY the gated /api/participar/[id] route, not card
            navigation. No official URL in the DOM. */}
        <div
          className="mt-4"
          onClick={(e) => e.stopPropagation()}
        >
          <ParticiparButton auctionId={item.id} size="sm" />
        </div>
      </CardContent>
    </Card>
  );
};
