import {
  Compass,
  ClipboardList,
  Package,
  Swords,
  Tag,
  Rocket,
  type LucideIcon,
} from 'lucide-react';
import { ACTIVE_STAGES } from '../_lib/types';

/**
 * StageGuide — the single source of truth for the 6-stage pipeline's
 * newcomer-facing copy. The locked plain-language label, ≤10-word explainer,
 * and lucide icon per stage. Shared by:
 *   • KanbanBoard      — each populated/empty stage PANEL (the live board)
 *   • EmptyState       — the zero-projects / first-run welcome explainer grid
 *
 * Keeping one map means a copy change ships to both surfaces at once — a
 * first-timer (zero runs) and a returning user see exactly the same labels.
 */
export const STAGE_GUIDE: Record<
  number,
  { label: string; explainer: string; icon: LucideIcon }
> = {
  1: { label: 'Find Your Market', explainer: 'We surface real niches with painful, paying problems.', icon: Compass },
  2: { label: 'See the Build Plan', explainer: 'The full blueprint and prompts behind your product.', icon: ClipboardList },
  3: { label: 'Get the Product', explainer: 'The finished product — text or a live Excel tool.', icon: Package },
  4: { label: 'Beat Competitors', explainer: "Who you're up against and how you win.", icon: Swords },
  5: { label: 'Brand It', explainer: 'A sellable name and a brand voice.', icon: Tag },
  6: { label: 'Launch It', explainer: 'Where and how to sell it, ranked.', icon: Rocket },
};

/** Defensive fallback so a parked stage (7/8) never renders without a guide. */
export function guideFor(n: number, short: string) {
  return STAGE_GUIDE[n] ?? { label: short, explainer: '', icon: Compass };
}

/**
 * StageGuideExplainerGrid — the read-only "here's what the 6 stages do" grid
 * for the first-run welcome state. Same no-horizontal-scroll fluid grid as the
 * board (`auto-fit minmax(180px,1fr)` — wraps 6 → 3+3 → 2+2+2 → 1, never
 * side-scrolls) so the layout language matches what the user sees once they
 * have projects. Pure presentation: numbered badge + icon + label + explainer.
 * No counts, no cards — this is the guide, not the live board.
 */
export function StageGuideExplainerGrid() {
  return (
    <ol
      className="grid w-full grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4"
      aria-label="The 6-stage build — what each step does"
    >
      {ACTIVE_STAGES.map((stage) => {
        const guide = guideFor(stage.n, stage.short);
        const Icon = guide.icon;
        return (
          <li
            key={stage.n}
            className="flex min-w-0 flex-col gap-2 overflow-hidden rounded-xl bg-brand-surface p-4 text-left shadow-sm ring-1 ring-brand-line"
          >
            <div className="flex items-center gap-2">
              <span
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-sm font-bold text-brand-primary"
                aria-hidden="true"
              >
                {stage.n}
              </span>
              <Icon className="h-4 w-4 shrink-0 text-brand-primary" aria-hidden="true" />
            </div>
            <div>
              <h3 className="truncate text-sm font-semibold text-brand-accent">{guide.label}</h3>
              <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-brand-dark/70">
                {guide.explainer}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
