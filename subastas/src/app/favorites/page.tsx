"use client";

/**
 * Favourites dashboard — `/favoritos` (Spanish canonical) and `/favorites`
 * (legacy alias). Both URLs render this component; we read `usePathname()`
 * to send the auth callbackUrl back to whichever surface the user came in on
 * so the round-trip preserves the URL they actually pasted/clicked.
 *
 * Design contract (Pixel, 2026-06-07):
 *   - Cold-green dashboard scaffolding — same palette as the rest of the
 *     redesigned site (--color-page, --color-surface, --color-action). NO
 *     red hearts (the old "Heart fill-red-500" broke palette discipline).
 *   - Editorial header band: eyebrow + title + count + an "Explorar subastas"
 *     secondary CTA. No vast empty whitespace under the title.
 *   - Account secondary nav rendered at the top so users can hop to alerts /
 *     account / log out without going back to the main header. Mirrors what
 *     the new account dropdown offers, but persistent inside the dashboard.
 *   - Auction grid uses the existing `AuctionCard` (no fork) — only the
 *     wrapping list scaffold and the notes affordance live here.
 *   - Empty state is meaningful: short copy + a single primary CTA pointing
 *     at the listing, not the home page (home includes a hero/etc. that
 *     doesn't help someone who just wants to browse).
 *   - Loading state uses an inline spinner inside the same scaffold rather
 *     than a full-screen blanker, so the chrome (header/footer) keeps the
 *     user oriented while the API call finishes.
 */

import React, { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { AuctionItem } from "@/types";
import { AuctionCard } from "@/components/dashboard/AuctionCard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Heart,
  Trash2,
  Edit2,
  Save,
  X,
  Bell,
  UserCircle2,
  LogOut,
  Loader2,
  Search,
} from "lucide-react";
import { apiFetch } from "@/lib/api-path";
import { cn } from "@/lib/utils";

interface Favorite {
  id: string;
  auctionId: string;
  notes: string | null;
  createdAt: string;
  auction: any;
}

/** Sub-nav entry for the dashboard side rail. */
type DashNavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
};

