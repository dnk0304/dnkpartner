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
 * Nearby detection (2026-07-12, Pixel): the manual "Cerca de ti" GPS chip
 * was removed. Nearby-province detection is now fully automatic and lives in
 * `HomeObservatory` (IP → `/api/geo/nearest-province` via Cloudflare edge
 * headers, rendered as `<NearMeStrip>`). This component is now purely the
 * popular-region chip list.
 */

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { PROVINCE_DB_KEY_TO_SLUG } from "@/lib/seo/slugs";
import { toCanonicalProvince } from "@/lib/spain-provinces";
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
  className?: string;
};

/** es-ES grouped integer for the chip count (1.204). */
const COUNT_FORMAT = new Intl.NumberFormat("es-ES", { useGrouping: true });

export function PopularRegionChips({
  counts,
  max = 8,
  className,
}: PopularRegionChipsProps) {
  const t = useTranslations("home");

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
    </div>
  );
}
