/**
 * RegistryNav — the internal-link clusters that turn /resultados into a crawl
 * surface: a province results grid, outcome chips, municipio chips and
 * other-province chips. All server-safe (plain <Link>s → real <a href> in the
 * SSR HTML). These are the lateral crawl paths the SEO fix depends on.
 */

import { Fragment } from 'react';
import Link from 'next/link';
import { capitalizeLocation } from '@/lib/utils';
import { PROVINCE_DB_KEY_TO_SLUG } from '@/lib/seo/slugs';
import {
  OUTCOME_META,
  OUTCOME_VIZ,
  OUTCOME_TO_SLUG,
  REGISTRY_OUTCOME_ORDER,
  type Locale,
  type OutcomeCounts,
  type RegistryOutcome,
} from '@/lib/registro/registro-ui';

// ---------------------------------------------------------------------------
// Breadcrumb + back-to-registry link (shared by every /resultados sub-page).
// ---------------------------------------------------------------------------

export function RegistryBreadcrumb({
  homeLabel,
  registryLabel,
  trail,
}: {
  homeLabel: string;
  registryLabel: string;
  trail: Array<{ label: string; href?: string }>;
}) {
  return (
    <nav aria-label="Breadcrumb" className="mb-3 text-xs text-[var(--color-ink-tertiary)]">
      <ol className="flex flex-wrap items-center gap-1">
        <li>
          <Link href="/" className="hover:underline">
            {homeLabel}
          </Link>
        </li>
        <li aria-hidden>›</li>
        <li>
          <Link href="/resultados" className="hover:underline">
            {registryLabel}
          </Link>
        </li>
        {trail.map((t, i) => (
          <Fragment key={i}>
            <li aria-hidden>›</li>
            {t.href ? (
              <li>
                <Link href={t.href} className="hover:underline">
                  {t.label}
                </Link>
              </li>
            ) : (
              <li aria-current="page" className="text-[var(--color-ink-primary)]">
                {t.label}
              </li>
            )}
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}

export function RegistryBackLink({ label }: { label: string }) {
  return (
    <div className="mt-10 border-t border-[var(--color-hairline)] pt-6">
      <Link
        href="/resultados"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-action)] hover:underline"
      >
        ← {label}
      </Link>
    </div>
  );
}

const nf = (locale: Locale) => (n: number) => n.toLocaleString(locale === 'en' ? 'en-US' : 'es-ES');

// ---------------------------------------------------------------------------
// Province results grid — cards linking to /resultados/{provincia}.
// ---------------------------------------------------------------------------

export function ProvinceResultGrid({
  regions,
  locale,
  concludedNoun,
  outcome,
  outcomeSlug,
  outcomeNoun,
}: {
  regions: Array<{ province: string; total: number; counts: OutcomeCounts }>;
  locale: Locale;
  concludedNoun: string;
  /** When set, the grid is scoped to one outcome: it shows that outcome's count
   *  per province and links to /resultados/{outcomeSlug}/{provincia}. */
  outcome?: RegistryOutcome;
  outcomeSlug?: string;
  outcomeNoun?: string;
}) {
  const fmt = nf(locale);
  const scoped = outcome && outcomeSlug;
  return (
    <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      {regions.map((r) => {
        const slug = PROVINCE_DB_KEY_TO_SLUG[r.province];
        if (!slug) return null;
        const shown = scoped ? r.counts[outcome] : r.total;
        if (shown <= 0) return null;
        const soldPct = r.total > 0 ? Math.round((r.counts.VENDIDA / r.total) * 100) : 0;
        return (
          <li key={r.province}>
            <Link
              href={scoped ? `/resultados/${outcomeSlug}/${slug}` : `/resultados/${slug}`}
              className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-3.5 transition-colors hover:bg-[var(--color-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-action)]"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-[var(--color-ink-primary)]">
                  {capitalizeLocation(r.province)}
                </span>
                <span className="tnum block text-xs text-[var(--color-ink-quiet)]">
                  {fmt(shown)} {scoped ? (outcomeNoun ?? concludedNoun) : concludedNoun}
                </span>
              </span>
              {scoped ? (
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: OUTCOME_VIZ[outcome].light }}
                  aria-hidden
                />
              ) : (
                <>
                  {/* mini outcome bar */}
                  <span className="flex h-1.5 w-20 shrink-0 gap-px overflow-hidden rounded-full" aria-hidden>
                    {REGISTRY_OUTCOME_ORDER.map((o) =>
                      r.counts[o] > 0 ? (
                        <span
                          key={o}
                          style={{
                            width: `${(r.counts[o] / r.total) * 100}%`,
                            backgroundColor: OUTCOME_VIZ[o].light,
                          }}
                        />
                      ) : null,
                    )}
                  </span>
                  <span className="tnum shrink-0 text-xs font-medium text-[var(--color-ink-tertiary)]">
                    {soldPct}%
                  </span>
                </>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Outcome chips — national (/resultados/{outcome}) or in-province
// (/resultados/{outcome}/{provincia}).
// ---------------------------------------------------------------------------

export function OutcomeChips({
  counts,
  locale,
  provinceSlug,
}: {
  counts: OutcomeCounts;
  locale: Locale;
  provinceSlug?: string;
}) {
  const fmt = nf(locale);
  return (
    <ul className="flex flex-wrap gap-2">
      {REGISTRY_OUTCOME_ORDER.map((o) => {
        if (counts[o] <= 0) return null;
        const href = provinceSlug
          ? `/resultados/${OUTCOME_TO_SLUG[o]}/${provinceSlug}`
          : `/resultados/${OUTCOME_TO_SLUG[o]}`;
        const label = locale === 'en' ? OUTCOME_META[o].en : OUTCOME_META[o].es;
        return (
          <li key={o}>
            <Link
              href={href}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-hairline)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-action)]"
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: OUTCOME_VIZ[o].light }} aria-hidden />
              <span>{label}</span>
              <span className="tnum text-[var(--color-ink-quiet)]">{fmt(counts[o])}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Generic pill-link cluster (municipios, other provinces).
// ---------------------------------------------------------------------------

export function ChipLinks({
  items,
  locale,
}: {
  items: Array<{ href: string; label: string; count: number }>;
  locale: Locale;
}) {
  const fmt = nf(locale);
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((it) => (
        <li key={it.href}>
          <Link
            href={it.href}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-hairline)] bg-[var(--color-surface)] px-3 py-1 text-xs transition-colors hover:bg-[var(--color-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-action)]"
          >
            <span>{it.label}</span>
            <span className="tnum text-[var(--color-ink-quiet)]">({fmt(it.count)})</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export const registryOutcomeLabel = (o: RegistryOutcome, locale: Locale) =>
  locale === 'en' ? OUTCOME_META[o].en : OUTCOME_META[o].es;
