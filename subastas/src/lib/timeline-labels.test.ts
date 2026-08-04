/**
 * I18N-1 unit tests — locks the tracker-status/reason translation layer.
 * Run with: npx tsx src/lib/timeline-labels.test.ts
 * No test framework — plain assertions, exit-code-driven (repo convention).
 *
 * Guards:
 *   1. Every Prisma AuctionStatus enum member maps to a frontend key AND that
 *      key resolves to a Spanish label — with a `never` guard so a new enum
 *      member fails the build.
 *   2. Every known reason code renders Spanish or renders nothing — never the
 *      raw value, never SCREAMING_SNAKE_CASE.
 *   3. An unknown reason returns the generic Spanish fallback AND is counted
 *      (a silent fallback would just hide the bug).
 */
import {
  DB_STATUS_TO_FRONTEND,
  frontendStatusOf,
  assertExhaustiveStatus,
  TIMELINE_REASON_LABELS,
  TIMELINE_REASON_FALLBACK,
  resolveTimelineReason,
  getUnmappedTimelineCounts,
  __resetUnmappedTimelineCounts,
  type TimelineReasonCode,
} from './timeline-labels';
import { getStatusMeta } from '../components/observatory/status';

let failures = 0;
function check(name: string, cond: boolean) {
  if (cond) console.log(`  ok   ${name}`);
  else {
    console.error(`  FAIL ${name}`);
    failures++;
  }
}

/** Anything that looks like an internal identifier must never be user-facing. */
const SCREAMING = /[A-Z_]{6,}/;
const SNAKEY = /^[a-z0-9]+(_[a-z0-9]+)+$/;

// --- 1. Prisma enum exhaustiveness ----------------------------------------
console.log('AuctionStatus enum → Spanish label');

// The `never` guard. If a member is added to the Prisma enum, DB_STATUS_TO_FRONTEND
// is missing a key → tsc fails there; if a member is REMOVED, the switch below
// stops being exhaustive → tsc fails here. Either way: build break, not a leak.
const ALL_STATUSES = Object.keys(DB_STATUS_TO_FRONTEND) as Array<
  keyof typeof DB_STATUS_TO_FRONTEND
>;
for (const s of ALL_STATUSES) {
  switch (s) {
    case 'PROXIMA_APERTURA':
    case 'CELEBRANDOSE':
    case 'SUSPENDIDA':
    case 'CANCELADA':
    case 'CONCLUIDA_PORTAL':
    case 'FINALIZADA_AUTORIDAD':
    case 'PRE_AUCTION':
    case 'ACTIVE':
    case 'FINISHED':
    case 'SUSPENDED':
    case 'CANCELLED':
      break;
    default:
      assertExhaustiveStatus(s);
  }
  const key = frontendStatusOf(s);
  const label = getStatusMeta(key).label;
  check(`${s} → "${label}"`, !!label && !SCREAMING.test(label) && label !== s);
}

check('null status → Spanish neutral label', getStatusMeta(frontendStatusOf(null)).label === 'Concluida');
__resetUnmappedTimelineCounts();
const bogus = frontendStatusOf('SOME_FUTURE_STATUS');
check('unknown status never echoes the raw value', bogus === 'concluida-portal');
check(
  'unknown status is counted',
  getUnmappedTimelineCounts().statuses['SOME_FUTURE_STATUS'] === 1,
);

// --- 2. Known reason codes -------------------------------------------------
console.log('AuctionStatusHistory.reason → Spanish label');
__resetUnmappedTimelineCounts();

const KNOWN = Object.keys(TIMELINE_REASON_LABELS) as TimelineReasonCode[];
check('the live DB values are both covered', KNOWN.includes('WITHDRAWN_PRE_AUCTION') && KNOWN.includes('audit_cleanup_2026-05-29'));

for (const code of KNOWN) {
  const r = resolveTimelineReason(code);
  check(`${code} is not a fallback`, r.usedFallback === false);
  check(`${code} → code preserved`, r.code === code);
  if (r.label === null) {
    check(`${code} suppressed on purpose`, true);
  } else {
    check(
      `${code} → "${r.label}" is Spanish prose, not an internal`,
      r.label !== code && !SCREAMING.test(r.label) && !SNAKEY.test(r.label),
    );
  }
}

check('WITHDRAWN_PRE_AUCTION renders Spanish', resolveTimelineReason('WITHDRAWN_PRE_AUCTION').label === 'Retirada antes de la apertura');
check('audit_cleanup_2026-05-29 renders nothing', resolveTimelineReason('audit_cleanup_2026-05-29').label === null);

// --- 3. Fallback: generic, never raw, and COUNTED -------------------------
console.log('unknown reason → counted fallback');
const unknown = resolveTimelineReason('SOME_NEW_INTERNAL_SENTINEL');
check('fallback label is the generic Spanish one', unknown.label === TIMELINE_REASON_FALLBACK);
check('fallback label is not SCREAMING_SNAKE', !SCREAMING.test(unknown.label ?? ''));
check('fallback never echoes the raw value', unknown.label !== 'SOME_NEW_INTERNAL_SENTINEL');
check('fallback exposes no narrow code', unknown.code === null);
check('fallback is flagged', unknown.usedFallback === true);
check(
  'fallback is counted, not silent',
  getUnmappedTimelineCounts().reasons['SOME_NEW_INTERNAL_SENTINEL'] === 1,
);
resolveTimelineReason('SOME_NEW_INTERNAL_SENTINEL');
check(
  'repeat hits accumulate',
  getUnmappedTimelineCounts().reasons['SOME_NEW_INTERNAL_SENTINEL'] === 2,
);

// --- null/empty -----------------------------------------------------------
for (const empty of [null, undefined, '', '   ']) {
  const r = resolveTimelineReason(empty);
  check(`${JSON.stringify(empty)} → nothing rendered, no fallback`, r.label === null && r.usedFallback === false);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
