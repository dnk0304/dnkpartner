'use client';

import React from 'react';
import { AuctionItem, AuctionDocument } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Clock, MapPin, Gavel, ExternalLink, FileText, Building2, TrendingUp, Calendar, Crown, Sparkles, Navigation, Eye, Bell, Check, Landmark, Download, Hash, Home as HomeIcon, BookOpen } from 'lucide-react';
import { capitalizeLocation } from '@/lib/utils';
import { buildCatastroUrl } from '@/lib/catastro-url';
import { apiFetch } from '@/lib/api-path';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { GatedField } from './GatedField';

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

/**
 * Detail-payload extras lazy-fetched on modal open (document-archive wave,
 * 2026-06-03). The list payload that feeds card→modal doesn't include the
 * BOE-document set or the full bien-fields block; we fetch them from the
 * canonical detail endpoint the moment the user opens the modal so the
 * download links + property-info rows light up without a page navigation.
 *
 * Every field is null-safe: while loading, or if the fetch fails, the modal
 * keeps rendering with the original card payload (graceful empty).
 */
type DetailExtras = {
  documents: AuctionDocument[];
  postalCode: string | null;
  idufir: string | null;
  registryInscription: string | null;
  legalTitle: string | null;
  bienLocalidad: string | null;
  bienProvincia: string | null;
  viviendaHabitual: boolean | null;
};

