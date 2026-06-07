"use client";

/**
 * HomeCarouselSection — TWO stacked carousels: latest properties + latest
 * vehicles. Replaces the previous single-row marquee + chip filters + modal
 * popup (2026-06-07, Pixel — Dennis brief "landing-map-carousel").
 *
 *   ┌─ Últimos inmuebles ──────────────────────────────────────┐
 *   │  [card] [card] [card] [card] [card] [card] [card] …      │
 *   └──────────────────────────────────────────────────────────┘
 *   ┌─ Últimos vehículos ──────────────────────────────────────┐
 *   │  [card] [card] [card] [card] [card] [card] [card] …      │
 *   └──────────────────────────────────────────────────────────┘
 *
 * Behavior changes vs. the previous version:
 *  - The chip steering wheel (HomeQuickFilterChips) is REMOVED from the home
 *    page. Each row is now category-locked (properties vs vehicles), so a
 *    chip that overrides the category would conflict with the row's
 *    identity. Chips remain in use on the listing page.
 *  - The AuctionDetailModal click-to-popup path is REMOVED. Cards are now
 *    plain `<Link>`s to `/subastas/subasta/{slug}` (rendered inside
 *    ForexCarousel when `onCardClick` is omitted). This kills the popup→map
 *    overlap bug AND lines navigation up with the canonical SEO detail
 *    URL — clicks now leave a real funnel + ranking signal.
 *  - Cards are 25 % smaller (handled inside `ForexCarousel` via the new
 *    `compact` flag).
 *
 * Property vs. vehicle split:
 *  - `/api/auctions/carousel-mix` only accepts a single `category` param.
 *    Instead of fanning out one fetch per category, we fetch the full mix
 *    inside each `ForexCarousel` instance and pass a category-group filter
 *    (`'real_estate' | 'movable'`). The carousel applies the predicate
 *    client-side after the standard fetch. Both rows still benefit from the
 *    50/30/20 status mix the endpoint provides — the property split keeps
 *    that mix among REAL_ESTATE rows, the vehicle split among MOVABLE rows.
 *  - Trade-off: each row may briefly show fewer cards than the limit while
 *    the natural property/vehicle ratio in the data settles (vehicles are
 *    a smaller slice of total auctions). We over-fetch to compensate
 *    (`limit * 2` for each row inside ForexCarousel).
 */

import * as React from "react";
import { useTranslations } from "next-intl";
import { ForexCarousel } from "./ForexCarousel";
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

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <ForexCarousel
        limit={limit}
        seeAllHref={seeAllHref}
        compact
        heading={t("propertiesHeading")}
        categoryGroup="real_estate"
      />
      <ForexCarousel
        limit={limit}
        seeAllHref={seeAllHref}
        compact
        heading={t("vehiclesHeading")}
        categoryGroup="movable"
      />
    </div>
  );
}
