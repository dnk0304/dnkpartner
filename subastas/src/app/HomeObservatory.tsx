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
        {/* DIRECTION A — Live counter strip (Bloomberg-style) */}
        <section
          aria-label={t("liveSummaryAria")}
          className="rounded-lg border border-[--color-hairline] bg-[--color-surface] px-4 py-3"
        >
          {/*
            Counter strip — per Dennis (2026-06-03) trimmed back to the single
            number that matters ("activas") + the wave37 propiedades/vehículos
            split. The "celebrándose" and "próximas" stats were removed: live=0
            at most times of day, próximas adds clutter, and Dennis explicitly
            asked for "no macro-details, just the total active".

            The strip-level duplicate of the header's update timer also went —
            ObservatoryHeader already carries the trust signal site-wide, so a
            second one here was noise. The header timer is now day-granularity
            ("Actualizado hoy") and is the canonical surface for that info.
          */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm tnum">
            <span className="inline-flex items-center gap-2 text-[--color-ink-primary]">
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full bg-[--color-warn-info]"
              />
              <strong className="font-semibold">
                {stats ? formatNumber(stats.trueActiveCount) : "—"}
              </strong>
              <span>{t("activeTotal")}</span>
            </span>
            {/* Breakdown: propiedades vs vehículos (+ otros, only when >0).
                Subordinate to "activas" above — separated by a thin divider on
                >=sm screens, dot-less to read as detail not headline. Fields
                come from /api/auctions/stats; each is independently null-safe
                so the strip degrades gracefully if the API hasn't shipped
                Forge's classification fix yet. wave37 split — preserved. */}
            {typeof stats?.activeProperties === "number" && (
              <>
                <span
                  aria-hidden="true"
                  className="hidden sm:inline text-[--color-hairline]"
                >
                  |
                </span>
                <span className="inline-flex items-center gap-2 text-[--color-ink-secondary]">
                  <strong className="font-semibold text-[--color-ink-primary]">
                    {formatNumber(stats.activeProperties)}
                  </strong>
                  <span>{t("propertiesLabel")}</span>
                </span>
              </>
            )}
            {typeof stats?.activeVehicles === "number" && (
              <span className="inline-flex items-center gap-2 text-[--color-ink-secondary]">
                <strong className="font-semibold text-[--color-ink-primary]">
                  {formatNumber(stats.activeVehicles)}
                </strong>
                <span>{t("vehiclesLabel")}</span>
              </span>
            )}
            {typeof stats?.activeOtros === "number" && stats.activeOtros > 0 && (
              <span className="inline-flex items-center gap-2 text-[--color-ink-secondary]">
                <strong className="font-semibold text-[--color-ink-primary]">
                  {formatNumber(stats.activeOtros)}
                </strong>
                <span>{t("otherLabel")}</span>
              </span>
            )}
            {/* Próximas — re-added 2026-06-04 per Dennis. Was removed on
                2026-06-03 ("próximas adds clutter"), then re-requested for the
                count specifically. Wrapped as a Link to /subastas?when=proximas
                (2026-06-04) so the ~220 upcoming auctions are now reachable
                directly from the hero count — pairs with the new "Próximas"
                tab in the /subastas page header. Visual styling matches the
                other counter chips; the link styling adds an underline on
                hover so the affordance reads clearly. */}
            {typeof stats?.trueUpcomingCount === "number" && (
              <Link
                href="/subastas?when=proximas"
                className="inline-flex items-center gap-2 text-[--color-ink-secondary] rounded hover:text-[--color-ink-primary] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-brand]/40 group"
                aria-label={`Ver ${formatNumber(stats.trueUpcomingCount)} subastas próximas`}
              >
                <strong className="font-semibold text-[--color-ink-primary]">
                  {formatNumber(stats.trueUpcomingCount)}
                </strong>
                <span className="group-hover:underline underline-offset-2">
                  {t("upcoming")}
                </span>
              </Link>
            )}
          </div>
        </section>

        {/* HERO — modern register heading + lead.
            Hero search form was removed (2026-06-03, Dennis): it submitted
            ?q= to /subastas which reads ?search=, so the term was silently
            dropped. Search lives in the global navbar (ObservatoryHeader)
            and on /subastas. Removing the form also removed the when-select
            (it was bound to the same submit and had no standalone purpose
            — the marquee's "Ver todas" link below already routes to
            /subastas?when=activas). Spacing tightened to space-y-3 so the
            heading + lead read as one balanced block instead of carrying
            the gap the form left behind. */}
        <section className="space-y-3">
          <h1 className="font-display text-3xl md:text-4xl lg:text-[44px] leading-[1.1] tracking-tight text-[--color-ink-primary]">
            {t("heroTitle")}
          </h1>
          <p className="max-w-prose text-[15px] leading-relaxed text-[--color-ink-secondary]">
            {t("heroLead")}
          </p>
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
