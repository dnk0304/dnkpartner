"use client";

/**
 * MapCategorySidebar — curated map-category rail (Wave81).
 *
 * Renders the 8 simplified "map category" buckets (Vivienda, Garaje/Trastero,
 * Solar/Terreno, Local comercial, Finca rústica, Nave industrial, Otros
 * inmuebles, Vehículos) plus an "Otros" catch-all, each with its live total
 * count for the CURRENT filter set. Clicking a row toggles the
 * `?mapCategory=<key>` filter; clicking the active row clears it. "Todas" at
 * the top resets to the unfiltered superset.
 *
 * Data source: `GET /api/auctions/counts?groupBy=mapCategory` — the curated
 * aggregator that lives in the same file as the `?mapCategory=` predicate,
 * so the rail count and the pin set / list reconcile against the same SQL
 * (count=list invariant).
 *
 * Surface contract: the API returns its `counts.total` keyed by the curated
 * KEY (`vivienda`, `garaje-trastero`, …) — not the display label. That's
 * because the aggregator sets `displayHint = mapKey` in
 * `/api/auctions/counts/route.ts` when `groupBy=mapCategory`. The display
 * label comes from `MAP_CATEGORY_LABEL` here.
 *
 * Layout: a vertical list sized to slot beside a map column. The component
 * is stateless w.r.t. selection — `selected` + `onChange` are owned by the
 * parent so URL state is the single source of truth.
 */

