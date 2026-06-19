/**
 * Forge OFFLINE smoke — proves (1) the llm.ts retry wrapper recovers a transient
 * CLI flake instead of throwing, and (2) the lean single-reviewer gate shape:
 * 2 calls on PASS, 3 calls (produce+review+rewrite) on FAIL → passed_with_caveats.
 *
 * No real CLI / no quota: a loader (_forge_cp_mock) swaps child_process.spawn for
 * a fake `claude`. Run:  node --experimental-strip-types scripts/_forge_lean_smoke.mjs
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const tsxEntry = join(here, '_forge_lean_smoke_child.ts');

function run(scenarioEnv) {
  const counter = join(mkdtempSync(join(tmpdir(), 'forge-smoke-')), 'calls.jsonl');
  writeFileSync(counter, '');
  const env = {
    ...process.env,
    FORGE_FAKE_COUNTER: counter,
    FACTORY_BACKOFF_BASE_MS: '20', // near-instant retries for the test
    FACTORY_BACKOFF_CAP_MS: '40',
    ...scenarioEnv,
  };
  const res = spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      '--import',
      './scripts/_forge_cp_mock_register.mjs',
      '--import',
      './scripts/factory-alias-loader-register.mjs',
      tsxEntry,
    ],
    { env, encoding: 'utf8', cwd: process.cwd() },
  );
  const calls = readFileSync(counter, 'utf8').split('\n').filter((l) => l.trim()).length;
  return { calls, stdout: `${res.stdout ?? ''}`, stderr: `${res.stderr ?? ''}`, status: res.status };
}

let failed = 0;
function check(name, cond, detail) {
  if (cond) console.log(`  PASS  ${name}`);
  else {
    console.log(`  FAIL  ${name} — ${detail}`);
    failed++;
  }
}

console.log('Scenario A — retry recovers a transient CLI flake (exit 1, no output):');
{
  const r = run({ FORGE_FAKE_FAIL_FIRST: '2', FORGE_SMOKE_MODE: 'single' });
  check('callClaudeJSON returned (did not throw) after 2 flakes', r.stdout.includes('SINGLE_OK'), r.stderr || r.stdout);
  check('exactly 3 CLI spawns (2 flake + 1 success)', r.calls === 3, `got ${r.calls}`);
}

console.log('Scenario B — lean gate PASS shape (2 calls, resolution=pass):');
{
  const r = run({ FACTORY_EXPERT_COUNT: '1', FORGE_FAKE_VERDICT: 'PASS', FORGE_FAKE_SCORE: '88', FORGE_SMOKE_MODE: 'gate' });
  check('resolution=pass', r.stdout.includes('RESOLUTION=pass'), r.stderr || r.stdout);
  check('exactly 2 CLI calls (1 produce + 1 review)', r.calls === 2, `got ${r.calls}`);
}

console.log('Scenario C — lean gate FAIL→rewrite shape (3 calls, passed_with_caveats):');
{
  const r = run({ FACTORY_EXPERT_COUNT: '1', FORGE_FAKE_VERDICT: 'FAIL', FORGE_FAKE_SCORE: '40', FORGE_SMOKE_MODE: 'gate' });
  check('resolution=passed_with_caveats', r.stdout.includes('RESOLUTION=passed_with_caveats'), r.stderr || r.stdout);
  check('exactly 3 CLI calls (produce + review + 1 rewrite)', r.calls === 3, `got ${r.calls}`);
}

console.log(failed === 0 ? '\nALL SMOKE CHECKS PASSED' : `\n${failed} SMOKE CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
