"use client";

/**
 * AuctionDetailClient — the Observatory detail-page view.
 *
 * The page is structured as a two-column editorial layout:
 *
 *   ┌──────────────────────────────┬────────────────────┐
 *   │ Hero (title, source, status) │ Sticky state panel │
 *   ├──────────────────────────────┤  (DetailStatusPanel)│
 *   │ Map + photo                  │                    │
 *   ├──────────────────────────────┤                    │
 *   │ Timeline                     │                    │
 *   ├──────────────────────────────┤                    │
 *   │ Description                  │                    │
 *   ├──────────────────────────────┤                    │
 *   │ Legal data                   │                    │
 *   ├──────────────────────────────┤                    │
 *   │ Documents                    │                    │
 *   ├──────────────────────────────┤                    │
 *   │ Source & verification        │                    │
 *   └──────────────────────────────┴────────────────────┘
 *
 * On mobile the state panel collapses up to position 2 (under the hero,
 * before everything else), and a bottom action bar pins [Follow] [Ir al BOE]
 * for thumb-friendly action.
 */

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ArrowLeft, ExternalLink, Landmark, ImageOff, Calendar, Phone, Building2 } from "lucide-react";
import { apiFetch } from "@/lib/api-path";
import { AuctionItem } from "@/types";
import { AuctionDocsDisclosure } from "@/components/auction/AuctionDocsDisclosure";
import { resolveCardImage, isVehicleCategory } from "@/lib/resolve-card-image";
import { buildCatastroUrl } from "@/lib/catastro-url";
import { effectiveStatus } from "@/components/observatory/status";
import { DetailStatusPanel } from "@/components/observatory/DetailStatusPanel";
import { DetailTimeline } from "@/components/observatory/DetailTimeline";
import { PROVINCE_DB_KEY_TO_SLUG } from "@/lib/seo/slugs";
import { auctionDisplayTitle } from "@/lib/seo/display-title";
import { getSourceLabel } from "@/lib/source-labels";
import { sanitizeExtractedText, stripStructuredLabelLines } from "@/lib/sanitize-extracted-text";
import { FollowButton } from "@/components/notifications/FollowButton";
import { StatusBadge } from "@/components/observatory/StatusBadge";
// GatedField import dropped 2026-06-07 (wave-B): the detail page is fully
// public now — map, address, expediente, and edicto no longer wrap in
// <GatedField>. The component still ships in the tree for other surfaces.
import {
  formatDateLong,
  formatRelativeEs,
  capitalize,
  titleCase,
} from "@/components/observatory/format";
import { cn } from "@/lib/utils";

// Wave-C (2026-06-07) — new visual subcomponents that consume the server's
// projected fields (financials[], sourceLinks[], endDate, bidStatus, seller,
// cadastral, lastUpdated). Each is dynamic-safe and self-contained; the
// detail page composes them, it does not own their rendering logic.
import { AuctionFinancialsTable, type FinancialEntry } from "@/components/auction/AuctionFinancialsTable";
import { RegionBenchmarkChip } from "@/components/observatory/RegionBenchmarkChip";
import { AuctionCountdownBadge } from "@/components/auction/AuctionCountdownBadge";
import { type SourceLink } from "@/components/auction/AuctionSourceLinks";
import { ParticiparButton } from "@/components/auction/ParticiparButton";
import { AuctionMapPanel } from "@/components/auction/AuctionMapPanel";
import { CrearAlertaCTA } from "@/components/auction/CrearAlertaCTA";
import { SimilarAuctionsCarousel } from "@/components/auction/SimilarAuctionsCarousel";

// Wave-B fields added to the auction payload (server-side). All optional —
// missing fields fall through gracefully to the existing UI rather than
// throwing.
type WaveBFields = {
  sourceLinks?: SourceLink[];
  financials?: FinancialEntry[];
  endDate?: string | null;
  bidStatus?: string | null;
  lastUpdated?: string | null;
  seller?: { name: string | null; contact: string | null } | null;
  cadastral?: {
    ref: string | null;
    charges: string | null;
    chargesDetail: string | null;
    possession: string | null;
    classification: string | null;
    use: string | null;
    area: string | null;
    ownershipPct: string | null;
  } | null;
};

type DetailResponse = {
  success: boolean;
  data?: {
    auction: any & WaveBFields; // raw Prisma row + wave-B projection
    history: {
      statuses: Array<{
        id: string;
        fromStatus: string | null;
        toStatus: string;
        changedAt: string;
        // I18N-1: raw `reason` is no longer part of the payload — only the
        // Spanish label resolved at the DTO boundary (@/lib/timeline-labels).
        reasonCode: string | null;
        reasonLabel: string | null;
        resumeAt: string | null;
        source: string;
      }>;
      bids: Array<{
        id: string;
        bid: number;
        bidType: string;
        seenAt: string;
        source: string;
      }>;
    };
    followCount: number;
    isFollowing: boolean;
    /** wave173 (2026-08-01) — paid gate for documents (Option A). true → our
     *  cached downloadUrls are nulled; the public BOE officialUrl stays. */
    documentsLocked?: boolean;
  };
  error?: string;
};

const DB_TO_FRONTEND_STATUS: Record<string, string> = {
  PROXIMA_APERTURA: "proxima-apertura",
  CELEBRANDOSE: "celebrandose",
  SUSPENDIDA: "suspendida",
  CANCELADA: "cancelada",
  CONCLUIDA_PORTAL: "concluida-portal",
  FINALIZADA_AUTORIDAD: "finalizada-autoridad",
  PRE_AUCTION: "proxima-apertura",
  ACTIVE: "celebrandose",
  FINISHED: "concluida-portal",
  SUSPENDED: "suspendida",
  CANCELLED: "cancelada",
};

