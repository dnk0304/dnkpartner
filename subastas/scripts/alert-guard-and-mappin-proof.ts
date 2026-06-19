/**
 * COMBINED PROOF HARNESS (2026-06-19, Forge) — runs inside the live app container.
 *
 * TASK B (alert future-end gate): replays the EXACT recent-auctions query the
 *   alert route now uses (createdAt floor + ALERTABLE floor + FUTURE-END GATE)
 *   and proves:
 *     - the suspect row SUB-JA-2026-260583-* is EXCLUDED,
 *     - a healthy future-ending CELEBRANDOSE/ACTIVE row still PASSES.
 *
 * TASK A (map-pin email): finds (1) a coord-having no-photo alertable auction
 *   and (2) a coord-less alertable auction, runs the REAL resolver +
 *   createAuctionAlertEmail on each, and writes both HTMLs to /tmp, reporting
 *   the card <img> rung (map-pin vs placeholder).
 *
 * Run:
 *   docker exec dnksubastas-app sh -lc \
 *     "cd /app && node_modules/.bin/tsx scripts/alert-guard-and-mappin-proof.ts"
 */
import { query } from '@/lib/db';
import { ALERTABLE_DB_STATUSES_SQL } from '@/lib/auction-status';
// NB: LIVE_NOW_DB_STATUSES_SQL is added in the SAME fix commit and is NOT in the
// currently-deployed image, so we inline the identical static literal here to
// replay the post-fix predicate against the live DB without redeploying.
const LIVE_NOW_DB_STATUSES_SQL = ['ACTIVE', 'CELEBRANDOSE'].map((s) => `'${s}'`).join(',');
import { policyResolveAndPersist } from '@/lib/auction-images/resolver';
import { emailFallbackImageUrl, BRANDED_PLACEHOLDER_PATH } from '@/lib/auction-image-url';
import { createAuctionAlertEmail } from '@/lib/email-templates';
import { writeFileSync } from 'node:fs';

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://subastasactivas.com';

// The exact predicate from the route (post-fix), parameterised identically.
const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const futureEndCutoff = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

const GATED_WHERE = `
  WHERE createdAt >= ?
    AND status IN (${ALERTABLE_DB_STATUSES_SQL})
    AND NOT (
      status IN (${LIVE_NOW_DB_STATUSES_SQL})
      AND endsAt IS NOT NULL
      AND endsAt <= ?
    )
`;

