# FORGE_PLAN.md — dnksubastas Wave 1

**Owner:** Forge (backend)
**Branch:** `dnksubastas` in `dnk0304/dnkpartner` (code under `subastas/`)
**Status:** EXECUTING (Dennis greenlit autonomous run, bit by bit, NO deploy — Ken deploys after Niki verifies)
**Date:** 2026-05-29

## Goal
Lay the Postgres + Prisma + schema foundation that everything in Waves 2/3 sits on. Move the 229,217-row asset off SQLite onto a managed Hetzner/Coolify Postgres, kill the SQLite-only runtime ALTER hack, add the AuctionStatusHistory / AuctionBidHistory / event_outbox / Notification / Favorite-prefs schema so Ghost can wire engine-on in his next pass, and replace Windows-shaped process management so a Coolify deploy is actually possible. NO deploy this wave.

## Architecture Overview
```
Browser ── Next.js (Coolify container)
              │
              ▼
  src/lib/db.ts  (NEW: pg pool + ?→$N adapter)        ◄── keeps existing raw-SQL routes working
              │                                            on Postgres without rewriting all 22 routes
              ▼
       Postgres 16-alpine (Coolify, dedicated container)
              ▲                                  ▲
              │ Prisma Client (NEW models)       │ Python scraper (Ghost)
              │  - Notification, Favorite,       │  writes Auction + event_outbox
              │    Status/BidHistory,            │  via existing dual SQLite/PG adapter
              │    event_outbox                  │
              │
       Scraper-scheduler container (Ghost owns scheduler choice; cron via Coolify)
```

Strategy: **hybrid** — keep the existing `query / queryOne / execute` raw-SQL surface but back it with `pg` (parameterized `$N` placeholders, NOT `?`) via a thin adapter. Add Prisma Client too — used for NEW work (history tables, outbox, notification CRUD) and Prisma Migrate for all schema changes. This honors the 1–2-day budget honestly: ~22 existing routes get minimal `?→$N` + SQLite-function (`datetime('now')` etc.) translation done in the adapter, NOT a full Prisma Client rewrite of complex SELECT *-with-cursor-and-IN-clauses queries.

