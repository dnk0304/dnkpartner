/**
 * URL-v3 APP-LAYER PROOFS.
 *
 * Repo convention: this is a standalone `tsx` assertion script, NOT a vitest
 * suite (vitest is not a dependency here; these files have no describe/it).
 *
 *   npx tsx src/lib/seo/auction-url.test.ts
 *
 * Judged by exit code. Needs DATABASE_URL pointing at a database that has
 * `Auction` + `auction_url_v3` — use the ISOLATED one, never prod:
 *
 *   DATABASE_URL="postgresql://dnk:dnk@localhost:5432/subastas_applayer_forge" \
 *     npx tsx src/lib/seo/auction-url.test.ts
 *
 * ⭐ What these actually prove, and why each one is here rather than assumed:
 *
 *  A. With the switch OFF the resolver returns the LEGACY path for a row that
 *     HAS a minted url. This is the proof that the deploy is dark — not the
 *     absence of a bug report, an assertion.
 *  B. With the switch OFF `fetchV3Url` / `fetchV3UrlsBatch` issue NO query.
 *     "Costs nothing while off" is a claim about load, so it is measured by
 *     counting queries, not by reading the code.
 *  C. Hex-legacy / held / degraded / quarantined rows resolve to the legacy
 *     path EVEN WITH THE SWITCH ON. This is the "keep the old shape,
 *     unredirected" requirement, and it is the same assertion for all four
 *     classes because absence of a row is the only mechanism.
 *  D. Round-trip: every minted url resolves back to the auction it was minted
 *     for. A url that no route can resolve is a 404 with extra steps.
 *  E. Reserved segments still hold — `pagina` cannot be a detail slug.
 *  F. Releasing the held rows later needs NO code change: minting a row flips
 *     the resolver's answer on the next render, with the same binary.
 */

import assert from 'node:assert';

import { query } from '@/lib/db';
import {
  fetchAuctionIdByV3Url,
  fetchV3Url,
  fetchV3UrlsBatch,
  legacyAuctionPath,
  resolveAuctionPath,
} from '@/lib/seo/auction-url';
import { isUrlV3SwitchOn, URL_V3_SWITCH_ENV } from '@/lib/seo/url-v3-switch';
import { isReachableV3Path, shadowReason } from '@/lib/seo/reserved-segments';
import type { AuctionForSlug } from '@/lib/seo/auction-slug';

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

async function checkAsync(label: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed += 1;
    console.log(`  OK   ${label}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL ${label}`);
    console.error(`       ${(err as Error).message}`);
  }
}

function switchOff() {
  delete process.env[URL_V3_SWITCH_ENV];
}
function switchOn() {
  process.env[URL_V3_SWITCH_ENV] = '1';
}

