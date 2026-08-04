// @ts-nocheck
/**
 * HYDRA-418 (SUBASTAS) — PINPOINT the residual mismatch.
 *
 * The token diff in hydra-418-residual.mjs could not name the cause, and the reason is worth
 * recording: the biggest differences it found were LEGITIMATE. `ObservatoryHeader` fetches
 * /api/auctions/stats in a `useEffect` and swaps "Sincronizando datos…" for "Datos actualizados
 * {when}" — that lands AFTER hydration has committed, so it cannot be the mismatch, it can only
 * obscure it. The rest was CSS `text-transform: uppercase`, which changes `innerText` but not the
 * markup. A post-hydration diff is context, never an assertion. (The CRM harness says so in its own
 * comments; this run is what that warning looks like in practice.)
 *
 * So this script removes both confounds instead of reading around them:
 *   1. ABORT every XHR/fetch, so no client request can change the DOM after hydration.
 *   2. Snapshot `document.body.innerHTML` the instant the #418 fires — not seconds later — via an
 *      init script that hooks the error event. Comparing MARKUP to MARKUP also sidesteps the
 *      text-transform artifact entirely, because CSS does not alter innerHTML.
 *   3. Diff the served markup against that snapshot and print the first genuinely differing region.
 *
 * The countdown still re-ticks on its interval, so the FIRST difference is reported rather than all
 * of them, and the served/observed pair is dumped to disk for inspection.
 */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { startNextServer, killServer } from "./lib/next-start-server.mjs";

// AFTER_DIR defaults to the app dir this script lives in (see hydra-418-soak.mjs for why a
// hardcoded absolute path here silently measured the WRONG worktree). Override with
// HYDRA418_AFTER_DIR.
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const AFTER_DIR = process.env.HYDRA418_AFTER_DIR ?? path.resolve(HERE, "..", "..");
const DATABASE_URL =
  process.env.HYDRA418_DATABASE_URL ?? "postgresql://dnk:dnk@localhost:5432/subastas_hydra418";
const PORT = 3422;
const OUT = path.join(AFTER_DIR, "scripts", "audit", "__snapshots__", "hydra-418");
mkdirSync(OUT, { recursive: true });
const URLS = process.argv.slice(2);

/** Strip attributes/comments and keep only text between tags, with its enclosing tag for context. */
function textRuns(html) {
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  const stripped = body
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  const runs = [];
  const re = /<([a-zA-Z0-9-]+)[^>]*>([^<]{1,200})/g;
  let m;
  while ((m = re.exec(stripped))) {
    const t = m[2].replace(/\s+/g, " ").trim();
    if (t) runs.push(`${m[1]}:${t}`);
  }
  return runs;
}

const main = async () => {
  const server = await startNextServer({ appDir: AFTER_DIR, port: PORT, label: "after", env: { DATABASE_URL } });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  // No client request may mutate the DOM after hydration.
  await ctx.route("**/api/**", (r) => r.abort());
  try {
    for (const url of URLS) {
      const page = await ctx.newPage();
      await page.addInitScript(() => {
        window.__snapAtError = null;
        window.addEventListener(
          "error",
          () => {
            if (window.__snapAtError == null && document.body) {
              window.__snapAtError = document.body.innerHTML;
            }
          },
          true
        );
      });
      let ssr = "";
      let fired = false;
      page.on("pageerror", () => (fired = true));
      page.on("response", async (res) => {
        try {
          if (res.request().resourceType() === "document" && res.status() === 200) ssr = await res.text();
        } catch {}
      });

      await page.goto(`http://127.0.0.1:${PORT}${url}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForTimeout(2000);
      const snap = await page.evaluate(() => window.__snapAtError);
      await page.close().catch(() => {});

      console.log(`\n── ${url}   #418=${fired ? "YES" : "no"}   snapshot=${snap ? "captured" : "MISSED"}`);
      if (!snap) continue;

      const a = textRuns(ssr);
      const b = textRuns(snap);
      let shown = 0;
      for (let i = 0; i < Math.max(a.length, b.length) && shown < 6; i++) {
        if (a[i] !== b[i]) {
          console.log(`   [${i}] SSR   : ${a[i] ?? "(none)"}`);
          console.log(`   [${i}] CLIENT: ${b[i] ?? "(none)"}`);
          shown++;
        }
      }
      if (!shown) console.log(`   markup text runs are IDENTICAL (${a.length} runs) — mismatch is not in body text`);
      const slug = url.split("/").pop();
      writeFileSync(path.join(OUT, `pinpoint-${slug}-ssr.html`), ssr);
      writeFileSync(path.join(OUT, `pinpoint-${slug}-client.html`), snap);
    }
    console.log(`\n  dumps: ${OUT}\\pinpoint-*.html`);
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
