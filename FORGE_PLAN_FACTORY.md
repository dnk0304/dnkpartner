# FORGE_PLAN_FACTORY.md — Product Factory orchestration runner (v1 executable slice)

**Author:** Forge · **Dispatch:** Ken DISPATCH-BRIEF-FORGE-orchestration-runner-v1 · **Date:** 2026-06-18
**Branch:** `feature/saas-multiuser` (worktree `C:\Users\D\Desktop\dnkpartner-trends`) · **App:** Coolify `a5883h9b95r9b7cvty9zplph`
**Effort:** EXTRA-HIGH (new subsystem, prod-adjacent)

## Goal
Build the engine that takes ONE seed niche and pushes it through the 8-stage Product Factory pipeline automatically — stopping only at the 4 human gates — ending with a persisted, schema-valid Etsy **draft-listing object** at status `draft_ready`. v1 proves the whole loop end-to-end on the canonical Divorce-Organizer seed: runner machinery + a thin vertical slice through every stage. NOT all 8 stages built fully; NOT live Etsy write (stubbed behind an OFF feature flag until Dennis provisions the `listings_w` OAuth token). No fake success.

## Ground truth (locked, do not re-litigate)
- Etsy WRITE does not exist (READ only). Final stage ends `draft_ready`, never `published`. Publish POST behind `ETSY_WRITE_ENABLED` flag (default OFF).
- LLM: `claude-opus-4-8` via `@anthropic-ai/sdk` (confirmed via claude-api skill). JSON mode = `output_config.format` json_schema. Adaptive thinking. No `budget_tokens`/`temperature`.
- Expert binding v1 = ALL personas on shared model. Typed `ExpertRunner` seam (one `PersonaRunner` impl) so a real subagent is a drop-in later. `binding` field per expert config.
- 4 human gates only: stages 1, 5, 6, 8. All else auto-advances.
- Reuse: dnkpartner Prisma client (`lib/db.ts`), owner auth (`lib/auth.ts` validateSessionToken + `auth_token` cookie), existing `/factory` shell.

## Architecture
```
POST /api/factory/runs {seed}      → create Run, run stage 1, return runId
POST /api/factory/runs/:id/tick    → advance exactly ONE stage (resumable driver; panel polls)
GET  /api/factory/runs/:id         → full run state
POST /api/factory/runs/:id/gate    → record Decision, resume from human gate, advance one stage
GET  /api/factory/runs             → list runs

lib/factory/
  types.ts, llm.ts, experts.ts, personaRunner.ts, producers.ts, gate.ts, runner.ts, etsyAdapter.ts
  experts/stage-1..8/*.md   — vendored copy of the 24 expert prompts (editable assets)
prisma/schema.prisma  — + Run, FactoryArtifact, GateLog, Decision + enum RunStatus
```

### Execution model — resumable step-runner (no new infra)
Each tick/gate POST advances exactly ONE stage synchronously, commits Artifact+GateLog to Postgres BEFORE returning, sets next status. Crash resumes from last committed stage. At a human gate: set `awaiting_human_gate`, stop; gate POST resumes. NO fire-and-forget, NO worker dyno, NO queue. Flag: simplest reliable fit for single-app Coolify deploy; scheduler-cron drain is a drop-in later.

## Task Breakdown (context budgets enforced: ≤8 files read, ≤400 lines/task)
- **001 DB:** Prisma models Run/FactoryArtifact/GateLog/Decision + RunStatus enum (additive; no User edits) + migration `add_factory_runs` + generate. ~90 lines — SAFE
- **002 Service:** types.ts (Verdict/StageConfig/ExpertRunner + 8 stage configs w/ ceilings S1-3,S2-3,S3-4,S4-3,S5-2,S6-2,S7-3,S8-3 + gate flags + binding) + llm.ts (callClaudeJSON opus-4-8 json_schema retry-once) + install @anthropic-ai/sdk. ~180 lines — SAFE
- **003 Config:** vendor 24 expert .md → lib/factory/experts/stage-N/; experts.ts fs loader (standalone-safe path) + VERDICT parse. ~60 lines — SAFE
- **004 Service:** personaRunner.ts round1 (independent) + round2 (adversarial, re-prompt unanimous-zero-challenge). ~200 lines — MONITOR
- **005a Service:** producers.ts thin per-stage producer prompts (Stage 3 = small 1-page real artifact, flagged). ~160 lines — SAFE
- **005b Service:** gate.ts (produce→r1→r2→resolve→fix→ceiling→escalate) + runner.ts advanceOneStage (commit per stage). ~220 lines — MONITOR
- **006 Integration:** etsyAdapter.ts buildDraftListing (title≤140, ≤13 tags ≤20ch, price, file ref) + publishDraft stub flagged OFF. ~110 lines — SAFE
- **007a API:** POST/GET runs + GET :id (auth gate verbatim from auth/me; zod; no extra exports). SAFE
- **007b API:** POST :id/tick + POST :id/gate. SAFE
- **008 Test:** prisma generate clean; migration applies to test DB; npm run build GREEN (purge stale .prisma first); run Divorce seed end-to-end; capture gate-log summary; confirm draft_ready. No deploy.

