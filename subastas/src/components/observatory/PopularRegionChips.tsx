"use client";

/**
 * PopularRegionChips — the hero's region block (2026-07-10, Pixel —
 * home-funnel-redesign brief). Replaces the SEO sources text block beside
 * the map with the top provinces by ACTIVE auction count, each a clickable
 * chip showing name + live count. Chips NAVIGATE to the clean province page
 * `/subastas/{slug}` (wave117 doctrine: region interactions navigate, never
 * in-place multi-select).
 *
 * Data: the same `/api/auctions/counts?groupBy=province` payload the home
 * page already fetches for ProvinceGrid — no extra request; the counts map
 * is passed down and sorted here.
 *
 * "Cerca de ti" (Phase 1 geolocation, client-only):
 *   - User gesture ONLY — the chip click requests browser geolocation; we
 *     never auto-prompt on load.
 *   - Fix → nearest province via the static centroid table
 *     (`lib/province-centroids.ts`, haversine client-side).
 *   - Found → `onNearProvince(row)`; the home page pins the carousel's
 *     existing `province` param and shows an inline "cerca de ti" note.
 *   - Denied / unavailable / far-from-Spain → graceful no-op: a short
 *     inline "no disponible" whisper, then back to idle. No modal.
 *   - True radius-sorted results = PHASE 2 (needs a Forge nearby endpoint;
 *     separate brief) — see province-centroids.ts header.
 */

import * as React from "react";
import Link from "next/link";
import { LocateFixed, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { PROVINCE_DB_KEY_TO_SLUG } from "@/lib/seo/slugs";
import { nearestProvince } from "@/lib/province-centroids";
import { toCanonicalProvince, type CanonicalProvince } from "@/lib/spain-provinces";
import { cn } from "@/lib/utils";

export type ProvinceCountsMap = Record<
  string,
  { active: number; preAuction: number; finished: number; total: number }
>;

export type PopularRegionChipsProps = {
  /** province DB key → counts, from /api/auctions/counts?groupBy=province. */
  counts: ProvinceCountsMap;
  /** How many chips to render. Default 8. */
  max?: number;
  /** Geolocation result callback — canonical province row, or null to clear. */
  onNearProvince: (province: CanonicalProvince | null) => void;
  /**
   * Phase 2 (2026-07-10): when an approximate IP pin is already active, the
   * chip's job shifts from "find me" to "refine me" — label reads "Afinar
   * ubicación" instead of "Cerca de ti". Behavior is unchanged.
   */
  refine?: boolean;
  className?: string;
};

type NearStatus = "idle" | "locating" | "unavailable";

/** es-ES grouped integer for the chip count (1.204). */
const COUNT_FORMAT = new Intl.NumberFormat("es-ES", { useGrouping: true });

export function PopularRegionChips({
  counts,
  max = 8,
  onNearProvince,
  refine = false,
  className,
}: PopularRegionChipsProps) {
  const t = useTranslations("home");
  const [nearStatus, setNearStatus] = React.useState<NearStatus>("idle");
  const unavailableTimer = React.useRef<number | null>(null);
  React.useEffect(() => {
    return () => {
      if (unavailableTimer.current != null) window.clearTimeout(unavailableTimer.current);
    };
  }, []);

  // Top provinces by ACTIVE count, taxonomy-guarded: each counts key is
  // resolved through `toCanonicalProvince` first (the counts endpoint can
  // group under either label OR DB-key spelling — e.g. "Vizcaya" label vs.
  // "Bizkaia" key; the slug map is keyed by DB key). Junk province strings
  // resolve to null and never become chips.
  const top = React.useMemo(() => {
    return Object.entries(counts)
      .flatMap(([raw, c]) => {
        if (c.active <= 0) return [];
        const row = toCanonicalProvince(raw);
        const slug = row ? PROVINCE_DB_KEY_TO_SLUG[row.key] : undefined;
        return row && slug ? [{ label: row.label, slug, active: c.active }] : [];
      })
      .sort((a, b) => b.active - a.active)
      .slice(0, max);
  }, [counts, max]);

  const fail = React.useCallback(() => {
    setNearStatus("unavailable");
    // Whisper, don't nag: revert to the idle chip after a few seconds.
    unavailableTimer.current = window.setTimeout(() => setNearStatus("idle"), 4000);
  }, []);

  const locate = React.useCallback(() => {
    if (nearStatus === "locating") return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      fail();
      return;
    }
    setNearStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const row = nearestProvince(pos.coords.latitude, pos.coords.longitude);
        setNearStatus("idle");
        if (row) onNearProvince(row);
        else fail();
      },
      () => fail(),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  }, [nearStatus, onNearProvince, fail]);

  const chipBase = cn(
    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium",
    "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-action)]/40",
  );

  return (
    <div className={className}>
      <p
        id="popular-regions-label"
        className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-tertiary)]"
      >
        {t("popularRegionsLabel")}
      </p>

      <ul aria-labelledby="popular-regions-label" className="mt-2.5 flex flex-wrap gap-2">
        {/* "Cerca de ti" — geolocation entry point, first in the row so it
            reads as the personal alternative to the popular list. */}
        <li>
          <button
            type="button"
            onClick={locate}
            disabled={nearStatus === "locating"}
            aria-label={t("nearMeAria")}
            className={cn(
              chipBase,
              "cursor-pointer border-[var(--color-action)]/40 bg-[var(--color-surface)] text-[var(--color-action)]",
              "hover:bg-[var(--color-surface-muted)] disabled:cursor-default disabled:opacity-70",
            )}
          >
            {nearStatus === "locating" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <LocateFixed className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {nearStatus === "locating"
              ? t("nearMeLocating")
              : refine
                ? t("nearMeRefine")
                : t("nearMe")}
          </button>
        </li>

        {top.map((p) => (
          <li key={p.slug}>
            <Link
              href={`/subastas/${p.slug}`}
              className={cn(
                chipBase,
                "border-[var(--color-hairline)] bg-[var(--color-surface)] text-[var(--color-ink-primary)]",
                "hover:border-[var(--color-brand-soft)]/60 hover:bg-[var(--color-surface-muted)]",
              )}
            >
              {p.label}
              <span className="tnum text-xs font-semibold text-[var(--color-ink-tertiary)]">
                {COUNT_FORMAT.format(p.active)}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {/* Denial / unavailable whisper — polite live region, auto-clears. */}
      <p aria-live="polite" className="min-h-0">
        {nearStatus === "unavailable" && (
          <span className="mt-2 inline-block text-xs text-[var(--color-ink-tertiary)]">
            {t("nearMeUnavailable")}
          </span>
        )}
      </p>
    </div>
  );
}
