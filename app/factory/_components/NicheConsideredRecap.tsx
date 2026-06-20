'use client';

import {
  Lightbulb,
  HeartCrack,
  AlertTriangle,
  Check,
} from 'lucide-react';
import { cn } from '../_lib/cn';
import {
  candidateOverall,
  candidateCompetition,
  SCORE_LABELS,
  type NicheCandidate,
  type CandidateScores,
} from '../_lib/types';
import { TierBadge, CompetitionPill } from './Badges';

/**
 * NicheConsideredRecap — the READ-VIEW formatting of the Stage-1 candidate set.
 *
 * WHY THIS EXISTS: the persisted `niche_candidates` artifact carries the full
 * scored candidate set (`{ candidates: NicheCandidate[] }`). On the project
 * detail page that artifact used to fall through artifactToMarkdown → mdGeneric,
 * which pretty-printed the array as a fenced ```json block — the only horizontal
 * scroll left in the app and a newcomer-confidence killer. This component
 * renders those same candidates as human cards instead (niche · product idea ·
 * pain · scores-as-meters · rationale), reusing the NichePicker card language so
 * the good picker UI is no longer invisible once a niche is selected.
 *
 * READ-ONLY: there is no "Build this one" CTA here (the selection already
 * happened). The chosen niche, when known, gets a "Picked" marker so the recap
 * reads as a record of the decision, not a fresh choice.
 *
 * No horizontal scroll at any width: a 1 → 2 → 3 fixed responsive grid, each
 * card min-w-0 so long copy wraps instead of forcing a side-scroll.
 */
export function NicheConsideredRecap({
  candidates,
  chosenNiche,
}: {
  candidates: NicheCandidate[];
  /** The niche string that was picked, if known — marks that card "Picked". */
  chosenNiche?: string;
}) {
  if (!candidates.length) {
    return (
      <p className="text-sm italic text-brand-dark/45">
        No candidate niches were recorded for this project.
      </p>
    );
  }

  const chosen = chosenNiche?.trim().toLowerCase();

  return (
    <div className="grid grid-cols-1 items-stretch gap-5 md:grid-cols-2 xl:grid-cols-3">
      {candidates.map((c) => (
        <ConsideredCard
          key={c.index}
          candidate={c}
          picked={!!chosen && c.niche.trim().toLowerCase() === chosen}
        />
      ))}
    </div>
  );
}

function ConsideredCard({
  candidate: c,
  picked,
}: {
  candidate: NicheCandidate;
  picked: boolean;
}) {
  const overall = candidateOverall(c.scores);
  const competition = candidateCompetition(c.scores);
  const flags = c.advisoryFlags ?? [];

  return (
    <article
      className={cn(
        'flex flex-col overflow-hidden rounded-2xl bg-brand-surface shadow-sm ring-1 transition-colors',
        picked ? 'ring-2 ring-brand-primary' : 'ring-brand-line',
      )}
      aria-label={picked ? `${c.niche} (picked)` : c.niche}
    >
      <div className="flex flex-1 flex-col p-5">
        {/* Top row: tier + title + competition + picked marker */}
        <div className="flex items-start gap-3">
          <TierBadge score={overall} className="mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-brand-accent">{c.niche}</h3>
              <CompetitionPill competition={competition} />
              {picked && (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-primary">
                  <Check className="h-3 w-3" aria-hidden="true" />
                  Picked
                </span>
              )}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-lg font-bold tabular-nums text-brand-accent">{overall}</div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-brand-dark/40">/ 100</div>
          </div>
        </div>

        {/* Product idea + pain area */}
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex gap-2">
            <dt className="flex shrink-0 items-center gap-1 font-medium text-brand-dark/50">
              <Lightbulb className="h-4 w-4 text-amber-500" aria-hidden="true" />
              <span className="sr-only">Product idea: </span>
              Build
            </dt>
            <dd className="text-brand-dark/80">{c.productIdea}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="flex shrink-0 items-center gap-1 font-medium text-brand-dark/50">
              <HeartCrack className="h-4 w-4 text-rose-500" aria-hidden="true" />
              <span className="sr-only">Pain area: </span>
              Pain
            </dt>
            <dd className="text-brand-dark/80">{c.painArea}</dd>
          </div>
        </dl>

        {/* The 5 sub-scores as labelled meters */}
        <div className="mt-4">
          <ScoreMeters scores={c.scores} />
        </div>

        {/* Demand evidence */}
        {c.demandEvidence && (
          <p className="mt-3 rounded-lg bg-brand-light px-3 py-2 text-xs leading-relaxed text-brand-dark/70">
            <span className="font-semibold text-brand-dark/60">Demand evidence: </span>
            {c.demandEvidence}
          </p>
        )}

        {/* Advisory flags — honest caveats, never hidden */}
        {flags.length > 0 && (
          <ul className="mt-3 space-y-1.5" aria-label="Advisory caveats">
            {flags.map((flag, i) => (
              <li
                key={i}
                role="note"
                className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
                <span>{flag}</span>
              </li>
            ))}
          </ul>
        )}

        {/* The rationale — always on screen (matches the picker). */}
        {c.rationale && (
          <div className="mt-auto pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-primary">
              The Rationale
            </p>
            <p className="mt-1.5 rounded-lg bg-brand-light p-3 text-[13px] leading-snug text-brand-dark/70">
              {c.rationale}
            </p>
          </div>
        )}
      </div>
    </article>
  );
}

/**
 * The 5 raw 1-10 sub-scores as labelled mini-bars — identical visual language to
 * the NichePicker ScoreRow so the considered recap and the live picker read as
 * one family. Color tracks value (low = rose, mid = amber, high = emerald) and
 * the number + label are always present, so meaning never rides on color alone.
 */
function ScoreMeters({ scores }: { scores: CandidateScores }) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {SCORE_LABELS.map(({ key, label, short }) => {
        const value = scores[key];
        const valid = typeof value === 'number' && Number.isFinite(value);
        const v = valid ? Math.max(0, Math.min(10, value)) : 0;
        const tone = v >= 7 ? 'bg-emerald-500' : v >= 4 ? 'bg-amber-400' : 'bg-rose-400';
        return (
          <div key={key} title={`${label}: ${valid ? `${v}/10` : 'n/a'}`}>
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] font-medium uppercase tracking-wide text-brand-dark/45">
                {short}
              </span>
              <span className="text-xs font-bold tabular-nums text-brand-dark/80">
                {valid ? v : '—'}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div
                className={cn('h-full rounded-full transition-all', tone)}
                style={{ width: `${v * 10}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
