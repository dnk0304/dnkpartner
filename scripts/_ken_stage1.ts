/**
 * Ken proving-run driver (2026-06-18): drives the cited run through EXACTLY ONE
 * stage gate, then STOPS at the first stopping point (human gate / escalate /
 * draft_ready). Reuses the serial-spawn + backoff machinery from
 * factory-fullrun-resume.ts. Does NOT auto-approve gates — Dennis wants to see
 * stage 1 land and inspect the gate verdicts before continuing.
 *
 * Run:
 *   node --env-file=.env.local --experimental-strip-types \
 *     --import ./scripts/factory-alias-loader-register.mjs \
 *     scripts/_ken_stage1.ts <RUN_ID>
 */
import { createRequire } from 'node:module';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';

const require = createRequire(import.meta.url);
const childProcess = require('node:child_process');

interface CallRec { n: number; ms: number; ok: boolean; rateLimited: boolean; note: string; }
const calls: CallRec[] = [];
let callSeq = 0;
let rateCapHits = 0;
let liveCount = 0;
let peakConcurrency = 0;

const realSpawn = childProcess.spawn.bind(childProcess);
type QueueTask = () => void;
const spawnQueue: QueueTask[] = [];
let serialBusy = false;
const CALL_DELAY_MS = Number(process.env.FACTORY_CALL_DELAY_MS ?? 8000);

function pumpQueue() {
  if (serialBusy) return;
  const next = spawnQueue.shift();
  if (!next) return;
  serialBusy = true;
  next();
}
function releaseAfterDelay() {
  setTimeout(() => { serialBusy = false; pumpQueue(); }, CALL_DELAY_MS);
}

class DeferredChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  private realChild: import('node:child_process').ChildProcess | null = null;
  private killedEarly: NodeJS.Signals | number | undefined | false = false;
  attachReal(child: import('node:child_process').ChildProcess) {
    this.realChild = child;
    if (this.killedEarly !== false) child.kill(this.killedEarly as NodeJS.Signals);
    child.stdout?.pipe(this.stdout);
    child.stderr?.pipe(this.stderr);
    child.on('error', (err) => this.emit('error', err));
    child.on('close', (code, signal) => this.emit('close', code, signal));
  }
  kill(signal?: NodeJS.Signals | number): boolean {
    if (this.realChild) return this.realChild.kill(signal);
    this.killedEarly = signal ?? 'SIGTERM';
    return true;
  }
}

// @ts-expect-error -- monkey-patch
childProcess.spawn = function patchedSpawn(command: string, args: readonly string[], options: unknown) {
  const isClaude = typeof command === 'string' && /claude(\.cmd|\.bat|\.exe)?$/i.test(command);
  if (!isClaude) {
    // @ts-expect-error passthrough
    return realSpawn(command, args, options);
  }
  const proxy = new DeferredChild();
  const opts = (options && typeof options === 'object') ? { ...(options as object) } : {};
  (opts as { stdio?: unknown }).stdio = ['ignore', 'pipe', 'pipe'];
  spawnQueue.push(() => {
    const t0 = Date.now();
    const seq = ++callSeq;
    liveCount++;
    if (liveCount > peakConcurrency) peakConcurrency = liveCount;
    // @ts-expect-error passthrough
    const child = realSpawn(command, args, opts);
    let stdoutBuf = '';
    child.stdout?.on('data', (d: Buffer) => { if (stdoutBuf.length < 2_000_000) stdoutBuf += d.toString(); });
    child.on('close', (code: number) => {
      liveCount--;
      const ms = Date.now() - t0;
      let rateLimited = false;
      let note = `exit=${code}`;
      const low = stdoutBuf.toLowerCase();
      if (low.includes('rate limit') || low.includes('rate_limit') || low.includes('overloaded') ||
          low.includes('429') || low.includes('usage limit') || low.includes('too many requests')) {
        rateLimited = true; rateCapHits++; note += ' RATE-CAP-SIGNAL';
      }
      calls.push({ n: seq, ms, ok: code === 0, rateLimited, note });
      console.log(`[call #${seq}] ${(ms / 1000).toFixed(1)}s exit=${code}${rateLimited ? ' RATE-CAP' : ''}`);
      releaseAfterDelay();
    });
    proxy.attachReal(child);
  });
  queueMicrotask(pumpQueue);
  return proxy;
};

