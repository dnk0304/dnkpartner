'use client';

import { useState } from 'react';
import { Flame, ArrowUp, ArrowDown, Star } from 'lucide-react';
import { cn } from '../_lib/cn';
import { type ScoredAngle } from '../_lib/types';
import { TierBadge, ScoreValue, CompetitionPill } from './Badges';

/**
 * ScoredRanking — "the ranking we use there", ported. The dnk-trends
 * OpportunitiesView table re-skinned for the factory's real scored angles:
 * gradient tier badge column, angle name, Easy/Medium/Hard competition pill,
 * numeric 0-100 score with click-to-sort headers (default score desc).
 *
 * Renders nothing if there are no scored angles — we never fabricate a ranking.
 */
type SortKey = 'score' | 'competition';

export function ScoredRanking({ angles }: { angles: ScoredAngle[] }) {
  const [sortBy, setSortBy] = useState<SortKey>('score');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');

  if (!angles.length) return null;

  const sorted = [...angles].sort((a, b) => {
    const dir = order === 'asc' ? 1 : -1;
    return (a[sortBy] - b[sortBy]) * dir;
  });

  function toggle(key: SortKey) {
    if (sortBy === key) setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(key);
      setOrder('desc');
    }
  }

  const renderSortHead = (label: string, k: SortKey) => (
    <th
      className="cursor-pointer select-none px-4 py-2.5 text-right font-medium text-amber-700 hover:text-amber-900"
      onClick={() => toggle(k)}
      aria-sort={sortBy === k ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span className="flex items-center justify-end gap-1">
        {label}
        {sortBy === k &&
          (order === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </span>
    </th>
  );

  return (
    <div className="overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50">
            <tr>
              <th className="w-14 px-4 py-2.5 text-center font-medium text-amber-700">Tier</th>
              <th className="px-4 py-2.5 font-medium text-amber-700">Angle</th>
              <th className="px-4 py-2.5 text-right font-medium text-amber-700">Competition</th>
              {renderSortHead('Score', 'score')}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map((a) => (
              <tr key={a.name} className="transition-colors hover:bg-amber-50/50">
                <td className="px-4 py-2.5 text-center">
                  <TierBadge score={a.score} size="sm" />
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    {a.recommended ? (
                      <Star className="h-4 w-4 shrink-0 fill-amber-400 text-amber-500" aria-label="Recommended" />
                    ) : (
                      <Flame className="h-4 w-4 shrink-0 text-orange-400/70" aria-hidden="true" />
                    )}
                    <span className="font-medium text-gray-900">{a.name}</span>
                    {a.recommended && (
                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                        Recommended
                      </span>
                    )}
                  </div>
                  {a.demandEvidence && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{a.demandEvidence}</p>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <CompetitionPill competition={a.competition} />
                </td>
                <td className="px-4 py-2.5 text-right">
                  <span className="inline-flex items-baseline gap-0.5">
                    <ScoreValue score={a.score} className="text-lg" />
                    <span className="text-xs text-gray-400">/100</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-amber-100 bg-amber-50/40 px-4 py-2 text-[11px] text-amber-700/80">
        <span className={cn('font-medium')}>Tier band:</span> S ≥ 80 · A ≥ 65 · B ≥ 50 · C &lt; 50
        (re-scaled to the factory&apos;s 0–100 score)
      </p>
    </div>
  );
}
