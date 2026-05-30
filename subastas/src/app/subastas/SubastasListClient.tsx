"use client";

/**
 * SubastasListClient — the list view (List / Cards / Map toggle).
 *
 * Composition:
 *   - ObservatoryHeader (judicial header with NotificationBell)
 *   - SimpleFilters sidebar (4 questions) + AdvancedFiltersSheet
 *   - Result count header
 *   - View toggle (Lista / Tarjetas / Mapa)
 *   - Result body:
 *       * Lista (default): <table> of AuctionListRow
 *       * Tarjetas: grid of AuctionListCard
 *       * Mapa: HierarchicalMap (existing, with marker click → /auction/[id])
 *   - Pagination (Cargar más)
 *
 * URL is the source of truth — filters round-trip via querystring so every
 * combination is shareable.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { LayoutList, LayoutGrid, Map as MapIcon, Loader2, SlidersHorizontal } from "lucide-react";
import { AuctionItem } from "@/types";
import { apiFetch } from "@/lib/api-path";
import { ObservatoryHeader } from "@/components/observatory/ObservatoryHeader";
import { SimpleFilters, ActiveFilterChips } from "@/components/observatory/SimpleFilters";
import { AdvancedFiltersSheet } from "@/components/observatory/AdvancedFiltersSheet";
import { AuctionListRow } from "@/components/observatory/AuctionListRow";
import { AuctionListCard } from "@/components/observatory/AuctionListCard";
import { PresetRow } from "@/components/observatory/PresetRow";
import { SortDropdown } from "@/components/observatory/SortDropdown";
import {
  ObservatoryFilters,
  DEFAULT_FILTERS,
  filtersFromParams,
  paramsFromFilters,
  filtersToApiParams,
  applyClientFilters,
} from "@/components/observatory/filters";
import { cn } from "@/lib/utils";

// HierarchicalMap touches window — dynamic + ssr:false.
const HierarchicalMap = dynamic(
  () => import("@/components/dashboard/HierarchicalMap").then((m) => m.HierarchicalMap),
  { ssr: false, loading: () => <div className="h-full w-full bg-[--color-surface-muted] animate-pulse" /> },
);

type ViewMode = "list" | "cards" | "map";

export default function SubastasListClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = React.useMemo(
    () => filtersFromParams(searchParams),
    [searchParams],
  );

  const viewMode = (searchParams.get("view") as ViewMode) || "list";

  const [items, setItems] = React.useState<AuctionItem[]>([]);
  const [totalCount, setTotalCount] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [hasMore, setHasMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [advOpen, setAdvOpen] = React.useState(false);
  const [provinces, setProvinces] = React.useState<string[]>([]);
  const [municipalities, setMunicipalities] = React.useState<string[]>([]);

  // Patch filters into URL.
  const updateFilters = React.useCallback(
    (patch: Partial<ObservatoryFilters>) => {
      const next = { ...filters, ...patch };
      const qs = paramsFromFilters(next);
      if (viewMode !== "list") qs.set("view", viewMode);
      router.push(`${pathname}?${qs.toString()}`, { scroll: false });
    },
    [filters, pathname, router, viewMode],
  );

  const clearFilters = React.useCallback(() => {
    const qs = new URLSearchParams();
    if (viewMode !== "list") qs.set("view", viewMode);
    router.push(`${pathname}?${qs.toString()}`, { scroll: false });
  }, [pathname, router, viewMode]);

  const setView = React.useCallback(
    (next: ViewMode) => {
      const qs = paramsFromFilters(filters);
      if (next !== "list") qs.set("view", next);
      else qs.delete("view");
      router.push(`${pathname}?${qs.toString()}`, { scroll: false });
    },
    [filters, pathname, router],
  );

  // Load provinces + category counts once.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/auctions/counts?groupBy=province");
        if (cancelled) return;
        if (res.ok) {
          const body = await res.json();
          const provs = Object.keys(body?.counts?.total || {}).sort((a, b) => a.localeCompare(b));
          setProvinces(provs);
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
  }, [apiQueryKey, filters]); // re-run for full filters when client-only fields change

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

  // Client-side post-filter (search keyword, multi-category buckets, price, municipality).
  const filtered = React.useMemo(() => applyClientFilters(items, filters), [items, filters]);

  const advanced = filters.advanced;
  const toggleAdvanced = () => updateFilters({ advanced: !advanced });

  return (
    <div className="min-h-screen bg-[--color-page]">
      <ObservatoryHeader />

      <main
        className={cn(
          "mx-auto max-w-editorial px-4 md:px-6 py-6 md:py-8 grid grid-cols-1 gap-6 md:gap-8 items-start",
          // Sidebar only in Advanced mode on desktop.
          advanced ? "lg:grid-cols-[260px_1fr]" : "lg:grid-cols-1",
        )}
      >
        {/* Sidebar — only in Advanced mode */}
        {advanced && (
          <div className="hidden lg:block sticky top-24">
            <SimpleFilters
              filters={filters}
              provinces={provinces}
              municipalities={municipalities}
              onChange={updateFilters}
              onClear={clearFilters}
              onMoreClick={() => setAdvOpen(true)}
              resultCount={totalCount}
            />
          </div>
        )}

        <div className="min-w-0">
          {/* Preset shortcuts — always visible (Simple mode = full attention, Advanced = de-emphasized) */}
          <div className="mb-5">
            <PresetRow
              filters={filters}
              provinces={provinces}
              onApplyPreset={(patch) => updateFilters(patch)}
              muted={advanced}
            />
          </div>

          {/* Mobile: filter trigger only in Advanced mode (otherwise presets cover the simple case) */}
          {advanced && (
            <div className="lg:hidden mb-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setAdvOpen(true)}
                className="rounded-md border border-[--color-brand]/30 px-3 py-1.5 text-sm font-medium text-[--color-brand]"
              >
                Filtros
                {filters.kind !== "todo" ||
                filters.province ||
                filters.when !== "activas" ||
                filters.categories.length ||
                filters.statuses.length ||
                filters.types.length
                  ? " (activos)"
                  : ""}
              </button>
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs text-[--color-ink-tertiary]"
              >
                Limpiar
              </button>
            </div>
          )}

          {/* Result header */}
          <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0 flex-1">
              <h1 className="font-serif text-2xl md:text-3xl text-[--color-ink-primary]">
                {totalCount != null ? (
                  <span className="tnum">{totalCount.toLocaleString("es-ES")}</span>
                ) : (
                  <span className="tnum">{filtered.length.toLocaleString("es-ES")}</span>
                )}{" "}
                <span className="font-sans text-base font-normal text-[--color-ink-secondary]">
                  resultados
                </span>
              </h1>
              <ActiveFilterChips
                filters={filters}
                onChange={updateFilters}
                onClear={clearFilters}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <SortDropdown
                value={filters.sort}
                onChange={(v) => updateFilters({ sort: v })}
              />
              <button
                type="button"
                onClick={toggleAdvanced}
                aria-pressed={advanced}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-brand]/40",
                  advanced
                    ? "border-[--color-brand] bg-[--color-brand] text-white"
                    : "border-[--color-hairline] bg-[--color-surface] text-[--color-ink-secondary] hover:border-[--color-brand]/40 hover:text-[--color-brand]",
                )}
                title={advanced ? "Volver a filtros simples" : "Mostrar filtros avanzados"}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                {advanced ? "Filtros avanzados" : "Filtros avanzados"}
                <span aria-hidden="true" className="text-[10px]">{advanced ? "▴" : "▾"}</span>
              </button>
              <ViewToggle current={viewMode} onChange={setView} />
            </div>
          </header>

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
          ) : (
            <div className="rounded-lg border border-[--color-hairline] bg-[--color-surface] overflow-hidden">
              <table className="w-full">
                <thead className="bg-[--color-surface-muted] text-[10px] uppercase tracking-wider text-[--color-ink-tertiary]">
                  <tr>
                    <th className="w-6 py-2.5 pl-4 text-left"></th>
                    <th className="py-2.5 pr-3 text-left">Subasta</th>
                    <th className="hidden md:table-cell py-2.5 pr-3 text-left">Tipo</th>
                    <th className="py-2.5 pr-3 text-right">Puja</th>
                    <th className="hidden lg:table-cell py-2.5 pr-3 text-right">Tasación</th>
                    <th className="hidden md:table-cell py-2.5 pr-3 text-right">Termina</th>
                    <th className="py-2.5 pr-4 text-left"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[--color-hairline]">
                  {filtered.map((it) => (
                    <AuctionListRow key={it.id} item={it} />
                  ))}
                </tbody>
              </table>
            </div>
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
      </main>

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

function ViewToggle({
  current,
  onChange,
}: {
  current: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  const opts: Array<{ id: ViewMode; label: string; icon: React.ReactNode }> = [
    { id: "list", label: "Lista", icon: <LayoutList className="h-4 w-4" /> },
    { id: "cards", label: "Tarjetas", icon: <LayoutGrid className="h-4 w-4" /> },
    { id: "map", label: "Mapa", icon: <MapIcon className="h-4 w-4" /> },
  ];
  return (
    <div
      role="tablist"
      aria-label="Vista de resultados"
      className="inline-flex rounded-md border border-[--color-hairline] overflow-hidden"
    >
      {opts.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={current === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors",
            "focus-visible:outline-none focus-visible:bg-[--color-brand]/5",
            current === o.id
              ? "bg-[--color-brand] text-white"
              : "bg-[--color-surface] text-[--color-ink-secondary] hover:bg-[--color-surface-muted]",
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function LoadingBody() {
  return (
    <div className="rounded-lg border border-[--color-hairline] bg-[--color-surface]">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-4 py-4 hairline-b last:border-b-0"
        >
          <div className="h-2 w-2 rounded-full bg-[--color-surface-muted]" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-3/4 bg-[--color-surface-muted] rounded animate-pulse" />
            <div className="h-2.5 w-1/2 bg-[--color-surface-muted] rounded animate-pulse" />
          </div>
          <div className="h-3 w-20 bg-[--color-surface-muted] rounded animate-pulse" />
        </div>
      ))}
    </div>
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
