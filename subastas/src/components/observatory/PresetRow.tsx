"use client";

/**
 * PresetRow — one-click filter shortcuts above the result grid.
 *
 * Wave 3 P0 (decision-free). Four presets that use ONLY existing /api/auctions
 * params (verified). The "Por provincia" preset has an inline <select> so the
 * user picks a province in-card instead of needing the sidebar.
 *
 * Each preset, when active, is visually filled (judicial-blue). Live counts
 * come from /api/auctions/counts (cached server-side ~60s). If a clean count
 * isn't available, we render the card numberless — never a misleading 0.
 *
 * Mobile: horizontal snap-scroll row; min 44×44 tap targets.
 */

import * as React from "react";
import { Home, Car, MapPin, Gavel } from "lucide-react";
import { apiFetch } from "@/lib/api-path";
import {
  ObservatoryFilters,
  PresetId,
  presetFilters,
  isPresetActive,
} from "./filters";
import { cn } from "@/lib/utils";

type CountsBlob = {
  total: Record<string, number>;
  active: Record<string, number>;
  preAuction: Record<string, number>;
  finished: Record<string, number>;
};

export type PresetRowProps = {
  filters: ObservatoryFilters;
  /** Provinces typed list (already loaded by parent for the sidebar). */
  provinces: string[];
  onApplyPreset: (patch: Partial<ObservatoryFilters>) => void;
  /** Whether to render in de-emphasized style (Advanced mode). */
  muted?: boolean;
  className?: string;
};

export function PresetRow({
  filters,
  provinces,
  onApplyPreset,
  muted = false,
  className,
}: PresetRowProps) {
  const [catCounts, setCatCounts] = React.useState<CountsBlob | null>(null);
  const [provCounts, setProvCounts] = React.useState<CountsBlob | null>(null);
  const [typeCounts, setTypeCounts] = React.useState<{ judicialActive: number | null }>({
    judicialActive: null,
  });

  // Load category + province counts once (server caches 60s).
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [catRes, provRes] = await Promise.all([
          apiFetch("/api/auctions/counts?groupBy=category"),
          apiFetch("/api/auctions/counts?groupBy=province"),
        ]);
        if (cancelled) return;
        if (catRes.ok) {
          const body = await catRes.json();
          if (body?.counts) setCatCounts(body.counts);
        }
        if (provRes.ok) {
          const body = await provRes.json();
          if (body?.counts) setProvCounts(body.counts);
        }
      } catch {
        /* silent — cards just render numberless */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Judicial count — counts endpoint doesn't groupBy auctionType, so fetch a
  // tiny page to read totalCount. Cheap (limit=1).
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(
          "/api/auctions?auctionTypes=judicial&statuses=celebrandose,proxima-apertura&page=1&limit=1",
        );
        if (cancelled || !res.ok) return;
        const body = await res.json();
        const n =
          typeof body?.pagination?.totalCount === "number" ? body.pagination.totalCount : null;
        setTypeCounts({ judicialActive: n });
      } catch {
        /* silent */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Count for "Viviendas activas" = active + preAuction for "Viviendas".
  const viviendasCount = React.useMemo(() => {
    if (!catCounts) return null;
    const k = "Viviendas";
    const a = catCounts.active?.[k] ?? 0;
    const p = catCounts.preAuction?.[k] ?? 0;
    return a + p;
  }, [catCounts]);

  const cochesCount = React.useMemo(() => {
    if (!catCounts) return null;
    const k = "Turismos";
    const a = catCounts.active?.[k] ?? 0;
    const p = catCounts.preAuction?.[k] ?? 0;
    return a + p;
  }, [catCounts]);

  const provinceCount = React.useMemo(() => {
    if (!provCounts || !filters.province) return null;
    return provCounts.active?.[filters.province] ?? null;
  }, [provCounts, filters.province]);

  const cards: Array<PresetCardSpec> = [
    {
      id: "viviendas-activas",
      label: "Viviendas activas",
      icon: <Home className="h-4 w-4" aria-hidden="true" />,
      count: viviendasCount,
    },
    {
      id: "coches",
      label: "Coches",
      icon: <Car className="h-4 w-4" aria-hidden="true" />,
      count: cochesCount,
    },
    {
      id: "por-provincia",
      label: "Por provincia",
      icon: <MapPin className="h-4 w-4" aria-hidden="true" />,
      count: provinceCount,
      isProvincePicker: true,
    },
    {
      id: "judiciales-boe",
      label: "Judiciales del BOE",
      icon: <Gavel className="h-4 w-4" aria-hidden="true" />,
      count: typeCounts.judicialActive,
    },
  ];

  return (
    <section
      aria-label="Atajos rápidos"
      className={cn(
        "w-full",
        muted && "opacity-70",
        className,
      )}
    >
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[--color-ink-tertiary]">
        Elecciones rápidas
      </div>
      <div
        className={cn(
          // Mobile: horizontal snap-scroll. Desktop: 4-col grid.
          "flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory -mx-4 px-4",
          "md:grid md:grid-cols-2 lg:grid-cols-4 md:overflow-visible md:mx-0 md:px-0 md:pb-0",
        )}
      >
        {cards.map((c) => (
          <PresetCard
            key={c.id}
            spec={c}
            active={
              c.isProvincePicker
                ? isPresetActive(filters, c.id, { province: filters.province }) && !!filters.province
                : isPresetActive(filters, c.id)
            }
            provinces={c.isProvincePicker ? provinces : undefined}
            currentProvince={filters.province}
            onClick={() =>
              c.isProvincePicker
                ? undefined // pick handled inside the card via <select>
                : onApplyPreset(presetFilters(c.id))
            }
            onProvincePick={(p) =>
              onApplyPreset(presetFilters("por-provincia", { province: p }))
            }
          />
        ))}
      </div>
    </section>
  );
}

