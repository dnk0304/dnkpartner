/**
 * Ken diagnostic: run ONE stage's gate loop directly with full visibility into
 * each round's verdicts + the fix-loop, to locate where stage 1 hangs.
 * Harness-only. Logs every expert verdict + each produce/fix call boundary.
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const childProcess = require('node:child_process');
const realSpawn = childProcess.spawn.bind(childProcess);
let seq = 0;
// @ts-expect-error monkey-patch
childProcess.spawn = function (cmd: string, args: readonly string[], opts: unknown) {
  const isClaude = typeof cmd === 'string' && /claude(\.cmd|\.bat)?$/i.test(cmd);
  // @ts-expect-error passthrough
  if (!isClaude) return realSpawn(cmd, args, opts);
  const n = ++seq;
  const t0 = Date.now();
  console.log(`  [spawn #${n}] claude launched @ ${new Date().toISOString()}`);
  // @ts-expect-error passthrough
  const c = realSpawn(cmd, args, opts);
  c.on('close', (code: number) => console.log(`  [spawn #${n}] closed code=${code} in ${Date.now() - t0}ms`));
  return c;
};

const stageN = Number(process.argv[2] ?? '1');
// @ts-expect-error ts ext
const { produceStageArtifact } = await import('../lib/factory/producers.ts');
// @ts-expect-error ts ext
const { loadExpertPrompt } = await import('../lib/factory/experts.ts');
// @ts-expect-error ts ext
const { PersonaRunner } = await import('../lib/factory/personaRunner.ts');
// @ts-expect-error ts ext
const { getStage } = await import('../lib/factory/types.ts');

const SEED = 'A printable Divorce Organizer / paperwork-and-checklist toolkit that helps a person going through divorce track documents, deadlines, finances, custody logistics, and emotional/legal milestones in one calm, structured system.';

async function main() {
  const stage = getStage(stageN);
  console.log(`=== GATE PROBE stage ${stageN} (${stage.name}) ceiling=${stage.fixCeiling} ===`);
  const runner = new PersonaRunner();
  const prompts = stage.experts.map((e: { slug: string }) => ({ slug: e.slug, system: loadExpertPrompt(stageN, e.slug) }));

  console.log('--- PRODUCE (initial) ---');
  let artifact = await produceStageArtifact({ stage: stageN, seed: SEED, priorArtifacts: {} });
  console.log('produced keys:', Object.keys(artifact as object));

  for (let loop = 1; loop <= stage.fixCeiling; loop++) {
    console.log(`\n--- LOOP ${loop}: ROUND 1 (independent) ---`);
    const ctx = { stage: stageN, seed: SEED, artifact, priorArtifacts: {} };
    const round1 = [];
    for (const p of prompts) {
      const v = await runner.round1(p.system, p.slug, ctx);
      console.log(`  R1 ${p.slug}: ${v.verdict}  deltas=${v.deltas.length}  reasons="${(v.reasons[0] || '').slice(0, 80)}"`);
      round1.push(v);
    }
    console.log(`--- LOOP ${loop}: ROUND 2 (adversarial) ---`);
    const round2 = [];
    for (const p of prompts) {
      const own = round1.find((v: { expert: string }) => v.expert === p.slug)!;
      const peers = round1.filter((v: { expert: string }) => v.expert !== p.slug);
      const c = await runner.round2(p.system, p.slug, ctx, own, peers);
      console.log(`  R2 ${p.slug}: challenged=${c.challengeAttempted} revised=${c.revisedVerdict ?? '-'} deltas=${c.deltas.length} note="${(c.note || '').slice(0, 80)}"`);
      round2.push(c);
    }
    // resolve
    const fail = round1.some((v: { expert: string; verdict: string }) => {
      const ch = round2.find((c: { expert: string }) => c.expert === v.expert);
      const eff = ch?.revisedVerdict ?? v.verdict;
      return eff === 'FAIL' || (ch && ch.deltas.some((d: string) => d.trim()));
    });
    console.log(`  >> resolution: ${fail ? 'FIX (re-produce)' : 'PASS'}`);
    if (!fail) { console.log('GATE PASSED at loop', loop); return; }
    if (loop === stage.fixCeiling) { console.log('ESCALATE (ceiling hit)'); return; }
    const deltas = [...new Set(round1.flatMap((v: { deltas: string[] }) => v.deltas).concat(round2.flatMap((c: { deltas: string[] }) => c.deltas)).filter((d: string) => d.trim()))];
    console.log(`--- PRODUCE (fix, ${deltas.length} deltas) ---`);
    artifact = await produceStageArtifact({ stage: stageN, seed: SEED, priorArtifacts: {}, fixDeltas: deltas });
    console.log('re-produced keys:', Object.keys(artifact as object));
  }
}
main().catch((e) => { console.error('PROBE ERROR:', e instanceof Error ? e.message : e); process.exit(1); });
