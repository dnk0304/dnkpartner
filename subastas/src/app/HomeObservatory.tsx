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
 *   3. HomeCarouselSection — two carousels side-by-side on desktop, stacked
 *      on mobile:
 *        - "Últimos inmuebles" (REAL_ESTATE-only feed) — left on desktop.
 *        - "Últimos vehículos" (MOVABLE-only feed) — right on desktop.
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
import { MapCategorySidebar } from "@/components/observatory/MapCategorySidebar";
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

/**
 * Stable URLSearchParams instance passed to the landing map's category rail
 * (C4a #7). The rail counts API is keyed on `apiSearchParams.toString()` so we
 * lift this to module scope to avoid a new `URLSearchParams` allocation per
 * render (which would re-fire the counts fetch every render). `status=active`
 * is the canonical clock-guarded predicate used by /api/auctions/counts.
 */
const LANDING_MAP_COUNTS_PARAMS = new URLSearchParams({ status: "active" });

const HierarchicalMap = dynamic(
  () => import("@/components/dashboard/HierarchicalMap").then((m) => m.HierarchicalMap),
  { ssr: false, loading: () => <div className="h-full w-full bg-[var(--color-surface-muted)] animate-pulse" /> },
);

const ProvinceGrid = dynamic(
  () => import("@/components/dashboard/ProvinceGrid").then((m) => m.ProvinceGrid),
  { ssr: false, loading: () => <div className="h-40 bg-[var(--color-surface-muted)] animate-pulse rounded-lg" /> },
);

/** Destination of the click-to-expand affordance on the compact map. */
const FULL_MAP_HREF = "/subastas?view=map";

