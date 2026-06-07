"use client";

/**
 * HomeObservatory — the rebuilt home page.
 *
 * Layout (2026-06-07, Pixel — "compact hero map" pass):
 *   1. ObservatoryHeader (site-wide chrome).
 *   2. Hero: a 2-column grid on lg+ screens.
 *        - LEFT  → headline + subhead + source bullets + CTA row.
 *        - RIGHT → a COMPACT map card filling the space previously empty
 *                  beside the headline. Clicking the card navigates to the
 *                  full-map view (the existing "Abrir mapa completo"
 *                  destination — `/subastas?view=map`). On mobile the card
 *                  stacks underneath the hero copy as a full-width card.
 *   3. HomeCarouselSection — now two stacked rows:
 *        - "Últimos inmuebles" (REAL_ESTATE-only feed).
 *        - "Últimos vehículos" (MOVABLE-only feed).
 *   4. ProvinceGrid (province → town tree).
 *   5. "Cómo funciona" plain-spoken explainer block.
 *
 * What changed vs. the previous layout:
 *   - The big bottom-of-page full-width map block is REMOVED. The compact
 *     hero-right map is now the only map surface on the home page; clicking
 *     it routes the user to the dedicated map view. The bottom block ate a
 *     full viewport at the cost of one extra scroll and Dennis flagged the
 *     duplication.
 *   - The carousel detail-popup is OFF (Item G modal removed for now). Cards
 *     are plain `<Link>`s to `/subastas/subasta/{slug}`. This kills the
 *     popup → map overlap bug AND aligns clicks with the canonical detail
 *     page (good for SEO + funnel attribution).
 */

import * as React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { HomeCarouselSection } from "@/components/observatory/HomeCarouselSection";
import { ProvinceDropdown } from "@/components/observatory/ProvinceDropdown";
import { apiFetch } from "@/lib/api-path";
import { AuctionItem } from "@/types";
import { PROVINCE_DB_KEY_TO_SLUG, slugify } from "@/lib/seo/slugs";

/**
 * Build the canonical clean SEO URL for a province click. Wave 56 (Option A):
 * province pages live at `/subastas/{slug}` — no more `/provincia/` prefix,
 * no more `?province=` querystring round-trip. If the raw province name is
 * off-taxonomy (not in our 52-province map) we fall back to the interactive
 * list filter so the user still sees something useful.
 */
function provinceHref(province: string): string {
  const slug = PROVINCE_DB_KEY_TO_SLUG[province];
  return slug
    ? `/subastas/${slug}`
    : `/subastas?province=${encodeURIComponent(province)}`;
}

/**
 * Build the canonical clean SEO URL for a (province, municipality) click —
 * goes straight at the new town page `/subastas/{prov}/{muni}`. Fallback to
 * the QS filter when the province isn't in our taxonomy.
 */
function townHref(province: string, municipality: string): string {
  const slug = PROVINCE_DB_KEY_TO_SLUG[province];
  const muniSlug = slugify(municipality);
  return slug && muniSlug
    ? `/subastas/${slug}/${muniSlug}`
    : `/subastas?province=${encodeURIComponent(province)}&municipality=${encodeURIComponent(municipality)}`;
}

const HierarchicalMap = dynamic(
  () => import("@/components/dashboard/HierarchicalMap").then((m) => m.HierarchicalMap),
  { ssr: false, loading: () => <div className="h-full w-full bg-[--color-surface-muted] animate-pulse" /> },
);

const ProvinceGrid = dynamic(
  () => import("@/components/dashboard/ProvinceGrid").then((m) => m.ProvinceGrid),
  { ssr: false, loading: () => <div className="h-40 bg-[--color-surface-muted] animate-pulse rounded-lg" /> },
);

/** Destination of the click-to-expand affordance on the compact map. */
const FULL_MAP_HREF = "/subastas?view=map";

