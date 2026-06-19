// Pixel — niche-picker render fixture. Seeds a run into `awaiting_selection`
// with a `niche_candidates` artifact in the EXACT wire shape serializeRun reads
// (candidates[].scores 1-10, advisoryFlags present on some). NOT production
// data — a UI fixture so the Stage-1 niche-picker render + select path can be
// screenshotted deterministically (brief §0 mockup-first). Idempotent: replaces
// any prior fixture run with the same hint.
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

const HINT = 'divorce & family admin';
const NICHE_CANDIDATES_KIND = 'niche_candidates';

// Exact NicheCandidate[] shape (lib/factory/producers.ts), scores 1-10.
const candidates = [
  {
    index: 0,
    niche: 'People mid-divorce drowning in document & deadline chaos',
    productIdea:
      'A printable Divorce Document & Deadline Command Center — every filing, financial disclosure, and court date in one tracked system.',
    painArea:
      'Newly-separated people miss court deadlines and lose paperwork during the most stressful months of their life — there is no single place to keep it all.',
    scores: { pain: 9, worsening: 8, purchasingPower: 7, speedToValue: 9, competitionGap: 8 },
    demandEvidence:
      'r/Divorce threads repeatedly ask "how do I keep track of everything"; Etsy divorce-planner listings under-serve deadlines and sell steadily at $12–25.',
    rationale:
      'Sharpest, most time-bound pain in the set with a real differentiation gap: free checklists exist but none integrate deadlines, finances, and documents. Highest speed-to-value — usable the day it is bought.',
    advisoryFlags: [],
  },
  {
    index: 1,
    niche: 'Co-parents juggling custody logistics across two households',
    productIdea:
      'A Co-Parenting Custody Logistics Kit — schedule templates, expense splits, and a shared handoff log for two-household families.',
    painArea:
      'Custody handoffs, schedule swaps, and shared expenses cause constant friction and forgotten details between separated parents.',
    scores: { pain: 8, worsening: 6, purchasingPower: 6, speedToValue: 7, competitionGap: 6 },
    demandEvidence:
      'Custody-schedule templates sell consistently on Etsy but are thin single-sheets; buyers in reviews ask for an integrated kit.',
    rationale:
      'Durable, recurring pain that outlasts the divorce itself. Slightly more crowded than the command-center angle, so the wedge is integration, not novelty.',
    advisoryFlags: ['Several top competitors already bundle expense-splitting — verify the integration wedge is defensible before building.'],
  },
  {
    index: 2,
    niche: 'Recently-separated adults untangling shared finances',
    productIdea:
      'A Divorce Financial Untangling Workbook — asset inventory, account-separation checklist, and a post-split budget builder.',
    painArea:
      'Splitting accounts, debts, and assets is overwhelming and high-stakes; generic budget tools do not speak to the divorce context.',
    scores: { pain: 7, worsening: 5, purchasingPower: 8, speedToValue: 5, competitionGap: 5 },
    demandEvidence:
      'Asset-split anxiety is high in divorce forums; existing finance workbooks are generic, not divorce-specific. Strong willingness to pay.',
    rationale:
      'Highest purchasing power in the set — money pain converts. Lower speed-to-value (it requires real input work) and a more contested gap pull the overall down.',
    advisoryFlags: [
      'Demand evidence leans on a general "finance anxiety" signal rather than a divorce-specific search trend — treat the score as estimated.',
    ],
  },
  {
    index: 3,
    niche: 'Parents explaining divorce to young children',
    productIdea:
      'A "Telling the Kids" Conversation Kit — age-banded scripts, a feelings workbook for children, and a co-parent alignment sheet.',
    painArea:
      'Parents agonise over how to tell their kids and have nothing structured to guide a hard, one-shot conversation.',
    scores: { pain: 8, worsening: 4, purchasingPower: 5, speedToValue: 6, competitionGap: 7 },
    demandEvidence:
      'Therapist blogs and parenting forums field this question constantly; few productised, non-clinical kits exist at this price point.',
    rationale:
      'Deep emotional pain with an open gap, but a narrow, one-time use window and softer monetisation than the logistics angles.',
    advisoryFlags: [],
  },
  {
    index: 4,
    niche: 'People rebuilding their identity & admin after divorce',
    productIdea:
      'A Post-Divorce Fresh-Start Organizer — name-change checklist, account-update tracker, and a 90-day rebuild planner.',
    painArea:
      'After the decree, dozens of small admin tasks (name changes, beneficiaries, logins) pile up with no checklist to close them out.',
    scores: { pain: 5, worsening: 3, purchasingPower: 4, speedToValue: 4, competitionGap: 3 },
    demandEvidence:
      'Name-change checklists are a saturated free-PDF category; weak differentiation and lower willingness to pay.',
    rationale:
      'Real but mild pain in a crowded, mostly-free category. Included for honesty — it is the weakest candidate and the scores say so.',
    advisoryFlags: [
      'Competition gap is low: this overlaps heavily with free name-change PDFs. Likely a C-tier build unless a sharper wedge is found.',
    ],
  },
];

const payload = { hint: HINT, hintProvided: true, candidates };

// Replace any prior fixture run for this hint (idempotent).
const prior = await db.run.findMany({ where: { hint: HINT } });
for (const r of prior) {
  await db.run.delete({ where: { id: r.id } });
}

const run = await db.run.create({
  data: { seed: HINT, hint: HINT, stage: 1, status: 'awaiting_selection' },
});
await db.factoryArtifact.create({
  data: { runId: run.id, stage: 1, kind: NICHE_CANDIDATES_KIND, payload },
});

console.log('FIXTURE OK — run', run.id, 'awaiting_selection with', candidates.length, 'candidates.');
console.log('RUN_ID=' + run.id);
await db.$disconnect();
