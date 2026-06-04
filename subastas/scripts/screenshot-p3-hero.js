/**
 * P3 hero screenshot script — desktop 1440 + mobile 390.
 * Run after `npx next start -p 3005` is healthy.
 * Saves PNGs to both ken/niki and pixel agent memory locations.
 */
const { chromium } = require("playwright-core");
const path = require("path");

const URL = process.env.SCREEN_URL || "http://localhost:3005/";
const OUT_NIKI = "C:\\Users\\D\\.claude\\agent-memory\\niki\\PROJECTS\\dnksubastas\\artifacts\\conversion-redesign";
const OUT_PIXEL = "C:\\Users\\D\\.claude\\agent-memory\\pixel-ux-engineer\\PROJECTS\\dnksubastas\\conversion-redesign\\artifacts";

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.PW_CHROME || undefined,
    channel: "chrome",
  });

  const shoot = async (label, vp) => {
    const ctx = await browser.newContext({ viewport: vp, locale: "es-ES" });
    const page = await ctx.newPage();
    // Local dev box has no DATABASE_URL, so /api/auctions/stats returns 500.
    // Stub it with the production-shape payload (numbers approximate the
    // 2026-06-04 prod values: totalAuctions 235,766 / active 537 / upcoming
    // 220 / newThisMonth ~180). These are illustrative for the screenshot
    // only — the hero code reads whatever the live API returns; the only
    // thing being verified visually is the chip layout + typography.
    await page.route("**/api/auctions/stats", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            totalAuctions: 235766,
            oldestAuctionYear: 2015,
            lastUpdateTime: new Date().toISOString(),
            activeCount: 537,
            activeProperties: 497,
            activeVehicles: 40,
            activeOtros: 0,
            preAuctionCount: 220,
            trueActiveCount: 537,
            trueLiveCount: 443,
            trueUpcomingCount: 220,
            newThisMonthCount: 184,
          },
        }),
      })
    );
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
    // Wait a beat for the stubbed stats fetch to land + render
    await page.waitForTimeout(1500);

    // Hero-only screenshot: full-page would include the map + province grid.
    // Clip to the first hero section so the artifact reads as "the hero".
    const heroBox = await page.evaluate(() => {
      const h1 = document.getElementById("hero-headline");
      if (!h1) return null;
      // Walk up to the closest <section>
      let node = h1;
      while (node && node.tagName !== "SECTION") node = node.parentElement;
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return {
        x: Math.max(0, Math.floor(r.left) - 32),
        y: Math.max(0, Math.floor(r.top) - 32),
        width: Math.ceil(r.width) + 64,
        height: Math.ceil(r.height) + 64,
      };
    });

    const heroPath1 = path.join(OUT_NIKI, `p3-hero-${label}.png`);
    const heroPath2 = path.join(OUT_PIXEL, `p3-hero-${label}.png`);
    if (heroBox) {
      await page.screenshot({ path: heroPath1, clip: heroBox });
      await page.screenshot({ path: heroPath2, clip: heroBox });
    } else {
      // fallback: viewport-only
      await page.screenshot({ path: heroPath1 });
      await page.screenshot({ path: heroPath2 });
    }
    console.log(`[${label}] hero → ${heroPath1}`);

    // Also capture above-the-fold viewport for context
    const vpPath1 = path.join(OUT_NIKI, `p3-landing-fold-${label}.png`);
    const vpPath2 = path.join(OUT_PIXEL, `p3-landing-fold-${label}.png`);
    await page.screenshot({ path: vpPath1 });
    await page.screenshot({ path: vpPath2 });
    console.log(`[${label}] fold → ${vpPath1}`);

    await ctx.close();
  };

  try {
    await shoot("desktop-1440", { width: 1440, height: 900 });
    await shoot("mobile-390", { width: 390, height: 844 });
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
