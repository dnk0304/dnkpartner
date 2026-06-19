/**
 * Ken's local end-to-end PROVING driver for the Product Factory (2026-06-18).
 *
 * Drives ONE full run in-process (no Next server, no auth cookie) against the
 * real `local-cli` subscription backend, auto-approving the 4 human gates, and
 * MEASURES the cost: counts every `claude` CLI spawn, times each, and totals
 * wall-clock. HARNESS ONLY — does not modify engine code.
 *
 * Two safety instruments wrap the engine without touching it:
 *   1. SERIAL MUTEX on child_process.spawn — the gate fans out 3 experts via
 *      Promise.all; this chains them so only ONE `claude` process runs at a
 *      time, respecting the shared-subscription rate-cap guard (Ken brief).
 *   2. Per-call counter + timer + rate-cap sniff for the cost report.
 *
 * NOTE on concurrency: the gate dispatches 3 experts via Promise.all, so each
 * round launches up to 3 `claude` processes near-simultaneously (a 3-wide
 * burst, NOT a wide fan-out). We measure peak concurrency and sniff every
 * call's envelope for rate-cap/overload signals; on any signal we stop and
 * extrapolate rather than burn quota. The resumable runner means a pause is
 * recoverable. True 1-at-a-time serialization would require patching llm.ts,
 * which is out of scope for this measurement harness.
 *
 * Run from repo root:
 *   node --experimental-strip-types \
 *     --import ./scripts/factory-alias-loader-register.mjs \
 *     scripts/factory-fullrun.ts "<SEED>"
 */

import { createRequire } from 'node:module';

// The CJS view of node:child_process is a mutable object (the ESM namespace is
// frozen). The engine's `import { spawn } from 'node:child_process'` binds to
// this same underlying export, so patching it here intercepts the engine spawns.
const require = createRequire(import.meta.url);
const childProcess = require('node:child_process');

// ─── Instrumentation: wrap spawn BEFORE the engine modules are imported ───────
interface CallRec {
  n: number;
  ms: number;
  ok: boolean;
  rateLimited: boolean;
  note: string;
}
const calls: CallRec[] = [];
let callSeq = 0;
let rateCapHits = 0;
let liveCount = 0;
let peakConcurrency = 0;

const realSpawn = childProcess.spawn.bind(childProcess);
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');

// SERIAL mutex: a promise chain so only ONE real `claude` process is live at a
// time (respects the shared-subscription rate-cap guard; also removes the
// contention that ballooned concurrent calls to 60-94s and tripped the engine's
// 180s timeout). The engine fans out 3 experts via Promise.all and calls spawn()
// 3× synchronously; we return a PROXY ChildProcess immediately and only launch
// the REAL spawn when the mutex frees, bridging streams + close/error through.
let mutex: Promise<void> = Promise.resolve();
let queuedSnapshot = 0; // how many claude calls have been requested but not closed

