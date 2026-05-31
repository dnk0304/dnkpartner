"use client";

/**
 * ProvinceDropdown — sorted province selector with per-province counts.
 *
 * Consumes /api/auctions/provinces directly. The endpoint:
 *   - whitelists the 50 provincias + Ceuta + Melilla server-side
 *   - excludes "CP {postal-code}" junk that leaked into early scrapes
 *   - returns `[{ province, label, count }]` sorted by count desc
 *
 * We render EXACTLY what the API returns — no hardcoded list, no client
 * resort. If the API filters/changes, the UI follows for free.
 *
 * Selection routes to `/subastas?province={province}` so the URL is the
 * source of truth and the selection is shareable.
 *
 * Mobile = native <select> (best a11y + ergonomics). Desktop keeps the
 * native <select> too — built-in keyboard nav, no popover edge-cases.
 * Per-option count is shown in the label: "Madrid (255)".
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, MapPin, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api-path";
import { cn } from "@/lib/utils";

type ProvinceRow = {
  province: string;
  label: string;
  count: number;
};

export type ProvinceDropdownProps = {
  /** Currently selected province key (matches `province` on rows). */
  value?: string;
  /** Where to route on selection. `:province` replaced with chosen key. */
  routeTemplate?: string;
  /** Hide provinces with zero available auctions. Default true. */
  hideEmpty?: boolean;
  className?: string;
};

export function ProvinceDropdown({
  value = "",
  routeTemplate = "/subastas?province=:province",
  hideEmpty = true,
  className,
}: ProvinceDropdownProps) {
  const router = useRouter();
  const [rows, setRows] = React.useState<ProvinceRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(
          `/api/auctions/provinces?sort=count_desc${hideEmpty ? "&minimum_count=1" : ""}`,
        );
        if (cancelled) return;
        if (!res.ok) {
          setError(true);
          return;
        }
        const body = await res.json();
        if (body?.success && Array.isArray(body.data)) {
          setRows(body.data as ProvinceRow[]);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hideEmpty]);

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    if (!next) {
      router.push("/subastas");
      return;
    }
    router.push(routeTemplate.replace(":province", encodeURIComponent(next)));
  };

  const totalAvailable = rows.reduce((s, r) => s + r.count, 0);

  return (
    <div className={cn("w-full", className)}>
      <label
        htmlFor="province-dropdown"
        className="block text-[11px] font-semibold uppercase tracking-wider text-[--color-ink-tertiary] mb-1.5"
      >
        Explorar por provincia
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[--color-ink-tertiary]">
          <MapPin className="h-4 w-4" aria-hidden="true" />
        </span>
        <select
          id="province-dropdown"
          value={value}
          onChange={onChange}
          disabled={loading || error}
          aria-label="Seleccionar provincia"
          className={cn(
            "block w-full appearance-none rounded-lg border border-[--color-hairline] bg-[--color-surface]",
            "pl-9 pr-10 py-2.5 text-sm text-[--color-ink-primary] tnum",
            "hover:border-[--color-brand-soft]/40",
            "focus:outline-none focus:border-[--color-brand-soft] focus:ring-2 focus:ring-[--color-brand-soft]/20",
            "disabled:opacity-60 disabled:cursor-not-allowed",
          )}
        >
          <option value="">
            {loading
              ? "Cargando provincias…"
              : error
                ? "Error cargando provincias"
                : `Todas las provincias (${totalAvailable.toLocaleString("es-ES")})`}
          </option>
          {rows.map((r) => (
            <option key={r.province} value={r.province}>
              {r.label} ({r.count.toLocaleString("es-ES")})
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[--color-ink-tertiary]">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          )}
        </span>
      </div>
      {!loading && !error && (
        <p className="mt-1.5 text-[11px] text-[--color-ink-tertiary] tnum">
          {rows.length} provincias con subastas disponibles ahora
        </p>
      )}
    </div>
  );
}