type PresetCardSpec = {
  id: PresetId;
  label: string;
  icon: React.ReactNode;
  count: number | null;
  isProvincePicker?: boolean;
};

function PresetCard({
  spec,
  active,
  provinces,
  currentProvince,
  onClick,
  onProvincePick,
}: {
  spec: PresetCardSpec;
  active: boolean;
  provinces?: string[];
  currentProvince?: string;
  onClick: () => void;
  onProvincePick: (province: string) => void;
}) {
  if (spec.isProvincePicker) {
    return (
      <div
        className={cn(
          "snap-start shrink-0 w-[180px] md:w-auto rounded-lg border bg-[--color-surface] p-3 transition-all",
          active
            ? "border-[--color-brand] bg-[--color-brand]/5 shadow-sm"
            : "border-[--color-hairline] hover:border-[--color-brand]/40 hover:-translate-y-0.5 hover:shadow-sm",
        )}
      >
        <div className="flex items-center gap-2 text-[--color-ink-primary]">
          <span className={cn(active ? "text-[--color-brand]" : "text-[--color-ink-tertiary]")}>
            {spec.icon}
          </span>
          <span className="text-sm font-medium">{spec.label}</span>
        </div>
        <select
          value={currentProvince ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            if (v) onProvincePick(v);
          }}
          aria-label="Selecciona una provincia"
          className="mt-2 w-full rounded-md border border-[--color-hairline] bg-white px-2 py-1.5 text-xs text-[--color-ink-primary] focus:outline-none focus:border-[--color-brand] focus:ring-2 focus:ring-[--color-brand]/15 min-h-[36px]"
        >
          <option value="">Elegir provincia…</option>
          {(provinces ?? []).map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        {spec.count != null && currentProvince && (
          <div className="mt-1.5 text-[11px] tnum text-[--color-ink-tertiary]">
            <span className="font-semibold text-[--color-ink-primary]">
              {spec.count.toLocaleString("es-ES")}
            </span>{" "}
            activas
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "snap-start shrink-0 w-[160px] md:w-auto text-left rounded-lg border bg-[--color-surface] p-3 transition-all min-h-[80px]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-brand]/40",
        active
          ? "border-[--color-brand] bg-[--color-brand]/5 shadow-sm"
          : "border-[--color-hairline] hover:border-[--color-brand]/40 hover:-translate-y-0.5 hover:shadow-sm",
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn(active ? "text-[--color-brand]" : "text-[--color-ink-tertiary]")}>
          {spec.icon}
        </span>
        <span className="text-sm font-medium text-[--color-ink-primary]">{spec.label}</span>
      </div>
      {spec.count != null ? (
        <div className="mt-2 tnum text-xl font-semibold text-[--color-ink-primary] leading-none">
          {spec.count.toLocaleString("es-ES")}
        </div>
      ) : (
        // No count → omit number entirely (never render a misleading 0).
        <div className="mt-2 h-5" aria-hidden="true" />
      )}
    </button>
  );
}
