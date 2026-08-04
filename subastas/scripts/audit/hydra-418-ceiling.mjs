/**
 * HYDRA-418 — CEILING PRE-FLIGHT.
 *
 * WHY THIS EXISTS
 * ------------------------------------------------------------------------------------------------
 * The full soak (hydra-418-soak.mjs) is a RATE instrument. It costs two production builds, a seeded
 * fixture, and ~20 minutes of interleaved loads to produce a hit rate with a Wilson interval. That
 * is the right tool for "did the countdown fix move the needle", and the wrong tool for "is the
 * needle even readable".
 *
 * The 2026-08-04 run learned this the expensive way: it returned 100% #418 on BOTH arms in every
 * single cut. Not a null result — a SATURATED one. A second, unrelated defect (a Node-vs-Chromium
 * ICU divergence in the compound date+time formatter, which every auction detail page renders) was
 * firing on essentially every load, so the countdown fix's contribution was mathematically
 * invisible underneath it. Twenty minutes of careful interleaving measured a ceiling.
 *
 * A rate cannot be measured against a saturated background. So before any soak, ask the cheap
 * question first: does ONE load throw? If both arms hit on a single load, the background is at or
 * near the ceiling and the soak will tell you nothing until that background is removed. One load per
 * arm answers it in about thirty seconds.
 *
 * THIS IS NOT A RATE AND MUST NOT BE READ AS ONE
 * ------------------------------------------------------------------------------------------------
 * n=1 per arm. A hit proves the defect is present and frequent. A miss proves only that this
 * particular load did not trip it — for a race whose per-load probability is small, a clean miss is
 * the EXPECTED outcome even when the bug is fully present. So:
 *
 *     BOTH arms hit    → saturated. Fix the background defect before running any soak.
 *     BEFORE hits, AFTER clean  → the background defect is gone on AFTER. Now the soak is readable.
 *     BOTH clean       → says nothing about a rate. Proceed to the soak to measure one.
 *
 * MODES
 * ------------------------------------------------------------------------------------------------
 *   Two local arms (starts both servers itself, resolves detail URLs from the DB):
 *     HYDRA418_BEFORE_DIR=C:/path/to/before/subastas node scripts/audit/hydra-418-ceiling.mjs
 *
 *   Any set of absolute URLs — including PRODUCTION, which is how the post-deploy check is run:
 *     node scripts/audit/hydra-418-ceiling.mjs --url https://subastasactivas.com/subastas/subasta/<slug>
 *
 * No fixture is seeded in either mode. Unlike the countdown race, the ICU/time-zone class does not
 * need auctions parked in a particular tier — any detail page that renders a date exercises it — and
 * seeding is destructive, so a read-only pre-flight has no business doing it.
 */
import { chromium } from "playwright";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { Client } from "pg";
import { startNextServer, killServer } from "./lib/next-start-server.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const AFTER_DIR = process.env.HYDRA418_AFTER_DIR ?? path.resolve(HERE, "..", "..");
const BEFORE_DIR = process.env.HYDRA418_BEFORE_DIR ?? "";
const DATABASE_URL =
  process.env.HYDRA418_DATABASE_URL ?? "postgresql://dnk:dnk@localhost:5432/subastas_hydra418";
const PORT_AFTER = Number(process.env.HYDRA418_PORT_AFTER ?? 3428);
const PORT_BEFORE = Number(process.env.HYDRA418_PORT_BEFORE ?? 3429);

/** How many distinct detail pages to load per arm. Still one load EACH — this is not a rate. */
const URLS_PER_ARM = Number(process.env.HYDRA418_CEILING_URLS ?? 3);

// Same detector as the soak, deliberately verbatim: a pre-flight that classified hits differently
// from the instrument it gates would be worse than no pre-flight.
const HYDRATION_RE =
  /Minified React error #(418|419|421|422|423|424|425)|hydrat(e|ion|ing)?\b.*(fail|mismatch|error)|did not match|Text content does not match|server-rendered HTML|hydration failed/i;

const argv = process.argv.slice(2);
const explicitUrls = argv.reduce((acc, a, i) => (argv[i - 1] === "--url" ? [...acc, a] : acc), []);

