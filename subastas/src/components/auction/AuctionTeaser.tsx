/**
 * AuctionTeaser — SERVER component. The PUBLIC, indexable teaser for an
 * auction detail page. Rendered for every viewer (anonymous, trial-active,
 * paid-active) in the SSR HTML stream so Google sees the teaser fields
 * regardless of session state.
 *
 * Fields (Dennis 2026-06-04 boundary, locked):
 *   - Title (address-led for property; muni+province for vehicles/land)
 *   - Type (propertyType OR auctionType)
 *   - Province + municipality
 *   - Status (badge)
 *   - Headline figure (appraisalValue / valor subasta — whichever is present)
 *   - Description snippet (≤280 chars)
 *   - Hero image (photo / map / neutral placeholder ladder)
 *
 * Everything ELSE (exact address, edicto, contact, full financial breakdown,
 * documents) is rendered by the GATED block — only for full-access viewers.
 *
 * 2026-06-07 redesign (subastasia-inspired): hero frame at 4:3 aspect with
 * status chip overlaid top-left; address-led H1 below; consolidated summary
 * panel (NO sticky — the wall sits beneath the teaser on logged-out pages).
 *
 * IMPORTANT: this component MUST stay synchronous + SSR-only. No `use client`,
 * no `dynamic({ ssr: false })`, no client-side data fetching. Google's
 * crawler must find these fields in the initial HTML.
 */

import Image from 'next/image';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { Calendar, MapPin } from 'lucide-react';
import { PROVINCE_DB_KEY_TO_SLUG } from '@/lib/seo/slugs';
import { capitalize, titleCase, formatDateLong } from '@/components/observatory/format';
import { StatusBadge } from '@/components/observatory/StatusBadge';
import { SourceBadge } from '@/components/observatory/SourceBadge';
import { effectiveStatus } from '@/components/observatory/status';
import { pickTeaserSnippet } from '@/lib/teaser-snippet';
import { resolveCardImage } from '@/lib/resolve-card-image';

export interface AuctionTeaserData {
  id: string;
  boeId: string;
  title: string | null;
  category: string;
  province: string | null;
  municipality: string | null;
  status: string;
  auctionType: string | null;
  propertyType: string | null;
  /**
   * Source (`Auction.source`) — public, NON-PII identifier of which portal
   * we scraped the row from (BOE / Seguridad Social / …). Safe to surface
   * in the SSR teaser; renders as a small SourceBadge alongside the type
   * label. NEVER fed into pickTeaserSnippet (which only consumes the
   * structured-safe fields).
   */
  source: string | null;
  appraisalValue: number | null;
  valorSubasta: number | null;
  // NOTE: propertyDescription / lotDescription / boeAnnouncement are NOT
  // part of the public teaser shape. They are untrusted free text that can
  // embed PII (address, cadastral, IDUFIR, postal) for ANY scraper source,
  // and the safe-by-construction snippet builder
  // (`pickTeaserSnippet`) takes only structured fields. Keep them OFF this
  // interface so a future contributor cannot wire them into the teaser by
  // mistake. The full description still flows through `/api/auctions/[id]`
  // for callers with `hasFullAccess`.
  publishedAt: Date | string;
  opensAt: Date | string | null;
  endsAt: Date | string | null;
  /** Resolver-served photo URL (public — Catastro / Street View) or null. */
  imageUrl?: string | null;
  /** Geocoded coordinates — used by the rung-2 map fallback. Public. */
  latitude?: number | null;
  longitude?: number | null;
}

const DB_TO_FRONTEND_STATUS: Record<string, string> = {
  PROXIMA_APERTURA: 'proxima-apertura',
  CELEBRANDOSE: 'celebrandose',
  SUSPENDIDA: 'suspendida',
  CANCELADA: 'cancelada',
  CONCLUIDA_PORTAL: 'concluida-portal',
  FINALIZADA_AUTORIDAD: 'finalizada-autoridad',
  PRE_AUCTION: 'proxima-apertura',
  ACTIVE: 'celebrandose',
  FINISHED: 'concluida-portal',
  SUSPENDED: 'suspendida',
  CANCELLED: 'cancelada',
};