export const AuctionDetailModal: React.FC<AuctionDetailModalProps> = ({
  auction,
  open,
  onOpenChange,
}) => {
  const [isWatched, setIsWatched] = React.useState(false);
  const [extras, setExtras] = React.useState<DetailExtras | null>(null);

  // Reset watch state when auction changes
  React.useEffect(() => {
    setIsWatched(false);
  }, [auction?.id]);

  // Lazy-hydrate documents + bien fields from the canonical detail endpoint
  // when the modal opens. We seed extras from the auction prop (covers the
  // dashboard list path where /api/auctions already projects bien fields)
  // and overlay the server response when it lands. Null-safe throughout.
  React.useEffect(() => {
    if (!open || !auction?.id) {
      setExtras(null);
      return;
    }
    // Seed synchronously from whatever bien data the prop carries.
    setExtras({
      documents: [],
      postalCode: auction.postalCode ?? null,
      idufir: auction.idufir ?? null,
      registryInscription: auction.registryInscription ?? null,
      legalTitle: auction.legalTitle ?? null,
      bienLocalidad: auction.bienLocalidad ?? null,
      bienProvincia: auction.bienProvincia ?? null,
      viviendaHabitual: auction.viviendaHabitual ?? null,
    });
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`/api/auctions/${encodeURIComponent(auction.id)}`);
        if (!res.ok || cancelled) return;
        const body = await res.json();
        const a = body?.data?.auction;
        if (!a || cancelled) return;
        setExtras({
          documents: Array.isArray(a.documents) ? (a.documents as AuctionDocument[]) : [],
          postalCode: a.postalCode ?? null,
          idufir: a.idufir ?? null,
          registryInscription: a.registryInscription ?? null,
          legalTitle: a.legalTitle ?? null,
          bienLocalidad: a.bienLocalidad ?? null,
          bienProvincia: a.bienProvincia ?? null,
          viviendaHabitual: a.viviendaHabitual ?? null,
        });
      } catch {
        // Network error: keep the seeded values, no console noise.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, auction?.id, auction?.postalCode, auction?.idufir, auction?.registryInscription, auction?.legalTitle, auction?.bienLocalidad, auction?.bienProvincia, auction?.viviendaHabitual]);

  if (!auction) return null;

  // Catastro URL — null-safe. Only renders for the ~2.5% of active rows where
  // the BOE / Ghost pipeline captured a valid 20-char referencia catastral.
  // For rows without an RC (or with a malformed one) the helper returns null
  // and we render nothing — no broken link, no console error.
  const catastroUrl = buildCatastroUrl(auction.cadastralRef);

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
              // Item H: Edicto PDF is a registration-gated field. Signed-out
              // viewers see a frosted blur + "Regístrate para ver" CTA over
              // the button shape; any signed-in user (incl. FREE) sees it.
              <GatedField level="register" label="Edicto Original">
                <Button
                  variant="outline"
                  className="gap-2 h-14 text-lg font-semibold border-2 w-full"
                  onClick={() => window.open(auction.edictUrl!, '_blank')}
                >
                  <FileText className="h-6 w-6" />
                  Edicto Original
                </Button>
              </GatedField>
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

            {/* Catastro button — public Sede Electrónica record.
                Renders only when `cadastralRef` is a valid 20-char RC
                (buildCatastroUrl returns null for everything else, so the
                97.5% of rows with no RC render nothing at all here). */}
            {catastroUrl && (
              <a
                href={catastroUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Abrir la ficha en la Sede Electrónica del Catastro (se abre en nueva pestaña)"
                className="inline-flex h-14 items-center justify-center gap-2 rounded-md border-2 border-slate-300 bg-white px-4 text-lg font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                <Landmark className="h-6 w-6" aria-hidden="true" />
                Ver en Catastro
                <ExternalLink className="h-4 w-4 opacity-70" aria-hidden="true" />
              </a>
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
                {/* Item H: court / juzgado detail is registration-gated.
                    Signed-out viewers see frosted blur tease; any signed-in
                    user sees the real value. NOT SEO-public (we already
                    expose category/province/municipality as the public
                    locality signal). */}
                {auction.courtName && (
                  <GatedField level="register" label="Juzgado">
                    <div className="p-5 bg-gray-50 rounded-lg">
                      <span className="font-semibold text-gray-700 block mb-2">Juzgado:</span>
                      <p className="text-gray-900">{auction.courtName}</p>
                    </div>
                  </GatedField>
                )}

                {auction.procedureNumber && (
                  <GatedField level="register" label="Número de Procedimiento">
                    <div className="p-5 bg-gray-50 rounded-lg">
                      <span className="font-semibold text-gray-700 block mb-2">Número de Procedimiento:</span>
                      <p className="text-gray-900 font-mono text-base">{auction.procedureNumber}</p>
                    </div>
                  </GatedField>
                )}

                {auction.courtReference && (
                  <GatedField level="register" label="Referencia Judicial">
                    <div className="p-5 bg-gray-50 rounded-lg">
                      <span className="font-semibold text-gray-700 block mb-2">Referencia Judicial (NIG):</span>
                      <p className="text-gray-900 font-mono text-base">{auction.courtReference}</p>
                    </div>
                  </GatedField>
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

              {/* Item H: exact street address is registration-gated. The
                  SEO-public locality (province + municipality) stays visible
                  in the header badge above — only the precise street goes
                  behind the gate. */}
              {auction.address && (
                <GatedField level="register" label="Dirección exacta">
                  <div className="p-5 bg-gray-50 rounded-lg">
                    <span className="font-semibold text-gray-700 block mb-2 text-lg">Dirección:</span>
                    <p className="text-gray-900 text-lg">{auction.address}</p>
                  </div>
                </GatedField>
              )}

              {auction.latitude && auction.longitude ? (
                // Item H: precise map pin + coordinates are registration-
                // gated. The locality badge above gives the public,
                // SEO-indexable geo signal; this exposes a building-level pin
                // and is reserved for registered users.
                <GatedField level="register" label="Mapa preciso">
                  <div className="space-y-4">
                    <div className="h-72">
                      <AuctionLocationMap auction={auction} />
                    </div>
                    <div className="text-base text-gray-600 text-center">
                      Coordenadas: {auction.latitude.toFixed(6)}, {auction.longitude.toFixed(6)}
                    </div>
                  </div>
                </GatedField>
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

          {/* Bien-detail rows (document-archive wave, 2026-06-03). Each row
              is null-omitted so the whole block stays clean pre-backfill —
              renders nothing at all when no field is populated. */}
          {(() => {
            const fullAddress = auction.address ?? null;
            const postal = extras?.postalCode ?? auction.postalCode ?? null;
            const localidad = extras?.bienLocalidad ?? auction.bienLocalidad ?? null;
            const provincia = extras?.bienProvincia ?? auction.bienProvincia ?? null;
            const idufir = extras?.idufir ?? auction.idufir ?? null;
            const registry = extras?.registryInscription ?? auction.registryInscription ?? null;
            const legal = extras?.legalTitle ?? auction.legalTitle ?? null;
            const habitual = extras?.viviendaHabitual ?? auction.viviendaHabitual ?? null;
            const anyField =
              fullAddress || postal || localidad || provincia ||
              idufir || registry || legal || habitual != null;
            if (!anyField) return null;
            return (
              <section aria-labelledby="bien-fields-heading" className="rounded-xl border border-gray-200 bg-white p-6 lg:p-8">
                <h3
                  id="bien-fields-heading"
                  className="text-xl font-semibold flex items-center gap-2 mb-4"
                >
                  <HomeIcon className="h-6 w-6" />
                  Datos del bien
                </h3>
                <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                  {fullAddress && (
                    <BienRow label="Dirección" icon={<MapPin className="h-4 w-4" />}>
                      {fullAddress}
                    </BienRow>
                  )}
                  {postal && (
                    <BienRow label="Código postal" icon={<Hash className="h-4 w-4" />} mono>
                      {postal}
                    </BienRow>
                  )}
                  {localidad && (
                    <BienRow label="Localidad" icon={<MapPin className="h-4 w-4" />}>
                      {capitalizeLocation(localidad)}
                    </BienRow>
                  )}
                  {provincia && (
                    <BienRow label="Provincia" icon={<MapPin className="h-4 w-4" />}>
                      {capitalizeLocation(provincia)}
                    </BienRow>
                  )}
                  {idufir && (
                    <BienRow label="IDUFIR" icon={<Hash className="h-4 w-4" />} mono>
                      {idufir}
                    </BienRow>
                  )}
                  {registry && (
                    <BienRow label="Inscripción registral" icon={<BookOpen className="h-4 w-4" />}>
                      {registry}
                    </BienRow>
                  )}
                  {legal && (
                    <BienRow label="Título legal" icon={<FileText className="h-4 w-4" />}>
                      {legal}
                    </BienRow>
                  )}
                  {habitual != null && (
                    <BienRow label="Vivienda habitual" icon={<HomeIcon className="h-4 w-4" />}>
                      {habitual ? 'Sí' : 'No'}
                    </BienRow>
                  )}
                </dl>
              </section>
            );
          })()}

          {/* Documents block (document-archive wave, 2026-06-03). Each
              entry surfaces TWO actions when both URLs exist:
                • our cached copy (downloadUrl → /api/auction-doc/<id>) —
                  primary, sets `download` so the browser saves the PDF.
                • the official BOE source (officialUrl) — secondary, opens
                  in a new tab.
              When downloadUrl is null we still expose the official link so
              the user always has at least one action. Pre-backfill the
              entire section is omitted (extras?.documents is empty). */}
          {extras && extras.documents.length > 0 && (
            <section aria-labelledby="docs-heading" className="rounded-xl border border-gray-200 bg-white p-6 lg:p-8">
              <h3
                id="docs-heading"
                className="text-xl font-semibold flex items-center gap-2 mb-1"
              >
                <FileText className="h-6 w-6" />
                Documentos
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                {extras.documents.length === 1
                  ? '1 documento oficial vinculado a esta subasta.'
                  : `${extras.documents.length} documentos oficiales vinculados a esta subasta.`}
              </p>
              <ul className="space-y-3">
                {extras.documents.map((doc) => {
                  const label = doc.title?.trim() || prettifyDocType(doc.docType);
                  // Per Forge contract: downloadUrl is null when nothing
                  // cached locally — fall back to officialUrl so the user
                  // always sees at least one working action.
                  const primaryHref = doc.downloadUrl ?? doc.officialUrl;
                  return (
                    <li
                      key={doc.id}
                      className="rounded-lg border border-gray-200 p-4 hover:border-blue-200 transition-colors"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-500 mb-1">
                            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                            {prettifyDocType(doc.docType)}
                          </div>
                          <div className="font-medium text-gray-900 break-words">
                            {label}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {primaryHref && (
                            <a
                              href={primaryHref}
                              {...(doc.downloadUrl
                                ? { download: '' }
                                : { target: '_blank', rel: 'noopener noreferrer' })}
                              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 cursor-pointer"
                              aria-label={
                                doc.downloadUrl
                                  ? `Descargar ${label}`
                                  : `Abrir ${label} (fuente oficial)`
                              }
                            >
                              {doc.downloadUrl ? (
                                <>
                                  <Download className="h-4 w-4" aria-hidden="true" />
                                  Descargar
                                </>
                              ) : (
                                <>
                                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                                  Abrir BOE
                                </>
                              )}
                            </a>
                          )}
                          {/* Official BOE source — secondary action when
                              we have both a local copy AND the source URL. */}
                          {doc.downloadUrl && doc.officialUrl && (
                            <a
                              href={doc.officialUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 cursor-pointer"
                              aria-label={`Ver ${label} en el BOE`}
                            >
                              <ExternalLink className="h-4 w-4" aria-hidden="true" />
                              Fuente BOE
                            </a>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

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

/**
 * BienRow — one labelled value in the "Datos del bien" panel. Renders
 * nothing when `children` is falsy; otherwise produces a clean dt/dd row
 * with an aligned icon and label. `mono` styles the value (IDUFIR, postal
 * code) in a monospace font for legibility.
 */
function BienRow({
  label,
  icon,
  mono = false,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  mono?: boolean;
  children: React.ReactNode;
}) {
  if (children == null || children === '' || children === false) return null;
  return (
    <div className="flex items-start gap-3">
      {icon && (
        <span className="mt-0.5 text-gray-400" aria-hidden="true">
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
        <dd
          className={
            mono
              ? 'mt-0.5 font-mono text-sm text-gray-900 break-all'
              : 'mt-0.5 text-sm text-gray-900 break-words'
          }
        >
          {children}
        </dd>
      </div>
    </div>
  );
}

/**
 * Pretty label for an `AuctionDocument.docType` slug. Maps the doc-archive
 * scraper's known types into Spanish UX labels; falls back to a capitalised
 * version of the raw value so unknown future types still render readably
 * (graceful degrade — never an empty label).
 */
function prettifyDocType(docType: string | null | undefined): string {
  if (!docType) return 'Documento';
  const k = docType.toLowerCase().replace(/[-_\s]+/g, '_');
  const MAP: Record<string, string> = {
    nota_simple: 'Nota simple',
    edicto: 'Edicto',
    edicto_juzgado: 'Edicto del juzgado',
    anuncio_boe: 'Anuncio del BOE',
    tasacion: 'Tasación',
    tasación: 'Tasación',
    informe: 'Informe',
    pliego: 'Pliego de condiciones',
    pliego_condiciones: 'Pliego de condiciones',
    cargas: 'Cargas',
  };
  if (MAP[k]) return MAP[k];
  // Default: capitalise first letter of the original input.
  const trimmed = String(docType).trim();
  if (!trimmed) return 'Documento';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase().replace(/_/g, ' ');
}
