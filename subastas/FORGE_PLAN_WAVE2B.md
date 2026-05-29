# FORGE_PLAN — Wave 2b (Dispatcher + API + RBAC)

## Goal
Build the notification dispatcher worker that drains `event_outbox` rows produced
by Ghost (Wave 2a), fans them out to email/web-push/in-app channels with
idempotency on (dedupeKey, recipientId, channel), and ship the supporting
follow + notification + web-push API routes. Lock down `/api/alerts/check` and
`/api/alerts/test` behind admin RBAC + cron secret. Publish API contracts for
Pixel Wave 2c.

## Tech Stack
- Next.js 16 + NextAuth v5 beta + Prisma 7 (already in use)
- Postgres (Wave 1.3 schema with EventOutbox / upgraded Notification / Favorite prefs)
- Resend (email, already wired) + web-push (lib present, dispatch needs completion)
- Worker: standalone Node script (`scripts/run-dispatcher.ts`) intended for a
  separate `dnksubastas-dispatcher` container; plus a cron-secret-guarded
  `/api/dispatch/run` for on-demand trigger and integration with the existing
  Python scheduler if Ken prefers not to spin up another container yet.

## Event taxonomy (locked with Ghost brief)
- `auction.go_live`
- `auction.status_change`
- `auction.new_bid`
- `auction.suspended`
- `auction.rescheduled`
- `auction.ending_soon`
- `auction.finished`

dedupeKey format: `{auctionId}:{eventType}:{discriminator}` where discriminator
is the new status / bid sequence / scheduled timestamp.

## Tasks

### TASK-001 — Auth/RBAC helpers (LEAN)
- New `src/lib/auth-helpers.ts`: `requireSession`, `requireAdmin`, `requireCronSecret`.
- Reuse `ADMIN_EMAIL = 'dennis.kotlenko@gmail.com'` pattern from existing admin routes.
- Cron secret: read `CRON_SECRET` env, verify `Authorization: Bearer <secret>` constant-time.

### TASK-002 — Dispatcher core (NORMAL)
- `src/lib/dispatcher/index.ts` — `drainOutbox()`, `dispatchEvent()`, idempotency.
- `src/lib/dispatcher/templates.ts` — per-eventType email/push/in-app subject+body.
- `src/lib/dispatcher/webpush.ts` — finish stubbed web-push dispatch + prune 410/404.
- Claim outbox rows via UPDATE…WHERE processedAt IS NULL RETURNING (atomic single-row claim).
- Per-event: resolve followers via Favorite table + per-channel pref check + quiet-hours skip.
- Idempotency: try-insert Notification with `dedupeKey:recipientId:channel` derived dedupe;
  use the Notification.id key constraint + onConflict skip.
  - Practical implementation: build a unique key `{dedupeKey}|{userId}|{channel}` and use it
    in a (best-effort) check-then-insert under a `failureReason = 'duplicate'` skip. Because
    Notification doesn't have a unique index on (dedupeKey, user, channel) yet, we use a
    SELECT-then-INSERT under a transaction. (Schema doesn't allow new migration this wave
    per brief; this is OK given dispatcher is single-claiming the outbox row.)
- Per-channel results recorded on the Notification row (deliveredAt / failureReason / deliveryAttempts).
- Outbox row marked processed only after all channels for all followers are accounted for.

### TASK-003 — Worker entry + cron API (LEAN)
- `scripts/run-dispatcher.ts` — long-running loop, 10s poll, graceful SIGTERM.
- `app/api/dispatch/run/route.ts` — POST, cron-secret-guarded, drains one batch.
- `package.json` script: `worker:dispatcher` → `tsx scripts/run-dispatcher.ts`.

### TASK-004 — Notifications API (LEAN)
- `app/api/notifications/route.ts` — GET (list, cursor pagination)
- `app/api/notifications/unread-count/route.ts` — GET
- `app/api/notifications/mark-read/route.ts` — POST (mark all OR list of IDs)
- `app/api/notifications/[id]/route.ts` — PATCH (mark single read), DELETE

### TASK-005 — Follows API (LEAN)
- `app/api/follows/route.ts` — GET (list), POST (create from auctionId)
- `app/api/follows/[auctionId]/route.ts` — DELETE
- `app/api/follows/[auctionId]/prefs/route.ts` — GET/PATCH per-auction prefs

### TASK-006 — Auction detail loader (LEAN)
- `app/api/auctions/[id]/route.ts` — GET, returns full transformed shape for Pixel detail page.

### TASK-007 — Web-push unsubscribe (LEAN)
- `app/api/web-push/unsubscribe/route.ts` — POST (and a GET-style fallback for existing
  `/api/push/subscribe` DELETE that's already there). Tied to session user.

### TASK-008 — RBAC lockdown (LEAN)
- `/api/alerts/check` — require cron secret (designed for cron) OR admin.
- `/api/alerts/test` — require admin (sends real email).
- Document the change in route file headers.

### TASK-009 — Verify + commit (LEAN)
- `npx tsc --noEmit` clean.
- `npx prisma generate` clean.
- `npm run build` clean (or document why skipped).
- Smoke-test dispatcher: insert a fake event_outbox row → drainOutbox → confirm
  in-app Notification row created (or failureReason captured). Done via a
  one-shot test script.
- Commit on dnksubastas branch.

## Execution order
001 → 002 → 003 → 004,005,006,007 (parallel) → 008 → 009

## Risk flags
- No schema migration this wave (per brief). Idempotency under racing dispatcher
  instances therefore relies on the outbox-claim being atomic (SELECT…FOR UPDATE
  SKIP LOCKED or single-row UPDATE…RETURNING). Single dispatcher instance is the
  recommended deploy; the cron-secret API is the second option for low-volume
  trigger. If two instances run, the worst case is a duplicate attempt per
  channel — Notification rows get deduped by the check-then-insert.
- `web-push` library used by `lib/notifications/channels/push-channel.ts`
  already; my dispatcher uses the same library directly so VAPID env contract
  is unchanged.
- basePath: `/subastas` is configured on the box (Wave 1.5, not yet in local
  git). My new API routes are mounted under `/api/...` and Next will serve them
  under `/subastas/api/...` automatically. Email links use `NEXT_PUBLIC_APP_URL`.

## Open decisions
- Worker container vs scheduler-cron: BOTH delivered (Ken picks at deploy time).
- Notification dedupe index: not added this wave (no-migration constraint); enforced
  in code. Future wave can add a partial unique index.
