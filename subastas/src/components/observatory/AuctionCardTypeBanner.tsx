"use client";

/**
 * AuctionCardTypeBanner — small TYPE chip that sits BENEATH the status badge
 * cluster on every card surface. Dennis-locked C3 (2026-06-07): the user wants
 * to see at a glance whether a CELEBRÁNDOSE row is a Vivienda or a Coche
 * without reading the title. The banner answers "what KIND of bien is this?"
 * in a single uppercase Spanish noun.
 *
 * Two label families:
 *   - Property: Vivienda / Garaje / Trastero / Solar / Local comercial /
 *               Finca rústica / Nave industrial / Otros.
 *   - Vehicle:  Coche / Moto / Barco / Camión / Industrial / Otro vehículo.
 *
 * Resolution:
 *   1. For VEHICLE rows (category ∈ VEHICLE_CATEGORIES) we map the official
 *      category to the user-friendly singular ("Turismos" → "Coche").
 *   2. For PROPERTY (everything else) we prefer the BOE-accurate
 *      `propertyType` (from the doc-archive backfill) and fall back to the
 *      row-level `category`, both run through `prettifyAuctionType` to land
 *      a clean singular ("Viviendas" → "Vivienda"). Then we collapse a few
 *      compound labels to the Dennis-locked short set ("Locales" → "Local
 *      comercial", "Otros inmuebles" → "Otros").
 *
 * Null-safe: returns null when no resolvable label exists. Hardcoded
 * Spanish strings — the rest of the UI is Spanish-default and the banner is
 * a single-token noun; an i18n round-trip would buy nothing.
 */

import * as React from "react";
import { prettifyAuctionType } from "./format";
import { cn } from "@/lib/utils";

/** Closed allow-list of vehicle categories — mirrors VEHICLE_CATEGORIES in
 *  resolve-card-image.ts. Kept local so this component has no cross-file
 *  coupling beyond `prettifyAuctionType`. */
const VEHICLE_CATEGORY_LABEL: Record<string, string> = {
  Turismos: "Coche",
  Motocicletas: "Moto",
  Barcos: "Barco",
  Embarcaciones: "Barco",
  Camiones: "Camión",
  "Vehículos Industriales": "Industrial",
  "Otros vehículos": "Otro vehículo",
};

/** Compact-label rewrites applied AFTER prettifyAuctionType has singularised
 *  the category. We rename a couple of labels so the chip stays SHORT:
 *    Local         → Local comercial (Dennis's preferred wording)
 *    Otros inmuebles → Otros
 *  Every other prettifyAuctionType output passes through unchanged. */
const PROPERTY_LABEL_REWRITES: Record<string, string> = {
  Local: "Local comercial",
  "Otros inmuebles": "Otros",
};

export type AuctionCardTypeBannerItem = {
  category?: string | null;
  propertyType?: string | null;
};

export function resolveTypeBannerLabel(
  item: AuctionCardTypeBannerItem,
): string | null {
  const category = (item.category ?? "").trim();
  if (category && VEHICLE_CATEGORY_LABEL[category]) {
    return VEHICLE_CATEGORY_LABEL[category];
  }
  // Property path — prefer propertyType (BOE-accurate); fall back to category.
  const source = (item.propertyType ?? item.category ?? "").trim();
  if (!source) return null;
  const pretty = prettifyAuctionType(source);
  if (!pretty || pretty.toLowerCase() === "subasta") return null;
  return PROPERTY_LABEL_REWRITES[pretty] ?? pretty;
}

export type AuctionCardTypeBannerProps = {
  item: AuctionCardTypeBannerItem;
  size?: "sm" | "md";
  className?: string;
};

export function AuctionCardTypeBanner({
  item,
  size = "sm",
  className,
}: AuctionCardTypeBannerProps) {
  const label = resolveTypeBannerLabel(item);
  if (!label) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 font-semibold uppercase tracking-wide",
        // Wave86 (Pixel 2026-06-08): dedicated banner token triple. The prior
        // surface/ink-secondary pair washed out on photo + map cards; the new
        // pair is a near-opaque white pill with deep ink + a soft border +
        // small shadow so the chip stands off ANY underlying image. WCAG-AA
        // ≥7:1 (deep ink on white). Longhand `var(...)` because Tailwind 4
        // drops bare-token arbitrary values.
        "border-[var(--color-banner-border)] bg-[var(--color-banner-bg)] text-[var(--color-banner-ink)]",
        "shadow-sm backdrop-blur-sm",
        size === "sm" ? "text-[10px]" : "text-xs",
        className,
      )}
      aria-label={`Tipo: ${label}`}
      title={label}
    >
      {label}
    </span>
  );
}