## Execution Order
001 ∥ 003 → 002 → 004 → 005a → 005b → 006 → 007a ∥ 007b → 008

## Risk Flags
- Pixel UI (/factory seed input + run view + 4 approve cards) is a SEPARATE Pixel brief — out of scope; I deliver API+runner only; acceptance via API calls.
- Build-green collision gate: Next 16 forbids non-route exports in page/route files; stale .prisma masks type errors — purge+regenerate before claiming green.

## Open flags to raise
1. Tick driver = panel-polled /tick (no new infra). Flag if Ken prefers scheduler-cron drain.
2. Stage 3 = 1-page real artifact (proves build+gate), not full pack. Flagged per brief.
3. Stage 1 demand = persona reasoning over seed (no cross-repo Etsy-read coupling). Flag if live dnkstudio Etsy-read wanted now.
4. No live subagent binding wired (typed seam only) — per locked decision.

## Status — ALL COMPLETE (commit b0541c9)
- [x] 001 Prisma models + 2 migrations (baseline + delta) — apply clean fresh + prod-like
- [x] 002 llm.ts (opus-4-8 JSON) + types.ts (8 stage configs, ExpertRunner seam) + @anthropic-ai/sdk
- [x] 003 24 vendored expert prompts + experts.ts loader
- [x] 004 PersonaRunner (round1 + round2 adversarial, rubber-stamp re-prompt)
- [x] 005a producers.ts (8 stage producers, stage 3 reduced)
- [x] 005b gate.ts + runner.ts (resumable step-runner, commit-per-stage)
- [x] 006 etsyAdapter.ts (draft builder + publish stub OFF)
- [x] 007 5 API routes (owner-gated)
- [x] 008 build GREEN (webpack); e2e on Divorce seed → draft_ready; escalation + 13 unit assertions

## Verification evidence
- next build --webpack: ✓ Compiled, TypeScript passed, 4 factory routes registered.
  (Turbopack panics on this Windows box w/ a pre-existing @prisma symlink-privilege
  error — env issue, not code; Linux/Coolify Turbopack build is unaffected.)
- Migrations: fresh DB applies both; prod-like (User pre-exists via db push) =
  `migrate resolve --applied 0_init` then deploy runs only the delta. Verified.
- E2E (real test Postgres, LLM boundary mocked): Divorce-Organizer seed →
  ticks/gates through all 8 stages → stops at niche/brand/channel/publish →
  draft_ready with persisted etsy_draft_object. Every GateLog: round1(3)+round2(3).
- Escalation: stage-1 persistent FAIL → [fix,fix,escalate] at ceiling 3, status=escalated.

## Flags raised to Ken (see résumé)
1. Windows build needs --webpack (Turbopack/@prisma symlink panic; Linux fine).
2. Prod migrate: run `migrate resolve --applied 0_init` ONCE before first deploy.
3. Tick driver = panel-polled /tick (no new infra). Scheduler-cron = drop-in if wanted.
4. Stage 3 = 1-page real artifact (reduced v1 scope, per brief).
5. Stage 1 demand = persona reasoning over seed (no live Etsy-read coupling yet).
6. Live LLM e2e not run here (ANTHROPIC_API_KEY lives only in Coolify, not this box);
   proven via mocked-LLM e2e against real DB + provider/model confirmed via claude-api.
