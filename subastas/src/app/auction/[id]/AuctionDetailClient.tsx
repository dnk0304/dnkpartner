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
import dynamic from "next/dynamic";
import Image from "next/image";
import { ArrowLeft, ExternalLink, FileText, MapPin, ImageOff } from "lucide-react";
import { apiFetch } from "@/lib/api-path";
import { AuctionItem } from "@/types";
import { resolveCardImage } from "@/lib/resolve-card-image";
import { ObservatoryHeader } from "@/components/observatory/ObservatoryHeader";
import { effectiveStatus } from "@/components/observatory/status";
import { DetailStatusPanel } from "@/components/observatory/DetailStatusPanel";
import { DetailTimeline } from "@/components/observatory/DetailTimeline";
import { StatusBadge } from "@/components/observatory/StatusBadge";
import { FollowButton } from "@/components/notifications/FollowButton";
import {
  formatDateLong,
  formatRelativeEs,
  capitalize,
  titleCase,
} from "@/components/observatory/format";
import { cn } from "@/lib/utils";

// AuctionLocationMap touches `window` at import time — must be dynamic+ssr:false.
const AuctionLocationMap = dynamic(
  () => import("@/components/dashboard/AuctionLocationMap").then((m) => m.AuctionLocationMap),
  { ssr: false, loading: () => <div className="h-72 bg-[--color-surface-muted] animate-pulse rounded-md" /> },
);

