# Wave 2b — API Contracts (for Pixel Wave 2c)

> All endpoints live under `/subastas/api/...` (basePath set at the box).
> All endpoints respond with `{ success: true, ... }` or `{ success: false, error: '<code>', ... }`.
> All endpoints requiring auth return `401 { error: 'unauthorized' }` on missing/invalid session
> and `403 { error: 'forbidden' }` for admin-only routes hit by non-admin sessions.
> Auth = NextAuth v5 session cookie (existing `auth()` helper).

---

## Notifications

### `GET /api/notifications`
List the current user's in-app notifications, newest first, cursor-paginated.

Query:
- `limit` — int, 1-100, default 20
- `cursor` — ISO timestamp; returns rows with `sentAt < cursor`
- `unread` — `true` to return only unread

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "...",
      "type": "NEW_BID",                // NotificationType enum
      "channel": "inapp",
      "auctionId": "...",
      "read": false,
      "sentAt": "2026-05-30T12:34:56.000Z",
      "deliveredAt": "2026-05-30T12:34:56.000Z",
      "payload": {
        "title": "...",
        "province": "Madrid",
        "currentBid": 12345,
        "__event": "auction.new_bid",
        "__dedupe": "<auctionId>:<eventType>:<discriminator>"
      }
    }
  ],
  "pagination": { "hasMore": true, "nextCursor": "2026-05-30T12:00:00.000Z" }
}
```

### `GET /api/notifications/unread-count`
Returns `{ success: true, count: number }`.

### `POST /api/notifications/mark-read`
Body: `{ all?: true } | { ids?: string[] }` (at least one required).
Response: `{ success: true, updated: number }`.

### `PATCH /api/notifications/[id]`
Body: `{ read?: boolean }` (default true).
Response: `{ success: true }` or `404 { error: 'not_found' }`.

### `DELETE /api/notifications/[id]`
Response: `{ success: true }` or `404 { error: 'not_found' }`.

---

## Follows (Favorite + notify-prefs)

### `GET /api/follows`
List of current user's followed auctions with prefs + minimal auction info.

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "...",
      "auctionId": "...",
      "notes": null,
      "createdAt": "...",
      "notifyOnGoLive": true,
      "notifyOnBid": true,
      "notifyOnStatus": true,
      "notifyOnSuspension": true,
      "notifyOnResume": true,
      "notifyOnFinish": true,
      "channels": "email,inapp",
      "quietHoursStart": null,
      "quietHoursEnd": null,
      "auction": {
        "id": "...",
        "title": "...",
        "province": "Madrid",
        "municipality": "Madrid",
        "status": "CELEBRANDOSE",
        "currentBid": 12345,
        "appraisalValue": 50000,
        "endsAt": "2026-06-15T00:00:00.000Z",
        "imageUrl": "..."
      }
    }
  ]
}
```

### `POST /api/follows`
Body: `{ auctionId: string, notes?: string, ...prefs }` (prefs accepted same shape as PATCH below).
Idempotent — re-following updates prefs in place.
Response: `{ success: true, data: <follow row> }` or `404 { error: 'auction_not_found' }`.

### `DELETE /api/follows/[auctionId]`
Response: `{ success: true, removed: 0 | 1 }` (idempotent).

### `GET /api/follows/[auctionId]/prefs`
Response: `{ success: true, data: <prefs> }` or `404 { error: 'not_following' }`.

### `PATCH /api/follows/[auctionId]/prefs`
Body (all fields optional):
```json
{
  "notifyOnGoLive": true,
  "notifyOnBid": true,
  "notifyOnStatus": true,
  "notifyOnSuspension": true,
  "notifyOnResume": true,
  "notifyOnFinish": true,
  "channels": "email,push,inapp",
  "quietHoursStart": 22,
  "quietHoursEnd": 7
}
```
- `channels`: CSV of `email|push|inapp` (others rejected silently)
- `quietHoursStart/End`: integers 0-23 (UTC), `null` to disable
- 400 if no recognized field present
- 404 `{ error: 'not_following' }` if user does not follow this auction

Response: `{ success: true, data: <prefs> }`.

---

## Web Push

### `POST /api/web-push/subscribe`
Body: `{ endpoint: string, keys: { p256dh: string, auth: string } }`
Upserts on `endpoint`. Idempotent.
Response: `{ success: true, id: string }`.

### `POST /api/web-push/unsubscribe`
Body: `{ endpoint: string }` OR `{ all: true }` to remove all of the user's subscriptions.
Response: `{ success: true, removed: number }`.

### Legacy alias (still works)
`POST /api/push/subscribe` and `DELETE /api/push/subscribe` (existing routes, untouched).