## Tech Stack Decision
- DB: **Postgres 16-alpine** dedicated container on Coolify (mirrors dnkpartner's pattern). `pg_trgm` + `pgcrypto` extensions.
- Driver: **`pg`** for the legacy raw-SQL routes (via the adapter), **`@prisma/client`** for new models + Prisma Migrate for all schema management.
- Migration tool: **Prisma Migrate** (`prisma migrate dev` locally, `prisma migrate deploy` in production). Bootstraps from current live SQLite shape via a `baseline` migration, then layers in the new schema.
- Why hybrid (not pure Prisma Client): the existing `/api/auctions` route does cursor pagination + dynamic `IN (?, ?, …)` + filtered count caching + per-row image fs-stat. A literal Prisma Client port is `findMany` with raw `$queryRaw` for the count fallback — it would require rewriting the whole route. Fits 1–2 days only via the adapter approach.
- Why not pure `pg` (no Prisma at all): no Prisma Migrate = manual SQL migration files forever; no type-safety for new models. Cost too high.

## Task Breakdown

### TASK-001: Provision Postgres on Coolify (brief 1.1)
- **Type:** Infra
- **Description:** Create a dedicated `standalone-postgresql` 16-alpine service on Coolify (same pattern as `bbu1nvmo12x9qqdtxrcor1p6` / dnkpartner). Enable `pg_trgm` + `pgcrypto`. Store connection string as Coolify managed secret. Verify reachable from candidate app container.
- **Input context:** Coolify API token + Hetzner SSH (`niki/PROJECTS/dnkpartner/CREDS.md`). Coolify API not reachable from local — use SSH + Coolify CLI/docker calls if API needs tunneling.
- **Output:** PG container running with DB `dnksubastas`, user `dnksubastas`, extensions installed. Report secret KEY name (`DATABASE_URL_SUBASTAS`).
- **Dependencies:** none
- **Estimated complexity:** Medium
- **Context budget:** ~2 files read, ~50 lines written — SAFE ✅
- **Delegatable:** No (one-off infra step)

### TASK-002: Add @prisma/client + pg + tsx; init Prisma client singleton; rewrite db.ts as pg-backed adapter (brief 1.2 core)
- **Type:** Core
- **Description:** Add deps. Create `src/lib/prisma.ts` (singleton Prisma Client). Rewrite `src/lib/db.ts` to back `query / queryOne / execute` with a `pg.Pool`, translating `?` → `$N` placeholders and the 8 SQLite functions in use (`datetime('now')` → `NOW()`, `strftime('%Y', x)` → `EXTRACT(YEAR FROM x)::int`). Delete the runtime `ensureAlertSchema()` and its call sites (3 routes).
- **Input context:** `src/lib/db.ts`, `src/lib/alerts-schema.ts`, the 4 sites that call ensureAlertSchema.
- **Output:** New `src/lib/db.ts`, new `src/lib/prisma.ts`, removed `src/lib/alerts-schema.ts`, edited 3 routes to drop ensureAlertSchema call.
- **Dependencies:** TASK-001 (need DATABASE_URL_SUBASTAS to test).
- **Estimated complexity:** Medium
- **Context budget:** 5 files, ~200 lines — SAFE ✅
- **Delegatable:** No

### TASK-003: Sweep all 22 route files for remaining SQLite-only constructs
- **Type:** Cleanup
- **Description:** Verify every raw-SQL site survives `?→$N` + dialect translation. Fix the `SELECT DISTINCT province` full-scan-per-request hot path with a 5-min in-memory cache (cheap, defensive). Fix `fs.existsSync` per-row image checks — convert to per-request Set built once. Confirm boolean handling (Alert.active is BOOLEAN in live SQLite, becomes proper boolean in PG).
- **Input context:** All 22 routes that import from `@/lib/db`.
- **Output:** Edits to routes where needed; route list before/after.
- **Dependencies:** TASK-002.
- **Estimated complexity:** Medium
- **Context budget:** 8 files, ~150 lines — SAFE ✅
- **Delegatable:** No

### TASK-004: Reconcile prisma/schema.prisma with live DB (brief 1.3 part A)
- **Type:** Schema
- **Description:** Switch provider to `postgresql`. Add the columns that exist in live SQLite but not in Prisma (Auction: `mapUrl, streetViewUrl, placeUrl, directionsUrl, auctionType default`; Alert: `name, auctionType, statuses, keywords, emailEnabled, smsEnabled`). Do NOT drop legacy enum values (Ghost still writes some; deferred per brief). Generate the initial migration.
- **Input context:** `prisma/schema.prisma`, the live-DB column list from `_inspect_db.js` output (already captured).
- **Output:** Updated schema, first migration `00_initial_baseline` matching live shape.
- **Dependencies:** TASK-002.
- **Estimated complexity:** Low
- **Context budget:** 2 files, ~80 lines — SAFE ✅
- **Delegatable:** No

### TASK-005: Add decided new schema — additive migration (brief 1.3 part B)
- **Type:** Schema
- **Description:** Add models: `AuctionStatusHistory`, `AuctionBidHistory`, `EventOutbox` (table-only, no worker). Extend `Favorite` with notify-pref fields. Upgrade `Notification` (type/channel/payload/deliveredAt/failureReason/deliveryAttempts). Add `Auction.suspensionReason`, `Auction.resumeAt`, `Auction.lastVerifiedAt`. Add `NotificationType` enum.
- **Input context:** brief 1.3 schema spec, audit §3.
- **Output:** Schema additions + migration `01_wave1_history_outbox_followprefs`.
- **Dependencies:** TASK-004.
- **Estimated complexity:** Medium
- **Context budget:** 1 file, ~150 lines — SAFE ✅
- **Delegatable:** No

### TASK-006: Add Postgres-specific indexes (pg_trgm GIN + composites)
- **Type:** Schema (DDL)
- **Description:** A raw SQL migration adding the indexes Prisma can't express: `pg_trgm` GIN on `Auction(title)` and `Auction(propertyDescription)`; composite `Auction(status, endsAt)`, `Auction(endsAt)`, `Auction(municipality, status)`, `Notification(userId, read, sentAt DESC)`, `AuctionStatusHistory(auctionId, changedAt DESC)`, `AuctionBidHistory(auctionId, seenAt DESC)`, `EventOutbox(processedAt, createdAt)`, plus all FK indexes (Prisma covers most).
- **Input context:** audit §5 index list.
- **Output:** Migration `02_pg_indexes` (raw SQL).
- **Dependencies:** TASK-005.
- **Estimated complexity:** Low
- **Context budget:** 1 file, ~50 lines — SAFE ✅
- **Delegatable:** No

### TASK-007: ETL SQLite → Postgres for the Auction table only (brief 1.4)
- **Type:** Migration / ETL
- **Description:** Node script: open SQLite read-only, page through Auction in 1k batches, `INSERT ... ON CONFLICT(boeId) DO UPDATE` into PG, transactional per batch. Clamp year-0023 endsAt (3 rows confirmed) → NULL. Other tables: User has 1 row (a single-seed) — also migrate. Favorite/Notification/Alert/etc. are EMPTY in live DB — skip. Spot-check 20 random boeIds field-by-field after. Rename `data/database/prod.db` → `prod.db.backup.20260529` and document.
- **Input context:** live SQLite file, new PG.
- **Output:** `scripts/etl-sqlite-to-pg.js` + run log with source/dest counts side by side.
- **Dependencies:** TASK-005 (tables must exist) + TASK-006 (indexes can be created before or after; brief is "after add indexes" for safety on small dataset — 229k rows is comfortable on this hardware).
- **Estimated complexity:** Medium
- **Context budget:** 1 file written ~200 lines + 1 inspect run — SAFE ✅
- **Delegatable:** No

### TASK-008: Document Coolify service layout + remove Windows-shaped process mgmt from the deploy path (brief 1.5)
- **Type:** Infra / docs
- **Description:** Replace `scripts/master-start.js` orchestration with a docs note pointing at Coolify services (app container, scraper-scheduler container, Coolify cron). Patch `src/app/api/admin/scraper/route.ts` `stop-all-scrapers` to use POSIX-safe `pkill` when not on Windows. Move all `.bat` / PowerShell `start_*.bat` files OUT of the deploy surface (leave them in repo as `legacy/` for local dev; do NOT delete). Brief flags Ghost owns scheduler choice — write a doc that calls that out, don't pick for him.
- **Input context:** `package.json` scripts, scraper admin route, list of `.bat` files at repo root.
- **Output:** `subastas/DEPLOY-COOLIFY.md` (layout doc), edited admin/scraper route, package.json scripts split.
- **Dependencies:** none (can run in parallel with TASK-007).
- **Estimated complexity:** Low
- **Context budget:** 4 files, ~120 lines — SAFE ✅
- **Delegatable:** No

### TASK-009: Verify app boots against Postgres + tsc clean + commit on branch
- **Type:** Verification
- **Description:** Run `npx prisma generate`, `npx prisma migrate status`, `npx tsc --noEmit`, `npm run build` against the live PG. Hit core routes (/api/auctions, /api/auctions/counts, /api/auctions/stats, /api/favorites GET) against PG; confirm same shape responses. Commit on `dnksubastas` branch. **Do NOT push, do NOT deploy** per brief.
- **Input context:** none new.
- **Output:** commit hash(es), verification log.
- **Dependencies:** all prior.
- **Estimated complexity:** Low
- **Context budget:** 0 files written — SAFE ✅
- **Delegatable:** No

## Execution Order
```
TASK-001 (Postgres provision)                ──┐
   │                                            │
   ▼                                            │
TASK-002 (deps + db.ts adapter + drop hack)    │
   │                                            │
   ▼                                            │
TASK-003 (route sweep + dialect fixes)         │
   │                                            │
   ▼                                            │
TASK-004 (reconcile schema)                    │
   │                                            │
   ▼                                            │
TASK-005 (new schema)                          │
   │                                            │
   ▼                                            │
TASK-006 (PG indexes)                          │
   │                                            │
   ▼                                            │
TASK-007 (ETL + spot-check) ◄── TASK-008 (docs/Windows replacement, parallel)
   │
   ▼
TASK-009 (verify + commit)
```

## Risk Flags
1. **Coolify API port 8000 not reachable from this machine** — must drive provisioning via SSH (verified working) + docker/CLI on the host. Workable.
2. **22 raw-SQL routes** — every one must be exercised against PG before "done." Mitigated by adapter handling 99% of cases automatically; remaining 1% (DISTINCT scan, fs.existsSync) handled in TASK-003.
3. **Prisma Migrate against a non-empty DB** — handled by introspecting the baseline migration from the reconciled schema; first migration is a no-op against the freshly-created PG; then ETL fills it.
4. **`endsAt` garbage** — 3 rows confirmed with `0023-…`; clamp to NULL during ETL.
5. **Scraper-side dual writes** — Ghost's scraper writes via the Python adapter (already PG-aware). When PG goes hot, Ghost flips the DSN env var and his side just works. No change needed from Forge to Ghost's code this wave.

## Open Decisions
- None blocking. Coolify provisioning approach (API vs SSH+CLI) decided: SSH+CLI since API isn't reachable from outside.

## Progress
- 2026-05-29 — Plan written. Beginning TASK-001.
- 2026-05-29 — TASK-001 DONE. PG container `jidtaj7dlaho5km6zru1dbi5` running, extensions installed, reachable from coolify network. Secret KEY name: `DATABASE_URL_SUBASTAS`.
- 2026-05-29 — TASK-002 DONE. db.ts rewritten as pg.Pool adapter with auto-translation; prisma.ts singleton added; alerts-schema.ts deleted; 3 routes drop the ensureAlertSchema call.
- 2026-05-29 — TASK-003 DONE. All 22 raw-SQL routes await-fixed + boolean/number coercions; province cache + streetview Set cache replace the per-request scans.
- 2026-05-29 — TASK-004 DONE. Schema reconciled with live DB; migration `20260529190807_init_baseline_wave1` applied.
- 2026-05-29 — TASK-005 DONE. AuctionStatusHistory, AuctionBidHistory, EventOutbox, Favorite prefs, upgraded Notification, Auction structured fields all in the same baseline migration.
- 2026-05-29 — TASK-006 DONE. Migration `20260529190904_pg_trgm_gin_indexes` applied; both GIN trgm indexes created.
- 2026-05-29 — TASK-007 DONE. ETL ran in 20s via COPY FROM. Counts: Auction 229,217 == 229,217 (MATCH), User 1 == 1 (MATCH). 4 garbage dates clamped to NULL. 20/20 spot-check matched. prod.db kept + duplicated to prod.db.backup.20260529-wave1.
- 2026-05-29 — TASK-008 DONE. admin/scraper/route.ts now branches on process.platform for pkill/pgrep, and uses query() instead of opening better-sqlite3. DEPLOY-COOLIFY.md documents the target layout.
- 2026-05-29 — TASK-009 DONE. tsc --noEmit clean; prisma migrate status "Database schema is up to date!"; npm run build green; 6/6 smoke tests pass. Commit f63b20b on branch dnksubastas (NOT pushed, NOT deployed).
