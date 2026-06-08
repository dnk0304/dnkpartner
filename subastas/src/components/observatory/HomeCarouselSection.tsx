"use client";

/**
 * HomeCarouselSection — TWO carousels: latest properties + latest vehicles.
 * Side-by-side on desktop, stacked on mobile (2026-06-08, Pixel — Dennis:
 * "carousels side by side"). Replaces the earlier single-row marquee + chip
 * filters + modal popup (2026-06-07, brief "landing-map-carousel").
 *
 *   Desktop (lg+, 2 columns ~50/50):
 *   ┌─ Últimos inmuebles ──────────┐ ┌─ Últimos vehículos ──────────┐
 *   │  [card] [card] [card] …       │ │  [card] [card] [card] …       │
 *   └──────────────────────────────┘ └──────────────────────────────┘
 *
 *   Mobile (<lg, stacked):
 *   ┌─ Últimos inmuebles ──────────────────────────────────────┐
 *   │  [card] [card] [card] [card] [card] [card] [card] …      │
 *   └──────────────────────────────────────────────────────────┘
 *   ┌─ Últimos vehículos ──────────────────────────────────────┐
 *   │  [card] [card] [card] [card] [card] [card] [card] …      │
 *   └──────────────────────────────────────────────────────────┘
 *
 * Each carousel is now ~half width on desktop, so fewer cards are visible at
 * once — the endless marquee is unaffected: ForexCarousel re-measures its own
 * track via ResizeObserver and the modulo-wrap loop is width-agnostic, and the
 * inner track sits in an `overflow-hidden` box so a narrower column simply
 * clips the strip (no card-layout break, fixed 195px compact cards unchanged).
 *
 * Card-click behaviour (Pixel 2026-06-07, brief contrast-popup-c5):
 *  - LOGGED-OUT viewer → opens a floating register/log-in popup
 *    (`AuthGatePopup`) with `?next=<detail-href>` baked into both CTAs. The
 *    underlying detail page is access-gated anyway; surfacing the gate at
 *    click-time turns the carousel into a tighter conversion funnel — the
 *    user just expressed intent on a specific card, we ask them to register
 *    while that intent is fresh and bounce them back the moment they do.
 *  - LOGGED-IN viewer (trial / paid / even trial-expired) → cards keep
 *    behaving as plain `<Link>`s to `/subastas/subasta/{slug}` (the canonical
 *    SEO route + funnel destination). They already have site access; another
 *    auth modal would be pointless friction. ForexCarousel renders `<Link>`
 *    cards whenever `onCardClick` is omitted, so we just don't pass the
 *    handler in this case.
 *
 * What did NOT change (call out for the next session):
 *  - The chip steering wheel is still removed. Each row is category-locked.
 *  - Cards keep the `compact` flag (25 % smaller).
 *  - The marquee pause prop is wired to the popup's open state so the cards
 *    don't keep drifting behind the modal — important so the card the user
 *    clicked stays where they expect when the modal closes.
 *
 * Property vs. vehicle split:
 *  - `/api/auctions/carousel-mix` only accepts a single `category` param.
 *    Instead of fanning out one fetch per category, we fetch the full mix
 *    inside each `ForexCarousel` instance and pass a category-group filter
 *    (`'real_estate' | 'movable'`). The carousel applies the predicate
 *    client-side after the standard fetch. Both rows still benefit from the
 *    50/30/20 status mix the endpoint provides — the property split keeps
 *    that mix among REAL_ESTATE rows, the vehicle split among MOVABLE rows.
 */

import * as React from "react";
import { useTranslations } from "next-intl";
import { ForexCarousel, type FeedAuction } from "./ForexCarousel";
import { AuthGatePopup } from "@/components/access/AuthGatePopup";
import { useAccess } from "@/lib/access-client";
import { buildAuctionSlug } from "@/lib/seo/auction-slug";
import { cn } from "@/lib/utils";

export type HomeCarouselSectionProps = {
  /** How many cards to fetch per row. Default 30. */
  limit?: number;
  /** Where the "Ver todas" header link routes. */
  seeAllHref?: string;
  className?: string;
};

export function HomeCarouselSection({
  limit = 30,
  seeAllHref = "/subastas?when=activas",
  className,
}: HomeCarouselSectionProps) {
  const t = useTranslations("home");
  const access = useAccess();

  const [popupOpen, setPopupOpen] = React.useState(false);
  const [nextHref, setNextHref] = React.useState<string>("/subastas?when=activas");

  // Logged-out viewers get the click-time auth gate; everyone else lets
  // cards navigate directly (ForexCarousel falls back to <Link> when
  // onCardClick is omitted). We still treat the loading window as gated so
  // we don't briefly flash an open detail page before the session resolves.
  const shouldGate = access.loading || access.state === "logged-out";

  const handleCardClick = React.useCallback((auction: FeedAuction) => {
    const slug = buildAuctionSlug({
      id: auction.id,
      auctionType: auction.auctionType,
      province: auction.province,
      municipality: auction.municipality,
    });
    setNextHref(`/subastas/subasta/${slug}`);
    setPopupOpen(true);
  }, []);

  // Only wire onCardClick when the popup gate is active. When the user is
  // signed in, omitting the handler tells ForexCarousel to render its cards
  // as <Link>s (its existing G-not-shipped fallback) — no extra prop dance.
  const cardClickProp = shouldGate ? handleCardClick : undefined;

  return (
    // Side-by-side on desktop (lg+: 2 equal columns), stacked on mobile.
    // `min-w-0` on each cell is load-bearing: the inner marquee track is a
    // `w-max` flex row inside an `overflow-hidden` box — without min-w-0 the
    // grid track would resolve to that intrinsic content width and blow the
    // 50/50 split. With it, each column holds ~half the row and the track
    // clips cleanly to the narrower viewport.
    <div className={cn("grid grid-cols-1 gap-6 lg:grid-cols-2", className)}>
      <ForexCarousel
        className="min-w-0"
        limit={limit}
        seeAllHref={seeAllHref}
        compact
        heading={t("propertiesHeading")}
        categoryGroup="real_estate"
        onCardClick={cardClickProp}
        pause={popupOpen}
      />
      <ForexCarousel
        className="min-w-0"
        limit={limit}
        seeAllHref={seeAllHref}
        compact
        heading={t("vehiclesHeading")}
        categoryGroup="movable"
        onCardClick={cardClickProp}
        pause={popupOpen}
      />

      {/* Single shared popup — both rows route through the same gate. The
          `nextHref` state captures which auction was clicked so register /
          log-in bounces the user straight back to that detail page. */}
      <AuthGatePopup
        open={popupOpen}
        onOpenChange={setPopupOpen}
        nextHref={nextHref}
      />
    </div>
  );
}
