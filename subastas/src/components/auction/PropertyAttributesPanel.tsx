/**
 * PropertyAttributesPanel — the detail-page "Características" block (attrs
 * dispatch, Pixel 2026-08-19).
 *
 * The listing cards carry a compact fact strip (m² · €/m²) plus the
 * PropertyFactsBadges chips; the detail page had no equivalent home for the
 * Ghost/Catastro-enriched bien attributes UNLESS a regionBenchmark happened to
 * exist. This panel gives m² / habitaciones / baños / planta / año construcción
 * / garaje a stable, benchmark-independent home as a scannable stat grid.
 *
 * HONEST-PARTIAL-DATA DOCTRINE (Dennis/Ken-locked — the whole point of the
 * enrichment programme). Coverage is real-partial: ~45% of homes have m²,
 * bedrooms far fewer, amenities rarer still. So:
 *   - Each tile renders ONLY when its field carries a real value. Never a "0",
 *     never "N/A", never an empty slot. bedrooms/bathrooms show only for a
 *     finite value > 0 ("the listing doesn't say" ≠ "zero bedrooms").
 *   - Booleans (garage) render only on a strict `true`; an explicit `false`
 *     ("sin garaje") and a `null` (unknown) are both silent — we do not badge
 *     an absence.
 *   - The whole section returns `null` when nothing is present, so the detail
 *     page collapses it cleanly (no empty heading, no broken grid). This is the
 *     COMMON case at current fill rates and is designed for first.
 *
 * Visual register: quiet muted-hairline tiles, tnum figures, matching the
 * descriptive (non-signal) posture of PropertyFactsBadges. The coloured
 * palette stays reserved for status / puja / occupancy / the €/m² value signal.
 */

import * as React from "react";
import {
  Ruler,
  BedDouble,
  Bath,
  Layers,
  Hammer,
  Car,
  Tag,
} from "lucide-react";
import { formatM2, formatPricePerM2 } from "@/components/observatory/format";
import { posInt, formatFloor } from "@/components/observatory/PropertyFactsBadges";
import { cn } from "@/lib/utils";

export type PropertyAttributesSource = {
  surfaceM2?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  floorLevel?: string | null;
  catastroYearBuilt?: number | null;
  hasGarage?: boolean | null;
  /**
   * Dwelling-gated derived €/m² (honest-null off-dwelling / no-surface). Pass
   * ONLY when there is no regionBenchmark section to lead with the same figure
   * — the caller decides, so the €/m² is never printed twice on one page.
   */
  pricePerM2?: number | null;
};

type Tile = {
  key: string;
  icon: React.ReactNode;
  /** Scannable value ("82 m²", "3", "Planta 2", "Sí"). */
  value: string;
  /** Quiet caption under the value ("Superficie", "Habitaciones", …). */
  label: string;
};

const ICON = "h-4 w-4";

/** Build the honest tile list in reading priority order. */
function buildTiles(item: PropertyAttributesSource): Tile[] {
  const tiles: Tile[] = [];

  const surface = formatM2(item.surfaceM2);
  if (surface) {
    tiles.push({
      key: "surface",
      icon: <Ruler className={ICON} aria-hidden />,
      value: surface,
      label: "Superficie",
    });
  }

  const pricePerM2 = formatPricePerM2(item.pricePerM2);
  if (pricePerM2) {
    tiles.push({
      key: "priceM2",
      icon: <Tag className={ICON} aria-hidden />,
      value: pricePerM2,
      label: "Precio por m²",
    });
  }

  const beds = posInt(item.bedrooms);
  if (beds != null) {
    tiles.push({
      key: "beds",
      icon: <BedDouble className={ICON} aria-hidden />,
      value: String(beds),
      label: beds === 1 ? "Habitación" : "Habitaciones",
    });
  }

  const baths = posInt(item.bathrooms);
  if (baths != null) {
    tiles.push({
      key: "baths",
      icon: <Bath className={ICON} aria-hidden />,
      value: String(baths),
      label: baths === 1 ? "Baño" : "Baños",
    });
  }

  if (item.floorLevel && item.floorLevel.trim()) {
    tiles.push({
      key: "floor",
      icon: <Layers className={ICON} aria-hidden />,
      value: formatFloor(item.floorLevel),
      label: "Planta",
    });
  }

  const year = posInt(item.catastroYearBuilt);
  if (year != null) {
    tiles.push({
      key: "year",
      icon: <Hammer className={ICON} aria-hidden />,
      value: String(year),
      label: "Año de construcción",
    });
  }

  // Garage: chip only on a strict `true` (honest-null / honest-false).
  if (item.hasGarage === true) {
    tiles.push({
      key: "garage",
      icon: <Car className={ICON} aria-hidden />,
      value: "Sí",
      label: "Garaje",
    });
  }

  return tiles;
}

export interface PropertyAttributesPanelProps {
  item: PropertyAttributesSource;
  className?: string;
}

/**
 * Renders the "Características" stat grid. Returns null when there is nothing
 * honest to show (the common case at current fill rates) so the caller can
 * drop it inline and the page collapses the section cleanly.
 */
export function PropertyAttributesPanel({ item, className }: PropertyAttributesPanelProps) {
  const tiles = buildTiles(item);
  if (tiles.length === 0) return null;

  return (
    <section aria-labelledby="attrs-heading" className={className}>
      <h2
        id="attrs-heading"
        className="font-serif text-xl text-[var(--color-ink-primary)]"
      >
        Características
      </h2>
      <ul
        className={cn(
          "mt-3 grid gap-2",
          "grid-cols-2 sm:grid-cols-3",
        )}
      >
        {tiles.map((tile) => (
          <li
            key={tile.key}
            className={cn(
              "flex items-center gap-2.5 rounded-lg border px-3 py-2.5",
              "border-[var(--color-hairline)] bg-[var(--color-surface-muted)]",
            )}
          >
            <span className="shrink-0 text-[var(--color-ink-tertiary)]">{tile.icon}</span>
            <span className="min-w-0">
              <span className="block truncate tnum text-sm font-semibold text-[var(--color-ink-primary)]">
                {tile.value}
              </span>
              <span className="block truncate text-[10px] uppercase tracking-wide text-[var(--color-ink-tertiary)]">
                {tile.label}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
