// @ts-nocheck
/**
 * ================================================================================================
 * HYDRA-418 (SUBASTAS) — BEFORE/AFTER SOAK for fix/hydra-418-clock-in-render
 * ================================================================================================
 *
 * WHY THIS EXISTS
 * ------------------------------------------------------------------------------------------------
 * Ken's bar, after the CRM incident: no unmeasured hydration fix ships. The CRM's analogous
 * "hygiene" fix SEPTUPLED the production hydration rate, and it had a mechanism with perfectly
 * adequate arithmetic — exactly like this one. Arithmetic is not evidence. A rate is.
 *
 * The confound that made the CRM number explode was UNMASKING: that fix removed
 * `suppressHydrationWarning`, so errors which had always been happening started being REPORTED, and
 * a genuine improvement could have looked like a regression (or vice versa). That confound does NOT
 * apply here and this harness asserts it rather than assuming it: `assertNoSuppression()` below
 * greps both arms' source for `suppressHydrationWarning` and requires zero occurrences in BOTH. If
 * anybody ever adds one, this gate stops rather than quietly reporting an uninterpretable delta.
 *
 * WHAT IS COMPARED
 * ------------------------------------------------------------------------------------------------
 *   AFTER  = fix/hydra-418-clock-in-render @ 4046872   (server owns the clock)
 *   BEFORE = its parent                    @ 7a28dbd   (lazy initializers read Date.now())
 *
 * THE ARMS RUN AT THE SAME TIME, NOT ONE AFTER THE OTHER
 * ------------------------------------------------------------------------------------------------
 * Both servers are started together on two ports and loads ALTERNATE between them, matched pair by
 * pair. This is the single most important design decision here, and it is a direct consequence of
 * what is being measured: the bug is a race between the server render's clock and the client
 * render's clock, so its rate is a function of MACHINE LOAD. Run BEFORE for ten minutes and then
 * AFTER for ten minutes and any drift in CPU contention, thermal state, disk cache or background
 * work lands entirely on one arm and is indistinguishable from the fix. Interleaving makes both
 * arms sample the same load distribution, the same wall clock, and the same fixture state.
 *
 * It also makes the arms share ONE database at ONE instant, so there is no reseed between arms and
 * therefore no way for them to be shown different data. Same seed, matched arms — literally, rather
 * than by reconstruction.
 *
 * COLD CONDITIONING (HYDRA lesson)
 * ------------------------------------------------------------------------------------------------
 * `next start` compiles nothing, but the first request to a route still pays one-time costs (module
 * graph load, Prisma connect, ISR/first-render). Those inflate the SSR→hydration gap enormously,
 * which inflates the straddle probability. Cold loads are therefore run FIRST, EQUALLY on both arms,
 * against every route, and are EXCLUDED from the reported rate — and reported separately, because
 * "the fix only helps once warm" would itself be a finding. Excluding them from one arm only, or
 * not at all, is how a warm-up artifact gets published as a hydration rate.
 *
 * THE NEGATIVE CONTROL IS NOT OPTIONAL
 * ------------------------------------------------------------------------------------------------
 * If AFTER reports 0 hits, there are two explanations: the fix works, or the collector is broken.
 * They are indistinguishable from a clean run. `--negative` manufactures a real hydration mismatch
 * — mutating served text nodes at document-start so the client's render disagrees with the DOM it
 * is adopting — through the real React error path in the real production bundle, with no source
 * change and no rebuild. A `--negative` run that comes back clean means this harness measures
 * nothing and its clean result must be thrown away. Lifted from the CRM harness, including the
 * corrupt-EVERY-text-leaf detail: an earlier CRM version corrupted one node and caught only 10/24,
 * and an even earlier one keyed on `<time>` elements the app did not render and "passed" by vacuum.
 *
 * RUNTIME: THE SERVER WE SHIP
 * ------------------------------------------------------------------------------------------------
 * See lib/next-start-server.mjs. GATE-RUNTIME's lesson was "measure the configuration you deploy",
 * and for subastas that is `next start` — there is no `output: "standalone"` in next.config.ts and
 * the Dockerfile CMD is `next start -p 3005`. Starting a standalone server here would repeat the
 * CRM's mistake in mirror image.
 *
 *   node scripts/audit/hydra-418-soak.mjs --negative   # prove the collector fires (expect ~100%)
 *   node scripts/audit/hydra-418-soak.mjs              # the real two-arm soak
 *   HYDRA418_SEED=123 node scripts/audit/hydra-418-soak.mjs   # replay a run exactly
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { Client } from "pg";
import { startNextServer, killServer } from "./lib/next-start-server.mjs";
import { seedFixture, assertMeasurementDb } from "./hydra-418-fixture.mjs";

/**
 * ARM RESOLUTION (2026-08-04, forge/icu-ssr-format).
 *
 * These were three hardcoded absolute paths naming ONE pair of worktrees. Copying the harness into
 * a different worktree therefore kept serving the ORIGINAL trees — silently, with no error, and the
 * report printed the old commit labels as if they were the ones under test. That is the worst kind
 * of measurement bug: it produces a confident number for the wrong build.
 *
 * AFTER now DEFAULTS to the app directory this script actually lives in (two levels up from
 * scripts/audit), so a copied harness measures its own checkout by construction. BEFORE has no
 * sensible default — it is whatever baseline you are comparing against — so it must be supplied and
 * the run refuses to start without it. The commit labels are read from each arm's own git HEAD
 * rather than being written down, so they cannot drift out of sync with what is being served.
 */
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const AFTER_DIR = (process.env.HYDRA418_AFTER_DIR ?? path.resolve(HERE, "..", "..")).replace(/\\/g, "/");
const BEFORE_DIR = (process.env.HYDRA418_BEFORE_DIR ?? "").replace(/\\/g, "/");
const DATABASE_URL =
  process.env.HYDRA418_DATABASE_URL ?? "postgresql://dnk:dnk@localhost:5432/subastas_hydra418";

