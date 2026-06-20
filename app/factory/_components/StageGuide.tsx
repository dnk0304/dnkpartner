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
  4: { label: 'Beat Competitors', explainer: "Competitor Scan — who you're up against and how you win.", icon: Swords },
  5: { label: 'Brand It', explainer: 'A sellable name and a brand voice.', icon: Tag },
  6: { label: 'Launch It', explainer: 'Where and how to sell it, ranked.', icon: Rocket },
};

/** Defensive fallback so a parked stage (7/8) never renders without a guide. */
export function guideFor(n: number, short: string) {
  return STAGE_GUIDE[n] ?? { label: short, explainer: '', icon: Compass };
}

/**
 * The ONE plain-language label for a stage — the same verb-phrase the board
 * cards show ("Find Your Market" … "Launch It"). Use this everywhere a stage is
 * named to the user (sidebar, list, announcements) so the chips and the cards
 * speak ONE vocabulary instead of two ("Brand" chip vs. "Brand It" card). Falls
 * back to the engine `short` for any unmapped (parked 7/8) stage.
 */
export function plainStageLabel(n: number, short: string): string {
  return STAGE_GUIDE[n]?.label ?? short;
}

/**
 * StageGuideExplainerGrid — the read-only "here's what the 6 stages do" grid
 * for the first-run welcome state. Same DELIBERATE fixed grid as the board
 * (6-up ≥1280 / 3-up lg / 2-up md / 1-up below, equal-height panels), so the
 * layout language matches exactly what the user sees once they have projects —
 * never side-scrolls. Pure presentation: numbered badge + icon + label +
 * explainer. No counts, no cards — this is the guide, not the live board.
 */
export function StageGuideExplainerGrid() {
  return (
    <ol
      className="grid w-full grid-cols-1 items-stretch gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
      aria-label="The 6-stage build — what each step does"
    >
      {ACTIVE_STAGES.map((stage) => {
        const guide = guideFor(stage.n, stage.short);
        const Icon = guide.icon;
        return (
          <li
            key={stage.n}
            className="flex min-h-[10rem] min-w-0 flex-col gap-2 overflow-hidden rounded-xl bg-brand-surface p-4 text-left shadow-sm ring-1 ring-brand-line"
          >
            <div className="flex items-center gap-2.5">
              <span
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-base font-extrabold tabular-nums text-brand-primary"
                aria-hidden="true"
              >
                {stage.n}
              </span>
              <Icon className="h-5 w-5 shrink-0 text-brand-primary" strokeWidth={2} aria-hidden="true" />
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