function DashboardSecondaryNav({ items, onSignOut }: { items: DashNavItem[]; onSignOut: () => void }) {
  return (
    <nav
      aria-label="Navegación de cuenta"
      className="flex flex-wrap items-center gap-1 rounded-lg border border-[--color-hairline] bg-[--color-surface] p-1 text-sm shadow-sm"
    >
      {items.map(({ href, label, icon: Icon, active }) => (
        <Link
          key={href}
          href={href}
          aria-current={active ? "page" : undefined}
          className={cn(
            "inline-flex items-center gap-2 rounded-md px-3 py-1.5 transition-colors",
            active
              ? "bg-[--color-action-soft] text-[--color-brand] font-medium"
              : "text-[--color-ink-secondary] hover:bg-[--color-action-soft]/60 hover:text-[--color-brand]",
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          <span>{label}</span>
        </Link>
      ))}
      <button
        type="button"
        onClick={onSignOut}
        className="ml-auto inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-[--color-ink-secondary] transition-colors hover:bg-[--color-warn-critical-soft]/50 hover:text-[--color-warn-critical]"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        <span>Cerrar sesión</span>
      </button>
    </nav>
  );
}

export default function FavoritesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname() ?? "/favoritos";
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState("");

  // Round-trip the user back to whichever URL they came in on — `/favoritos`
  // (Spanish) or `/favorites` (legacy alias). Default to the Spanish path
  // since that's the canonical surface going forward.
  const callbackUrl = pathname.startsWith("/favorites") ? "/favorites" : "/favoritos";

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
    }
  }, [status, router, callbackUrl]);

  useEffect(() => {
    if (session?.user?.id) {
      fetchFavorites();
    }
  }, [session]);

  const fetchFavorites = async () => {
    try {
      setLoading(true);
      const response = await apiFetch("/api/favorites");
      const result = await response.json();
      if (result.success) {
        setFavorites(result.data);
      }
    } catch (error) {
      console.error("Error fetching favorites:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (auctionId: string) => {
    if (!confirm("¿Eliminar de favoritos?")) return;
    try {
      const response = await apiFetch(`/api/favorites?auctionId=${auctionId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setFavorites(favorites.filter((f) => f.auctionId !== auctionId));
      }
    } catch (error) {
      console.error("Error deleting favorite:", error);
    }
  };

  const handleEditStart = (favorite: Favorite) => {
    setEditingId(favorite.id);
    setEditNotes(favorite.notes || "");
  };

  const handleEditSave = async (auctionId: string) => {
    try {
      const response = await apiFetch("/api/favorites", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auctionId, notes: editNotes }),
      });
      if (response.ok) {
        const result = await response.json();
        setFavorites(favorites.map((f) => (f.auctionId === auctionId ? result.data : f)));
        setEditingId(null);
      }
    } catch (error) {
      console.error("Error updating notes:", error);
    }
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditNotes("");
  };

  const handleSignOut = () => {
    void signOut({ callbackUrl: "/" });
  };

  const navItems: DashNavItem[] = [
    { href: "/favoritos", label: "Mis favoritas", icon: Heart, active: true },
    { href: "/alerts", label: "Mis alertas", icon: Bell },
    { href: "/subscription", label: "Mi cuenta", icon: UserCircle2 },
  ];

  const isLoadingState = status === "loading" || (status === "authenticated" && loading);
  const count = favorites.length;

  return (
    <div className="min-h-screen bg-[--color-page]">
      <div className="mx-auto max-w-editorial px-4 py-8 md:px-6 md:py-12">
        {/* Editorial header band */}
        <header className="mb-8 flex flex-col gap-4 md:mb-10">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[--color-ink-tertiary]">
            Tu panel
          </p>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-3xl font-semibold leading-tight text-[--color-ink-primary] md:text-4xl">
                Mis favoritas
              </h1>
              <p className="mt-2 text-sm text-[--color-ink-secondary] tnum">
                {isLoadingState
                  ? "Cargando…"
                  : count === 0
                    ? "Aún no has guardado ninguna subasta."
                    : `${count} ${count === 1 ? "subasta guardada" : "subastas guardadas"}`}
              </p>
            </div>
            <Link
              href="/subastas"
              className="inline-flex items-center gap-2 rounded-md border border-[--color-hairline] bg-white px-3 py-2 text-sm font-medium text-[--color-ink-primary] transition-colors hover:border-[--color-brand]/30 hover:text-[--color-brand] focus:outline-none focus:ring-2 focus:ring-[--color-brand]/20"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              Explorar subastas
            </Link>
          </div>

          <DashboardSecondaryNav items={navItems} onSignOut={handleSignOut} />
        </header>

        {/* Body */}
        {isLoadingState ? (
          <div className="flex items-center justify-center rounded-xl border border-[--color-hairline] bg-[--color-surface] p-16 text-[--color-ink-tertiary]">
            <Loader2 className="mr-3 h-5 w-5 animate-spin" aria-hidden="true" />
            <span className="text-sm">Cargando favoritos…</span>
          </div>
        ) : count === 0 ? (
          <div
            className="rounded-xl border border-[--color-hairline] p-12 text-center"
            style={{ background: "var(--gradient-accent)" }}
          >
            <div className="mx-auto mb-5 inline-flex h-14 w-14 items-center justify-center rounded-full bg-white/80 text-[--color-brand] shadow-sm">
              <Heart className="h-7 w-7" aria-hidden="true" />
            </div>
            <h2 className="font-display text-2xl font-semibold text-[--color-ink-primary]">
              No tienes favoritas
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-[--color-ink-secondary]">
              Guarda subastas para seguir su evolución, dejar notas privadas y recibir avisos
              cuando cambie el estado o se acerque el cierre.
            </p>
            <div className="mt-6">
              <Link
                href="/subastas"
                className="inline-flex items-center gap-2 rounded-md bg-[--color-action] px-4 py-2 text-sm font-medium text-white shadow-[var(--shadow-cta)] transition-colors hover:bg-[--color-action-hover] focus:outline-none focus:ring-2 focus:ring-[--color-action]/30"
              >
                <Search className="h-4 w-4" aria-hidden="true" />
                Explorar subastas
              </Link>
            </div>
          </div>
        ) : (
          <ul className="grid gap-4 md:gap-5">
            {favorites.map((favorite) => {
              const auction: AuctionItem = {
                id: favorite.auction.id,
                title: favorite.auction.title,
                category: favorite.auction.category,
                province: favorite.auction.province,
                community: "",
                currentBid: favorite.auction.currentBid,
                appraisalValue: favorite.auction.appraisalValue,
                minimumBid: favorite.auction.minimumBid,
                claimedAmount: favorite.auction.claimedAmount,
                courtName: favorite.auction.courtName,
                procedureNumber: favorite.auction.procedureNumber,
                boeLink: favorite.auction.boeLink,
                edictUrl: favorite.auction.edictUrl,
                pdfUrl: favorite.auction.pdfUrl,
                status: favorite.auction.status,
                endDate: new Date(favorite.auction.endsAt),
                source: favorite.auction.source,
                imageUrl: favorite.auction.imageUrl || "/api/placeholder/400/300",
                address: favorite.auction.address,
                latitude: favorite.auction.latitude,
                longitude: favorite.auction.longitude,
                courtReference: favorite.auction.courtReference,
                originalSource: favorite.auction.originalSource,
                municipality: favorite.auction.municipality,
              };
              const isEditing = editingId === favorite.id;

              return (
                <li
                  key={favorite.id}
                  className="overflow-hidden rounded-xl border border-[--color-hairline] bg-[--color-surface] shadow-sm transition-shadow hover:shadow-[var(--shadow-card)]"
                >
                  <div className="grid gap-0 md:grid-cols-[320px_1fr]">
                    <div className="border-b border-[--color-hairline] p-4 md:border-b-0 md:border-r">
                      <AuctionCard
                        item={auction}
                        userTier="gold"
                        onClick={() => router.push(`/auction/${auction.id}`)}
                      />
                    </div>

                    <div className="flex flex-col p-5">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <h3 className="text-sm font-medium uppercase tracking-wide text-[--color-ink-tertiary]">
                          Notas privadas
                        </h3>
                        <div className="flex gap-2">
                          {isEditing ? (
                            <>
                              <Button size="sm" variant="outline" onClick={handleEditCancel}>
                                <X className="h-4 w-4" aria-hidden="true" />
                                <span className="sr-only">Cancelar</span>
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleEditSave(favorite.auctionId)}
                              >
                                <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />
                                Guardar
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEditStart(favorite)}
                                aria-label="Editar nota"
                              >
                                <Edit2 className="h-4 w-4" aria-hidden="true" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDelete(favorite.auctionId)}
                                aria-label="Eliminar de favoritos"
                                className="text-[--color-warn-critical] hover:bg-[--color-warn-critical-soft]/50 hover:text-[--color-warn-critical]"
                              >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      {isEditing ? (
                        <Textarea
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          placeholder="Añade tus notas aquí…"
                          className="min-h-[140px]"
                        />
                      ) : (
                        <div className="flex-1 rounded-lg bg-[--color-surface-muted] p-4 text-sm">
                          {favorite.notes ? (
                            <p className="whitespace-pre-wrap text-[--color-ink-primary]">
                              {favorite.notes}
                            </p>
                          ) : (
                            <p className="italic text-[--color-ink-quiet]">Sin notas</p>
                          )}
                        </div>
                      )}

                      <p className="mt-3 text-xs text-[--color-ink-tertiary] tnum">
                        Guardado el{" "}
                        {new Date(favorite.createdAt).toLocaleDateString("es-ES", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
