/**
 * URL-v4 SWITCH — "are we serving the new ARCHIVE (/resultados) tree yet?".
 *
 * ⭐ DEFAULT OFF, AND OFF IS WHAT SHIPS.
 *
 * Same shape as `url-v3-switch.ts`, deliberately a SEPARATE flag: v3 governs
 * auction DETAIL urls (`/subastas/subasta/{slug}` → `/subastas/{prov}/{muni}/…`)
 * and v4 governs the archive HUB tree. They flip on different dates, and one
 * flag for both would mean a v4 rollback also reverted the detail URLs — which
 * are frozen this wave (Dennis, 2026-08-12) and must not move at all.
 *
 * Ken's ruling for this wave (2026-08-13): *"With the flag off, v4 routes may
 * exist and return 200, but nothing links to them, the sitemap does not contain
 * them, and the old shapes keep behaving exactly as they do today. A user or
 * Googlebot on prod must not be able to tell the flag is there."*
 *
 * So with `URL_V4_SWITCH` unset:
 *   - every INTERNAL link keeps pointing at today's shapes, byte for byte —
 *     including the pre-existing `/resultados/{outcome}/{prov}` ORDER, which v4
 *     reverses to `/resultados/{prov}/{outcome}`;
 *   - the sitemap emits exactly what it emits today (P3 wires v4 in);
 *   - no legacy → v4 redirect fires (P2 owns redirects);
 *   - the deep v4 routes still SERVE, and while off they declare the LEGACY url
 *     as canonical, so a crawler that guessed the path is told which URL is
 *     real. That is also what makes the dark tree verifiable in a browser on the
 *     live container before anyone flips anything.
 *
 * ⚠️ Read at CALL time, never at module load — a module-load constant bakes into
 * the build output and turns "flip the switch" into "rebuild and redeploy"
 * instead of "set an env var / revert a commit".
 *
 * ⛔ Ken flips this on prod himself, after P2 and P3 land. Do not default it to
 * '1' and do not read it from a `NEXT_PUBLIC_` var — a client bundle cannot be
 * un-shipped from a browser cache, and this flag must stay instantly revertible.
 */

/** True only when the v4 archive switchover has been explicitly turned on. */
export function isUrlV4SwitchOn(): boolean {
  return process.env.URL_V4_SWITCH === '1';
}

/** The env var name, exported so scripts and docs cannot drift from the code. */
export const URL_V4_SWITCH_ENV = 'URL_V4_SWITCH';