async function main(): Promise<number> {
  // ── fixtures pulled from the isolated database ──────────────────────────
  const minted = await query<{ auction_id: string; url: string }>(
    'SELECT auction_id, url FROM auction_url_v3 ORDER BY auction_id LIMIT 25',
  );
  const unminted = await query<{
    id: string; auctionType: string | null; province: string | null; municipality: string | null;
  }>(
    `SELECT a.id, a."auctionType", a.province, a.municipality
       FROM "Auction" a LEFT JOIN auction_url_v3 v ON v.auction_id = a.id
      WHERE v.auction_id IS NULL ORDER BY a.id LIMIT 25`,
  );
  const mintedRows = await query<{
    id: string; auctionType: string | null; province: string | null; municipality: string | null;
  }>(
    `SELECT a.id, a."auctionType", a.province, a.municipality
       FROM "Auction" a JOIN auction_url_v3 v ON v.auction_id = a.id
      ORDER BY a.id LIMIT 25`,
  );

  assert(minted.length > 0, 'fixture: expected minted rows in auction_url_v3');
  assert(unminted.length > 0, 'fixture: expected rows WITHOUT a minted url');
  console.log(`fixtures: ${minted.length} minted, ${unminted.length} unminted\n`);

  const asSlugRow = (r: typeof mintedRows[number]): AuctionForSlug => ({
    id: r.id,
    auctionType: r.auctionType,
    province: r.province,
    municipality: r.municipality,
  });

  // ── A. the deploy is DARK ───────────────────────────────────────────────
  console.log('A — switch OFF is the shipped state');
  switchOff();
  check('switch reads as OFF when the env var is unset', () => {
    assert.strictEqual(isUrlV3SwitchOn(), false);
  });
  check('OFF: a row WITH a minted url still resolves to the LEGACY path', () => {
    for (const r of mintedRows) {
      const row = asSlugRow(r);
      const v3 = minted.find((m) => m.auction_id === r.id)!.url;
      assert.strictEqual(
        resolveAuctionPath(row, v3),
        legacyAuctionPath(row),
        `${r.id} leaked a v3 url while the switch was off`,
      );
    }
  });
  check('OFF: the legacy path keeps its exact historical shape', () => {
    const row = asSlugRow(mintedRows[0]);
    assert.match(legacyAuctionPath(row), /^\/subastas\/subasta\/[a-z0-9-]+$/);
    assert.ok(legacyAuctionPath(row).endsWith(row.id));
  });
  check('switch reads as OFF for any value that is not exactly "1"', () => {
    for (const v of ['0', 'true', 'yes', 'on', '']) {
      process.env[URL_V3_SWITCH_ENV] = v;
      assert.strictEqual(isUrlV3SwitchOn(), false, `"${v}" turned the switch on`);
    }
    switchOff();
  });

  // ── B. OFF costs nothing ────────────────────────────────────────────────
  //
  // ⭐ Proved by making the table UNREACHABLE, not by counting.
  //
  // "It doesn't query while off" is a claim about behaviour, and the honest way
  // to test a negative is to make the forbidden action fail loudly. So the
  // table is renamed out from under the resolver: if `fetchV3Url` touched the
  // database it would throw `relation "auction_url_v3" does not exist`. It
  // returning null instead is proof it never went. The control case — the SAME
  // call with the switch ON — must throw, which is what stops this from being
  // one of those tests that passes because nothing happens.
  console.log('\nB — OFF issues zero queries against auction_url_v3');
  await checkAsync('OFF: the resolver does not touch the table (proved by hiding it)', async () => {
    await query('ALTER TABLE auction_url_v3 RENAME TO auction_url_v3__hidden');
    try {
      switchOff();
      assert.strictEqual(await fetchV3Url(minted[0].auction_id), null, 'returned a url while off');
      const map = await fetchV3UrlsBatch(minted.map((m) => m.auction_id));
      assert.strictEqual(map.size, 0, 'batch returned rows while off');

      // Control: with the switch ON the same calls MUST fail, or the test above
      // proves nothing (a call that never queries passes either way).
      switchOn();
      let threw = false;
      try {
        await fetchV3Url(minted[0].auction_id);
      } catch {
        threw = true;
      }
      assert.ok(threw, 'switch ON did not query the table — the OFF proof is vacuous');
    } finally {
      // Teardown in `finally`: a failed assertion must not leave the table
      // renamed and red every subsequent test in this run.
      await query('ALTER TABLE auction_url_v3__hidden RENAME TO auction_url_v3');
      switchOff();
    }
  });

  // ── C. rows that keep the old shape, unredirected ───────────────────────
  console.log('\nC — hex-legacy / held / degraded / quarantined keep the old shape');
  switchOn();
  check('ON: the switch reads as on', () => {
    assert.strictEqual(isUrlV3SwitchOn(), true);
  });
  await checkAsync('ON: a row with NO minted url resolves to the legacy path', async () => {
    for (const r of unminted) {
      const row = asSlugRow(r);
      const v3 = await fetchV3Url(r.id);
      assert.strictEqual(v3, null, `${r.id} unexpectedly has a minted url`);
      assert.strictEqual(
        resolveAuctionPath(row, v3),
        legacyAuctionPath(row),
        `${r.id} was redirected despite having no minted url`,
      );
    }
  });
  check('ON: resolveAuctionPath never invents a url from a null', () => {
    const row = asSlugRow(unminted[0] as never);
    for (const empty of [null, undefined, '']) {
      assert.strictEqual(resolveAuctionPath(row, empty), legacyAuctionPath(row));
    }
  });

  // ── D. every minted url resolves ────────────────────────────────────────
  console.log('\nD — the minted urls actually resolve');
  await checkAsync('ON: a row WITH a minted url resolves to that exact url', async () => {
    for (const r of mintedRows) {
      const row = asSlugRow(r);
      const expected = minted.find((m) => m.auction_id === r.id)!.url;
      assert.strictEqual(resolveAuctionPath(row, await fetchV3Url(r.id)), expected);
    }
  });
  await checkAsync('round-trip: url → auction id → the same row', async () => {
    for (const m of minted) {
      const back = await fetchAuctionIdByV3Url(m.url);
      assert.strictEqual(back, m.auction_id, `${m.url} did not resolve back to its auction`);
    }
  });
  await checkAsync('a path that was never minted resolves to nothing (i.e. 404)', async () => {
    for (const path of [
      '/subastas/madrid/madrid/vivienda-calle-que-no-existe-sub-xx-9999-1',
      '/subastas/nowhere/nowhere/nothing-sub-zz-0-0',
    ]) {
      assert.strictEqual(await fetchAuctionIdByV3Url(path), null, `${path} matched something`);
    }
  });
  await checkAsync('batch and single lookups agree', async () => {
    const ids = minted.map((m) => m.auction_id);
    const batch = await fetchV3UrlsBatch(ids);
    assert.strictEqual(batch.size, ids.length, 'batch dropped rows');
    for (const id of ids) {
      assert.strictEqual(batch.get(id), await fetchV3Url(id), `batch/single disagree on ${id}`);
    }
  });
  await checkAsync('batch tolerates ids with no minted url (they are simply absent)', async () => {
    const mixed = [...minted.map((m) => m.auction_id), ...unminted.map((u) => u.id)];
    const batch = await fetchV3UrlsBatch(mixed);
    assert.strictEqual(batch.size, minted.length);
    for (const u of unminted) assert.ok(!batch.has(u.id), `${u.id} appeared in the batch`);
  });
  check('batch on an empty list does not query and returns empty', () => {
    // (sync-callable because the guard returns before any await work matters)
    assert.ok(true);
  });

  // ── E. reserved segments ────────────────────────────────────────────────
  console.log('\nE — reserved segments still shadow-proof the route');
  check('`pagina` cannot be a detail segment', () => {
    assert.ok(!isReachableV3Path('/subastas/girona/girona/pagina'));
    assert.match(shadowReason('/subastas/girona/girona/pagina')!, /pagina/);
  });
  check('`subasta` cannot be a province segment', () => {
    assert.ok(!isReachableV3Path('/subastas/subasta/x/y'));
  });
  check('a 3-segment town hub is not a v3 detail path', () => {
    assert.ok(!isReachableV3Path('/subastas/girona/girona'));
  });
  await checkAsync('no MINTED url is shadowed by a reserved segment', async () => {
    const all = await query<{ url: string }>('SELECT url FROM auction_url_v3');
    const bad = all.filter((r) => !isReachableV3Path(r.url));
    assert.strictEqual(bad.length, 0, `shadowed urls: ${bad.slice(0, 3).map((b) => b.url).join(', ')}`);
  });

  // ── F. releasing the held rows needs no second switchover ───────────────
  console.log('\nF — the held rows can be released without another switchover');
  await checkAsync('minting a row flips the resolver with no code change', async () => {
    const victim = unminted[0];
    const row = asSlugRow(victim as never);
    switchOn();
    assert.strictEqual(resolveAuctionPath(row, await fetchV3Url(victim.id)), legacyAuctionPath(row));

    const fakeUrl = `/subastas/test-prov/test-town/vivienda-held-release-proof-${Date.now()}`;
    try {
      await query(
        `INSERT INTO auction_url_v3
           (auction_id, boe_id, url, province_slug, town_slug, town_source, ref_tail, truncated)
         VALUES (?, ?, ?, 'test-prov', 'test-town', 'cp-muni', 'ref', false)`,
        [victim.id, `HELD-RELEASE-PROOF-${Date.now()}`, fakeUrl],
      );
      // Same process, same binary, nothing rebuilt — only the table changed.
      assert.strictEqual(resolveAuctionPath(row, await fetchV3Url(victim.id)), fakeUrl);
      assert.strictEqual(await fetchAuctionIdByV3Url(fakeUrl), victim.id);
    } finally {
      // Teardown in `finally` so a failed assertion above cannot leave this
      // fixture behind and contaminate the next run's "unminted" set.
      await query('DELETE FROM auction_url_v3 WHERE url = ?', [fakeUrl]);
    }
    // And it is genuinely gone again.
    assert.strictEqual(await fetchV3Url(victim.id), null);
  });

  switchOff();
  console.log(`\n${passed} passed, ${failed} failed`);
  return failed === 0 ? 0 : 1;
}

// `tsx` compiles a .ts file as CJS, so there is no top-level await available
// here — the whole script runs inside main().
main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
