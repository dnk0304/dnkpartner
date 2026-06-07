"use client";

/**
 * SubastasListClient — the shared 2-column listing surface.
 *
 * Used by:
 *   - /subastas                          (no lockedFilter)
 *   - /subastas/[slug]                   (lockedFilter.province | .category)
 *   - /subastas/[slug]/[municipio]       (lockedFilter.province + .municipality)
 *   - /subastas/tipo/[tipo]              (lockedFilter.type)
 *
 * Layout:
 *   ┌──────────────┬─────────────────────────────────────────────┐
 *   │  Filtros     │   [SEO intro slot — server-rendered above]  │
 *   │  sidebar     │   Breadcrumb                                │
 *   │  (persistent)│   H1 — count + location                     │
 *   │  Crear       │   [Activas / Finalizadas]  [Ver mapa]       │
 *   │  alerta CTA  │   Active filter chips                       │
 *   │  Origen      │   Sort tabs                                 │
 *   │  Tipo bien   │                                             │
 *   │  ¿Dónde?     │   ┌───────────────────────────────────────┐ │
 *   │  Valor       │   │ map-thumb │ title + price + badges    │ │
 *   │  Depósito*   │   │   + pin   │ excerpt + heart            │ │
 *   │  Pujas*      │   └───────────────────────────────────────┘ │
 *   │  Fechas      │   …rows…                                    │
 *   │              │   [Cargar más]                              │
 *   └──────────────┴─────────────────────────────────────────────┘
 *   (* disabled — no backend filter param; flagged for Forge follow-up)
 *
 * URL is the source of truth — filters round-trip via querystring. SEO routes
 * pass `lockedFilter` so the sidebar can't be used to escape the locked
 * dimension; the URL on those routes remains the canonical SEO path (the
 * locked dimension is path-encoded, not query-encoded).
 */

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { Loader2, Map as MapIcon, SlidersHorizontal, X } from "lucide-react";
import { AuctionItem } from "@/types";
import { apiFetch } from "@/lib/api-path";
import { ActiveFilterChips } from "@/components/observatory/SimpleFilters";
import { AdvancedFiltersSheet } from "@/components/observatory/AdvancedFiltersSheet";
import { AuctionResultRow } from "@/components/observatory/AuctionResultRow";
import { AuctionListCard } from "@/components/observatory/AuctionListCard";
import { RegistroTable } from "@/components/observatory/RegistroTable";
import { FiltersSidebar, SortTabs, StatusTabs, LockedFilter } from "@/components/observatory/FiltersSidebar";
import { MapCategorySidebar } from "@/components/observatory/MapCategorySidebar";
import { AlertsModal } from "@/components/dashboard/AlertsModal";
import {
  ObservatoryFilters,
  filtersFromParams,
  paramsFromFilters,
  filtersToApiParams,
  applyClientFilters,
  SortValue,
} from "@/components/observatory/filters";
import { cn } from "@/lib/utils";

// HierarchicalMap touches window — dynamic + ssr:false.
const HierarchicalMap = dynamic(
  () => import("@/components/dashboard/HierarchicalMap").then((m) => m.HierarchicalMap),
  { ssr: false, loading: () => <div className="h-full w-full bg-[var(--color-surface-muted)] animate-pulse" /> },
);

type ViewMode = "list" | "map" | "cards" | "registro";

export type SubastasListClientProps = {
  /**
   * SEO routes lock a dimension (province / type / category). The sidebar
   * disables the matching controls so users can't widen out via filters; the
   * URL stays the canonical SEO path. Defaults to undefined for /subastas.
   */
  lockedFilter?: LockedFilter;
  /**
   * Optional H1 title (e.g. "Subastas públicas en Valencia") — when passed
   * by an SEO route, this REPLACES the default "N resultados" H1 so the page
   * has exactly one indexable H1. The count is rendered as a subtitle.
   */
  seoTitle?: string;
  /**
   * Optional content rendered ABOVE the 2-col body (between header and
   * sidebar/list). SEO routes use this to insert the breadcrumb + SeoIntroBlock
   * + any internal-link cluster — the layout doesn't care what's in here.
   */
  seoIntroSlot?: React.ReactNode;
  /**
   * Optional content rendered BELOW the result list — used by SEO routes for
   * the "Por tipo de subasta en {label}" and similar internal-link clusters.
   */
  seoFooterSlot?: React.ReactNode;
};

