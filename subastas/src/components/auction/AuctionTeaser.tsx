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
  appraisalValue: number | null;
  valorSubasta: number | null;
  propertyDescription: string | null;
  lotDescription: string | null;
  boeAnnouncement: string | null;
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
 * PII-safe wrapper over the shared sanitizer. `propertyDescription` is a
 * raw `Key\tValue` structured dump from the scraper (IDUFIR / cadastral /
 * Dirección / Código Postal / Localidad / Provincia all live in its first
 * ~280 chars) — a naive slice would leak the gated fields the wall is
 * supposed to hide into the public SSR HTML + the `__next_f` JSON.
 *
 * `pickTeaserSnippet` strips structured key/value lines, keeps only prose,
 * collapses whitespace, and clamps to ≤280. Single source of truth shared
 * with the API teaser projection — see lib/teaser-snippet.ts.
 */
function teaserSnippet(a: AuctionTeaserData): string | null {
  return pickTeaserSnippet({
    propertyDescription: a.propertyDescription,
    lotDescription: a.lotDescription,
    boeAnnouncement: a.boeAnnouncement,
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

  const snippet = teaserSnippet(data);

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
