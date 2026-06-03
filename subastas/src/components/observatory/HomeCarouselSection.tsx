"use client";

/**
 * HomeCarouselSection — the steering wheel + the conveyor belt + the popup,
 * wired together as ONE coordinated unit (Items D + E + G).
 *
 *   ┌─ HomeQuickFilterChips ───────────────────────────────────┐
 *   │  Viviendas · Otros · Terrenos · ... · Provincia · Cuándo │
 *   └──────────────────────────────────────────────────────────┘
 *   ┌─ ForexCarousel (endless marquee) ────────────────────────┐
 *   │  [card] [card] [card] [card] [card] [card] [card] …      │
 *   └──────────────────────────────────────────────────────────┘
 *                            ↓ click any card
 *   ┌─ AuctionDetailModal (popup, NO navigation) ──────────────┐
 *   │  Full auction detail. Pauses the marquee while open.     │
 *   └──────────────────────────────────────────────────────────┘
 *
 * Why one component:
 *  - The chips MUST drive the marquee's data feed in lockstep — co-locating
 *    the state here avoids a global store and keeps re-render scope tight.
 *  - The modal lives at this level (not inside the carousel) so it persists
 *    if the carousel re-mounts on filter change AND so Item H (the blur-gate)
 *    can wrap modal fields without re-plumbing through the carousel.
 *
 * Modal-source decision (Item G):
 *   We map the existing `FeedAuction` → `AuctionItem` ON THE CLIENT. The
 *   `recent` feed already projects nearly every field the modal reads
 *   (title, category, province, municipality, status, currentBid,
 *   appraisalValue, minimumBid, endsAt, imageUrl, boeLink, latitude,
 *   longitude, address, pujaStatus, currentBidAmount, occupancy). Fields
 *   the feed doesn't carry (mapUrl, streetViewUrl, edictUrl, pdfUrl,
 *   directionsUrl, address details, court info, cadastralRef) are simply
 *   nulled — the modal already null-guards every one of them. This gives
 *   us:
 *     - Zero extra network round-trip on click (modal opens instantly).
 *     - No loading skeleton flicker.
 *     - One single source of truth for the data (the recent feed payload
 *       the carousel already has in hand).
 *   The trade-off: a few BOE-only fields (edicto PDF, court name) won't be
 *   visible in the modal UNTIL Item H either gates them OR we add a lazy
 *   detail fetch later. Ken can decide. We left the door open: the modal
 *   body has clear conditional blocks per-field, so a future enrich-on-open
 *   merge is one effect away.
 *
 * Item H prep (blur-gate, NOT built now):
 *   The modal is wired here at the section level (not inside the carousel),
 *   meaning H can wrap any field-rendering block in the modal body with a
 *   `<GatedField>` component without ever touching this file. The modal
 *   already keeps every field in its own conditional `{auction.X && (...)}`
 *   block — clean seams for H to slot into.
 */

import * as React from "react";
import { AuctionItem, AuctionCategory } from "@/types";
import { AuctionDetailModal } from "@/components/dashboard/AuctionDetailModal";
import { ForexCarousel, FeedAuction } from "./ForexCarousel";
import {
  HomeQuickFilterChips,
  HomeChipsValue,
  EMPTY_CHIPS_VALUE,
} from "./HomeQuickFilterChips";
import { cn } from "@/lib/utils";

export type HomeCarouselSectionProps = {
  /** How many cards to fetch into the marquee. Default 30 — same as legacy. */
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
  const [chips, setChips] = React.useState<HomeChipsValue>(EMPTY_CHIPS_VALUE);
  const [driftingCount, setDriftingCount] = React.useState<number | undefined>(
    undefined,
  );
  const [selectedAuction, setSelectedAuction] = React.useState<AuctionItem | null>(
    null,
  );
  const [modalOpen, setModalOpen] = React.useState(false);

  const handleCardClick = React.useCallback((feedAuction: FeedAuction) => {
    setSelectedAuction(feedToAuctionItem(feedAuction));
    setModalOpen(true);
  }, []);

  const handleOpenChange = React.useCallback((open: boolean) => {
    setModalOpen(open);
    // Don't clear the selected auction immediately — Radix Dialog animates
    // out, and clearing the data mid-animation flashes the empty state.
    // Modal's own internal `if (!auction) return null` guards re-opens.
  }, []);

  // Memoise the count-change callback so the marquee's effect doesn't
  // re-fire on every parent render.
  const handleItemsCountChange = React.useCallback((n: number) => {
    setDriftingCount(n);
  }, []);

  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <HomeQuickFilterChips
        value={chips}
        onChange={setChips}
        driftingCount={driftingCount}
      />
      <ForexCarousel
        limit={limit}
        seeAllHref={seeAllHref}
        category={chips.category}
        province={chips.province}
        when={chips.when}
        onCardClick={handleCardClick}
        pause={modalOpen}
        onItemsCountChange={handleItemsCountChange}
      />
      <AuctionDetailModal
        auction={selectedAuction}
        open={modalOpen}
        onOpenChange={handleOpenChange}
      />
    </section>
  );
}

