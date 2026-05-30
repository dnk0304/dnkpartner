'use client';

import React from 'react';
import { AuctionItem } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Clock, MapPin, Gavel, ExternalLink, FileText, Building2, TrendingUp, Calendar, Crown, Sparkles, Navigation, Eye, Bell, Check } from 'lucide-react';
import { capitalizeLocation } from '@/lib/utils';
import Image from 'next/image';
import dynamic from 'next/dynamic';

// Dynamically import the per-auction location map (Leaflet needs `window`).
// Use AuctionLocationMap (single-property focus) rather than the Spain-wide
// HierarchicalMap — the modal needs a tight property pin, not the whole
// country panned out around a single province bubble.
const AuctionLocationMap = dynamic(
  () =>
    import('./AuctionLocationMap').then(mod => mod.AuctionLocationMap),
  {
    ssr: false,
    loading: () => (
      <div
        className="h-full w-full animate-pulse rounded-lg bg-gray-100"
        aria-label="Cargando mapa"
        role="status"
      />
    ),
  }
);

interface AuctionDetailModalProps {
  auction: AuctionItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AuctionDetailModal: React.FC<AuctionDetailModalProps> = ({
  auction,
  open,
  onOpenChange,
}) => {
  const [isWatched, setIsWatched] = React.useState(false);

  // Reset watch state when auction changes
  React.useEffect(() => {
    setIsWatched(false);
  }, [auction?.id]);

  if (!auction) return null;

  const formatCurrency = (amount: number | null) => {
    if (amount === null) return '---';
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const getStatusBadge = () => {
    switch (auction.status) {
      case 'active':
        return <Badge className="bg-green-500 hover:bg-green-600">Activa</Badge>;
      case 'finished':
        return <Badge variant="secondary" className="bg-gray-200 text-gray-600">Finalizada</Badge>;
      case 'pre-auction':
        return <Badge className="bg-amber-400 text-black hover:bg-amber-500">Pre-Subasta</Badge>;
    }
  };

  const daysRemaining = () => {
    if (auction.status === 'finished') return null;
    const diff = auction.endDate.getTime() - new Date().getTime();
    const days = Math.ceil(diff / (24 * 60 * 60 * 1000));
    
    if (days < 0) return 'Finalizada';
    if (days === 0) return 'Hoy';
    if (days === 1) return '1 día';
    return `${days} días`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[95vw] lg:max-w-[85vw] xl:max-w-[80vw] max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <DialogTitle className="text-3xl lg:text-4xl font-bold mb-4 pr-8 leading-tight">{auction.title}</DialogTitle>
              <div className="flex items-center gap-3 flex-wrap text-lg">
                {getStatusBadge()}
                <Badge variant="outline" className="gap-2 py-1 px-3">
                  <MapPin className="h-4 w-4" />
                  {capitalizeLocation(auction.province)}
                  {auction.municipality && ` - ${capitalizeLocation(auction.municipality)}`}
                </Badge>
                <Badge variant="outline" className="py-1 px-3">{auction.category}</Badge>
                {auction.source && (
                  <Badge variant="outline" className="gap-2 py-1 px-3">
                    <FileText className="h-4 w-4" />
                    {auction.source}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-8 mt-6">
          {/* Primary Actions - Prominent placement */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Watch Button */}
            <Button
              className={`gap-2 h-14 text-lg font-semibold border-2 transition-all ${
                isWatched 
                  ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100' 
                  : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-blue-300 hover:text-blue-600'
              }`}
              variant="outline"
              onClick={() => setIsWatched(!isWatched)}
            >
              {isWatched ? (
                <>
                  <Check className="h-6 w-6" />
                  Siguiendo
                </>
              ) : (
                <>
                  <Bell className="h-6 w-6" />
                  Seguir Subasta
                </>
              )}
            </Button>

            {/* Dynamic "View on Source" button based on auction source */}
            {auction.boeLink && (
              <Button
                className="gap-2 h-14 text-lg font-semibold"
                onClick={() => window.open(auction.boeLink!, '_blank')}
              >
                <ExternalLink className="h-6 w-6" />
                {auction.source === 'BOE' && 'Ver en BOE'}
                {auction.source === 'SERVIHABITAT' && 'Ver en Servihabitat'}
                {auction.source === 'HAYA' && 'Ver en Haya'}
                {auction.source === 'ALTAMIRA' && 'Ver en Altamira'}
                {!['BOE', 'SERVIHABITAT', 'HAYA', 'ALTAMIRA'].includes(auction.source || '') && 'Ver en Fuente'}
              </Button>
            )}

            {auction.edictUrl && !auction.isLocked && (
              <Button
                variant="outline"
                className="gap-2 h-14 text-lg font-semibold border-2"
                onClick={() => window.open(auction.edictUrl!, '_blank')}
              >
                <FileText className="h-6 w-6" />
                Edicto Original
              </Button>
            )}

            {auction.pdfUrl && !auction.isLocked && (
              <Button
                variant="outline"
                className="gap-2 h-14 text-lg font-semibold border-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                onClick={() => window.open(auction.pdfUrl!, '_blank')}
              >
                <FileText className="h-6 w-6" />
                Documento PDF
              </Button>
            )}

            {/* Google Maps button - uses mapUrl or placeUrl */}
            <Button
              variant="outline"
              className="gap-2 h-14 text-lg font-semibold border-2 border-blue-200 text-blue-700 hover:bg-blue-50"
              onClick={() => {
                const mapLink = auction.mapUrl || auction.placeUrl;
                if (mapLink) {
                  window.open(mapLink, '_blank');
                } else if (auction.latitude && auction.longitude) {
                  window.open(`https://www.google.com/maps?q=${auction.latitude},${auction.longitude}`, '_blank');
                }
              }}
              disabled={!auction.mapUrl && !auction.placeUrl && !auction.latitude && !auction.longitude}
            >
              <MapPin className="h-6 w-6" />
              Ver en Mapa
            </Button>

            {/* Street View button */}
            {auction.streetViewUrl && (
              <Button
                variant="outline"
                className="gap-2 h-14 text-lg font-semibold border-2 border-green-200 text-green-700 hover:bg-green-50"
                onClick={() => window.open(auction.streetViewUrl!, '_blank')}
              >
                <Eye className="h-6 w-6" />
                Street View
              </Button>
            )}

            {/* Directions button */}
            {auction.directionsUrl && (
              <Button
                variant="outline"
                className="gap-2 h-14 text-lg font-semibold border-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                onClick={() => window.open(auction.directionsUrl!, '_blank')}
              >
                <Navigation className="h-6 w-6" />
                Cómo Llegar
              </Button>
            )}

            {auction.isLocked && (
              <Button
                variant="outline"
                className="gap-2 border-amber-300 text-amber-600 hover:bg-amber-50 h-14 col-span-full text-lg"
                disabled
              >
                <Gavel className="h-6 w-6" />
                Requiere Suscripción Premium
              </Button>
            )}
          </div>

          {/* Image */}
          <div className="relative h-[32rem] w-full rounded-xl overflow-hidden bg-gray-100">
            <Image
              src={auction.imageUrl}
              alt={auction.title}
              fill
              className="object-cover"
            />
          </div>

          {/* Key Information Grid - Optimized for horizontal display */}
          <div className="flex flex-wrap gap-4 lg:gap-6">
            <div className="flex-1 min-w-[240px] p-6 lg:p-8 bg-emerald-50 rounded-xl border-2 border-emerald-200 hover:shadow-lg transition-shadow">
              <div className="text-xs lg:text-sm text-emerald-600 font-bold uppercase tracking-wider mb-2 lg:mb-3">
                Puja Actual
              </div>
              <div className="text-2xl lg:text-3xl xl:text-4xl font-bold text-emerald-700 whitespace-nowrap overflow-hidden text-ellipsis">
                {formatCurrency(auction.currentBid)}
              </div>
            </div>

            {auction.appraisalValue && (
              <div className="flex-1 min-w-[240px] p-6 lg:p-8 bg-blue-50 rounded-xl border-2 border-blue-200 hover:shadow-lg transition-shadow">
                <div className="text-xs lg:text-sm text-blue-600 font-bold uppercase tracking-wider mb-2 lg:mb-3">
                  Tasación
                </div>
                <div className="text-2xl lg:text-3xl xl:text-4xl font-bold text-blue-700 whitespace-nowrap overflow-hidden text-ellipsis">
                  {formatCurrency(auction.appraisalValue)}
                </div>
              </div>
            )}

            {auction.minimumBid && (
              <div className="flex-1 min-w-[240px] p-6 lg:p-8 bg-purple-50 rounded-xl border-2 border-purple-200 hover:shadow-lg transition-shadow">
                <div className="text-xs lg:text-sm text-purple-600 font-bold uppercase tracking-wider mb-2 lg:mb-3">
                  Puja Mínima
                </div>
                <div className="text-2xl lg:text-3xl xl:text-4xl font-bold text-purple-700 whitespace-nowrap overflow-hidden text-ellipsis">
                  {formatCurrency(auction.minimumBid)}
                </div>
              </div>
            )}

            {auction.status !== 'finished' && (
              <div className="flex-1 min-w-[240px] p-6 lg:p-8 bg-amber-50 rounded-xl border-2 border-amber-200 hover:shadow-lg transition-shadow">
                <div className="text-xs lg:text-sm text-amber-600 font-bold uppercase tracking-wider mb-2 lg:mb-3 flex items-center gap-2">
                  <Clock className="h-4 w-4 lg:h-5 lg:w-5" />
                  Tiempo Restante
                </div>
                <div className="text-2xl lg:text-3xl xl:text-4xl font-bold text-amber-700 whitespace-nowrap">
                  {daysRemaining()}
                </div>
              </div>
            )}
          </div>

          {/* Additional Auction Fields */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Deposit Amount (5%) */}
            {auction.appraisalValue && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="text-xs text-gray-600 font-semibold uppercase tracking-wider mb-1">
                  Depósito (5%)
                </div>
                <div className="text-xl font-bold text-gray-900">
                  {formatCurrency(auction.appraisalValue * 0.05)}
                </div>
              </div>
            )}
            
            {/* Bid Increment (2%) */}
            {auction.appraisalValue && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="text-xs text-gray-600 font-semibold uppercase tracking-wider mb-1">
                  Tramo entre pujas (2%)
                </div>
                <div className="text-xl font-bold text-gray-900">
                  {formatCurrency(auction.appraisalValue * 0.02)}
                </div>
              </div>
            )}

            {/* Views Count - if available */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="text-xs text-gray-600 font-semibold uppercase tracking-wider mb-1">
                Consultas
              </div>
              <div className="text-xl font-bold text-gray-900">
                ---
              </div>
            </div>

            {/* Favorites Count - if available */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="text-xs text-gray-600 font-semibold uppercase tracking-wider mb-1">
                Guardada en favoritas
              </div>
              <div className="text-xl font-bold text-gray-900">
                ---
              </div>
            </div>
          </div>

          <Separator />

          {/* Details in 2-column layout */}
          <div className="grid md:grid-cols-2 gap-8">
            {/* Left Column - Procedure Details */}
            <div className="space-y-5">
              <h3 className="text-2xl font-semibold flex items-center gap-2">
                <Building2 className="h-7 w-7" />
                Detalles del Procedimiento
              </h3>

              <div className="space-y-4 text-lg">
                {auction.courtName && (
                  <div className="p-5 bg-gray-50 rounded-lg">
                    <span className="font-semibold text-gray-700 block mb-2">Juzgado:</span>
                    <p className="text-gray-900">{auction.courtName}</p>
                  </div>
                )}

                {auction.procedureNumber && (
                  <div className="p-5 bg-gray-50 rounded-lg">
                    <span className="font-semibold text-gray-700 block mb-2">Número de Procedimiento:</span>
                    <p className="text-gray-900 font-mono text-base">{auction.procedureNumber}</p>
                  </div>
                )}

                {auction.courtReference && (
                  <div className="p-5 bg-gray-50 rounded-lg">
                    <span className="font-semibold text-gray-700 block mb-2">Referencia Judicial (NIG):</span>
                    <p className="text-gray-900 font-mono text-base">{auction.courtReference}</p>
                  </div>
                )}

                <div className="p-5 bg-gray-50 rounded-lg">
                  <span className="font-semibold text-gray-700 flex items-center gap-2 mb-2">
                    <Calendar className="h-6 w-6" />
                    Fecha de Fin:
                  </span>
                  <p className="text-gray-900">{formatDate(auction.endDate)}</p>
                </div>


                {auction.transitionedAt && (
                  <div className="p-5 bg-gray-50 rounded-lg">
                    <span className="font-semibold text-gray-700 block mb-2">Última Actualización:</span>
                    <p className="text-gray-900">{formatDate(auction.transitionedAt)}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column - Location Details */}
            <div className="space-y-5">
              <h3 className="text-2xl font-semibold flex items-center gap-2">
                <MapPin className="h-7 w-7" />
                Ubicación
              </h3>

              {auction.address && (
                <div className="p-5 bg-gray-50 rounded-lg">
                  <span className="font-semibold text-gray-700 block mb-2 text-lg">Dirección:</span>
                  <p className="text-gray-900 text-lg">{auction.address}</p>
                </div>
              )}

              {auction.latitude && auction.longitude ? (
                <div className="space-y-4">
                  <div className="h-72">
                    <AuctionLocationMap auction={auction} />
                  </div>
                  <div className="text-base text-gray-600 text-center">
                    Coordenadas: {auction.latitude.toFixed(6)}, {auction.longitude.toFixed(6)}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
                  <MapPin className="mx-auto h-7 w-7 text-gray-400" aria-hidden="true" />
                  <p className="mt-2 text-sm font-medium text-gray-700">
                    Sin coordenadas precisas para esta subasta
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {auction.address
                      ? 'Usa "Cómo Llegar" o "Ver en Mapa" arriba para abrir la dirección en Google Maps.'
                      : 'El edicto original no incluye una ubicación geolocalizable.'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Pre-auction notice */}
          {auction.status === 'pre-auction' && !auction.isLocked && (
            <div className="p-6 bg-amber-50 border-2 border-amber-200 rounded-xl flex items-start gap-4">
              <TrendingUp className="h-7 w-7 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-900 text-xl">Pre-Subasta (Acceso Anticipado)</p>
                <p className="text-lg text-amber-700 mt-3">
                  Esta subasta aún no está publicada oficialmente en el BOE. La información proviene de edictos judiciales previos.
                  {auction.edictUrl && " Puedes acceder al documento original haciendo clic en el botón 'Edicto Original' arriba."}
                </p>
              </div>
            </div>
          )}

          {/* Pre-auction locked notice */}
          {auction.status === 'pre-auction' && auction.isLocked && (
            <div className="p-8 bg-gradient-to-br from-amber-50 to-yellow-50 border-2 border-amber-300 rounded-xl">
              <div className="flex items-start gap-5">
                <div className="flex-shrink-0">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 flex items-center justify-center">
                    <Crown className="h-8 w-8 text-black" />
                  </div>
                </div>
                <div className="flex-1">
                  <p className="font-bold text-amber-900 text-2xl mb-3">🔒 Característica Premium</p>
                  <p className="text-lg text-amber-800 mb-5 leading-relaxed">
                    Las <strong>Pre-Subastas</strong> son una característica exclusiva para usuarios <strong>Gold</strong> y <strong>Diamond</strong>.
                    Obtén acceso anticipado a subastas antes de que se publiquen en el BOE oficial.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-4 mt-6">
                    <Button
                      className="gap-2 bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-500 hover:to-yellow-600 text-black border-none h-12 text-base"
                    >
                      <Sparkles className="h-5 w-5" />
                      Actualizar a Premium
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-2 h-12 text-base"
                    >
                      Ver Planes
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Additional info for finished auctions */}
          {auction.status === 'finished' && (
            <div className="p-6 bg-gray-50 border-2 border-gray-200 rounded-xl">
              <p className="font-semibold text-gray-900 text-xl">Subasta Finalizada</p>
              <p className="text-lg text-gray-700 mt-3">
                Esta subasta ha concluido. Los documentos originales pueden seguir estando disponibles para consulta.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

