"use client";

/**
 * LanguageSwitcher — header control to toggle between Spanish (default) and
 * English on subastasactivas.com.
 *
 * Design contract (Phase 7a / wave15):
 *   - Spanish lives at the un-prefixed URL space (`/...`).
 *   - English lives behind `/en/...`.
 *   - Middleware (`src/middleware.ts`) strips the `/en` prefix and exposes the
 *     locale via the `x-locale` request header + `NEXT_LOCALE` cookie.
 *
 * Behaviour on select:
 *   - Compute the target URL by adding or removing the `/en` prefix on the
 *     CURRENT pathname (preserving query string + hash so a province filter or
 *     a deep auction link survives the switch).
 *   - Persist the choice in the `NEXT_LOCALE` cookie so a cookie-only revisit
 *     to `/` still gets EN messages (middleware reads the cookie when there's
 *     no `/en` URL prefix). 1-year TTL, SameSite=Lax, Path=/.
 *   - `router.push` to the locale-aware URL — keeps SPA navigation, and the
 *     middleware re-runs to set the `x-locale` header for the new request.
 *
 * Visual signature:
 *   - Lives in the right cluster of `ObservatoryHeader.tsx`, immediately
 *     before `NotificationBell`.
 *   - Globe icon + 2-letter active locale label (ES / EN), all-black ink to
 *     match the rest of the header. No flags — flags conflate language with
 *     country, and EN is read by far more than just UK/US visitors.
 *   - Width is locked to the longer label so the layout doesn't shift when
 *     switching ES → EN.
 *   - Radix DropdownMenu primitive → keyboard navigation, focus trap, escape
 *     to close, and `aria-haspopup` / `aria-expanded` come for free.
 *
 * Accessibility:
 *   - Trigger has `aria-label` ("Cambiar idioma" / "Change language") since
 *     the visible text is just a 2-letter code.
 *   - Menu items render a check beside the active locale for non-visual
 *     redundancy (don't rely on color/weight alone).
 *   - Focus ring matches the brand token used by other header controls.
 */

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Check, Globe } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LOCALE_COOKIE, locales, type Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/** Strip a leading `/en` segment from a path. Returns `/` for `/en` and `/en/`. */
function stripLocalePrefix(pathname: string): string {
  const m = pathname.match(/^\/en(?:\/(.*))?$/);
  if (!m) return pathname;
  return "/" + (m[1] ?? "");
}

/** Build the path the user should land on after picking `target`. */
function buildTargetPath(
  currentPathname: string,
  target: Locale,
): string {
  const stripped = stripLocalePrefix(currentPathname);
  if (target === "es") return stripped || "/";
  // EN: prepend `/en` but never produce `/en/` for the home (`/` → `/en`)
  if (stripped === "/" || stripped === "") return "/en";
  return "/en" + stripped;
}

/** Persist locale in the cookie so a return visit without a `/en` URL still loads EN. */
function persistLocaleCookie(locale: Locale): void {
  // One year, root path, lax — matches middleware expectations.
  const oneYearSeconds = 60 * 60 * 24 * 365;
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${oneYearSeconds}; samesite=lax`;
}

const LOCALE_LABELS: Record<Locale, string> = {
  es: "ES",
  en: "EN",
};

const LOCALE_LONG_LABELS: Record<Locale, string> = {
  es: "Español",
  en: "English",
};

export type LanguageSwitcherProps = {
  className?: string;
};

export function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = useLocale() as Locale;
  const t = useTranslations("header");

  const onSelect = (target: Locale) => {
    if (target === active) return;
    persistLocaleCookie(target);
    const path = buildTargetPath(pathname ?? "/", target);
    const query = searchParams?.toString();
    const href = query ? `${path}?${query}` : path;
    router.push(href);
    // Refresh so server components re-render with the new locale headers.
    router.refresh();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("languageSwitcherAria")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm",
          "text-[var(--color-ink-primary)] hover:bg-[var(--color-brand)]/5 hover:text-[var(--color-brand)]",
          "transition-colors cursor-pointer",
          "focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30",
          // Lock minimum width so ES/EN swap doesn't reflow neighbours.
          "min-w-[3.75rem] justify-center",
          className,
        )}
      >
        <Globe className="h-4 w-4" aria-hidden="true" />
        <span className="tnum font-medium tracking-wide">
          {LOCALE_LABELS[active]}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="min-w-[10rem]"
      >
        {locales.map((loc) => {
          const isActive = loc === active;
          return (
            <DropdownMenuItem
              key={loc}
              onSelect={() => onSelect(loc)}
              aria-current={isActive ? "true" : undefined}
              className={cn(
                "flex items-center justify-between gap-3 cursor-pointer",
                isActive && "font-medium",
              )}
            >
              <span className="flex items-center gap-2">
                <span className="tnum text-xs text-[var(--color-ink-tertiary)] w-6">
                  {LOCALE_LABELS[loc]}
                </span>
                <span>{LOCALE_LONG_LABELS[loc]}</span>
              </span>
              {isActive && (
                <Check
                  className="h-4 w-4 text-[var(--color-brand)]"
                  aria-hidden="true"
                />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
