"use client";

/**
 * SiteFooter — the single, site-wide persistent footer.
 *
 * Mounted ONCE via `SiteChrome` in the root layout, so every public route
 * (except /admin) inherits this footer. Do NOT remount it per-page.
 *
 * Layout (P1 conversion redesign, 2026-06-04):
 *   - Brand block (wordmark + short tagline + primary "Crear alerta" CTA
 *     on the gradient accent — winter-green sage → deep pine).
 *   - Four link columns: provinces, tipos, SubastasActivas, Legal.
 *     All internal links use the CLEAN /subastas/{slug} +
 *     /subastas/tipo/{slug} URLs (SEO-aligned).
 *   - Pine brand bar at the bottom carries the live "Datos actualizados…"
 *     trust tag (fetched once from /api/auctions/stats — same contract as
 *     the previous quiet footer) + © year + legal microcopy.
 *
 * Palette discipline: white surface + winter-green accent + pine brand bar
 * + ink-gray text. No third hue. The gradient is reserved for the CTA only.
 *
 * i18n: new keys live under `footer.*` (added 2026-06-04). The original
 * `home.footerTagWithUpdate` / `home.footerTagSyncing` keys are still used
 * for the live update tag so the existing translation strings keep working.
 *
 * a11y: <footer role="contentinfo"> implicitly. Each column has an aria
 * label heading. Focus states inherit from globals.css.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-path";
import { formatUpdatedDayEs } from "./format";

/**
 * Top provinces — curated by population + auction volume. These are the
 * clean canonical slugs (07 §2 SEO URL architecture) that resolve to
 * `/subastas/{slug}` server-side. They never carry a query string.
 *
 * NOTE: keep this list short (8 items). The full 52-province grid lives
 * on /subastas. The footer is a navigation hint, not an index.
 */
const TOP_PROVINCES: ReadonlyArray<{ slug: string; label: string }> = [
  { slug: "madrid", label: "Madrid" },
  { slug: "barcelona", label: "Barcelona" },
  { slug: "valencia", label: "Valencia" },
  { slug: "sevilla", label: "Sevilla" },
  { slug: "malaga", label: "Málaga" },
  { slug: "alicante", label: "Alicante" },
  { slug: "murcia", label: "Murcia" },
  { slug: "baleares", label: "Baleares" },
];

/**
 * Auction-type links — match the canonical /subastas/tipo/{tipo} slugs
 * in src/lib/seo/slugs.ts (TIPO_SLUG_TO_DB_KEYS). Plain Spanish labels;
 * we don't say "BOE" anywhere user-facing per Dennis.
 */
const TIPOS: ReadonlyArray<{ slug: string; labelKey: string }> = [
  { slug: "judicial", labelKey: "footer.tipoJudicial" },
  { slug: "hacienda", labelKey: "footer.tipoHacienda" },
  { slug: "notarial", labelKey: "footer.tipoNotarial" },
  { slug: "administrativas", labelKey: "footer.tipoAdministrativas" },
];

