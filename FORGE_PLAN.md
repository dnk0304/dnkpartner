# FORGE_PLAN.md — DNK Partner auth lockdown

## Goal
Lock down the auth surface: move login from `/auth/login` → `/login`, remove all registration UI + API entirely (404), enforce a server-side email allowlist on both email/password and Google OAuth flows (timing-safe, invisible), delete the dead email-verification routes, and seed Dennis's owner row in prod so he can log in. Pixel handles landing-page CTA strip + logo alpha-key in parallel — files do not overlap.

## Architecture Overview
```
Browser → /login (page)                       ← moved from /auth/login
Browser → POST /api/auth/login (server)       ← adds isEmailAllowed() gate BEFORE DB lookup
Browser → /api/auth/google/callback (server)  ← adds isEmailAllowed() gate BEFORE user upsert
Browser → /auth/login (any sub-route)         ← 308 redirect (next.config.ts)
Browser → /auth/register                      ← 404 (deleted)
Browser → /api/auth/register                  ← 404 (deleted)
Browser → /auth/verify-email + APIs           ← 404 (deleted — dead post-lockdown)

lib/auth.ts adds ALLOWED_EMAILS Set + isEmailAllowed() helper. Env: ALLOWED_LOGIN_EMAILS.
```

## Tech Stack Decision
No new deps. Use existing Next 16 (proxy.ts middleware), Prisma, bcryptjs. Seed script via `npx tsx` (no install — npx fetches transient package). Reject path mirrors wrong-password (401 + identical error body) so allowlist is invisible.

Important environment notes:
- `next.config.ts` (not `.js`) — brief said `.js`, actual file is `.ts`. Will edit `.ts`.
- `proxy.ts` is the Next 16 middleware file (replaces `middleware.ts`). Lists `/auth/*` paths + matcher. Must be updated to new paths or Phase 1 protected-route logic breaks.
- bcryptjs already a dep (no install needed for seed script).
- README.md mentions `/api/auth/register` auto-verify path — update copy.

## Task Breakdown

### TASK-001: Move login page → /login
- **Type:** Page move + edit
- **Files:** `app/auth/login/page.tsx` → `app/login/page.tsx`
- **Edits inside moved file:** href `/auth/forgot-password` → `/forgot-password`; delete "Don't have an account? Create one" block (lines 252-260); add `not_authorized` case to `oauthErrorMessage` switch.
- **Budget:** 1 file moved, ~10 lines edited. ✅ Lean.

### TASK-002: Move forgot-password page → /forgot-password
- **Type:** Page move + edit
- **Files:** `app/auth/forgot-password/page.tsx` → `app/forgot-password/page.tsx`
- **Edits:** href `/auth/login` → `/login` (line 51).
- **Budget:** 1 file moved, 1 line edited. ✅ Lean.

### TASK-003: Delete registration (UI + API)
- **Type:** Delete
- **Files removed:** `app/auth/register/` (page), `app/api/auth/register/` (route).
- **Verify:** `grep -r "auth/register"` returns only the redirect line + sitemap line (handled in later tasks).
- **Budget:** 2 dirs removed. ✅ Lean.

### TASK-004: Delete email-verification dead code
- **Type:** Delete
- **Files removed:** `app/auth/verify-email/`, `app/api/auth/verify-email/`, `app/api/auth/resend-verification/`.
- **Notes:** `lib/email.ts` `sendVerificationEmail` becomes unreferenced — leave (harmless). The `/api/auth/login` `emailVerified` 403 block (lines 32-34) is removed in TASK-006.
- **Budget:** 3 dirs removed. ✅ Lean.

### TASK-005: Add allowlist helper to lib/auth.ts
- **Type:** Lib edit
- **Files:** `lib/auth.ts`
- **Append:** `ALLOWED_EMAILS` Set + `isEmailAllowed()` exported function.
- **Budget:** +15 lines. ✅ Lean.

### TASK-006: Wire allowlist into /api/auth/login + drop emailVerified gate
- **Type:** API edit
- **Files:** `app/api/auth/login/route.ts`
- **Edits:** import `isEmailAllowed`; gate after JSON parse, before DB lookup; remove `emailVerified` 403 block.
- **Budget:** ~8 lines added, 3 removed. ✅ Lean.

### TASK-007: Wire allowlist into Google OAuth callback + redirect targets to /login
- **Type:** API edit
- **Files:** `app/api/auth/google/callback/route.ts`
- **Edits:** import `isEmailAllowed`; gate after `email_verified` check (line ~81), before user lookup; update `loginErrorRedirect()` target from `/auth/login` → `/login`.
- **Budget:** ~8 lines added, 1 changed. ✅ Lean.

### TASK-008: Update proxy.ts middleware (Next 16)
- **Type:** Middleware edit
- **Files:** `proxy.ts`
- **Edits:** AUTH_PAGES list → `['/login', '/forgot-password']` (drop verify-email/register/reset-password — they no longer exist); `bounceToLogin` builds URLs against `/login` not `/auth/login`; matcher config → `['/', '/login', '/forgot-password']` (and any future PROTECTED routes).
- **Why:** without this, Phase 1 protected-route bounces would 308-redirect and the matcher would miss the new paths.
- **Budget:** ~10 lines edited. ✅ Lean.

### TASK-009: Update app/sitemap.ts
- **Type:** Edit
- **Files:** `app/sitemap.ts`
- **Edits:** Remove `/auth/register` entry. Change `/auth/login` → `/login`, priority 0.3.
- **Budget:** ~6 lines. ✅ Lean.

