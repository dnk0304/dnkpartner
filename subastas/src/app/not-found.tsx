/**
 * Global 404 — Spanish by default, English when the locale cookie / `/en`
 * prefix indicates EN. Next.js renders this file when a route can't be
 * matched anywhere in the tree.
 *
 * Pre-fix the page body shipped Next's English default ("This page could not
 * be found.") on an otherwise fully-Spanish site, which read like a runtime
 * leak rather than a designed state. This component:
 *   - Uses `getLocale()` from `next-intl/server` so the message respects the
 *     `x-locale` header set by `src/middleware.ts` (works for both the
 *     un-prefixed `es` URL space and the `/en` prefix).
 *   - Stays a Server Component (no `"use client"`) — copy is static and the
 *     bundle stays slim.
 *   - Inherits the public `SiteChrome` (header + footer) automatically — no
 *     special wrapping needed because `app/not-found.tsx` slots inside
 *     `app/layout.tsx`.
 *
 * Visual signature follows the cold-green design tokens already in use across
 * the site: white surface, hairline borders, brand-pine wordmark, action-mint
 * CTA. No emoji, no big graphic — calm and editorial.
 */

import Link from "next/link";
import { getLocale } from "next-intl/server";

type LocalisedCopy = {
  eyebrow: string;
  heading: string;
  body: string;
  ctaHome: string;
  ctaList: string;
};

const COPY: Record<"es" | "en", LocalisedCopy> = {
  es: {
    eyebrow: "Error 404",
    heading: "No encontramos esta página",
    body: "La dirección no existe o se ha movido. Vuelve al inicio o consulta el listado completo de subastas.",
    ctaHome: "Ir al inicio",
    ctaList: "Ver todas las subastas",
  },
  en: {
    eyebrow: "Error 404",
    heading: "We couldn't find this page",
    body: "The address doesn't exist or has been moved. Head back home, or open the full auction listing.",
    ctaHome: "Back to home",
    ctaList: "See all auctions",
  },
};

export default async function NotFound() {
  const localeRaw = await getLocale();
  const locale: "es" | "en" = localeRaw === "en" ? "en" : "es";
  const copy = COPY[locale];
  const homeHref = locale === "en" ? "/en" : "/";
  const listHref = locale === "en" ? "/en/subastas" : "/subastas";

  return (
    <main
      className="mx-auto flex max-w-editorial flex-col items-start gap-6 px-4 py-16 md:px-6 md:py-24"
      role="main"
    >
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--color-ink-tertiary)]">
        {copy.eyebrow}
      </p>
      <h1 className="font-display text-3xl font-semibold leading-tight text-[var(--color-ink-primary)] md:text-4xl">
        {copy.heading}
      </h1>
      <p className="max-w-prose text-base text-[var(--color-ink-secondary)]">
        {copy.body}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Link
          href={homeHref}
          className="inline-flex items-center rounded-md bg-[var(--color-action)] px-4 py-2 text-sm font-medium text-white shadow-[var(--shadow-cta)] transition-colors hover:bg-[var(--color-action-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--color-action)]/30"
        >
          {copy.ctaHome}
        </Link>
        <Link
          href={listHref}
          className="inline-flex items-center rounded-md border border-[var(--color-hairline)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-ink-primary)] transition-colors hover:border-[var(--color-brand)]/30 hover:text-[var(--color-brand)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/20"
        >
          {copy.ctaList}
        </Link>
      </div>
    </main>
  );
}
