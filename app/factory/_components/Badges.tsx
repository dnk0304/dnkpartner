'use client';

import { cn } from '../_lib/cn';
import { getTier, getCompetitionBadge } from '../_lib/types';

/**
 * TierBadge — the dnk-trends S/A/B/C gradient square, re-scaled to the factory's
 * 0-100 score. Same structure/classes as AITrends getOpportunityTier rendering.
 */
export function TierBadge({
  score,
  size = 'md',
  className,
}: {
  score: number;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const t = getTier(score);
  const dims = size === 'sm' ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-sm';
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-lg bg-gradient-to-br font-bold text-white shadow-sm',
        dims,
        t.color,
        className,
      )}
      title={`Tier ${t.tier} · score ${Math.round(score)}/100`}
      aria-label={`Tier ${t.tier}, score ${Math.round(score)} out of 100`}
    >
      {t.tier}
    </span>
  );
}

/** Numeric 0-100 score in the tier's text colour (matches AITrends score cell). */
export function ScoreValue({ score, className }: { score: number; className?: string }) {
  const t = getTier(score);
  return (
    <span className={cn('font-bold tabular-nums', t.textColor, className)}>
      {Math.round(score)}
    </span>
  );
}

/** Easy / Medium / Hard competition pill, AITrends colour language. */
export function CompetitionPill({ competition }: { competition: number }) {
  const b = getCompetitionBadge(competition);
  return (
    <span
      className={cn(
        'inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border',
        b.color,
      )}
    >
      {b.label}
    </span>
  );
}
