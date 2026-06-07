'use client';

/**
 * AuctionLocationMap — single-auction focused location map.
 *
 * Renders one Leaflet map tightly zoomed on a single auction's lat/lng,
 * with a labelled pin and an "Abrir en Google Maps" affordance.
 *
 * Why a dedicated component (not HierarchicalMap):
 *   The Spain-wide HierarchicalMap is designed for the country-level
 *   drilldown (Spain -> province -> municipality -> auction). Feeding it
 *   a single-item `items` array renders that one auction as a province
 *   bubble over its province center with the rest of Spain panned out —
 *   broken UX for the detail modal's "where is this property?" job.
 *
 * Behavior:
 *   - Renders only when coords are real numbers; otherwise emits a
 *     graceful empty state so the modal doesn't crash on missing data.
 *   - SSR-safe: must be loaded via dynamic({ ssr: false }) by the
 *     consumer (react-leaflet touches `window` at import time).
 *   - Honors basePath: tiles are absolute OSM URLs, no asset prefixing
 *     needed.
 */

import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { MapPin, ExternalLink } from 'lucide-react';
import { AuctionItem } from '@/types';
import { capitalizeLocation } from '@/lib/utils';

interface AuctionLocationMapProps {
  auction: AuctionItem;
  /**
   * Zoom level. Defaults to 17 (building-level, suitable for properties).
   * Use 14-15 for plots/land where the exact pin is less meaningful and
   * the surrounding context matters more.
   */
  zoom?: number;
}

/**
 * Build the "Open in Google Maps" href.
 *
 * COORDS BUG (Dennis 2026-06-07, wave-A): the previous link was always
 * `https://www.google.com/maps?q=${lat},${lng}` — i.e. it pinned by the
 * STORED coordinates regardless of accuracy. Root cause investigation
 * found that the geocode pipeline (`scraper/services/geocoding_service.py`)
 * returns Google Geocoding results with a `location_type` field that
 * commonly degrades to `GEOMETRIC_CENTER` (street/neighbourhood centre)
 * or `APPROXIMATE` (town centroid) when the BOE address is partial — but
 * we store the lat/lng without distinguishing precise from approximate
 * hits, so a row with a town-centroid coord still renders a pin "at" the
 * property. Symptom: the Google Maps link lands on the town centre, not
 * the actual address.
 *
 * Fix: when an `address` exists, build the maps link from the ADDRESS
 * itself (`/maps/search/?api=1&query=<encoded address>`). Google's
 * geocoder is more reliable than our stored centroid, so this routinely
 * lands the user on the right street/building. Only fall back to the
 * lat/lng query when the row has no address.
 *
 * Note: the visual Leaflet pin still uses the stored lat/lng — that's a
 * data-layer fix (re-geocode rows where location_type ∈ {APPROXIMATE,
 * GEOMETRIC_CENTER}). Flagged for a Ghost/scheduler follow-up wave.
 */