import * as React from "react";
import {
  Home,
  Warehouse,
  TreePine,
  Building2,
  Tractor,
  Factory,
  Boxes,
  Car,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";
import {
  MAP_CATEGORY_KEYS,
  MAP_CATEGORY_LABEL,
  MAP_CATEGORY_OTROS,
  type MapCategoryKey,
} from "@/lib/map-category";
import { apiFetch } from "@/lib/api-path";
import { cn } from "@/lib/utils";

/** Lucide glyph per curated key. Icons stay small + monochrome so the count
 *  is the dominant visual on each row. Vehicles intentionally use a sedan —
 *  Dennis explicitly wanted vehicles in the rail.
 */
const ICONS: Record<MapCategoryKey | typeof MAP_CATEGORY_OTROS, LucideIcon> = {
  vivienda: Home,
  "garaje-trastero": Warehouse,
  "solar-terreno": TreePine,
  "local-comercial": Building2,
  "finca-rustica": Tractor,
  "nave-industrial": Factory,
  "otros-inmuebles": Boxes,
  vehiculos: Car,
  otros: HelpCircle,
};

/** All keys rendered, in display order. Curated 8 + "otros" catch-all. */
const ALL_KEYS: ReadonlyArray<MapCategoryKey | typeof MAP_CATEGORY_OTROS> = [
  ...MAP_CATEGORY_KEYS,
  MAP_CATEGORY_OTROS,
];

export type MapCategorySidebarProps = {
  /** Currently selected curated key, or "" for "Todas". */
  selected: string;
  /** Called with the new key ("" clears). */
  onChange: (next: string) => void;
  /**
   * Extra query params forwarded to the counts API so the rail reconciles
   * against the EXACT same predicate the map + list use (status filter,
   * province lock, multi-select arrays, type filter, etc). Anything except
   * `mapCategory` and `groupBy` is forwarded as-is; we strip `mapCategory`
   * deliberately — the rail shows ALL bucket counts for the current
   * non-mapCategory predicate, otherwise clicking a row would zero out the
   * other rows.
   */
  apiSearchParams?: URLSearchParams | null;
  /**
   * Optional layout variant. `default` = full sidebar (used on
   * /subastas?view=map). `compact` = denser (used on the landing card).
   */
  variant?: "default" | "compact";
  /** Optional class hook for the wrapper. */
  className?: string;
  /** Override the section heading. */
  heading?: string;
};

type CountsResponse = {
  success: boolean;
  counts?: { total?: Record<string, number> };
  totals?: { total?: number };
};

export function MapCategorySidebar({
  selected,
  onChange,
  apiSearchParams,
  variant = "default",
  className,
  heading = "Categoría",
}: MapCategorySidebarProps) {
  const [counts, setCounts] = React.useState<Record<string, number>>({});
  const [grandTotal, setGrandTotal] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(true);

  // Stable query key — drop `mapCategory` (so the rail shows every bucket's
  // count under the current other-filter set) and force groupBy.
  const queryKey = React.useMemo(() => {
    const qs = new URLSearchParams(apiSearchParams?.toString() ?? "");
    qs.delete("mapCategory");
    qs.delete("groupBy");
    qs.set("groupBy", "mapCategory");
    return qs.toString();
  }, [apiSearchParams]);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await apiFetch(`/api/auctions/counts?${queryKey}`);
        if (cancelled) return;
        if (!res.ok) {
          setCounts({});
          setGrandTotal(null);
          return;
        }
        const body: CountsResponse = await res.json();
        if (cancelled) return;
        if (!body.success) {
          setCounts({});
          setGrandTotal(null);
          return;
        }
        setCounts(body.counts?.total ?? {});
        setGrandTotal(body.totals?.total ?? null);
      } catch {
        if (!cancelled) {
          setCounts({});
          setGrandTotal(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [queryKey]);

  const isCompact = variant === "compact";

  return (
    <aside
      aria-label={heading}
      className={cn(
        "rounded-xl border border-[var(--color-hairline)] bg-[var(--color-surface)] overflow-hidden",
        className,
      )}
    >
      <div
        className={cn(
          "border-b border-[var(--color-hairline)] bg-[var(--color-surface-muted)]",
          isCompact ? "px-3 py-2" : "px-4 py-2.5",
        )}
      >
        <h3
          className={cn(
            "font-display text-[var(--color-ink-primary)]",
            isCompact ? "text-[12px]" : "text-sm",
          )}
        >
          {heading}
        </h3>
      </div>

      <ul role="list" className="divide-y divide-[var(--color-hairline)]">
        <CategoryRow
          icon={null}
          label="Todas"
          count={grandTotal}
          isActive={selected === ""}
          isCompact={isCompact}
          loading={loading}
          onClick={() => onChange("")}
        />
        {ALL_KEYS.map((key) => {
          const Icon = ICONS[key];
          const label = MAP_CATEGORY_LABEL[key];
          // The API keys its `counts.total` by the curated KEY when
          // groupBy=mapCategory (see /api/auctions/counts route.ts).
          const count = counts[key] ?? 0;
          return (
            <CategoryRow
              key={key}
              icon={Icon}
              label={label}
              count={count}
              isActive={selected === key}
              isCompact={isCompact}
              loading={loading}
              onClick={() => onChange(selected === key ? "" : key)}
            />
          );
        })}
      </ul>
    </aside>
  );
}

type CategoryRowProps = {
  icon: LucideIcon | null;
  label: string;
  count: number | null;
  isActive: boolean;
  isCompact: boolean;
  loading: boolean;
  onClick: () => void;
};

function CategoryRow({
  icon: Icon,
  label,
  count,
  isActive,
  isCompact,
  loading,
  onClick,
}: CategoryRowProps) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={isActive}
        className={cn(
          "flex w-full items-center gap-2.5 text-left transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-action)]/40 focus-visible:ring-inset",
          isCompact ? "px-3 py-1.5" : "px-4 py-2.5",
          isActive
            ? "bg-[var(--color-action-soft)] text-[var(--color-ink-primary)]"
            : "bg-[var(--color-surface)] text-[var(--color-ink-secondary)] hover:bg-[var(--color-action-soft)]/60 hover:text-[var(--color-ink-primary)]",
        )}
      >
        {Icon ? (
          <Icon
            className={cn(
              "shrink-0",
              isCompact ? "h-3.5 w-3.5" : "h-4 w-4",
              isActive
                ? "text-[var(--color-action)]"
                : "text-[var(--color-ink-tertiary)]",
            )}
            aria-hidden="true"
          />
        ) : (
          <span className={cn("shrink-0", isCompact ? "h-3.5 w-3.5" : "h-4 w-4")} aria-hidden="true" />
        )}
        <span
          className={cn(
            "min-w-0 flex-1 truncate font-medium",
            isCompact ? "text-[12px]" : "text-[13px]",
          )}
        >
          {label}
        </span>
        <span
          className={cn(
            "tnum shrink-0 rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums",
            isActive
              ? "bg-[var(--color-action)] text-white"
              : "bg-[var(--color-surface-muted)] text-[var(--color-ink-tertiary)]",
          )}
        >
          {loading && count === null
            ? "…"
            : (count ?? 0).toLocaleString("es-ES")}
        </span>
      </button>
    </li>
  );
}