function headSha(dir) {
  try {
    return execFileSync("git", ["-C", dir, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

/** Load one URL once and report whether a hydration error fired. */
async function loadOnce(context, url) {
  const page = await context.newPage();
  const diagnostics = [];
  const note = (t) => {
    if (t && HYDRATION_RE.test(t)) diagnostics.push(t.slice(0, 400));
  };
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") note(m.text());
  });
  page.on("pageerror", (e) => note(String(e?.message ?? e)));
  let navOk = true;
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    // The hydration error surfaces AFTER the client bundle runs, not at domcontentloaded. The soak
    // uses a 1200ms warm settle; match it so a "clean" here means the same thing it means there.
    await page.waitForTimeout(1500);
  } catch (e) {
    navOk = false;
    diagnostics.push(`NAV FAILED: ${String(e?.message ?? e).slice(0, 200)}`);
  }
  await page.close();
  return { url, navOk, hit: diagnostics.some((d) => HYDRATION_RE.test(d)), diagnostics };
}

/** Ask the APP for canonical detail URLs — never re-derive the slug grammar here. */
async function resolveDetailUrls(port, limit) {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  const { rows } = await client.query(
    `SELECT id FROM "Auction" WHERE "inScope" = true AND province IS NOT NULL AND municipality IS NOT NULL ORDER BY id LIMIT $1`,
    [limit],
  );
  await client.end();
  if (rows.length === 0) throw new Error(`no in-scope auctions in ${DATABASE_URL} — cannot resolve a detail URL`);
  const urls = [];
  for (const { id } of rows) {
    const r = await fetch(`http://127.0.0.1:${port}/auction/${id}`, { redirect: "manual" });
    const loc = r.headers.get("location");
    if (loc) urls.push(loc.startsWith("http") ? new URL(loc).pathname : loc);
  }
  if (urls.length === 0) throw new Error("no /auction/{id} redirect resolved to a detail URL");
  return urls;
}

function report(label, sha, results) {
  const hits = results.filter((r) => r.hit).length;
  console.log(`\n  ${label}${sha ? ` @ ${sha}` : ""}`);
  for (const r of results) {
    console.log(`    ${r.hit ? "#418 HIT " : r.navOk ? "clean    " : "NAV FAIL "} ${r.url}`);
    if (r.diagnostics.length) console.log(`        ${r.diagnostics[0]}`);
  }
  console.log(`    => ${hits}/${results.length} loads threw a hydration error`);
  return hits;
}

async function main() {
  const browser = await chromium.launch();

  // ---- MODE 1: explicit URLs (production post-deploy check) -------------------------------------
  if (explicitUrls.length) {
    console.log("HYDRA-418 CEILING — explicit URL mode (one load per URL, NOT a rate)");
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const results = [];
    for (const u of explicitUrls) results.push(await loadOnce(ctx, u));
    const hits = report("target", null, results);
    await browser.close();
    console.log(
      `\nVERDICT: ${hits > 0 ? "#418 STILL FIRING — the class is not closed on this target." : "no #418 observed on these loads. n is small; this is a ceiling check, not a rate."}`,
    );
    process.exit(hits > 0 ? 1 : 0);
  }

  // ---- MODE 2: two local arms -------------------------------------------------------------------
  if (!BEFORE_DIR) {
    console.error(
      "Nothing to do. Either pass --url <absolute url> (one or more), or set HYDRA418_BEFORE_DIR\n" +
        `to a baseline checkout to compare against AFTER (${AFTER_DIR}).`,
    );
    await browser.close();
    process.exit(2);
  }

  const arms = [
    { key: "AFTER ", dir: AFTER_DIR, port: PORT_AFTER, sha: headSha(AFTER_DIR) },
    { key: "BEFORE", dir: BEFORE_DIR, port: PORT_BEFORE, sha: headSha(BEFORE_DIR) },
  ];
  console.log("HYDRA-418 CEILING — two-arm mode (ONE load per URL per arm, NOT a rate)");
  for (const a of arms) console.log(`  ${a.key} ${a.sha}  ${a.dir}  :${a.port}`);

  const servers = [];
  try {
    for (const a of arms) {
      const proc = await startNextServer({ appDir: a.dir, port: a.port, label: a.key.trim(), env: { DATABASE_URL } });
      servers.push({ proc, port: a.port });
    }
    // Resolve the URLs ONCE, against AFTER, and load the SAME paths on both arms — differing paths
    // between arms would make the comparison meaningless.
    const paths = await resolveDetailUrls(arms[0].port, URLS_PER_ARM);
    console.log(`\n  paths under test:\n${paths.map((p) => `    ${p}`).join("\n")}`);

    const hits = {};
    for (const a of arms) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const results = [];
      for (const p of paths) results.push(await loadOnce(ctx, `http://127.0.0.1:${a.port}${p}`));
      await ctx.close();
      hits[a.key.trim()] = report(a.key.trim(), a.sha, results);
    }

    console.log("\n" + "-".repeat(96));
    const before = hits.BEFORE;
    const after = hits.AFTER;
    const n = URLS_PER_ARM;
    if (before === n && after === n) {
      console.log(
        `VERDICT: SATURATED — ${n}/${n} on BOTH arms. A rate cannot be measured against a background\n` +
          "that fires on every load. Find and remove the background defect before running the soak.",
      );
    } else if (before > 0 && after === 0) {
      console.log(
        `VERDICT: CEILING LIFTED — BEFORE ${before}/${n}, AFTER 0/${n}. The always-on defect is gone on\n` +
          "AFTER. The soak is now readable and can measure what remains.",
      );
    } else if (before === 0 && after === 0) {
      console.log(
        `VERDICT: no #418 on either arm at n=${n}. This says NOTHING about a rate — a low-probability\n` +
          "race is expected to miss at this n. Run the soak to measure one.",
      );
    } else {
      console.log(`VERDICT: MIXED — BEFORE ${before}/${n}, AFTER ${after}/${n}. Inspect the diagnostics above.`);
    }
  } finally {
    // Kill by PORT as well as pid — a reparented `next start` that keeps the port makes the NEXT
    // run measure the PREVIOUS build, silently. Sweep every arm port whether or not we got a pid.
    for (const s of servers) killServer(s.proc, s.port);
    for (const a of arms) killServer(null, a.port);
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
