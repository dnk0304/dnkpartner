"use client";

/**
 * MisSubastasSection — "Mis Subastas" panel for the Alertas page.
 *
 * Shows the auctions the user is currently FOLLOWING (their favoritas/follows),
 * as a distinct section stacked below "Mis Alertas". It reuses the EXISTING
 * follow data + endpoints — it does NOT re-implement follow logic:
 *
 *   - GET    /api/favorites            → the user's followed auctions (auth-gated,
 *                                        WHERE userId = session.user.id). Returns
 *                                        `f.id, f.auctionId, f.notes, f.createdAt`
 *                                        plus every Auction column via `a.*`.
 *   - DELETE /api/favorites?auctionId= → "dejar de seguir" (same call the
 *                                        /favoritos page uses to remove a follow).
 *
 * IMPORTANT data-shape note (why we read fields at the TOP level, not `.auction`):
 * the endpoint SELECTs `f.id, f.auctionId, f.notes, f.createdAt, a.*`. Under the
 * Postgres driver (@/lib/db) the row is FLAT — Auction columns are spread at the
 * top level, not nested. Two column names collide and the later `a.*` wins:
 *   - `id`        → resolves to the AUCTION id (a.id)   ← we use this for links + unfollow
 *   - `auctionId` → resolves to Auction.auctionId (a nullable BOE ref), NOT the FK
 * Because the follow FK (f.auctionId) references a.id, `row.id` IS the auction id
 * we need for both the detail link (`/auction/{id}`) and the DELETE (`?auctionId=`).
 *
 * Copy is hardcoded Spanish (not next-intl `t()`), matching the sibling follows
 * surface (`/favoritos`, which is 100% hardcoded Spanish) and avoiding edits to
 * `messages/*.json` while the i18n-extraction branch is in flight (keeps Ken's
 * merge conflict-free). The rest of the Alertas page uses `t()`; this component
 * is self-contained so the two coexist cleanly.
 */

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Heart, HeartOff, MapPin, ExternalLink, Loader2, AlertCircle, Bookmark } from "lucide-react";
import { apiFetch } from "@/lib/api-path";
import { statusHumanLabel } from "@/lib/auction-status";
import { resolveCardImage } from "@/lib/resolve-card-image";
import { auctionCardTitle } from "@/lib/seo/display-title";

/**
 * A followed-auction row as returned by GET /api/favorites (flat shape — see
 * file header). Only the fields this card renders are typed; the endpoint
 * returns the full Auction row, but we deliberately keep the surface small.
 */
interface FollowedAuction {
  /** = a.id (auction id). The `a.*` spread overwrites f.id — see file header. */
  id: string;
  /** Raw scraped title (nullable). Fed to auctionCardTitle as last-resort. */
  title: string | null;
  category: string | null;
  province: string | null;
  municipality: string | null;
  address: string | null;
  propertyType: string | null;
  auctionType: string | null;
  lotDescription: string | null;
  status: string | null;
  imageUrl: string | null;
  hasImage: boolean | null;
  latitude: number | null;
  longitude: number | null;
  /** f.createdAt — when the user started following (survives the collision). */
  createdAt: string | null;
}

/**
 * Map a DB status to the Tailwind classes for its badge. Colour encodes state:
 * live (green), upcoming (blue), suspended (amber), terminal (slate). Falls back
 * to slate for any unrecognised value so a new enum never renders unstyled.
 */
function statusBadgeClasses(status: string | null): string {
  switch (status) {
    case "CELEBRANDOSE":
    case "ACTIVE":
      return "bg-green-100 text-green-800 ring-1 ring-green-200";
    case "PROXIMA_APERTURA":
    case "PRE_AUCTION":
      return "bg-blue-100 text-blue-800 ring-1 ring-blue-200";
    case "SUSPENDIDA":
    case "SUSPENDED":
      return "bg-amber-100 text-amber-900 ring-1 ring-amber-200";
    default:
      // CANCELADA / CONCLUIDA_PORTAL / FINALIZADA_AUTORIDAD / FINISHED / unknown
      return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
  }
}

/** Human location line: "Municipio, Provincia" with graceful degradation. */
function locationLine(a: FollowedAuction): string | null {
  const muni = a.municipality?.trim() || null;
  const prov = a.province?.trim() || null;
  if (muni && prov && muni.toLowerCase() !== prov.toLowerCase()) return `${muni}, ${prov}`;
  return muni || prov || null;
}

