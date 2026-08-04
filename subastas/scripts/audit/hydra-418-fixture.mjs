/**
 * HYDRA-418 (SUBASTAS) — FIXTURE.
 *
 * WHY A FIXTURE AT ALL
 * ------------------------------------------------------------------------------------------------
 * The measurement DB is a 100-row Forge fixture in which 88 auctions are CONCLUIDA_PORTAL with an
 * `endsAt` years in the past. For every one of those, `LiveCountdown` takes its `parts.isPast`
 * branch and renders the literal string "Finalizada". A literal cannot differ between the server
 * render and the first client render, so those rows are STRUCTURALLY INCAPABLE of producing the
 * #418 this dispatch is about — running the soak against them as-is would report a clean 0/N on
 * both arms and prove exactly nothing. A green that is guaranteed in advance is not a measurement.
 *
 * WHAT THE MECHANISM ACTUALLY NEEDS
 * ------------------------------------------------------------------------------------------------
 * Read LiveCountdown's format ladder (src/components/observatory/LiveCountdown.tsx):
 *
 *     days >= 1   →  "{d}d {h}h {m}m"        — rendered string changes once per MINUTE
 *     hours >= 1  →  "{h}h {mm}m {ss}s"      — rendered string changes once per SECOND
 *     else        →  "{mm}m {ss}s"           — rendered string changes once per SECOND
 *
 * Pre-fix, that string is seeded from `useState(() => diffParts(targetMs))` with `Date.now()` read
 * INSIDE the initializer. A lazy initializer runs on BOTH the server render and the first client
 * render. So the SSR HTML carries the server's second and the first client render computes the
 * client's second, and they disagree whenever a second boundary falls in the gap between the two.
 *
 * That makes the hit probability roughly `gap / 1000ms` per rendered countdown in the seconds
 * tiers — a real, high rate — versus `gap / 60000ms` in the days tier. The fixture therefore seeds
 * auctions into the SECONDS tier, which is not cheating the number: it is putting the corpus into
 * the state the mechanism describes so the two arms can be compared with real statistical power.
 * A rate measured on rows that render "Finalizada" would be a rate for a different question.
 *
 * WHAT IS SEEDED
 * ------------------------------------------------------------------------------------------------
 *   LIVE arm-target rows (N=SECONDS_ROWS): status CELEBRANDOSE, endsAt = now + 12h + i seconds.
 *     12h keeps them in the `hours >= 1` seconds-ticking branch for the WHOLE run (a 45m seed would
 *     cross into the last-hour branch mid-run and change the ladder underneath the comparison), and
 *     the per-row stagger stops all rows from flipping on the same tick, which would otherwise make
 *     a load either all-hit or all-miss and destroy the independence the rate assumes.
 *
 *   DAYS rows (N=DAYS_ROWS): status CELEBRANDOSE, endsAt = now + 6d + i minutes. The minute-tier
 *     control — same code path, ~60x lower straddle probability. Its job is to show the effect is
 *     the CLOCK and not merely "we edited some rows".
 *
 *   CONCLUDED rows: left exactly as they are. The literal-"Finalizada" population, which must show
 *     0 hits on BOTH arms or the harness is measuring something other than the countdown.
 *
 * The fixture is written ONCE and both arms read the SAME database at the SAME wall clock, because
 * the two servers run simultaneously and loads are interleaved. There is no per-arm reseed, so
 * there is no way for the arms to receive different data.
 *
 * REVERSIBILITY. `subastas_hydra418` is a throwaway clone of `subastas_applayer_forge`, created by
 * the runner. Nothing here touches a shared database; the guard below refuses to run anywhere else.
 */

import { Client } from "pg";

export const SECONDS_ROWS = 24;
export const DAYS_ROWS = 8;
export const CONCLUDED_ROWS = 8;

/**
 * Refuse to seed anything but the disposable measurement DB.
 *
 * This script performs destructive UPDATEs on an Auction table. The subastas repo already carries a
 * `prisma/db-target-guard` for exactly this class of accident (SEC-CREDS). A gate that mutates rows
 * has no business trusting whatever DATABASE_URL happens to be in the environment.
 */
const REQUIRED_DB = "subastas_hydra418";

export function assertMeasurementDb(url) {
  if (!/^postgres(ql)?:\/\//.test(url ?? "")) throw new Error(`DATABASE_URL is not postgres: ${url}`);
  const name = new URL(url).pathname.replace(/^\//, "");
  if (name !== REQUIRED_DB) {
    throw new Error(
      `REFUSING TO SEED. This fixture UPDATEs auction rows and may only run against the\n` +
        `disposable measurement clone "${REQUIRED_DB}". Got "${name}".`
    );
  }
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
    throw new Error(`REFUSING TO SEED: measurement DB must be on localhost. Got ${url}`);
  }
  return name;
}

/**
 * Seed the fixture and return the auction ids per class.
 *
 * `nowMs` is passed in rather than read here so the caller can record the single instant the whole
 * fixture is anchored to — every reported "distance to boundary" is relative to it.
 */
export async function seedFixture({ databaseUrl, nowMs }) {
  assertMeasurementDb(databaseUrl);
  const c = new Client({ connectionString: databaseUrl });
  await c.connect();
  try {
    // Deterministic pick: order by id so the same DB always yields the same rows in the same
    // classes. A random pick would make two runs of this harness incomparable for no benefit.
    const { rows } = await c.query(
      `select id from "Auction"
        where "inScope" = true
          and province is not null and municipality is not null
        order by id
        limit $1`,
      [SECONDS_ROWS + DAYS_ROWS + CONCLUDED_ROWS]
    );
    if (rows.length < SECONDS_ROWS + DAYS_ROWS + CONCLUDED_ROWS) {
      throw new Error(`fixture needs ${SECONDS_ROWS + DAYS_ROWS + CONCLUDED_ROWS} in-scope rows, found ${rows.length}`);
    }
    const ids = rows.map((r) => r.id);
    const seconds = ids.slice(0, SECONDS_ROWS);
    const days = ids.slice(SECONDS_ROWS, SECONDS_ROWS + DAYS_ROWS);
    const concluded = ids.slice(SECONDS_ROWS + DAYS_ROWS);

    for (let i = 0; i < seconds.length; i++) {
      // +12h keeps `hours >= 1` true for the whole run; the i-second stagger decorrelates the ticks.
      const ends = new Date(nowMs + 12 * 3600_000 + i * 1000);
      await c.query(`update "Auction" set status='CELEBRANDOSE', "endsAt"=$2 where id=$1`, [seconds[i], ends]);
    }
    for (let i = 0; i < days.length; i++) {
      const ends = new Date(nowMs + 6 * 86400_000 + i * 60_000);
      await c.query(`update "Auction" set status='CELEBRANDOSE', "endsAt"=$2 where id=$1`, [days[i], ends]);
    }
    // `concluded` is deliberately NOT written to.

    return { seconds, days, concluded, nowMs };
  } finally {
    await c.end();
  }
}
