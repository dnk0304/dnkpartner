/**
 * Real run-progress signal for the /factory board.
 *
 * Two honest sources, no fabrication:
 *   1. Stage progress — `Run.stage` against the effective stage ceiling
 *      (FACTORY_STAGE_CEILING when set for an audit run, else the full 8-stage
 *      pipeline). This is coarse: it only moves when a whole stage commits.
 *   2. Per-call liveness — the engine appends one JSONL line per LLM call to
 *      `.factory-tokens.jsonl` (override: FACTORY_TOKEN_LOG) in the dev-server
 *      cwd. The LAST line's `ts` = last activity; the line count = calls done.
 *      This is what makes a card move WHILE a stage is grinding, instead of
 *      looking frozen until the stage completes.
 *
 * The token log's `runId` is null today (only one run is driven at a time), so
 * we treat the log as the liveness of whichever run is currently active and only
 * attribute it to a run that is itself non-terminal. If there has been no call
 * for longer than IDLE_AFTER_MS we report `isProcessing: false` — an honest
 * "idle / stalled" state rather than a fake "processing" pulse.
 */

import { readFileSync, statSync } from 'node:fs';

/** Full pipeline length when no audit ceiling is set. Mirrors STAGES.length. */
const FULL_PIPELINE_STAGES = 8;

/** No call within this window → the run is idle/stalled, not processing. */
export const IDLE_AFTER_MS = 180_000; // 3 minutes (matches the brief's >3min rule)

/** Cap how much of the log tail we parse, so a long-lived log stays cheap. */
const MAX_LOG_BYTES = 256 * 1024;

export interface RunProgress {
  /** The run's current stage (1-based). */
  currentStage: number;
  /** Effective ceiling — the audit ceiling when set, else the full pipeline. */
  totalStages: number;
  /** LLM calls recorded for this run (token-log line count; 0 when unknown). */
  callsThisRun: number;
  /** ISO timestamp of the most recent LLM call, or null when none seen. */
  lastActivityAt: string | null;
  /** True only when the run is non-terminal AND a call fired within IDLE_AFTER_MS. */
  isProcessing: boolean;
}

/** A run is still "moving" — worth attributing live token activity to. */
function isActiveStatus(status: string): boolean {
  return status === 'running' || status === 'escalated';
}

/** Effective stage ceiling: audit ceiling (FACTORY_STAGE_CEILING) or full pipeline. */
export function stageCeiling(): number {
  const raw = process.env.FACTORY_STAGE_CEILING?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isInteger(n) && n > 0) return n;
  }
  return FULL_PIPELINE_STAGES;
}

function tokenLogPath(): string {
  return process.env.FACTORY_TOKEN_LOG?.trim() || '.factory-tokens.jsonl';
}

/**
 * Read the token log's liveness: how many calls have fired and when the last
 * one was. Best-effort and fully isolated — a missing/locked/garbled log yields
 * { calls: 0, lastTs: null } and never throws into the request path.
 */
function readTokenLiveness(): { calls: number; lastTs: string | null } {
  try {
    const path = tokenLogPath();
    const size = statSync(path).size;
    const buf = readFileSync(path);
    // For the count we want every line; for the timestamp only the last line.
    // The file is small in practice (one line per call), so a single read is fine.
    const text =
      size > MAX_LOG_BYTES ? buf.subarray(size - MAX_LOG_BYTES).toString('utf8') : buf.toString('utf8');

    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length === 0) return { calls: 0, lastTs: null };

    // Calls: when we truncated, the line count is a tail estimate — still honest
    // as "at least N", and in practice the log never reaches MAX_LOG_BYTES.
    const calls = lines.length;

    // Walk back from the end to the first line with a parseable `ts`.
    let lastTs: string | null = null;
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const obj = JSON.parse(lines[i]) as { ts?: unknown };
        if (typeof obj.ts === 'string' && !Number.isNaN(Date.parse(obj.ts))) {
          lastTs = obj.ts;
          break;
        }
      } catch {
        /* skip a partially-written / corrupt line */
      }
    }
    return { calls, lastTs };
  } catch {
    return { calls: 0, lastTs: null };
  }
}

/**
 * Compute the live progress signal for one run. `now` is injectable for tests.
 *
 * Liveness from the shared token log is only attributed to the run when that
 * run is in an active status — a terminal run (draft_ready / published / killed)
 * never shows "processing" even if the log is fresh from a different driver.
 */
export function computeRunProgress(
  run: { stage: number; status: string },
  now: number = Date.now(),
): RunProgress {
  const totalStages = stageCeiling();
  const currentStage = Math.min(Math.max(run.stage, 1), totalStages);

  const active = isActiveStatus(run.status);
  const { calls, lastTs } = active ? readTokenLiveness() : { calls: 0, lastTs: null };

  const lastMs = lastTs ? Date.parse(lastTs) : NaN;
  const isFresh = Number.isFinite(lastMs) && now - lastMs <= IDLE_AFTER_MS;

  return {
    currentStage,
    totalStages,
    callsThisRun: calls,
    lastActivityAt: lastTs,
    isProcessing: active && isFresh,
  };
}
