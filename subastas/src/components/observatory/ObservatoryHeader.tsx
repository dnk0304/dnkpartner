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
import { useSession, signOut } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import {
  Bell,
  Check,
  ChevronDown,
  Heart,
  LogOut,
  Search,
  User,
  UserCircle2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { apiFetch } from "@/lib/api-path";
import { formatUpdatedDayEs } from "./format";
import { cn } from "@/lib/utils";

export type ObservatoryHeaderProps = {
  /** Hide the search box on pages where it's redundant (e.g. detail). */
  hideSearch?: boolean;
  className?: string;
};

export function ObservatoryHeader({ hideSearch = false, className }: ObservatoryHeaderProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const t = useTranslations("header");
  const locale = useLocale();
  // Routes are locale-aware: Spanish uses `/favoritos`, English uses `/en/favorites`.
  // Alerts + account don't have an EN-prefix today, so under EN they still resolve
  // because the middleware strips `/en` and serves the same component. Keeping a
  // single source of truth here avoids drift if EN gets its own routes later.
  const accountRoutes = React.useMemo(() => {
    const prefix = locale === "en" ? "/en" : "";
    return {
      favorites: locale === "en" ? `${prefix}/favorites` : "/favoritos",
      alerts: `${prefix}/alerts`,
      account: `${prefix}/subscription`,
    };
  }, [locale]);
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
        "sticky top-0 z-40 bg-[var(--color-page)]/95 backdrop-blur-sm hairline-b",
        className,
      )}
      role="banner"
    >
      <div className="mx-auto flex max-w-editorial items-center gap-4 px-4 py-3 md:gap-6 md:px-6">
        {/* Wordmark + trust signal */}
        <div className="flex items-baseline gap-3 min-w-0">
          <Link
            href="/"
            className="font-serif text-xl text-[var(--color-brand)] hover:text-[var(--color-brand-hover)] transition-colors whitespace-nowrap"
            aria-label={t("wordmarkAria")}
          >
            <span className="font-semibold">Subastas</span>
            <span className="font-normal">Activas</span>
            {/* Verified tick — superscript, ™-position. Decorative; wordmark already has aria-label. */}
            <Check
              aria-hidden="true"
              className="inline-block align-super ml-0.5 h-2.5 w-2.5 text-[var(--color-status-live)]"
              strokeWidth={3}
            />
          </Link>
          <span className="hidden md:inline text-xs text-[var(--color-ink-tertiary)] tnum truncate">
            {lastUpdate
              ? t("trustSignalUpdated", { when: formatUpdatedDayEs(lastUpdate, locale as "es" | "en") })
              : t("trustSignalSyncing")}
          </span>
        </div>

        {/* Primary nav */}
        <nav
          className="hidden md:flex items-center gap-5 text-sm text-[var(--color-ink-secondary)]"
          aria-label={t("navPrimaryAria")}
        >
          <Link href="/subastas" className="hover:text-[var(--color-brand)] transition-colors">
            {t("navAuctions")}
          </Link>
          <Link href="/noticias" className="hover:text-[var(--color-brand)] transition-colors">
            {t("navNews")}
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
              {t("searchLabel")}
            </label>
            <div className="relative w-full">
              <Search
                aria-hidden="true"
                className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-ink-tertiary)]"
              />
              <input
                id="obs-search"
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t("searchPlaceholder")}
                className={cn(
                  "tnum w-full rounded-md border bg-white py-2 pl-9 pr-3 text-sm",
                  "border-[var(--color-hairline)] text-[var(--color-ink-primary)] placeholder:text-[var(--color-ink-tertiary)]",
                  "focus:outline-none focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/15",
                )}
              />
            </div>
          </form>
        )}

        {/* Right cluster */}
        <div className={cn("flex items-center gap-2 shrink-0", hideSearch && "ml-auto")}>
          <LanguageSwitcher />
          <NotificationBell />
          {session?.user ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={t("accountMenuAria")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm cursor-pointer",
                  "text-[var(--color-ink-secondary)] hover:text-[var(--color-brand)] hover:bg-[var(--color-brand)]/5",
                  "transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30",
                )}
              >
                <User className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">{t("myPanel")}</span>
                <ChevronDown className="h-3.5 w-3.5 text-[var(--color-ink-tertiary)]" aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={6} className="min-w-[14rem]">
                {session.user.email && (
                  <>
                    <DropdownMenuLabel className="text-xs font-normal text-[var(--color-ink-tertiary)]">
                      <span className="block truncate" title={session.user.email}>
                        {session.user.email}
                      </span>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem asChild className="cursor-pointer">
                  <Link href={accountRoutes.favorites} className="flex items-center gap-2">
                    <Heart className="h-4 w-4 text-[var(--color-ink-tertiary)]" aria-hidden="true" />
                    <span>{t("accountFavorites")}</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer">
                  <Link href={accountRoutes.alerts} className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-[var(--color-ink-tertiary)]" aria-hidden="true" />
                    <span>{t("accountAlerts")}</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer">
                  <Link href={accountRoutes.account} className="flex items-center gap-2">
                    <UserCircle2 className="h-4 w-4 text-[var(--color-ink-tertiary)]" aria-hidden="true" />
                    <span>{t("accountSettings")}</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => {
                    void signOut({ callbackUrl: "/" });
                  }}
                  className="cursor-pointer text-[var(--color-warn-critical)] focus:text-[var(--color-warn-critical)] focus:bg-[var(--color-warn-critical-soft)]/40"
                >
                  <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
                  <span>{t("accountSignOut")}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center rounded-md border border-[var(--color-brand)]/30 px-3 py-1.5 text-sm font-medium text-[var(--color-brand)] hover:bg-[var(--color-brand)]/5 transition-colors"
            >
              {t("signIn")}
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
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-ink-tertiary)]"
            />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="tnum w-full rounded-md border border-[var(--color-hairline)] bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/15"
            />
          </div>
        </form>
      )}
    </header>
  );
}