export default function SubastasListClient({
  lockedFilter,
  seoTitle,
  seoIntroSlot,
  seoFooterSlot,
}: SubastasListClientProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Parse URL → filters, then overlay any locked dimension from the parent
  // route. Locked dims take precedence so the user can never widen out via a
  // hand-edited querystring.
  const rawFilters = React.useMemo(
    () => filtersFromParams(searchParams),
    [searchParams],
  );
  const filters = React.useMemo<ObservatoryFilters>(() => {
    if (!lockedFilter) return rawFilters;
    const next = { ...rawFilters };
    if (lockedFilter.province) {
      next.province = lockedFilter.province;
    }
    if (lockedFilter.municipality) {
      // Wave 56 — town SEO page. Always paired with province.
      next.municipality = lockedFilter.municipality;
    }
    // wave69 — multi-select arrays NEVER apply on locked SEO routes. The
    // single-town/single-province pages exist as canonical 1-dim listings;
    // letting a hand-edited `?municipios=` widen them out would defeat the
    // SEO contract. We surface the multi-select UI only on bare /subastas.
    if (lockedFilter.province || lockedFilter.municipality || lockedFilter.category || lockedFilter.type) {
      next.provincias = [];
      next.municipios = [];
    }
    if (lockedFilter.type) {
      if (!next.types.includes(lockedFilter.type)) {
        next.types = [lockedFilter.type, ...next.types];
      }
    }
    if (lockedFilter.category) {
      next.categories = [lockedFilter.category as any];
      next.kind = "todo";
    }
    return next;
  }, [rawFilters, lockedFilter]);

  const viewMode = (searchParams.get("view") as ViewMode) || "list";

  const [items, setItems] = React.useState<AuctionItem[]>([]);
  const [totalCount, setTotalCount] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [hasMore, setHasMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [advOpen, setAdvOpen] = React.useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = React.useState(false);
  const [alertsOpen, setAlertsOpen] = React.useState(false);
  const [municipalities, setMunicipalities] = React.useState<string[]>([]);
  // Map of municipality label -> active auction count for the currently-
  // selected province. Used to annotate the muni dropdown ("Sabadell (3)")
  // so users see live inventory at a glance while still being able to pick
  // any town in the province — even ones with zero current auctions.
  const [municipalityCounts, setMunicipalityCounts] = React.useState<Record<string, number>>({});

  // Body-scroll lock + Escape-to-close while the mobile filter drawer is open.
  // Prevents the underlying list from scrolling under your fingers and gives
  // the drawer a real "modal" feel.
  React.useEffect(() => {
    if (!mobileFiltersOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileFiltersOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileFiltersOpen]);

  // Patch filters into URL. Locked dimensions are stripped from the
  // querystring on SEO routes — they live in the path, not the search.
  const updateFilters = React.useCallback(
    (patch: Partial<ObservatoryFilters>) => {
      const next = { ...filters, ...patch };
      if (lockedFilter?.province) next.province = lockedFilter.province;
      if (lockedFilter?.municipality) next.municipality = lockedFilter.municipality;
      if (lockedFilter?.type && !next.types.includes(lockedFilter.type)) {
        next.types = [lockedFilter.type, ...next.types];
      }
      if (lockedFilter?.category) {
        next.categories = [lockedFilter.category as any];
      }
      const qs = paramsFromFilters(next);
      if (lockedFilter?.province) qs.delete("province");
      if (lockedFilter?.municipality) qs.delete("municipality");
      // wave69 — locked SEO routes don't carry the multi-select arrays.
      if (lockedFilter) {
        qs.delete("provincias");
        qs.delete("municipios");
      }
      if (lockedFilter?.type) {
        if (next.types.length === 1 && next.types[0] === lockedFilter.type) {
          qs.delete("types");
        }
      }
      if (lockedFilter?.category && next.categories.length === 1) {
        qs.delete("categories");
        qs.delete("category");
      }
      if (viewMode !== "list") qs.set("view", viewMode);
      router.push(`${pathname}?${qs.toString()}`, { scroll: false });
    },
    [filters, pathname, router, viewMode, lockedFilter],
  );

  const clearFilters = React.useCallback(() => {
    const qs = new URLSearchParams();
    if (viewMode !== "list") qs.set("view", viewMode);
    router.push(`${pathname}?${qs.toString()}`, { scroll: false });
  }, [pathname, router, viewMode]);

  const setView = React.useCallback(
    (next: ViewMode) => {
      const qs = paramsFromFilters(filters);
      if (lockedFilter?.province) qs.delete("province");
      if (lockedFilter?.municipality) qs.delete("municipality");
      if (lockedFilter?.type && filters.types.length === 1) qs.delete("types");
      if (lockedFilter?.category) {
        qs.delete("categories");
        qs.delete("category");
      }
      if (next !== "list") qs.set("view", next);
      else qs.delete("view");
      router.push(`${pathname}?${qs.toString()}`, { scroll: false });
    },
    [filters, pathname, router, lockedFilter],
  );

  // Load municipalities for current province. Only fires when a province is
  // active in filter state — that's the LOCKED-province SEO-page branch
  // (the unlocked /subastas flow navigates instead of mutating filters).
  // The list feeds the editable Municipio dropdown in FiltersSidebar's
  // locked branch.
  React.useEffect(() => {
    if (!filters.province) {
      setMunicipalities([]);
      setMunicipalityCounts({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // Source the dropdown from `counts.total` (full distinct municipality
        // list for the province, all statuses) — NOT `counts.active`. The
        // active-only source hid the 50-65 historical towns per province and
        // made the dropdown look broken when most towns had no LIVE auction
        // right now (e.g. Barcelona 7-of-65, Madrid 3-of-55).
        //
        // We keep `counts.active` alongside as an annotation map so each
        // option can display its live count — "Sabadell (3)", "Olesa (0)".
        // The SEO town-page pill cluster on /subastas/[slug] stays active-
        // only (out of scope here — that's an indexing decision, not a UX
        // one).
        const res = await apiFetch(
          `/api/auctions/counts?groupBy=municipality&province=${encodeURIComponent(filters.province)}`,
        );
        if (cancelled) return;
        if (res.ok) {
          const body = await res.json();
          const totalMap: Record<string, number> = body?.counts?.total || {};
          const activeMap: Record<string, number> = body?.counts?.active || {};
          // Drop the "Otros / Sin municipio" pseudo-bucket — it represents
          // null-municipality rows in the DB and isn't a real selectable town
          // (selecting it filters to nothing meaningful for the user).
          const munis = Object.keys(totalMap)
            .filter((m) => m !== "Otros / Sin municipio")
            .sort((a, b) => a.localeCompare(b, "es"));
          setMunicipalities(munis);
          setMunicipalityCounts(activeMap);
        }
      } catch {
        /* silent */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filters.province]);

  // Load auctions whenever the API-relevant slice of filters changes.
  const apiQueryKey = React.useMemo(() => filtersToApiParams(filters).toString(), [filters]);
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPage(1);
    (async () => {
      try {
        const qs = filtersToApiParams(filters);
        qs.set("page", "1");
        qs.set("limit", "50");
        const res = await apiFetch(`/api/auctions?${qs.toString()}`);
        if (cancelled) return;
        if (!res.ok) {
          setError("server_error");
          return;
        }
        const body = await res.json();
        if (!body.success) {
          setError(body.error || "unknown_error");
          return;
        }
        const data: AuctionItem[] = (body.data || []).map((it: any) => ({
          ...it,
          endDate: it.endDate ? new Date(it.endDate) : new Date(),
        }));
        if (cancelled) return;
        setItems(data);
        setHasMore(Boolean(body.pagination?.hasMore));
        setTotalCount(typeof body.pagination?.totalCount === "number" ? body.pagination.totalCount : null);
      } catch {
        if (!cancelled) setError("network_error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiQueryKey, filters]);

  const loadMore = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const qs = filtersToApiParams(filters);
      qs.set("page", String(page + 1));
      qs.set("limit", "50");
      const res = await apiFetch(`/api/auctions?${qs.toString()}`);
      if (!res.ok) return;
      const body = await res.json();
      if (!body.success) return;
      const more: AuctionItem[] = (body.data || []).map((it: any) => ({
        ...it,
        endDate: it.endDate ? new Date(it.endDate) : new Date(),
      }));
      setItems((prev) => [...prev, ...more]);
      setHasMore(Boolean(body.pagination?.hasMore));
      setPage((p) => p + 1);
    } finally {
      setLoadingMore(false);
    }
  };

  // Client-side post-filter (search keyword, multi-category buckets,
  // priceMin/priceMax, municipality).
  const filtered = React.useMemo(() => applyClientFilters(items, filters), [items, filters]);

  // H1: SEO title wins; otherwise "N resultados".
  const renderedCount = totalCount != null ? totalCount : filtered.length;

  return (
    <div className="min-h-screen bg-[var(--color-page)]">
      <main className="mx-auto max-w-editorial px-4 md:px-6 py-6 md:py-8">
        {/* SEO intro slot — server-rendered above the 2-col body so it stays
            in the indexable HTML (Breadcrumbs + SeoIntroBlock live here). */}
        {seoIntroSlot && <div className="mb-6">{seoIntroSlot}</div>}

        {/* Header: H1 + status tab + Ver mapa. Lives ABOVE the sidebar/list
            grid so it spans the full editorial width. */}
        <header className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-2xl md:text-3xl text-[var(--color-ink-primary)]">
              {seoTitle ? (
                seoTitle
              ) : (
                <>
                  <span className="tnum">{renderedCount.toLocaleString("es-ES")}</span>{" "}
                  <span className="font-sans text-base font-normal text-[var(--color-ink-secondary)]">
                    resultados
                  </span>
                </>
              )}
            </h1>
            {seoTitle && (
              <p className="mt-1 text-sm text-[var(--color-ink-tertiary)] tnum">
                {renderedCount.toLocaleString("es-ES")} subastas
                {filters.when === "finalizadas"
                  ? " finalizadas"
                  : filters.when === "proximas"
                  ? " próximas"
                  : filters.when === "todas"
                  ? " (activas + próximas)"
                  : " activas"}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            <StatusTabs
              value={filters.when}
              onChange={(v) => updateFilters({ when: v, statuses: [] })}
            />
            <button
              type="button"
              onClick={() => setView(viewMode === "map" ? "list" : "map")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/40",
                viewMode === "map"
                  ? "border-[var(--color-action)] bg-[var(--color-action-soft)] text-[var(--color-ink-primary)] ring-1 ring-[var(--color-action)]"
                  : "border-[var(--color-hairline)] bg-[var(--color-surface)] text-[var(--color-ink-primary)] hover:border-[var(--color-brand)]/40 hover:bg-[var(--color-brand)]/5",
              )}
            >
              <MapIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {viewMode === "map" ? "Ver lista" : "Ver mapa"}
            </button>
          </div>
        </header>

        {/* 2-COL BODY — persistent sidebar (desktop) + result list (right). */}
        <div className="grid grid-cols-1 gap-6 md:gap-8 items-start lg:grid-cols-[280px_1fr]">
          {/* SIDEBAR — desktop persistent. Mobile hides behind a Filtros
              button below the H1; a basic overlay drawer mounts on click.
              Sticky so it stays visible as the list scrolls.
              `max-h-[calc(100vh-6rem)] overflow-y-auto` gives the sidebar its
              OWN scroll axis — without it, sticky pins the sidebar at top:24
              and any content past the viewport (Valor subasta / lower groups)
              becomes unreachable because the page scroll only moves the right
              column. `overscroll-contain` keeps wheel/touch from bubbling out
              when the user is mid-scroll inside the sidebar. */}
          <div className="hidden lg:block sticky top-24 max-h-[calc(100vh-6rem)] overflow-y-auto overscroll-contain pr-1 -mr-1">
            <FiltersSidebar
              filters={filters}
              // `municipalities` / `municipalityCounts` feed the LOCKED-
              // province SEO-page branch (editable muni dropdown narrowing
              // within a locked province). The unlocked /subastas branch now
              // uses ProvinceTownTree, which owns its own data.
              municipalities={municipalities}
              municipalityCounts={municipalityCounts}
              onChange={updateFilters}
              onClear={clearFilters}
              onOpenAlerts={() => setAlertsOpen(true)}
              lockedFilter={lockedFilter}
              resultCount={totalCount}
            />
          </div>

          <div className="min-w-0">
            {/* Mobile filter trigger + Crear alerta. */}
            <div className="lg:hidden mb-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-brand)]/30 bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium text-[var(--color-brand)]"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                Filtros
              </button>
              <button
                type="button"
                onClick={() => setAlertsOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-brand)] text-white px-3 py-1.5 text-sm font-medium"
              >
                Crear alerta
              </button>
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs text-[var(--color-ink-tertiary)] ml-auto"
              >
                Limpiar
              </button>
            </div>

            {/* Active filter chips */}
            <div className="mb-3">
              <ActiveFilterChips
                filters={filters}
                onChange={updateFilters}
                onClear={clearFilters}
              />
            </div>

            {/* Sort tabs */}
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <SortTabs
                value={filters.sort}
                onChange={(v: SortValue) => updateFilters({ sort: v })}
              />
            </div>

            {/* Body */}
            {viewMode === "map" ? (
              // Map view: category rail (left) + Leaflet map (right). On
              // mobile the rail stacks ABOVE the map at horizontally-scrollable
              // pill width — the vertical rail would eat half the viewport on
              // a 390px screen. The map's bounds adapt to the container's
              // aspect ratio via fitBounds so both layouts get a clean frame.
              <div className="grid gap-3 md:grid-cols-[220px_1fr] md:items-start">
                <div className="md:sticky md:top-24">
                  <MapCategorySidebar
                    selected={filters.mapCategory}
                    onChange={(next) => updateFilters({ mapCategory: next })}
                    apiSearchParams={filtersToApiParams(filters)}
                  />
                </div>
                <div className="h-[70vh] rounded-lg overflow-hidden border border-[var(--color-hairline)] bg-white">
                  <HierarchicalMap
                    items={filtered}
                    onMarkerClick={(a: AuctionItem) => router.push(`/auction/${encodeURIComponent(a.id)}`)}
                    onProvinceClick={(province: string) => updateFilters({ province })}
                    onBackToProvinces={() => updateFilters({ province: "", municipality: "" })}
                    onBackToMunicipalities={() => updateFilters({ municipality: "" })}
                  />
                </div>
              </div>
            ) : loading ? (
              <LoadingBody />
            ) : error ? (
              <ErrorBody />
            ) : filtered.length === 0 ? (
              <EmptyBody onClear={clearFilters} />
            ) : viewMode === "cards" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtered.map((it) => (
                  <AuctionListCard key={it.id} item={it} />
                ))}
              </div>
            ) : viewMode === "registro" ? (
              <RegistroTable items={filtered} />
            ) : (
              // DEFAULT — horizontal card-rows (the new layout).
              <ul className="space-y-3">
                {filtered.map((it) => (
                  <li key={it.id}>
                    <AuctionResultRow item={it} />
                  </li>
                ))}
              </ul>
            )}

            {/* Pagination */}
            {viewMode !== "map" && hasMore && !loading && (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="inline-flex items-center gap-2 rounded-md border border-[var(--color-brand)]/30 px-5 py-2 text-sm font-medium text-[var(--color-brand)] hover:bg-[var(--color-brand)]/5 disabled:opacity-60"
                >
                  {loadingMore && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {loadingMore ? "Cargando…" : "Cargar más"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* SEO footer slot — for the "Por tipo de subasta en {label}" cluster
            and similar internal-link sections that the SEO routes need to
            keep for crawl depth. */}
        {seoFooterSlot && <div className="mt-12">{seoFooterSlot}</div>}
      </main>

      {/* Mobile filter drawer.
          NOTE: backgrounds use the bg-[var(--token)] form, NOT the bg-[var(--token)]
          shorthand. In Tailwind v4 the shorthand resolves to the invalid
          declaration `background-color: --color-page;` which paints nothing —
          that was the root cause of the transparent-drawer bug Dennis flagged.
          Always use bg-[var(--...)] for CSS-variable arbitrary colors here. */}
      {mobileFiltersOpen && (
        <div
          className="fixed inset-0 z-[60] lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Filtros"
        >
          {/* Scrim — fully opaque enough to separate the drawer from the
              list behind it, but still let the user see they're in a
              modal layer. */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            onClick={() => setMobileFiltersOpen(false)}
            aria-hidden="true"
          />
          {/* Drawer panel — solid pure-white surface, fills the viewport
              vertically, scrolls internally if filters overflow. Sticky
              header so Cerrar stays reachable while scrolling. */}
          <div
            className="absolute inset-y-0 left-0 flex h-full w-full max-w-sm flex-col bg-[var(--color-surface)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--color-hairline)] bg-[var(--color-surface)] px-4 py-3">
              <h2 className="font-serif text-lg text-[var(--color-ink-primary)]">Filtros</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-xs text-[var(--color-ink-tertiary)] hover:text-[var(--color-brand)] focus-visible:outline-none focus-visible:underline transition-colors"
                >
                  Limpiar
                </button>
                <button
                  type="button"
                  onClick={() => setMobileFiltersOpen(false)}
                  className="inline-flex items-center justify-center rounded-md p-2 -m-2 text-[var(--color-ink-secondary)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/40"
                  aria-label="Cerrar filtros"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain p-4 bg-[var(--color-surface)]">
              <FiltersSidebar
                filters={filters}
                municipalities={municipalities}
                municipalityCounts={municipalityCounts}
                onChange={updateFilters}
                onClear={clearFilters}
                onOpenAlerts={() => {
                  setMobileFiltersOpen(false);
                  setAlertsOpen(true);
                }}
                lockedFilter={lockedFilter}
                resultCount={totalCount}
                className="border-0 shadow-none p-0"
                hideInternalHeading
              />
              {/* Sticky "Ver resultados" CTA so the user can confirm the
                  filter set and dismiss the drawer in one tap on mobile. */}
              <div className="mt-6 sticky bottom-0 -mx-4 px-4 py-3 border-t border-[var(--color-hairline)] bg-[var(--color-surface)]">
                <button
                  type="button"
                  onClick={() => setMobileFiltersOpen(false)}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-[var(--color-action)] text-white font-medium px-4 py-2.5 hover:bg-[var(--color-action-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-action)]/40"
                >
                  Ver {totalCount != null ? totalCount.toLocaleString("es-ES") : ""} resultados
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AlertsModal — opens from Crear alerta CTA, seeded with the current
          filter set so the alert remembers what the user was looking at. */}
      <AlertsModal
        open={alertsOpen}
        onOpenChange={setAlertsOpen}
        initialProvince={filters.province || undefined}
        initialMunicipality={filters.municipality || undefined}
        initialCategory={filters.categories[0] || undefined}
      />

      {/* AdvancedFiltersSheet kept for legacy ?advanced=1 paths. */}
      <AdvancedFiltersSheet
        open={advOpen}
        onOpenChange={setAdvOpen}
        filters={filters}
        onChange={updateFilters}
        onClear={clearFilters}
        resultCount={totalCount}
      />
    </div>
  );
}

function LoadingBody() {
  return (
    <ul className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <li
          key={i}
          className="flex gap-4 rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface)] p-4"
        >
          <div className="h-28 w-28 rounded-md bg-[var(--color-surface-muted)] animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-3/4 bg-[var(--color-surface-muted)] rounded animate-pulse" />
            <div className="h-3 w-1/2 bg-[var(--color-surface-muted)] rounded animate-pulse" />
            <div className="h-6 w-32 bg-[var(--color-surface-muted)] rounded animate-pulse" />
            <div className="h-3 w-full bg-[var(--color-surface-muted)] rounded animate-pulse" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ErrorBody() {
  return (
    <div className="rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface)] p-8 text-center">
      <p className="font-serif text-lg text-[var(--color-ink-primary)]">
        No pudimos cargar las subastas.
      </p>
      <p className="mt-1 text-sm text-[var(--color-ink-tertiary)]">
        Reintenta en unos segundos.
      </p>
    </div>
  );
}

function EmptyBody({ onClear }: { onClear: () => void }) {
  return (
    <div className="rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface)] p-8 text-center">
      <p className="font-serif text-lg text-[var(--color-ink-primary)]">
        No hay subastas que coincidan con tu búsqueda.
      </p>
      <p className="mt-1 text-sm text-[var(--color-ink-tertiary)]">
        Prueba a ampliar el rango de precio o cambiar la provincia.
      </p>
      <div className="mt-4 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={onClear}
          className="text-sm font-medium text-[var(--color-brand)] hover:underline"
        >
          Limpiar filtros
        </button>
        <Link
          href="/"
          className="text-sm text-[var(--color-ink-tertiary)] hover:text-[var(--color-brand)]"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
