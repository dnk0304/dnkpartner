/**
 * REPRODUCIBLE VERIFY — stale-skip re-offer fix for the URL-v3 mint sweep.
 *
 * Proves, against an EPHEMERAL local Postgres database, that:
 *   1. A row whose degrade-skip predates the current resolver (resolver_version
 *      NULL) is RE-OFFERED and now MINTS — the falsifying Las Palmas SEGSOCIAL
 *      row is the canonical case.
 *   2. A genuinely unresolvable row (municipality in the wrong province) stays
 *      degraded and is RE-STAMPED with the current version (convergence).
 *   3. ACTIVE auctions are minted BEFORE concluded ones (LIMIT=1 selects the
 *      active row, leaves the concluded one).
 *   4. The pool CONVERGES: a second pass mints nothing and remaining stays 0.
 *
 * Run:  DATABASE_URL=postgres://dnk:dnk@localhost:5432/forge_mint_verify \
 *         npx tsx scripts/verify-mint-residue-recheck.ts
 * The wrapper `verify-mint-residue-recheck.sh` creates and drops the database.
 */
import { execute, query } from '@/lib/db';
import { sweepMintUrlV3 } from '@/lib/seo/mint-url-v3-sweep';
import { mintAuctionUrlV3 } from '@/lib/seo/mint-url-v3';
import { TOWN_RESOLVER_VERSION } from '@/lib/geo/resolve-town';

const ROW_A = {
  id: 'A', boeId: 'SUB-SS-721', category: 'Viviendas', province: 'Las Palmas',
  municipality: 'Las Palmas de Gran Canaria', postalCode: '', address: 'AV JUAN XXIII 1 5 D-4',
};

let failures = 0;
function check(name: string, cond: boolean, extra = ''): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failures += 1;
}

async function seedSchema(): Promise<void> {
  await execute(`DROP TABLE IF EXISTS auction_url_v3 CASCADE`);
  await execute(`DROP TABLE IF EXISTS auction_url_v3_skip CASCADE`);
  await execute(`DROP TABLE IF EXISTS "Auction" CASCADE`);
  await execute(`CREATE TABLE "Auction" (
      "id" TEXT PRIMARY KEY, "boeId" TEXT NOT NULL, "category" TEXT,
      "province" TEXT, "municipality" TEXT, "postalCode" TEXT, "address" TEXT,
      "status" TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await execute(`CREATE TABLE auction_url_v3 (
      "auction_id" TEXT PRIMARY KEY REFERENCES "Auction"("id") ON DELETE CASCADE,
      "boe_id" TEXT NOT NULL, "url" TEXT NOT NULL,
      "province_slug" TEXT NOT NULL, "town_slug" TEXT NOT NULL, "town_source" TEXT NOT NULL,
      "ine" TEXT, "ref_tail" TEXT NOT NULL, "descriptor" TEXT, "descriptor_full" TEXT,
      "truncated" BOOLEAN NOT NULL, "guard_signals" TEXT,
      CONSTRAINT c_ceiling CHECK (length(url) <= 200),
      CONSTRAINT c_shape   CHECK (url LIKE '/subastas/%'),
      CONSTRAINT c_source  CHECK (town_source = ANY (ARRAY['cp-muni','stored-gazetteer'])))`);
  await execute(`CREATE UNIQUE INDEX v3_url_key ON auction_url_v3(url)`);
}

async function seedRow(
  id: string, boeId: string, cat: string, prov: string, muni: string,
  cp: string, addr: string, status: string, createdAt: string,
): Promise<void> {
  await execute(
    `INSERT INTO "Auction"(id,"boeId",category,province,municipality,"postalCode",address,status,"createdAt")
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, boeId, cat, prov, muni, cp, addr, status, createdAt],
  );
}

