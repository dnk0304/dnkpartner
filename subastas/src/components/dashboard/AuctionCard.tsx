'use client';

import React from 'react';
import { AuctionItem, UserTier, AuctionType } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PremiumGuard } from './PremiumGuard';
import { Clock, MapPin, Gavel, Building2, Pause, CircleDollarSign, Banknote, CheckCircle, XCircle, TrendingUp, Calendar, Landmark, ArrowUpRight } from 'lucide-react';
import Image from 'next/image';
import { capitalizeLocation } from '@/lib/utils';
import { resolveCardImage, isVariosLotesTitle } from '@/lib/resolve-card-image';

interface AuctionCardProps {
  item: AuctionItem;
  userTier: UserTier;
  onClick?: () => void;
}

export const AuctionCard: React.FC<AuctionCardProps> = ({ item, userTier, onClick }) => {
  const isUrgent = () => {
    const finishedStatuses = ['finished', 'concluida-portal', 'finalizada-autoridad', 'cancelada'];
    if (finishedStatuses.includes(item.status)) return false;
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
  const resolved = resolveCardImage({
    imageUrl: item.imageUrl,
    hasImage: (item as { hasImage?: boolean | null }).hasImage,
    latitude: item.latitude,
    longitude: item.longitude,
    category: item.category,
    title: item.title,
    size: 'medium',
  });
  const imageSrc = resolved.src;
  const imageAlt = resolved.alt;
  // Center-pin overlay reserved for the rung-3 category SVG (the static map
  // already renders its own pin in the OSM tile).
  const showPinOverlay = resolved.isPlaceholder;
  // Ghost's split-multilot rows carry the "Varios Lotes" title and no price.
  // Show "Precio no disponible" treatment instead of "Sin Pujas" in the price
  // slot for those rows.
  const isVariosLotes = isVariosLotesTitle(item.title);
  const noPriceData = item.currentBid == null && item.appraisalValue == null;

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
              resolved.isPlaceholder
                ? 'object-contain p-6 opacity-80 transition-transform duration-700 group-hover:scale-105'
                : 'object-cover transition-transform duration-700 group-hover:scale-105'
            }
            unoptimized={resolved.isMap}
            loading="lazy"
          />

          {showPinOverlay && (
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

            {/* Price Grid — clear hierarchy. When both fields are absent (Ghost's
                split "Varios Lotes" rows) collapse to a single "Precio no disponible"
                line instead of two muted "Sin Pujas" / "Sin tasación" labels. */}
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
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100 mt-2">
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Puja actual</span>
                  <span className="text-lg font-bold text-gray-900">
                    {item.currentBid ? formatCurrency(item.currentBid) : 'Sin Pujas'}
                  </span>
                </div>

                <div className="flex flex-col text-right">
                  <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Tasación</span>
                  <span className="text-base font-semibold text-gray-600">
                    {item.appraisalValue ? formatCurrency(item.appraisalValue) : 'Sin tasación'}
                  </span>
                </div>
              </div>
            )}

            {/* Footer Metadata */}
            <div className="flex items-center justify-between pt-3 border-t border-gray-100 text-sm mt-2">
              <div className="flex items-center gap-1.5 text-gray-500">
                <Clock className="w-4 h-4" />
                <span>{item.endDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-blue-600 font-medium hover:underline flex items-center gap-1">
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
