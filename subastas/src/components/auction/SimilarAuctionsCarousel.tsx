"use client";

/**
 * SimilarAuctionsCarousel — "Subastas parecidas" strip near the bottom of
 * the detail page.
 *
 * Data source: `/api/auctions?province=…&category=…&statuses=ACTIVE,…
 *   &limit=12`. We deliberately re-use the existing list endpoint instead of
 *   adding a new "related" route — same projection, same auth-public path,
 *   same caching. The detail page filters the seed row out client-side so
 *   the row never appears in its own related strip.
 *
 * Layout: a horizontal-scroll strip with a stacked image + title + price +
 * countdown + status badge. One row, snap-x, native overflow scroll. We
 * intentionally do NOT auto-marquee here (the home page does that, but the
 * detail page's user is on a focused task — auto-motion is distracting).
 *
 * Empty / loading states: a fixed-height skeleton on initial load so the
 * page doesn't jump. When zero similar rows resolve we hide the section
 * entirely — an empty "Subastas parecidas" header is worse than nothing.
 */

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { MapPin, ImageOff } from "lucide-react";
import { apiFetch } from "@/lib/api-path";
import { resolveCardImage } from "@/lib/resolve-card-image";
import { buildAuctionSlug } from "@/lib/seo/auction-slug";
import { StatusBadge } from "@/components/observatory/StatusBadge";
import { LiveCountdown } from "@/components/observatory/LiveCountdown";
import { effectiveStatus } from "@/components/observatory/status";
import { capitalize, titleCase, formatPrice } from "@/components/observatory/format";
import { cn } from "@/lib/utils";

type SimilarAuction = {
  id: string;
  boeId?: string | null;
  title: string;
  category: string;
  province: string | null;
  municipality: string | null;
  status: string;
  auctionType: string | null;
  appraisalValue: number | null;
  currentBid: number | null;
  endsAt: string | null;
  endDate?: string | null;
  imageUrl: string | null;
  address?: string | null;
  hasImage?: boolean | null;
};

export type SimilarAuctionsCarouselProps = {
  seedId: string;
  seedProvince: string | null | undefined;
  seedCategory: string | null | undefined;
  className?: string;
};

const DB_TO_FRONTEND_STATUS: Record<string, string> = {
  PROXIMA_APERTURA: "proxima-apertura",
  CELEBRANDOSE: "celebrandose",
  SUSPENDIDA: "suspendida",
  CANCELADA: "cancelada",
  CONCLUIDA_PORTAL: "concluida-portal",
  FINALIZADA_AUTORIDAD: "finalizada-autoridad",
  PRE_AUCTION: "proxima-apertura",
  ACTIVE: "celebrandose",
  FINISHED: "concluida-portal",
  SUSPENDED: "suspendida",
  CANCELLED: "cancelada",
};