export default function HomeObservatory() {
  const router = useRouter();
  const t = useTranslations("home");
  const [mapItems, setMapItems] = React.useState<AuctionItem[]>([]);
  const [provinceCounts, setProvinceCounts] = React.useState<Record<string, { active: number; preAuction: number; finished: number; total: number }>>({});

  // Map auctions (active + upcoming only).
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/auctions/map?statuses=celebrandose,proxima-apertura");
        if (!res.ok || cancelled) return;
        const body = await res.json();
        if (cancelled) return;
        if (body?.success && Array.isArray(body.data)) {
          const items: AuctionItem[] = body.data.map((it: any) => ({
            ...it,
            endDate: new Date(),
            source: "BOE",
            imageUrl: "",
            isLocked: false,
            community: "",
          }));
          setMapItems(items);
        }
      } catch {
        /* silent */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Province counts.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/auctions/counts?groupBy=province");
        if (!res.ok || cancelled) return;
        const body = await res.json();
        if (cancelled || !body?.success) return;
        const out: Record<string, { active: number; preAuction: number; finished: number; total: number }> = {};
        for (const key of Object.keys(body.counts?.total || {})) {
          out[key] = {
            active: body.counts.active?.[key] || 0,
            preAuction: body.counts.preAuction?.[key] || 0,
            finished: body.counts.finished?.[key] || 0,
            total: body.counts.total?.[key] || 0,
          };
        }
        setProvinceCounts(out);
      } catch {
        /* silent */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Click-to-expand on the compact map. We navigate to `/subastas?view=map`
   * (same destination as the explicit "Abrir mapa completo" link) so users
   * land on the canonical full-map experience without a duplicate route.
   * Keyboard parity comes via `role="button"` + `tabIndex=0` + Enter/Space
   * handlers — Leaflet swallows raw button semantics so we wrap the map in
   * an outer div that owns the interaction.
   */
  const openFullMap = React.useCallback(() => {
    router.push(FULL_MAP_HREF);
  }, [router]);

  return (
    <div className="min-h-screen bg-[--color-page]">
      {/* Header + footer are rendered site-wide by SiteChrome in the root layout. */}

      <main className="mx-auto max-w-editorial px-4 md:px-6 py-6 md:py-8 space-y-6 md:space-y-8">
        {/* ───────────────────────────────────────────────────────────────
            HERO — two-column grid on lg+, single column below.
            Left: headline + sources + CTA.
            Right: compact, click-to-expand map card filling the space that
            was previously empty (Dennis's red-box). The full-page map block
            that previously sat below the carousel is gone.
            ─────────────────────────────────────────────────────────────── */}
        <section
          aria-labelledby="hero-headline"
          className="pt-2 grid gap-6 lg:gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-start"
        >
          <div className="min-w-0">
            {/* Headline + subhead. Simple Spanish — Dennis explicit: no "en
                juego", no fluff explaining what BOE is. */}
            <div className="space-y-3 max-w-2xl">
              <h1
                id="hero-headline"
                className="font-display text-[28px] sm:text-4xl lg:text-[44px] leading-[1.1] tracking-tight text-[--color-ink-primary]"
              >
                {t("heroHeadline")}
              </h1>
              <p className="text-[15px] md:text-base leading-relaxed text-[--color-ink-secondary]">
                {t("heroSubhead")}
              </p>
            </div>

            {/* Source-type inline row. */}
            <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[--color-ink-tertiary]">
              <span className="font-medium text-[--color-ink-secondary]">
                {t("heroSourcesIntro")}
              </span>
              <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>{t("heroSourceJudicial")}</span>
                <span aria-hidden="true" className="text-[--color-hairline]">·</span>
                <span>{t("heroSourceHacienda")}</span>
                <span aria-hidden="true" className="text-[--color-hairline]">·</span>
                <span>{t("heroSourceNotarial")}</span>
                <span aria-hidden="true" className="text-[--color-hairline]">·</span>
                <span>{t("heroSourceAdministrativa")}</span>
              </span>
            </div>

            {/* CTA row. */}
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href="/register"
                className="cta-gradient text-base px-6 py-3 rounded-lg"
                aria-label={t("heroCtaPrimaryAria")}
              >
                {t("heroCtaPrimary")}
              </Link>
              <Link
                href="/subastas?when=activas"
                className="inline-flex items-center text-sm font-medium text-[--color-action] hover:text-[--color-brand] hover:underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-action]/40 rounded px-2 py-2"
              >
                {t("heroCtaSecondary")}
              </Link>
            </div>
          </div>

          {/* ── Compact map (right column / stacks on mobile) ──────────────
              Sized so it visually balances the headline block on lg+ without
              dominating. The whole card is one big keyboard-accessible
              "open the full map" button — pointer-events on the inner
              Leaflet map are disabled so a click anywhere is interpreted as
              "expand", never as a drag/zoom. A small overlay button mirrors
              the explicit "Abrir mapa completo" affordance so the action is
              also discoverable without hovering. */}
          <div
            role="button"
            tabIndex={0}
            aria-label={t("compactMapAria")}
            onClick={openFullMap}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openFullMap();
              }
            }}
            className={[
              "group relative w-full",
              // ~280px tall on mobile, 320px on lg (fits the hero block height
              // without forcing extra vertical scroll).
              "h-[260px] sm:h-[300px] lg:h-[320px]",
              "rounded-xl overflow-hidden border border-[--color-hairline]",
              "bg-white shadow-[var(--shadow-card)]",
              "cursor-pointer transition-shadow hover:shadow-lg",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-action]/50",
            ].join(" ")}
            title={t("compactMapAria")}
          >
            {/* Leaflet map — visual only; pointer events killed so the outer
                div captures the click. The inner map still renders markers
                so the preview is honest. */}
            <div className="absolute inset-0 pointer-events-none select-none">
              <HierarchicalMap
                items={mapItems}
                onMarkerClick={() => {}}
                onProvinceClick={() => {}}
                onBackToProvinces={() => {}}
                onBackToMunicipalities={() => {}}
              />
            </div>

            {/* Soft top label so users know what they're looking at. */}
            <div className="absolute top-2 left-2 z-10 pointer-events-none">
              <span className="inline-flex items-center rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-[--color-ink-primary] shadow-sm">
                {t("mapHeading")}
              </span>
            </div>

            {/* Expand affordance — bottom-right. Pointer events left on so
                the inner pill is still a visible "button" for users who
                instinctively look for one. Its click bubbles up to the outer
                role=button so behavior is identical. */}
            <div className="absolute bottom-2 right-2 z-10">
              <span
                className="inline-flex items-center gap-1 rounded-full bg-[--color-ink-primary] px-3 py-1.5 text-[11px] font-semibold text-white shadow-md group-hover:bg-[--color-action] transition-colors"
                aria-hidden="true"
              >
                {t("openFullMap")}
              </span>
            </div>
          </div>
        </section>

        {/* Endless marquee — split into two category rows (inmuebles +
            vehículos). Modal popup is OFF (cards link to detail page). */}
        <HomeCarouselSection limit={30} seeAllHref="/subastas?when=activas" />

        {/* Province selector + grid */}
        <section aria-labelledby="provinces-heading" className="space-y-4">
          <h2 id="provinces-heading" className="font-display text-2xl text-[--color-ink-primary]">
            {t("provincesHeading")}
          </h2>
          <div className="max-w-md">
            <ProvinceDropdown />
          </div>
          <ProvinceGrid
            provinceCounts={provinceCounts}
            onProvinceClick={(province: string) =>
              router.push(provinceHref(province))
            }
            onMunicipalityClick={(municipality: string, province: string) =>
              router.push(townHref(province, municipality))
            }
          />
        </section>

        {/* How it works — plain Spanish, no marketing fluff */}
        <section className="rounded-lg bg-[--color-surface-muted] p-6 md:p-8 max-w-readable">
          <h2 className="font-display text-xl text-[--color-ink-primary]">
            {t("howItWorksHeading")}
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-[--color-ink-secondary]">
            {t("howItWorksP1")}
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-[--color-ink-secondary]">
            {t("howItWorksP2")}
          </p>
          <Link
            href="/subastas"
            className="mt-4 inline-flex items-center text-sm font-medium text-[--color-brand] hover:underline"
          >
            {t("startExploring")}
          </Link>
        </section>
      </main>
    </div>
  );
}