/* ── FeedAuction → AuctionItem projection ────────────────────────────────── */

/**
 * Map the lean `FeedAuction` payload the marquee fetches into the
 * `AuctionItem` shape the existing `AuctionDetailModal` reads.
 *
 * Field-by-field rationale (read alongside `types/index.ts` AuctionItem):
 *  - `status` — maps frontend-canonical status keys into the legacy
 *    'active' | 'finished' | 'pre-auction' triad the modal switches on
 *    (`getStatusBadge`). `celebrandose` & `suspendida` → 'active' (the
 *    suspended row is still surfaced as live in the modal header; the
 *    timeline section will eventually explain why), `proxima-apertura` →
 *    'pre-auction', everything terminal → 'finished'.
 *  - `category` — the feed exposes any DB string; the modal types it as
 *    `AuctionCategory`. We cast through `as AuctionCategory` because the
 *    union exactly matches the canonical DB labels OFFICIAL_CATEGORIES
 *    uses. Unknown values just render as text in the badge.
 *  - `endDate` — the modal expects a Date; feed sends ISO. We coerce to
 *    `endsAt` first, falling back to `endDateTime`, and fall further back
 *    to `now` so the "days remaining" math never NaN's.
 *  - `imageUrl` — the modal types this as non-nullable string. We pass
 *    the feed's value or '' so Next/Image at least renders the empty
 *    block; the real per-rung resolution already happened on the card.
 *  - `community` — the modal types it as non-nullable but never reads it;
 *    we pass ''.
 *  - Fields the feed doesn't carry (mapUrl, streetViewUrl, edictUrl,
 *    pdfUrl, directionsUrl, address details, court fields, cadastralRef)
 *    → null. The modal's render tree gates every one of them on truthy.
 */
function feedToAuctionItem(a: FeedAuction): AuctionItem {
  const endsAtIso = a.endsAt ?? a.endDateTime ?? null;
  const endDate = endsAtIso ? new Date(endsAtIso) : new Date();

  return {
    id: a.id,
    title: a.title,
    category: (a.category as AuctionCategory) ?? "Otros inmuebles",
    province: a.province ?? "",
    community: "",
    municipality: a.municipality ?? null,
    address: a.address ?? null,
    currentBid: a.currentBid,
    appraisalValue: a.appraisalValue,
    minimumBid: a.minimumBid,
    status: mapStatusForModal(a.status),
    endDate,
    source: "BOE",
    imageUrl: a.imageUrl ?? "",
    boeLink: a.boeLink,
    latitude: a.latitude,
    longitude: a.longitude,
    // Detail-only enrichments the feed doesn't currently project. The
    // modal renders nothing for these when null.
    courtName: null,
    procedureNumber: null,
    courtReference: null,
    edictUrl: null,
    pdfUrl: null,
    mapUrl: null,
    streetViewUrl: null,
    placeUrl: null,
    directionsUrl: null,
    cadastralRef: null,
    pujaStatus: a.pujaStatus ?? null,
    currentBidAmount: a.currentBidAmount ?? null,
    occupancy: a.occupancy ?? null,
    isLocked: false,
  };
}

function mapStatusForModal(
  status: string,
): AuctionItem["status"] {
  switch (status) {
    case "celebrandose":
    case "active":
      return "active";
    case "proxima-apertura":
    case "pre-auction":
      return "pre-auction";
    case "concluida-portal":
    case "finalizada-autoridad":
    case "cancelada":
    case "finished":
      return "finished";
    case "suspendida":
      // No 'suspended' branch in the modal switch — surface as active so
      // header still renders + badge stays meaningful. (Modal status badge
      // is a Pixel polish item for later.)
      return "active";
    default:
      return "active";
  }
}