type DetailResponse = {
  success: boolean;
  data?: {
    auction: any; // raw Prisma row — we coerce below
    history: {
      statuses: Array<{
        id: string;
        fromStatus: string | null;
        toStatus: string;
        changedAt: string;
        reason: string | null;
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

export default function AuctionDetailClient({ id }: { id: string }) {
  const [data, setData] = React.useState<DetailResponse["data"] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [photoFailed, setPhotoFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`/api/auctions/${encodeURIComponent(id)}`);
        if (cancelled) return;
        if (res.status === 404) {
          setError("not_found");
          return;
        }
        if (!res.ok) {
          setError("server_error");
          return;
        }
        const body = (await res.json()) as DetailResponse;
        if (!cancelled && body.success && body.data) setData(body.data);
        else if (!cancelled) setError(body.error || "unknown_error");
      } catch {
        if (!cancelled) setError("network_error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[--color-page]">
        <ObservatoryHeader hideSearch />
        <main className="mx-auto max-w-editorial px-4 md:px-6 py-8 space-y-6">
          <div className="h-7 w-1/3 bg-[--color-surface-muted] rounded animate-pulse" />
          <div className="h-12 w-2/3 bg-[--color-surface-muted] rounded animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-[1fr_360px] gap-6">
            <div className="space-y-3">
              <div className="h-64 bg-[--color-surface-muted] rounded animate-pulse" />
              <div className="h-32 bg-[--color-surface-muted] rounded animate-pulse" />
            </div>
            <div className="h-96 bg-[--color-surface-muted] rounded animate-pulse" />
          </div>
        </main>
      </div>
    );
  }

  if (error === "not_found") {
    return (
      <div className="min-h-screen bg-[--color-page]">
        <ObservatoryHeader hideSearch />
        <main className="mx-auto max-w-editorial px-4 md:px-6 py-16 text-center">
          <h1 className="font-serif text-2xl text-[--color-ink-primary]">Subasta no encontrada</h1>
          <p className="mt-2 text-sm text-[--color-ink-tertiary]">
            La subasta solicitada no existe o ha sido retirada del Portal del BOE.
          </p>
          <Link
            href="/subastas"
            className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-[--color-brand] hover:underline"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Ver todas las subastas
          </Link>
        </main>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[--color-page]">
        <ObservatoryHeader hideSearch />
        <main className="mx-auto max-w-editorial px-4 md:px-6 py-16 text-center">
          <h1 className="font-serif text-xl text-[--color-ink-primary]">
            No pudimos cargar esta subasta.
          </h1>
          <p className="mt-2 text-sm text-[--color-ink-tertiary]">
            Reintenta en unos segundos o vuelve a la lista.
          </p>
        </main>
      </div>
    );
  }

  const raw = data.auction;
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
  const auctionItem: AuctionItem & {
    startedAt?: string | null;
    endsAt?: string | null;
    minimumBid?: number | null;
    depositAmount?: number | null;
    bidIncrement?: number | null;
    claimedAmount?: number | null;
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
    startedAt: raw.endDateTime ?? null,
    endsAt: raw.endsAt ?? null,
  };

  const hasCoords = typeof raw.latitude === "number" && typeof raw.longitude === "number";

  // Real photo = resolver-served (Catastro / Street View / migrated). Anything else
  // (legacy seed URL, category placeholder) is treated as "no photo".
  const photoUrl: string | null =
    raw.imageUrl &&
    (raw.imageUrl.startsWith("/api/auction-image/") || raw.imageUrl.startsWith("/streetview/"))
      ? raw.imageUrl
      : null;

  return (
    <div className="min-h-screen bg-[--color-page] pb-24 md:pb-12">
      <ObservatoryHeader hideSearch />

      <main className="mx-auto max-w-editorial px-4 md:px-6 py-6 md:py-8">
        {/* Breadcrumb */}
        <nav className="text-xs text-[--color-ink-tertiary] tnum" aria-label="Migas de pan">
          <Link href="/" className="hover:text-[--color-brand]">
            Inicio
          </Link>
          <span aria-hidden="true" className="mx-2">·</span>
          <Link href="/subastas" className="hover:text-[--color-brand]">
            Subastas
          </Link>
          {raw.province && (
            <>
              <span aria-hidden="true" className="mx-2">·</span>
              <Link
                href={`/subastas?province=${encodeURIComponent(raw.province)}`}
                className="hover:text-[--color-brand]"
              >
                {capitalize(raw.province)}
              </Link>
            </>
          )}
        </nav>

        {/* Hero */}
        <header className="mt-3 mb-6 md:mb-8">
          <h1 className="font-serif text-2xl md:text-3xl lg:text-4xl leading-tight text-[--color-ink-primary]">
            {raw.title}
          </h1>
          {where && (
            <p className="mt-1.5 text-sm text-[--color-ink-secondary]">{where}</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[--color-ink-tertiary] tnum">
            <span className="font-mono">{raw.boeId}</span>
            {raw.auctionType && (
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
          </div>
        </header>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_360px] gap-6 md:gap-8 items-start">
          {/* Left: content */}
          <div className="space-y-8 min-w-0">
            {/* Real photo (Catastro/Street View). Shown above the map so the
                eye gets the property first; map provides spatial context after. */}
            {photoUrl && !photoFailed && (
              <section aria-labelledby="photo-heading">
                <h2 id="photo-heading" className="sr-only">Foto del bien</h2>
                <div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg border border-[--color-hairline] bg-[--color-surface-muted]">
                  <Image
                    src={photoUrl}
                    alt={`Foto de ${raw.title}`}
                    fill
                    sizes="(max-width: 768px) 100vw, 60vw"
                    className="object-cover"
                    priority
                    onError={() => setPhotoFailed(true)}
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-[--color-ink-tertiary]">
                  Foto generada a partir de la referencia catastral o Street View. Puede no reflejar el estado actual.
                </p>
              </section>
            )}

            {/* Map — rung 2 of the imagery ladder. Renders an interactive
                Leaflet map when coordinates exist. */}
            {hasCoords ? (
              <section aria-labelledby="map-heading">
                <h2 id="map-heading" className="sr-only">Ubicación</h2>
                <div className="rounded-lg overflow-hidden border border-[--color-hairline]">
                  <div className="h-72 md:h-96 relative">
                    <AuctionLocationMap auction={auctionItem} />
                  </div>
                </div>
                {raw.address && (
                  <p className="mt-2 text-xs text-[--color-ink-tertiary] flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> {raw.address}
                  </p>
                )}
              </section>
            ) : (!photoUrl || photoFailed) ? (
              // Rung 3 — neither photo nor coords. The detail page must NEVER be
              // blank, so render the per-category SVG placeholder at hero size.
              <section aria-labelledby="hero-fallback-heading">
                <h2 id="hero-fallback-heading" className="sr-only">
                  Imagen de la categoría
                </h2>
                <div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg border border-[--color-hairline] bg-[--color-surface-muted] flex items-center justify-center">
                  <Image
                    src={
                      resolveCardImage({
                        category: raw.category,
                        title: raw.title,
                        size: "large",
                      }).src
                    }
                    alt={`Categoría: ${raw.title}`}
                    fill
                    sizes="(max-width: 768px) 100vw, 60vw"
                    className="object-contain p-10 opacity-80"
                    priority
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-[--color-ink-tertiary] flex items-center gap-1.5">
                  <ImageOff className="h-3 w-3" aria-hidden="true" />
                  Aún no disponemos de foto ni ubicación geocodificada para esta subasta.
                </p>
              </section>
            ) : null}

            {/* Mobile-only inline state panel */}
            <div className="md:hidden">
              <DetailStatusPanel auction={auctionItem} initialFollowing={data.isFollowing} />
            </div>

            {/* Timeline */}
            <section aria-labelledby="timeline-heading">
              <h2
                id="timeline-heading"
                className="font-serif text-xl text-[--color-ink-primary]"
              >
                Línea de tiempo
              </h2>
              <p className="mt-0.5 text-xs text-[--color-ink-tertiary]">
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

            {/* Description */}
            {(raw.propertyDescription || raw.lotDescription || raw.boeAnnouncement) && (
              <section aria-labelledby="desc-heading">
                <h2 id="desc-heading" className="font-serif text-xl text-[--color-ink-primary]">
                  Descripción del bien
                </h2>
                <div className="mt-3 max-w-readable text-[15px] leading-relaxed text-[--color-ink-secondary] whitespace-pre-line">
                  {raw.propertyDescription || raw.lotDescription || raw.boeAnnouncement}
                </div>
              </section>
            )}

            {/* Legal data */}
            <section aria-labelledby="legal-heading">
              <h2 id="legal-heading" className="font-serif text-xl text-[--color-ink-primary]">
                Datos legales
              </h2>
              <dl className="mt-3 grid grid-cols-1 sm:grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
                {raw.cadastralRef && (
                  <KV label="Referencia catastral" value={raw.cadastralRef} mono />
                )}
                {raw.registryInfo && (
                  <KV label="Registro" value={raw.registryInfo} />
                )}
                {raw.charges && <KV label="Cargas" value={raw.charges} />}
                {raw.possessionStatus && (
                  <KV label="Situación posesoria" value={raw.possessionStatus} />
                )}
                {raw.visitable && <KV label="Visitable" value={raw.visitable} />}
                {raw.procedureNumber && (
                  <KV label="Expediente" value={raw.procedureNumber} mono />
                )}
              </dl>
            </section>

            {/* Documents */}
            {(raw.pdfUrl || raw.edictUrl || raw.boeLink) && (
              <section aria-labelledby="docs-heading">
                <h2 id="docs-heading" className="font-serif text-xl text-[--color-ink-primary]">
                  Documentos oficiales
                </h2>
                <ul className="mt-3 space-y-2 text-sm">
                  {raw.pdfUrl && <DocLink href={raw.pdfUrl} label="Anuncio del BOE (PDF)" />}
                  {raw.edictUrl && <DocLink href={raw.edictUrl} label="Edicto del juzgado (PDF)" />}
                  {raw.boeLink && (
                    <DocLink href={raw.boeLink} label="Ficha completa en el Portal de Subastas del BOE" />
                  )}
                </ul>
              </section>
            )}

            {/* Source & verification */}
            <section aria-labelledby="source-heading" className="rounded-lg bg-[--color-surface-muted] p-4">
              <h2
                id="source-heading"
                className="font-serif text-base text-[--color-ink-primary]"
              >
                Fuente y verificación
              </h2>
              <dl className="mt-2 grid grid-cols-1 gap-y-1 text-xs text-[--color-ink-secondary]">
                <div className="flex gap-2">
                  <dt>Origen:</dt>
                  <dd className="text-[--color-ink-primary]">{raw.source ?? "BOE"}</dd>
                </div>
                <div className="flex gap-2 tnum">
                  <dt>Publicada:</dt>
                  <dd className="text-[--color-ink-primary]">{formatDateLong(raw.publishedAt)}</dd>
                </div>
                {raw.lastVerifiedAt && (
                  <div className="flex gap-2 tnum">
                    <dt>Última verificación:</dt>
                    <dd className="text-[--color-ink-primary]">
                      {formatRelativeEs(raw.lastVerifiedAt)}
                    </dd>
                  </div>
                )}
              </dl>
            </section>
          </div>

          {/* Right rail (desktop only) — sticky state panel */}
          <div className="hidden md:block">
            <div className="sticky top-24">
              <DetailStatusPanel auction={auctionItem} initialFollowing={data.isFollowing} />
            </div>
          </div>
        </div>
      </main>

      {/* Mobile bottom action bar */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-[--color-surface] hairline-t p-3 flex gap-2">
        <FollowButton
          auctionId={auctionItem.id}
          initialFollowing={data.isFollowing}
          className="flex-1 justify-center"
        />
        <a
          href={auctionItem.boeLink ?? "https://subastas.boe.es"}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-[--color-action-soft] border border-[--color-action] text-[--color-ink-primary] px-4 py-2 text-sm font-semibold hover:bg-[--color-action-soft]/80"
        >
          Ir al BOE
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}

function KV({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <>
      <dt className="text-[--color-ink-tertiary]">{label}</dt>
      <dd className={cn("text-[--color-ink-primary]", mono && "font-mono text-xs")}>{value}</dd>
    </>
  );
}

function DocLink({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 text-[--color-brand] hover:underline focus-visible:outline-none focus-visible:underline"
      >
        <FileText className="h-4 w-4" aria-hidden="true" />
        {label}
        <ExternalLink className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
      </a>
    </li>
  );
}