export function SiteFooter() {
  const t = useTranslations();
  const locale = useLocale() as "es" | "en";
  const { status } = useSession();
  const router = useRouter();
  const [lastUpdateTime, setLastUpdateTime] = React.useState<string | null>(null);
  const year = new Date().getFullYear();

  /**
   * Brand-block CTA → the auctions listing, with a register prompt for
   * logged-out visitors. Mirrors the canonical register-gate pattern from
   * CrearAlertaCTA: unauthenticated users route to /register carrying BOTH
   * `callbackUrl` and `next` (= /subastas) so they land on the listing after
   * signing up; everyone else goes straight to /subastas. `loading` falls
   * through to the listing — never trap a click while the session resolves.
   */
  const handleSeeAllAuctions = React.useCallback(() => {
    if (status === "unauthenticated") {
      const dest = encodeURIComponent("/subastas");
      router.push(`/register?callbackUrl=${dest}&next=${dest}`);
      return;
    }
    router.push("/subastas");
  }, [status, router]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/auctions/stats");
        if (!res.ok || cancelled) return;
        const body = await res.json();
        if (!cancelled && body?.success && body?.data?.lastUpdateTime) {
          setLastUpdateTime(body.data.lastUpdateTime as string);
        }
      } catch {
        /* silent — trust tag degrades to "syncing" copy */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <footer
      className="hairline-t mt-16 bg-[var(--color-surface)] text-[var(--color-ink-secondary)]"
      aria-label={t("footer.aria")}
    >
      <div className="mx-auto max-w-editorial px-4 md:px-6 py-12 md:py-14">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-12 md:gap-8">
          {/* Brand block — sits 5 cols on md+, full-width below */}
          <div className="md:col-span-5 lg:col-span-4 space-y-4">
            <Link
              href="/"
              className="inline-flex items-center text-[var(--color-ink-primary)] font-display text-xl font-semibold tracking-tight"
              aria-label={t("footer.brandAria")}
            >
              SubastasActivas
            </Link>
            <p className="max-w-prose text-sm leading-relaxed text-[var(--color-ink-secondary)]">
              {t("footer.tagline")}
            </p>
            <button
              type="button"
              onClick={handleSeeAllAuctions}
              className="cta-gradient text-sm font-sans cursor-pointer"
              aria-label={t("footer.ctaAria")}
            >
              {t("footer.ctaLabel")}
              <span aria-hidden="true">→</span>
            </button>
          </div>

          {/* Link columns — 7 cols on md+, 4 columns inside */}
          <nav
            className="md:col-span-7 lg:col-span-8 grid grid-cols-2 gap-8 sm:grid-cols-4"
            aria-label={t("footer.navAria")}
          >
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-primary)]">
                {t("footer.colProvincesTitle")}
              </h2>
              <ul className="mt-4 space-y-2.5 text-sm">
                {TOP_PROVINCES.map((p) => (
                  <li key={p.slug}>
                    <Link
                      href={`/subastas/${p.slug}`}
                      className="text-[var(--color-ink-secondary)] hover:text-[var(--color-ink-primary)] focus-visible:outline-none focus-visible:underline underline-offset-4"
                    >
                      {p.label}
                    </Link>
                  </li>
                ))}
                <li className="pt-1">
                  <Link
                    href="/subastas"
                    className="inline-flex items-center gap-1 text-[var(--color-action)] hover:text-[var(--color-action-hover)] font-medium focus-visible:outline-none focus-visible:underline underline-offset-4"
                  >
                    {t("footer.allProvinces")}
                    <span aria-hidden="true">→</span>
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-primary)]">
                {t("footer.colTiposTitle")}
              </h2>
              <ul className="mt-4 space-y-2.5 text-sm">
                {TIPOS.map((tipo) => (
                  <li key={tipo.slug}>
                    <Link
                      href={`/subastas/tipo/${tipo.slug}`}
                      className="text-[var(--color-ink-secondary)] hover:text-[var(--color-ink-primary)] focus-visible:outline-none focus-visible:underline underline-offset-4"
                    >
                      {t(tipo.labelKey)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-primary)]">
                {t("footer.colProductTitle")}
              </h2>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li>
                  <Link
                    href="/blog"
                    className="text-[var(--color-ink-secondary)] hover:text-[var(--color-ink-primary)] focus-visible:outline-none focus-visible:underline underline-offset-4"
                  >
                    {t("footer.linkHowItWorks")}
                  </Link>
                </li>
                <li>
                  <Link
                    href="/noticias"
                    className="text-[var(--color-ink-secondary)] hover:text-[var(--color-ink-primary)] focus-visible:outline-none focus-visible:underline underline-offset-4"
                  >
                    {t("footer.linkNews")}
                  </Link>
                </li>
                <li>
                  <Link
                    href="/precios"
                    className="text-[var(--color-ink-secondary)] hover:text-[var(--color-ink-primary)] focus-visible:outline-none focus-visible:underline underline-offset-4"
                  >
                    {t("footer.linkPricing")}
                  </Link>
                </li>
                <li>
                  <Link
                    href="/alerts"
                    className="text-[var(--color-ink-secondary)] hover:text-[var(--color-ink-primary)] focus-visible:outline-none focus-visible:underline underline-offset-4"
                  >
                    {t("footer.linkCreateAlert")}
                  </Link>
                </li>
                <li>
                  <Link
                    href="/register"
                    className="text-[var(--color-ink-secondary)] hover:text-[var(--color-ink-primary)] focus-visible:outline-none focus-visible:underline underline-offset-4"
                  >
                    {t("footer.linkRegister")}
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-primary)]">
                {t("footer.colLegalTitle")}
              </h2>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li>
                  <Link
                    href="/legal/aviso-legal"
                    className="text-[var(--color-ink-secondary)] hover:text-[var(--color-ink-primary)] focus-visible:outline-none focus-visible:underline underline-offset-4"
                  >
                    {t("footer.linkLegalNotice")}
                  </Link>
                </li>
                <li>
                  <Link
                    href="/legal/privacidad"
                    className="text-[var(--color-ink-secondary)] hover:text-[var(--color-ink-primary)] focus-visible:outline-none focus-visible:underline underline-offset-4"
                  >
                    {t("footer.linkPrivacy")}
                  </Link>
                </li>
                <li>
                  <Link
                    href="/legal/cookies"
                    className="text-[var(--color-ink-secondary)] hover:text-[var(--color-ink-primary)] focus-visible:outline-none focus-visible:underline underline-offset-4"
                  >
                    {t("footer.linkCookies")}
                  </Link>
                </li>
                <li>
                  <Link
                    href="/contacto"
                    className="text-[var(--color-ink-secondary)] hover:text-[var(--color-ink-primary)] focus-visible:outline-none focus-visible:underline underline-offset-4"
                  >
                    {t("footer.linkContact")}
                  </Link>
                </li>
              </ul>
            </div>
          </nav>
        </div>
      </div>

      {/* Brand bar — pine surface, trust tag + © year + legal microcopy.
          Persistent across the site; degrades to "syncing" copy until
          /api/auctions/stats returns. */}
      <div className="footer-brand-bar">
        <div className="mx-auto max-w-editorial px-4 md:px-6 py-5 text-xs">
          {/* Non-affiliation disclaimer — short, always-visible, muted.
              Full version lives in /legal/aviso-legal §3. Quiet single line
              (wraps on mobile); no color, no border that fights the bar. */}
          <p className="text-[rgba(255,255,255,0.6)] leading-relaxed">
            {t("footer.affiliationDisclaimer")}
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="tnum">
              {lastUpdateTime
                ? t("home.footerTagWithUpdate", { when: formatUpdatedDayEs(lastUpdateTime, locale) })
                : t("home.footerTagSyncing")}
            </p>
            <p className="text-[rgba(255,255,255,0.7)]">
              © {year} SubastasActivas · {t("footer.rightsReserved")}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
