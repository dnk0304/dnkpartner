"use client";

/**
 * NearMeStrip — the "showing near you" note above the home carousel
 * (2026-07-10, Pixel — phase-2 auto-nearby brief).
 *
 * One slim line, two honesty levels:
 *   - source="ip"  → auto-pinned from the connection (approximate). Copy says
 *     so ("según tu conexión") and the primary escape hatch is "Ver toda
 *     España" — clearing the pin AND recording a session dismissal upstream
 *     so we never re-pin behind the user's back this session.
 *   - source="gps" → the user explicitly asked via the "Cerca de ti" chip.
 *     Copy is the confident wave124 wording; escape hatch is "Quitar".
 *
 * Componentized + prop-driven on purpose (brief task 6): a future Pro upsell
 * ("radius alerts near you") slots in via the `trailing` slot — no one-off
 * markup edits in HomeObservatory.
 *
 * Mobile: single-line-ish (flex-wrap, 13px) so it never pushes the hero CTA
 * or carousel below the fold on a 390px viewport.
 */

import * as React from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { CanonicalProvince } from "@/lib/spain-provinces";

export type NearMeSource = "ip" | "gps";

export type NearMeStripProps = {
  province: CanonicalProvince;
  source: NearMeSource;
  /** Canonical province-page href for the "see all in {province}" link. */
  provinceHref: string;
  /** Clears the pin; caller records the session dismissal. */
  onClear: () => void;
  /** Future Pro upsell slot (radius alerts) — renders at the line's end. */
  trailing?: React.ReactNode;
  className?: string;
};

export function NearMeStrip({
  province,
  source,
  provinceHref,
  onClear,
  trailing,
  className,
}: NearMeStripProps) {
  const t = useTranslations("home");
  const isIp = source === "ip";

  return (
    <div
      aria-live="polite"
      className={[
        "flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] sm:text-sm leading-tight text-[var(--color-ink-secondary)]",
        className ?? "",
      ].join(" ")}
    >
      <span>
        {isIp
          ? t("nearMeShowingIp", { province: province.label })
          : t("nearMeShowing", { province: province.label })}
      </span>
      <Link
        href={provinceHref}
        className="font-medium text-[var(--color-action)] hover:underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-action)]/40 rounded"
      >
        {t("nearMeViewAll", { province: province.label })}
      </Link>
      <button
        type="button"
        onClick={onClear}
        className="inline-flex items-center gap-1 rounded-full border border-[var(--color-hairline)] px-2 py-0.5 text-xs font-medium text-[var(--color-ink-secondary)] hover:bg-[var(--color-surface-muted)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-action)]/40"
      >
        <X className="h-3 w-3" aria-hidden="true" />
        {isIp ? t("nearMeAllSpain") : t("nearMeClear")}
      </button>
      {trailing}
    </div>
  );
}