function buildGoogleMapsHref(
  address: string | null | undefined,
  lat: number,
  lng: number,
): string {
  const trimmed = typeof address === 'string' ? address.trim() : '';
  if (trimmed.length > 0) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`;
  }
  // No address — use the modern search-api form (more reliable than the
  // legacy `?q=` which Google increasingly treats as an old "show this
  // search" URL rather than a pin coordinate).
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

// Single, accessible blue pin. SVG inline so the basePath / asset path
// never matters — no /marker-icon.png fetch.
const createPin = () =>
  L.divIcon({
    html: `
      <div role="img" aria-label="Ubicación de la subasta" style="display:flex;align-items:center;justify-content:center;">
        <svg width="32" height="42" viewBox="0 0 24 32" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.35))">
          <path d="M12 0C7.6 0 4 3.6 4 8c0 5.4 8 16 8 16s8-10.6 8-16c0-4.4-3.6-8-8-8z" fill="#1F3A5F"/>
          <circle cx="12" cy="8" r="5" fill="white"/>
        </svg>
      </div>
    `,
    className: 'auction-location-pin',
    iconSize: [32, 42],
    iconAnchor: [16, 42],
  });

// Force a setView pass + multi-pass `invalidateSize` after mount so layout
// settles even when the map was mounted inside a Radix Dialog that animated
// open. The default Dialog zoom-in animation is ~200ms; the legacy single
// 120ms invalidate measured the container mid-animation and Leaflet
// positioned tile transforms around the wrong dimensions — the visible
// symptom (carousel-modal map overlap, 2026-06-04) was a Leaflet pin/tile
// pane that drifted up over the modal's mid-section price tiles instead of
// sitting cleanly in the Ubicación section. Retrying across the next frame
// + a longer trailing timeout re-anchors once the dialog transform settles.
const FitToProperty: React.FC<{ center: [number, number]; zoom: number }> = ({
  center,
  zoom,
}) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom, { animate: false });
    // First pass next frame — covers list/page mounts where the container
    // is already correctly sized.
    const raf = window.requestAnimationFrame(() => {
      map.invalidateSize({ animate: false });
    });
    // Second pass after the dialog open-animation ends (default 200ms +
    // safety buffer). This is the one that fixes the modal-opened bug.
    const t1 = window.setTimeout(() => {
      map.invalidateSize({ animate: false });
      map.setView(center, zoom, { animate: false });
    }, 260);
    // Third belt-and-suspenders pass after any late layout shifts above
    // the map (image lazy-loads, hairline breakpoint changes, etc.).
    const t2 = window.setTimeout(() => {
      map.invalidateSize({ animate: false });
    }, 600);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [center, zoom, map]);
  return null;
};

export const AuctionLocationMap: React.FC<AuctionLocationMapProps> = ({
  auction,
  zoom = 17,
}) => {
  const lat = typeof auction.latitude === 'number' ? auction.latitude : null;
  const lng = typeof auction.longitude === 'number' ? auction.longitude : null;

  // Empty state: no coords. Render a quiet placeholder rather than a
  // broken map. Matches the rest of the modal's tonal palette.
  if (lat === null || lng === null) {
    return (
      <div
        role="img"
        aria-label="Ubicación no disponible"
        className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center"
      >
        <MapPin className="h-8 w-8 text-gray-400" aria-hidden="true" />
        <p className="text-sm font-medium text-gray-700">
          Sin coordenadas para esta subasta
        </p>
        <p className="text-xs text-gray-500">
          El edicto no incluye una ubicación precisa.
        </p>
      </div>
    );
  }

  const center: [number, number] = [lat, lng];
  const label = [
    auction.municipality ? capitalizeLocation(auction.municipality) : null,
    auction.province ? capitalizeLocation(auction.province) : null,
  ]
    .filter(Boolean)
    .join(' - ');

  // `isolation: isolate` + `contain: layout paint` form a hard stacking-
  // context + paint boundary around the map. Pre-fix, Leaflet's internal
  // absolutely-positioned tile/marker panes interacted with the global
  // `.leaflet-container { z-index: 0 !important }` style that HierarchicalMap
  // injected on the home page and the Radix Dialog's stacking context, with
  // the visible symptom that the per-auction map's tile pane appeared to
  // float OVER the modal's mid-section content (price tiles, "Próxima
  // apertura" badge) when the carousel opened the popup. Locking layout +
  // paint inside the wrapper guarantees Leaflet's panes can never visually
  // escape this box, no matter what the surrounding stacking context does.
  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-lg border-2 border-gray-200 isolate"
      style={{ contain: 'layout paint' }}
    >
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={false}
        zoomControl
        className="h-full w-full"
        style={{ height: '100%', width: '100%' }}
      >
        <FitToProperty center={center} zoom={zoom} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <Marker position={center} icon={createPin()}>
          <Popup>
            <div className="min-w-[180px]">
              <p className="text-sm font-semibold text-gray-900">
                {auction.title}
              </p>
              {label && (
                <p className="mt-1 text-xs text-gray-600">{label}</p>
              )}
              <a
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900 hover:underline"
                href={buildGoogleMapsHref(auction.address, lat, lng)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Abrir en Google Maps
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </div>
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
};
