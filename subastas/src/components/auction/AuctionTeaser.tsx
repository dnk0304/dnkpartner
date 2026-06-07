/**
 * AuctionTeaser — SERVER component. The PUBLIC, indexable teaser for an
 * auction detail page. Rendered for every viewer (anonymous, trial-active,
 * paid-active) in the SSR HTML stream so Google sees the teaser fields
 * regardless of session state.
 *
 * Fields (Dennis 2026-06-04 boundary, locked):
 *   - Title
 *   - Type (propertyType OR auctionType)
 *   - Province + municipality
 *   - Status (badge)
 *   - Headline figure (appraisalValue / valor subasta — whichever is present)
 *   - Description snippet (≤280 chars)
 *
 * Everything ELSE (exact address, edicto, contact, full financial breakdown,
 * documents) is rendered by the GATED block — only for full-access viewers.
 *
 * IMPORTANT: this component MUST stay synchronous + SSR-only. No `use client`,
 * no `dynamic({ ssr: false })`, no client-side data fetching. Google's
 * crawler must find these fields in the initial HTML.
 */

import Link from 'next/link';
import { Calendar } from 'lucide-react';
import { PROVINCE_DB_KEY_TO_SLUG } from '@/lib/seo/slugs';
import { capitalize, titleCase, formatDateLong } from '@/components/observatory/format';
import { StatusBadge } from '@/components/observatory/StatusBadge';
import { SourceBadge } from '@/components/observatory/SourceBadge';
import { effectiveStatus } from '@/components/observatory/status';
import { pickTeaserSnippet } from '@/lib/teaser-snippet';

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
  // Source (`Auction.source`) — public, NON-PII identifier of which portal
  // we scraped the row from (BOE / Seguridad Social / …). Safe to surface
  // in the SSR teaser; renders as a small SourceBadge alongside the type
  // label. NEVER fed into pickTeaserSnippet (which only consumes the
  // structured-safe fields).
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

export function AuctionTeaser({ data }: { data: AuctionTeaserData }) {
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

  // Headline figure — prefer Tasación (appraisalValue), fall back to valor
  // subasta. The card layer follows the same ordering so the teaser figure
  // matches what the user saw on the card before clicking through.
  const headlineFigure =
    formatEuro(data.appraisalValue) ?? formatEuro(data.valorSubasta);
  const headlineLabel =
    data.appraisalValue != null
      ? 'Tasación'
      : data.valorSubasta != null
      ? 'Valor subasta'
      : null;

  const snippet = teaserSnippet(data, status);

  return (
    <section aria-labelledby="auction-teaser-heading" className="space-y-4">
      {/* Breadcrumb */}
      <nav className="text-xs text-[--color-ink-tertiary] tnum" aria-label="Migas de pan">
        <Link href="/" className="hover:text-[--color-brand]">
          Inicio
        </Link>
        <span aria-hidden="true" className="mx-2">·</span>
        <Link href="/subastas" className="hover:text-[--color-brand]">
          Subastas
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
              className="hover:text-[--color-brand]"
            >
              {capitalize(data.province)}
            </Link>
          </>
        )}
      </nav>

      {/* Title */}
      <header>
        <h1
          id="auction-teaser-heading"
          className="font-serif text-2xl md:text-3xl lg:text-4xl leading-tight text-[--color-ink-primary]"
        >
          {data.title || data.category}
        </h1>
        {where && (
          <p className="mt-1.5 text-sm text-[--color-ink-secondary]">{where}</p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[--color-ink-tertiary] tnum">
          <span className="font-mono">{data.boeId}</span>
          {typeLabel && (
            <>
              <span aria-hidden="true">·</span>
              <span>{typeLabel}</span>
            </>
          )}
          {/* SourceBadge — public identifier of scraper origin. Null-safe;
              SSR-only. Inline in the meta row so it sits next to the type. */}
          {data.source && <SourceBadge source={data.source} size="sm" />}
          {data.opensAt && (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" aria-hidden="true" />
                Inicio {formatDateLong(data.opensAt)}
              </span>
            </>
          )}
        </div>
      </header>

      {/* Status + headline figure (the teaser intel) */}
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 rounded-lg border border-[--color-hairline] bg-[--color-surface-muted] p-4">
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-[--color-ink-tertiary]">
            Estado
          </dt>
          <dd className="mt-1">
            <StatusBadge status={status} />
          </dd>
        </div>
        {headlineFigure && (
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-[--color-ink-tertiary]">
              {headlineLabel}
            </dt>
            <dd className="mt-1 text-lg font-semibold text-[--color-ink-primary] tnum">
              {headlineFigure}
            </dd>
          </div>
        )}
      </dl>

      {/* Description snippet (teaser) */}
      {snippet && (
        <div>
          <h2 className="font-serif text-lg text-[--color-ink-primary]">
            Descripción
          </h2>
          <p className="mt-2 max-w-readable text-[15px] leading-relaxed text-[--color-ink-secondary] whitespace-pre-line">
            {snippet}
          </p>
        </div>
      )}
    </section>
  );
}

export default AuctionTeaser;
