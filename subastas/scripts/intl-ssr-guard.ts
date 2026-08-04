/**
 * intl-ssr-guard — the GATE for the ICU/SSR formatting class.
 *
 * WHY THIS EXISTS
 * ------------------------------------------------------------------------------------------------
 * React error #418 is a hydration mismatch: the SSR HTML and the first client render disagree
 * byte-for-byte. Any `Intl.*` / `toLocale*` call that renders during SSR is a candidate, because
 * the two sides do NOT share an internationalisation implementation:
 *
 *   - ICU SKEW.  Node bundles one ICU version, Chromium another. The same
 *     `Intl.DateTimeFormat("es-ES", { dateStyle: "long", timeStyle: "short" })` renders
 *     "5 de agosto de 2026, 8:56" on Node and "5 de agosto de 2026, a las 8:56" on Chromium — the
 *     compound date+time pattern's LITERAL connector changed between CLDR releases. Every detail
 *     page hit this, which is why ~100% of detail loads threw #418 in production.
 *
 *   - TIME ZONE.  With no `timeZone` option the formatter uses the HOST zone: UTC in the container,
 *     Europe/Madrid in the visitor's browser. Same instant, different wall clock, different string.
 *
 *   - IMPLICIT LOCALE.  `x.toLocaleString()` with no locale argument resolves to the host default
 *     locale — the container's (usually en-US) versus the visitor's.
 *
 * A one-off sweep decays: the next component that formats a date reintroduces the bug and nobody
 * notices until prod. So the class is enforced mechanically instead. This guard runs in `npm run
 * build`, exactly like `guard:url-v3`, so a violation cannot reach a deploy.
 *
 * THE RULE
 * ------------------------------------------------------------------------------------------------
 * Do not construct a date/time formatter at a call site. Use the pinned helpers in
 * `src/components/observatory/format.ts` (formatDateLong / formatDateMed / formatDateShort /
 * formatTime), which pin BOTH the locale and the time zone and compose compound strings from an
 * EXPLICIT connector rather than trusting ICU's literal parts.
 *
 * WAIVERS
 * ------------------------------------------------------------------------------------------------
 * A line may be exempted with a trailing or preceding comment:
 *
 *     // intl-gate-ok: <reason>
 *
 * Legitimate reasons are narrow — e.g. a string that is only ever produced on the server and never
 * rendered into HTML (an outbound email body), or an admin-only client screen that is never
 * server-rendered with data. Write the reason; "it's fine" is not a reason.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = join(__dirname, "..", "src");

type Finding = { file: string; line: number; rule: string; text: string; why: string };

/**
 * The scan is CALL-SITE based, not line based.
 *
 * A line-based scan gets two things wrong, and both of them cost real review time on the first run
 * of this gate:
 *
 *   - FALSE NEGATIVE. Options objects are usually written across several lines, so `timeZone:` sits
 *     nowhere near `new Intl.DateTimeFormat(`. A line regex declares the site unpinned when it is
 *     pinned, and the only way out is a waiver comment — which trains people to waive.
 *   - FALSE POSITIVE. This file, and format.ts, DISCUSS `dateStyle`/`timeStyle` in prose. A line
 *     scan flags the documentation that explains the rule.
 *
 * So each match is expanded to its full parenthesised argument list by balancing brackets, and the
 * check runs against that whole extent. Matches that begin inside a comment are skipped.
 */
type Rule = {
  id: string;
  why: string;
  /** Finds the call. The match index is where the argument-list scan begins. */
  find: RegExp;
  /** Given the balanced argument text, is this site a violation? */
  bad: (args: string) => boolean;
};

