/**
 * Ken's RECOVERY driver (2026-06-18, dispatch #7) — RESUMES the orphaned run and
 * drives it to a TERMINAL state in-process, with TRUE serial `claude` spawning.
 *
 * Differences vs scripts/factory-fullrun.ts (the a56846 driver that loop-dropped):
 *   1. RESUME, don't restart: if a run is already running / awaiting_human_gate
 *      it drives THAT run (the runner commits per stage, so it picks up from the
 *      last committed stage). Only creates a new run if none is resumable.
 *   2. TRUE SERIAL spawn: the gate fans out 3 experts via Promise.all (a 3-wide
 *      burst). The shared subscription has rate caps — this wrapper queues every
 *      `claude` spawn so only ONE process is ever live, via a deferred proxy
 *      ChildProcess that the engine consumes transparently. No engine edits.
 *
 * Run from repo root:
 *   node --experimental-strip-types \
 *     --import ./scripts/factory-alias-loader-register.mjs \
 *     scripts/factory-fullrun-resume.ts [RUN_ID]
 */

import { createRequire } from 'node:module';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';

const require = createRequire(import.meta.url);
const childProcess = require('node:child_process');

// ─── Instrumentation + SERIAL queue ──────────────────────────────────────────
interface CallRec { n: number; ms: number; ok: boolean; rateLimited: boolean; note: string; }
const calls: CallRec[] = [];
let callSeq = 0;
let rateCapHits = 0;
let liveCount = 0;
let peakConcurrency = 0;

const realSpawn = childProcess.spawn.bind(childProcess);

// A FIFO of pending claude spawns. Only one real claude process runs at a time.
// Each queued entry resolves its proxy by wiring it to the real child once the
// previous claude call has fully closed.
type QueueTask = () => void;
const spawnQueue: QueueTask[] = [];
let serialBusy = false;

// Inter-call backoff: the subscription has a ROLLING rate window — ~9-10
// back-to-back heavy opus-4-8 calls trip it and `claude` then exits 1. Spacing
// calls out respects the window. Tune via FACTORY_CALL_DELAY_MS.
const CALL_DELAY_MS = Number(process.env.FACTORY_CALL_DELAY_MS ?? 8000);

function pumpQueue() {
  if (serialBusy) return;
  const next = spawnQueue.shift();
  if (!next) return;
  serialBusy = true;
  next();
}

/** Release the serial lock after a backoff delay, then start the next call. */
function releaseAfterDelay() {
  setTimeout(() => {
    serialBusy = false;
    pumpQueue();
  }, CALL_DELAY_MS);
}

/**
 * A minimal stand-in for ChildProcess that the engine consumes: it exposes
 * .stdout/.stderr PassThrough streams, forwards 'error'/'close' events, and a
 * .kill() that is applied to the real child once spawned (or flagged to kill on
 * spawn if killed early). Handlers registered before the real child exists are
 * preserved because we pipe the real child's streams INTO these PassThroughs
 * and re-emit its lifecycle events on this emitter.
 */
class DeferredChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  private realChild: import('node:child_process').ChildProcess | null = null;
  private killedEarly: NodeJS.Signals | number | undefined | false = false;

  attachReal(child: import('node:child_process').ChildProcess) {
    this.realChild = child;
    if (this.killedEarly !== false) {
      child.kill(this.killedEarly as NodeJS.Signals);
    }
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

// @ts-expect-error -- intentional monkey-patch of spawn for measurement + serialization
childProcess.spawn = function patchedSpawn(command: string, args: readonly string[], options: unknown) {
  const isClaude = typeof command === 'string' && /claude(\.cmd|\.bat|\.exe)?$/i.test(command);
  if (!isClaude) {
    // @ts-expect-error -- passthrough
    return realSpawn(command, args, options);
  }

  const proxy = new DeferredChild();

  // Force stdin to 'ignore' so `claude` gets an immediate EOF and never blocks
  // waiting up to 3s for piped stdin (which it then aborts with exit 1). The
  // engine passes stdio:'pipe' by default; under the serial queue the deferred
  // spawn timing made claude's stdin-wait fire and kill the call. Keep
  // stdout/stderr piped so the engine still reads the JSON envelope.
  const opts = (options && typeof options === 'object') ? { ...(options as object) } : {};
  (opts as { stdio?: unknown }).stdio = ['ignore', 'pipe', 'pipe'];

  spawnQueue.push(() => {
    const t0 = Date.now();
    const seq = ++callSeq;
    liveCount++;
    if (liveCount > peakConcurrency) peakConcurrency = liveCount;

    // @ts-expect-error -- passthrough to real spawn
    const child = realSpawn(command, args, opts);

    let stdoutBuf = '';
    child.stdout?.on('data', (d: Buffer) => { if (stdoutBuf.length < 2_000_000) stdoutBuf += d.toString(); });

    child.on('close', (code: number) => {
      liveCount--;
      const ms = Date.now() - t0;
      let rateLimited = false;
      let note = `exit=${code}`;
      const low = stdoutBuf.toLowerCase();
      if (
        low.includes('rate limit') || low.includes('rate_limit') || low.includes('overloaded') ||
        low.includes('429') || low.includes('usage limit') || low.includes('too many requests')
      ) { rateLimited = true; rateCapHits++; note += ' RATE-CAP-SIGNAL'; }
      calls.push({ n: seq, ms, ok: code === 0, rateLimited, note });
      console.log(`[call #${seq}] ${(ms / 1000).toFixed(1)}s exit=${code}${rateLimited ? ' RATE-CAP' : ''}`);
      // Release the serial lock after a backoff delay (respects the rolling
      // rate window), then start the next queued claude call.
      releaseAfterDelay();
    });

    proxy.attachReal(child);
  });

  // Kick the queue (no-op if one is already running).
  queueMicrotask(pumpQueue);
  return proxy;
};

// ─── Import the engine AFTER patching spawn ───────────────────────────────────
// @ts-expect-error -- runtime needs the .ts extension
const { db } = await import('../lib/db.ts');
// @ts-expect-error -- runtime needs the .ts extension
const { advanceOneStage, resumeFromGate } = await import('../lib/factory/runner.ts');
// @ts-expect-error -- runtime needs the .ts extension
const { getStage, STAGES } = await import('../lib/factory/types.ts');

const EXPLICIT_RUN_ID = process.argv[2];

async function main() {
  console.log('═══ FACTORY RESUME DRIVER (recovery, serial) ═══');
  console.log(`backend=${process.env.FACTORY_LLM_BACKEND ?? 'local-cli'}`);

  // Resolve the run to drive: explicit id arg → else newest non-terminal run.
  let target;
  if (EXPLICIT_RUN_ID) {
    target = await db.run.findUnique({ where: { id: EXPLICIT_RUN_ID } });
    if (!target) throw new Error(`Run ${EXPLICIT_RUN_ID} not found.`);
  } else {
    target = await db.run.findFirst({
      where: { status: { in: ['running', 'awaiting_human_gate'] } },
      orderBy: { createdAt: 'desc' },
    });
  }

  if (!target) {
    throw new Error('No resumable run found (none running / awaiting_human_gate). Refusing to start fresh in recovery mode.');
  }

  console.log(`RESUMING run ${target.id} — status=${target.status} stage=${target.stage}`);
  console.log(`seed: ${target.seed.slice(0, 120)}...\n`);

  const runStart = Date.now();
  let current = await db.run.findUniqueOrThrow({ where: { id: target.id } });
  let guard = 0;

  while (guard++ < 80) {
    if (current.status === 'running') {
      const stage = getStage(current.stage);
      console.log(`── tick: stage ${current.stage} (${stage.name}) ──`);
      try {
        const res = await advanceOneStage(current);
        console.log(`   → status=${res.status} stage=${res.stage} stopped=${res.stopped}`);
      } catch (err) {
        console.error(`   FAILED stage ${current.stage}:`, err instanceof Error ? err.message : err);
        break;
      }
    } else if (current.status === 'awaiting_human_gate') {
      const stage = getStage(current.stage);
      const gate = stage.humanGate!;
      console.log(`── HUMAN GATE '${gate}' at stage ${current.stage} → AUTO-APPROVE ──`);
      await resumeFromGate(current, gate, 'approve', 'ken-recovery-run@local');
    } else {
      break; // terminal: draft_ready | escalated | killed
    }
    current = await db.run.findUniqueOrThrow({ where: { id: target.id } });
  }

  const runMs = Date.now() - runStart;

  // ─── Final state ─────────────────────────────────────────────────────────
  const finalRun = await db.run.findUniqueOrThrow({ where: { id: target.id } });
  const artifacts = await db.factoryArtifact.findMany({ where: { runId: target.id }, orderBy: [{ stage: 'asc' }, { id: 'asc' }] });
  const gateLogs = await db.gateLog.findMany({ where: { runId: target.id }, orderBy: [{ stage: 'asc' }, { loop: 'asc' }] });
  const decisions = await db.decision.findMany({ where: { runId: target.id }, orderBy: { id: 'asc' } });

  console.log('\n═══════════════ RESULT ═══════════════');
  console.log(`FINAL STATUS: ${finalRun.status}  (stage ${finalRun.stage})`);
  console.log(`wall-clock (this driver session): ${(runMs / 1000).toFixed(1)}s`);

  const totalCalls = calls.length;
  const okCalls = calls.filter(c => c.ok).length;
  const totalCallMs = calls.reduce((a, c) => a + c.ms, 0);
  const avgMs = totalCalls ? Math.round(totalCallMs / totalCalls) : 0;
  console.log('\n─── COST / CALL ACCOUNTING (this session) ───');
  console.log(`total claude CLI calls: ${totalCalls}  (ok=${okCalls}, failed=${totalCalls - okCalls})`);
  console.log(`sum of call durations:  ${(totalCallMs / 1000).toFixed(1)}s  (avg ${avgMs}ms/call)`);
  console.log(`rate-cap signals:       ${rateCapHits}`);
  console.log(`peak concurrency:       ${peakConcurrency} (target: 1 = serial)`);

  console.log('\n─── GATE LOG SUMMARY (per stage) ───');
  for (const s of STAGES) {
    const sLogs = gateLogs.filter((g: { stage: number }) => g.stage === s.n);
    if (sLogs.length === 0) { console.log(`stage ${s.n} ${s.slug}: (not reached)`); continue; }
    for (const lg of sLogs) {
      const r1 = (lg.round1 as Array<{ expert: string; verdict: string }>) ?? [];
      const r2 = (lg.round2 as Array<{ expert: string; challengeAttempted: boolean; revisedVerdict?: string }>) ?? [];
      const r1str = r1.map(v => `${v.expert.slice(0, 16)}=${v.verdict}`).join('  ');
      const r2str = r2.map(c => `${c.expert.slice(0, 16)}:${c.challengeAttempted ? 'CHALLENGED' : 'no-challenge'}${c.revisedVerdict ? '→' + c.revisedVerdict : ''}`).join('  ');
      console.log(`stage ${s.n} ${s.slug} loop${lg.loop} [${lg.resolution}]`);
      console.log(`   R1: ${r1str}`);
      console.log(`   R2: ${r2str}`);
    }
  }

  console.log('\n─── DECISIONS (auto-approved gates) ───');
  for (const d of decisions) console.log(`   ${d.gate} → ${d.choice} by ${d.by}`);

  const draft = artifacts.filter((a: { kind: string }) => a.kind === 'etsy_draft_object').slice(-1)[0]
    ?? artifacts.filter((a: { kind: string }) => a.kind === 'draft_listing').slice(-1)[0];
  console.log('\n─── FINAL DRAFT OBJECT ───');
  console.log(draft ? JSON.stringify(draft.payload, null, 2) : '(no draft_ready artifact)');

  console.log('\n─── PER-CALL TABLE ───');
  for (const c of calls) console.log(`#${c.n}\t${(c.ms / 1000).toFixed(1)}s\tok=${c.ok}\t${c.note}`);

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error('DRIVER ERROR:', e instanceof Error ? e.stack : e);
  try { await db.$disconnect(); } catch {}
  process.exit(1);
});