export default function AuctionDetailClient({
  id,
  hideHeader = false,
  initialData = null,
  nowMs,
}: {
  id: string;
  /**
   * When true, the component does NOT render its own breadcrumb + title +
   * meta-row + the wrapping `<main>` / `<div min-h-screen>`. Used by the
   * freemium-gate path on /subastas/subasta/[slug] where the SSR teaser
   * already painted those elements server-side (so Google sees them).
   * Default is false to preserve every other call site (legacy /auction/[id]
   * fallback, internal navigation) — they keep the standalone hero.
   */
  hideHeader?: boolean;
  /**
   * SSR seed (Wave-B2 ungate, 2026-07-31). When the server component has
   * already built the full detail payload (via buildAuctionDetailPayload) it
   * passes it here so the FIRST render — including the server-side render that
   * produces the initial HTML stream — paints the full auction content instead
   * of the loading skeleton. This is what puts the address / pricing / details
   * into the SSR HTML so Googlebot (and any no-JS client) sees them without
   * executing JavaScript. The component still revalidates via the API after
   * mount to freshen `isFollowing` / history / live state.
   *
   * When null (legacy /auction/[id] route, internal nav), behaviour is
   * unchanged: skeleton → client fetch.
   */
  initialData?: DetailResponse["data"] | null;
  /**
   * Server-sampled epoch ms, taken ONCE in the owning server component and
   * threaded down to every countdown surface in this subtree.
   *
   * React #418: the countdown components seed lazy `useState` from this value.
   * That initializer runs on BOTH the server render and the first client
   * render, so it must not read the ambient clock. Required with no default —
   * a defaulted `Date.now()` is exactly the foot-gun that reintroduces the
   * hydration mismatch silently. Post-hydration effects use the live clock.
   */
  nowMs: number;
}) {
  const pathname = usePathname();
  const [data, setData] = React.useState<DetailResponse["data"] | null>(initialData);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(!initialData);
  const [photoFailed, setPhotoFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`/api/auctions/${encodeURIComponent(id)}`);
        if (cancelled) return;
        // When we already have an SSR seed, a failed/blank revalidation must
        // NEVER blank the page — keep showing the seeded content. Only surface
        // an error screen when there was no seed to fall back to.
        if (res.status === 404) {
          if (!initialData) setError("not_found");
          return;
        }
        if (!res.ok) {
          if (!initialData) setError("server_error");
          return;
        }
        const body = (await res.json()) as DetailResponse;
        if (!cancelled && body.success && body.data) setData(body.data);
        else if (!cancelled && !initialData) setError(body.error || "unknown_error");
      } catch {
        if (!cancelled && !initialData) setError("network_error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, initialData]);

  // Status-block shell that adapts to hideHeader. When the SSR teaser has
  // already painted the page chrome (freemium-gate path), we render a bare
  // panel; otherwise we paint the standalone min-h-screen + main wrapper.
  const StatusShell = ({ children, dense }: { children: React.ReactNode; dense?: boolean }) =>
    hideHeader ? (
      <div className={dense ? 'py-6' : 'py-16 text-center'}>{children}</div>
    ) : (
      <div className="min-h-screen bg-[var(--color-page)]">
        <main className={`mx-auto max-w-editorial px-4 md:px-6 ${dense ? 'py-8 space-y-6' : 'py-16 text-center'}`}>
          {children}
        </main>
      </div>
    );

  if (loading) {
    return (
      <StatusShell dense>
        <div className="h-7 w-1/3 bg-[var(--color-surface-muted)] rounded animate-pulse" />
        <div className="h-12 w-2/3 bg-[var(--color-surface-muted)] rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-[1fr_360px] gap-6">
          <div className="space-y-3">
            <div className="h-64 bg-[var(--color-surface-muted)] rounded animate-pulse" />
            <div className="h-32 bg-[var(--color-surface-muted)] rounded animate-pulse" />
          </div>
          <div className="h-96 bg-[var(--color-surface-muted)] rounded animate-pulse" />
        </div>
      </StatusShell>
    );
  }

  if (error === "not_found") {
    return (
      <StatusShell>
        <h1 className="font-serif text-2xl text-[var(--color-ink-primary)]">Subasta no encontrada</h1>
        <p className="mt-2 text-sm text-[var(--color-ink-tertiary)]">
          La subasta solicitada no existe o ha sido retirada del Portal del BOE.
        </p>
        <Link
          href="/subastas"
          className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-[var(--color-brand)] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Ver todas las subastas
        </Link>
      </StatusShell>
    );
  }

  if (error || !data) {
    return (
      <StatusShell>
        <h1 className="font-serif text-xl text-[var(--color-ink-primary)]">
          No pudimos cargar esta subasta.
        </h1>
        <p className="mt-2 text-sm text-[var(--color-ink-tertiary)]">
          Reintenta en unos segundos o vuelve a la lista.
        </p>
      </StatusShell>
    );
  }

  const raw = data.auction;
  // wave173 (Option A): server-projected paid gate for the documents surface.
  const documentsLocked = data.documentsLocked === true;
  // Clock-wins status: if the DB says CELEBRANDOSE/PROXIMA_APERTURA but
  // `endsAt` has already passed, every status-driven surface on this page
  // (badge, countdown prefix, "Ir al BOE" CTA shape) must agree it's
  // concluded. Without this guard, an un-swept row paints both
  // "Celebrándose" and "Finalizada" simultaneously (Dennis's report).
  const rawFrontendStatus = DB_TO_FRONTEND_STATUS[raw.status] ?? "celebrandose";
  const status = effectiveStatus(rawFrontendStatus, raw.endsAt);
  const where = [raw.municipality && titleCase(raw.municipality), raw.province && capitalize(raw.province)]
    .filter(Boolean)
    .join(", ");

  // Coerce raw Prisma row into the AuctionItem shape DetailStatusPanel & co
  // expect. Dates from JSON are strings — we leave them as strings; the
  // LiveCountdown handles ISO strings just fine.
  //
  // 2026-06-03 (doc-archive wave): `startedAt` was previously mapped from
  // `raw.endDateTime` — a close-time field — which gave the status panel
  // a wrong "started" timestamp. Now driven by the real `raw.opensAt`
  // (official "Fecha de inicio" from the BOE bien-heading). Falls back to
  // null when the doc-archive backfill hasn't reached this row yet, which
  // the panel renders as "—" instead of a misleading date.
  const auctionItem: AuctionItem & {
    startedAt?: string | null;
    endsAt?: string | null;
    resumeAt?: string | null;
    minimumBid?: number | null;
    depositAmount?: number | null;
    bidIncrement?: number | null;
    claimedAmount?: number | null;
    valorSubasta?: number | null;
  } = {
    id: raw.id,
    title: raw.title,
    category: raw.category,
    province: raw.province ?? "",
    community: "",
    municipality: raw.municipality ?? null,
    status: status as AuctionItem["status"],
    auctionType: raw.auctionType?.toLowerCase() as AuctionItem["auctionType"],
    appraisalValue: raw.appraisalValue ?? null,
    // Valor subasta — distinct from `appraisalValue` (Tasación) since
    // Ghost's 2026-06-04 split (commit `443a864`). The /api/auctions/[id]
    // route uses Prisma `include` so this scalar flows through automatically
    // once the generated client picks up the migrated schema. Honest-NULL.
    valorSubasta: (raw as { valorSubasta?: number | null }).valorSubasta ?? null,
    currentBid: raw.currentBid ?? null,
    minimumBid: raw.minimumBid ?? null,
    depositAmount: raw.depositAmount ?? null,
    bidIncrement: raw.bidIncrement ?? null,
    claimedAmount: raw.claimedAmount ?? null,
    boeLink: raw.boeLink ?? null,
    edictUrl: raw.edictUrl ?? null,
    pdfUrl: raw.pdfUrl ?? null,
    endDate: raw.endsAt ? new Date(raw.endsAt) : new Date(raw.publishedAt),
    source: raw.source || "BOE",
    imageUrl: raw.imageUrl ?? "",
    isLocked: false,
    address: raw.address ?? null,
    latitude: raw.latitude ?? null,
    longitude: raw.longitude ?? null,
    courtReference: raw.courtReference ?? null,
    originalSource: raw.originalSource ?? null,
    propertyDescription: raw.propertyDescription ?? null,
    lotDescription: raw.lotDescription ?? null,
    chargesDetail: raw.chargesDetail ?? null,
    // Surface the cadastral ref so any modal embed reused on this page can
    // resolve the "Ver en Catastro" link via buildCatastroUrl().
    cadastralRef: raw.cadastralRef ?? null,
    // FIX 2026-06-03: real opensAt (was endDateTime — a close-time field).
    startedAt: raw.opensAt ?? null,
    endsAt: raw.endsAt ?? null,
    // Wave52 (Pixel 2026-06-04): SUSPENDIDA "fecha prevista de reanudación".
    // Surfaces in DetailStatusPanel as the static date line for suspended
    // rows (no countdown — the panel never paints a fake "Termina en" for a
    // non-active row).
    resumeAt: raw.resumeAt ?? null,
    // Document-archive wave: surface so the (lazy) modal reuse works, and so
    // the page header can flag "Inicio …" alongside the existing "Termina …".
    opensAt: raw.opensAt ?? null,
    propertyType: raw.propertyType ?? null,
    hasDocuments: Array.isArray(raw.documents) && raw.documents.length > 0,
    postalCode: raw.postalCode ?? null,
    idufir: raw.idufir ?? null,
    registryInscription: raw.registryInscription ?? null,
    legalTitle: raw.legalTitle ?? null,
    bienLocalidad: raw.bienLocalidad ?? null,
    bienProvincia: raw.bienProvincia ?? null,
    viviendaHabitual: raw.viviendaHabitual ?? null,
  };

  const hasCoords = typeof raw.latitude === "number" && typeof raw.longitude === "number";

  // Real photo = resolver-served (Catastro / Street View / migrated). Anything else
  // (legacy seed URL, category placeholder) is treated as "no photo".
  const photoUrl: string | null =
    raw.imageUrl &&
    (raw.imageUrl.startsWith("/api/auction-image/") || raw.imageUrl.startsWith("/streetview/"))
      ? raw.imageUrl
      : null;

  // When `hideHeader` is set, the outer page chrome + breadcrumb + h1 + meta
  // line are owned by the SSR teaser (see /subastas/subasta/[slug]/page.tsx).
  // Use a Fragment so we don't re-paint them.
  // OuterShell — when hideHeader=false (legacy /auction/[id] / internal nav),
  // wrap in <div min-h-screen><main max-w-editorial>...</main></div>. When
  // hideHeader=true (freemium-gate page on /subastas/subasta/[slug]), the
  // parent page owns those wrappers, so OuterShell is a Fragment.
  const OuterShell = hideHeader
    ? ({ children }: { children: React.ReactNode }) => <>{children}</>
    : ({ children }: { children: React.ReactNode }) => (
        <div className="min-h-screen bg-[var(--color-page)] pb-24 md:pb-12">
          <main className="mx-auto max-w-editorial px-4 md:px-6 py-6 md:py-8">
            {children}
          </main>
        </div>
      );
  // Inner content has a two-col layout that previously closed with
  // `</main></div>`. We now close with </InnerMain> below — a paired Fragment
  // tag so the JSX tree stays balanced regardless of hideHeader.

  return (
    <OuterShell>
        {!hideHeader && (
        <>
        {/* Breadcrumb */}
        <nav className="text-xs text-[var(--color-ink-tertiary)] tnum" aria-label="Migas de pan">
          <Link href="/" className="hover:text-[var(--color-brand)]">
            Inicio
          </Link>
          <span aria-hidden="true" className="mx-2">·</span>
          <Link href="/subastas" className="hover:text-[var(--color-brand)]">
            Subastas
          </Link>
          {raw.province && (
            <>
              <span aria-hidden="true" className="mx-2">·</span>
              <Link
                // Wave 56 Option A — clean province URL. If the raw value
                // isn't in our taxonomy (off-canon data) fall back to the
                // interactive list filter so the link still resolves.
                href={
                  PROVINCE_DB_KEY_TO_SLUG[raw.province]
                    ? `/subastas/${PROVINCE_DB_KEY_TO_SLUG[raw.province]}`
                    : `/subastas?province=${encodeURIComponent(raw.province)}`
                }
                className="hover:text-[var(--color-brand)]"
              >
                {capitalize(raw.province)}
              </Link>
            </>
          )}
        </nav>

        {/* Hero
            H1: address-led display title (wave-A 2026-06-07). The page is
            fully public so the real street address can lead the headline;
            falls back to municipality/province for vehicles/land per the
            helper's fallback ladder. The reference code (raw.boeId) is shown
            below as secondary metadata, NEVER as the H1.

            Wave-C (2026-06-07): the hero block now also carries the urgency
            row (countdown + bid-status chip) AND the sticky "Crear alerta"
            CTA. These sit immediately under the title so the user sees the
            urgency lever AND the conversion path within the first viewport.
            */}
        <header className="mt-3 mb-7 md:mb-9 space-y-4">
          <div className="min-w-0 space-y-2">
            <h1 className="font-serif text-2xl md:text-3xl lg:text-4xl leading-tight text-[var(--color-ink-primary)]">
              {auctionDisplayTitle({
                address: raw.address,
                // Bug 2 (2026-06-09): read-time fallback when `address` is the
                // mis-captured BOE "Localización" junk — clean street comes
                // from the lotDescription "Dirección" tab (street + first
                // number only; PII in the blob can't reach the title).
                lotDescription: raw.lotDescription,
                propertyType: raw.propertyType,
                auctionType: raw.auctionType,
                category: raw.category,
                municipality: raw.municipality,
                province: raw.province,
                title: raw.title,
              })}
            </h1>
            {where && (
              <p className="text-sm text-[var(--color-ink-secondary)]">{where}</p>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-ink-tertiary)] tnum">
              <span className="font-mono">{raw.boeId}</span>
              {/* propertyType (doc-archive backfill) — BOE bien-heading type.
                  Preferred over auctionType when both are present. */}
              {raw.propertyType ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{capitalize(raw.propertyType)}</span>
                </>
              ) : raw.auctionType && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{capitalize(raw.auctionType.toLowerCase())}</span>
                </>
              )}
              {raw.courtName && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{raw.courtName}</span>
                </>
              )}
              {/* "Inicio …" — official start date (opensAt). Null-safe; the
                  row hides cleanly when the doc-archive backfill hasn't
                  reached this auction yet. */}
              {raw.opensAt && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3 w-3" aria-hidden="true" />
                    Inicio {formatDateLong(raw.opensAt)}
                  </span>
                </>
              )}
            </div>
          </div>
          {/* Countdown + bid-status row — the urgency block. PLABI rows
              (CELEBRÁNDOSE without endDate) hide gracefully — the badge
              suppresses itself when there's no endDate AND no bidStatus
              (QC fix, Pixel 2026-06-07). */}
          <AuctionCountdownBadge
            endDate={raw.endDate ?? raw.endsAt ?? null}
            bidStatus={raw.bidStatus ?? null}
            effectiveStatus={status}
            nowMs={nowMs}
          />
        </header>
        </>
        )}

        {/* Two-column layout */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_360px] gap-6 md:gap-8 items-start">
          {/* Left: content */}
          <div className="space-y-8 min-w-0">
            {/* Imagery + location ladder (wave-C 2026-06-07):
                  1. PHOTO available → render photo as hero, map as sectioned panel below.
                  2. NO photo + COORDS → render MAP as hero (16/9). M7 fallback.
                  3. Neither → neutral placeholder.

                The AuctionMapPanel composes the Leaflet map + Google Maps +
                Street View affordances + ubicación-aproximada disclaimer. */}
            {photoUrl && !photoFailed ? (
              <>
                <section aria-labelledby="photo-heading">
                  <h2 id="photo-heading" className="sr-only">Foto del bien</h2>
                  <div className="hero-frame">
                    <Image
                      src={photoUrl}
                      alt={`Foto de ${raw.title}`}
                      fill
                      sizes="(max-width: 768px) 100vw, 60vw"
                      className="object-cover"
                      priority
                      onError={() => setPhotoFailed(true)}
                    />
                    {/* Status chip overlay top-left (subastasia move 3). */}
                    <div className="absolute left-3 top-3 z-10">
                      <DetailHeroStatusBadge status={status} />
                    </div>
                    {/* Heart top-right. */}
                    <div className="absolute right-3 top-3 z-10">
                      <FollowButton
                        auctionId={raw.id}
                        initialFollowing={data.isFollowing}
                        variant="compact"
                      />
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] text-[var(--color-ink-tertiary)]">
                    Foto generada a partir de la referencia catastral o Street View. Puede no reflejar el estado actual.
                  </p>
                </section>
                {hasCoords && (
                  <section aria-labelledby="map-heading">
                    <h2 id="map-heading" className="font-serif text-xl text-[var(--color-ink-primary)]">
                      Localización
                    </h2>
                    <p className="mt-0.5 text-xs text-[var(--color-ink-tertiary)]">
                      Punto aproximado del bien. Verifica la dirección en el edicto.
                    </p>
                    <div className="mt-3">
                      <AuctionMapPanel auction={auctionItem} />
                    </div>
                  </section>
                )}
              </>
            ) : hasCoords ? (
              // Map-as-hero for photo-less auctions. The map panel keeps its
              // own affordance row (Google Maps / Street View) below; we
              // overlay the status chip + heart on the map frame above using
              // a sibling positioned container.
              <section aria-labelledby="map-heading" className="relative">
                <h2 id="map-heading" className="sr-only">Localización del bien</h2>
                <AuctionMapPanel auction={auctionItem} variant="hero" />
                {/* Chip + heart overlay — sit on top of the 16:9 map frame
                    (AuctionMapPanel's hero variant). Absolute coords match
                    the map panel's container. pointer-events isolation so
                    they don't block map drag. */}
                <div className="pointer-events-none absolute inset-x-0 top-0 z-10">
                  <div className="flex items-start justify-between p-3">
                    <span className="pointer-events-auto">
                      <DetailHeroStatusBadge status={status} />
                    </span>
                    <span className="pointer-events-auto">
                      <FollowButton
                        auctionId={raw.id}
                        initialFollowing={data.isFollowing}
                        variant="compact"
                      />
                    </span>
                  </div>
                </div>
              </section>
            ) : (
              // Rung 3 — neither photo nor coords. Neutral placeholder so the
              // page never reads as broken. Per Dennis (2026-06-03) the
              // category house cartoon is forbidden for property rows: a
              // vehicle row legitimately shows its category icon (no location);
              // a property without coords shows a NEUTRAL map placeholder.
              <section aria-labelledby="hero-fallback-heading">
                <h2 id="hero-fallback-heading" className="sr-only">
                  {isVehicleCategory(raw.category) ? "Imagen de la categoría" : "Ubicación pendiente"}
                </h2>
                <div className="hero-frame flex items-center justify-center">
                  <Image
                    src={
                      resolveCardImage({
                        category: raw.category,
                        title: raw.title,
                        size: "large",
                      }).src
                    }
                    alt={
                      isVehicleCategory(raw.category)
                        ? `Categoría: ${raw.title}`
                        : `Ubicación pendiente para ${raw.title}`
                    }
                    fill
                    sizes="(max-width: 768px) 100vw, 60vw"
                    className="object-contain p-10 opacity-80"
                    priority
                  />
                  <div className="absolute left-3 top-3 z-10">
                    <DetailHeroStatusBadge status={status} />
                  </div>
                  <div className="absolute right-3 top-3 z-10">
                    <FollowButton
                      auctionId={raw.id}
                      initialFollowing={data.isFollowing}
                      variant="compact"
                    />
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-[var(--color-ink-tertiary)] flex items-center gap-1.5">
                  <ImageOff className="h-3 w-3" aria-hidden="true" />
                  Aún no disponemos de foto ni ubicación geocodificada para esta subasta.
                </p>
              </section>
            )}

            {/* Region €/m² value signal (Phase 3, wave141) — "vs área" line.
                Honest-null: RegionBenchmarkChip returns null when the payload
                carries no benchmark, so this whole block collapses. Scope is
                honoured inside the chip (regionLabel is the municipality OR the
                province, whichever bucket answered). Placed just above the
                financial breakdown so the €/m² reads next to the money. */}
            {raw.regionBenchmark && (
              <section aria-labelledby="benchmark-heading">
                <h2
                  id="benchmark-heading"
                  className="font-serif text-xl text-[var(--color-ink-primary)]"
                >
                  Precio por m² frente a la zona
                </h2>
                <div className="mt-3 rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface)] p-4">
                  <RegionBenchmarkChip
                    benchmark={raw.regionBenchmark}
                    variant="detail"
                  />
                </div>
              </section>
            )}

            {/* Financial breakdown table (wave-C M1) — primary trust anchor,
                placed high above documents. Consumes `financials[]` from the
                server projection. Honest-NULL: rows render "No disponible"
                rather than fabricate a 0. */}
            {Array.isArray(raw.financials) && raw.financials.length > 0 && (
              <section aria-labelledby="financials-heading">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 id="financials-heading" className="font-serif text-xl text-[var(--color-ink-primary)]">
                    Desglose financiero
                  </h2>
                  <span className="text-[11px] text-[var(--color-ink-tertiary)]">
                    Valores en euros · fuente BOE
                  </span>
                </div>
                <div className="mt-3">
                  <AuctionFinancialsTable financials={raw.financials} />
                </div>
                {/* M8 — repeat the alert CTA at the high-intent moment, right
                    after the user has absorbed the money figures. The CTA is
                    now PAID-gated (wave-B1) — the API returns 402 for free
                    logged-in users; CrearAlertaCTA itself handles the
                    register/upgrade flow client-side. */}
                <div className="mt-5 accent-band p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="font-serif text-base text-[var(--color-ink-primary)]">
                        ¿Te interesan subastas como esta?
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--color-ink-secondary)]">
                        Activa el plan Acceso y te avisamos por email cuando se publiquen
                        subastas similares en {raw.province ? capitalize(raw.province) : "tu zona"}.
                      </p>
                    </div>
                    <div className="shrink-0">
                      <CrearAlertaCTA auction={raw} hideHelper />
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* "Fuente oficial" source-link block REMOVED (wave169). These
                were the outbound official-auction / place-a-bid deep-links
                (detalleSubasta.php / portal) — now consolidated behind the
                gated Participar CTA in DetailStatusPanel + the mobile bar, so
                the official URL never renders into this page's HTML/RSC
                payload. The edicto / anuncio PDFs those links duplicated remain
                fully public in the "Documentos oficiales" section below. */}

            {/* Mobile-only inline state panel */}
            <div className="md:hidden">
              <DetailStatusPanel auction={auctionItem} initialFollowing={data.isFollowing} nowMs={nowMs} />
            </div>

            {/* Timeline */}
            <section aria-labelledby="timeline-heading">
              <h2
                id="timeline-heading"
                className="font-serif text-xl text-[var(--color-ink-primary)]"
              >
                Línea de tiempo
              </h2>
              <p className="mt-0.5 text-xs text-[var(--color-ink-tertiary)]">
                Cambios detectados por nuestro tracker, en orden cronológico.
              </p>
              <div className="mt-4">
                <DetailTimeline
                  statuses={data.history.statuses}
                  bids={data.history.bids}
                  initialLimit={8}
                />
              </div>
            </section>

            {/* Description.
                Defence-in-depth (2026-06-08): every free-text scraper field
                runs through sanitizeExtractedText() before render so the
                BOE page-dump leak (HTML/JS nav chrome) can never reach the
                UI even if a future regression slips junk into the row.
                The API already sanitizes too — the double-pass is intentional.

                Address-dedup (2026-06-09): the BOE-style blob is a flat run of
                `Etiqueta: valor` / `Etiqueta\tvalor` segments (Dirección, Vía
                Pública, Número, Localización, Código Postal, Referencia
                catastral, IDUFIR, Superficie…) — the SAME fields the structured
                "Datos del bien" KV panel below renders canonically. Rendering
                the blob verbatim printed the address (and friends) a SECOND
                time inside the prose. stripStructuredLabelLines() keeps only
                the genuine free-text lead BEFORE the first structured token and
                drops the Key/Value dump; the KV panel stays the single home for
                the structured address. When there is no lead prose (blob was
                purely structured) it returns null and the section is omitted
                entirely (no empty heading). */}
            {(() => {
              const desc =
                stripStructuredLabelLines(raw.propertyDescription) ??
                stripStructuredLabelLines(raw.lotDescription) ??
                stripStructuredLabelLines(raw.boeAnnouncement);
              if (!desc) return null;
              return (
                <section aria-labelledby="desc-heading">
                  <h2 id="desc-heading" className="font-serif text-xl text-[var(--color-ink-primary)]">
                    Descripción del bien
                  </h2>
                  <div className="mt-3 max-w-readable text-[15px] leading-relaxed text-[var(--color-ink-secondary)] whitespace-pre-line">
                    {desc}
                  </div>
                </section>
              );
            })()}

            {/* Datos del vehículo — wave E2 (2026-06-07).
                Rendered only when at least one of make/model/year is
                present, so non-VEHICLE rows and pre-backfill rows omit the
                block entirely (graceful empty). Make + model are titleCased
                at display time so a row stored as "SEAT LEON" doesn't read
                louder than its neighbours. Year is rendered verbatim
                (already a 4-digit int from the scraper contract). */}
            {(() => {
              const make = (raw.vehicleMake ?? '').trim() || null;
              const model = (raw.vehicleModel ?? '').trim() || null;
              const year = typeof raw.vehicleYear === 'number' && Number.isFinite(raw.vehicleYear)
                ? raw.vehicleYear
                : null;
              if (!make && !model && year == null) return null;
              return (
                <section aria-labelledby="vehiculo-heading">
                  <h2 id="vehiculo-heading" className="font-serif text-xl text-[var(--color-ink-primary)]">
                    Datos del vehículo
                  </h2>
                  <dl className="mt-3 grid grid-cols-1 sm:grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
                    {make && <KV label="Marca" value={titleCase(make)} />}
                    {model && <KV label="Modelo" value={titleCase(model)} />}
                    {year != null && <KV label="Año" value={String(year)} />}
                  </dl>
                </section>
              );
            })()}

            {/* Datos del bien — document-archive wave (2026-06-03).
                Each row is rendered only when its field is non-null, so
                pre-backfill the whole section is omitted (graceful empty,
                no console error, no broken card). All these fields are
                SEO-public — they sit in SSR markup so search engines see
                "esta vivienda en Calle X, 28013 Madrid". */}
            {(() => {
              const localidad = raw.bienLocalidad ?? null;
              const provinciaBien = raw.bienProvincia ?? null;
              const anyBien =
                raw.address || raw.postalCode || localidad || provinciaBien ||
                raw.idufir || raw.registryInscription || raw.legalTitle ||
                raw.viviendaHabitual != null;
              if (!anyBien) return null;
              return (
                <section aria-labelledby="bien-heading">
                  <h2 id="bien-heading" className="font-serif text-xl text-[var(--color-ink-primary)]">
                    Datos del bien
                  </h2>
                  <dl className="mt-3 grid grid-cols-1 sm:grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
                    {raw.address && (
                      <KV label="Dirección" value={<span>{raw.address}</span>} />
                    )}
                    {raw.postalCode && <KV label="Código postal" value={raw.postalCode} mono />}
                    {localidad && <KV label="Localidad" value={capitalize(localidad)} />}
                    {provinciaBien && <KV label="Provincia" value={capitalize(provinciaBien)} />}
                    {raw.idufir && <KV label="IDUFIR" value={raw.idufir} mono />}
                    {raw.registryInscription && (
                      <KV label="Inscripción registral" value={raw.registryInscription} />
                    )}
                    {raw.legalTitle && <KV label="Título legal" value={raw.legalTitle} />}
                    {raw.viviendaHabitual != null && (
                      <KV
                        label="Vivienda habitual"
                        value={raw.viviendaHabitual ? "Sí" : "No"}
                      />
                    )}
                  </dl>
                </section>
              );
            })()}

            {/* Legal data */}
            <section aria-labelledby="legal-heading">
              <h2 id="legal-heading" className="font-serif text-xl text-[var(--color-ink-primary)]">
                Datos legales
              </h2>
              <dl className="mt-3 grid grid-cols-1 sm:grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
                {raw.cadastralRef && (() => {
                  // Build the public Sede Electrónica del Catastro URL. The
                  // helper validates the 20-char shape and returns null on
                  // malformed input — in that case we still show the RC,
                  // just without the link, so the user sees the value either
                  // way. Null-safe; no console error on the 97.5% without an RC.
                  const catastroUrl = buildCatastroUrl(raw.cadastralRef);
                  return (
                    <KV
                      label="Referencia catastral"
                      value={
                        catastroUrl ? (
                          <span className="inline-flex flex-wrap items-center gap-2">
                            <span className="font-mono">{raw.cadastralRef}</span>
                            <a
                              href={catastroUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label="Ver en la Sede Electrónica del Catastro (se abre en nueva pestaña)"
                              className="inline-flex items-center gap-1 rounded-full border border-[var(--color-hairline)] bg-[var(--color-surface-muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-ink-secondary)] hover:border-[var(--color-brand)]/40 hover:text-[var(--color-ink-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/40"
                            >
                              <Landmark className="h-3 w-3" aria-hidden="true" />
                              Ver en Catastro
                              <ExternalLink className="h-3 w-3 opacity-70" aria-hidden="true" />
                            </a>
                          </span>
                        ) : (
                          raw.cadastralRef
                        )
                      }
                      mono={!catastroUrl}
                    />
                  );
                })()}
                {(() => {
                  const v = sanitizeExtractedText(raw.registryInfo);
                  return v ? <KV label="Registro" value={v} /> : null;
                })()}
                {raw.charges && <KV label="Cargas" value={raw.charges} />}
                {raw.possessionStatus && (
                  <KV label="Situación posesoria" value={raw.possessionStatus} />
                )}
                {raw.visitable && <KV label="Visitable" value={raw.visitable} />}
                {raw.procedureNumber && (
                  // Wave-B (2026-06-07): expediente is public now.
                  <KV
                    label="Expediente"
                    value={<span className="font-mono">{raw.procedureNumber}</span>}
                  />
                )}
              </dl>
            </section>

            {/* Documents (wave173, 2026-08-01): the sprawling main-body section
                is GONE — the surface now lives in the compact collapsed
                <AuctionDocsDisclosure> side widget (right rail on desktop,
                rendered below in the main flow on mobile only so the single-
                column layout never re-introduces the long doc scroll). All
                per-doc affordances (Descargar / Fuente BOE / legacy PDFs) and
                the Option-A paid gate live inside that component. */}
            <AuctionDocsDisclosure
              className="md:hidden"
              documents={raw.documents}
              pdfUrl={raw.pdfUrl}
              edictUrl={raw.edictUrl}
              documentsLocked={documentsLocked}
              detailPath={pathname}
            />

            {/* Cadastral block (wave-C M3) — server-projected `cadastral{}`
                object. Renders only the fields that resolve (NULL-safe).
                Section is hidden entirely if every field is null.
                NOTE: chargesDetail goes through sanitizeExtractedText() below
                AND when summing up "is anything renderable here" — so a row
                whose ONLY non-null cadastral field is a page-dumped
                chargesDetail collapses to "section hidden" rather than
                "empty section with heading only". */}
            {raw.cadastral && (raw.cadastral.ref ||
              raw.cadastral.charges || sanitizeExtractedText(raw.cadastral.chargesDetail) ||
              raw.cadastral.possession || raw.cadastral.classification ||
              raw.cadastral.use || raw.cadastral.area ||
              raw.cadastral.ownershipPct) && (
              <section aria-labelledby="cadastral-heading">
                <h2 id="cadastral-heading" className="font-serif text-xl text-[var(--color-ink-primary)]">
                  Información catastral y registral
                </h2>
                <dl className="mt-3 grid grid-cols-1 sm:grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
                  {raw.cadastral.ref && (() => {
                    const catastroUrl = buildCatastroUrl(raw.cadastral.ref);
                    return (
                      <KV
                        label="Referencia catastral"
                        value={
                          catastroUrl ? (
                            <span className="inline-flex flex-wrap items-center gap-2">
                              <span className="font-mono">{raw.cadastral.ref}</span>
                              <a
                                href={catastroUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-full border border-[var(--color-hairline)] bg-[var(--color-surface-muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-ink-secondary)] hover:border-[var(--color-brand)]/40 hover:text-[var(--color-ink-primary)]"
                              >
                                <Landmark className="h-3 w-3" aria-hidden="true" />
                                Ver en Catastro
                                <ExternalLink className="h-3 w-3 opacity-70" aria-hidden="true" />
                              </a>
                            </span>
                          ) : (
                            raw.cadastral.ref
                          )
                        }
                        mono={!catastroUrl}
                      />
                    );
                  })()}
                  {raw.cadastral.classification && (
                    <KV label="Clasificación" value={raw.cadastral.classification} />
                  )}
                  {raw.cadastral.use && <KV label="Uso" value={raw.cadastral.use} />}
                  {raw.cadastral.area && <KV label="Superficie" value={raw.cadastral.area} />}
                  {raw.cadastral.ownershipPct && (
                    <KV label="% titularidad" value={raw.cadastral.ownershipPct} />
                  )}
                  {raw.cadastral.charges && (
                    <KV label="Cargas" value={raw.cadastral.charges} />
                  )}
                  {(() => {
                    const v = sanitizeExtractedText(raw.cadastral.chargesDetail);
                    return v ? <KV label="Detalle de cargas" value={v} /> : null;
                  })()}
                  {raw.cadastral.possession && (
                    <KV label="Situación posesoria" value={raw.cadastral.possession} />
                  )}
                </dl>
              </section>
            )}

            {/* Seller / agency contact (wave-C M4). Null-safe: section is
                fully hidden when both name and contact are absent. */}
            {raw.seller && (raw.seller.name || raw.seller.contact) && (
              <section aria-labelledby="contact-heading">
                <h2 id="contact-heading" className="font-serif text-xl text-[var(--color-ink-primary)]">
                  Contacto del organismo
                </h2>
                <div className="mt-3 space-y-2 rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface)] p-4 text-sm">
                  {raw.seller.name && (
                    <p className="flex items-start gap-2 text-[var(--color-ink-primary)]">
                      <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-ink-tertiary)]" aria-hidden="true" />
                      <span className="font-medium">{raw.seller.name}</span>
                    </p>
                  )}
                  {raw.seller.contact && (
                    <p className="flex items-start gap-2 whitespace-pre-line text-[var(--color-ink-secondary)]">
                      <Phone className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-ink-tertiary)]" aria-hidden="true" />
                      <span className="break-words">{raw.seller.contact}</span>
                    </p>
                  )}
                </div>
              </section>
            )}

            {/* Source & verification — trust strip. Wave-C: now includes the
                last-updated line (M4) alongside published + last-verified. */}
            <section aria-labelledby="source-heading" className="rounded-lg bg-[var(--color-surface-muted)] p-4">
              <h2
                id="source-heading"
                className="font-serif text-base text-[var(--color-ink-primary)]"
              >
                Fuente y verificación
              </h2>
              <dl className="mt-2 grid grid-cols-1 gap-y-1 text-xs text-[var(--color-ink-secondary)]">
                <div className="flex gap-2">
                  <dt>Origen:</dt>
                  {/* QC P1 (2026-06-07): always render through SOURCE_LABEL_MAP
                      so a row whose `source='PLABI'` displays as "PLABI", not
                      raw-source-stringified-then-titlecased "Plabi" elsewhere
                      and "PLABI" in the badge. Single label source = no dup. */}
                  <dd className="text-[var(--color-ink-primary)]">
                    {getSourceLabel(raw.source) ?? "BOE"}
                  </dd>
                </div>
                <div className="flex gap-2 tnum">
                  <dt>Publicada:</dt>
                  <dd className="text-[var(--color-ink-primary)]">{formatDateLong(raw.publishedAt)}</dd>
                </div>
                {raw.lastUpdated && (
                  <div className="flex gap-2 tnum">
                    <dt>Actualizada:</dt>
                    <dd className="text-[var(--color-ink-primary)]">
                      {formatRelativeEs(raw.lastUpdated)}
                    </dd>
                  </div>
                )}
                {raw.lastVerifiedAt && (
                  <div className="flex gap-2 tnum">
                    <dt>Última verificación:</dt>
                    <dd className="text-[var(--color-ink-primary)]">
                      {formatRelativeEs(raw.lastVerifiedAt)}
                    </dd>
                  </div>
                )}
              </dl>
            </section>
          </div>

          {/* Right rail (desktop only) — sticky state panel + the collapsed
              documents disclosure directly beneath it (wave173). */}
          <div className="hidden md:block">
            <div className="sticky top-24 space-y-4">
              <DetailStatusPanel auction={auctionItem} initialFollowing={data.isFollowing} nowMs={nowMs} />
              <AuctionDocsDisclosure
                documents={raw.documents}
                pdfUrl={raw.pdfUrl}
                edictUrl={raw.edictUrl}
                documentsLocked={documentsLocked}
                detailPath={pathname}
              />
            </div>
          </div>
        </div>

        {/* Similar auctions carousel (wave-C M6) — spans the full editorial
            width, below the two-column grid. Self-fetches /api/auctions
            filtered by province + category; hides entirely when zero
            similar rows resolve so the section never reads empty. */}
        <div className="mt-10 md:mt-12">
          <SimilarAuctionsCarousel
            seedId={raw.id}
            seedProvince={raw.province}
            seedCategory={raw.category}
            nowMs={nowMs}
          />
        </div>

      {/* Mobile bottom action bar (position:fixed — escapes any ancestor).
          The go-to-official-auction action is now the gated Participar CTA
          (wave169): a real <button> carrying only the auction id — no official
          URL in this DOM. Server-side GET /api/participar/[id] resolves the
          BOE/portal URL behind the login gate. The Follow button (an app
          action, not the bid link) always stays. */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-[var(--color-surface)] hairline-t p-3 flex gap-2">
        <FollowButton
          auctionId={auctionItem.id}
          initialFollowing={data.isFollowing}
          className="flex-1 justify-center"
        />
        <ParticiparButton
          auctionId={auctionItem.id}
          variant="soft"
          className="flex-1 !py-2"
        />
      </div>
    </OuterShell>
  );
}

/**
 * DetailHeroStatusBadge — the status chip overlaid on the hero photo / map.
 * Wraps the StatusBadge with a subtle white-tint scrim so the chip stays
 * legible on any underlying image (dark photo, busy map). Same colour-coded
 * soft tints as everywhere else (subastasia move 4).
 */
function DetailHeroStatusBadge({ status }: { status: string }) {
  return (
    <span className="inline-flex rounded-full bg-white/85 backdrop-blur-sm p-0.5 shadow-sm">
      <StatusBadge status={status} size="lg" />
    </span>
  );
}

function KV({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <>
      <dt className="text-[var(--color-ink-tertiary)]">{label}</dt>
      <dd className={cn("text-[var(--color-ink-primary)]", mono && "font-mono text-xs")}>{value}</dd>
    </>
  );
}

