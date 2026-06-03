# FORGE_PLAN_WAVE2C.md — email verification + notification fixes

## Goal
Make outbound-email-dependent code mechanically correct so the moment Dennis ships a valid Resend key + verified domain, three flows work end-to-end:
1. Notifications (dispatcher) — already mechanically sound; unify from-address env so one var (`RESEND_FROM_EMAIL`) controls every send path.
2. Email verification — register currently auto-verifies + sends nothing; build a real token-based verification flow using the existing `VerificationToken` table.
3. Category/region alerts — scheduler currently calls a stale prefix `/subastas/api/alerts/check` (404) unauthenticated (would 401 anyway); fix path + add cron Bearer.

## Tech Stack Decision
- App: Next.js (deployed). Resend SDK already a dep.
- Verification token store: reuse `VerificationToken` Prisma model (NextAuth standard, `identifier/token/expires`). No migration.
- Verify endpoint uses raw-SQL via `@/lib/db` to match register/forgot-password (PG-dialect translated, `?` placeholders).
- Scheduler is Python — patch `subastas/scraper/scheduler.py`.

## Task Breakdown

### TASK-001 — FIX1: unify RESEND_FROM_EMAIL across all paths
- `subastas/src/app/api/auth/forgot-password/route.ts`: replace `EMAIL_FROM` → `RESEND_FROM_EMAIL`.
- Default everywhere → `'SubastasActivas <notificaciones@subastasactivas.com>'`.
- Files: forgot-password/route.ts, alerts/check/route.ts, alerts/test/route.ts, dispatcher/index.ts (defaults align).
- Budget: Lean.

### TASK-002 — FIX2a: register no longer auto-verifies + sends verification email
- File: `subastas/src/app/api/auth/register/route.ts`.
- Set `emailVerified = NULL` on insert.
- Generate token, insert `VerificationToken(identifier=email, token, expires=now+24h)`.
- Send via Resend using `createVerificationEmail` template (already exists).
- Soft-verify: do NOT block login. Existing 201 payload stays.
- Budget: Normal.

### TASK-003 — FIX2b: add /api/auth/verify-email route
- File (NEW): `subastas/src/app/api/auth/verify-email/route.ts`.
- `GET` (link click) + `POST` (programmatic). Reads `token` from query/body.
- Validate against `VerificationToken`, check `expires > NOW()`, set `User.emailVerified = NOW()` for identifier, delete the token row.
- `GET` redirects to `/login?verified=1` on success or `/login?verified=0&reason=...` on failure.
- Budget: Lean.

### TASK-004 — FIX3: scheduler.py — fix alert-check path + cron auth
- File: `subastas/scraper/scheduler.py` (`trigger_alert_check` around line 583).
- Add `ALERT_CHECK_ENDPOINT` env mirroring `DISPATCH_ENDPOINT`, default `f"{APP_BASE_URL}/api/alerts/check"` (NO `/subastas` prefix).
- Add `Authorization: Bearer {CRON_SECRET}` header.
- Skip if `CRON_SECRET` not set.
- Budget: Lean.

### TASK-005 — gates
- `prisma generate` → `tsc --noEmit` → `next build`.

## Execution Order
TASK-001 ∥ TASK-002 ∥ TASK-003 ∥ TASK-004 → TASK-005.

## Risk Flags
- `VerificationToken` uses column `expires` (not `expiresAt`) — see `schema.prisma:386`.
- No migration (`VerificationToken` model already present).
- Scheduler image ≠ app image → scheduler.py change requires scheduler image rebuild (flag to Ken).

## Open Decisions
- Hard vs soft verify gating → Dennis decides; default soft.