// @ts-expect-error runtime .ts
const { db } = await import('../lib/db.ts');
// @ts-expect-error runtime .ts
const { advanceOneStage } = await import('../lib/factory/runner.ts');
// @ts-expect-error runtime .ts
const { getStage } = await import('../lib/factory/types.ts');

const RUN_ID = process.argv[2];
if (!RUN_ID) throw new Error('Usage: _ken_stage1.ts <RUN_ID>');

async function main() {
  console.log('=== KEN STAGE-1 PROVING DRIVER (serial, stops at first gate) ===');
  console.log(`backend=${process.env.FACTORY_LLM_BACKEND ?? 'local-cli'} CALL_DELAY_MS=${CALL_DELAY_MS}`);
  const target = await db.run.findUnique({ where: { id: RUN_ID } });
  if (!target) throw new Error(`Run ${RUN_ID} not found.`);
  console.log(`Driving run ${target.id} status=${target.status} stage=${target.stage}`);
  console.log(`seed: ${target.seed.slice(0, 110)}...\n`);

  const t0 = Date.now();
  let current = await db.run.findUniqueOrThrow({ where: { id: target.id } });

  if (current.status !== 'running') {
    console.log(`Run not in 'running' state (is ${current.status}) — nothing to drive in stage-1 mode.`);
  } else {
    const stage = getStage(current.stage);
    console.log(`-- tick: stage ${current.stage} (${stage.name}) --`);
    const res = await advanceOneStage(current);
    console.log(`   -> status=${res.status} stage=${res.stage} stopped=${res.stopped}`);
    current = await db.run.findUniqueOrThrow({ where: { id: target.id } });
  }

  const ms = Date.now() - t0;
  console.log('\n=============== STAGE-1 RESULT ===============');
  console.log(`FINAL STATUS: ${current.status} (stage ${current.stage})`);
  console.log(`wall-clock: ${(ms / 1000).toFixed(1)}s`);

  const gateLogs = await db.gateLog.findMany({ where: { runId: target.id }, orderBy: [{ stage: 'asc' }, { loop: 'asc' }] });
  const artifacts = await db.factoryArtifact.findMany({ where: { runId: target.id }, orderBy: [{ stage: 'asc' }, { id: 'asc' }] });

  console.log('\n--- COST / CALL ACCOUNTING ---');
  const ok = calls.filter(c => c.ok).length;
  console.log(`claude CLI calls: ${calls.length} (ok=${ok}, failed=${calls.length - ok}) rate-cap signals=${rateCapHits} peak-concurrency=${peakConcurrency}`);

  console.log('\n--- GATE LOG (stage 1) ---');
  for (const lg of gateLogs) {
    const r1 = (lg.round1 as Array<{ expert: string; verdict: string; reasons?: string[]; deltas?: string[] }>) ?? [];
    const r2 = (lg.round2 as Array<{ expert: string; challengeAttempted: boolean; revisedVerdict?: string; note?: string; deltas?: string[] }>) ?? [];
    console.log(`stage ${lg.stage} loop${lg.loop} [${lg.resolution}]`);
    for (const v of r1) {
      console.log(`   R1 ${v.expert}: ${v.verdict}  reasons=${(v.reasons ?? []).length} deltas=${(v.deltas ?? []).length}`);
      const rs = (v.reasons ?? [])[0];
      if (rs) console.log(`      reason[0]: ${String(rs).slice(0, 240)}`);
    }
    for (const c of r2) {
      console.log(`   R2 ${c.expert}: challenged=${c.challengeAttempted}${c.revisedVerdict ? ' revised=' + c.revisedVerdict : ''} deltas=${(c.deltas ?? []).length}`);
      if (c.note) console.log(`      note: ${String(c.note).slice(0, 240)}`);
    }
  }

  const a1 = artifacts.find((a: { stage: number }) => a.stage === 1);
  console.log('\n--- STAGE 1 ARTIFACT ---');
  console.log(a1 ? JSON.stringify(a1.payload, null, 2).slice(0, 1600) : '(none)');

  console.log('\n--- PER-CALL TABLE ---');
  for (const c of calls) console.log(`#${c.n}\t${(c.ms / 1000).toFixed(1)}s\tok=${c.ok}\t${c.note}`);

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error('DRIVER ERROR:', e instanceof Error ? e.stack : e);
  try { await db.$disconnect(); } catch {}
  process.exit(1);
});
