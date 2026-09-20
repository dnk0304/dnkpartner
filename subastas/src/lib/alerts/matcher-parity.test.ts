/**
 * PARITY GUARD (wave218).
 *
 * The whole point of `src/lib/alerts/matcher.ts` is that Engine A (the cron
 * route that mails NEW matches) and Engine B (the dispatcher that mails
 * go_live) decide "does this alert match this auction?" with the SAME code.
 * The failure this guards against is silent: somebody re-inlines a criteria
 * ladder in one engine, the two drift, and a user is mailed by one engine and
 * not the other with no error anywhere.
 *
 * A type-level check cannot catch that (an inlined copy type-checks fine), so
 * this is a file-content assertion: both engines must import the shared module,
 * and neither may carry its own copy of the ladder.
 *
 * Pure — reads source files off disk, nothing else.
 * Run: npx tsx src/lib/alerts/matcher-parity.test.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

let failures = 0;
let checks = 0;
function ok(name: string, cond: boolean, detail?: string) {
  checks += 1;
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`);
  }
}
const section = (t: string) => console.log(`\n# ${t}`);

const repoRoot = process.cwd(); // the unit runner spawns tsx with cwd = subastas/
const read = (rel: string) => readFileSync(path.join(repoRoot, rel.split('/').join(path.sep)), 'utf8');

const ENGINE_A = 'src/app/api/alerts/check/route.ts';
const ENGINE_B = 'src/lib/dispatcher/index.ts';
const PLANNER = 'src/lib/dispatcher/alert-fanout.ts';

const sources: Record<string, string> = {
  [ENGINE_A]: read(ENGINE_A),
  [ENGINE_B]: read(ENGINE_B),
  [PLANNER]: read(PLANNER),
};

section('both engines reach the shared matcher');
for (const file of [ENGINE_A, ENGINE_B, PLANNER]) {
  ok(
    `${file} imports @/lib/alerts/matcher`,
    /from '@\/lib\/alerts\/matcher'/.test(sources[file]),
  );
}
ok(
  `${ENGINE_A} calls alertMatchesAuction`,
  /\balertMatchesAuction\s*\(/.test(sources[ENGINE_A]),
);
ok(
  `${PLANNER} calls alertMatchesAuction`,
  /\balertMatchesAuction\s*\(/.test(sources[PLANNER]),
);
ok(
  `${ENGINE_B} reaches it through ${PLANNER}`,
  /from '@\/lib\/dispatcher\/alert-fanout'/.test(sources[ENGINE_B]),
);

/**
 * Strip `//` and block comments with a character scanner, NOT a regex.
 *
 * A regex stripper is a known trap: `//.*$` without the `m` flag anchors at end
 * of FILE, and on a CRLF file `$` sits after the CR so nothing is stripped —
 * the guard then silently reads prose as code. A scanner has neither failure
 * mode. It is also string-literal aware, so a comment marker inside a quoted
 * string (a URL, say) does not blank the rest of the line.
 */
function stripComments(src: string): string {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && d === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      out += c;
      i += 1;
      while (i < n) {
        if (src[i] === '\\') {
          out += src[i] + (src[i + 1] ?? '');
          i += 2;
          continue;
        }
        out += src[i];
        if (src[i] === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

section('the comment stripper works (it is load-bearing for the next section)');
{
  ok(
    'strips a line comment',
    stripComments('a\n// alert.province\nb').includes('alert.province') === false,
  );
  ok(
    'strips a block comment',
    stripComments('a /* alert.province */ b').includes('alert.province') === false,
  );
  ok('keeps real code', stripComments('if (alert.province) {}').includes('alert.province') === true);
  ok(
    'keeps code before a trailing comment',
    stripComments('x(alert.province); // note').includes('alert.province') === true,
  );
  ok(
    'a comment marker inside a string does not blank the line',
    stripComments("const u = 'https://x'; const y = alert.province;").includes('alert.province') ===
      true,
  );
}

section('neither engine keeps a private copy of the criteria ladder');
// The historic inline ladder was a run of `alert.<field>` property reads.
// Scanned over COMMENT-STRIPPED source: both engines still DISCUSS the old
// ladder in their comments, and prose must never be mistaken for code.
const CRITERIA_FIELDS = [
  'province',
  'municipality',
  'category',
  'source',
  'auctionType',
  'propertyType',
  'statuses',
  'minPrice',
  'maxPrice',
  'keywords',
];
for (const file of [ENGINE_A, ENGINE_B]) {
  const code = stripComments(sources[file]);
  const inlined = CRITERIA_FIELDS.filter((f) =>
    new RegExp(`\\balert\\.${f}\\b`).test(code),
  );
  ok(
    `${file} has no inline alert.<criteria> reads`,
    inlined.length === 0,
    inlined.length ? `found: ${inlined.join(', ')}` : undefined,
  );
}

section('the guard can actually fire (detector proof)');
{
  // Same two assertions, run against strings we control — one that should pass
  // and one that should fail. If these two don't disagree, the regexes above
  // are inert and every "ok" above is worthless.
  const good = "import { alertMatchesAuction } from '@/lib/alerts/matcher';\nalertMatchesAuction(a, b);";
  const bad = 'if (alert.province && auction.province !== alert.province) return false;';
  ok(
    'import regex matches a real import line',
    /from '@\/lib\/alerts\/matcher'/.test(good),
  );
  ok(
    'import regex does NOT match a file without it',
    !/from '@\/lib\/alerts\/matcher'/.test(bad),
  );
  ok(
    'inline-ladder regex catches a re-inlined province check',
    /\balert\.province\b/.test(bad),
  );
  ok(
    'inline-ladder regex does not fire on the shared-import file',
    !/\balert\.province\b/.test(good),
  );
}

section('the shared matcher really does handle propertyType');
ok(
  'matcher.ts compares alert.propertyType',
  /alert\.propertyType\s*&&\s*auction\.propertyType\s*!==\s*alert\.propertyType/.test(
    read('src/lib/alerts/matcher.ts'),
  ),
);

console.log(`\nmatcher-parity: ${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
