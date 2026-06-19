/**
 * OFFLINE KISS-panel smoke (Dennis, 2026-06-18). NO real LLM calls, $0, no
 * network. It monkey-patches child_process.spawn to return canned structured
 * envelopes, then drives the REAL gate (lib/factory/gate.ts) + REAL personaRunner
 * + REAL llm.ts for ONE stage under the new KISS defaults.
 *
 * Proves:
 *   1. CLEAN PASS  → 1 produce + 3 panel reviews = 4 calls.
 *   2. ONE FAIL    → 1 produce + 3 reviews + 1 rewrite (then accept) = 5 calls.
 *   3. The 3 reviews are the 3 DISTINCT KISS experts (timing / niche-fit /
 *      will-it-sell), NOT the 24 vendored stage personas.
 *
 * Run:
 *   node --experimental-strip-types scripts/factory-kiss-smoke.ts
 */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const childProcess = require('node:child_process');
const { EventEmitter } = require('node:events');
const realSpawn = childProcess.spawn.bind(childProcess);

// ─── Spawn mock: classify each `claude` call, return a canned JSON envelope ────

type CallKind = 'produce' | 'review';
interface Recorded {
  kind: CallKind;
  /** For reviews: the KISS expert slug inferred from the system prompt. */
  expert?: string;
  verdict?: 'PASS' | 'FAIL';
}

let recorded: Recorded[] = [];
// Test scenario: which (if any) panel expert should FAIL this run.
let failExpert: string | null = null;

function envExpert(system: string): string {
  if (/You are TIMING/.test(system)) return 'kiss-timing';
  if (/You are NICHE-FIT/.test(system)) return 'kiss-niche-fit';
  if (/You are WILL-IT-SELL/.test(system)) return 'kiss-will-it-sell';
  return 'unknown';
}

function cannedEnvelope(args: readonly string[]): string {
  // args mirror cliArgs(): [..., '--json-schema', SCHEMA, ..., '--append-system-prompt', SYSTEM, ...]
  const schemaIdx = args.indexOf('--json-schema');
  const sysIdx = args.indexOf('--append-system-prompt');
  const schema = schemaIdx >= 0 ? String(args[schemaIdx + 1]) : '';
  const system = sysIdx >= 0 ? String(args[sysIdx + 1]) : '';

  // A REVIEW call (round1) uses VERDICT_SCHEMA → has "verdict" + "reasons".
  const isReview = /"verdict"/.test(schema) && /"reasons"/.test(schema);

  let structured: unknown;
  if (isReview) {
    const expert = envExpert(system);
    const fail = failExpert !== null && expert === failExpert;
    const verdict = fail ? 'FAIL' : 'PASS';
    structured = {
      verdict,
      reasons: [fail ? 'score=45/100' : 'score=82/100', fail ? 'Wrong moment for this niche.' : 'Right time, sharp niche, sells fast.'],
      deltas: fail ? ['Re-anchor the niche to a currently-trending sub-segment.'] : [],
    };
    recorded.push({ kind: 'review', expert, verdict });
  } else {
    // PRODUCE call — return a tiny generic artifact object (shape doesn't matter
    // to the gate; it only re-sends it to reviewers).
    structured = { ok: true, note: 'stub artifact' };
    recorded.push({ kind: 'produce' });
  }

  return JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: 'stub',
    structured_output: structured,
    usage: { input_tokens: 10, output_tokens: 5 },
  });
}

// @ts-expect-error monkey-patch signature
childProcess.spawn = function (cmd: string, args: readonly string[], opts: unknown) {
  const isClaude = typeof cmd === 'string' && /claude(\.cmd|\.bat)?$/i.test(cmd);
  // @ts-expect-error passthrough
  if (!isClaude) return realSpawn(cmd, args, opts);

  const out = cannedEnvelope(args);
  const child: any = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => {};
  // Emit asynchronously so the consumer's .on() handlers are wired first.
  setImmediate(() => {
    child.stdout.emit('data', Buffer.from(out));
    child.emit('close', 0);
  });
  return child;
};

// ─── Drive the real gate under the KISS defaults ──────────────────────────────

// Defaults must be the KISS panel: 3 experts, round-2 OFF, 1 fix loop. Assert
// the env is NOT overriding them (the smoke proves the DEFAULTS).
for (const k of ['FACTORY_EXPERT_COUNT', 'FACTORY_ENABLE_ROUND2', 'FACTORY_MAX_FIX_LOOPS']) {
  if (process.env[k]) {
    console.warn(`[kiss-smoke] WARNING: ${k}=${process.env[k]} is set; unset it to test true defaults.`);
  }
}

// @ts-expect-error runtime needs .ts ext
const { runGate } = await import('../lib/factory/gate.ts');

const SEED = 'A printable wedding-budget tracker for couples planning a 2026 spring wedding on a tight budget.';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`[kiss-smoke] FAIL: ${msg}`);
}

async function scenario(label: string, fail: string | null, expectedCalls: number) {
  recorded = [];
  failExpert = fail;
  const out = await runGate(1, SEED, {});
  const calls = recorded.length;
  const reviews = recorded.filter((r) => r.kind === 'review');
  const produces = recorded.filter((r) => r.kind === 'produce');
  const experts = [...new Set(reviews.map((r) => r.expert))].sort();

  console.log(`\n[${label}]`);
  console.log(`  total claude calls : ${calls}  (expected ${expectedCalls})`);
  console.log(`  produce calls      : ${produces.length}`);
  console.log(`  review calls       : ${reviews.length}`);
  console.log(`  distinct experts   : ${experts.join(', ')}`);
  console.log(`  resolution         : ${out.resolution}`);

  assert(calls === expectedCalls, `${label}: expected ${expectedCalls} calls, got ${calls}`);
  // First call is always the produce; the 3 reviews are the KISS panel.
  assert(reviews.length === 3, `${label}: expected 3 panel reviews, got ${reviews.length}`);
  assert(
    experts.length === 3 &&
      experts.join(',') === 'kiss-niche-fit,kiss-timing,kiss-will-it-sell',
    `${label}: panel must be the 3 distinct KISS experts, got [${experts.join(', ')}]`,
  );
  return out;
}

async function main() {
  console.log('=== KISS panel offline smoke (no LLM, $0) ===');

  // 1. Clean unanimous PASS → 1 produce + 3 reviews = 4 calls, resolution 'pass'.
  const clean = await scenario('CLEAN PASS', null, 4);
  assert(clean.resolution === 'pass', `clean run must resolve 'pass', got '${clean.resolution}'`);

  // 2. One expert FAILs → 1 produce + 3 reviews + 1 rewrite = 5 calls,
  //    resolution 'passed_with_caveats' (one rewrite then accept, no re-review).
  const failed = await scenario('ONE FAIL → ONE REWRITE', 'kiss-timing', 5);
  assert(
    failed.resolution === 'passed_with_caveats',
    `failed run must resolve 'passed_with_caveats', got '${failed.resolution}'`,
  );

  console.log('\n[kiss-smoke] PASS: 4 calls clean / 5 with one rewrite; 3 distinct KISS experts fire.');
}

main().catch((err) => {
  console.error('[kiss-smoke] ERROR:', err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