export function SimilarAuctionsCarousel({
  seedId,
  seedProvince,
  seedCategory,
  className,
}: SimilarAuctionsCarouselProps) {
  const [items, setItems] = React.useState<SimilarAuction[] | null>(null);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const params = new URLSearchParams();
      if (seedProvince) params.set("province", seedProvince);
      if (seedCategory) params.set("category", seedCategory);
      params.set("statuses", "ACTIVE,PRE_AUCTION,CELEBRANDOSE,PROXIMA_APERTURA");
      params.set("limit", "12");
      try {
        const res = await apiFetch(`/api/auctions?${params.toString()}`);
        if (!res.ok) {
          if (!cancelled) setError(true);
          return;
        }
        const body = await res.json();
        if (cancelled) return;
        const list = Array.isArray(body?.auctions)
          ? body.auctions
          : Array.isArray(body?.data)
            ? body.data
            : [];
        const filtered = (list as SimilarAuction[])
          .filter((a) => a && a.id !== seedId)
          .slice(0, 10);
        setItems(filtered);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [seedId, seedProvince, seedCategory]);

  // Loading skeleton — fixed height so the page doesn't jump.
  if (items === null && !error) {
    return (
      <section aria-labelledby="similar-heading" className={className}>
        <h2 id="similar-heading" className="font-serif text-xl text-[var(--color-ink-primary)]">
          Subastas parecidas
        </h2>
        <p className="mt-0.5 text-xs text-[var(--color-ink-tertiary)]">
          Otras subastas activas en la misma provincia y categoría.
        </p>
        <div className="mt-4 flex gap-3 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-56 w-56 shrink-0 animate-pulse rounded-lg bg-[var(--color-surface-muted)]"
            />
          ))}
        </div>
      </section>
    );
  }

  if (error || !items || items.length === 0) return null;

  return (
    <section aria-labelledby="similar-heading" className={className}>
      <h2 id="similar-heading" className="font-serif text-xl text-[var(--color-ink-primary)]">
        Subastas parecidas
      </h2>
      <p className="mt-0.5 text-xs text-[var(--color-ink-tertiary)]">
        Otras subastas activas en la misma provincia y categoría.
      </p>
      <div
        className="mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3"
        // Tailwind doesn't ship a custom-scrollbar utility by default; the
        // tiny inline style hides the bar without breaking native scroll on
        // touch devices.
        style={{ scrollbarWidth: "thin" }}
        aria-label="Lista deslizable de subastas parecidas"
      >
        {items.map((auction) => (
          <SimilarCard key={auction.id} auction={auction} />
        ))}
      </div>
    </section>
  );
}

function SimilarCard({ auction }: { auction: SimilarAuction }) {
  const [imgFailed, setImgFailed] = React.useState(false);
  const status = effectiveStatus(
    DB_TO_FRONTEND_STATUS[auction.status] ?? auction.status,
    auction.endsAt ?? auction.endDate ?? null,
  );
  const where = [
    auction.municipality && titleCase(auction.municipality),
    auction.province && capitalize(auction.province),
  ]
    .filter(Boolean)
    .join(", ");

  const resolved = resolveCardImage({
    imageUrl: auction.imageUrl ?? undefined,
    hasImage: auction.hasImage ?? null,
    category: auction.category,
    title: auction.title,
    size: "medium",
  });
  const showImage = !imgFailed && resolved.src;

  // Build the canonical slug for navigation.
  const slug = buildAuctionSlug({
    id: auction.id,
    auctionType: auction.auctionType,
    province: auction.province,
    municipality: auction.municipality,
  });

  const headlinePrice = auction.currentBid ?? auction.appraisalValue;

  return (
    <Link
      href={`/subastas/subasta/${slug}`}
      className={cn(
        "group relative flex w-56 shrink-0 snap-start flex-col overflow-hidden rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface)] transition-colors",
        "hover:border-[var(--color-brand)]/40 hover:shadow-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/40",
      )}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--color-surface-muted)]">
        {showImage ? (
          <Image
            src={resolved.src}
            alt=""
            fill
            sizes="224px"
            className="object-cover transition-transform group-hover:scale-[1.02]"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageOff className="h-8 w-8 text-[var(--color-ink-tertiary)]" aria-hidden="true" />
          </div>
        )}
        <div className="absolute left-2 top-2">
          <StatusBadge status={status} size="sm" />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <p className="line-clamp-2 text-sm font-medium text-[var(--color-ink-primary)]">
          {auction.title}
        </p>
        {where && (
          <p className="flex items-center gap-1 text-[11px] text-[var(--color-ink-tertiary)]">
            <MapPin className="h-3 w-3" aria-hidden="true" />
            <span className="truncate">{where}</span>
          </p>
        )}
        <div className="mt-auto flex items-baseline justify-between gap-2 pt-1">
          <span className="tnum text-sm font-semibold text-[var(--color-ink-primary)]">
            {formatPrice(headlinePrice)}
          </span>
          <LiveCountdown
            target={auction.endsAt ?? auction.endDate ?? null}
            size="sm"
            effectiveStatus={status}
          />
        </div>
      </div>
    </Link>
  );
}
