/**
 * verify-v4-outcome-parity — Ken blocker §4b.1 (2026-08-13).
 *
 * The v4 outcome facet REVERSES the URL (`/resultados/{outcome}/{prov}` →
 * `/resultados/{prov}/{outcome}`). A reversal is only safe if the new URL shows
 * the SAME auctions; if it quietly showed the unfiltered province, the 301 would
 * be pointing 200k crawled URLs at the wrong content and the mistake would look
 * exactly like a working page.
 *
 * The report that raised this saw the heading "Subastas en Madrid" on
 * `/resultados/madrid/adjudicadas`. That was a LABEL defect (`nodeLabel` had no
 * outcome branch — fixed in `archive-node-view.tsx`), but a wrong heading is
 * indistinguishable from a wrong filter from the outside, so this script settles
 * it from the inside, two ways:
 *
 *   PROOF A — STRUCTURAL, and it covers ALL 52 provinces, not a sample.
 *     `archiveNodeWhere({prov, outcome})` must be the SAME Prisma predicate the
 *     legacy path composes (`readList({outcome, province})`). Both are built here
 *     from the app's own functions with one shared `now`, then compared as JSON.
 *     If they are identical objects, list identity is a property of the code
 *     rather than something five provinces happened to agree on.
 *
 *   PROOF B — EMPIRICAL, and it lives in `verify-v4-redirects.sh` rather than
 *     here: `readList` is `unstable_cache`-wrapped and throws outside a Next
 *     request, so the only honest empirical comparison runs against a real
 *     server. See the note at its call site below.
 *
 * Run against the P2 fixture DB:
 *   npx tsx scripts/verify-v4-outcome-parity.ts
 */

import { config as loadEnv } from 'dotenv';
loadEnv();

import { PROVINCE_SLUG_TO_DB_KEY } from '../src/lib/seo/slugs';
import { archiveNodeWhere } from '../src/lib/registro/archive-node-read';
import { outcomeWhere } from '../src/lib/registro/outcome-query';
import { registryOutcomeFromSlug } from '../src/lib/registro/registro-ui';
import type { AuctionOutcome } from '../src/lib/seo/auction-outcome';

const OUTCOME_SLUGS = ['adjudicadas', 'desiertas', 'canceladas', 'finalizadas-sin-resultado'];

let pass = 0;
let fail = 0;
function ck(name: string, ok: boolean, detail = '') {
  if (ok) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function run() {
  // ---- PROOF A: the predicates are the same object, for every province -----
  console.log('--- A: predicate identity (all provinces x all outcomes) ---');
  const now = new Date('2026-08-13T12:00:00.000Z');
  let structuralMismatches = 0;
  for (const provSlug of Object.keys(PROVINCE_SLUG_TO_DB_KEY)) {
    const dbKey = PROVINCE_SLUG_TO_DB_KEY[provSlug];
    for (const slug of OUTCOME_SLUGS) {
      const outcome = registryOutcomeFromSlug(slug) as AuctionOutcome;
      // What the LEGACY route composes inside `_readList`.
      const legacy = { AND: [outcomeWhere(outcome, now), { province: dbKey }] };
      // What the v4 node resolves to.
      const v4 = archiveNodeWhere({ prov: provSlug, outcome: slug }, now);
      if (JSON.stringify(legacy) !== JSON.stringify(v4)) {
        structuralMismatches++;
        if (structuralMismatches <= 3) {
          console.log(`       ${provSlug}/${slug}\n         legacy=${JSON.stringify(legacy)}\n         v4    =${JSON.stringify(v4)}`);
        }
      }
    }
  }
  ck(
    `predicate identical for ${Object.keys(PROVINCE_SLUG_TO_DB_KEY).length} provinces x ${OUTCOME_SLUGS.length} outcomes`,
    structuralMismatches === 0,
    `${structuralMismatches} mismatches`,
  );

  // ---- PROOF B lives in the shell harness, and that is deliberate ---------
  // `readList` is `unstable_cache`-wrapped, so calling it outside a Next request
  // throws "incrementalCache missing" — a node script cannot reach the real
  // render path. Comparing the two shapes through a RUNNING SERVER is also the
  // stronger test: while the switch is dark BOTH URLs serve 200, so
  // `verify-v4-redirects.sh` diffs the actual auction hrefs on
  // /resultados/{outcome}/{prov} against /resultados/{prov}/{outcome} across
  // five provinces. See its "outcome parity" block.
  console.log('  (list parity runs in scripts/verify-v4-redirects.sh — see note)');

  console.log(`\nPASS=${pass} FAIL=${fail}`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
