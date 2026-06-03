"use client";

/**
 * SubastasListClient — the shared 2-column listing surface.
 *
 * Used by:
 *   - /subastas                          (no lockedFilter)
 *   - /subastas/provincia/[provincia]    (lockedFilter.province)
 *   - /subastas/tipo/[tipo]              (lockedFilter.type)
 *   - /subastas/[categoria]              (lockedFilter.category)
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
import { Loader2, Map as MapIcon, SlidersHorizontal } from "lucide-react";
import { AuctionItem } from "@/types";
import { apiFetch } from "@/lib/api-path";
import { ActiveFilterChips } from "@/components/observatory/SimpleFilters";
import { AdvancedFiltersSheet } from "@/components/observatory/AdvancedFiltersSheet";
import { AuctionResultRow } from "@/components/observatory/AuctionResultRow";
import { AuctionListCard } from "@/components/observatory/AuctionListCard";
import { RegistroTable } from "@/components/observatory/RegistroTable";
import { FiltersSidebar, SortTabs, StatusTabs, LockedFilter } from "@/components/observatory/FiltersSidebar";
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
  { ssr: false, loading: () => <div className="h-full w-full bg-[--color-surface-muted] animate-pulse" /> },
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
  const [provinces, setProvinces] = React.useState<string[]>([]);
  const [municipalities, setMunicipalities] = React.useState<string[]>([]);

  // Patch filters into URL. Locked dimensions are stripped from the
  // querystring on SEO routes — they live in the path, not the search.
  const updateFilters = React.useCallback(
    (patch: Partial<ObservatoryFilters>) => {
      const next = { ...filters, ...patch };
      if (lockedFilter?.province) next.province = lockedFilter.province;
      if (lockedFilter?.type && !next.types.includes(lockedFilter.type)) {
        next.types = [lockedFilter.type, ...next.types];
      }
      if (lockedFilter?.category) {
        next.categories = [lockedFilter.category as any];
      }
      const qs = paramsFromFilters(next);
      if (lockedFilter?.province) qs.delete("province");
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

  // Load provinces from the canonical endpoint.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/auctions/provinces?sort=count_desc&minimum_count=1");
        if (cancelled) return;
        if (res.ok) {
          const body = await res.json();
          if (body?.success && Array.isArray(body.data)) {
            setProvinces((body.data as Array<{ province: string }>).map((r) => r.province));
          }
        }
      } catch {
        /* silent */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load municipalities for current province.
  React.useEffect(() => {
    if (!filters.province) {
      setMunicipalities([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(
          `/api/auctions/counts?groupBy=municipality&province=${encodeURIComponent(filters.province)}`,
        );
        if (cancelled) return;
        if (res.ok) {
          const body = await res.json();
          const munis = Object.keys(body?.counts?.total || {}).sort((a, b) => a.localeCompare(b));
          setMunicipalities(munis);
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
    <div className="min-h-screen bg-[--color-page]">
      <main className="mx-auto max-w-editorial px-4 md:px-6 py-6 md:py-8">
        {/* SEO intro slot — server-rendered above the 2-col body so it stays
            in the indexable HTML (Breadcrumbs + SeoIntroBlock live here). */}
        {seoIntroSlot && <div className="mb-6">{seoIntroSlot}</div>}

        {/* Header: H1 + status tab + Ver mapa. Lives ABOVE the sidebar/list
            grid so it spans the full editorial width. */}
        <header className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-2xl md:text-3xl text-[--color-ink-primary]">
              {seoTitle ? (
                seoTitle
              ) : (
                <>
                  <span className="tnum">{renderedCount.toLocaleString("es-ES")}</span>{" "}
                  <span className="font-sans text-base font-normal text-[--color-ink-secondary]">
                    resultados
                  </span>
                </>
              )}
            </h1>
            {seoTitle && (
              <p className="mt-1 text-sm text-[--color-ink-tertiary] tnum">
                {renderedCount.toLocaleString("es-ES")} subastas
                {filters.when === "finalizadas" ? " finalizadas" : " activas"}
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
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-brand]/40",
                viewMode === "map"
                  ? "border-[--color-action] bg-[--color-action-soft] text-[--color-ink-primary] ring-1 ring-[--color-action]"
                  : "border-[--color-hairline] bg-[--color-surface] text-[--color-ink-primary] hover:border-[--color-brand]/40 hover:bg-[--color-brand]/5",
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
              Sticky so it stays visible as the list scrolls. */}
          <div className="hidden lg:block sticky top-24">
            <FiltersSidebar
              filters={filters}
              provinces={provinces}
              municipalities={municipalities}
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
                className="inline-flex items-center gap-1.5 rounded-md border border-[--color-brand]/30 bg-[--color-surface] px-3 py-1.5 text-sm font-medium text-[--color-brand]"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                Filtros
              </button>
              <button
                type="button"
                onClick={() => setAlertsOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-[--color-brand] text-white px-3 py-1.5 text-sm font-medium"
              >
                Crear alerta
              </button>
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs text-[--color-ink-tertiary] ml-auto"
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
              <div className="h-[70vh] rounded-lg overflow-hidden border border-[--color-hairline] bg-white">
                <HierarchicalMap
                  items={filtered}
                  onMarkerClick={(a: AuctionItem) => router.push(`/auction/${encodeURIComponent(a.id)}`)}
                  onProvinceClick={(province: string) => updateFilters({ province })}
                  onBackToProvinces={() => updateFilters({ province: "", municipality: "" })}
                  onBackToMunicipalities={() => updateFilters({ municipality: "" })}
                />
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
                  className="inline-flex items-center gap-2 rounded-md border border-[--color-brand]/30 px-5 py-2 text-sm font-medium text-[--color-brand] hover:bg-[--color-brand]/5 disabled:opacity-60"
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

      {/* Mobile filter drawer. */}
      {mobileFiltersOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Filtros"
        >
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileFiltersOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-full max-w-sm bg-[--color-page] overflow-y-auto p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-serif text-lg text-[--color-ink-primary]">Filtros</h2>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="text-sm text-[--color-ink-tertiary] hover:text-[--color-brand]"
                aria-label="Cerrar filtros"
              >
                Cerrar
              </button>
            </div>
            <FiltersSidebar
              filters={filters}
              provinces={provinces}
              municipalities={municipalities}
              onChange={updateFilters}
              onClear={clearFilters}
              onOpenAlerts={() => {
                setMobileFiltersOpen(false);
                setAlertsOpen(true);
              }}
              lockedFilter={lockedFilter}
              resultCount={totalCount}
            />
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
          className="flex gap-4 rounded-lg border border-[--color-hairline] bg-[--color-surface] p-4"
        >
          <div className="h-28 w-28 rounded-md bg-[--color-surface-muted] animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-3/4 bg-[--color-surface-muted] rounded animate-pulse" />
            <div className="h-3 w-1/2 bg-[--color-surface-muted] rounded animate-pulse" />
            <div className="h-6 w-32 bg-[--color-surface-muted] rounded animate-pulse" />
            <div className="h-3 w-full bg-[--color-surface-muted] rounded animate-pulse" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ErrorBody() {
  return (
    <div className="rounded-lg border border-[--color-hairline] bg-[--color-surface] p-8 text-center">
      <p className="font-serif text-lg text-[--color-ink-primary]">
        No pudimos cargar las subastas.
      </p>
      <p className="mt-1 text-sm text-[--color-ink-tertiary]">
        Reintenta en unos segundos.
      </p>
    </div>
  );
}

function EmptyBody({ onClear }: { onClear: () => void }) {
  return (
    <div className="rounded-lg border border-[--color-hairline] bg-[--color-surface] p-8 text-center">
      <p className="font-serif text-lg text-[--color-ink-primary]">
        No hay subastas que coincidan con tu búsqueda.
      </p>
      <p className="mt-1 text-sm text-[--color-ink-tertiary]">
        Prueba a ampliar el rango de precio o cambiar la provincia.
      </p>
      <div className="mt-4 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={onClear}
          className="text-sm font-medium text-[--color-brand] hover:underline"
        >
          Limpiar filtros
        </button>
        <Link
          href="/"
          className="text-sm text-[--color-ink-tertiary] hover:text-[--color-brand]"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
