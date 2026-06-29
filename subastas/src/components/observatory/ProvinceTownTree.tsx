"use client";

/**
 * ProvinceTownTree — the expandable province→town navigation tree that
 * REPLACES the flat Provincia + Municipio dropdowns in the /subastas
 * "¿Dónde?" filter block.
 *
 * Forked from `src/components/dashboard/ProvinceHierarchy.tsx` (which the
 * alerts modal multi-selects against — DO NOT touch that file). This one is
 * NAVIGATION, not filter-state: clicking a province pushes
 * `/subastas/{provinciaSlug}`; clicking a town pushes
 * `/subastas/{provinciaSlug}/{municipioSlug}`. Other active filters travel
 * along as querystring on top.
 *
 * Visuals (Dennis mockup, Niki-confirmed):
 *  - Province row: chevron + name + 3 count badges:
 *      green = activas · amber = próximas · grey = total
 *    Badges hidden when their count is 0 (the row stays).
 *  - Town row (lazy-loaded on expand): name + green=activas / amber=próximas.
 *    Towns with 0 active still listed; no badges when 0.
 *
 * Data:
 *  - Province counts: GET /api/auctions/counts?groupBy=province
 *    (canonical 52-province fold — wave59 / forge 94cfbe1).
 *  - Town counts:    GET /api/auctions/counts?groupBy=municipality&province=X
 *    (counts.active + counts.preAuction + counts.total). The town list comes
 *    from `counts.total` so historical 0-active towns still appear.
 *
 * Slugs:
 *  - Provinces: PROVINCE_DB_KEY_TO_SLUG (canonical, build-time).
 *  - Towns: same `slugify` the server's `municipalitiesInProvince` uses, so
 *    a clicked town round-trips through the [slug]/[municipio] resolver.
 *  - The town resolver only matches active municipalities; a 0-active
 *    historical town would 404. We render those as plain text rows instead
 *    of links so we never hand the user a dead URL.
 *
 * Locked branches are NOT this component's job — the parent (FiltersSidebar)
 * still renders the locked-chip for SEO province/town pages. The tree is
 * mounted only when there's nothing locked.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { apiFetch } from "@/lib/api-path";
import {
  PROVINCE_DB_KEY_TO_SLUG,
  slugify,
} from "@/lib/seo/slugs";
import { SPAIN_PROVINCES } from "@/lib/spain-provinces";
import { ObservatoryFilters, paramsFromFilters } from "./filters";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProvinceCounts = { active: number; proximas: number; total: number };

type TownRow = {
  /** Exact DB municipality name (display + active-resolver key). */
  name: string;
  /** Canonical slug (`slugify(name)`). Matches the server's town-page
   *  resolver. Towns with 0 active won't resolve — see `hasActive` below. */
  slug: string;
  active: number;
  proximas: number;
  total: number;
};

export type ProvinceTownTreeProps = {
  /** Current filter draft — preserved as querystring when navigating. */
  filters: ObservatoryFilters;
  /** Max height for the scroll region. Defaults to 360px so the surrounding
   *  sidebar groups (Valor subasta, Depósito, Fechas) stay reachable without
   *  the tree dominating the viewport. The outer sidebar (`SubastasListClient`)
   *  now owns its own scroll axis as well — the inner cap is a soft upper
   *  bound, not the primary scroll affordance. */
  maxHeightClass?: string;
  className?: string;
};

// ---------------------------------------------------------------------------
// 52 canonical provinces, alphabetised in es-ES.
// ---------------------------------------------------------------------------

const CANONICAL_PROVINCES = [...SPAIN_PROVINCES]
  .map((p) => ({ label: p.label, key: p.key }))
  .sort((a, b) => a.label.localeCompare(b.label, "es"));

