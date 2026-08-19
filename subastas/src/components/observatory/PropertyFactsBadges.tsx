/**
 * PropertyFactsBadges — idealista-style property attribute chips (Phase 2,
 * 2026-07-16). Renders the Ghost/Catastro-enriched bien facts on listing
 * cards: floor, bedrooms, bathrooms, year built, cadastral use, garage,
 * storage room, terrace, garden.
 *
 * DESIGN POSTURE — descriptive, not a signal.
 *   These are NEUTRAL scannable facts (like m² / €·m²), NOT buyer cues, so
 *   they render as muted hairline chips — deliberately NOT the coloured
 *   <WarnFlag/> levels (which read as alarms/opportunities). One quiet visual
 *   register keeps the card scannable; the coloured badges stay reserved for
 *   status / puja / occupancy.
 *
 * HONEST-NULL (Dennis-locked doctrine — the whole point of Phase 1/2):
 *   - A field that is null/absent renders NOTHING. Never "0 hab.", never an
 *     empty slot, never a "—".
 *   - Booleans render a chip ONLY when strictly `true`. An explicit `false`
 *     ("sin garaje") is a real datum but we do not badge an absence; `null`
 *     (unknown) is likewise silent.
 *   - bedrooms/bathrooms render only for a finite value > 0 (accuracy VERIFIED
 *     after the 2026-07-16 dedupe_prose overcount fix; still BADGE-ONLY — the
 *     ~6-7% fill is below the density bar for a primary filter).
 *
 * Fill rates are low (2.6%–21.8%), so most cards show 0–2 chips and many show
 * none. The whole strip collapses to `null` when nothing is present — the
 * card must look intact without it.
 *
 * FUTURE FILTER INSERTION POINT: bed/bath are intentionally BADGE-ONLY. If a
 * later fill increase pushes bedrooms/bathrooms past the density bar, wire a
 * primary filter alongside the floor/garage/use/year filters (those are a
 * separate Forge-backed backend task — the list-API params don't exist yet).
 */

import * as React from "react";
import {
  BedDouble,
  Bath,
  Layers,
  Hammer,
  Building2,
  Car,
  Warehouse,
  Sun,
  Trees,
} from "lucide-react";
import { titleCase } from "./format";
import { cn } from "@/lib/utils";

export type PropertyFactsSource = {
  bedrooms?: number | null;
  bathrooms?: number | null;
  floorLevel?: string | null;
  catastroYearBuilt?: number | null;
  catastroUse?: string | null;
  hasGarage?: boolean | null;
  hasStorageRoom?: boolean | null;
  hasTerrace?: boolean | null;
  hasGarden?: boolean | null;
};

export interface PropertyFactsBadgesProps {
  item: PropertyFactsSource;
  /** Cap on visible chips (lowest-value amenities drop first). Default 6. */
  max?: number;
  className?: string;
}

type Fact = {
  key: string;
  icon: React.ReactNode;
  label: string;
  /** Optional fuller accessible label when the visible text is terse. */
  ariaLabel?: string;
};

/** Positive finite integer, else null. */
export function posInt(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return n > 0 ? n : null;
}

/**
 * Human floor label. Accepts the raw scraped string (formats vary):
 *   pure integer  → 0 ⇒ "Bajo", negative ⇒ "Sótano [n]", positive ⇒ "Planta n"
 *   anything else → the trimmed string, title-cased ("Ático", "Entreplanta",
 *                   "Principal", "3ª", …) so we never lose a real datum.
 */
export function formatFloor(raw: string): string {
  const s = raw.trim();
  if (/^-?\d+$/.test(s)) {
    const n = Number(s);
    if (n === 0) return "Bajo";
    if (n < 0) return Math.abs(n) > 1 ? `Sótano ${Math.abs(n)}` : "Sótano";
    return `Planta ${n}`;
  }
  return titleCase(s);
}

const ICON = "h-3 w-3";

/** Build the honest-null fact list in display priority order. */
function buildFacts(item: PropertyFactsSource): Fact[] {
  const facts: Fact[] = [];

  const beds = posInt(item.bedrooms);
  if (beds != null) {
    facts.push({ key: "beds", icon: <BedDouble className={ICON} aria-hidden />, label: `${beds} hab.` });
  }

  const baths = posInt(item.bathrooms);
  if (baths != null) {
    facts.push({
      key: "baths",
      icon: <Bath className={ICON} aria-hidden />,
      label: baths === 1 ? "1 baño" : `${baths} baños`,
    });
  }

  if (item.floorLevel && item.floorLevel.trim()) {
    facts.push({ key: "floor", icon: <Layers className={ICON} aria-hidden />, label: formatFloor(item.floorLevel) });
  }

  const year = posInt(item.catastroYearBuilt);
  if (year != null) {
    facts.push({
      key: "year",
      icon: <Hammer className={ICON} aria-hidden />,
      label: String(year),
      ariaLabel: `Año de construcción: ${year}`,
    });
  }

  if (item.catastroUse && item.catastroUse.trim()) {
    facts.push({
      key: "use",
      icon: <Building2 className={ICON} aria-hidden />,
      label: titleCase(item.catastroUse.trim()),
    });
  }

  // Amenity booleans — chip ONLY on strict `true` (honest-null / honest-false).
  if (item.hasGarage === true) {
    facts.push({ key: "garage", icon: <Car className={ICON} aria-hidden />, label: "Garaje" });
  }
  if (item.hasStorageRoom === true) {
    facts.push({ key: "storage", icon: <Warehouse className={ICON} aria-hidden />, label: "Trastero" });
  }
  if (item.hasTerrace === true) {
    facts.push({ key: "terrace", icon: <Sun className={ICON} aria-hidden />, label: "Terraza" });
  }
  if (item.hasGarden === true) {
    facts.push({ key: "garden", icon: <Trees className={ICON} aria-hidden />, label: "Jardín" });
  }

  return facts;
}

/**
 * Renders the property-fact chip strip. Returns null when there is nothing
 * honest to show (the common case at current fill rates).
 */
export function PropertyFactsBadges({ item, max = 6, className }: PropertyFactsBadgesProps) {
  const facts = buildFacts(item);
  if (facts.length === 0) return null;
  const visible = facts.slice(0, max);

  return (
    <ul className={cn("flex flex-wrap items-center gap-1", className)}>
      {visible.map((f) => (
        <li
          key={f.key}
          aria-label={f.ariaLabel}
          className={cn(
            "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5",
            "text-[11px] font-medium leading-[1.4]",
            "border-[var(--color-hairline)] bg-[var(--color-surface-muted)] text-[var(--color-ink-secondary)]",
          )}
        >
          <span className="text-[var(--color-ink-tertiary)]">{f.icon}</span>
          <span>{f.label}</span>
        </li>
      ))}
    </ul>
  );
}