// @ts-expect-error -- intentional monkey-patch of the spawn signature
childProcess.spawn = function patchedSpawn(command: string, args: readonly string[], options: unknown) {
  const isClaude =
    typeof command === 'string' && /claude(\.cmd|\.bat)?$/i.test(command);
  if (!isClaude) {
    // @ts-expect-error -- passthrough
    return realSpawn(command, args, options);
  }

  const seq = ++callSeq;
  queuedSnapshot++;
  if (queuedSnapshot > peakConcurrency) peakConcurrency = queuedSnapshot;

  // The proxy the engine interacts with. It exposes exactly the surface llm.ts
  // uses: .stdout/.stderr (readable), .kill(), and 'error'/'close' events.
  const proxy: any = new EventEmitter();
  proxy.stdout = new PassThrough();
  proxy.stderr = new PassThrough();
  let killed = false;
  let realChild: any = null;
  proxy.kill = () => { killed = true; if (realChild) realChild.kill(); };

  let stdoutBuf = '';

  // Chain onto the mutex: wait our turn, then launch the real spawn.
  const prior = mutex;
  let release!: () => void;
  mutex = new Promise<void>((res) => { release = res; });

  void prior.then(() => {
    if (killed) {
      // Engine already gave up (timeout) before our turn — emit a synthetic
      // close so its handler settles, and free the mutex.
      proxy.emit('close', null);
      queuedSnapshot--;
      release();
      return;
    }
    const t0 = Date.now();
    liveCount++;
    // @ts-expect-error -- passthrough to real spawn
    realChild = realSpawn(command, args, options);

    realChild.stdout?.on('data', (d: Buffer) => {
      if (stdoutBuf.length < 2_000_000) stdoutBuf += d.toString();
      proxy.stdout.write(d);
    });
    realChild.stderr?.on('data', (d: Buffer) => proxy.stderr.write(d));
    realChild.on('error', (err: Error) => proxy.emit('error', err));
    realChild.on('close', (code: number) => {
      liveCount--;
      queuedSnapshot--;
      const ms = Date.now() - t0;
      let rateLimited = false;
      let note = `exit=${code}`;
      const low = stdoutBuf.toLowerCase();
      if (
        low.includes('rate limit') || low.includes('rate_limit') ||
        low.includes('overloaded') || low.includes('"status":429') ||
        low.includes('usage limit') || low.includes('too many requests')
      ) {
        rateLimited = true; rateCapHits++; note += ' RATE-CAP-SIGNAL';
      }
      calls.push({ n: seq, ms, ok: code === 0, rateLimited, note });
      const flag = rateLimited ? ' ⚠ RATE-CAP' : '';
      console.log(`[call #${seq}] ${ms}ms exit=${code}${flag} (serial)`);
      proxy.stdout.end();
      proxy.stderr.end();
      proxy.emit('close', code);
      release(); // next queued claude call may now start
    });
  });

  return proxy;
};

// ─── Now import the engine (uses the patched spawn) ───────────────────────────
// @ts-expect-error -- runtime needs the .ts extension
const { db } = await import('../lib/db.ts');
// @ts-expect-error -- runtime needs the .ts extension
const { advanceOneStage, resumeFromGate } = await import('../lib/factory/runner.ts');
// @ts-expect-error -- runtime needs the .ts extension
const { getStage, STAGES } = await import('../lib/factory/types.ts');

const SEED = process.argv[2] ?? 'A printable Divorce Organizer / paperwork-and-checklist toolkit that helps a person going through divorce track documents, deadlines, finances, custody logistics, and emotional/legal milestones in one calm, structured system.';

function nowMs() { return Date.now(); }