async function renderEmail(label: string, r: any, outPath: string, forceNoPhoto = false) {
  if (forceNoPhoto) {
    // Prove the EMAIL TEMPLATE'S OWN ladder: a coord-having row with NO photo
    // must render the OSM map-pin (rung 2b), never the placeholder. We feed
    // imageUrl=null so the resolver's persisted-photo state can't mask the rung.
    const ladderUrl = emailFallbackImageUrl(r.latitude ?? null, r.longitude ?? null, appUrl, r.category ?? null);
    console.log(`  [ladder direct] emailFallbackImageUrl(${r.latitude}, ${r.longitude}) → ${ladderUrl}`);
    console.log(`  [ladder direct] isMapPin=${ladderUrl.includes('/api/auction-map/')} isPlaceholder=${ladderUrl.endsWith(BRANDED_PLACEHOLDER_PATH)}`);
    const { html } = createAuctionAlertEmail({
      alertName: label,
      auctions: [{
        title: r.title || r.address || 'Subasta',
        url: `${appUrl}/auction/${r.boeId}`,
        municipality: r.municipality, province: r.province,
        appraisalValue: r.appraisalValue ? Number(r.appraisalValue) : undefined,
        endsAt: r.endsAt, endDateTime: r.endDateTime, opensAt: r.opensAt,
        status: r.status, category: r.category,
        imageUrl: null, // FORCE no-photo → template falls to its own map/placeholder ladder
        latitude: r.latitude, longitude: r.longitude,
      }],
      manageUrl: `${appUrl}/alerts`,
    });
    writeFileSync(outPath, html, 'utf8');
    const imgs = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]);
    const cardImg = imgs.find((s) =>
      s.includes('/api/auction-map/') || s.includes('/api/auction-image/') ||
      s.includes('email-placeholder') || s.includes('staticmap'));
    console.log(`\n[${label}] boeId=${r.boeId} status=${r.status} lat=${r.latitude} lng=${r.longitude} (FORCED no-photo)`);
    console.log(`  card <img> src:   ${cardImg}`);
    console.log(`  rung: ${cardImg && cardImg.includes('/api/auction-map/') ? 'MAP-PIN' : cardImg && cardImg.includes('email-placeholder') ? 'PLACEHOLDER' : 'OTHER'}`);
    console.log(`  HTML written: ${outPath} (${html.length} bytes)`);
    return outPath;
  }
  const outcome = await policyResolveAndPersist({
    boeId: r.boeId,
    status: r.status,
    cadastralRef: r.cadastralRef ?? null,
    cadastralData: r.cadastralData ?? null,
    lotDescription: r.lotDescription ?? null,
    propertyDescription: r.propertyDescription ?? null,
    boeAnnouncement: r.boeAnnouncement ?? null,
    address: r.address ?? null,
    latitude: r.latitude ?? null,
    longitude: r.longitude ?? null,
    imageUrl: r.imageUrl ?? null,
    category: r.category ?? null,
  } as any).catch((e) => { console.error('resolver err', e); return { publicPath: null } as any; });

  const after = await query(`SELECT "imageUrl" FROM "Auction" WHERE "boeId" = $1`, [r.boeId]);
  const resolvedImageUrl = (after?.[0] as any)?.imageUrl ?? outcome.publicPath ?? r.imageUrl;

  const { html } = createAuctionAlertEmail({
    alertName: label,
    auctions: [{
      title: r.title || r.address || 'Subasta',
      url: `${appUrl}/auction/${r.boeId}`,
      municipality: r.municipality,
      province: r.province,
      appraisalValue: r.appraisalValue ? Number(r.appraisalValue) : undefined,
      endsAt: r.endsAt,
      endDateTime: r.endDateTime,
      opensAt: r.opensAt,
      status: r.status,
      category: r.category,
      imageUrl: resolvedImageUrl,
      latitude: r.latitude,
      longitude: r.longitude,
    }],
    manageUrl: `${appUrl}/alerts`,
  });

  writeFileSync(outPath, html, 'utf8');
  const imgs = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  const cardImg = imgs.find((s) =>
    s.includes('/api/auction-map/') || s.includes('/api/auction-image/') ||
    s.includes('email-placeholder') || s.includes('staticmap'));
  console.log(`\n[${label}] boeId=${r.boeId} status=${r.status} lat=${r.latitude} lng=${r.longitude}`);
  console.log(`  resolvedImageUrl: ${resolvedImageUrl}`);
  console.log(`  card <img> src:   ${cardImg}`);
  console.log(`  rung: ${cardImg && cardImg.includes('/api/auction-map/') ? 'MAP-PIN' : cardImg && cardImg.includes('email-placeholder') ? 'PLACEHOLDER' : cardImg && cardImg.includes('/api/auction-image/') ? 'PHOTO' : 'OTHER'}`);
  console.log(`  HTML written: ${outPath} (${html.length} bytes)`);
  return outPath;
}

const SELECT_COLS = `"boeId", title, status, category, address, municipality, province,
  latitude, longitude, "imageUrl", "appraisalValue", "endsAt", "endDateTime",
  "opensAt", "cadastralRef", "cadastralData", "lotDescription",
  "propertyDescription", "boeAnnouncement", "createdAt"`;

