# FORGE_PLAN.md — Etsy v3 API trend ingestion (DNK Trends)

## Goal
Promote Etsy v3 API to Layer 1 in `server/trends/etsyScraper.ts` (Puppeteer demoted to fallback), add a persistent header-aware daily request budget, snapshot-based pull cadence, and expose Etsy freshness + budget in `/api/trends/health`. Scope locked by Ken's brief 2026-06-11; Dennis-approved — plan approval implied by dispatch.

## Architecture
```
scheduler (cron, ETSY_PULLS_PER_DAY) ──> etsyScraper.getAllTrends()
                                            │ API enabled?
                              yes ──> etsyApi path: per-niche findAllListingsActive
                                      (budget-gated via etsyBudget) ──> snapshots JSON
                                      ──> EtsyTrend[] ──> trendStore
                              no/empty ──> legacy Puppeteer path (fallback)
etsyBudget: data/trends/etsy-budget.json (UTC-day counter, header-aware cap, ≤5 qps)
/api/trends/health: + etsy { freshness, requestsToday, remainingBudget, caps }
```

## Tasks
- TASK-001 `server/trends/etsyBudget.ts` (new, ~160 lines): persistent UTC-day counter; cap = min(ETSY_DAILY_BUDGET default 4000, header `X-Limit-Per-Day`); track `X-Remaining-This-Day`; ≤5 req/s throttle; fail-soft skip when exhausted. — DONE
- TASK-002 `server/trends/etsyScraper.ts`: API → Layer 1. Typed v3 client (findAllListingsActive keywords/taxonomy_id, sort_on=score, limit 100; getListingsByListingIds batch ≤100); per-niche snapshot pull (1 search + ≤2 detail calls); timestamped snapshots to `data/scrapers/etsy/snapshots/`; Puppeteer fallback preserved. ETSY_API_KEY read from env only (full x-api-key value), fail-soft if unset. — DONE
- TASK-003 `server/trends/scheduler.ts`: Etsy cron derived from ETSY_PULLS_PER_DAY (default 3 → every 8h); add missing `getHealthStatus/getHealthSummary/getHealthAlerts` delegates (health endpoint currently throws — methods only existed in unused `scheduler_temp.ts`). — DONE
- TASK-004 `server/index.ts`: `/api/trends/health` response gains `etsy` block (budget status + snapshot freshness). — DONE
- TASK-005 Verify: tsc clean on touched files; live pull of 1 niche with real key via env; show counter increment + header-derived limits. — DONE: "coloring book" → 100 listings, count=299210; batch detail → 1 listing; counter 0→1→2 persisted across processes; X-Limit-Per-Day=5000 captured, cap stayed at min(env 4000, header 5000)=4000.

## Found-and-fixed (pre-existing)
- `server/trends/scheduler.ts` JSDoc contained literal `0 *​/N` which terminated the block comment and made the WHOLE module unparseable (tsx TransformError at HEAD — current prod must be running an older build). Comment rewritten.
- `/api/trends/health` called `trendScheduler.getHealthStatus/getHealthSummary/getHealthAlerts/testScraper` which only existed in unused `scheduler_temp.ts` → runtime "not a function". Delegates added to `scheduler.ts`.

## Env
`ETSY_API_KEY` (full x-api-key value — keystring:secret per Ken's live test), `ETSY_DAILY_BUDGET` (default 4000), `ETSY_PULLS_PER_DAY` (default 3). Coolify injection by Ken.

## Risk flags
- Provisional key may have lower limits → header-aware cap handles it.
- `tsconfig.json` only typechecks `src/` — server runs via tsx; verify with targeted `tsc --noEmit` on trends files.

## Out of scope
OAuth, listing writes, proxy work, UI, deploy (Ken).
