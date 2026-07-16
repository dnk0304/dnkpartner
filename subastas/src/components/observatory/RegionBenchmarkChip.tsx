"use client";

/**
 * RegionBenchmarkChip — the "vs área" value signal (Phase 3, wave141).
 *
 * Renders how an auction's €/m² compares to the area median, using the
 * server-computed `regionBenchmark` object (see src/lib/benchmark.ts). This is
 * a factual VALUE SIGNAL, never advice — copy stays "vs la zona", never
 * "chollo"/"good deal" (Ken-locked honesty guardrail).
 *
 * Honest-null: the component returns null when `benchmark` is null (most
 * historical rows carry no signal), so every caller can drop it inline and the
 * surrounding strip collapses cleanly — no "N/A" noise.
 *
 * Three states, sign shown via WORDING + COLOR (never a raw "-"):
 *   deltaPct <  -NEUTRAL_BAND  → green  "X% por debajo de la zona" (cheaper)
 *   deltaPct >   NEUTRAL_BAND  → amber  "X% por encima de la zona"
 *   |deltaPct| <= NEUTRAL_BAND → neutral "en línea con la zona"
 *
 * Two variants:
 *   "card"   — compact pill for the fact strip next to the €/m² pill.
 *   "detail" — richer line: "€X/m² · Y% {…} de la media de {regionLabel}",
 *              plus an optional p25–p75 context line and an n= tooltip.
 */

import * as React from "react";
import { useTranslations } from "next-intl";
import type { RegionBenchmarkSignal } from "@/types";

/** |deltaPct| at or below this reads as "in line with the area". */
const NEUTRAL_BAND = 3;

type BenchmarkTone = "below" | "above" | "inline";

function toneOf(deltaPct: number): BenchmarkTone {
  if (deltaPct < -NEUTRAL_BAND) return "below";
  if (deltaPct > NEUTRAL_BAND) return "above";
  return "inline";
}

/** Whole-euro €/m² label, locale-grouped, with the m² unit. */
function formatEurM2(value: number, locale: string): string {
  return `${Math.round(value).toLocaleString(locale)} €/m²`;
}

type Variant = "card" | "detail";

interface RegionBenchmarkChipProps {
  benchmark: RegionBenchmarkSignal | null | undefined;
  variant?: Variant;
  /** BCP-47 locale for number grouping (detail variant). Defaults to es-ES. */
  locale?: string;
  className?: string;
}

export function RegionBenchmarkChip({
  benchmark,
  variant = "card",
  locale = "es-ES",
  className,
}: RegionBenchmarkChipProps) {
  const t = useTranslations("benchmark");

  // Honest-null: no signal ⇒ render nothing. Strip collapses on its own.
  if (!benchmark) return null;

  const { deltaPct, regionLabel, sampleSize, eurM2, p25EurM2, p75EurM2 } =
    benchmark;
  const tone = toneOf(deltaPct);
  const absPct = Math.abs(Math.round(deltaPct));

  // Tone → design-system tokens (warn palette). Below = positive/green,
  // above = attention/amber, inline = neutral ink.
  const toneClasses: Record<BenchmarkTone, string> = {
    below:
      "text-[var(--color-warn-positive)] bg-[var(--color-warn-positive-soft)] border-[var(--color-warn-positive)]/25",
    above:
      "text-[var(--color-warn-attention)] bg-[var(--color-warn-attention-soft)] border-[var(--color-warn-attention)]/25",
    inline:
      "text-[var(--color-ink-secondary)] bg-[var(--color-surface-muted)] border-[var(--color-hairline)]",
  };

  // Short chip label (card). "en línea" has no percentage.
  const chipLabel =
    tone === "inline"
      ? t("chipInline")
      : t(tone === "below" ? "chipBelow" : "chipAbove", { pct: absPct });

  if (variant === "card") {
    return (
      <span
        className={[
          "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tnum leading-none",
          toneClasses[tone],
          className ?? "",
        ].join(" ")}
        title={t("tooltipSample", { n: sampleSize, region: regionLabel })}
      >
        {chipLabel}
      </span>
    );
  }

  // ── detail variant ────────────────────────────────────────────────────────
  const headline =
    tone === "inline"
      ? t("detailInline", { region: regionLabel })
      : t(tone === "below" ? "detailBelow" : "detailAbove", {
          pct: absPct,
          region: regionLabel,
        });

  const hasBand = p25EurM2 != null && p75EurM2 != null;

  return (
    <div className={["flex flex-col gap-1", className ?? ""].join(" ")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="tnum text-sm font-semibold text-[var(--color-ink-primary)]">
          {formatEurM2(eurM2, locale)}
        </span>
        <span
          className={[
            "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
            toneClasses[tone],
          ].join(" ")}
        >
          {headline}
        </span>
      </div>
      {hasBand && (
        <p className="text-[11px] text-[var(--color-ink-tertiary)]">
          {t("detailBand", {
            p25: formatEurM2(p25EurM2 as number, locale),
            p75: formatEurM2(p75EurM2 as number, locale),
          })}
        </p>
      )}
      <p className="text-[10px] text-[var(--color-ink-quiet)]">
        {t("detailSampleFootnote", { n: sampleSize })}
      </p>
    </div>
  );
}