async function main(): Promise<void> {
  await seedSchema();

  // A — the falsifying row: clean two-level geo, active, SEGSOCIAL, empty CP.
  await seedRow('A', 'SUB-SS-721', 'Viviendas', 'Las Palmas', 'Las Palmas de Gran Canaria',
    '', 'AV JUAN XXIII 1 5 D-4', 'PROXIMA_APERTURA', '2026-08-19');
  // B — genuine residue: municipality real but in a DIFFERENT province.
  await seedRow('B', 'SUB-SS-999', 'Viviendas', 'Las Palmas', 'Ronquillo, el',
    '', 'CALLE X 1', 'PROXIMA_APERTURA', '2026-08-17');
  // D — mintable but CONCLUDED: must sort AFTER the active row.
  await seedRow('D', 'SUB-SS-500', 'Viviendas', 'Madrid', 'Mostoles',
    '', 'AV FELIPE II 22', 'CONCLUIDA_PORTAL', '2026-08-18');

  // The sweep creates its own skip table on first run; create it here so we can
  // pre-seed STALE skips (resolver_version NULL) exactly as the 2026-08-05 batch left them.
  await execute(`CREATE TABLE auction_url_v3_skip (
      auction_id TEXT PRIMARY KEY, boe_id TEXT NOT NULL, reason TEXT NOT NULL,
      detail TEXT, decided_at TIMESTAMPTZ NOT NULL DEFAULT now(), resolver_version TEXT)`);
  for (const [id, boe] of [['A', 'SUB-SS-721'], ['B', 'SUB-SS-999'], ['D', 'SUB-SS-500']]) {
    await execute(
      `INSERT INTO auction_url_v3_skip(auction_id,boe_id,reason,resolver_version)
       VALUES (?,?, 'degraded:town-unresolved', NULL)`,
      [id, boe],
    );
  }

  // ── PROOF 3: active-first. LIMIT 1 must select the ACTIVE row A, not D. ──
  const one = await sweepMintUrlV3({ limit: 1, dryRun: false });
  const aUrl = await query<{ url: string }>(`SELECT url FROM auction_url_v3 WHERE auction_id='A'`);
  const dMinted = await query<{ n: string }>(`SELECT count(*)::text n FROM auction_url_v3 WHERE auction_id='D'`);
  check('active row A minted first under LIMIT 1', aUrl.length === 1, aUrl[0]?.url);
  check('concluded row D NOT minted yet under LIMIT 1', dMinted[0].n === '0');
  const oracleA = mintAuctionUrlV3(ROW_A);
  check('A url matches the pure-mint oracle & is two-level geo',
    oracleA.status === 'minted' && aUrl[0]?.url === oracleA.row.url
      && aUrl[0]?.url.startsWith('/subastas/las-palmas/las-palmas-de-gran-canaria/'),
    aUrl[0]?.url);
  check('LIMIT-1 pass minted exactly 1', one.minted === 1, `minted=${one.minted}`);

  // ── PROOF 1 + 2: full pass. A already minted; D mints; B re-stamped degraded. ──
  const full = await sweepMintUrlV3({ limit: 500, dryRun: false });
  const dUrl = await query<{ url: string }>(`SELECT url FROM auction_url_v3 WHERE auction_id='D'`);
  const bMinted = await query<{ n: string }>(`SELECT count(*)::text n FROM auction_url_v3 WHERE auction_id='B'`);
  const bSkip = await query<{ resolver_version: string | null }>(
    `SELECT resolver_version FROM auction_url_v3_skip WHERE auction_id='B'`);
  check('concluded row D now minted', dUrl.length === 1, dUrl[0]?.url);
  check('residue row B NOT minted (wrong-province municipality)', bMinted[0].n === '0');
  check('residue row B re-stamped with CURRENT resolver version',
    bSkip[0]?.resolver_version === TOWN_RESOLVER_VERSION, String(bSkip[0]?.resolver_version));
  check('A skip row cleared after mint (ledger not lying)',
    (await query(`SELECT 1 FROM auction_url_v3_skip WHERE auction_id='A'`)).length === 0);
  check('pass reports remaining 0 (converged)', full.remaining === 0, `remaining=${full.remaining}`);

  // ── PROOF 4: idempotent convergence — a third pass does nothing. ──
  const again = await sweepMintUrlV3({ limit: 500, dryRun: false });
  check('second full pass mints nothing', again.minted === 0, `minted=${again.minted}`);
  check('second full pass re-processes nothing (B/D excluded, current version)',
    again.scanned === 0, `scanned=${again.scanned}`);
  check('remaining still 0', again.remaining === 0);

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
