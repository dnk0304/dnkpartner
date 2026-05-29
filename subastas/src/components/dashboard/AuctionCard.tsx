'use client';

import React from 'react';
import { AuctionItem, UserTier, AuctionType } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PremiumGuard } from './PremiumGuard';
import { Clock, MapPin, Gavel, Building2, Pause, CircleDollarSign, Banknote, CheckCircle, XCircle, TrendingUp, Calendar, Landmark, ArrowUpRight } from 'lucide-react';
import Image from 'next/image';
import { capitalizeLocation } from '@/lib/utils';
import { getVehicleCategoryImageUrl } from '@/lib/vehicle-images';
import { getPropertyCategoryImageUrl } from '@/lib/property-images';
import { generateMapImageUrl, getOptimalZoom } from '@/lib/map-image';

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
          className: 'bg-amber-500 text-white',
          icon: <Clock className="w-3 h-3" />
        };
      case 'celebrandose':
        return {
          label: 'Celebrándose',
          className: 'bg-green-500 text-white',
          icon: <CheckCircle className="w-3 h-3" />
        };
      case 'suspendida':
        return {
          label: 'Suspendida',
          className: 'bg-yellow-500 text-white',
          icon: <Pause className="w-3 h-3" />
        };
      case 'cancelada':
        return {
          label: 'Cancelada',
          className: 'bg-red-500 text-white',
          icon: <XCircle className="w-3 h-3" />
        };
      case 'concluida-portal':
        return {
          label: 'Concluida',
          className: 'bg-gray-500 text-white',
          icon: <CheckCircle className="w-3 h-3" />
        };
      case 'finalizada-autoridad':
        return {
          label: 'Finalizada',
          className: 'bg-slate-500 text-white',
          icon: <CheckCircle className="w-3 h-3" />
        };
      // Legacy statuses
      case 'pre-auction':
        return {
          label: 'Pre-Subasta',
          className: 'bg-amber-500 text-white',
          icon: <TrendingUp className="w-3 h-3" />
        };
      case 'active':
        return {
          label: 'Activa',
          className: 'bg-green-500 text-white',
          icon: <CheckCircle className="w-3 h-3" />
        };
      case 'finished':
        return {
          label: 'Finalizada',
          className: 'bg-gray-500 text-white',
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
        className: 'bg-blue-500 text-white',
        icon: <Gavel className="w-3 h-3" />
      },
      'notarial': {
        label: 'Notarial',
        className: 'bg-purple-500 text-white',
        icon: <Building2 className="w-3 h-3" />
      },
      'aeat': {
        label: 'AEAT',
        className: 'bg-red-500 text-white',
        icon: <Landmark className="w-3 h-3" />
      },
      'tributaria': {
        label: 'Tributaria',
        className: 'bg-orange-500 text-white',
        icon: <CircleDollarSign className="w-3 h-3" />
      },
      'administrativa': {
        label: 'Administrativa',
        className: 'bg-gray-600 text-white',
        icon: <Building2 className="w-3 h-3" />
      },
      'bancaria': {
        label: 'Bancaria',
        className: 'bg-emerald-500 text-white',
        icon: <Banknote className="w-3 h-3" />
      }
    };
    
    return typeConfigs[type] || null;
  };

  const statusConfig = getStatusConfig();
  const auctionTypeConfig = getAuctionTypeConfig(item.auctionType);
  const isVehicleCategory = ['Turismos', 'Motocicletas', 'Vehículos Industriales', 'Barcos'].includes(item.category);
  const isPropertyCategory = ['Viviendas', 'Locales', 'Terrenos', 'Garajes', 'Trasteros', 'Fincas rústicas', 'Naves industriales', 'Otros inmuebles'].includes(item.category);

  const hasCoords = Boolean(item.latitude && item.longitude);
  
  // Determine image source based on coordinates and category
  let imageSrc: string;
  if (hasCoords) {
    // Has coordinates - show map with pinpoint
    imageSrc = generateMapImageUrl(item.latitude || null, item.longitude || null, 800, 600, getOptimalZoom(item.category));
  } else if (isVehicleCategory) {
    // Vehicle without coordinates - show vehicle-specific icon
    imageSrc = getVehicleCategoryImageUrl(item.category);
  } else if (isPropertyCategory) {
    // Property without coordinates - show property-specific icon
    imageSrc = getPropertyCategoryImageUrl(item.category);
  } else {
    // Fallback - use stored imageUrl or generic property image
    imageSrc = item.imageUrl || getPropertyCategoryImageUrl('Otros inmuebles');
  }
  
  const imageAlt = hasCoords ? 'Mapa de ubicación' : item.title;
  const showPinOverlay = !hasCoords;

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
            className="object-cover transition-transform duration-700 group-hover:scale-105"
          />

          {showPinOverlay && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="rounded-full bg-white/90 p-2 shadow-lg">
                <MapPin className="w-6 h-6 text-red-600" />
              </div>
            </div>
          )}
          
          {/* Gradient Overlay for Text Readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

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
              <Badge className="bg-orange-500 text-white border-none font-bold shadow-lg backdrop-blur-sm px-3 py-1.5 text-xs">
                <span className="flex items-center gap-1.5">
                  <Pause className="w-3 h-3" />
                  Suspendida
                </span>
              </Badge>
            )}
            
            {/* Rescheduled Badge */}
            {isRescheduled && !isSuspended && !isSuspendedStatus && (
              <Badge className="bg-blue-500 text-white border-none font-bold shadow-lg backdrop-blur-sm px-3 py-1.5 text-xs">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3 h-3" />
                  Nueva Fecha
                </span>
              </Badge>
            )}
          </div>

          {/* LOCATION BADGE - Bottom Left Overlay */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 pt-10">
            <div className="flex items-center text-white text-sm font-medium">
              <MapPin className="w-4 h-4 mr-1.5" />
              <span className="truncate">
                {item.municipality ? `${capitalizeLocation(item.municipality)}, ` : ''}
                {item.province !== 'Desconocida' ? capitalizeLocation(item.province) : 'Sin ubicación'}
              </span>
            </div>
          </div>

          {/* URGENT BADGE - Below Location if urgent */}
          {urgent && (
            <div className="absolute top-14 left-3 z-20">
              <Badge className="bg-red-500 text-white border-none font-bold animate-pulse shadow-lg shadow-red-500/40 backdrop-blur-sm px-3 py-1.5">
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

            {/* Price Grid - Clear Hierarchy and Larger */}
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
