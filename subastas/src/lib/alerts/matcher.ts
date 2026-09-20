/**
 * Shared saved-search matcher — the ONE place alert-vs-auction matching lives.
 *
 * Two engines consume it and must never drift:
 *   - Engine A: `src/app/api/alerts/check/route.ts` (cron, "new auction" mails).
 *   - Engine B: `src/lib/dispatcher/*` (event-driven `auction.go_live` fan-out).
 *
 * The logic below is a VERBATIM extraction of Engine A's historic inline loop
 * (route.ts L93-150 before this wave) with exactly ONE behaviour change:
 *
 *   `propertyType` is now matched. It has been persisted on `Alert` since
 *   F2a (2026-07-28) but was never compared against `Auction.propertyType`,
 *   so a user who narrowed a saved search to e.g. "VIVIENDA" still received
 *   every category. Engine A therefore becomes STRICTER for any alert that
 *   has a non-empty propertyType. Flagged to Dennis via Ken (wave218).
 *
 * Deliberate semantics preserved from the original (do not "fix" these without
 * a ruling — they are load-bearing for existing alerts):
 *   - Every filter is falsy-gated (`if (alert.x && ...)`). An empty string, 0,
 *     null or undefined means "no constraint" — the alert matches everything.
 *     This is why a `minPrice` of 0 does NOT act as a floor.
 *   - Price comparisons run against `appraisalValue` only, and they are
 *     ASYMMETRIC on a NULL price because JS coerces `null` to 0 in a relational
 *     comparison:
 *         minPrice: `null < 50000`  -> true  -> the row is EXCLUDED.
 *         maxPrice: `null > 50000`  -> false -> the row is KEPT.
 *     So a saved search with a price floor silently never matches an auction
 *     whose appraisal value was not published. That is pre-existing Engine A
 *     behaviour, preserved here deliberately and asserted in matcher.test.ts;
 *     changing it would widen or narrow live alerts and needs a Dennis ruling.
 *     Flagged to Ken with wave218.
 *   - `statuses` / `keywords` are CSV strings; an all-blank CSV is "no
 *     constraint".
 *   - Keywords are OR-ed (`some`), case-insensitively, over the concatenation
 *     of title + generalInfo + propertyDescription + lotDescription.
 *
 * Pure: no database, no env, no clock. Safe to unit-test and safe to call in a
 * tight loop (Engine B filters thousands of alerts in memory per event).
 */

/** The subset of an `Alert` row that participates in matching. */
export interface AlertCriteria {
  province?: string | null;
  municipality?: string | null;
  category?: string | null;
  source?: string | null;
  auctionType?: string | null;
  /** Matched since wave218 — persisted since F2a but previously ignored. */
  propertyType?: string | null;
  /** CSV of AuctionStatus values. Empty/blank = every status. */
  statuses?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  /** CSV, OR-ed, case-insensitive, over the auction's prose fields. */
  keywords?: string | null;
}

/**
 * The subset of an `Auction` row the matcher reads.
 *
 * Engine B's Prisma `select` is typed against this interface on purpose: adding
 * a field here forces the dispatcher's query to fetch it, so the two engines
 * cannot silently diverge on which columns are available at match time.
 */
export interface AuctionForMatch {
  province?: string | null;
  municipality?: string | null;
  category?: string | null;
  source?: string | null;
  auctionType?: string | null;
  propertyType?: string | null;
  status?: string | null;
  appraisalValue?: number | null;
  title?: string | null;
  generalInfo?: string | null;
  propertyDescription?: string | null;
  lotDescription?: string | null;
}

/**
 * Split a CSV filter value into trimmed, non-empty tokens.
 * `null` / `undefined` / blank → `[]` (which every caller reads as
 * "no constraint").
 */
export function parseCsv(value: string | null | undefined): string[] {
  if (value === null || value === undefined) return [];
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Lower-cased keyword tokens. */
function parseKeywords(value: string | null | undefined): string[] {
  return parseCsv(value).map((k) => k.toLowerCase());
}

/** Concatenated, lower-cased prose the keyword filter searches. */
function keywordHaystack(auction: AuctionForMatch): string {
  return [
    auction.title,
    auction.generalInfo,
    auction.propertyDescription,
    auction.lotDescription,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/**
 * True when `auction` satisfies every non-empty filter on `alert`.
 *
 * Does NOT consider `Alert.active`, `Alert.emailEnabled`, the Wave52 BUG-3
 * terminal-status floor, or any time window — those are the CALLER's gates and
 * differ per engine (Engine A floors on ALERTABLE statuses + a 24 h createdAt
 * window; Engine B is hard-limited to the `auction.go_live` event).
 */
export function alertMatchesAuction(
  alert: AlertCriteria,
  auction: AuctionForMatch,
): boolean {
  if (alert.province && auction.province !== alert.province) return false;
  if (alert.municipality && auction.municipality !== alert.municipality) return false;
  if (alert.category && auction.category !== alert.category) return false;
  if (alert.source && auction.source !== alert.source) return false;
  if (alert.auctionType && auction.auctionType !== alert.auctionType) return false;

  // wave218: the single Engine A behaviour change (see file header).
  if (alert.propertyType && auction.propertyType !== alert.propertyType) return false;

  if (alert.statuses) {
    const statuses = parseCsv(alert.statuses);
    if (statuses.length > 0 && !statuses.includes(String(auction.status))) return false;
  }

  // NOTE the asymmetry on a NULL appraisalValue (see file header): `null` is
  // coerced to 0, so a minPrice floor excludes priceless rows while a maxPrice
  // ceiling keeps them. Verbatim Engine A behaviour — do not "fix" unilaterally.
  if (alert.minPrice && (auction.appraisalValue as number) < alert.minPrice) return false;
  if (alert.maxPrice && (auction.appraisalValue as number) > alert.maxPrice) return false;

  if (alert.keywords) {
    const keywords = parseKeywords(alert.keywords);
    if (keywords.length > 0) {
      const haystack = keywordHaystack(auction);
      if (!keywords.some((k) => haystack.includes(k))) return false;
    }
  }

  return true;
}
