"use client";

/**
 * HomeObservatory — the rebuilt home page.
 *
 * Sections (top to bottom):
 *   1. ObservatoryHeader
 *   2. Editorial hero: trueActiveCount + sub-line + 3 quick-link chips
 *   3. LiveFeed ("Últimas actualizaciones")
 *   4. HierarchicalMap (existing, wrapped in our judicial frame)
 *   5. ProvinceGrid (existing, kept — list of provinces with counts)
 *   6. "Cómo funciona" plain-spoken explainer block
 *
 * The live feed sits second deliberately: it is the *proof* that we
 * track auctions in real time. Every visit, it's different. That is the
 * single biggest credibility lever this site has against alertasubastas
 * and subastasia.io which both show stale directory pages.
 */

import * as React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { HomeCarouselSection } from "@/components/observatory/HomeCarouselSection";
import { ProvinceDropdown } from "@/components/observatory/ProvinceDropdown";
import { apiFetch } from "@/lib/api-path";
import { formatNumber } from "@/components/observatory/format";
import { AuctionItem } from "@/types";
import { PROVINCE_DB_KEY_TO_SLUG, slugify } from "@/lib/seo/slugs";

/**
 * Build the canonical clean SEO URL for a province click. Wave 56 (Option A):
 * province pages live at `/subastas/{slug}` — no more `/provincia/` prefix,
 * no more `?province=` querystring round-trip. If the raw province name is
 * off-taxonomy (not in our 52-province map) we fall back to the interactive
 * list filter so the user still sees something useful.
 */
function provinceHref(province: string): string {
  const slug = PROVINCE_DB_KEY_TO_SLUG[province];
  return slug
    ? `/subastas/${slug}`
    : `/subastas?province=${encodeURIComponent(province)}`;
}

/**
 * Build the canonical clean SEO URL for a (province, municipality) click —
 * goes straight at the new town page `/subastas/{prov}/{muni}`. Fallback to
 * the QS filter when the province isn't in our taxonomy.
 */
function townHref(province: string, municipality: string): string {
  const slug = PROVINCE_DB_KEY_TO_SLUG[province];
  const muniSlug = slugify(municipality);
  return slug && muniSlug
    ? `/subastas/${slug}/${muniSlug}`
    : `/subastas?province=${encodeURIComponent(province)}&municipality=${encodeURIComponent(municipality)}`;
}

const HierarchicalMap = dynamic(
  () => import("@/components/dashboard/HierarchicalMap").then((m) => m.HierarchicalMap),
  { ssr: false, loading: () => <div className="h-full w-full bg-[--color-surface-muted] animate-pulse" /> },
);

const ProvinceGrid = dynamic(
  () => import("@/components/dashboard/ProvinceGrid").then((m) => m.ProvinceGrid),
  { ssr: false, loading: () => <div className="h-40 bg-[--color-surface-muted] animate-pulse rounded-lg" /> },
);

type Stats = {
  trueActiveCount: number;
  trueLiveCount: number;
  trueUpcomingCount: number;
  totalAuctions: number;
  lastUpdateTime: string | null;
  // Active split — surfaced in hero strip as "propiedades / vehículos / otros".
  // Reconciles: activeProperties + activeVehicles + activeOtros === trueActiveCount.
  // All three are optional on the type so the UI degrades gracefully if the API
  // hasn't been redeployed with Forge's classification fix.
  activeProperties?: number;
  activeVehicles?: number;
  activeOtros?: number;
  // P3 teasing-hero chip — auctions whose publishedAt landed on/after the 1st
  // of the current month. Optional so the hero degrades gracefully if the
  // stats API hasn't been redeployed with this field yet.
  newThisMonthCount?: number;
};

