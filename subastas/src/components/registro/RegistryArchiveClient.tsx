'use client';

/**
 * RegistryArchiveClient — the filterable archive on /resultados.
 *
 * SSR-seeded: the page passes `initial` (server-read first page), which this
 * component renders on first paint — so the concluded-detail <a href> links are
 * in the server HTML (crawlable) even though filtering is client-side. Query
 * params are deliberately NOT written to the URL (robots.txt disallows `/*?`,
 * so the crawl surface is the path-based region pages, not filtered querystrings).
 *
 * Filters (outcome / category / province / sort) re-query /api/registro/list;
 * "Cargar más" appends the next page. Loading / empty / error states handled.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ResultadoRow } from './ResultadoRow';
import type { Locale, RegistroListItem, ArchiveCopy, RegistryOutcome } from '@/lib/registro/registro-ui';

export interface ArchiveOption {
  value: string;
  label: string;
}

export interface ArchiveInitial {
  items: RegistroListItem[];
  total: number;
  page: number;
  totalPages: number;
}

export interface ArchiveFilters {
  outcome?: RegistryOutcome | '';
  category?: string;
  province?: string;
}

const PAGE_SIZE = 24;

export function RegistryArchiveClient({
  initial,
  locale,
  copy,
  outcomeOptions,
  categoryOptions,
  provinceOptions,
  lockedProvince,
  lockedOutcome,
}: {
  initial: ArchiveInitial;
  locale: Locale;
  copy: ArchiveCopy;
  outcomeOptions: ArchiveOption[];
  categoryOptions: ArchiveOption[];
  provinceOptions: ArchiveOption[];
  /** Region pages lock the province filter (and hide the control). */
  lockedProvince?: string;
  lockedOutcome?: RegistryOutcome;
}) {
  const [outcome, setOutcome] = useState<string>(lockedOutcome ?? '');
  const [category, setCategory] = useState<string>('');
  const [province, setProvince] = useState<string>(lockedProvince ?? '');
  const [sort, setSort] = useState<string>('recent');

  const [items, setItems] = useState<RegistroListItem[]>(initial.items);
  const [total, setTotal] = useState<number>(initial.total);
  const [page, setPage] = useState<number>(initial.page);
  const [totalPages, setTotalPages] = useState<number>(initial.totalPages);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  // Skip the fetch on the very first render — the SSR `initial` already covers
  // the default filter state, and re-fetching it would waste a request + risk a
  // hydration flash.
  const isFirst = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  const buildQuery = useCallback(
    (nextPage: number) => {
      const sp = new URLSearchParams();
      if (outcome) sp.set('outcome', outcome);
      if (category) sp.set('category', category);
      if (province) sp.set('province', province);
      if (sort) sp.set('sort', sort);
      sp.set('page', String(nextPage));
      sp.set('pageSize', String(PAGE_SIZE));
      return sp.toString();
    },
    [outcome, category, province, sort],
  );

  const fetchPage = useCallback(
    async (nextPage: number, append: boolean) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setLoading(true);
      setError(false);
      try {
        const res = await fetch(`/api/registro/list?${buildQuery(nextPage)}`, { signal: ac.signal });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        setItems((prev) => (append ? [...prev, ...(data.items ?? [])] : data.items ?? []));
        setTotal(data.total ?? 0);
        setPage(data.page ?? nextPage);
        setTotalPages(data.totalPages ?? 0);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setError(true);
      } finally {
        setLoading(false);
      }
    },
    [buildQuery],
  );

  // Re-query from page 1 whenever a filter/sort changes.
  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    fetchPage(1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcome, category, province, sort]);

  const nf = (n: number) => n.toLocaleString(locale === 'en' ? 'en-US' : 'es-ES');
  const canLoadMore = page < totalPages && !loading;

  const selectCls =
    'h-9 rounded-[var(--radius-md)] border border-[var(--color-hairline)] bg-[var(--color-surface)] px-2.5 text-sm text-[var(--color-ink-primary)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-action)]';

  return (
    <div>
      {/* Filter row */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {!lockedOutcome ? (
          <label className="flex items-center gap-1.5 text-xs text-[var(--color-ink-tertiary)]">
            <span className="sr-only sm:not-sr-only">{copy.filterOutcome}</span>
            <select
              className={selectCls}
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              aria-label={copy.filterOutcome}
            >
              <option value="">{copy.filterAll}</option>
              {outcomeOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="flex items-center gap-1.5 text-xs text-[var(--color-ink-tertiary)]">
          <span className="sr-only sm:not-sr-only">{copy.filterCategory}</span>
          <select
            className={selectCls}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label={copy.filterCategory}
          >
            <option value="">{copy.filterAll}</option>
            {categoryOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        {!lockedProvince ? (
          <label className="flex items-center gap-1.5 text-xs text-[var(--color-ink-tertiary)]">
            <span className="sr-only sm:not-sr-only">{copy.filterProvince}</span>
            <select
              className={selectCls}
              value={province}
              onChange={(e) => setProvince(e.target.value)}
              aria-label={copy.filterProvince}
            >
              <option value="">{copy.filterAll}</option>
              {provinceOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="ml-auto flex items-center gap-1.5 text-xs text-[var(--color-ink-tertiary)]">
          <span className="sr-only sm:not-sr-only">{copy.filterSort}</span>
          <select
            className={selectCls}
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label={copy.filterSort}
          >
            <option value="recent">{copy.sortRecent}</option>
            <option value="price_desc">{copy.sortPriceDesc}</option>
            <option value="price_asc">{copy.sortPriceAsc}</option>
          </select>
        </label>
      </div>

      <p className="tnum mb-3 text-xs text-[var(--color-ink-quiet)]" aria-live="polite">
        {nf(total)} {copy.resultsLabel}
      </p>

      {error ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-hairline)] bg-[var(--color-surface-muted)] p-6 text-center text-sm text-[var(--color-ink-tertiary)]">
          {copy.errorLoading}
        </div>
      ) : items.length === 0 && !loading ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-hairline)] bg-[var(--color-surface-muted)] p-8 text-center text-sm text-[var(--color-ink-tertiary)]">
          {copy.empty}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <ResultadoRow key={item.id} item={item} locale={locale} />
          ))}
        </ul>
      )}

      <div className="mt-5 flex items-center justify-center">
        {canLoadMore ? (
          <button
            type="button"
            onClick={() => fetchPage(page + 1, true)}
            className="inline-flex h-10 items-center rounded-[var(--radius-md)] border border-[var(--color-hairline)] bg-[var(--color-surface)] px-5 text-sm font-medium text-[var(--color-ink-primary)] transition-colors hover:bg-[var(--color-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-action)]"
          >
            {copy.loadMore}
          </button>
        ) : loading ? (
          <span className="text-sm text-[var(--color-ink-quiet)]">{copy.loading}</span>
        ) : null}
      </div>
    </div>
  );
}
