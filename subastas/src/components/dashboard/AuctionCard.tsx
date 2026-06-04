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
          className: 'bg-[--color-status-upcoming-soft] text-[--color-ink-primary] border border-[--color-status-upcoming]',
          icon: <Clock className="w-3 h-3" />
        };
      case 'celebrandose':
        return {
          label: 'Celebrándose',
          className: 'bg-[--color-status-live-soft] text-[--color-ink-primary] border border-[--color-status-live]',
          icon: <CheckCircle className="w-3 h-3" />
        };
      case 'suspendida':
        return {
          label: 'Suspendida',
          className: 'bg-[--color-status-suspended-soft] text-[--color-ink-primary] border border-[--color-status-suspended]',
          icon: <Pause className="w-3 h-3" />
        };
      case 'cancelada':
        return {
          label: 'Cancelada',
          className: 'bg-[--color-status-cancelled-soft] text-[--color-ink-primary] border border-[--color-status-cancelled]',
          icon: <XCircle className="w-3 h-3" />
        };
      case 'concluida-portal':
        return {
          label: 'Concluida',
          className: 'bg-[--color-status-concluded-soft] text-[--color-ink-primary] border border-[--color-status-concluded]',
          icon: <CheckCircle className="w-3 h-3" />
        };
      case 'finalizada-autoridad':
        return {
          label: 'Finalizada',
          className: 'bg-[--color-status-concluded-soft] text-[--color-ink-primary] border border-[--color-status-concluded]',
          icon: <CheckCircle className="w-3 h-3" />
        };
      // Legacy statuses
      case 'pre-auction':
        return {
          label: 'Pre-Subasta',
          className: 'bg-[--color-status-upcoming-soft] text-[--color-ink-primary] border border-[--color-status-upcoming]',
          icon: <TrendingUp className="w-3 h-3" />
        };
      case 'active':
        return {
          label: 'Activa',
          className: 'bg-[--color-status-live-soft] text-[--color-ink-primary] border border-[--color-status-live]',
          icon: <CheckCircle className="w-3 h-3" />
        };
      case 'finished':
        return {
          label: 'Finalizada',
          className: 'bg-[--color-status-concluded-soft] text-[--color-ink-primary] border border-[--color-status-concluded]',
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
        className: 'bg-[--color-action-soft] text-[--color-ink-primary] border border-[--color-action]/40',
        icon: <Gavel className="w-3 h-3" />
      },
      'notarial': {
        label: 'Notarial',
        className: 'bg-[--color-surface-muted] text-[--color-ink-primary] border border-[--color-hairline]',
        icon: <Building2 className="w-3 h-3" />
      },
      'aeat': {
        label: 'AEAT',
        className: 'bg-[--color-status-cancelled-soft] text-[--color-ink-primary] border border-[--color-status-cancelled]/40',
        icon: <Landmark className="w-3 h-3" />
      },
      'otras_tributarias': {
        label: 'Otras tributarias',
        className: 'bg-[--color-status-suspended-soft] text-[--color-ink-primary] border border-[--color-status-suspended]/40',
        icon: <CircleDollarSign className="w-3 h-3" />
      },
      'tributaria': {
        label: 'Otras tributarias',
        className: 'bg-[--color-status-suspended-soft] text-[--color-ink-primary] border border-[--color-status-suspended]/40',
        icon: <CircleDollarSign className="w-3 h-3" />
      },
      'administrativas': {
        label: 'Administrativas',
        className: 'bg-[--color-surface-muted] text-[--color-ink-primary] border border-[--color-hairline]',
        icon: <Building2 className="w-3 h-3" />
      },
      'administrativa': {
        label: 'Administrativas',
        className: 'bg-[--color-surface-muted] text-[--color-ink-primary] border border-[--color-hairline]',
        icon: <Building2 className="w-3 h-3" />
      },
      'bancaria': {
        label: 'Bancaria',
        className: 'bg-[--color-status-live-soft] text-[--color-ink-primary] border border-[--color-status-live]/40',
        icon: <Banknote className="w-3 h-3" />
      }
    };
    
    return typeConfigs[type] || null;
  };

  const statusConfig = getStatusConfig();
  const auctionTypeConfig = getAuctionTypeConfig(item.auctionType);

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
  // Card price hierarchy (Dennis-locked 2026-06-03): Tasación PRIMARY,
  // Cantidad reclamada SECONDARY (gated on presence), currentBid demoted to
  // a small caption. Puja mínima never headlines the card.
  const isVariosLotes = isVariosLotesTitle(item.title);
  const hasTasacion = item.appraisalValue != null && Number.isFinite(item.appraisalValue) && (item.appraisalValue as number) > 0;
  const hasClaimed = item.claimedAmount != null && Number.isFinite(item.claimedAmount as number) && (item.claimedAmount as number) > 0;
  const hasCurrentBid = item.currentBid != null && Number.isFinite(item.currentBid) && (item.currentBid as number) > 0;
  const noPriceData = !hasTasacion && !hasClaimed && !hasCurrentBid;

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
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[--color-warn-critical] text-white shadow-[0_2px_8px_rgba(0,0,0,0.35)] ring-2 ring-white">
                <MapPin className="h-5 w-5" strokeWidth={2.5} />
              </div>
            </div>
          )}

          {showGenericPin && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="rounded-full bg-white/90 p-2 shadow-lg">
                <MapPin className="w-6 h-6 text-red-600" />
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
            
            {/* Suspended Badge (from title) - only if not already showing suspended status */}
            {isSuspended && !isSuspendedStatus && (
              <Badge className="bg-[--color-status-suspended-soft] text-[--color-ink-primary] border border-[--color-status-suspended] font-bold shadow-sm px-3 py-1.5 text-xs">
                <span className="flex items-center gap-1.5">
                  <Pause className="w-3 h-3" />
                  Suspendida
                </span>
              </Badge>
            )}
            
            {/* Rescheduled Badge */}
            {isRescheduled && !isSuspended && !isSuspendedStatus && (
              <Badge className="bg-[--color-action-soft] text-[--color-ink-primary] border border-[--color-action] font-bold shadow-sm px-3 py-1.5 text-xs">
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
            <div className="inline-flex items-center gap-1.5 rounded-md border border-[--color-hairline] bg-[--color-surface]/95 px-2 py-1 text-[12px] font-medium text-[--color-ink-primary] backdrop-blur-sm max-w-full">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                {item.municipality ? `${capitalizeLocation(item.municipality)}, ` : ''}
                {item.province !== 'Desconocida' ? capitalizeLocation(item.province) : 'Sin ubicación'}
              </span>
            </div>
          </div>

          {/* URGENT BADGE - Below Location if urgent */}
          {urgent && (
            <div className="absolute top-14 left-3 z-20">
              <Badge className="bg-[--color-warn-critical-soft] text-[--color-ink-primary] border border-[--color-warn-critical] font-bold shadow-sm px-3 py-1.5">
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
                <h3 className="font-bold text-gray-900 line-clamp-2 text-base leading-snug group-hover:text-blue-600 transition-colors h-12" title={item.title}>
                  {item.title}
                </h3>
              </div>
            </div>

            {/* Price block — Tasación PRIMARY (big bold number left), Cantidad
                reclamada SECONDARY (right cell, only when present). When
                reclamada is absent the Tasación spans the full block — no
                orphan empty cell. currentBid demotes to a small caption row
                underneath when a real bid exists. No-price → "Precio no
                disponible" affordance. */}
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
                {hasTasacion && (
                  <div
                    className={hasClaimed ? 'grid grid-cols-2 gap-3' : ''}
                  >
                    <div className="flex flex-col">
                      <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Tasación</span>
                      <span className="text-lg font-bold text-gray-900">
                        {formatCurrency(item.appraisalValue as number)}
                      </span>
                    </div>
                    {hasClaimed && (
                      <div className="flex flex-col text-right">
                        <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Cantidad reclamada</span>
                        <span className="text-base font-semibold text-gray-700">
                          {formatCurrency(item.claimedAmount as number)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                {!hasTasacion && hasClaimed && (
                  <div className="flex flex-col">
                    <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Cantidad reclamada</span>
                    <span className="text-lg font-bold text-gray-900">
                      {formatCurrency(item.claimedAmount as number)}
                    </span>
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
                  const FMT_MED: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
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
                            ? opens!.toLocaleDateString('es-ES', FMT_MED)
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
                            ? resume!.toLocaleDateString('es-ES', FMT_MED)
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
                            {opens!.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                          </span>
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="w-4 h-4" aria-hidden="true" />
                        <span className="tnum">
                          {dateLabel === 'Termina' && (
                            <span className="text-gray-400">Termina </span>
                          )}
                          {item.endDate.toLocaleDateString('es-ES', FMT_MED)}
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
      </CardContent>
    </Card>
  );
};
