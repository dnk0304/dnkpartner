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

      <main className="mx-auto max-w-editorial px-4 md:px-6 py-6 md:py-8 space-y-8 md:space-y-10">
        {/* HERO — compressed editorial pitch (no big-number panel — that role
            now belongs to the forex ticker beneath) */}
        <section className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6 lg:gap-10 items-start">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[--color-gold] font-semibold">
              Observatorio de subastas públicas
            </p>
            <h1 className="mt-2 font-serif text-3xl md:text-4xl lg:text-5xl leading-[1.1] text-[--color-ink-primary]">
              Las subastas del Estado, seguidas en{" "}
              <span className="text-[--color-brand]">tiempo real</span>.
            </h1>
            <p className="mt-4 max-w-prose text-[15px] text-[--color-ink-secondary]">
              Sincronizamos cada pocos minutos con el Portal de Subastas del BOE
              y otras fuentes oficiales. Sigue las subastas que te interesan y
              te avisamos en cuanto cambia el estado, llega una nueva puja o
              se acerca el cierre.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-[--color-ink-tertiary] tnum">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[--color-status-live] dnk-pulse" />
                Última sincronización{" "}
                {stats?.lastUpdateTime ? formatRelativeEs(stats.lastUpdateTime) : "…"}
              </span>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <Link
                href="/subastas?when=activas"
                className="rounded-md bg-[--color-brand] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[--color-brand-hover] transition-colors"
              >
                Ver subastas activas
              </Link>
              <Link
                href="/subastas?when=proximas"
                className="rounded-md border border-[--color-brand-soft]/30 px-4 py-2.5 text-sm font-semibold text-[--color-brand-soft] hover:bg-[--color-info-soft] transition-colors"
              >
                Próximas aperturas
              </Link>
            </div>
          </div>

          {/* Big number panel */}
          <div className="rounded-lg border border-[--color-hairline] bg-[--color-surface] p-5 md:p-6">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[--color-ink-tertiary]">
              Subastas activas ahora
            </div>
            <div className="mt-1 tnum font-serif text-[64px] md:text-[80px] leading-none text-[--color-brand]">
              {stats ? formatNumber(stats.trueActiveCount) : "—"}
            </div>
            <p className="mt-2 text-sm text-[--color-ink-secondary]">
              Subastas abiertas o próximas en este momento, según el Portal del
              BOE. No es el total catalogado.
            </p>

            <dl className="mt-5 grid grid-cols-2 gap-4 hairline-t pt-4">
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-[--color-ink-tertiary]">
                  Celebrándose
                </dt>
                <dd className="mt-0.5 tnum text-xl font-semibold text-[--color-status-live]">
                  {stats ? formatNumber(stats.trueLiveCount) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-[--color-ink-tertiary]">
                  Próxima apertura
                </dt>
                <dd className="mt-0.5 tnum text-xl font-semibold text-[--color-status-upcoming]">
                  {stats ? formatNumber(stats.trueUpcomingCount) : "—"}
                </dd>
              </div>
              <div className="col-span-2 text-xs text-[--color-ink-tertiary] tnum">
                <span className="text-[--color-ink-secondary]">Histórico total catalogado:</span>{" "}
                <span className="text-[--color-ink-primary]">
                  {stats ? formatNumber(stats.totalAuctions) : "—"}
                </span>{" "}
                · datos oficiales del Portal de Subastas del BOE.
              </div>
            </dl>
          </div>
        </section>

        {/* FOREX-style ticker — compact-default so the map below stays near the fold */}
        <section>
          <ForexCarousel limit={30} seeAllHref="/subastas?when=activas" />
        </section>

        {/* Map — IMMEDIATELY visible per landing spec */}
        <section aria-labelledby="map-heading">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="map-heading" className="font-serif text-2xl text-[--color-ink-primary]">
              Mapa de subastas activas
            </h2>
            <Link
              href="/subastas?view=map"
              className="text-sm font-medium text-[--color-brand-soft] hover:underline"
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
          <h2 id="provinces-heading" className="font-serif text-2xl text-[--color-ink-primary]">
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
          <h2 className="font-serif text-xl text-[--color-ink-primary]">
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
          dnkSubastas · datos oficiales del Portal de Subastas del BOE ·{" "}
          {stats?.lastUpdateTime
            ? `actualización ${formatRelativeEs(stats.lastUpdateTime)}`
            : "sincronización en curso"}
        </p>
      </footer>
    </div>
  );
}