const RULES: Rule[] = [
  {
    id: "no-unpinned-datetimeformat",
    why: "Intl.DateTimeFormat without an explicit `timeZone` renders the container's zone on the server and the visitor's zone in the browser.",
    find: /new\s+Intl\.DateTimeFormat\s*\(/g,
    bad: (args) => !/timeZone/.test(args),
  },
  {
    id: "no-datestyle-timestyle-pair",
    why: "dateStyle + timeStyle in ONE formatter lets ICU pick the compound connector literal, and Node's CLDR disagrees with Chromium's (', ' vs ', a las '). Use two formatters joined by a connector you own.",
    find: /new\s+Intl\.DateTimeFormat\s*\(/g,
    bad: (args) => /dateStyle/.test(args) && /timeStyle/.test(args),
  },
  {
    id: "no-tolocale-date-time",
    why: "toLocaleDateString/toLocaleTimeString resolve the host locale AND the host time zone.",
    find: /\.toLocale(Date|Time)String\s*\(/g,
    bad: (args) => !/timeZone/.test(args),
  },
  {
    id: "no-implicit-locale-tolocalestring",
    why: "toLocaleString() with no locale argument resolves the host default locale — en-US in the container, the visitor's locale in the browser (so '1,234' server-side vs '1.234' for a Spanish visitor).",
    find: /\.toLocaleString\s*\(/g,
    bad: (args) => args.trim() === "",
  },
  {
    id: "no-date-tolocalestring",
    why: "toLocaleString() on a Date resolves the host time zone.",
    find: /new\s+Date\s*\([^)]*\)\s*\.toLocaleString\s*\(/g,
    bad: (args) => !/timeZone/.test(args),
  },
  {
    id: "no-relativetimeformat",
    why: "Intl.RelativeTimeFormat wording is CLDR data and shifts between ICU versions; it is also inherently clock-dependent, so the server and the client can land on different phrasings.",
    find: /new\s+Intl\.RelativeTimeFormat\s*\(/g,
    bad: () => true,
  },
];

const WAIVER = /\/\/\s*intl-gate-ok:/;

/**
 * Read the balanced argument list starting at `open` (the index of the `(`). Returns the inner text.
 * Quote- and template-aware enough for real source; a formatter call has no exotic syntax in it.
 */
function balancedArgs(src: string, open: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  return src.slice(open + 1); // unbalanced — treat the rest of the file as the args, fail loudly
}

/** Is this offset inside a `//` line comment or a `/* *\/` block comment? */
function inComment(src: string, index: number): boolean {
  const lineStart = src.lastIndexOf("\n", index - 1) + 1;
  const before = src.slice(lineStart, index);
  if (before.includes("//")) return true;
  if (/^\s*\*/.test(before)) return true; // continuation line of a block comment
  const lastOpen = src.lastIndexOf("/*", index);
  const lastClose = src.lastIndexOf("*/", index);
  return lastOpen > lastClose;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

/**
 * The dynamic half: render the pinned formatters twice under different host zones and require
 * byte-identical output. See scripts/intl-ssr-tzprobe.ts for why this is the #418 in miniature.
 * Skippable with INTL_GATE_SKIP_TZPROBE=1 for the rare environment without a dev toolchain.
 */
function tzProbe(): { ok: boolean; detail: string } {
  if (process.env.INTL_GATE_SKIP_TZPROBE === "1") {
    return { ok: true, detail: "tz-probe SKIPPED (INTL_GATE_SKIP_TZPROBE=1)" };
  }
  const probe = join(__dirname, "intl-ssr-tzprobe.ts");
  const run = (tz: string) =>
    // shell:true — on Windows `npx` is a .cmd and Node >=18.20 rejects it from execFile without it.
    spawnSync("npx", ["tsx", probe], {
      encoding: "utf8",
      shell: true,
      env: { ...process.env, TZ: tz },
    });

  const a = run("UTC");
  const b = run("Europe/Madrid");
  if (a.status !== 0 || b.status !== 0) {
    return {
      ok: false,
      detail:
        "tz-probe FAILED TO RUN — the probe must execute or this half of the gate is vacuous.\n" +
        `  TZ=UTC exit=${a.status}\n${(a.stderr || "").trim().slice(0, 800)}\n` +
        `  TZ=Europe/Madrid exit=${b.status}\n${(b.stderr || "").trim().slice(0, 800)}`,
    };
  }
  const la = a.stdout.trim().split(/\r?\n/);
  const lb = b.stdout.trim().split(/\r?\n/);
  if (la.length === 0) {
    return { ok: false, detail: "tz-probe produced NO output — refusing to pass on an empty comparison." };
  }
  const diffs: string[] = [];
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] !== lb[i]) diffs.push(`    UTC   : ${la[i] ?? "<missing>"}\n    Madrid: ${lb[i] ?? "<missing>"}`);
  }
  if (diffs.length) {
    return {
      ok: false,
      detail:
        `tz-probe FAIL — ${diffs.length} of ${la.length} rendered value(s) depend on the host time zone.\n` +
        "Each difference below is a React #418 waiting to happen: the container renders the left\n" +
        "string into the SSR HTML and a Spanish visitor's browser renders the right one.\n" +
        diffs.join("\n"),
    };
  }
  return { ok: true, detail: `tz-probe PASS — ${la.length} rendered values identical under TZ=UTC and TZ=Europe/Madrid.` };
}

function main(): number {
  const files = walk(ROOT);
  const findings: Finding[] = [];

  for (const file of files) {
    const src = readFileSync(file, "utf8");
    const lines = src.split(/\r?\n/);
    // Offset -> 1-based line number, without recomputing the split per match.
    const lineOf = (index: number) => src.slice(0, index).split(/\r?\n/).length;

    for (const rule of RULES) {
      rule.find.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = rule.find.exec(src)) !== null) {
        if (inComment(src, m.index)) continue;
        const open = src.indexOf("(", m.index + m[0].length - 1);
        if (open === -1) continue;
        if (!rule.bad(balancedArgs(src, open))) continue;

        const ln = lineOf(m.index);
        const line = lines[ln - 1] ?? "";
        const prev = lines[ln - 2] ?? "";
        if (WAIVER.test(line) || WAIVER.test(prev)) continue;

        findings.push({
          file: relative(join(ROOT, ".."), file).split(sep).join("/"),
          line: ln,
          rule: rule.id,
          text: line.trim(),
          why: rule.why,
        });
      }
    }
  }

  const probe = tzProbe();

  if (findings.length === 0 && probe.ok) {
    console.log(`intl-ssr-guard: PASS — ${files.length} files, 0 unpinned Intl/toLocale date-time sites.`);
    console.log(`intl-ssr-guard: ${probe.detail}`);
    return 0;
  }

  // Always surface the probe result, pass or fail — a gate whose second half runs silently is a
  // gate nobody can tell is still running.
  (probe.ok ? console.log : console.error)(`intl-ssr-guard: ${probe.detail}\n`);
  if (findings.length === 0) return 1;

  console.error(`intl-ssr-guard: FAIL — ${findings.length} unpinned site(s) across ${files.length} files.\n`);
  const byRule = new Map<string, Finding[]>();
  for (const f of findings) {
    const list = byRule.get(f.rule) ?? [];
    list.push(f);
    byRule.set(f.rule, list);
  }
  for (const [rule, list] of byRule) {
    console.error(`[${rule}] ${list.length} site(s)`);
    console.error(`  why: ${list[0].why}`);
    for (const f of list) console.error(`    ${f.file}:${f.line}  ${f.text.slice(0, 120)}`);
    console.error("");
  }
  console.error(
    "Fix: route the value through src/components/observatory/format.ts (pinned locale + pinned\n" +
      "time zone + explicit connector), or waive the line with `// intl-gate-ok: <reason>`.",
  );
  return 1;
}

process.exit(main());
