"use client";

/**
 * SiteFooter — the single, site-wide footer.
 *
 * Extracted from the home page's inline `<footer>` so every route inherits
 * the same footer via the root layout's SiteChrome wrapper. Visual signature
 * matches the home original (hairline top border, centred quiet text, three
 * subordinate nav links).
 *
 * Live "Datos actualizados…" tag: fetched once per mount from
 * `/api/auctions/stats` so the footer carries the same trust-signal the
 * home page used to render inline. The fetch is silent + cancellable; the
 * label degrades to the home page's "syncing" copy if the API hasn't
 * returned yet.
 *
 * i18n keys are unchanged (`home.footerTagWithUpdate`, `home.footerTagSyncing`,
 * `home.footerGuides`, `home.footerAuctions`, `home.footerPricing`) so the
 * existing translation strings keep working without a messages-file diff.
 */

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-path";
import { formatUpdatedDayEs } from "./format";

export function SiteFooter() {
  const t = useTranslations("home");
  const [lastUpdateTime, setLastUpdateTime] = React.useState<string | null>(null);

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
        /* silent — footer degrades to "syncing" copy */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <footer className="hairline-t mt-12 py-8 text-center text-xs text-[--color-ink-tertiary]">
      <p className="tnum">
        {lastUpdateTime
          ? t("footerTagWithUpdate", { when: formatUpdatedDayEs(lastUpdateTime) })
          : t("footerTagSyncing")}
      </p>
      <nav className="mt-3 flex items-center justify-center gap-4 text-xs">
        <Link href="/blog" className="hover:text-[--color-ink-primary]">
          {t("footerGuides")}
        </Link>
        <span aria-hidden>·</span>
        <Link href="/subastas" className="hover:text-[--color-ink-primary]">
          {t("footerAuctions")}
        </Link>
        <span aria-hidden>·</span>
        <Link href="/precios" className="hover:text-[--color-ink-primary]">
          {t("footerPricing")}
        </Link>
      </nav>
    </footer>
  );
}
