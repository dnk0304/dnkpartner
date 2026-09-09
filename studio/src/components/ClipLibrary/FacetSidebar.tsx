/**
 * Facet sidebar.
 *
 * Multi-select facets (comedian, quality, tag) are checkboxes — you can hold
 * several. Single-value facets map onto the API's range params and are radios:
 * laugh score is a "3 and up" floor (laugh_min), and duration is one bucket
 * (dur_min/dur_max), because the API expresses duration as a single range.
 *
 * Counts come back recounted against the *other* active filters, so a facet
 * never collapses to only what you already picked.
 */
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { cn } from '../../lib/utils';
import type {
  ClipFilters,
  ClipQuality,
  FacetBucket,
  FacetsResponse,
} from '../../types/ClipLibrary';

/** Bucket label → the range the API expects. */
export const DURATION_BUCKETS: Record<string, { dur_min?: number; dur_max?: number }> = {
  '0-10': { dur_min: 0, dur_max: 10 },
  '10-20': { dur_min: 10, dur_max: 20 },
  '20-40': { dur_min: 20, dur_max: 40 },
  '40+': { dur_min: 40 },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-t border-[var(--color-border)] px-4 py-3">
      <legend className="px-0 pb-1 text-[11px] font-semibold tracking-wide text-[var(--color-text-dim)]">
        {title}
      </legend>
      <div className="flex flex-col gap-0.5">{children}</div>
    </fieldset>
  );
}

interface RowProps {
  type: 'checkbox' | 'radio';
  name?: string;
  label: string;
  count?: number;
  checked: boolean;
  onChange: () => void;
}

/** One facet row: a real input, a label, and its remaining count. */
function Row({ type, name, label, count, checked, onChange }: RowProps) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-[var(--radius-md)] px-2 py-1 text-[13px]',
        'hover:bg-[var(--color-surface-hover)]',
        'focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-[var(--color-primary-hover)]',
        checked ? 'text-[var(--color-text)]' : 'text-[var(--color-text-muted)]'
      )}
    >
      <input
        type={type}
        name={name}
        checked={checked}
        onChange={onChange}
        className="h-3.5 w-3.5 shrink-0 accent-[var(--color-accent)]"
      />
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && (
        <span className="shrink-0 font-[var(--font-mono)] text-[11px] tabular-nums text-[var(--color-text-dim)]">
          {count.toLocaleString()}
        </span>
      )}
    </label>
  );
}

export interface FacetSidebarProps {
  facets?: FacetsResponse;
  filters: ClipFilters;
  onChange: (next: ClipFilters) => void;
}

