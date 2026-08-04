/**
 * Proofs for the destructive-command guard and the AuctionUrlV3 registration.
 *
 *   npx tsx prisma/db-target-guard.test.ts
 *
 * Judged by exit code. No database needed — the guard is a pure function of
 * (argv, databaseUrl, nodeEnv), which is exactly why it can be proven against
 * production-shaped inputs without going near production.
 *
 * ⭐ Every REFUSAL test is paired with an ACCEPTANCE test. A guard that refuses
 * everything would score green on refusals alone while having broken the build
 * and the production container — so the liveness half is not optional, it is
 * the half that catches the dangerous failure.
 */

import assert from 'node:assert';

import {
  assertDbTargetIsDev,
  destructiveCommandIn,
  guardDestructivePrismaCommand,
  UnsafeDatabaseTargetError,
} from './db-target-guard';

let passed = 0;
let failed = 0;
function check(label: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  OK   ${label}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL ${label}`);
    console.error(`       ${(err as Error).message}`);
  }
}

const argv = (...words: string[]) => ['node', 'prisma', ...words];
const PROD_URL = 'postgresql://dnksubastas:pw@10.0.1.4:5432/dnksubastas';
const DEV_URL = 'postgresql://dnk:dnk@localhost:5432/subastas_applayer_forge';

function refuses(fn: () => void, mustMention?: RegExp) {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof UnsafeDatabaseTargetError, `wrong error type: ${(err as Error).name}`);
    if (mustMention) assert.match((err as Error).message, mustMention);
    return;
  }
  throw new Error('expected a refusal, but the call was allowed');
}

console.log('A — which commands are destructive');
check('`db push` is destructive', () => {
  assert.strictEqual(destructiveCommandIn(argv('db', 'push')), 'db push');
});
check('`db push` is still detected with flags in the way', () => {
  assert.strictEqual(destructiveCommandIn(argv('--schema=x', 'db', 'push', '--accept-data-loss')), 'db push');
});
check('`migrate reset` and `migrate dev` are destructive', () => {
  assert.strictEqual(destructiveCommandIn(argv('migrate', 'reset')), 'migrate reset');
  assert.strictEqual(destructiveCommandIn(argv('migrate', 'dev')), 'migrate dev');
});

console.log('\nB — the commands production and the build depend on are NOT guarded');
// This is the half that matters most: a false positive here breaks the Docker
// build and stops the production container from starting.
check('`generate` is not destructive (runs in `npm run build` and the Docker build)', () => {
  assert.strictEqual(destructiveCommandIn(argv('generate')), null);
});
check('`migrate deploy` is not destructive (the production container CMD)', () => {
  assert.strictEqual(destructiveCommandIn(argv('migrate', 'deploy')), null);
});
check('read-only commands are not destructive', () => {
  for (const c of [['validate'], ['format'], ['db', 'pull'], ['migrate', 'status'], ['migrate', 'diff']]) {
    assert.strictEqual(destructiveCommandIn(argv(...c)), null, `${c.join(' ')} was flagged destructive`);
  }
});
check('LIVENESS: generate/migrate-deploy pass the full guard with PRODUCTION inputs', () => {
  // The exact situation inside the prod container: non-loopback host,
  // NODE_ENV=production. Must NOT throw, or production cannot start.
  guardDestructivePrismaCommand(argv('generate'), PROD_URL, 'production');
  guardDestructivePrismaCommand(argv('migrate', 'deploy'), PROD_URL, 'production');
});

console.log('\nC — destructive commands are refused at an unproven target');
check('refuses a production host', () => {
  refuses(() => assertDbTargetIsDev(PROD_URL, 'development', 'db push'), /not a known dev target/);
});
check('refuses NODE_ENV=production even from a loopback url', () => {
  refuses(() => assertDbTargetIsDev(DEV_URL, 'production', 'db push'), /NODE_ENV=production/);
});
check('refuses an unset DATABASE_URL', () => {
  refuses(() => assertDbTargetIsDev(undefined, 'development', 'db push'), /not set/);
});
check('refuses an unparseable DATABASE_URL (fail closed)', () => {
  refuses(() => assertDbTargetIsDev('not a url', 'development', 'db push'), /could not be parsed/);
});
check('refuses a remote host that merely CONTAINS "localhost"', () => {
  refuses(() => assertDbTargetIsDev('postgresql://u:p@localhost.evil.com:5432/db', 'development', 'db push'));
});
check('the refusal names the blast radius, so the reader knows why', () => {
  refuses(() => assertDbTargetIsDev(PROD_URL, 'development', 'db push'), /192,589 minted permanent URLs/);
});
check('end-to-end: `db push` against prod is refused through the real entrypoint', () => {
  refuses(() => guardDestructivePrismaCommand(argv('db', 'push'), PROD_URL, 'production'));
});
check('NO ESCAPE HATCH: no env var re-opens the door', () => {
  for (const k of ['PUSH_FORCE', 'FORCE', 'PRISMA_FORCE', 'SEED_FORCE', 'CI']) {
    const prev = process.env[k];
    process.env[k] = '1';
    try {
      refuses(() => guardDestructivePrismaCommand(argv('db', 'push'), PROD_URL, 'production'));
    } finally {
      if (prev === undefined) delete process.env[k];
      else process.env[k] = prev;
    }
  }
});

console.log('\nD — LIVENESS: a real dev target is ACCEPTED');
// Without this, a guard that refused literally everything would pass section C
// and look perfect while making the repo unusable.
check('allows `db push` against loopback with a non-production NODE_ENV', () => {
  assertDbTargetIsDev(DEV_URL, 'development', 'db push');
  guardDestructivePrismaCommand(argv('db', 'push'), DEV_URL, 'development');
});
check('allows every loopback spelling, including uppercase and IPv6', () => {
  for (const h of ['localhost', 'LOCALHOST', '127.0.0.1', '[::1]']) {
    assertDbTargetIsDev(`postgresql://u:p@${h}:5432/db`, 'development', 'db push');
  }
});
check('allows `db push` when NODE_ENV is unset (a plain dev shell)', () => {
  assertDbTargetIsDev(DEV_URL, undefined, 'db push');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
