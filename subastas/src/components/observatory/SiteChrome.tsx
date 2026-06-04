"use client";

/**
 * SiteChrome — the single site-wide header+footer wrapper.
 *
 * Mounted ONCE in the root layout so every public route inherits the
 * `ObservatoryHeader` (search/wordmark/notification/auth) and the shared
 * `SiteFooter`. Before this existed, the header lived per-page inside
 * individual client components — so the programmatic-SEO routes
 * (`/subastas/[slug]`, `/subastas/[slug]/[municipio]`, `/subastas/tipo/[x]`,
 * `/blog`, `/guia/[slug]`) silently shipped without it. Centralising the
 * chrome here is the regression-proof fix: future routes get nav for free.
 *
 * Exclusions (no public chrome):
 *   - `/admin/*`   — nested admin layout has its own UI; public navbar
 *                    would double-chrome it.
 *
 * Auth pages (`/login`, `/register`, `/forgot-password`, `/reset-password`,
 * `/auth/*`) intentionally inherit the public navbar — Dennis asked for
 * "every page" and consistency reads better than a special-case.
 *
 * The header is a client component (it reads `useSession`, `useRouter`,
 * `useTranslations`), so this wrapper is `"use client"` and the root
 * layout stays a server component by composition.
 */

import * as React from "react";
import { usePathname } from "next/navigation";
import { ObservatoryHeader } from "./ObservatoryHeader";
import { SiteFooter } from "./SiteFooter";

export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";

  // Admin gets its own chrome (and its own auth gate). Skip public chrome.
  // Use a startsWith check so nested admin routes (e.g. /admin/scraper) are
  // also excluded.
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");

  if (isAdmin) {
    return <>{children}</>;
  }

  return (
    <>
      <ObservatoryHeader />
      {children}
      <SiteFooter />
    </>
  );
}
