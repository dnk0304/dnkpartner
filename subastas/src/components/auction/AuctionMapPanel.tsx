"use client";

/**
 * AuctionMapPanel — interactive map with competitor-style affordances.
 *
 * Wraps the existing `AuctionLocationMap` (Leaflet/OSM) with:
 *   - A prominent "Ver en Google Maps" external action (address-based when
 *     possible — see `buildGoogleMapsHref` for the wave-A coords fix).
 *   - A "Ver vista de calle" Street View affordance (deep-link to Google
 *     Maps Street View at the same coords; free, no paid API).
 *   - An honest "ubicación aproximada" disclaimer — the BOE address is often
 *     partial and our geocode commonly falls back to street/town centroid.
 *
 * Hero mode (`variant="hero"`): when the auction has no photo we render the
 * map at hero aspect-ratio (16/9) as the page's lead visual. Same component,
 * same affordances — the photo-less detail page never falls back to an
 * empty placeholder.
 *
 * The Leaflet component itself is dynamically imported by the consumer with
 * ssr:false (it touches `window` at module load). We re-export the same
 * dynamic pattern here for direct embed if the consumer prefers.
 */

import * as React from "react";
import dynamic from "next/dynamic";
import { ExternalLink, MapPin, Eye } from "lucide-react";
import type { AuctionItem } from "@/types";
import { cn } from "@/lib/utils";

const AuctionLocationMap = dynamic(
  () =>
    import("@/components/dashboard/AuctionLocationMap").then(
      (m) => m.AuctionLocationMap,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full animate-pulse bg-[var(--color-surface-muted)]" />
    ),
  },
);

export type AuctionMapPanelProps = {
  auction: AuctionItem;
  /** "default" — sectioned panel under hero. "hero" — 16/9 lead visual. */
  variant?: "default" | "hero";
  className?: string;
};

function buildGoogleMapsHref(
  address: string | null | undefined,
  lat: number | null,
  lng: number | null,
): string | null {
  const trimmed = typeof address === "string" ? address.trim() : "";
  if (trimmed.length > 0) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`;
  }
  if (lat != null && lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  return null;
}

function buildStreetViewHref(
  lat: number | null,
  lng: number | null,
): string | null {
  if (lat == null || lng == null) return null;
  // Modern Maps Embed/Street View "viewpoint" deep-link. Free, no API key.
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
}

export function AuctionMapPanel({
  auction,
  variant = "default",
  className,
}: AuctionMapPanelProps) {
  const lat = typeof auction.latitude === "number" ? auction.latitude : null;
  const lng = typeof auction.longitude === "number" ? auction.longitude : null;
  const hasCoords = lat != null && lng != null;
  const gmapsHref = buildGoogleMapsHref(auction.address ?? null, lat, lng);
  const streetViewHref = buildStreetViewHref(lat, lng);

  if (!hasCoords) return null;

  const mapFrame =
    variant === "hero" ? (
      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg border border-[var(--color-hairline)]">
        <AuctionLocationMap auction={auction} zoom={16} />
      </div>
    ) : (
      <div className="overflow-hidden rounded-lg border border-[var(--color-hairline)]">
        <div className="relative h-72 md:h-96">
          <AuctionLocationMap auction={auction} />
        </div>
      </div>
    );

  return (
    <div className={cn("space-y-3", className)}>
      {mapFrame}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          {auction.address && (
            <p className="flex items-start gap-1.5 text-sm text-[var(--color-ink-secondary)]">
              <MapPin
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-ink-tertiary)]"
                aria-hidden="true"
              />
              <span className="break-words">{auction.address}</span>
            </p>
          )}
          <p className="mt-1 text-[11px] text-[var(--color-ink-tertiary)]">
            Ubicación aproximada. La dirección puede no ser exacta; verifícala
            siempre con el edicto oficial.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {gmapsHref && (
            <a
              href={gmapsHref}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border border-[var(--color-hairline)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-ink-secondary)]",
                "hover:border-[var(--color-brand)]/40 hover:bg-[var(--color-brand)]/5 hover:text-[var(--color-ink-primary)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/40",
              )}
              aria-label="Abrir en Google Maps (se abre en nueva pestaña)"
            >
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              Ver en Google Maps
              <ExternalLink className="h-3 w-3 opacity-60" aria-hidden="true" />
            </a>
          )}
          {streetViewHref && (
            <a
              href={streetViewHref}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border border-[var(--color-hairline)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-ink-secondary)]",
                "hover:border-[var(--color-brand)]/40 hover:bg-[var(--color-brand)]/5 hover:text-[var(--color-ink-primary)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/40",
              )}
              aria-label="Ver vista de calle (se abre en nueva pestaña)"
            >
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              Ver vista de calle
              <ExternalLink className="h-3 w-3 opacity-60" aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