---

## Auctions

### `GET /api/auctions/[id]`
Public (no auth). Returns the auction with status + bid history and follow status
for the requesting session (if any).

Response:
```json
{
  "success": true,
  "data": {
    "auction": { ...full Auction row... },
    "history": {
      "statuses": [
        { "id": "...", "fromStatus": "CELEBRANDOSE", "toStatus": "SUSPENDIDA",
          "changedAt": "...", "reason": "...", "resumeAt": "...", "source": "scraper" }
      ],
      "bids": [
        { "id": "...", "bid": 12345, "bidType": "current", "seenAt": "...", "source": "scraper" }
      ]
    },
    "followCount": 3,
    "isFollowing": true
  }
}
```

---

## Dispatcher

### `POST /api/dispatch/run`
Auth: `Authorization: Bearer <CRON_SECRET>` OR admin session.
Query: `batch=1..500` (default 50).

Response:
```json
{
  "success": true,
  "mode": "cron" | "admin",
  "stats": {
    "outboxScanned": 12,
    "outboxProcessed": 12,
    "outboxSkipped": 0,
    "followersFanned": 25,
    "emailsSent": 7,
    "emailsFailed": 0,
    "pushSent": 3,
    "pushFailed": 0,
    "pushPruned": 1,
    "inAppCreated": 12,
    "duplicatesSkipped": 0,
    "prefSkipped": 1,
    "quietHoursSkipped": 0,
    "errors": []
  }
}
```

---

## RBAC locked (Wave 2b)

| Route | Old auth | New auth |
| --- | --- | --- |
| `POST /api/alerts/check` | open | Bearer CRON_SECRET OR admin session |
| `POST /api/alerts/test`  | open | admin session only |
| `GET /api/alerts/test`   | open | admin session only |
| `POST /api/dispatch/run` | new   | Bearer CRON_SECRET OR admin session |

Admin = `session.user.email === 'dennis.kotlenko@gmail.com'`
(centralized constant `ADMIN_EMAIL` in `src/lib/auth-helpers.ts`).

---

## Event taxonomy (consumer ↔ producer contract — locked with Ghost Wave 2a)

`eventType` strings (consumed by dispatcher, emitted by scraper):
- `auction.go_live`
- `auction.status_change`
- `auction.new_bid`
- `auction.suspended`
- `auction.rescheduled`
- `auction.ending_soon`
- `auction.finished`

`dedupeKey` format: `{auctionId}:{eventType}:{discriminator}` where discriminator
is the new status / bid sequence / scheduled timestamp. Dispatcher idempotency
keys off `Notification.payload.__dedupe == dedupeKey` per (userId, channel) for
30 days.

`payload` carries enough data to render the email/push/in-app without a second
DB read: `{ auctionId, title, province, municipality, currentBid, toStatus,
suspensionReason, resumeAt, endsAt, finalBid, ... }`.

`Favorite.notifyOn*` boolean fields gate delivery per follower:
- `notifyOnGoLive`     → `auction.go_live`
- `notifyOnBid`        → `auction.new_bid`
- `notifyOnStatus`     → `auction.status_change`, `auction.ending_soon`
- `notifyOnSuspension` → `auction.suspended`
- `notifyOnResume`     → `auction.rescheduled`
- `notifyOnFinish`     → `auction.finished`

`Favorite.channels` (CSV of `email|push|inapp`) gates per channel.
`Favorite.quietHoursStart/End` (UTC hour-of-day) skip delivery during quiet window.

---

## Worker deployment notes (for Ken)

Two ways to run the dispatcher:

1. **Standalone container** (recommended): add a service to
   `/data/dnksubastas-deploy/docker-compose.yml`:
   ```yaml
   dnksubastas-dispatcher:
     image: dnksubastas:wave2b
     command: ["npm", "run", "worker:dispatcher"]
     restart: unless-stopped
     environment:
       - DATABASE_URL=${DATABASE_URL_SUBASTAS}
       - RESEND_API_KEY=${RESEND_API_KEY}
       - VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}
       - VAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY}
       - NEXT_PUBLIC_APP_URL=https://dnkpartner.com/subastas
     networks: [coolify]
   ```

2. **Cron-driven** (no extra container): add a job to the existing
   `dnksubastas-scheduler` container that pings:
   ```
   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
     https://dnkpartner.com/subastas/api/dispatch/run?batch=200
   ```
   every 1-2 minutes.

Either way, multi-instance safe — outbox claim uses `FOR UPDATE SKIP LOCKED`
and per-user dedupe is enforced at Notification insert time.
