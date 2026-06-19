/**
 * Ken dispatch #10 gate-capture probe (READ-ONLY, no DB writes).
 * Runs ONLY stage-1 producer + round1 + round2 + resolveRound ONCE (no fix loop,
 * no transaction) and dumps the full verdict/challenge/severity TEXT so we can
 * judge sonnet's critique sharpness and whether the new gate passes loop 1.
 * Serial spawn (peak concurrency 1) to respect the shared rate cap.
 *
 *   node --env-file=.env.local --experimental-strip-types \
 *     --import ./scripts/factory-alias-loader-register.mjs scripts/_ken_gatecap.ts
 */
import { createRequire } from 'node:module';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';

const require = createRequire(import.meta.url);
const childProcess = require('node:child_process');
const realSpawn = childProcess.spawn.bind(childProcess);

let callSeq = 0;
const spawnQueue: Array<() => void> = [];
let serialBusy = false;
const CALL_DELAY_MS = Number(process.env.FACTORY_CALL_DELAY_MS ?? 3000);
function pump() { if (serialBusy) return; const n = spawnQueue.shift(); if (!n) return; serialBusy = true; n(); }
function release() { setTimeout(() => { serialBusy = false; pump(); }, CALL_DELAY_MS); }

class DeferredChild extends EventEmitter {
  stdout = new PassThrough(); stderr = new PassThrough();
  private realChild: import('node:child_process').ChildProcess | null = null;
  private killedEarly: NodeJS.Signals | number | undefined | false = false;
  attachReal(child: import('node:child_process').ChildProcess) {
    this.realChild = child;
    if (this.killedEarly !== false) child.kill(this.killedEarly as NodeJS.Signals);
    child.stdout?.pipe(this.stdout); child.stderr?.pipe(this.stderr);
    child.on('error', (e) => this.emit('error', e));
    child.on('close', (c, s) => this.emit('close', c, s));
  }
  kill(sig?: NodeJS.Signals | number) { if (this.realChild) return this.realChild.kill(sig); this.killedEarly = sig ?? 'SIGTERM'; return true; }
}

// @ts-expect-error monkey-patch
childProcess.spawn = function (command: string, args: readonly string[], options: unknown) {
  const isClaude = typeof command === 'string' && /claude(\.cmd|\.bat|\.exe)?$/i.test(command);
  // @ts-expect-error passthrough
  if (!isClaude) return realSpawn(command, args, options);
  const proxy = new DeferredChild();
  const opts = (options && typeof options === 'object') ? { ...(options as object) } : {};
  (opts as { stdio?: unknown }).stdio = ['ignore', 'pipe', 'pipe'];
  spawnQueue.push(() => {
    const t0 = Date.now(); const seq = ++callSeq;
    // @ts-expect-error passthrough
    const child = realSpawn(command, args, opts);
    child.on('close', (code: number) => {
      console.log(`[call #${seq}] ${((Date.now() - t0) / 1000).toFixed(1)}s exit=${code}`);
      release();
    });
    proxy.attachReal(child);
  });
  queueMicrotask(pump);
  return proxy;
};

// @ts-expect-error runtime .ts
const { produceStageArtifact } = await import('../lib/factory/producers.ts');
// @ts-expect-error runtime .ts
const { loadExpertPrompt } = await import('../lib/factory/experts.ts');
// @ts-expect-error runtime .ts
const { PersonaRunner } = await import('../lib/factory/personaRunner.ts');
// @ts-expect-error runtime .ts
const { getStage } = await import('../lib/factory/types.ts');
// @ts-expect-error runtime .ts
const { resolveRound } = await import('../lib/factory/gate.ts');

const SEED = 'A printable Divorce Organizer / paperwork-and-checklist toolkit that helps a person going through divorce track documents, deadlines, finances, custody logistics, and emotional/legal milestones in one calm, structured system.';

async function main() {
  console.log('=== GATE-CAPTURE PROBE (stage 1, loop-1 only, no DB) sonnet ===');
  console.log(`model=${process.env.FACTORY_EXPERT_MODEL}`);
  const stage = getStage(1);
  const prompts = stage.experts.map((e: { slug: string }) => ({ slug: e.slug, system: loadExpertPrompt(1, e.slug) }));
  const runner = new PersonaRunner();
  const t0 = Date.now();

  console.log('\n-- producing stage-1 artifact --');
  const artifact = await produceStageArtifact({ stage: 1, seed: SEED, priorArtifacts: {} });
  const ctx = { stage: 1, seed: SEED, artifact, priorArtifacts: {} };

  console.log('\n-- ROUND 1 (independent) --');
  const round1 = await Promise.all(prompts.map((p: { system: string; slug: string }) => runner.round1(p.system, p.slug, ctx)));

  console.log('\n-- ROUND 2 (adversarial) --');
  const round2 = await Promise.all(prompts.map((p: { system: string; slug: string }) => {
    const own = round1.find((v: { expert: string }) => v.expert === p.slug)!;
    const peers = round1.filter((v: { expert: string }) => v.expert !== p.slug);
    return runner.round2(p.system, p.slug, ctx, own, peers);
  }));

  const resolved = resolveRound(round1, round2);

  console.log(`\n========== RESULT (wall ${((Date.now() - t0) / 1000).toFixed(1)}s) ==========`);
  console.log(`GATE resolveRound: passed=${resolved.passed} blockingDeltas=${resolved.fixDeltas.length} minorDeltas=${(resolved.minorDeltas ?? []).length}`);

  console.log('\n--- ROUND 1 VERDICTS ---');
  for (const v of round1) {
    console.log(`\n[${v.expert}] ${v.verdict}`);
    (v.reasons ?? []).forEach((r: string, i: number) => console.log(`  reason${i + 1}: ${r}`));
    (v.deltas ?? []).forEach((d: string, i: number) => console.log(`  delta${i + 1}: ${d}`));
  }
  console.log('\n--- ROUND 2 CHALLENGES (severity is the new field) ---');
  for (const c of round2) {
    console.log(`\n[${c.expert}] challenged=${c.challengeAttempted} severity=${c.severity ?? '(none→minor)'}${c.revisedVerdict ? ' revised=' + c.revisedVerdict : ''}`);
    if (c.note) console.log(`  note: ${c.note}`);
    (c.deltas ?? []).forEach((d: string, i: number) => console.log(`  delta${i + 1}: ${d}`));
  }
  console.log('\n--- RESOLVED DELTAS ---');
  console.log('BLOCKING:', JSON.stringify(resolved.fixDeltas));
  console.log('MINOR:', JSON.stringify(resolved.minorDeltas ?? []));
}

main().then(() => process.exit(0)).catch((e) => { console.error('PROBE ERROR:', e instanceof Error ? e.stack : e); process.exit(1); });