if (!BEFORE_DIR) {
  console.error(
    "HYDRA418_BEFORE_DIR is required — the baseline arm has no safe default.\n" +
      `  AFTER resolves to: ${AFTER_DIR}\n` +
      "  e.g. HYDRA418_BEFORE_DIR=C:/Users/D/Desktop/dnksubastas-wt-h418before/subastas node scripts/audit/hydra-418-soak.mjs",
  );
  process.exit(2);
}

/** Read an arm's real HEAD so the printed label cannot lie about what is being served. */
function headSha(dir) {
  try {
    return execFileSync("git", ["-C", dir, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

const ARMS = [
  { key: "after", dir: AFTER_DIR, port: Number(process.env.HYDRA418_PORT_AFTER ?? 3418), commit: headSha(AFTER_DIR) },
  { key: "before", dir: BEFORE_DIR, port: Number(process.env.HYDRA418_PORT_BEFORE ?? 3419), commit: headSha(BEFORE_DIR) },
];

const args = new Set(process.argv.slice(2));
const NEGATIVE = args.has("--negative");

/** Matched PAIRS per route (one load on each arm per pair). */
const PAIRS = Number(process.env.HYDRA418_PAIRS ?? (NEGATIVE ? 6 : 60));
const SEED = Number(process.env.HYDRA418_SEED ?? (Date.now() % 2 ** 31));
const OUT_DIR = path.join(AFTER_DIR, "scripts", "audit", "__snapshots__", "hydra-418");
mkdirSync(OUT_DIR, { recursive: true });
const JSONL = path.join(OUT_DIR, NEGATIVE ? "subastas-soak-negative.jsonl" : "subastas-soak.jsonl");
writeFileSync(JSONL, "");

/**
 * React hydration diagnostics. Production minifies the messages to #-codes, but a few phrasings
 * survive; both forms are matched. Lifted VERBATIM from the CRM gate, where this exact expression
 * was proven both-ways against a deliberately regressed build. Reusing the proven regex rather than
 * writing a second one is the point — a subtly different regex would make the two projects'
 * numbers incomparable without anybody noticing.
 */
const HYDRATION_RE =
  /Minified React error #(418|419|421|422|423|424|425)|hydrat(e|ion|ing)?\b.*(fail|mismatch|error)|did not match|Text content does not match|server-rendered HTML|hydration failed/i;

/** Deterministic PRNG (mulberry32) — same seed, same matrix, same order. */
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];

/**
 * ASSERT THE CRM'S CONFOUND IS ABSENT — do not merely believe the brief.
 *
 * The dispatch states subastas removes zero `suppressHydrationWarning` because none exist. That is
 * the whole reason this before/after delta is interpretable, so it is worth one grep rather than
 * one assumption. Checked in BOTH arms: a suppression present in BEFORE but not AFTER would mean
 * the AFTER arm is simply REPORTING more, which is the exact shape of the CRM septupling.
 */
function assertNoSuppression() {
  const found = [];
  for (const arm of ARMS) {
    let out = "";
    try {
      out = execFileSync(
        "git",
        ["grep", "-n", "--", "suppressHydrationWarning", arm.commit, "--", "subastas/src"],
        // cwd = the WORKTREE ROOT, not the app dir: `git grep` resolves pathspecs relative to cwd,
        // and `subastas/src` only means anything from the root.
        { cwd: path.dirname(arm.dir), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
      );
    } catch (e) {
      // `git grep` exits 1 on NO MATCH — the expected, passing case. It exits >1 on a real error
      // (bad revision, not a repo, bad pathspec). Swallowing those made this assertion VACUOUS: a
      // mistyped or moved commit label produced "" and read as a clean pass. Distinguish them.
      if (e.status !== 1) {
        throw new Error(
          `assertNoSuppression could not run against ${arm.key} (${arm.commit}) in ${path.dirname(arm.dir)}.\n` +
            `A gate that cannot run is not a gate that passed.\n${String(e.stderr ?? e.message).trim()}`,
        );
      }
      out = "";
    }
    if (out.trim()) found.push(`${arm.key} (${arm.commit}):\n${out}`);
  }
  if (found.length) {
    throw new Error(
      `suppressHydrationWarning found in source — the CRM unmasking confound APPLIES here and this\n` +
        `before/after delta is NOT interpretable as a rate change. Stop and re-scope.\n\n${found.join("\n")}`
    );
  }
  return "none in either arm";
}

/**
 * Resolve each fixture auction to its canonical detail URL by asking the APP, not by rebuilding its
 * slug grammar here. `/auction/{id}` 301s to `/subastas/subasta/{slug}`; we read the Location header.
 * Re-deriving `{tipo}-{provincia}-{municipio}-{id}` in the harness would be a second definition of
 * a grammar the app owns, and it would drift the first time the slug pipeline changed — the same
 * class of mistake the [detalle] route's own comment warns about.
 */
async function resolveDetailUrls(port, ids) {
  const out = [];
  for (const id of ids) {
    const r = await fetch(`http://127.0.0.1:${port}/auction/${id}`, { redirect: "manual" });
    const loc = r.headers.get("location");
    if (!loc) {
      console.error(`  ⚠ no redirect for /auction/${id} (status ${r.status}) — skipping`);
      continue;
    }
    out.push({ id, url: new URL(loc, `http://127.0.0.1:${port}`).pathname });
  }
  return out;
}

const VIEWPORTS = [
  { key: "390", width: 390, height: 844 },
  { key: "1440", width: 1440, height: 900 },
];
/**
 * CPU throttle widens the SSR→hydration gap the way a real mid-range phone does — and the gap IS
 * the straddle window, so this is not incidental realism, it is the dimension the hit rate is most
 * sensitive to. Recorded per load and reported per bucket so a delta can be read at each value
 * rather than only in aggregate, where a different throttle mix between arms could fake one.
 */
const THROTTLES = [1, 4];

/** One measured load on ONE arm. */
async function oneLoad(ctx, cell) {
  const page = await ctx.newPage();
  const diagnostics = [];
  const otherErrors = [];
  const record = (t) => (HYDRATION_RE.test(t) ? diagnostics.push(t) : otherErrors.push(t));

  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") record(m.text());
  });
  page.on("pageerror", (e) => record(`[pageerror] ${e.message}`));

  // Capture the SERVED HTML off the document response itself. Re-fetching the URL would render the
  // page a SECOND time at a different clock, so the comparison would be against a different server
  // render — exactly the confound this is meant to detect.
  let ssrHtml = "";
  page.on("response", async (res) => {
    try {
      if (res.request().resourceType() === "document" && res.status() === 200) ssrHtml = await res.text();
    } catch {
      /* body already consumed / navigation superseded */
    }
  });

  if (cell.throttle > 1) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: cell.throttle });
  }

  // NEGATIVE MODE: corrupt the server-rendered DOM *before* React hydrates it, so the client's
  // render disagrees with the markup it is adopting — a genuine mismatch through the real error
  // path in the real production bundle, with no source change and no rebuild. Every text leaf is
  // corrupted, not one: React reports a mismatch for the subtree it is actually diffing, and one
  // arbitrary node is often not in it (the CRM version caught 10/24 that way).
  if (NEGATIVE) {
    await page.addInitScript(() => {
      window.__hydraRegressed = false;
      const corrupt = () => {
        if (!document.body) return false;
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const targets = [];
        let n;
        while ((n = walker.nextNode())) {
          const p = n.parentElement;
          if (!p || p.tagName === "SCRIPT" || p.tagName === "STYLE") continue;
          const t = (n.nodeValue || "").trim();
          if (t.length >= 3 && t !== "XX-REGRESS") targets.push(n);
        }
        for (const t of targets) t.nodeValue = "XX-REGRESS";
        if (targets.length) window.__hydraRegressed = true;
        return targets.length > 0;
      };
      // The SSR HTML streams in, so document.body does not exist yet at document-start. Observe the
      // document (which always does) and keep corrupting as chunks arrive.
      corrupt();
      const mo = new MutationObserver(() => corrupt());
      mo.observe(document, { childList: true, subtree: true, characterData: true });
      document.addEventListener("readystatechange", () => {
        if (document.readyState === "complete") mo.disconnect();
      });
    });
  }

  const t0 = Date.now();
  let navOk = true;
  try {
    await page.goto(`http://127.0.0.1:${cell.port}${cell.url}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
  } catch {
    navOk = false;
  }

  // Give hydration room to land AND to throw. React reports a recoverable mismatch during the
  // commit that FOLLOWS hydration, so the window has to outlast throttled hydration, not just DCL.
  await page.waitForTimeout(cell.settleMs);

  let probe = {};
  try {
    probe = await page.evaluate(() => {
      const navEntry = performance.getEntriesByType("navigation")[0];
      // Count the countdowns actually on the page. A load that rendered zero of them cannot hit,
      // and must be visible as such rather than diluting the denominator invisibly.
      const tnum = document.querySelectorAll("span.tnum").length;
      const body = document.body ? document.body.innerText : "";
      return {
        tnum,
        finalizada: (body.match(/Finalizada/g) || []).length,
        regressed: !!window.__hydraRegressed,
        nav: navEntry
          ? {
              responseEnd: Math.round(navEntry.responseEnd),
              domInteractive: Math.round(navEntry.domInteractive),
            }
          : null,
      };
    });
  } catch {
    /* page torn down mid-probe */
  }

  await page.close().catch(() => {});

  return {
    ...cell,
    seed: SEED,
    navOk,
    mutated: NEGATIVE && !!probe.regressed,
    wallMs: Date.now() - t0,
    // The straddle window: HTML on the wire → the client commit that could disagree with it.
    hydrationGapMs:
      probe.nav && probe.nav.domInteractive != null ? probe.nav.domInteractive - probe.nav.responseEnd : null,
    countdownNodes: probe.tnum ?? null,
    finalizadaCount: probe.finalizada ?? null,
    ssrBytes: ssrHtml.length,
    hit: diagnostics.length > 0,
    diagnostics: diagnostics.slice(0, 3),
    otherErrorCount: otherErrors.length,
    otherErrors: otherErrors.slice(0, 2),
  };
}

/** Hit rate for a subset, with a Wilson 95% interval — a bare ratio at low N invites over-reading. */
function rate(rows) {
  const n = rows.length;
  const h = rows.filter((r) => r.hit).length;
  if (n === 0) return { n: 0, hits: 0, pct: null, lo: null, hi: null };
  const p = h / n;
  const z = 1.96;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { n, hits: h, pct: p * 100, lo: ((c - m) / d) * 100, hi: ((c + m) / d) * 100 };
}

function fmt(r) {
  if (r.n === 0) return "     —      (0 loads)";
  return `${String(r.hits).padStart(4)}/${String(r.n).padEnd(4)} = ${r.pct.toFixed(1).padStart(5)}%  [${r.lo.toFixed(1)}–${r.hi.toFixed(1)}]`;
}

/** Two-proportion comparison. Reported as a ratio AND as non-overlapping intervals, not a p-value. */
function compare(before, after) {
  const b = rate(before);
  const a = rate(after);
  const sep = b.n && a.n && (a.hi < b.lo || b.hi < a.lo);
  return { before: b, after: a, separated: sep };
}

async function main() {
  console.log(`\n═══ HYDRA-418 SUBASTAS SOAK ═══  seed=${SEED}  pairs/route=${PAIRS}  ${NEGATIVE ? "[NEGATIVE CONTROL]" : ""}`);
  assertMeasurementDb(DATABASE_URL);
  console.log(`  suppressHydrationWarning: ${assertNoSuppression()}`);

  const nowMs = Date.now();
  const fx = await seedFixture({ databaseUrl: DATABASE_URL, nowMs });
  console.log(`  fixture: ${fx.seconds.length} seconds-tier, ${fx.days.length} days-tier, ${fx.concluded.length} concluded (anchor ${new Date(nowMs).toISOString()})`);

  const servers = {};
  const browser = await chromium.launch();
  const rows = [];
  try {
    for (const arm of ARMS) {
      servers[arm.key] = await startNextServer({
        appDir: arm.dir,
        port: arm.port,
        label: arm.key,
        env: { DATABASE_URL },
      });
      console.log(`  ${arm.key.padEnd(6)} @ ${arm.commit}  port ${arm.port}  BUILD_ID ${servers[arm.key].buildId}`);
    }
    if (servers.after.buildId === servers.before.buildId) {
      throw new Error("both arms report the same BUILD_ID — one arm is serving the other's build");
    }

    // Resolve URLs against ONE arm; the routes are identical in both (the fix touched no routing).
    const secUrls = await resolveDetailUrls(ARMS[0].port, fx.seconds);
    const dayUrls = await resolveDetailUrls(ARMS[0].port, fx.days);
    const conUrls = await resolveDetailUrls(ARMS[0].port, fx.concluded);
    const CLASSES = [
      { cls: "seconds", urls: secUrls },
      { cls: "days", urls: dayUrls },
      { cls: "concluded", urls: conUrls },
    ];
    console.log(`  detail urls: seconds=${secUrls.length} days=${dayUrls.length} concluded=${conUrls.length}`);

    const ctxs = {};
    for (const arm of ARMS) ctxs[arm.key] = await browser.newContext({ viewport: VIEWPORTS[1] });

    // ── COLD CONDITIONING ─────────────────────────────────────────────────────────────────────
    // Every distinct URL, once per arm, EXCLUDED from the warm rate and reported separately.
    console.log(`\n  cold-conditioning both arms …`);
    for (const { cls, urls } of CLASSES) {
      for (const u of urls) {
        for (const arm of ARMS) {
          const r = await oneLoad(ctxs[arm.key], {
            arm: arm.key,
            port: arm.port,
            url: u.url,
            auctionId: u.id,
            cls,
            phase: "cold",
            viewport: "1440",
            throttle: 1,
            settleMs: 1500,
          });
          rows.push(r);
          appendFileSync(JSONL, JSON.stringify(r) + "\n");
        }
      }
    }
    const coldHits = rows.filter((r) => r.hit).length;
    console.log(`  cold: ${rows.length} loads, ${coldHits} hits`);

    // ── WARM, INTERLEAVED ─────────────────────────────────────────────────────────────────────
    const rnd = mulberry32(SEED);
    const plan = [];
    for (const { cls, urls } of CLASSES) {
      if (!urls.length) continue;
      for (let i = 0; i < PAIRS; i++) {
        plan.push({
          cls,
          u: urls[i % urls.length],
          viewport: pick(rnd, VIEWPORTS),
          throttle: pick(rnd, THROTTLES),
          settleMs: 1200,
        });
      }
    }
    // Shuffle the plan so route classes are not blocked in time — but the PAIR stays adjacent, which
    // is what keeps the arms matched.
    for (let i = plan.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [plan[i], plan[j]] = [plan[j], plan[i]];
    }

    console.log(`\n  warm soak: ${plan.length} matched pairs (${plan.length * 2} loads) …`);
    let done = 0;
    for (const p of plan) {
      // Alternate which arm goes FIRST within the pair, so any within-pair ordering effect
      // (a warmed cache, a scheduler quantum) cannot accumulate on one arm.
      const order = done % 2 === 0 ? ARMS : [...ARMS].reverse();
      for (const arm of order) {
        const r = await oneLoad(ctxs[arm.key], {
          arm: arm.key,
          port: arm.port,
          url: p.u.url,
          auctionId: p.u.id,
          cls: p.cls,
          phase: "warm",
          pair: done,
          viewport: p.viewport.key,
          throttle: p.throttle,
          settleMs: p.settleMs,
        });
        rows.push(r);
        appendFileSync(JSONL, JSON.stringify(r) + "\n");
      }
      done++;
      if (done % 25 === 0) {
        const w = rows.filter((r) => r.phase === "warm");
        console.log(
          `    ${done}/${plan.length} pairs — before ${fmt(rate(w.filter((r) => r.arm === "before")))} | after ${fmt(rate(w.filter((r) => r.arm === "after")))}`
        );
      }
    }

    // ── REPORT ────────────────────────────────────────────────────────────────────────────────
    const warm = rows.filter((r) => r.phase === "warm");
    const cold = rows.filter((r) => r.phase === "cold");
    const B = (rs) => rs.filter((r) => r.arm === "before");
    const A = (rs) => rs.filter((r) => r.arm === "after");

    console.log(`\n${"═".repeat(96)}\nRESULT — before (${ARMS[1].commit}) vs after (${ARMS[0].commit})\n${"═".repeat(96)}`);
    if (NEGATIVE) {
      const mut = rows.filter((r) => r.mutated);
      console.log(`  NEGATIVE CONTROL: ${mut.length} loads carried the injected corruption`);
      console.log(`    before  ${fmt(rate(B(mut)))}`);
      console.log(`    after   ${fmt(rate(A(mut)))}`);
      const ok = rate(B(mut)).pct >= 80 && rate(A(mut)).pct >= 80;
      console.log(`\n  ${ok ? "✓ COLLECTOR PROVEN" : "✗ COLLECTOR NOT PROVEN — a clean soak from this harness is worthless"}`);
    } else {
      const overall = compare(B(warm), A(warm));
      console.log(`\n  WARM, ALL DETAIL LOADS`);
      console.log(`    before  ${fmt(overall.before)}`);
      console.log(`    after   ${fmt(overall.after)}`);
      for (const cls of ["seconds", "days", "concluded"]) {
        const w = warm.filter((r) => r.cls === cls);
        console.log(`\n  warm · ${cls}-tier`);
        console.log(`    before  ${fmt(rate(B(w)))}`);
        console.log(`    after   ${fmt(rate(A(w)))}`);
      }
      for (const t of THROTTLES) {
        const w = warm.filter((r) => r.throttle === t);
        console.log(`\n  warm · CPU throttle ${t}x`);
        console.log(`    before  ${fmt(rate(B(w)))}`);
        console.log(`    after   ${fmt(rate(A(w)))}`);
      }
      console.log(`\n  COLD (excluded from the rates above)`);
      console.log(`    before  ${fmt(rate(B(cold)))}`);
      console.log(`    after   ${fmt(rate(A(cold)))}`);

      const gap = (rs) => {
        const g = rs.map((r) => r.hydrationGapMs).filter((x) => x != null).sort((a, b) => a - b);
        return g.length ? `${g[Math.floor(g.length / 2)]}ms median` : "n/a";
      };
      console.log(`\n  SSR→hydration gap (the straddle window): before ${gap(B(warm))} · after ${gap(A(warm))}`);

      const verdict =
        overall.after.pct <= overall.before.pct
          ? overall.separated
            ? "SHIPS — after is LOWER and the intervals do not overlap"
            : "SHIPS — after is same-or-lower (intervals overlap; no evidence of regression)"
          : "BLOCKS — after is HIGHER than before";
      console.log(`\n  VERDICT: ${verdict}`);
    }
    console.log(`\n  raw: ${JSONL}\n`);
  } finally {
    for (const arm of ARMS) killServer(servers[arm.key], arm.port);
    await browser.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error(`\n✗ ${e.message}\n`);
  for (const arm of ARMS) killServer(null, arm.port);
  process.exit(1);
});
