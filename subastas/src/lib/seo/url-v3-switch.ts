/**
 * URL-v3 SWITCH — the single definition of "are we serving the new URLs yet?".
 *
 * ⭐ DEFAULT OFF, AND OFF IS WHAT SHIPS.
 *
 * Ken's ruling (2026-08-04): *"Build behind a switch that is OFF. This dispatch
 * must be deployable without changing what users see — new routes may exist and
 * serve, but nothing advertises them and no redirect fires until the switch
 * dispatch flips it. That is what makes the flip reversible by a code revert."*
 *
 * So this file is the whole blast radius. With `URL_V3_SWITCH` unset:
 *   - the canonical, the JSON-LD `@id`/`url` and the sitemap all keep emitting
 *     today's `/subastas/subasta/{slug}` — byte for byte;
 *   - no permanent redirect fires from the legacy detail page;
 *   - the app issues ZERO extra queries against `auction_url_v3` (every read is
 *     guarded at the call site, not filtered afterwards).
 *
 * The v3 route itself still SERVES while the switch is off — deliberately, and
 * within Ken's ruling ("new routes may exist and serve"). Nothing links to it,
 * nothing sitemaps it, and while off it declares the LEGACY url as its
 * canonical, so a crawler that somehow guessed the path is told which URL is
 * the real one. That is also what makes the dark code verifiable in a browser
 * before anyone flips anything.
 *
 * ⚠️ Read at CALL time, never at module load. A module-load constant would be
 * baked into the build output, and then "flip the switch" would mean "rebuild
 * and redeploy" instead of "set an env var / revert a commit" — which is
 * exactly the reversibility Ken asked for.
 *
 * Convention matches the rest of the repo (see `src/lib/auction-image-url.ts`):
 * server-only, NOT `NEXT_PUBLIC_`-prefixed, compared against the literal '1',
 * default-off. Not public because a client bundle cannot be un-shipped from a
 * browser cache, and this flag must be revertible instantly.
 */

/** True only when the switchover has been explicitly turned on. */
export function isUrlV3SwitchOn(): boolean {
  return process.env.URL_V3_SWITCH === '1';
}

/** The env var name, exported so scripts and docs cannot drift from the code. */
export const URL_V3_SWITCH_ENV = 'URL_V3_SWITCH';