function formatEuro(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * PII-safe-by-construction wrapper over the shared snippet builder.
 *
 * The public teaser snippet is CONSTRUCTED from known-safe structured fields
 * only (type, municipality, province, status). The raw `propertyDescription`
 * / `lotDescription` / `boeAnnouncement` blobs are NEVER passed in — they can
 * embed PII (street address, cadastral ref, IDUFIR, postal code) inline in
 * the prose for ANY scraper source, and no sanitizer over untrusted text
 * survived contact with reality (see lib/teaser-snippet.ts header for the
 * two leak incidents that drove this design). Single source of truth shared
 * with the API teaser projection.
 */
function teaserSnippet(a: AuctionTeaserData, frontendStatus: string): string | null {
  const tipoBien =
    a.propertyType ??
    (a.auctionType ? a.auctionType.toLowerCase() : null) ??
    a.category ??
    null;
  return pickTeaserSnippet({
    tipoBien,
    municipio: a.municipality,
    provincia: a.province,
    frontendStatus,
  });
}

export async function AuctionTeaser({ data }: { data: AuctionTeaserData }) {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations('auctionDetail');
  const td = await getTranslations('domain');
  const rawFrontendStatus = DB_TO_FRONTEND_STATUS[data.status] ?? 'celebrandose';
  const endsAt = data.endsAt instanceof Date ? data.endsAt.toISOString() : data.endsAt;
  const status = effectiveStatus(rawFrontendStatus, endsAt);

  const where = [
    data.municipality && titleCase(data.municipality),
    data.province && capitalize(data.province),
  ]
    .filter(Boolean)
    .join(', ');

  const typeLabel = data.propertyType
    ? capitalize(data.propertyType)
    : data.auctionType
    ? capitalize(data.auctionType.toLowerCase())
    : data.category
    ? capitalize(data.category)
    : null;

  // Headline price hierarchy (subastasia move 2):
  //   BIG BOLD bid (valorSubasta — the "starting bid") on top.
  //   MUTED tasación (appraisalValue) directly beneath as the valuation.
  // Honest-NULL: render only the figures we have. The label adapts.
  const startingBid = formatEuro(data.valorSubasta);
  const valuation = formatEuro(data.appraisalValue);

  const snippet = teaserSnippet(data, status);

  // Imagery — same 3-rung ladder as the cards (photo → map → neutral
  // placeholder). resolveCardImage takes only the public fields we already
  // have; no PII (the lat/lng are coarse-grained centroids).
  const hero = resolveCardImage({
    imageUrl: data.imageUrl ?? null,
    latitude: typeof data.latitude === 'number' ? data.latitude : null,
    longitude: typeof data.longitude === 'number' ? data.longitude : null,
    category: data.category,
    title: data.title,
    size: 'large',
  });

  return (
    <section aria-labelledby="auction-teaser-heading" className="space-y-6">
      {/* Breadcrumb */}
      <nav className="text-xs text-[var(--color-ink-tertiary)] tnum" aria-label={t('breadcrumbAria')}>
        <Link href="/" className="hover:text-[var(--color-brand)]">
          {t('breadcrumbHome')}
        </Link>
        <span aria-hidden="true" className="mx-2">·</span>
        <Link href="/subastas" className="hover:text-[var(--color-brand)]">
          {t('breadcrumbAuctions')}
        </Link>
        {data.province && (
          <>
            <span aria-hidden="true" className="mx-2">·</span>
            <Link
              href={
                PROVINCE_DB_KEY_TO_SLUG[data.province]
                  ? `/subastas/${PROVINCE_DB_KEY_TO_SLUG[data.province]}`
                  : `/subastas?province=${encodeURIComponent(data.province)}`
              }
              className="hover:text-[var(--color-brand)]"
            >
              {capitalize(data.province)}
            </Link>
          </>
        )}
      </nav>

      {/* Two-column hero layout: LEFT 4:3 framed image, RIGHT title + summary. */}
      <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-6 md:gap-8 items-start">
        {/* LEFT — 4:3 hero with status chip overlay (subastasia move 3). */}
        <div className="space-y-3">
          <div className="hero-frame">
            <Image
              src={hero.src}
              alt={hero.alt}
              fill
              sizes="(max-width: 768px) 100vw, 60vw"
              className={hero.isPlaceholder ? 'object-contain p-10 opacity-80' : 'object-cover'}
              priority
            />
            {/* Status chip overlaid top-left. The chip carries its own
                tint+border so it reads on any image. */}
            <div className="absolute left-3 top-3 z-10">
              <StatusBadge status={status} size="lg" />
            </div>
          </div>
          {hero.rung === 'map' && (
            <p className="text-[11px] text-[var(--color-ink-tertiary)] flex items-center gap-1.5">
              <MapPin className="h-3 w-3" aria-hidden="true" />
              {t('approxLocationTeaser')}
            </p>
          )}
        </div>

        {/* RIGHT — title + meta + summary panel. */}
        <div className="space-y-4">
          <header>
            <h1
              id="auction-teaser-heading"
              className="font-serif text-2xl md:text-3xl lg:text-[2rem] leading-tight text-[var(--color-ink-primary)]"
            >
              {data.title || data.category}
            </h1>
            {where && (
              <p className="mt-2 text-sm text-[var(--color-ink-secondary)]">{where}</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-ink-tertiary)] tnum">
              <span className="font-mono">{data.boeId}</span>
              {typeLabel && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{typeLabel}</span>
                </>
              )}
              {data.source && <SourceBadge source={data.source} size="sm" />}
            </div>
          </header>

          {/* Summary panel (subastasia move 1, teaser version) — single
              rounded soft-shadowed card holding the consolidated public
              intel. The price hierarchy: BIG BOLD starting bid; MUTED
              tasación below. Dates render only when present (PLABI rows
              have no endsAt — we hide the row gracefully). */}
          <div className="summary-card p-5 space-y-4">
            {(startingBid || valuation) && (
              <div>
                {startingBid ? (
                  <>
                    <div className="text-[11px] uppercase tracking-wide text-[var(--color-ink-tertiary)]">
                      {td('valorSubasta')}
                    </div>
                    <div className="mt-1 font-serif text-3xl md:text-[2.25rem] font-semibold leading-none tracking-tight text-[var(--color-ink-primary)] tnum">
                      {startingBid}
                    </div>
                    {valuation && (
                      <div className="mt-1.5 text-xs text-[var(--color-ink-tertiary)] tnum">
                        {t('tasacionValue', { value: valuation })}
                      </div>
                    )}
                  </>
                ) : (
                  // No bid — just valuation
                  <>
                    <div className="text-[11px] uppercase tracking-wide text-[var(--color-ink-tertiary)]">
                      {td('tasacion')}
                    </div>
                    <div className="mt-1 font-serif text-3xl md:text-[2.25rem] font-semibold leading-none tracking-tight text-[var(--color-ink-primary)] tnum">
                      {valuation}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Date rows — only render the ones we have. PLABI rows with
                no endsAt hide gracefully. */}
            {(data.opensAt || data.endsAt) && (
              <dl className="space-y-1.5 hairline-t pt-3 text-xs tnum">
                {data.opensAt && (
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-[var(--color-ink-tertiary)]">
                      <Calendar className="inline h-3 w-3 mr-1 align-[-0.05em]" aria-hidden="true" />
                      {td('inicio')}
                    </dt>
                    <dd className="text-[var(--color-ink-primary)]">{formatDateLong(data.opensAt, locale)}</dd>
                  </div>
                )}
                {data.endsAt && (
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-[var(--color-ink-tertiary)]">{t('fin')}</dt>
                    <dd className="text-[var(--color-ink-primary)]">{formatDateLong(data.endsAt, locale)}</dd>
                  </div>
                )}
              </dl>
            )}
          </div>
        </div>
      </div>

      {/* Description snippet (teaser) */}
      {snippet && (
        <div>
          <h2 className="font-serif text-lg text-[var(--color-ink-primary)]">
            {t('descripcion')}
          </h2>
          <p className="mt-2 max-w-readable text-[15px] leading-relaxed text-[var(--color-ink-secondary)] whitespace-pre-line">
            {snippet}
          </p>
        </div>
      )}
    </section>
  );
}

export default AuctionTeaser;