export default function HomeObservatory() {
  const router = useRouter();
  const t = useTranslations("home");
  const [mapItems, setMapItems] = React.useState<AuctionItem[]>([]);
  const [provinceCounts, setProvinceCounts] = React.useState<Record<string, { active: number; preAuction: number; finished: number; total: number }>>({});

  // Map auctions — ACTIVAS only (C4a #7, 2026-06-07). Dennis: the landing
  // map defaults to Activas, not "active + upcoming". We hit the canonical
  // clock-guarded `status=active` predicate (matches the 542 active badge
  // semantics and the `/subastas?view=map` URL-less seed wired in C2).
  // Users can still widen by clicking through to the full map view.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/auctions/map?status=active");
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

  /**
   * Click on a category row in the compact landing rail. We don't filter the
   * landing map in-place (it's a preview card, not the working surface) —
   * we navigate to the full map view with the category locked in via
   * `?mapCategory=<key>`. Empty key (the "Todas" row) lands on the unfiltered
   * map. The map's own click is wired separately and still routes to the
   * unfiltered full view.
   */
  const openFullMapWithCategory = React.useCallback(
    (key: string) => {
      const qs = new URLSearchParams({ view: "map" });
      if (key) qs.set("mapCategory", key);
      router.push(`/subastas?${qs.toString()}`);
    },
    [router],
  );

  return (
    <div className="min-h-screen bg-[var(--color-page)]">
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
          className="pt-2 grid gap-6 lg:gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] lg:items-start"
        >
          <div className="min-w-0">
            {/* Headline + subhead. Simple Spanish — Dennis explicit: no "en
                juego", no fluff explaining what BOE is. */}
            <div className="space-y-3 max-w-2xl">
              <h1
                id="hero-headline"
                className="font-display text-[28px] sm:text-4xl lg:text-[44px] leading-[1.1] tracking-tight text-[var(--color-ink-primary)]"
              >
                {t("heroHeadline")}
              </h1>
              <p className="text-[15px] md:text-base leading-relaxed text-[var(--color-ink-secondary)]">
                {t("heroSubhead")}
              </p>
            </div>

            {/* Official-sources block (Pixel, 2026-06-08 — boxes removed).
                Dennis: "so text don't overlap and without boxes... write it in
                a way that we can use it for SEO." The old 3-card grid (bordered
                boxes, with the long "Boletín Oficial del Estado" wrapping and
                overlapping inside its box) is gone. It's now clean flowing,
                keyword-rich Spanish copy:

                  • one SEO sentence enumerating the real auction keywords
                    (subastas judiciales, de Hacienda/AEAT, notariales,
                    administrativas, de la Seguridad Social, concursales) so the
                    landing carries genuine keyword density that reads naturally;
                  • beneath it, the three live source families as inline pills —
                    bold name + decorative winter-green dot, NO borders/boxes —
                    so BOE / Seguridad Social / PLABI stay prominent and
                    scannable. We list ONLY sources live in the scraper today
                    (no banks / TEJU) so the claim stays honest.

                The inline list is a semantic <ul> so screen readers still
                announce a 3-item list; the green dots are decorative. The bold
                <strong>s in the prose carry the keywords for SEO without any
                visual box chrome. */}
            <div className="mt-6 max-w-2xl">
              <p
                id="hero-sources-label"
                className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-tertiary)]"
              >
                {t("heroSourcesLabel")}
              </p>
              <p className="mt-2.5 text-[15px] leading-relaxed text-[var(--color-ink-secondary)]">
                {t.rich("heroSourcesSeo", {
                  b: (chunks) => (
                    <strong className="font-semibold text-[var(--color-ink-primary)]">
                      {chunks}
                    </strong>
                  ),
                })}
              </p>
              <ul
                aria-labelledby="hero-sources-label"
                className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2"
              >
                {[
                  { name: t("heroSourceBoeName"), detail: t("heroSourceBoeDetail") },
                  { name: t("heroSourceSsName"), detail: t("heroSourceSsDetail") },
                  { name: t("heroSourcePlabiName"), detail: t("heroSourcePlabiDetail") },
                ].map((src) => (
                  <li key={src.name} className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 shrink-0 rounded-full bg-[var(--color-brand)]"
                    />
                    <span className="text-sm leading-tight">
                      <strong className="font-semibold text-[var(--color-ink-primary)]">
                        {src.name}
                      </strong>
                      <span className="ml-1.5 text-[var(--color-ink-tertiary)]">
                        {src.detail}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
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
                className="inline-flex items-center text-sm font-medium text-[var(--color-action)] hover:text-[var(--color-brand)] hover:underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-action)]/40 rounded px-2 py-2"
              >
                {t("heroCtaSecondary")}
              </Link>
            </div>
          </div>

          {/* ── Compact map card (right column / stacks on mobile) ─────────
              Wave81 split: the card is now a 2-column rail + map. The rail
              owns its own clicks (each category row routes to the full map
              with `?mapCategory=<key>` locked in). The map portion is the
              click-to-expand affordance — clicking anywhere on the map (or
              the explicit "Abrir mapa completo" pill) navigates to the
              unfiltered full map view. Stacking on mobile: rail first
              (compact, horizontally narrow), map underneath. */}
          <div
            className={[
              "w-full rounded-xl overflow-hidden border border-[var(--color-hairline)]",
              "bg-white shadow-[var(--shadow-card)]",
              "grid grid-cols-1 sm:grid-cols-[160px_1fr]",
            ].join(" ")}
          >
            {/* Category rail — counts come from /api/auctions/counts so users
                see live inventory at a glance before deciding to drill in.
                C4a #7 (2026-06-07): scope counts to ACTIVAS via `status=active`
                so the per-category numbers reconcile with the map pins above
                (which are also activas-only) and with the full-map view (whose
                URL-less default is `when=activas` per C2). The rail click
                still routes to the full unfiltered map view — users widen by
                landing there. */}
            <MapCategorySidebar
              selected=""
              onChange={openFullMapWithCategory}
              variant="compact"
              heading={t("mapHeading")}
              apiSearchParams={LANDING_MAP_COUNTS_PARAMS}
              className="border-0 sm:border-r sm:border-[var(--color-hairline)] rounded-none"
            />

            {/* Map preview — pointer events killed so any click is the
                "expand" affordance, not a drag/zoom. Keyboard parity via
                role=button on the wrapper. */}
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
                "group relative",
                "h-[260px] sm:h-[300px] lg:h-[320px]",
                "cursor-pointer transition-shadow hover:shadow-lg",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-action)]/50",
              ].join(" ")}
              title={t("compactMapAria")}
            >
              <div className="absolute inset-0 pointer-events-none select-none">
                <HierarchicalMap
                  items={mapItems}
                  onMarkerClick={() => {}}
                  onProvinceClick={() => {}}
                  onBackToProvinces={() => {}}
                  onBackToMunicipalities={() => {}}
                  compact
                />
              </div>

              {/* Expand affordance — bottom-right. Pointer events left on so
                  it stays a visible "button" for users who look for one;
                  the click bubbles to the wrapper so behavior is identical. */}
              <div className="absolute bottom-2 right-2 z-10">
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-[var(--color-ink-primary)] px-3 py-1.5 text-[11px] font-semibold text-white shadow-md group-hover:bg-[var(--color-action)] transition-colors"
                  aria-hidden="true"
                >
                  {t("openFullMap")}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Endless marquee — two category carousels (inmuebles + vehículos)
            side-by-side on desktop, stacked on mobile. Modal popup is OFF
            (cards link to detail page). */}
        <HomeCarouselSection limit={30} seeAllHref="/subastas?when=activas" />

        {/* Province grid — renders its own internal heading ("Buscar subastas
            por provincia") inside a white card. Sits directly beneath the
            carousel; the dropdown/selector block that previously sat between
            the two was removed (Dennis, 2026-06-07). */}
        <ProvinceGrid
          provinceCounts={provinceCounts}
          onProvinceClick={(province: string) =>
            router.push(provinceHref(province))
          }
          onMunicipalityClick={(municipality: string, province: string) =>
            router.push(townHref(province, municipality))
          }
        />

        {/* How it works — plain Spanish, no marketing fluff */}
        <section className="rounded-lg bg-[var(--color-surface-muted)] p-6 md:p-8 max-w-readable">
          <h2 className="font-display text-xl text-[var(--color-ink-primary)]">
            {t("howItWorksHeading")}
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-[var(--color-ink-secondary)]">
            {t("howItWorksP1")}
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-[var(--color-ink-secondary)]">
            {t("howItWorksP2")}
          </p>
          <Link
            href="/subastas"
            className="mt-4 inline-flex items-center text-sm font-medium text-[var(--color-brand)] hover:underline"
          >
            {t("startExploring")}
          </Link>
        </section>
      </main>
    </div>
  );
}
