"use client";

/**
 * HomeCarouselSection — ONE carousel row with an Inmuebles / Vehículos
 * segmented toggle (2026-07-10, Pixel — home-funnel-redesign brief; Dennis:
 * "one row, toggle between property and vehicle"). Replaces the previous
 * two side-by-side carousels (2026-06-08 layout).
 *
 *   ┌─ [ Inmuebles | Vehículos ] ─────────────────────────────────┐
 *   │ ┌─ Últimos inmuebles ────────────────────── Ver todas ────┐ │
 *   │ │  [card] [card] [card] [card] [card] [card] …            │ │
 *   │ └──────────────────────────────────────────────────────────┘ │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Fetch strategy — BOTH groups mounted, inactive panel `hidden`:
 *   Each ForexCarousel fetches its own `categoryGroup` slice from
 *   `/api/auctions/carousel-mix?categoryGroup=<real_estate|movable>` on mount
 *   (the route's `rawGroup` parser accepts exactly those two values). We keep
 *   both instances mounted and toggle visibility, so switching tabs is
 *   INSTANT — no refetch, no loading flash — and each panel's own 60s poll
 *   keeps it fresh in the background. Cost: one extra fetch on page load,
 *   which is exactly what the previous two-row layout already paid. The
 *   hidden panel's marquee is paused (`pause` prop) so it burns no rAF work
 *   while invisible; its ResizeObserver re-measures the track on unhide.
 *
 * Pro-tier modularity: the toggle + panels are prop-driven (limit /
 * seeAllHref / province) with no free-tier assumptions baked in — a Pro
 * upsell band can be slotted between the toggle and the row, or a gated
 * third tab added, without restructuring this component.
 *
 * Card-click behaviour is unchanged from the two-row layout: logged-out
 * viewers get the AuthGatePopup at click time with `?next=` preserved;
 * logged-in viewers navigate straight to the canonical detail page
 * (ForexCarousel renders `<Link>` cards when `onCardClick` is omitted).
 * The FeedItem→card mapping inside ForexCarousel is untouched.
 */

import * as React from "react";
import { useTranslations } from "next-intl";
import { ForexCarousel, type FeedAuction, type CategoryGroup } from "./ForexCarousel";
import { AuthGatePopup } from "@/components/access/AuthGatePopup";
import { useAccess } from "@/lib/access-client";
import { buildAuctionSlug } from "@/lib/seo/auction-slug";
import { cn } from "@/lib/utils";

export type HomeCarouselSectionProps = {
  /** How many cards to fetch per group. Default 30. */
  limit?: number;
  /** Where the "Ver todas" header link routes for the INMUEBLES tab. The
   *  vehicles tab always appends the `mapCategory=vehiculos` list filter. */
  seeAllHref?: string;
  /** Exact DB province value (label spelling, e.g. "Vizcaya") — forwarded to carousel-mix's
   *  existing `province` param. Set by the home page's "Cerca de ti"
   *  geolocation flow; null = national feed. */
  province?: string | null;
  className?: string;
};

const GROUPS: ReadonlyArray<{ group: CategoryGroup; labelKey: string }> = [
  { group: "real_estate", labelKey: "carouselTabInmuebles" },
  { group: "movable", labelKey: "carouselTabVehiculos" },
];