export function FacetSidebar({ facets, filters, onChange }: FacetSidebarProps) {
  const [comedianQuery, setComedianQuery] = useState('');
  const [tagQuery, setTagQuery] = useState('');

  const toggleIn = <T extends string>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const comedians = useMemo(() => {
    const all = facets?.comedian ?? [];
    const needle = comedianQuery.trim().toLowerCase();
    return needle ? all.filter((c) => c.value.toLowerCase().includes(needle)) : all;
  }, [facets, comedianQuery]);

  const tags = useMemo(() => {
    const all = facets?.tag ?? [];
    const needle = tagQuery.trim().toLowerCase();
    return (needle ? all.filter((t) => t.value.toLowerCase().includes(needle)) : all).slice(0, 40);
  }, [facets, tagQuery]);

  const laughScores = useMemo(
    () =>
      (facets?.laugh_score ?? [])
        .filter((b): b is FacetBucket<number> => typeof b.value === 'number')
        .sort((a, b) => b.value - a.value),
    [facets]
  );

  /** Which bucket the current dur_min/dur_max pair corresponds to, if any. */
  const activeBucket = useMemo(() => {
    const entry = Object.entries(DURATION_BUCKETS).find(
      ([, r]) => r.dur_min === filters.dur_min && r.dur_max === filters.dur_max
    );
    return entry?.[0];
  }, [filters.dur_min, filters.dur_max]);

  return (
    <div className="h-full overflow-y-auto pb-8">
      <Section title="Search">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-dim)]"
            aria-hidden="true"
          />
          <input
            type="search"
            value={filters.q ?? ''}
            onChange={(e) => onChange({ ...filters, q: e.target.value || undefined })}
            placeholder="Clip id or tag"
            aria-label="Search clips by id or tag"
            className="w-full rounded-[var(--radius-md)] bg-[var(--color-surface-hover)] py-1.5 pl-7 pr-2 text-[13px] text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-primary-hover)]"
          />
        </div>
      </Section>

      <Section title="Quality">
        {(facets?.quality ?? []).map((b) => (
          <Row
            key={b.value}
            type="checkbox"
            label={b.value}
            count={b.count}
            checked={filters.quality.includes(b.value)}
            onChange={() =>
              onChange({ ...filters, quality: toggleIn<ClipQuality>(filters.quality, b.value) })
            }
          />
        ))}
      </Section>

      <Section title="Laugh score">
        <Row
          type="radio"
          name="laugh_min"
          label="Any"
          checked={filters.laugh_min === undefined}
          onChange={() => onChange({ ...filters, laugh_min: undefined })}
        />
        {laughScores.map((b) => (
          <Row
            key={b.value}
            type="radio"
            name="laugh_min"
            label={`${b.value} and up`}
            count={b.count}
            checked={filters.laugh_min === b.value}
            onChange={() => onChange({ ...filters, laugh_min: b.value })}
          />
        ))}
      </Section>

      <Section title="Duration">
        <Row
          type="radio"
          name="duration"
          label="Any"
          checked={activeBucket === undefined}
          onChange={() => onChange({ ...filters, dur_min: undefined, dur_max: undefined })}
        />
        {(facets?.duration ?? []).map((b) => (
          <Row
            key={b.value}
            type="radio"
            name="duration"
            label={b.value === '40+' ? '40s and over' : `${b.value.replace('-', '–')}s`}
            count={b.count}
            checked={activeBucket === b.value}
            onChange={() => onChange({ ...filters, ...DURATION_BUCKETS[b.value] })}
          />
        ))}
      </Section>

      <Section title="Comedian">
        {(facets?.comedian?.length ?? 0) > 8 && (
          <input
            type="search"
            value={comedianQuery}
            onChange={(e) => setComedianQuery(e.target.value)}
            placeholder="Filter comedians"
            aria-label="Filter the comedian list"
            className="mb-1 w-full rounded-[var(--radius-md)] bg-[var(--color-surface-hover)] px-2 py-1 text-[12px] text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-primary-hover)]"
          />
        )}
        {comedians.map((b) => (
          <Row
            key={b.value}
            type="checkbox"
            label={b.value}
            count={b.count}
            checked={filters.comedian.includes(b.value)}
            onChange={() => onChange({ ...filters, comedian: toggleIn(filters.comedian, b.value) })}
          />
        ))}
        {comedians.length === 0 && (
          <p className="px-2 py-1 text-[12px] text-[var(--color-text-dim)]">No comedians match.</p>
        )}
      </Section>

      <Section title="Tags">
        <input
          type="search"
          value={tagQuery}
          onChange={(e) => setTagQuery(e.target.value)}
          placeholder="Filter tags"
          aria-label="Filter the tag list"
          className="mb-1 w-full rounded-[var(--radius-md)] bg-[var(--color-surface-hover)] px-2 py-1 text-[12px] text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-primary-hover)]"
        />
        {tags.map((b) => (
          <Row
            key={b.value}
            type="checkbox"
            label={b.value}
            count={b.count}
            checked={filters.tag.includes(b.value)}
            onChange={() => onChange({ ...filters, tag: toggleIn(filters.tag, b.value) })}
          />
        ))}
        {tags.length === 0 && (
          <p className="px-2 py-1 text-[12px] text-[var(--color-text-dim)]">No tags match.</p>
        )}
      </Section>
    </div>
  );
}