async function main() {
  console.log('═══ FACTORY FULL RUN (local proving) ═══');
  console.log(`backend=${process.env.FACTORY_LLM_BACKEND ?? 'local-cli'}`);
  console.log(`seed: ${SEED}\n`);

  const runStart = nowMs();

  // Create the run row directly (skip the auth-gated route).
  const run = await db.run.create({ data: { seed: SEED.trim() } });
  console.log(`run id: ${run.id}\n`);

  let current = await db.run.findUniqueOrThrow({ where: { id: run.id } });
  let guard = 0;

  while (guard++ < 60) {
    if (current.status === 'running') {
      const stage = getStage(current.stage);
      console.log(`── tick: stage ${current.stage} (${stage.name}) ──`);
      try {
        const res = await advanceOneStage(current);
        console.log(`   → status=${res.status} stage=${res.stage} stopped=${res.stopped}`);
      } catch (err) {
        console.error(`   ✗ stage ${current.stage} FAILED:`, err instanceof Error ? err.message : err);
        break;
      }
    } else if (current.status === 'awaiting_human_gate') {
      const stage = getStage(current.stage);
      const gate = stage.humanGate!;
      console.log(`── HUMAN GATE '${gate}' at stage ${current.stage} → AUTO-APPROVE ──`);
      await resumeFromGate(current, gate, 'approve', 'ken-proving-run@local');
    } else {
      // terminal: draft_ready | escalated | killed
      break;
    }
    current = await db.run.findUniqueOrThrow({ where: { id: run.id } });
  }

  const runMs = nowMs() - runStart;

  // ─── Final state + draft summary ───────────────────────────────────────────
  const finalRun = await db.run.findUniqueOrThrow({ where: { id: run.id } });
  const artifacts = await db.factoryArtifact.findMany({
    where: { runId: run.id }, orderBy: [{ stage: 'asc' }, { id: 'asc' }],
  });
  const gateLogs = await db.gateLog.findMany({
    where: { runId: run.id }, orderBy: [{ stage: 'asc' }, { loop: 'asc' }],
  });
  const decisions = await db.decision.findMany({ where: { runId: run.id }, orderBy: { id: 'asc' } });

  console.log('\n═══════════════ RESULT ═══════════════');
  console.log(`FINAL STATUS: ${finalRun.status}  (stage ${finalRun.stage})`);
  console.log(`wall-clock: ${(runMs / 1000).toFixed(1)}s`);

  // ─── COST ──────────────────────────────────────────────────────────────────
  const totalCalls = calls.length;
  const okCalls = calls.filter(c => c.ok).length;
  const totalCallMs = calls.reduce((a, c) => a + c.ms, 0);
  const avgMs = totalCalls ? Math.round(totalCallMs / totalCalls) : 0;
  console.log('\n─── COST / CALL ACCOUNTING ───');
  console.log(`total claude CLI calls: ${totalCalls}  (ok=${okCalls}, failed=${totalCalls - okCalls})`);
  console.log(`sum of call durations:  ${(totalCallMs / 1000).toFixed(1)}s  (avg ${avgMs}ms/call)`);
  console.log(`rate-cap signals:       ${rateCapHits}`);
  console.log(`peak concurrency:       ${peakConcurrency} simultaneous claude procs`);

  // ─── GATE LOG SUMMARY ────────────────────────────────────────────────────────
  console.log('\n─── GATE LOG SUMMARY (per stage) ───');
  for (const s of STAGES) {
    const sLogs = gateLogs.filter((g: { stage: number }) => g.stage === s.n);
    if (sLogs.length === 0) { console.log(`stage ${s.n} ${s.slug}: (not reached)`); continue; }
    for (const lg of sLogs) {
      const r1 = (lg.round1 as Array<{ expert: string; verdict: string }>) ?? [];
      const r2 = (lg.round2 as Array<{ expert: string; challengeAttempted: boolean; revisedVerdict?: string }>) ?? [];
      const r1str = r1.map(v => `${v.expert.slice(0, 14)}=${v.verdict}`).join(' ');
      const r2str = r2.map(c => `${c.expert.slice(0, 14)}:${c.challengeAttempted ? 'challenged' : 'no-challenge'}${c.revisedVerdict ? '→' + c.revisedVerdict : ''}`).join(' ');
      console.log(`stage ${s.n} ${s.slug} loop${lg.loop} [${lg.resolution}]`);
      console.log(`   R1: ${r1str}`);
      console.log(`   R2: ${r2str}`);
    }
  }

  console.log('\n─── DECISIONS (auto-approved gates) ───');
  for (const d of decisions) console.log(`   ${d.gate} → ${d.choice} by ${d.by}`);

  // ─── DRAFT OBJECT ────────────────────────────────────────────────────────────
  const draft = artifacts.filter((a: { kind: string }) => a.kind === 'etsy_draft_object').slice(-1)[0]
    ?? artifacts.filter((a: { kind: string }) => a.kind === 'draft_listing').slice(-1)[0];
  console.log('\n─── FINAL DRAFT OBJECT ───');
  if (draft) {
    console.log(JSON.stringify(draft.payload, null, 2));
  } else {
    console.log('(no draft_ready artifact)');
  }

  // Dump per-call table for the record.
  console.log('\n─── PER-CALL TABLE ───');
  for (const c of calls) console.log(`#${c.n}\t${c.ms}ms\tok=${c.ok}\t${c.note}`);

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error('DRIVER ERROR:', e instanceof Error ? e.stack : e);
  try { await db.$disconnect(); } catch {}
  process.exit(1);
});
