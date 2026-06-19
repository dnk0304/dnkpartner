// Pixel — render-proof fixture. Inserts a real-SHAPED niche_brief artifact +
// a 3-expert gateLog onto an existing run so the /factory detail drawer's
// verdict + scored-ranking render path can be verified live while the engine's
// artifact persistence is still in flight. NOT production data — a UI fixture.
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

const runId = process.argv[2];
if (!runId) { console.error('usage: node _pixel_render_fixture.mjs <runId>'); process.exit(1); }

const run = await db.run.findUnique({ where: { id: runId } });
if (!run) { console.error('run not found'); process.exit(1); }

// Stage-1 niche_brief — exact producer shape (angles[].scores 1-10).
const payload = {
  refinedNiche:
    'A calm, structured printable Divorce Organizer for people navigating divorce — documents, deadlines, finances, custody logistics in one system.',
  recommendedAngle: 'Document & Deadline Command Center',
  reasoning:
    'Highest pain + worsening with a real differentiation gap vs scattered free checklists.',
  angles: [
    { name: 'Document & Deadline Command Center',
      scores: { pain: 9, worsening: 8, purchasingPower: 7, speedToValue: 9, competitionGap: 8 },
      demandEvidence: 'Reddit r/Divorce threads repeatedly ask "how do I keep track of everything"; Etsy divorce-planner listings under-serve deadlines.' },
    { name: 'Co-Parenting Custody Logistics Kit',
      scores: { pain: 8, worsening: 6, purchasingPower: 6, speedToValue: 7, competitionGap: 6 },
      demandEvidence: 'Custody-schedule templates sell steadily but are thin; buyers want an integrated kit.' },
    { name: 'Divorce Financial Untangling Workbook',
      scores: { pain: 7, worsening: 5, purchasingPower: 8, speedToValue: 5, competitionGap: 5 },
      demandEvidence: 'Asset-split anxiety is high; existing finance workbooks are generic, not divorce-specific.' },
    { name: 'Emotional Milestone Journal',
      scores: { pain: 5, worsening: 4, purchasingPower: 4, speedToValue: 4, competitionGap: 3 },
      demandEvidence: 'Saturated journaling category; weak differentiation and lower willingness to pay.' },
  ],
};

await db.factoryArtifact.create({
  data: { runId, stage: 1, kind: 'niche_brief', payload },
});

// One gate loop — round1 (3 distinct experts) + round2 challenges.
const round1 = [
  { expert: 'demand-data-analyst', verdict: 'PASS',
    reasons: ['Each angle cites a concrete, plausible demand signal.', 'No fabricated round numbers.'], deltas: [] },
  { expert: 'saturation-competition-specialist', verdict: 'FAIL',
    reasons: ['Emotional Milestone Journal sits in a saturated category.'],
    deltas: ['Drop or re-position the journal angle — competitionGap is too low to defend.'] },
  { expert: 'buyer-psychology-pain-specialist', verdict: 'PASS',
    reasons: ['Recommended angle maps to the sharpest, most time-bound pain (deadlines).'], deltas: [] },
];
const round2 = [
  { expert: 'demand-data-analyst', challengeAttempted: true,
    note: 'Tried to break the saturation FAIL — could not; the journal angle is genuinely weak.',
    deltas: [], severity: 'minor' },
  { expert: 'saturation-competition-specialist', challengeAttempted: true,
    note: 'Holding the FAIL: free PDFs already cover journaling; no defensible wedge.',
    revisedVerdict: 'FAIL', deltas: ['Cut the journal angle from the recommended set.'], severity: 'blocking' },
  { expert: 'buyer-psychology-pain-specialist', challengeAttempted: true,
    note: 'Agree with dropping the journal; the command-center angle carries the brief.',
    deltas: [], severity: 'minor' },
];

await db.gateLog.create({
  data: { runId, stage: 1, loop: 1, round1, round2, resolution: 'fix' },
});

console.log('FIXTURE OK — run', runId, 'now has 1 niche_brief artifact + 1 gateLog (3 experts).');
await db.$disconnect();
