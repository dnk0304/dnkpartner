/**
 * SN-2 — admin new-user mail must fire on OAuth signups too.
 *
 * Production bug (diagnosis 2026-09-20): `sendNewSignupAdminEmail` was called
 * only from the credentials register route. Every real signup since the feature
 * shipped was Google/Apple, so the mail had never once fired.
 *
 * `auth.ts` imports NextAuth and the db module at module load, so the branch
 * itself is not importable in a pure test. The decision that can regress was
 * extracted into `afterOAuthUserCreated` and is asserted here with injected
 * senders. A grep assertion below pins the WIRING in `auth.ts`: that the helper
 * is called from the brand-new-user block and NOT on the existing-user path.
 *
 * Run: npx tsx src/lib/auth.oauth-signup-notify.test.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterOAuthUserCreated } from './oauth-signup-effects';

let failures = 0;
let checks = 0;
function ok(name: string, cond: boolean, detail?: string) {
  checks += 1;
  if (cond) console.log(`  ok   ${name}`);
  else { failures += 1; console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`); }
}
const section = (t: string) => console.log(`\n# ${t}`);

const ARGS = {
  userId: 'user_test_1',
  email: 'new.user@example.com',
  trialEnd: new Date('2026-10-20T00:00:00.000Z'),
  now: new Date('2026-09-20T00:00:00.000Z'),
};

function spies() {
  const order: string[] = [];
  const welcomeCalls: string[] = [];
  const adminCalls: Array<Record<string, unknown>> = [];
  return {
    order, welcomeCalls, adminCalls,
    deps: {
      sendWelcome: async (userId: string) => { order.push('welcome'); welcomeCalls.push(userId); },
      sendAdmin: async (o: Record<string, unknown>) => { order.push('admin'); adminCalls.push(o); },
    },
  };
}

// ── brand-new user: both fire, welcome first ────────────────────────────────
async function main() {
  section('brand-new OAuth user');
  {
    const s = spies();
    await afterOAuthUserCreated(ARGS, s.deps);
    ok('welcome called exactly once', s.welcomeCalls.length === 1, `got ${s.welcomeCalls.length}`);
    ok('welcome got the new user id', s.welcomeCalls[0] === ARGS.userId);
    ok('admin called exactly once', s.adminCalls.length === 1, `got ${s.adminCalls.length}`);
    ok('welcome runs BEFORE admin', s.order.join(',') === 'welcome,admin', s.order.join(','));
    const a = s.adminCalls[0] ?? {};
    ok('admin gets the signup address', a.userEmail === ARGS.email);
    ok('admin gets tier FREE', a.tier === 'FREE');
    ok('admin gets the trial end', (a.trialEndDate as Date)?.toISOString() === ARGS.trialEnd.toISOString());
    ok('admin gets the creation time', (a.createdAt as Date)?.toISOString() === ARGS.now.toISOString());
  }

  // ── admin sender throwing must not break sign-in ────────────────────────────
  section('admin notification failure is swallowed');
  {
    const order: string[] = [];
    let threw = false;
    try {
      await afterOAuthUserCreated(ARGS, {
        sendWelcome: async () => { order.push('welcome'); },
        sendAdmin: async () => { order.push('admin'); throw new Error('resend exploded'); },
      });
    } catch { threw = true; }
    ok('afterOAuthUserCreated did not rethrow', threw === false);
    ok('it did attempt the admin send', order.includes('admin'));
  }

  // ── wiring: new-user block only, never the existing-user path ───────────────
  section('auth.ts wiring');
  {
    const src = readFileSync(path.join(process.cwd(), 'src', 'lib', 'auth.ts'), 'utf8');
    const callIdx = src.indexOf('afterOAuthUserCreated(');
    const importIdx = src.indexOf("from \"@/lib/oauth-signup-effects\"");
    ok('auth.ts imports the helper', importIdx !== -1);
    ok('auth.ts calls the helper', callIdx !== -1);

    // The existing-user early return sits above the INSERT. The call must be
    // after BOTH, i.e. inside the brand-new-user block.
    const earlyReturn = src.indexOf('return existingUser.id;');
    const insertIdx = src.indexOf('INSERT INTO User');
    ok('existing-user early return exists', earlyReturn !== -1);
    ok('helper is called AFTER the existing-user early return',
      callIdx > earlyReturn, `call=${callIdx} earlyReturn=${earlyReturn}`);
    ok('helper is called AFTER the INSERT (new-user block)',
      callIdx > insertIdx, `call=${callIdx} insert=${insertIdx}`);

    // Exactly one call site — a second one would mean the existing-user path
    // (or a sign-in callback) also notifies.
    const callCount = src.split('afterOAuthUserCreated(').length - 1;
    ok('exactly one call site', callCount === 1, `got ${callCount}`);

    // sendNewSignupAdminEmail must not be invoked directly anywhere in auth.ts —
    // only handed to the helper as a dependency.
    ok('no direct sendNewSignupAdminEmail({ ... }) call in auth.ts',
      !/sendNewSignupAdminEmail\s*\(\s*\{/.test(src));
  }
}

main().then(() => {
  console.log(`
${checks - failures}/${checks} checks passed`);
  process.exit(failures ? 1 : 0);
});
