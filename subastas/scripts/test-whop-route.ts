/**
 * End-to-end proof for /api/whop/webhook.
 *
 * Mocks `@/lib/prisma` BEFORE importing the route, so we can assert what the
 * route writes to User.tier + Subscription on each event without a live DB.
 *
 * Run: `npx tsx scripts/test-whop-route.ts`
 */
import Module from 'node:module';
import path from 'node:path';
import { signForTest } from '../src/lib/whop/signature';

const SECRET =
  'ws_10d3585ab8976ee88b8d62176f044c6f93c43b1dfa0cbcee192c18bded582b59';
process.env.WHOP_WEBHOOK_SECRET = SECRET;

// ---- in-memory fake Prisma ----
type FakeUser = { id: string; email: string; tier: string };
const users: FakeUser[] = [
  { id: 'user_local_1', email: 'alice@example.com', tier: 'FREE' },
];
type FakeSub = {
  userId: string;
  tier: string;
  status: string;
  whopMembershipId?: string | null;
  whopPlanId?: string | null;
  whopUserId?: string | null;
};
const subs: FakeSub[] = [];

const fakePrisma = {
  user: {
    findUnique: async ({ where, select: _select }: any) => {
      if (where.id) return users.find((u) => u.id === where.id) ?? null;
      if (where.email) return users.find((u) => u.email === where.email) ?? null;
      return null;
    },
    update: async ({ where, data }: any) => {
      const u = users.find((u) => u.id === where.id);
      if (!u) throw new Error('user not found');
      Object.assign(u, data);
      return u;
    },
  },
  subscription: {
    findUnique: async ({ where, select: _select }: any) => {
      if (where.whopMembershipId)
        return subs.find((s) => s.whopMembershipId === where.whopMembershipId) ?? null;
      if (where.userId) return subs.find((s) => s.userId === where.userId) ?? null;
      return null;
    },
    upsert: async ({ where, create, update }: any) => {
      const existing = subs.find((s) => s.userId === where.userId);
      if (existing) {
        Object.assign(existing, update);
        return existing;
      }
      subs.push(create);
      return create;
    },
  },
  // $transaction takes an array of awaited promises; just await them.
  $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
};

// ---- intercept the @/lib/prisma import ----
const origResolve = (Module as any)._resolveFilename;
const repoRoot = path.resolve(__dirname, '..');
(Module as any)._resolveFilename = function (request: string, ...rest: any[]) {
  if (request === '@/lib/prisma') {
    return path.join(repoRoot, 'scripts', '__fake_prisma.js');
  }
  if (request.startsWith('@/')) {
    return origResolve.call(
      this,
      path.join(repoRoot, 'src', request.slice(2)),
      ...rest,
    );
  }
  return origResolve.call(this, request, ...rest);
};

// Drop a CJS shim that re-exports the in-memory fake.
import fs from 'node:fs';
const shimPath = path.join(repoRoot, 'scripts', '__fake_prisma.js');
fs.writeFileSync(
  shimPath,
  `module.exports = { prisma: globalThis.__fakePrisma };\n`,
);
(globalThis as any).__fakePrisma = fakePrisma;