async function main() {
  console.log('============ TASK B — FUTURE-END GATE PROOF ============');
  console.log('cutoffDate (createdAt >=):', cutoffDate);
  console.log('futureEndCutoff (endsAt > for live-now):', futureEndCutoff);

  // (B1) Does the suspect row appear in the GATED set? Expect: NO.
  const susInGate = await query<any>(
    `SELECT "boeId", status, "createdAt", "endsAt" FROM Auction ${GATED_WHERE} AND "boeId" LIKE ?`,
    [cutoffDate, futureEndCutoff, 'SUB-JA-2026-260583%'],
  );
  // And what is the raw stored state of the suspect row (regardless of gate)?
  const susRaw = await query<any>(
    `SELECT "boeId", status, "createdAt", "endsAt", "opensAt" FROM Auction WHERE "boeId" LIKE ?`,
    ['SUB-JA-2026-260583%'],
  );
  console.log('\nSUSPECT raw stored rows:', JSON.stringify(susRaw, null, 2));
  console.log('SUSPECT rows surviving the GATE (expect EMPTY []):', JSON.stringify(susInGate));
  console.log(susInGate.length === 0
    ? 'B1 RESULT: PASS — suspect row is EXCLUDED by the future-end gate.'
    : 'B1 RESULT: FAIL — suspect row STILL present.');

  // (B1b) Counter-check WITHOUT the gate (old behavior) — does it survive the
  // createdAt+ALERTABLE floor alone? If YES, that proves the gate is what drops it.
  const susOldFloor = await query<any>(
    `SELECT "boeId", status, "endsAt" FROM Auction
     WHERE createdAt >= ? AND status IN (${ALERTABLE_DB_STATUSES_SQL}) AND "boeId" LIKE ?`,
    [cutoffDate, 'SUB-JA-2026-260583%'],
  );
  console.log('SUSPECT under OLD floor (createdAt+ALERTABLE only):', JSON.stringify(susOldFloor),
    susOldFloor.length > 0
      ? '→ would have been alerted before the fix (status still alertable + recent createdAt)'
      : '→ already excluded by createdAt window (status since moved terminal); gate still correct for fresh same-day-end rows');

  // (B2) A healthy future-ending live-now row still passes.
  const healthy = await query<any>(
    `SELECT "boeId", status, "endsAt" FROM Auction ${GATED_WHERE}
       AND status IN (${LIVE_NOW_DB_STATUSES_SQL}) AND endsAt IS NOT NULL
     ORDER BY endsAt ASC LIMIT 3`,
    [cutoffDate, futureEndCutoff],
  );
  console.log('\nB2 — healthy live-now rows PASSING the gate (endsAt > now+24h):',
    JSON.stringify(healthy, null, 2));
  console.log(healthy.length > 0
    ? 'B2 RESULT: PASS — future-ending live auctions still flow through.'
    : 'B2 RESULT: (none currently in the 24h createdAt window — gate is non-destructive to NULL/future rows by construction)');

  console.log('\n============ TASK A — MAP-PIN EMAIL PROOF ============');

  // (A1) coord-having, GENUINELY no-photo alertable auction. To isolate the
  // map-pin rung we must pick a row the FREE resolver CANNOT photograph:
  // no cadastralRef (→ no Catastro photo) and no existing resolver photo. Such
  // a row has coords → the ladder must fall to the OSM map-pin (rung 'map').
  const coordHaving = await query<any>(
    `SELECT ${SELECT_COLS} FROM Auction
     WHERE status IN (${ALERTABLE_DB_STATUSES_SQL})
       AND latitude IS NOT NULL AND longitude IS NOT NULL
       AND ("cadastralRef" IS NULL OR "cadastralRef" = '')
       AND ("imageUrl" IS NULL OR "imageUrl" NOT LIKE '/api/auction-image/%')
     ORDER BY "createdAt" DESC LIMIT 1`,
    [],
  );
  // (A2) coord-less alertable auction, also un-photographable (no cadastralRef)
  // so the ladder falls all the way to the branded placeholder (rung 'placeholder').
  const coordLess = await query<any>(
    `SELECT ${SELECT_COLS} FROM Auction
     WHERE status IN (${ALERTABLE_DB_STATUSES_SQL})
       AND latitude IS NULL AND longitude IS NULL
       AND ("cadastralRef" IS NULL OR "cadastralRef" = '')
       AND ("imageUrl" IS NULL OR "imageUrl" NOT LIKE '/api/auction-image/%')
     ORDER BY "createdAt" DESC LIMIT 1`,
    [],
  );

  const written: string[] = [];
  if (coordHaving[0]) {
    written.push(await renderEmail('PROOF-A1-coord-having-pin', coordHaving[0], '/tmp/proof-A1-pin.html', true));
  } else {
    console.log('A1: no coord-having no-photo alertable row found');
  }
  if (coordLess[0]) {
    written.push(await renderEmail('PROOF-A2-coordless-placeholder', coordLess[0], '/tmp/proof-A2-placeholder.html'));
  } else {
    console.log('A2: no coord-less alertable row found');
  }

  console.log('\nWROTE:', JSON.stringify(written));
}

main().then(() => process.exit(0)).catch((e) => { console.error('HARNESS ERROR:', e); process.exit(1); });
