/**
 * Pure builder for the `Alert` INSERT — shared by POST (single) and PUT (bulk
 * replace) in `src/app/api/user/alerts/route.ts`.
 *
 * WHY THIS EXISTS (2026-07-28, F2a): the two routes each hand-wrote an identical
 * INSERT column list. `propertyType` ("Tipo de bien") was silently dropped on
 * BOTH — the column exists in the schema (Alert.propertyType) and the alerts
 * page POSTs it, but neither INSERT listed it, so every save lost it. Extracting
 * one builder (a) fixes the drop in a single place and (b) gives a pure unit to
 * test the round-trip against, matching the repo's tsx-assertion test style.
 *
 * All coercion mirrors the previous inline behaviour EXACTLY:
 *  - text fields: value || null (empty string → null)
 *  - prices: parseFloat when truthy, else null
 *  - email/sms flags: truthy → true, else false
 *  - notificationType: value || 'grouped'
 * The only behavioural change is that `propertyType` is now persisted.
 */

export interface AlertInsertBody {
  name?: unknown;
  source?: unknown;
  propertyType?: unknown;
  province?: unknown;
  municipality?: unknown;
  category?: unknown;
  auctionType?: unknown;
  statuses?: unknown;
  minPrice?: unknown;
  maxPrice?: unknown;
  keywords?: unknown;
  emailEnabled?: unknown;
  smsEnabled?: unknown;
  notificationType?: unknown;
}

export interface AlertInsertIds {
  id: string;
  userId: string;
  now: string;
}

export interface BuiltAlertInsert {
  /** Full parameterised INSERT statement (`?` placeholders — db.ts translates to $N). */
  sql: string;
  /** Ordered parameter values matching the placeholders. */
  params: unknown[];
  /** Column names, in order — exposed for tests / introspection. */
  columns: string[];
}

/** Ordered column list for the Alert INSERT (propertyType now included). */
export const ALERT_INSERT_COLUMNS = [
  'id',
  'userId',
  'name',
  'source',
  'propertyType',
  'province',
  'municipality',
  'category',
  'auctionType',
  'statuses',
  'minPrice',
  'maxPrice',
  'keywords',
  'emailEnabled',
  'smsEnabled',
  'notificationType',
  'createdAt',
  'updatedAt',
] as const;

function textOrNull(v: unknown): string | null {
  return v ? String(v) : null;
}

function priceOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v));
  return Number.isNaN(n) ? null : n;
}

/**
 * Build the parameterised Alert INSERT for one alert row.
 * Never interpolates user input into SQL — all values flow through `params`.
 */
export function buildAlertInsert(body: AlertInsertBody, ids: AlertInsertIds): BuiltAlertInsert {
  const params: unknown[] = [
    ids.id,
    ids.userId,
    textOrNull(body.name),
    textOrNull(body.source),
    textOrNull(body.propertyType),
    textOrNull(body.province),
    textOrNull(body.municipality),
    textOrNull(body.category),
    textOrNull(body.auctionType),
    textOrNull(body.statuses),
    priceOrNull(body.minPrice),
    priceOrNull(body.maxPrice),
    textOrNull(body.keywords),
    body.emailEnabled ? true : false,
    body.smsEnabled ? true : false,
    textOrNull(body.notificationType) || 'grouped',
    ids.now,
    ids.now,
  ];

  const placeholders = ALERT_INSERT_COLUMNS.map(() => '?').join(', ');
  const sql = `INSERT INTO Alert (${ALERT_INSERT_COLUMNS.join(', ')}) VALUES (${placeholders})`;

  return { sql, params, columns: [...ALERT_INSERT_COLUMNS] };
}
