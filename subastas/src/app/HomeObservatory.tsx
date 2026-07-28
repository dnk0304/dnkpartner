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
 *   3. HomeCarouselSection — ONE carousel row with an Inmuebles / Vehículos
 *      segmented toggle (2026-07-10 funnel redesign; both groups fetched +
 *      cached client-side, toggle is instant).
 *   4. ProvinceGrid (province → town tree).
 *   5. Condensed official-sources SEO block (relocated from the hero —
 *      see below) + "Cómo funciona" plain-spoken explainer block.
 *
 * Funnel redesign (2026-07-10, Pixel — Dennis directive):
 *   - Hero LEFT now carries a QUICK SEARCH box (existing accent-folded
 *     `?search=` on the list API — plain submit, no typeahead) and the
 *     POPULAR REGIONS chips (top provinces by active count + the "Cerca de
 *     ti" Phase-1 geolocation chip). Chips navigate to `/subastas/{slug}`.
 *   - The keyword-rich sources copy that used to sit here was NOT deleted
 *     (it carries SEO weight): a condensed version now renders below the
 *     fold, directly above "Cómo funciona" — same i18n keys, same DOM text.
 *   - "Cerca de ti" pins the carousel's existing `province` param inline
 *     (Phase 1: nearest-province snap via static centroids; true radius
 *     sorting is Phase 2 / Forge).
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
import { Search } from "lucide-react";
import { HomeCarouselSection } from "@/components/observatory/HomeCarouselSection";
import { MapCategorySidebar } from "@/components/observatory/MapCategorySidebar";
import { PopularRegionChips } from "@/components/observatory/PopularRegionChips";
import { NearMeStrip, type NearMeSource } from "@/components/observatory/NearMeStrip";
import { apiFetch } from "@/lib/api-path";
import { AuctionItem } from "@/types";
import { PROVINCE_DB_KEY_TO_SLUG, slugify } from "@/lib/seo/slugs";
import { toCanonicalProvince, type CanonicalProvince } from "@/lib/spain-provinces";

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
 * Fold a province name to a case/accent-insensitive key. Used to JOIN the live
 * counts API's province label against the registry rollup's `region.label`
 * (they derive from the same `Auction.province` column but we fold both sides
 * so a case/accent difference can never break the merge). Mirrors exactly the
 * fold `ProvinceGrid` uses for its own counts lookup.
 */
function normalizeProvince(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
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

/**
 * sessionStorage flag set when the user dismisses the near-you pin ("Ver
 * toda España" / "Quitar"). While present, the IP auto-pin never re-fires
 * this session; the explicit GPS chip still works. Session-scoped on
 * purpose — a fresh visit tomorrow gets the nearby default again.
 */
const NEAR_DISMISSED_KEY = "sa:nearby-dismissed";

export default function HomeObservatory() {
  const router = useRouter();
  const t = useTranslations("home");
  const [mapItems, setMapItems] = React.useState<AuctionItem[]>([]);
  const [provinceCounts, setProvinceCounts] = React.useState<Record<string, { active: number; preAuction: number; finished: number; total: number }>>({});
  // AUTHORITATIVE "total auctions we have" (Dennis 2026-07-28) — the true full
  // registry count = COUNT(*) WHERE inScope=true (incl. unknown-status +
  // province-less rows). Sourced from /api/auctions/counts `totals.registryTotal`
  // (single source of truth: src/lib/registro/registry-total.ts) and handed to
  // ProvinceGrid as the DECOUPLED headline total, so the headline no longer
  // undercounts by summing only the province-assigned rows. 0 = unavailable →
  // ProvinceGrid falls back to its Σ-of-rows total.
  const [registryTotal, setRegistryTotal] = React.useState<number>(0);

  // Quick search (funnel redesign #3). Plain submit → the list's existing
  // accent-folded `?search=` (matches all card-text columns server-side).
  // No typeahead this wave — submit-only, so no debounce needed.
  const [searchTerm, setSearchTerm] = React.useState("");
  const onSearchSubmit = React.useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const term = searchTerm.trim();
      if (!term) return;
      router.push(`/subastas?when=activas&search=${encodeURIComponent(term)}`);
    },
    [router, searchTerm],
  );

  // Near-you pin (phase 2, 2026-07-10). One state object so the province and
  // its provenance can never drift apart:
  //   - source "ip"  → auto-pinned on load from GET /api/geo/nearest-province
  //     (Cloudflare edge headers, server-side — no permission prompt).
  //   - source "gps" → the user clicked the "Cerca de ti" chip (explicit,
  //     browser geolocation) — always wins over the IP pin.
  // Clearing the pin records a dismissal in sessionStorage so navigation
  // within the session never re-pins behind the user's back.
  const [near, setNear] = React.useState<{
    province: CanonicalProvince;
    source: NearMeSource;
  } | null>(null);
  const nearProvince = near?.province ?? null;

  // Clear from the strip: unpin AND remember the choice for this session.
  const clearNear = React.useCallback(() => {
    setNear(null);
    try {
      window.sessionStorage.setItem(NEAR_DISMISSED_KEY, "1");
    } catch {
      /* storage blocked — clearing still works for this page view */
    }
  }, []);

  // Auto-detect on load (phase 2). Locked contract:
  //   GET /api/geo/nearest-province → 200 { province: {key,label,slug} | null, source: "ip" }
  // Degrade to full-Spain silently on 404 / error / null / off-taxonomy —
  // zero UI noise, and first paint is NEVER blocked on this fetch (the
  // carousel renders full-Spain immediately and re-pins when this lands).
  React.useEffect(() => {
    let cancelled = false;
    try {
      if (window.sessionStorage.getItem(NEAR_DISMISSED_KEY) === "1") return;
    } catch {
      /* storage blocked — proceed; worst case the strip reappears */
    }
    (async () => {
      try {
        const res = await apiFetch("/api/geo/nearest-province");
        if (!res.ok || cancelled) return;
        const body = await res.json();
        if (cancelled) return;
        const p = body?.province;
        if (!p || typeof p.key !== "string" || typeof p.label !== "string") return;
        // Taxonomy guard: resolve through the canonical table so an
        // unexpected spelling from the geo endpoint can't feed the carousel
        // a filter value that matches nothing.
        const row =
          toCanonicalProvince(p.key) ?? toCanonicalProvince(p.label);
        if (!row) return;
        // Never overwrite an existing pin (e.g. the user beat us to the GPS
        // chip) — functional update keeps this race-free.
        setNear((prev) => prev ?? { province: row, source: "ip" });
      } catch {
        /* endpoint absent (Forge ships in parallel) or network — silent */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  // Province counts. TWO sources, joined by normalized province name:
  //   - GET /api/auctions/counts?groupBy=province  (LIVE SQL over Auction) →
  //     the `active` (Activas) + `preAuction` (Próximas) buckets.
  //   - GET /api/registro/regions  (precomputed AuctionOutcomeStats rollup,
  //     s-maxage=3600 — NOT a live 238k scan) → the `finished` (Finalizadas)
  //     bucket. Each `region.total` = Σ REGISTRY_OUTCOMES
  //     (VENDIDA+DESIERTA+CANCELADA+FINALIZADA_SIN_RESULTADO, INDETERMINADO
  //     EXCLUDED) — the SAME number `/resultados/{provincia}` shows as its
  //     headline (`readSummary().headline.registryTotal`, identical rows), so
  //     the grey "Finalizadas" badge EQUALS the destination page by
  //     construction and the two can never drift (single source of truth).
  // Registry is authoritative for `finished`; if `/api/registro/regions` is
  // unavailable we keep the counts-API `finished` bucket so the grid never
  // blanks. Both fetches run in parallel.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [countsRes, regionsRes] = await Promise.all([
          apiFetch("/api/auctions/counts?groupBy=province"),
          apiFetch("/api/registro/regions").catch(() => null),
        ]);
        if (cancelled || !countsRes.ok) return;
        const body = await countsRes.json();
        if (cancelled || !body?.success) return;

        // Authoritative full-catalog total for the headline (decoupled from the
        // per-province buckets below). Guard NaN → 0 (treated as unavailable).
        setRegistryTotal(Number(body.totals?.registryTotal) || 0);

        // Base buckets from the live counts API.
        const out: Record<string, { active: number; preAuction: number; finished: number; total: number }> = {};
        for (const key of Object.keys(body.counts?.total || {})) {
          out[key] = {
            active: body.counts.active?.[key] || 0,
            preAuction: body.counts.preAuction?.[key] || 0,
            finished: body.counts.finished?.[key] || 0,
            total: body.counts.total?.[key] || 0,
          };
        }

        // Parse the registry rollup (resilient: any failure leaves the
        // counts-API `finished` untouched — never blank the grid).
        let regions: Array<{ label: string; total: number }> | null = null;
        if (regionsRes && regionsRes.ok) {
          try {
            const rb = await regionsRes.json();
            if (Array.isArray(rb?.regions)) {
              regions = rb.regions.filter(
                (r: unknown): r is { label: string; total: number } =>
                  !!r &&
                  typeof (r as { label?: unknown }).label === "string" &&
                  typeof (r as { total?: unknown }).total === "number",
              );
            }
          } catch {
            /* keep counts-API finished */
          }
        }
        if (cancelled) return;

        if (regions) {
          const registryByProvince: Record<string, number> = {};
          for (const r of regions) registryByProvince[normalizeProvince(r.label)] = r.total;

          // Override `finished` with the registry total for every province the
          // counts API already returned, and recompute `total`.
          for (const key of Object.keys(out)) {
            const rt = registryByProvince[normalizeProvince(key)];
            if (rt != null) {
              out[key].finished = rt;
              out[key].total = out[key].active + out[key].preAuction + rt;
            }
          }

          // Registry-only provinces (concluded rows but no live counts key):
          // add them so their Finalizadas still show. Keyed by the registry
          // label so ProvinceGrid's normalized lookup resolves them.
          const present = new Set(Object.keys(out).map(normalizeProvince));
          for (const r of regions) {
            const norm = normalizeProvince(r.label);
            if (!present.has(norm)) {
              out[r.label] = { active: 0, preAuction: 0, finished: r.total, total: r.total };
              present.add(norm);
            }
          }
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
   * Click on a category row in the compact landing rail. Dennis (2026-06-27):
   * clicking a category must land the user on the LIST of auctions in that
   * category — not the pin map. So we route to the default /subastas list view
   * with the category locked in via `?mapCategory=<key>` (already honored by
   * `filtersFromParams` → `filtersToApiParams`, so the list returns only that
   * category server-side). We pin `when=activas` so the landed result count
   * matches the active-scoped count shown in the rail (e.g. "Vivienda 207" =
   * 207 active) — landing on the default `when=todas` would inflate the count
   * and confuse. Empty key (the "Todas" row) lands on `/subastas?when=activas`
   * (all active, no category). The map preview's own click is wired separately
   * (`openFullMap`) and still routes to the full map view.
   */
  const openListWithCategory = React.useCallback(
    (key: string) => {
      const qs = new URLSearchParams({ when: "activas" });
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
            HERO + carousel merged into ONE responsive grid (2026-07-12,
            Pixel — mobile reorder brief).

            Why merged: on mobile Dennis wants headline → carousel → MAP, but
            the map must stay beside the headline on lg+. The map is a single
            (heavy, `/api/auctions/map`-fetching) Leaflet instance — it must
            not be duplicated. Solution: keep ONE map node and let its
            position flow from the grid.

            DOM order is headline → carousel → map, which IS the mobile order
            (single column → natural source-order flow, no `order` hacks, and
            it degrades correctly without CSS). On lg+ explicit grid placement
            restores the original layout exactly: headline | map on row 1,
            carousel spanning the full width on row 2.

            Right column on lg+ = the compact, click-to-expand map card that
            fills the space beside the headline. The full-page map block that
            once sat below the carousel is gone.
            ─────────────────────────────────────────────────────────────── */}
        <div className="pt-2 grid gap-y-6 md:gap-y-8 lg:gap-x-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] lg:items-start">
          <section
            aria-labelledby="hero-headline"
            className="min-w-0 lg:col-start-1 lg:row-start-1"
          >
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

            {/* Quick search (funnel redesign #3). One prominent input +
                submit — the fastest path from "I'm looking for X" to a
                filtered result list. Semantic <form role="search"> so
                assistive tech announces it as the page's search landmark. */}
            <form
              role="search"
              onSubmit={onSearchSubmit}
              className="mt-6 flex max-w-2xl items-stretch gap-2"
            >
              <label htmlFor="home-quick-search" className="sr-only">
                {t("searchAria")}
              </label>
              <div className="relative min-w-0 flex-1">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-tertiary)]"
                />
                <input
                  id="home-quick-search"
                  type="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={t("searchPlaceholder")}
                  enterKeyHint="search"
                  className={[
                    "h-11 w-full rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface)]",
                    "pl-10 pr-3 text-[15px] text-[var(--color-ink-primary)]",
                    "placeholder:text-[var(--color-ink-tertiary)] shadow-[var(--shadow-card)]",
                    "focus:outline-none focus:ring-2 focus:ring-[var(--color-action)]/50 focus:border-[var(--color-action)]/50",
                  ].join(" ")}
                />
              </div>
              <button
                type="submit"
                className="cta-gradient h-11 shrink-0 rounded-lg px-5 text-sm cursor-pointer"
              >
                {t("searchSubmit")}
              </button>
            </form>

            {/* Popular regions (funnel redesign #2) — replaces the SEO
                sources text block that used to sit here. The sources copy
                was NOT deleted: a condensed version renders below the fold
                (above "Cómo funciona") so the keyword text stays in the DOM.
                Chips navigate to the clean province pages. Nearby detection is
                now fully automatic (IP → NearMeStrip); the manual GPS chip was
                removed 2026-07-12. */}
            <PopularRegionChips
              className="mt-6 max-w-2xl"
              counts={provinceCounts}
            />

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
          </section>

          {/* Endless marquee — ONE row with the Inmuebles / Vehículos toggle
              (funnel redesign #1). Modal popup is OFF (cards link to detail
              page). When the IP pin resolved a province, a small note explains
              the pinned feed and offers the province page + clear.
              Grid: full-width row 2 on lg+; on mobile it flows BETWEEN the
              headline and the map (source order = mobile order). */}
          <section
            aria-label={t("carouselSectionAria")}
            className="space-y-3 lg:col-span-2 lg:col-start-1 lg:row-start-2"
          >
            {near && (
              <NearMeStrip
                province={near.province}
                source={near.source}
                provinceHref={provinceHref(near.province.key)}
                onClear={clearNear}
              />
            )}
            {/* `label` (not `key`) — Auction.province stores the label
                spelling in production (verified 2026-07-10: "Vizcaya",
                "Guipúzcoa"); carousel-mix's province filter is exact-equals
                (case-insensitive), so the label is the value that matches. */}
            <HomeCarouselSection
              limit={30}
              seeAllHref="/subastas?when=activas"
              province={nearProvince?.label ?? null}
            />
          </section>

          {/* ── Compact map card ─────────────────────────────────────────
              Wave81 split: the card is a 2-column rail + map. The rail owns
              its own clicks (each category row routes to the full map with
              `?mapCategory=<key>` locked in). The map portion is the
              click-to-expand affordance — clicking anywhere on the map (or the
              explicit "Abrir mapa completo" pill) navigates to the unfiltered
              full map view. Internal stacking on narrow: rail first, map under.

              Placement (2026-07-12): ONE map instance only. On lg+ it sits in
              the hero's right column (row 1); on mobile it is the LAST grid
              child, so it renders below the carousel. No duplicate map, no
              double `/api/auctions/map` fetch. */}
          <div
            className={[
              "w-full rounded-xl overflow-hidden border border-[var(--color-hairline)]",
              "bg-white shadow-[var(--shadow-card)]",
              "grid grid-cols-1 sm:grid-cols-[160px_1fr]",
              "lg:col-start-2 lg:row-start-1",
            ].join(" ")}
          >
            {/* Category rail — counts come from /api/auctions/counts so users
                see live inventory at a glance before deciding to drill in.
                C4a #7 (2026-06-07): scope counts to ACTIVAS via `status=active`
                so the per-category numbers reconcile with the map pins above
                (which are also activas-only) and with the full-map view (whose
                URL-less default is `when=activas` per C2). The rail click now
                routes to the /subastas LIST pre-filtered to that category
                (`?when=activas&mapCategory=<key>`) — Dennis 2026-06-27. */}
            <MapCategorySidebar
              selected=""
              onChange={openListWithCategory}
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
        </div>

        {/* Province grid — renders its own internal heading ("Buscar subastas
            por provincia") inside a white card. Sits directly beneath the
            carousel; the dropdown/selector block that previously sat between
            the two was removed (Dennis, 2026-06-07). */}
        <ProvinceGrid
          provinceCounts={provinceCounts}
          totalAuctions={registryTotal}
          onProvinceClick={(province: string) =>
            router.push(provinceHref(province))
          }
          onMunicipalityClick={(municipality: string, province: string) =>
            router.push(townHref(province, municipality))
          }
        />

        {/* Official-sources SEO block — RELOCATED from the hero (funnel
            redesign #2, 2026-07-10). The keyword-rich prose + the three live
            source pills keep the exact same i18n keys (`heroSourcesSeo`,
            `heroSourceBoe*`, …) so nothing leaves the DOM — the hero slot
            they occupied now belongs to the popular-region chips. Condensed
            presentation: same copy, quieter type, below the fold. */}
        <section
          aria-labelledby="hero-sources-label"
          className="max-w-readable"
        >
          <p
            id="hero-sources-label"
            className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-tertiary)]"
          >
            {t("heroSourcesLabel")}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-secondary)]">
            {t.rich("heroSourcesSeo", {
              b: (chunks) => (
                <strong className="font-semibold text-[var(--color-ink-primary)]">
                  {chunks}
                </strong>
              ),
            })}
          </p>
          <ul className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
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
        </section>

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