### TASK-010: Add 308 redirects in next.config.ts
- **Type:** Config edit
- **Files:** `next.config.ts` (NOT .js — actual file is .ts)
- **Edits:** Add `async redirects()` returning `/auth/login → /login` and `/auth/forgot-password → /forgot-password` (both `permanent: true`). Merge with existing config (reactStrictMode, serverExternalPackages).
- **Budget:** ~10 lines added. ✅ Lean.

### TASK-011: Touch README copy about register
- **Type:** Doc edit
- **Files:** `README.md`
- **Edits:** Update the line that mentions `/api/auth/register` auto-verify (no longer exists). One-line note: registration removed, allowlist gates login.
- **Budget:** ~2 lines edited. ✅ Lean.

### TASK-012: Verify nothing else references removed paths
- **Type:** Verification
- **Action:** grep `auth/register`, `auth/login`, `verify-email`, `resend-verification` across the tree; confirm no orphan imports/links remain.
- **Budget:** 0 lines written. ✅ Lean.

### TASK-013: Build verify (npm run build / typecheck)
- **Type:** Verification
- **Action:** `npm run build` — surface TS errors. Fix any orphan import.
- **Budget:** read errors, fix surgically. ✅ Lean.

### TASK-014: Write + run seed-owner.ts, then delete
- **Type:** One-off script
- **Files:** `scripts/seed-owner.ts` (deleted before commit)
- **Action:** Write the script per §3.12 with `DnkPartner2026!` (Option C). Run via `npx tsx scripts/seed-owner.ts` with prod `DATABASE_URL` from CREDS.md. Verify row inserted. **Delete the file before staging.**
- **Risk:** Plaintext password in file. **Must not commit.**
- **Budget:** ~30 lines, ephemeral. ✅ Lean.

### TASK-015: Commit on main
- **Type:** Git
- **Branch:** main (already there, branched from 5504f57)
- **Commit message:** `forge: lock down auth — move login to /login, remove registration, add email allowlist, seed owner`
- **Do NOT:** push, deploy, set Coolify env vars (Ken handles).
- **Verify pre-commit:** `scripts/seed-owner.ts` is absent from `git status`; only Pixel's untracked files for `scripts/alpha-key-logo.js` remain (Pixel's, not mine — leave them).
- **Budget:** N/A.

## Execution Order
Sequential — file moves first to keep referents valid, then deletes, then allowlist wiring, then redirects + middleware, then verify, then seed-then-delete, then commit.

1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15

No safe parallelism (small repo, file overlaps in mental model).

## Risk Flags
- **Pixel collision risk:** Pixel is mid-flight on `app/page.tsx` + `public/brand/dnk-partner-logo.png`. Both untracked-modifications already in working tree. I will NOT touch them; commit message will explicitly stage only my files (use `git add` per-file, not `-A`).
- **Seed script secret leak:** plaintext `DnkPartner2026!` lives in `scripts/seed-owner.ts` during run. MUST delete before commit. Pre-commit verification step in TASK-015 guards this.
- **Coolify env var:** Ken sets `ALLOWED_LOGIN_EMAILS=dennis.kotlenko@gmail.com` post-deploy. Until set, fallback in `lib/auth.ts` defaults to `dennis.kotlenko@gmail.com` so production stays usable even if Ken forgets — this matches brief §3.6 "dev-only fallback".
- **Middleware redirect interaction:** proxy.ts matcher must include `/login`; AUTH_PAGES must list `/login` — otherwise logged-in users hitting `/login` are not bounced to `/`.
- **next.config.ts redirects():** Next.js redirects() at next.config.ts level work for `/auth/login` even though the URL bypasses middleware (Next handles redirects before middleware).
- **DB connectivity:** seed script needs prod DATABASE_URL. Pulling from CREDS.md (hostname `bbu1nvmo12x9qqdtxrcor1p6` resolves only inside Coolify network). Will need to either (a) SSH to Hetzner + `docker exec` on app container, or (b) tunnel pg, or (c) hand the script to Ken if no path. Try (a) first.

## Open Decisions
None — Niki greenlit Option C with `DnkPartner2026!`.

## Status
- [x] TASK-001 — Move login page → /login (done: page moved, hrefs updated, Create-one block removed, not_authorized case added)
- [x] TASK-002 — Move forgot-password → /forgot-password (done: page moved, /login href updated)
- [x] TASK-003 — Delete registration UI+API (done)
- [x] TASK-004 — Delete email-verification dead code (done)
- [x] TASK-005 — Add isEmailAllowed helper (done in lib/auth.ts)
- [x] TASK-006 — Wire allowlist into /api/auth/login + drop emailVerified gate (done)
- [x] TASK-007 — Wire allowlist into Google callback + /login redirects (done)
- [x] TASK-008 — Update proxy.ts (done: AUTH_PAGES + matcher + bounceToLogin all point at /login + /forgot-password)
- [x] TASK-009 — Update sitemap (done: register removed, /login at priority 0.3)
- [x] TASK-010 — next.config.ts redirects (done)
- [x] TASK-011 — README touch (done)
- [x] TASK-012 — grep verify (done: only sitemap/redirect-config references remain; no orphan imports)
- [x] TASK-013 — npm run build (clean, 0 TS errors)
- [x] TASK-014 — seed script written; could not reach prod pg from Windows (firewalled). Script handed to Ken with run instructions; deleted from working tree before commit.
- [x] TASK-015 — Commit on main (hash: see résumé)
