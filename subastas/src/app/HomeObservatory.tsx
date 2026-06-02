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
import { ObservatoryHeader } from "@/components/observatory/ObservatoryHeader";
import { ForexCarousel } from "@/components/observatory/ForexCarousel";
import { ProvinceDropdown } from "@/components/observatory/ProvinceDropdown";
import { apiFetch } from "@/lib/api-path";
import { formatNumber, formatRelativeEs } from "@/components/observatory/format";
import { AuctionItem } from "@/types";

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
};

export default function HomeObservatory() {
  const router = useRouter();
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
      <ObservatoryHeader />

      <main className="mx-auto max-w-editorial px-4 md:px-6 py-6 md:py-8 space-y-6 md:space-y-8">
        {/* DIRECTION A — Live counter strip (Bloomberg-style) */}
        <section
          aria-label="Resumen en vivo"
          className="rounded-lg border border-[--color-hairline] bg-[--color-surface] px-4 py-3"
        >
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm tnum">
            <span className="inline-flex items-center gap-2 text-[--color-ink-primary]">
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full bg-[--color-status-live] dnk-pulse"
              />
              <strong className="font-semibold">
                {stats ? formatNumber(stats.trueLiveCount) : "—"}
              </strong>
              <span>celebrándose</span>
            </span>
            <span className="inline-flex items-center gap-2 text-[--color-ink-primary]">
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full bg-[--color-status-upcoming]"
              />
              <strong className="font-semibold">
                {stats ? formatNumber(stats.trueUpcomingCount) : "—"}
              </strong>
              <span>próximas</span>
            </span>
            <span className="inline-flex items-center gap-2 text-[--color-ink-primary]">
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full bg-[--color-warn-info]"
              />
              <strong className="font-semibold">
                {stats ? formatNumber(stats.trueActiveCount) : "—"}
              </strong>
              <span>activas en total</span>
            </span>
            <span className="ml-auto text-[--color-ink-tertiary]">
              Actualizado{" "}
              {stats?.lastUpdateTime ? formatRelativeEs(stats.lastUpdateTime) : "…"}
            </span>
          </div>
        </section>

        {/* HERO — modern register heading + inline search row */}
        <section className="space-y-4">
          <h1 className="font-display text-3xl md:text-4xl lg:text-[44px] leading-[1.1] tracking-tight text-[--color-ink-primary]">
            Registro público de subastas judiciales y administrativas
          </h1>
          <p className="max-w-prose text-[15px] text-[--color-ink-secondary]">
            Sincronizado con el Portal de Subastas del BOE y otras fuentes
            oficiales. Sigue las subastas que te interesan; te avisamos cuando
            cambia el estado, llega una nueva puja o se acerca el cierre.
          </p>

          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              const q = String(data.get("q") || "").trim();
              const when = String(data.get("when") || "activas");
              const qs = new URLSearchParams();
              if (q) qs.set("q", q);
              if (when) qs.set("when", when);
              router.push(`/subastas?${qs.toString()}`);
            }}
            className="flex flex-col sm:flex-row gap-2"
          >
            <input
              name="q"
              type="search"
              placeholder="Buscar por municipio, tipo, juzgado…"
              aria-label="Buscar subastas"
              className="flex-1 rounded-md border border-[--color-hairline] bg-[--color-surface] px-3 py-2.5 text-sm text-[--color-ink-primary] placeholder:text-[--color-ink-tertiary] focus:outline-none focus:border-[--color-action] focus:ring-2 focus:ring-[--color-action]/20"
            />
            <select
              name="when"
              defaultValue="activas"
              aria-label="Cuándo"
              className="rounded-md border border-[--color-hairline] bg-[--color-surface] px-3 py-2.5 text-sm text-[--color-ink-primary] focus:outline-none focus:border-[--color-action]"
            >
              <option value="activas">Activas</option>
              <option value="proximas">Próximas</option>
              <option value="todas">Todas</option>
            </select>
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-1 rounded-md border border-[--color-ink-primary] bg-[--color-surface] px-4 py-2.5 text-sm font-semibold text-[--color-ink-primary] hover:bg-[--color-surface-muted] transition-colors"
            >
              Buscar
              <span aria-hidden>→</span>
            </button>
          </form>
        </section>

        {/* FOREX-style ticker — compact-default so the map below stays near the fold */}
        <section>
          <ForexCarousel limit={30} seeAllHref="/subastas?when=activas" />
        </section>

        {/* Map — IMMEDIATELY visible per landing spec */}
        <section aria-labelledby="map-heading">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="map-heading" className="font-display text-2xl text-[--color-ink-primary]">
              Mapa de subastas activas
            </h2>
            <Link
              href="/subastas?view=map"
              className="text-sm font-medium text-[--color-action] hover:underline"
            >
              Abrir mapa completo →
            </Link>
          </div>
          <div className="h-[55vh] md:h-[560px] rounded-xl overflow-hidden border border-[--color-hairline] bg-white shadow-[var(--shadow-card)]">
            <HierarchicalMap
              items={mapItems}
              onMarkerClick={(a: AuctionItem) => router.push(`/auction/${encodeURIComponent(a.id)}`)}
              onProvinceClick={(province: string) =>
                router.push(`/subastas?province=${encodeURIComponent(province)}`)
              }
              onBackToProvinces={() => {}}
              onBackToMunicipalities={() => {}}
            />
          </div>
        </section>

        {/* Province selector + grid */}
        <section aria-labelledby="provinces-heading" className="space-y-4">
          <h2 id="provinces-heading" className="font-display text-2xl text-[--color-ink-primary]">
            Explora por provincia
          </h2>
          <div className="max-w-md">
            <ProvinceDropdown />
          </div>
          <ProvinceGrid
            provinceCounts={provinceCounts}
            onProvinceClick={(province: string) =>
              router.push(`/subastas?province=${encodeURIComponent(province)}`)
            }
            onMunicipalityClick={(municipality: string, province: string) =>
              router.push(
                `/subastas?province=${encodeURIComponent(province)}&municipality=${encodeURIComponent(municipality)}`,
              )
            }
          />
        </section>

        {/* How it works — plain Spanish, no marketing fluff */}
        <section className="rounded-lg bg-[--color-surface-muted] p-6 md:p-8 max-w-readable">
          <h2 className="font-display text-xl text-[--color-ink-primary]">
            Cómo funciona esto
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-[--color-ink-secondary]">
            Sincronizamos con el Portal de Subastas del BOE y otras fuentes
            oficiales (Agencia Tributaria, Seguridad Social, notariales,
            ayuntamientos) para mantener un registro propio de cada subasta
            pública: cuándo se publica, cuándo abre, qué pujas recibe, cuándo
            cambia de estado y cuándo concluye.
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-[--color-ink-secondary]">
            Tú sigues las subastas que te interesan. Te avisamos por correo o
            notificación cada vez que algo cambia. Las pujas se realizan
            siempre en el portal oficial del BOE — nosotros no intermediamos.
          </p>
          <Link
            href="/subastas"
            className="mt-4 inline-flex items-center text-sm font-medium text-[--color-brand] hover:underline"
          >
            Empezar a explorar →
          </Link>
        </section>
      </main>

      <footer className="hairline-t mt-12 py-8 text-center text-xs text-[--color-ink-tertiary]">
        <p className="tnum">
          SubastasActivas · datos oficiales del Portal de Subastas del BOE ·{" "}
          {stats?.lastUpdateTime
            ? `actualización ${formatRelativeEs(stats.lastUpdateTime)}`
            : "sincronización en curso"}
        </p>
        <nav className="mt-3 flex items-center justify-center gap-4 text-xs">
          <Link href="/blog" className="hover:text-[--color-ink-primary]">
            Guías
          </Link>
          <span aria-hidden>·</span>
          <Link href="/subastas" className="hover:text-[--color-ink-primary]">
            Subastas
          </Link>
        </nav>
      </footer>
    </div>
  );
}
