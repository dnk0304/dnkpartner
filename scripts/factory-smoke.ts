/**
 * Local LLM-backend smoke test for the Product Factory runner.
 *
 * Proves the `local-cli` backend in lib/factory/llm.ts makes a REAL structured
 * call against Dennis's Claude Code SUBSCRIPTION ($0 paid key) and returns
 * schema-valid JSON in `structured_output` — with NO ANTHROPIC_API_KEY set.
 *
 * Run (Node 23.6+ / 24, native TS strip-types, zero new deps):
 *   node --experimental-strip-types scripts/factory-smoke.ts
 * or, if package.json has the script:
 *   npm run factory:smoke
 *
 * Prerequisite: Claude Code is logged in on this machine. That's it — no key.
 */

// The explicit `.ts` extension is REQUIRED by `node --experimental-strip-types`
// at runtime. tsc (bundler resolution, no allowImportingTsExtensions) flags it;
// this script is a standalone node runner, not part of the Next build, so we
// suppress the one type-only complaint rather than relax the project tsconfig.
// @ts-expect-error -- runtime needs the .ts extension; see comment above
import { callClaudeJSON, FACTORY_MODEL } from '../lib/factory/llm.ts';

const PRIME_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['number', 'isPrime', 'reason'],
  properties: {
    number: { type: 'integer' },
    isPrime: { type: 'boolean' },
    reason: { type: 'string' },
  },
} as const;

interface PrimeResult {
  number: number;
  isPrime: boolean;
  reason: string;
}

async function main(): Promise<void> {
  if (process.env.ANTHROPIC_API_KEY) {
    console.warn(
      '[smoke] WARNING: ANTHROPIC_API_KEY is set. The local-cli backend does ' +
        'not use it, but unset it to prove subscription-only auth.',
    );
  }
  console.log(`[smoke] backend=${process.env.FACTORY_LLM_BACKEND ?? 'local-cli'} model=${FACTORY_MODEL}`);
  console.log('[smoke] calling callClaudeJSON (this takes ~7-16s)...');

  const t0 = Date.now();
  const out = await callClaudeJSON<PrimeResult>({
    system: 'You are a precise math checker. Answer only via the structured schema.',
    user: 'Is the number 7 prime? Give a one-sentence reason.',
    schema: PRIME_SCHEMA,
  });
  const ms = Date.now() - t0;

  console.log(`[smoke] returned in ${ms}ms:`);
  console.log(JSON.stringify(out, null, 2));

  // Assertions — fail loudly if the structured shape didn't come back.
  if (typeof out !== 'object' || out === null) {
    throw new Error('[smoke] FAIL: structured_output was not an object.');
  }
  if (out.number !== 7) {
    throw new Error(`[smoke] FAIL: expected number=7, got ${out.number}.`);
  }
  if (typeof out.isPrime !== 'boolean' || typeof out.reason !== 'string') {
    throw new Error('[smoke] FAIL: schema fields missing/mistyped.');
  }

  console.log('[smoke] PASS: real subscription call returned schema-valid structured_output.');
}

main().catch((err) => {
  console.error('[smoke] ERROR:', err instanceof Error ? err.message : err);
  process.exit(1);
});