// ---- now import the route (after the resolver is patched) ------------------
async function main() {
  const { POST } = await import('../src/app/api/whop/webhook/route');

  type TestResult = { name: string; pass: boolean; detail: string };
  const results: TestResult[] = [];
  function record(name: string, pass: boolean, detail: string) {
    results.push({ name, pass, detail });
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name} — ${detail}`);
  }

  function makeReq(body: string, sigHeader: string | null): any {
    const headers = new Headers();
    if (sigHeader) headers.set('webhook-signature', sigHeader);
    return {
      headers,
      text: async () => body,
    };
  }

  // ---- Test A: correctly-signed activated → tier = ACCESO ----
  {
    const id = 'evt_route_A';
    const ts = 1748900000;
    const body = JSON.stringify({
      id,
      timestamp: ts,
      type: 'membership.activated',
      data: {
        id: 'mem_route_A',
        user_id: 'whop_user_A',
        plan_id: 'plan_c4MzcxWSJP7eT',
        status: 'trialing',
        metadata: { userId: 'user_local_1' },
      },
    });
    const sig = signForTest(body, SECRET, id, ts);
    const res = await POST(makeReq(body, sig) as any);
    const json = await res.json();
    const user = users.find((u) => u.id === 'user_local_1')!;
    const sub = subs.find((s) => s.userId === 'user_local_1');
    record(
      'GOOD sig + membership.activated → User.tier=ACCESO + Subscription upserted',
      res.status === 200 &&
        json.success === true &&
        user.tier === 'ACCESO' &&
        !!sub &&
        sub.whopMembershipId === 'mem_route_A' &&
        sub.whopPlanId === 'plan_c4MzcxWSJP7eT',
      `status=${res.status} tier=${user.tier} subWhopId=${sub?.whopMembershipId} applied=${json.applied}`,
    );
  }

  // ---- Test B: BAD sig → 401, no tier change ----
  {
    const before = users.find((u) => u.id === 'user_local_1')!.tier;
    const id = 'evt_route_B';
    const ts = 1748900100;
    const body = JSON.stringify({
      id,
      timestamp: ts,
      type: 'membership.deactivated',
      data: {
        id: 'mem_route_A',
        plan_id: 'plan_c4MzcxWSJP7eT',
        status: 'canceled',
        metadata: { userId: 'user_local_1' },
      },
    });
    const badSig = signForTest(body, 'ws_attacker_secret', id, ts);
    const res = await POST(makeReq(body, badSig) as any);
    const json = await res.json();
    const after = users.find((u) => u.id === 'user_local_1')!.tier;
    record(
      'BAD sig + membership.deactivated → 401, tier UNCHANGED',
      res.status === 401 &&
        json.success === false &&
        json.error === 'unauthorized' &&
        before === after,
      `status=${res.status} before=${before} after=${after} reason=${json.reason}`,
    );
  }

  // ---- Test C: correctly-signed deactivated → tier = FREE ----
  {
    const id = 'evt_route_C';
    const ts = 1748900200;
    const body = JSON.stringify({
      id,
      timestamp: ts,
      type: 'membership.deactivated',
      data: {
        id: 'mem_route_A',
        plan_id: 'plan_c4MzcxWSJP7eT',
        status: 'canceled',
        metadata: { userId: 'user_local_1' },
      },
    });
    const sig = signForTest(body, SECRET, id, ts);
    const res = await POST(makeReq(body, sig) as any);
    const json = await res.json();
    const user = users.find((u) => u.id === 'user_local_1')!;
    record(
      'GOOD sig + membership.deactivated → User.tier=FREE',
      res.status === 200 &&
        json.success === true &&
        json.applied === 'deactivated' &&
        user.tier === 'FREE',
      `status=${res.status} tier=${user.tier} applied=${json.applied}`,
    );
  }

  // ---- Test D: missing signature header → 401 ----
  {
    const body = JSON.stringify({
      id: 'evt_route_D',
      timestamp: 1748900300,
      type: 'membership.activated',
      data: { id: 'mem_x', plan_id: 'plan_c4MzcxWSJP7eT', metadata: { userId: 'user_local_1' } },
    });
    const res = await POST(makeReq(body, null) as any);
    const json = await res.json();
    record(
      'NO signature header → 401',
      res.status === 401 && json.error === 'unauthorized',
      `status=${res.status} reason=${json.reason}`,
    );
  }

  // ---- Test E: unknown event type → 200 ignored, no tier change ----
  {
    users.find((u) => u.id === 'user_local_1')!.tier = 'ACCESO'; // set known state
    const id = 'evt_route_E';
    const ts = 1748900400;
    const body = JSON.stringify({
      id,
      timestamp: ts,
      type: 'payment.succeeded',
      data: { id: 'pay_xyz' },
    });
    const sig = signForTest(body, SECRET, id, ts);
    const res = await POST(makeReq(body, sig) as any);
    const json = await res.json();
    const tier = users.find((u) => u.id === 'user_local_1')!.tier;
    record(
      'unknown event type → 200 ignored, no tier change',
      res.status === 200 && json.ignored === 'payment.succeeded' && tier === 'ACCESO',
      `status=${res.status} ignored=${json.ignored} tier=${tier}`,
    );
  }

  fs.unlinkSync(shimPath);

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n=== ${passed}/${results.length} passed ===`);
  if (passed !== results.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