export default function HomeObservatory() {
  const router = useRouter();
  const t = useTranslations("home");
  const [stats, setStats] = React.useState<Stats | null>(null);
  const [mapItems, setMapItems] = React.useState<AuctionItem[]>([]);
  const [provinceCounts, setProvinceCounts] = React.useState<Record<string, { active: number; preAuction: number; finished: number; total: number }>>({});

  // Stats
  React.useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await apiFetch("/api/auctions/stats");
        if (!res.ok || cancelled) return;
        const body = await res.json();
        if (!cancelled && body?.success) setStats(body.data as Stats);
      } catch {
        /* silent */
      }
    };
    tick();
    const id = window.setInterval(tick, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // Map auctions (active + upcoming only).
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/auctions/map?statuses=celebrandose,proxima-apertura");
        if (!res.ok || cancelled) return;
        const body = await res.json();
        if (cancelled) return;
        if (body?.success && Array.isArray(body.data)) {
          const items: AuctionItem[] = body.data.map((it: any) => ({
            ...it,
            endDate: new Date(),
            source: "BOE",
            imageUrl: "",
            isLocked: false,
            community: "",
          }));
          setMapItems(items);
        }
      } catch {
        /* silent */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Province counts.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/auctions/counts?groupBy=province");
        if (!res.ok || cancelled) return;
        const body = await res.json();
        if (cancelled || !body?.success) return;
        const out: Record<string, { active: number; preAuction: number; finished: number; total: number }> = {};
        for (const key of Object.keys(body.counts?.total || {})) {
          out[key] = {
            active: body.counts.active?.[key] || 0,
            preAuction: body.counts.preAuction?.[key] || 0,
            finished: body.counts.finished?.[key] || 0,
            total: body.counts.total?.[key] || 0,
          };
        }
        setProvinceCounts(out);
      } catch {
        /* silent */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[--color-page]">
      {/* Header + footer are rendered site-wide by SiteChrome in the root layout. */}

      <main className="mx-auto max-w-editorial px-4 md:px-6 py-6 md:py-8 space-y-6 md:space-y-8">
        {/* ───────────────────────────────────────────────────────────────
            P3 TEASING HERO (2026-06-04 — Pixel, conversion redesign).
            Replaces the Bloomberg-style counter strip + editorial heading
            with a single conversion-focused block:
              1. Honest scale — 4 .count-chip cards (gradient accent) with
                 the real numbers from /api/auctions/stats:
                 Rastreadas · Activas · Próximas · Nuevas este mes.
              2. Simple ES headline + plain subhead. No "en juego", no
                 explainer of what BOE is.
              3. Source-type bullets — judiciales · Hacienda (AEAT) ·
                 notariales · administrativas (honest framing as one set
                 rastreadas del BOE oficial; we don't claim separate
                 portals we don't have).
              4. Primary CTA "Empieza gratis — sin tarjeta" with the
                 .cta-gradient token + a quiet secondary "Ver las subastas".

            Restraint = crisp. White surface, gradient as accent on the
            chips + the primary CTA only (NOT a green wallpaper). Max two
            greens + white + one ink-gray on screen.

            All numbers degrade gracefully: chips render "—" until the
            stats API resolves (same shape as the legacy strip used).
            ─────────────────────────────────────────────────────────────── */}
        <section
          aria-labelledby="hero-headline"
          className="pt-2"
        >
          {/* Chip row — the social proof / scale-flex. 2 columns on mobile,
              4 across from md up. Numbers use tabular-nums via the
              .count-chip-num token so digit width stays even. */}
          <ul
            className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4"
            aria-label={t("liveSummaryAria")}
          >
            <li className="count-chip">
              <span className="count-chip-num">
                {stats ? formatNumber(stats.totalAuctions) : "—"}
              </span>
              <span className="count-chip-label">
                {t("heroChipTrackedLabel")}
              </span>
            </li>
            <li className="count-chip">
              <span className="count-chip-num">
                {stats ? formatNumber(stats.trueActiveCount) : "—"}
              </span>
              <span className="count-chip-label">
                {t("heroChipActiveLabel")}
              </span>
            </li>
            <li className="count-chip">
              <span className="count-chip-num">
                {stats ? formatNumber(stats.trueUpcomingCount) : "—"}
              </span>
              <span className="count-chip-label">
                {t("heroChipUpcomingLabel")}
              </span>
            </li>
            <li className="count-chip">
              <span className="count-chip-num">
                {typeof stats?.newThisMonthCount === "number"
                  ? formatNumber(stats.newThisMonthCount)
                  : "—"}
              </span>
              <span className="count-chip-label">
                {t("heroChipNewLabel")}
              </span>
            </li>
          </ul>

          {/* Headline + subhead. Simple Spanish — Dennis explicit: no "en
              juego", no fluff explaining what BOE is. */}
          <div className="mt-8 md:mt-10 space-y-3 max-w-2xl">
            <h1
              id="hero-headline"
              className="font-display text-[28px] sm:text-4xl lg:text-[44px] leading-[1.1] tracking-tight text-[--color-ink-primary]"
            >
              {t("heroHeadline")}
            </h1>
            <p className="text-[15px] md:text-base leading-relaxed text-[--color-ink-secondary]">
              {t("heroSubhead")}
            </p>
          </div>

          {/* Source-type inline row — one line on md+, wraps on mobile.
              "Rastreadas del BOE oficial: judiciales · Hacienda (AEAT) ·
              notariales · administrativas". Framed as one set so we don't
              imply separate portal coverage we don't have yet. */}
          <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[--color-ink-tertiary]">
            <span className="font-medium text-[--color-ink-secondary]">
              {t("heroSourcesIntro")}
            </span>
            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{t("heroSourceJudicial")}</span>
              <span aria-hidden="true" className="text-[--color-hairline]">·</span>
              <span>{t("heroSourceHacienda")}</span>
              <span aria-hidden="true" className="text-[--color-hairline]">·</span>
              <span>{t("heroSourceNotarial")}</span>
              <span aria-hidden="true" className="text-[--color-hairline]">·</span>
              <span>{t("heroSourceAdministrativa")}</span>
            </span>
          </div>

          {/* CTA row — primary gradient + quiet secondary. Primary leads to
              registration (the conversion goal). Secondary keeps the
              free-catalog tease alive for users not ready to register. */}
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/register"
              className="cta-gradient text-base px-6 py-3 rounded-lg"
              aria-label={t("heroCtaPrimaryAria")}
            >
              {t("heroCtaPrimary")}
            </Link>
            <Link
              href="/subastas?when=activas"
              className="inline-flex items-center text-sm font-medium text-[--color-action] hover:text-[--color-brand] hover:underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-action]/40 rounded px-2 py-2"
            >
              {t("heroCtaSecondary")}
            </Link>
          </div>
        </section>

        {/* Endless marquee + quick-filter chips + click-to-modal (D + E + G).
            Chips drive the marquee's data feed; marquee click opens the full
            AuctionDetailModal in-place (no navigation). Component pauses the
            drift on hover, on modal-open, and honours `prefers-reduced-motion`. */}
        <HomeCarouselSection limit={30} seeAllHref="/subastas?when=activas" />

        {/* Map — IMMEDIATELY visible per landing spec */}
        <section aria-labelledby="map-heading">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="map-heading" className="font-display text-2xl text-[--color-ink-primary]">
              {t("mapHeading")}
            </h2>
            <Link
              href="/subastas?view=map"
              className="text-sm font-medium text-[--color-action] hover:underline"
            >
              {t("openFullMap")}
            </Link>
          </div>
          <div className="h-[55vh] md:h-[560px] rounded-xl overflow-hidden border border-[--color-hairline] bg-white shadow-[var(--shadow-card)]">
            <HierarchicalMap
              items={mapItems}
              onMarkerClick={(a: AuctionItem) => router.push(`/auction/${encodeURIComponent(a.id)}`)}
              onProvinceClick={(province: string) =>
                router.push(provinceHref(province))
              }
              onBackToProvinces={() => {}}
              onBackToMunicipalities={() => {}}
            />
          </div>
        </section>

        {/* Province selector + grid */}
        <section aria-labelledby="provinces-heading" className="space-y-4">
          <h2 id="provinces-heading" className="font-display text-2xl text-[--color-ink-primary]">
            {t("provincesHeading")}
          </h2>
          <div className="max-w-md">
            <ProvinceDropdown />
          </div>
          <ProvinceGrid
            provinceCounts={provinceCounts}
            onProvinceClick={(province: string) =>
              router.push(provinceHref(province))
            }
            onMunicipalityClick={(municipality: string, province: string) =>
              router.push(townHref(province, municipality))
            }
          />
        </section>

        {/* How it works — plain Spanish, no marketing fluff */}
        <section className="rounded-lg bg-[--color-surface-muted] p-6 md:p-8 max-w-readable">
          <h2 className="font-display text-xl text-[--color-ink-primary]">
            {t("howItWorksHeading")}
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-[--color-ink-secondary]">
            {t("howItWorksP1")}
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-[--color-ink-secondary]">
            {t("howItWorksP2")}
          </p>
          <Link
            href="/subastas"
            className="mt-4 inline-flex items-center text-sm font-medium text-[--color-brand] hover:underline"
          >
            {t("startExploring")}
          </Link>
        </section>
      </main>
    </div>
  );
}
