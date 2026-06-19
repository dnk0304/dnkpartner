/**
 * Child for _forge_lean_smoke.mjs. Runs the REAL llm.ts / gate.ts seams once.
 * The fake `claude` spawn is injected by the _forge_cp_mock loader (registered
 * via --import by the parent), so nothing touches the real CLI / quota.
 *
 * FORGE_SMOKE_MODE: 'single' (one callClaudeJSON) | 'gate' (one runGate stage 1).
 * Native .ts extension is required by node --experimental-strip-types at runtime.
 */
// @ts-expect-error -- runtime needs the .ts extension
import { callClaudeJSON } from '../lib/factory/llm.ts';
// @ts-expect-error -- runtime needs the .ts extension
import { runGate } from '../lib/factory/gate.ts';

async function main(): Promise<void> {
  const mode = process.env.FORGE_SMOKE_MODE;
  if (mode === 'single') {
    const out = await callClaudeJSON({
      system: 's',
      user: 'u',
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['number', 'isPrime', 'reason'],
        properties: {
          number: { type: 'integer' },
          isPrime: { type: 'boolean' },
          reason: { type: 'string' },
        },
      },
    });
    if (out && typeof out === 'object') console.log('SINGLE_OK');
  } else if (mode === 'gate') {
    const outcome = await runGate(1, 'busy parents who need quick weeknight dinner plans', {});
    console.log(`RESOLUTION=${outcome.resolution}`);
    console.log(`LOOPS=${outcome.loops.length}`);
  } else {
    throw new Error(`unknown FORGE_SMOKE_MODE=${mode}`);
  }
}

main().catch((err) => {
  console.error('CHILD_ERROR:', err instanceof Error ? err.message : err);
  process.exit(1);
});