export function HomeCarouselSection({
  limit = 30,
  seeAllHref = "/subastas?when=activas",
  // GEO REMOVED (Dennis 2026-07-28): the "Últimos" carousels no longer filter
  // by proximity. A pinned province shrank the pool to ~2 rows which the
  // marquee cloned to fill (the "same 2 cards repeating" bug). Both tabs now
  // draw the full national newest-added pool. `province` is retained on the
  // prop type so the home page caller (HomeObservatory) keeps compiling
  // unchanged, but it is intentionally no longer forwarded to the carousels.
  province: _province = null,
  className,
}: HomeCarouselSectionProps) {
  const t = useTranslations("home");
  const access = useAccess();

  const [active, setActive] = React.useState<CategoryGroup>("real_estate");
  const [popupOpen, setPopupOpen] = React.useState(false);
  const [nextHref, setNextHref] = React.useState<string>("/subastas?when=activas");
  const tabRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const baseId = React.useId();

  // Logged-out viewers get the click-time auth gate; everyone else lets
  // cards navigate directly. The loading window stays gated so we never
  // flash an open detail page before the session resolves.
  const shouldGate = access.loading || access.state === "logged-out";

  const handleCardClick = React.useCallback((auction: FeedAuction) => {
    // The post-auth `next` must be the CANONICAL detail path, not the legacy
    // one — otherwise every gated card click lands the freshly-registered user
    // on a 308 hop. `detailPath` is resolved server-side by
    // `resolveAuctionPath` and projected by /api/auctions/carousel-mix (this is
    // a client component; the `auction_url_v3` mint table is unreachable from
    // here). Legacy slug path is the fallback for an unminted row or an older
    // cached payload — it still 200s.
    const slug = buildAuctionSlug({
      id: auction.id,
      auctionType: auction.auctionType,
      province: auction.province,
      municipality: auction.municipality,
    });
    setNextHref(auction.detailPath ?? `/subastas/subasta/${slug}`);
    setPopupOpen(true);
  }, []);

  const cardClickProp = shouldGate ? handleCardClick : undefined;

  // Roving-tabindex arrow navigation between the two tabs (WAI-ARIA tabs
  // pattern): Left/Right/Home/End move focus AND selection (selection
  // follows focus — there are only two tabs, both instantly available).
  const onTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (index + 1) % GROUPS.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (index - 1 + GROUPS.length) % GROUPS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = GROUPS.length - 1;
    if (next == null) return;
    e.preventDefault();
    setActive(GROUPS[next].group);
    tabRefs.current[next]?.focus();
  };

  // "Ver todas" per tab. The list has no all-real-estate group param today,
  // so the inmuebles tab lands on the active list (property-dominant);
  // vehicles pin the existing `mapCategory=vehiculos` curated filter so the
  // landing list matches what the row shows.
  const seeAllFor = (group: CategoryGroup): string => {
    if (group !== "movable") return seeAllHref;
    const [path, qs] = seeAllHref.split("?");
    const params = new URLSearchParams(qs ?? "");
    params.set("mapCategory", "vehiculos");
    return `${path}?${params.toString()}`;
  };

  return (
    <div className={cn("space-y-3", className)}>
      {/* Segmented control. */}
      <div
        role="tablist"
        aria-label={t("carouselTabsAria")}
        className="inline-flex rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface)] p-0.5 shadow-[var(--shadow-card)]"
      >
        {GROUPS.map(({ group, labelKey }, i) => {
          const selected = active === group;
          return (
            <button
              key={group}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${group}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${group}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(group)}
              onKeyDown={(e) => onTabKeyDown(e, i)}
              className={cn(
                "rounded-md px-4 py-1.5 text-sm font-semibold transition-colors cursor-pointer",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-action)]/50",
                selected
                  ? "bg-[var(--color-ink-primary)] text-white"
                  : "text-[var(--color-ink-secondary)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-ink-primary)]",
              )}
            >
              {t(labelKey)}
            </button>
          );
        })}
      </div>

      {/* Panels — both mounted (fetch once + background poll), inactive one
          hidden + paused. `hidden` keeps the DOM/a11y tree honest: hidden
          panels are skipped by screen readers and the tab order. */}
      {GROUPS.map(({ group }) => {
        const selected = active === group;
        return (
          <div
            key={group}
            role="tabpanel"
            id={`${baseId}-panel-${group}`}
            aria-labelledby={`${baseId}-tab-${group}`}
            hidden={!selected}
          >
            <ForexCarousel
              className="min-w-0"
              limit={limit}
              seeAllHref={seeAllFor(group)}
              compact
              heading={t(group === "movable" ? "vehiclesHeading" : "propertiesHeading")}
              categoryGroup={group}
              onCardClick={cardClickProp}
              pause={popupOpen || !selected}
            />
          </div>
        );
      })}

      {/* Single shared popup — both tabs route through the same gate. */}
      <AuthGatePopup open={popupOpen} onOpenChange={setPopupOpen} nextHref={nextHref} />
    </div>
  );
}
