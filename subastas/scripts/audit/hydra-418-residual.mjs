// @ts-nocheck
/**
 * HYDRA-418 (SUBASTAS) — RESIDUAL LOCATOR.
 *
 * The two-arm soak returned 100% #418 on BOTH arms, warm and cold, on every route class including
 * pages whose only countdowns are concluded. A saturated outcome variable cannot show a difference:
 * whatever the clock fix does, a SECOND mismatch is firing on essentially every load and pinning the
 * rate at its ceiling. Until that second cause is named, the before/after comparison is not a
 * measurement of the fix — it is a measurement of the other bug.
 *
 * So this script does not measure a rate. It answers one question on the FIXED arm: WHICH TEXT
 * disagrees? It captures the served HTML off the document response (never a re-fetch — that would
 * render the page a second time at a different clock and manufacture the very difference we are
 * hunting) and compares it against the DOM once hydration has settled.
 *
 * React's production #418 is `args[]=text`, i.e. a TEXT mismatch, and it names no node. The diff
 * below is content-agnostic on purpose: the residual is by definition a cause nobody guessed, so
 * keying the comparison on any particular element would be able to confirm only the hypothesis it
 * was built from. That mistake is on the record in the CRM harness, which first compared `<time>`
 * nodes in an app that rendered none and therefore "passed" by vacuum.
 */
import { chromium } from "playwright";
import { startNextServer, killServer } from "./lib/next-start-server.mjs";

// AFTER_DIR defaults to the app dir this script lives in (see hydra-418-soak.mjs for why a
// hardcoded absolute path here silently measured the WRONG worktree). Override with
// HYDRA418_AFTER_DIR.
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const AFTER_DIR = process.env.HYDRA418_AFTER_DIR ?? path.resolve(HERE, "..", "..");
const DATABASE_URL =
  process.env.HYDRA418_DATABASE_URL ?? "postgresql://dnk:dnk@localhost:5432/subastas_hydra418";
const PORT = 3421;
const URLS = process.argv.slice(2);

function tokenize(s) {
  return s
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

const main = async () => {
  const server = await startNextServer({ appDir: AFTER_DIR, port: PORT, label: "after", env: { DATABASE_URL } });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const tally = new Map();
  try {
    for (const url of URLS) {
      const page = await ctx.newPage();
      const hydration = [];
      page.on("pageerror", (e) => hydration.push(e.message));
      page.on("console", (m) => {
        // React 19 emits a SECOND, non-minified console.error alongside the minified throw on some
        // paths, and when present it names the offending text outright. Worth capturing rather than
        // inferring it from a diff.
        if (m.type() === "error" && /hydrat|did not match|Text content/i.test(m.text())) hydration.push(m.text());
      });

      let ssr = "";
      page.on("response", async (res) => {
        try {
          if (res.request().resourceType() === "document" && res.status() === 200) ssr = await res.text();
        } catch {}
      });

      await page.goto(`http://127.0.0.1:${PORT}${url}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForTimeout(2500);
      const domText = await page.evaluate(() => (document.body ? document.body.innerText : ""));
      await page.close().catch(() => {});

      const ssrTokens = new Set(
        tokenize(
          ssr
            .replace(/<script[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<[^>]+>/g, " ")
        )
      );
      const domTokens = new Set(tokenize(domText));
      const ssrOnly = [...ssrTokens].filter((t) => !domTokens.has(t));
      const domOnly = [...domTokens].filter((t) => !ssrTokens.has(t));

      console.log(`\n── ${url}`);
      console.log(`   #418: ${hydration.length ? "YES" : "no"}`);
      for (const h of hydration.slice(0, 2)) console.log(`   ${h.slice(0, 220)}`);
      console.log(`   SSR-only tokens (${ssrOnly.length}): ${ssrOnly.slice(0, 30).join(" ")}`);
      console.log(`   DOM-only tokens (${domOnly.length}): ${domOnly.slice(0, 30).join(" ")}`);
      for (const t of [...ssrOnly, ...domOnly]) tally.set(t, (tally.get(t) ?? 0) + 1);
    }
    console.log(`\n══ tokens differing on the MOST pages (the residual's signature) ══`);
    [...tally.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40)
      .forEach(([t, n]) => console.log(`   ${String(n).padStart(3)} pages  ${t}`));
  } finally {
    killServer(server, PORT);
    await browser.close().catch(() => {});
  }
};

main().catch((e) => {
  console.error(e.message);
  killServer(null, PORT);
  process.exit(1);
});