const PSEUDO_MUNI_LABEL = "Otros / Sin municipio";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProvinceTownTree({
  filters,
  maxHeightClass = "max-h-[360px]",
  className,
}: ProvinceTownTreeProps) {
  const router = useRouter();

  const [provinceCounts, setProvinceCounts] = React.useState<Record<string, ProvinceCounts>>({});
  const [provinceLoading, setProvinceLoading] = React.useState(true);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [townsByProvince, setTownsByProvince] = React.useState<Record<string, TownRow[]>>({});
  const [townsLoading, setTownsLoading] = React.useState<Set<string>>(new Set());
  const [search, setSearch] = React.useState("");

  // -------------------------------------------------------------------------
  // Build the residual querystring once (other filters survive navigation).
  // Strip province + municipality (now path-encoded) and the default `when`
  // value so clean URLs stay clean.
  // -------------------------------------------------------------------------
  const residualQs = React.useMemo(() => {
    const qs = paramsFromFilters(filters);
    qs.delete("province");
    qs.delete("municipality");
    return qs;
  }, [filters]);

  const withResidual = React.useCallback(
    (path: string) => {
      const s = residualQs.toString();
      return s ? `${path}?${s}` : path;
    },
    [residualQs],
  );

  // -------------------------------------------------------------------------
  // Province counts — one call on mount.
  // -------------------------------------------------------------------------
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setProvinceLoading(true);
      try {
        const res = await apiFetch("/api/auctions/counts?groupBy=province");
        if (!res.ok) return;
        const body = await res.json();
        if (cancelled || !body?.success) return;
        const active: Record<string, number> = body.counts?.active ?? {};
        const proximas: Record<string, number> = body.counts?.preAuction ?? {};
        const total: Record<string, number> = body.counts?.total ?? {};
        const map: Record<string, ProvinceCounts> = {};
        for (const p of CANONICAL_PROVINCES) {
          map[p.label] = {
            active: active[p.label] ?? 0,
            proximas: proximas[p.label] ?? 0,
            total: total[p.label] ?? 0,
          };
        }
        setProvinceCounts(map);
      } catch {
        /* silent — empty counts just render as 0/0/0 */
      } finally {
        if (!cancelled) setProvinceLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // -------------------------------------------------------------------------
  // Lazy-load towns on first expand.
  // -------------------------------------------------------------------------
  const loadTowns = React.useCallback(async (provinceKey: string) => {
    if (townsByProvince[provinceKey]) return; // cache hit
    setTownsLoading((prev) => {
      if (prev.has(provinceKey)) return prev;
      const next = new Set(prev);
      next.add(provinceKey);
      return next;
    });
    try {
      const res = await apiFetch(
        `/api/auctions/counts?groupBy=municipality&province=${encodeURIComponent(provinceKey)}`,
      );
      if (!res.ok) return;
      const body = await res.json();
      if (!body?.success) return;
      const active: Record<string, number> = body.counts?.active ?? {};
      const proximas: Record<string, number> = body.counts?.preAuction ?? {};
      const total: Record<string, number> = body.counts?.total ?? {};
      const rows: TownRow[] = Object.keys(total)
        .filter((name) => name && name !== PSEUDO_MUNI_LABEL)
        .map((name) => ({
          name,
          slug: slugify(name),
          active: active[name] ?? 0,
          proximas: proximas[name] ?? 0,
          total: total[name] ?? 0,
        }))
        .filter((r) => Boolean(r.slug))
        .sort((a, b) => a.name.localeCompare(b.name, "es"));
      setTownsByProvince((prev) => ({ ...prev, [provinceKey]: rows }));
    } catch {
      /* silent */
    } finally {
      setTownsLoading((prev) => {
        const next = new Set(prev);
        next.delete(provinceKey);
        return next;
      });
    }
  }, [townsByProvince]);

  const toggleExpand = React.useCallback(
    (provinceKey: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(provinceKey)) {
          next.delete(provinceKey);
        } else {
          next.add(provinceKey);
          void loadTowns(provinceKey);
        }
        return next;
      });
    },
    [loadTowns],
  );

  // -------------------------------------------------------------------------
  // Province search filter (matches label, accent-insensitive).
  // -------------------------------------------------------------------------
  const filteredProvinces = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return CANONICAL_PROVINCES;
    const fold = (s: string) =>
      s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const fq = fold(q);
    return CANONICAL_PROVINCES.filter((p) => fold(p.label).includes(fq));
  }, [search]);

  // -------------------------------------------------------------------------
  // Navigation handlers — push CLEAN URLs.
  // -------------------------------------------------------------------------
  const goProvince = React.useCallback(
    (provinceKey: string) => {
      const slug = PROVINCE_DB_KEY_TO_SLUG[provinceKey];
      if (!slug) return; // off-taxonomy — shouldn't happen with canonical list
      router.push(withResidual(`/subastas/${slug}`));
    },
    [router, withResidual],
  );

  const goTown = React.useCallback(
    (provinceKey: string, townSlug: string) => {
      const provSlug = PROVINCE_DB_KEY_TO_SLUG[provinceKey];
      if (!provSlug || !townSlug) return;
      router.push(withResidual(`/subastas/${provSlug}/${townSlug}`));
    },
    [router, withResidual],
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className={cn("space-y-2", className)}>
      {/* Search bar — same affordance as the dashboard reference tree. */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-ink-tertiary)]"
          aria-hidden="true"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar provincia…"
          aria-label="Buscar provincia"
          className={cn(
            "w-full rounded-md border border-[var(--color-hairline)] bg-white",
            "pl-8 pr-2 py-1.5 text-xs text-[var(--color-ink-primary)]",
            "placeholder:text-[var(--color-ink-tertiary)]",
            "focus:outline-none focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/15",
          )}
        />
      </div>

      {/* Legend removed — Dennis brief: the tree rows now show TOTAL ONLY
          (single grey badge per row). The Activas/Próximas split lives at
          the top-of-page StatusTabs instead, so the legend was duplicating
          the colour grammar without adding signal. */}

      {/* Scroll region — caps height so the rest of the sidebar (price,
          dates …) stays visible. */}
      <div className={cn("overflow-y-auto overscroll-contain pr-1 -mr-1", maxHeightClass)}>
        <ul className="space-y-0.5" role="tree" aria-label="Provincias y municipios">
          {filteredProvinces.map((p) => {
            const counts = provinceCounts[p.label] ?? { active: 0, proximas: 0, total: 0 };
            const isExpanded = expanded.has(p.key);
            const isLoadingTowns = townsLoading.has(p.key);
            const towns = townsByProvince[p.key];

            return (
              <li key={p.key} role="treeitem" aria-expanded={isExpanded}>
                <div
                  className={cn(
                    "group flex items-center gap-1.5 rounded-md px-1.5 py-1.5",
                    "hover:bg-[var(--color-surface-muted)] transition-colors",
                  )}
                >
                  {/* Chevron — separate tap target, expands only. */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpand(p.key);
                    }}
                    aria-label={isExpanded ? `Contraer ${p.label}` : `Expandir ${p.label}`}
                    aria-expanded={isExpanded}
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded",
                      "text-[var(--color-ink-tertiary)] hover:bg-[var(--color-surface)]",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/40",
                    )}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>

                  {/* Name — single-select navigation: pushes the clean SEO URL
                       /subastas/{provincia}, preserving other active filters as
                       residual query. Separate tap target from the chevron. */}
                  <button
                    type="button"
                    onClick={() => goProvince(p.key)}
                    className={cn(
                      "flex-1 min-w-0 truncate text-left text-sm font-medium",
                      "text-[var(--color-ink-primary)]",
                      "hover:text-[var(--color-brand)] focus-visible:outline-none focus-visible:underline",
                    )}
                  >
                    {p.label}
                  </button>

                  {/* Total-only badge (Dennis brief — wave 80). Replaces the
                       previous 3-badge cluster (activas / próximas / total) so
                       each row reads as a clean "place + count". The
                       Activas/Próximas split now lives at page level via
                       StatusTabs — duplicating it here was noise. */}
                  <div className="flex shrink-0 items-center gap-1 tnum">
                    {counts.total > 0 && (
                      <CountBadge tone="total" value={counts.total} ariaLabel="subastas" />
                    )}
                  </div>
                </div>

                {/* Town list — indented under the province. */}
                {isExpanded && (
                  <div className="ml-7 mt-0.5 mb-1 border-l border-[var(--color-hairline)] pl-2">
                    {isLoadingTowns ? (
                      <div className="px-2 py-1.5 text-xs italic text-[var(--color-ink-tertiary)]">
                        Cargando municipios…
                      </div>
                    ) : towns && towns.length > 0 ? (
                      <ul className="space-y-0.5" role="group">
                        {towns.map((t) => {
                          // Only towns with active inventory are navigable —
                          // 0-active historical towns render as plain text so we
                          // never hand the user a near-empty town page from the
                          // tree. The province PAGE's "Por municipio" cluster
                          // still carries the full town crawl path for Google.
                          const isClickable = t.active > 0;
                          const rowClass = cn(
                            "flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs",
                            isClickable
                              ? "text-[var(--color-ink-secondary)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-brand)]"
                              : "text-[var(--color-ink-tertiary)] cursor-default",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/40",
                          );
                          const inner = (
                            <>
                              <span className="flex-1 min-w-0 truncate">{t.name}</span>
                              {/* Total-only count per Dennis brief — see the
                                   province row comment above for rationale. */}
                              <div className="flex shrink-0 items-center gap-1 tnum">
                                {t.total > 0 && (
                                  <CountBadge tone="total" value={t.total} ariaLabel="subastas" size="sm" />
                                )}
                              </div>
                            </>
                          );
                          return (
                            <li key={t.slug + "|" + t.name} role="treeitem">
                              {isClickable ? (
                                <button
                                  type="button"
                                  onClick={() => goTown(p.key, t.slug)}
                                  className={rowClass}
                                >
                                  {inner}
                                </button>
                              ) : (
                                <div className={rowClass} aria-disabled="true">
                                  {inner}
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <div className="px-2 py-1.5 text-xs italic text-[var(--color-ink-tertiary)]">
                        Sin municipios
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}

          {provinceLoading && filteredProvinces.length === 0 && (
            <li className="px-2 py-3 text-xs italic text-[var(--color-ink-tertiary)]">
              Cargando provincias…
            </li>
          )}
          {!provinceLoading && filteredProvinces.length === 0 && (
            <li className="px-2 py-3 text-xs italic text-[var(--color-ink-tertiary)]">
              No se encontraron provincias.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers — badges + legend dots
// ---------------------------------------------------------------------------

type Tone = "active" | "proximas" | "total";

const TONE_CLASSES: Record<Tone, string> = {
  // green = activas. Brand status-live token preferred when available; falls
  // back to a green chip otherwise.
  active:
    "bg-[var(--color-status-live-soft,#e6f4ea)] text-[var(--color-status-live,#1f7a3a)] " +
    "border border-[var(--color-status-live,#1f7a3a)]/25",
  // amber = próximas
  proximas:
    "bg-amber-50 text-amber-800 border border-amber-200",
  // grey = total
  total:
    "bg-[var(--color-surface-muted)] text-[var(--color-ink-tertiary)] " +
    "border border-[var(--color-hairline)]",
};

function CountBadge({
  tone,
  value,
  ariaLabel,
  size = "md",
}: {
  tone: Tone;
  value: number;
  ariaLabel: string;
  size?: "sm" | "md";
}) {
  return (
    <span
      aria-label={`${value.toLocaleString("es-ES")} ${ariaLabel}`}
      className={cn(
        "inline-flex items-center justify-center rounded-full font-medium",
        size === "sm" ? "min-w-[1.25rem] px-1 py-px text-[10px]" : "min-w-[1.5rem] px-1.5 py-px text-[11px]",
        TONE_CLASSES[tone],
      )}
    >
      {value.toLocaleString("es-ES")}
    </span>
  );
}

// LegendDot + LEGEND_TONE_CLASSES removed in wave 80 — the tree now renders
// total-only counts (single grey badge per row) so the legend was duplicating
// the colour grammar without adding signal. Activas/Próximas split lives at
// the page-level StatusTabs instead.
