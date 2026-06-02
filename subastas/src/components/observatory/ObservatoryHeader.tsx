"use client";

/**
 * ObservatoryHeader — the persistent, judicial site header.
 *
 * Variant of the existing TopBar that follows the visual signature:
 *   - hairline bottom border
 *   - serif wordmark, sans nav links
 *   - search box (Cmd/Ctrl-K placeholder for later — current impl just submits to /subastas?search=)
 *   - NotificationBell on the right (Wave 2c component, wired in)
 *   - "Datos actualizados hace X min" trust-signal next to the wordmark
 *
 * Used by: home (/), list (/subastas), detail (/auction/[id]).
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Search, User } from "lucide-react";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { apiFetch } from "@/lib/api-path";
import { formatRelativeEs } from "./format";
import { cn } from "@/lib/utils";

export type ObservatoryHeaderProps = {
  /** Hide the search box on pages where it's redundant (e.g. detail). */
  hideSearch?: boolean;
  className?: string;
};

export function ObservatoryHeader({ hideSearch = false, className }: ObservatoryHeaderProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const [searchTerm, setSearchTerm] = React.useState("");
  const [lastUpdate, setLastUpdate] = React.useState<string | null>(null);

  // Fetch last-update timestamp from /api/auctions/stats once per mount.
  // This is the "Datos actualizados hace X min" trust signal — refresh every
  // 5 minutes so the relative-time label stays roughly accurate.
  React.useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await apiFetch("/api/auctions/stats");
        if (!res.ok || cancelled) return;
        const body = await res.json();
        if (!cancelled && body?.data?.lastUpdateTime) {
          setLastUpdate(body.data.lastUpdateTime);
        }
      } catch {
        // silent
      }
    };
    tick();
    const id = window.setInterval(tick, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchTerm.trim();
    if (q) router.push(`/subastas?search=${encodeURIComponent(q)}`);
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-40 bg-[--color-page]/95 backdrop-blur-sm hairline-b",
        className,
      )}
      role="banner"
    >
      <div className="mx-auto flex max-w-editorial items-center gap-4 px-4 py-3 md:gap-6 md:px-6">
        {/* Wordmark + trust signal */}
        <div className="flex items-baseline gap-3 min-w-0">
          <Link
            href="/"
            className="font-serif text-xl text-[--color-brand] hover:text-[--color-brand-hover] transition-colors whitespace-nowrap"
            aria-label="SubastasActivas — inicio"
          >
            <span className="font-semibold">Subastas</span>
            <span className="font-normal">Activas</span>
          </Link>
          <span className="hidden md:inline text-xs text-[--color-ink-tertiary] tnum truncate">
            {lastUpdate
              ? `Datos actualizados ${formatRelativeEs(lastUpdate)}`
              : "Sincronizando datos…"}
          </span>
        </div>

        {/* Primary nav */}
        <nav
          className="hidden md:flex items-center gap-5 text-sm text-[--color-ink-secondary]"
          aria-label="Navegación principal"
        >
          <Link href="/subastas" className="hover:text-[--color-brand] transition-colors">
            Subastas
          </Link>
          <Link href="/" className="hover:text-[--color-brand] transition-colors">
            Últimas actualizaciones
          </Link>
        </nav>

        {/* Search */}
        {!hideSearch && (
          <form
            onSubmit={onSearchSubmit}
            role="search"
            className="ml-auto hidden md:flex items-center flex-1 max-w-md"
          >
            <label htmlFor="obs-search" className="sr-only">
              Buscar subastas
            </label>
            <div className="relative w-full">
              <Search
                aria-hidden="true"
                className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[--color-ink-tertiary]"
              />
              <input
                id="obs-search"
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ID, ref. catastral, ciudad…"
                className={cn(
                  "tnum w-full rounded-md border bg-white py-2 pl-9 pr-3 text-sm",
                  "border-[--color-hairline] text-[--color-ink-primary] placeholder:text-[--color-ink-tertiary]",
                  "focus:outline-none focus:border-[--color-brand] focus:ring-2 focus:ring-[--color-brand]/15",
                )}
              />
            </div>
          </form>
        )}

        {/* Right cluster */}
        <div className={cn("flex items-center gap-2 shrink-0", hideSearch && "ml-auto")}>
          <NotificationBell />
          {session?.user ? (
            <Link
              href="/favorites"
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-[--color-ink-secondary] hover:text-[--color-brand] hover:bg-[--color-brand]/5 transition-colors"
            >
              <User className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Mi panel</span>
            </Link>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center rounded-md border border-[--color-brand]/30 px-3 py-1.5 text-sm font-medium text-[--color-brand] hover:bg-[--color-brand]/5 transition-colors"
            >
              Entrar
            </Link>
          )}
        </div>
      </div>

      {/* Mobile search row */}
      {!hideSearch && (
        <form
          onSubmit={onSearchSubmit}
          role="search"
          className="md:hidden mx-auto max-w-editorial px-4 pb-3"
        >
          <div className="relative w-full">
            <Search
              aria-hidden="true"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[--color-ink-tertiary]"
            />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ID, ref. catastral, ciudad…"
              className="tnum w-full rounded-md border border-[--color-hairline] bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:border-[--color-brand] focus:ring-2 focus:ring-[--color-brand]/15"
            />
          </div>
        </form>
      )}
    </header>
  );
}