function FollowedAuctionCard({
  auction,
  onUnfollow,
  unfollowing,
}: {
  auction: FollowedAuction;
  onUnfollow: (id: string) => void;
  unfollowing: boolean;
}) {
  const title = auctionCardTitle({
    title: auction.title,
    category: auction.category,
    province: auction.province,
    municipality: auction.municipality,
    address: auction.address,
    propertyType: auction.propertyType,
    auctionType: auction.auctionType,
    lotDescription: auction.lotDescription,
    useFullStreet: true,
  });
  const image = resolveCardImage({
    imageUrl: auction.imageUrl,
    hasImage: auction.hasImage,
    latitude: auction.latitude,
    longitude: auction.longitude,
    category: auction.category,
    title: auction.title,
    size: "thumbnail",
  });
  const location = locationLine(auction);
  const statusLabel = statusHumanLabel(auction.status);
  const detailHref = `/auction/${auction.id}`;

  return (
    <li>
      <Card className="overflow-hidden transition-shadow hover:shadow-md motion-reduce:transition-none">
        <div className="flex gap-4 p-4">
          {/* Thumbnail — links to the detail page. resolveCardImage never
              returns null, so the box is never blank (graceful fallback). */}
          <Link
            href={detailHref}
            className="relative block h-20 w-28 shrink-0 overflow-hidden rounded-md bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            aria-label={`Ver ${title}`}
            tabIndex={-1}
          >
            <Image
              src={image.src}
              alt=""
              fill
              sizes="112px"
              className="object-cover"
              unoptimized={image.isPlaceholder}
            />
          </Link>

          {/* Main content */}
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-start justify-between gap-3">
              <h3 className="min-w-0 text-base font-semibold leading-snug text-gray-900">
                <Link
                  href={detailHref}
                  className="rounded transition-colors hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
                >
                  {title}
                </Link>
              </h3>
              <span
                className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClasses(
                  auction.status,
                )}`}
              >
                {statusLabel}
              </span>
            </div>

            {location && (
              <p className="flex items-center gap-1.5 text-sm text-gray-500">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden="true" />
                <span className="truncate">{location}</span>
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Link
                href={detailHref}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:border-blue-300 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                Ver subasta
              </Link>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onUnfollow(auction.id)}
                disabled={unfollowing}
                aria-label={`Dejar de seguir ${title}`}
                className="text-gray-500 hover:bg-red-50 hover:text-red-700"
              >
                {unfollowing ? (
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                ) : (
                  <HeartOff className="h-4 w-4" aria-hidden="true" />
                )}
                Dejar de seguir
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </li>
  );
}

export function MisSubastasSection() {
  const [items, setItems] = useState<FollowedAuction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [unfollowingId, setUnfollowingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(false);
      const res = await apiFetch("/api/favorites");
      if (!res.ok) throw new Error(`Failed to fetch favorites (${res.status})`);
      const data = await res.json();
      // Endpoint shape: { success: true, data: [...] }. Read fields flat.
      const rows: FollowedAuction[] = Array.isArray(data?.data) ? data.data : [];
      setItems(rows);
    } catch (err) {
      console.error("Error fetching followed auctions:", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleUnfollow = useCallback(async (auctionId: string) => {
    if (!window.confirm("¿Dejar de seguir esta subasta?")) return;
    setUnfollowingId(auctionId);
    // Snapshot for rollback if the request fails.
    let snapshot: FollowedAuction[] = [];
    setItems((prev) => {
      snapshot = prev;
      return prev.filter((a) => a.id !== auctionId);
    });
    try {
      const res = await apiFetch(`/api/favorites?auctionId=${encodeURIComponent(auctionId)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`Failed to unfollow (${res.status})`);
    } catch (err) {
      console.error("Error unfollowing auction:", err);
      // Rollback — restore the row we optimistically removed.
      setItems(snapshot);
      window.alert("No se pudo dejar de seguir la subasta. Inténtalo de nuevo.");
    } finally {
      setUnfollowingId(null);
    }
  }, []);

  const count = items.length;

  return (
    <section aria-labelledby="mis-subastas-title" className="mt-8">
      <Card className="mb-4">
        <CardHeader>
          <CardTitle id="mis-subastas-title" className="flex items-center gap-2">
            <Bookmark className="h-5 w-5 text-blue-600" aria-hidden="true" />
            Mis Subastas
            {!loading && !error && count > 0 && (
              <span className="text-base font-normal text-gray-400">({count})</span>
            )}
          </CardTitle>
          <CardDescription>
            Las subastas que sigues. Recibes avisos cuando cambia su estado o se acerca el cierre.
          </CardDescription>
        </CardHeader>
      </Card>

      {loading ? (
        <div className="py-12 text-center" aria-live="polite">
          <Loader2
            className="mx-auto h-8 w-8 animate-spin text-gray-400 motion-reduce:animate-none"
            aria-hidden="true"
          />
          <p className="mt-4 text-sm text-gray-500">Cargando tus subastas…</p>
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="mx-auto mb-4 h-12 w-12 text-gray-400" aria-hidden="true" />
            <p className="font-medium text-gray-700">No se pudieron cargar tus subastas</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
              Ha ocurrido un problema al cargar las subastas que sigues.
            </p>
            <div className="mt-6">
              <Button variant="outline" onClick={() => void load()}>
                Reintentar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : count === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <Heart className="h-6 w-6" aria-hidden="true" />
            </div>
            <p className="font-medium text-gray-700">Aún no sigues ninguna subasta</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
              Pulsa <span className="font-medium text-gray-700">Seguir</span> en la ficha de una
              subasta —o el enlace &laquo;Seguir esta subasta&raquo; de tus emails— para verla aquí y
              recibir avisos de sus cambios.
            </p>
            <div className="mt-6">
              <Link
                href="/subastas"
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                Explorar subastas
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3">
          {items.map((auction) => (
            <FollowedAuctionCard
              key={auction.id}
              auction={auction}
              onUnfollow={handleUnfollow}
              unfollowing={unfollowingId === auction.id}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export default MisSubastasSection;
