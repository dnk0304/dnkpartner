/**
 * Thin typed Claude wrapper for the Product Factory runner.
 *
 * One job: make a single structured (JSON) call to the configured model and
 * return parsed, schema-shaped data — retrying ONCE on a bad/empty structured
 * result. Default model: claude-opus-4-8. Override with FACTORY_EXPERT_MODEL.
 *
 * ─── BACKEND (locked 2026-06-18, decision: "Api is not happening") ────────────
 * The default backend is `local-cli`: we shell out to the `claude` CLI that is
 * already logged in on this machine (Dennis's Windows box) and authenticate on
 * his existing Claude Code SUBSCRIPTION — $0 per run, NO paid ANTHROPIC_API_KEY.
 *
 * The legacy `@anthropic-ai/sdk` path is preserved behind FACTORY_LLM_BACKEND=
 * 'anthropic-sdk' for the eventual server/OAuth phase. It stays dormant unless
 * that flag is set AND ANTHROPIC_API_KEY is present. The dep is intentionally
 * kept in package.json for the server deploy.
 *
 * Proven CLI invocation (Ken, CLI 2.1.173, billed to subscription / opus-4-8):
 *   claude -p "<USER>" --output-format json --json-schema "<SCHEMA>" \
 *     --allowedTools "StructuredOutput" --max-turns 3 \
 *     --append-system-prompt "<SYSTEM>" --model <FACTORY_EXPERT_MODEL>
 * Hard-won gotchas baked in below (do NOT change without re-verifying live):
 *   - NEVER pass --bare: it forces ANTHROPIC_API_KEY / apiKeyHelper and never
 *     reads the subscription OAuth — defeating the whole decision.
 *   - --json-schema is the `StructuredOutput` tool; it MUST be allow-listed or
 *     the call lands in permission_denials and `result` comes back empty.
 *   - --max-turns 1 fails (error_max_turns): the tool call eats a turn and the
 *     model needs a follow-up turn to finalize. Use 3 (actual num_turns:2).
 *   - The parsed object is in the top-level `.structured_output` field of the
 *     result envelope — NOT in `.result` (which holds prose narration).
 *
 * Nothing here touches runtime auth at module load — the spawn only happens
 * inside callClaudeJSON (call time), so Next's "Collect page data" build pass
 * never invokes the CLI. See agent-memory patterns_nextjs_build_env.
 */

import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';

/**
 * The model used for all factory expert calls. Read once at module load.
 * Override with FACTORY_EXPERT_MODEL env var (e.g. 'claude-sonnet-4-6').
 * Empty string / whitespace-only / unset → falls back to 'claude-opus-4-8'.
 */
export const FACTORY_MODEL = process.env.FACTORY_EXPERT_MODEL?.trim() || 'claude-opus-4-8';

/** Which LLM backend to route through. Default: the local subscription CLI. */
type Backend = 'local-cli' | 'anthropic-sdk';
const BACKEND: Backend =
  (process.env.FACTORY_LLM_BACKEND as Backend | undefined) ?? 'local-cli';

/**
 * Resolve a positive-integer env var (milliseconds/count), else a default.
 * Falls back on unset, non-numeric, NaN, or <= 0 — never throws at load.
 */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/**
 * Hard ceiling on a single CLI call. A hung `claude` must fail loudly.
 * Default 300s (was 180s): under subscription rate throttling, heavy opus-4-8
 * calls have been observed at 172s — 180s was clipping legitimately-slow calls.
 * Override with FACTORY_CLI_TIMEOUT_MS (milliseconds).
 */
const CLI_TIMEOUT_MS = envInt('FACTORY_CLI_TIMEOUT_MS', 300_000);

/**
 * Exponential-backoff-with-jitter knobs for the retry loop. TWO failure modes
 * share this loop:
 *   1. A transient CLI FLAKE — exit code 1 with empty/no usable output, an empty
 *      result, or a missing `structured_output`. This is the intermittent killer
 *      (Dennis, 2026-06-18: a `claude -p` call returned "exited with code 1 (no
 *      stderr)" and the stage froze). A flake clears almost immediately, so we
 *      want a SHORT first backoff — ~2s then ~5s (matches the brief's 2s/5s).
 *   2. The subscription RATE WALL — after ~9–10 consecutive heavy calls; firing
 *      a retry instantly just slams the same wall. The same exponential growth
 *      escalates the wait for these (2s→4s→8s…capped) so it de-correlates.
 *   delay = min(BASE * 2^(attempt-1), CAP) + random(0..BASE)   (full-jitter-ish)
 *
 * BASE default 2s (was 5s): the dominant failure we now harden against is the
 * fast-clearing flake, which a 2s first retry recovers from without delay; the
 * rate-wall case still escalates exponentially toward the CAP.
 */
const BACKOFF_BASE_MS = envInt('FACTORY_BACKOFF_BASE_MS', 2_000);
const BACKOFF_CAP_MS = envInt('FACTORY_BACKOFF_CAP_MS', 120_000);
/**
 * Total attempts (incl. the first). Default 5 — covers BOTH a multi-retry flake
 * (the brief's "up to 3 times" is the floor; 5 is strictly safer) AND the rate
 * wall. Override FACTORY_MAX_ATTEMPTS.
 */
const MAX_ATTEMPTS = envInt('FACTORY_MAX_ATTEMPTS', 5);

/** Prompts (expert personas + artifacts) can be large; outputs are small. */
const CLI_MAX_BUFFER = 10 * 1024 * 1024;

/** Sleep helper — setTimeout-based, no external deps. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Backoff delay before retry `attempt` (attempt is 1-based for retries; never
 * called for attempt 0). Exponential growth, capped, plus full-ish jitter.
 */
function backoffDelayMs(attempt: number): number {
  const exp = BACKOFF_BASE_MS * 2 ** (attempt - 1);
  const capped = Math.min(exp, BACKOFF_CAP_MS);
  return capped + Math.random() * BACKOFF_BASE_MS;
}

/**
 * Narrow rate-limit / throttle classifier. Returns true when a failure looks
 * like the subscription rate wall (or a throttled-but-not-dead timeout) and so
 * should be retried *with backoff* rather than hard-thrown. Deliberately narrow:
 * genuine refusals / error_max_turns must still fail fast, not burn attempts.
 */
const RATE_REGEX = /rate|limit|429|quota|usage|too many|overloaded|capacity/i;

function isRetryableRateFailure(text: string): boolean {
  return RATE_REGEX.test(text);
}

export interface CallOptions {
  /** Stable system prompt (e.g. an expert persona or a producer brief). */
  system: string;
  /** The user turn — the task + the artifact/context. */
  user: string;
  /** JSON Schema the response must conform to (object schema, additionalProperties:false). */
  schema: Record<string, unknown>;
  /**
   * Output ceiling. Honored by the `anthropic-sdk` backend; the `local-cli`
   * backend has no equivalent flag and ignores it (kept for contract parity).
   * Default 8000 — gate verdicts and stage artifacts are small.
   */
  maxTokens?: number;
}

/**
 * Make one structured JSON call and return the parsed object typed as T.
 *
 * Retries the SAME call up to MAX_ATTEMPTS (default 5) with short backoff on a
 * TRANSIENT failure — the set that the brief (Dennis, 2026-06-18) requires never
 * fail a stage on a single flake:
 *   - a spawn/timeout rejection, incl. a non-zero exit with empty/no usable
 *     output ("exited with code 1 (no stderr)"),
 *   - non-JSON stdout (a torn/empty result envelope),
 *   - a success envelope with a missing/null `structured_output`,
 *   - a rate/throttle-classified error envelope.
 * Throws ONLY on a NON-transient hard error (a genuine refusal / error_max_turns
 * / a non-rate error envelope) or after the final attempt is exhausted. The gate
 * layer (gate.ts) additionally catches a final throw and advances the stage with
 * caveats, so even an exhausted-retries throw never freezes a run.
 */
export async function callClaudeJSON<T>(opts: CallOptions): Promise<T> {
  if (BACKEND === 'anthropic-sdk') {
    return callViaAnthropicSDK<T>(opts);
  }
  return callViaLocalCLI<T>(opts);
}

// ─── Backend: local subscription CLI (DEFAULT) ───────────────────────────────

/**
 * Resolve the `claude` binary. On Windows it commonly installs as `claude.cmd`.
 * Allow an explicit override via FACTORY_CLAUDE_BIN, else try `claude` and fall
 * back to `claude.cmd` (the spawn ENOENT is what tells us to fall back).
 */
function claudeBinCandidates(): string[] {
  const override = process.env.FACTORY_CLAUDE_BIN;
  if (override) return [override];
  return process.platform === 'win32' ? ['claude', 'claude.cmd'] : ['claude'];
}

function cliArgs(opts: CallOptions): string[] {
  // Order matches the proven-working invocation. Args are passed as an array
  // (spawn, NOT a shell string) so prompts containing quotes/newlines/
  // backticks cannot break quoting or inject shell.
  return [
    '-p',
    opts.user,
    '--output-format',
    'json',
    '--json-schema',
    JSON.stringify(opts.schema),
    '--allowedTools',
    'StructuredOutput',
    '--max-turns',
    '3',
    '--append-system-prompt',
    opts.system,
    '--model',
    FACTORY_MODEL,
    // NOTE: deliberately NO --bare (would force ANTHROPIC_API_KEY) and NO
    // --disallowedTools (would deny the StructuredOutput schema tool).
  ];
}

/**
 * The `usage` block the `claude -p --output-format json` envelope carries on a
 * successful call. Fields are best-effort: the CLI populates input/output token
 * counts and (when prompt caching is in play) the cache_* counts. Any field may
 * be absent on a given call — the meter coerces missing values to 0.
 */
interface CliUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

interface CliEnvelope {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  structured_output?: unknown;
  errors?: unknown;
  permission_denials?: unknown;
  usage?: CliUsage;
}

// ─── Real token metering ─────────────────────────────────────────────────────
//
// CHANGE (Dennis, 2026-06-18): "actually check the real token burn." We parse the
// `usage` block from EVERY successful CLI call and append one JSON line per call
// to a per-run usage log. We chose the file-log over a Run-model schema change
// deliberately: callClaudeJSON is a pure, run-agnostic seam, and threading a
// runId + Prisma write through the gate loop's durability path is the higher-risk
// option. A best-effort file append is isolated and additive — a metering failure
// (fs error, missing usage) NEVER fails the LLM call.
//
// The log path defaults to `.factory-tokens.jsonl` in the process cwd; override
// with FACTORY_TOKEN_LOG. Set FACTORY_RUN_ID before driving a run and it is
// stamped on every line so you can grep one run's calls out of a shared log.

/** Resolve the JSONL usage-log path. Override with FACTORY_TOKEN_LOG. */
function tokenLogPath(): string {
  return process.env.FACTORY_TOKEN_LOG?.trim() || '.factory-tokens.jsonl';
}

/** Coerce a possibly-missing usage count to a finite non-negative integer. */
function asCount(v: number | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

/**
 * Append one call's real token usage to the per-run JSONL log. Best-effort:
 * swallows ALL errors so metering can never break a gate call. `usage` may be
 * undefined (older CLI / odd envelope) — we still record a zero-count line so the
 * call count stays accurate.
 */
function meterUsage(usage: CliUsage | undefined): void {
  try {
    const inTok = asCount(usage?.input_tokens);
    const outTok = asCount(usage?.output_tokens);
    const cacheCreate = asCount(usage?.cache_creation_input_tokens);
    const cacheRead = asCount(usage?.cache_read_input_tokens);
    const line =
      JSON.stringify({
        ts: new Date().toISOString(),
        runId: process.env.FACTORY_RUN_ID ?? null,
        model: FACTORY_MODEL,
        input_tokens: inTok,
        output_tokens: outTok,
        cache_creation_input_tokens: cacheCreate,
        cache_read_input_tokens: cacheRead,
        total_tokens: inTok + outTok,
      }) + '\n';
    appendFileSync(tokenLogPath(), line);
  } catch {
    // Metering is observability only — never let it surface as a call failure.
  }
}

/**
 * Run the CLI once. Resolves with stdout, rejects on spawn/timeout/nonzero.
 *
 * Uses `spawn` (not `execFile`) with args passed as an array — never a shell
 * string — so prompts containing quotes/newlines/backticks cannot break
 * quoting or inject shell. Two Windows realities are handled explicitly:
 *   - A native single-file `claude` exe (the case on Dennis's box) spawns fine.
 *   - An npm-installed `claude.cmd`/`.bat` CANNOT be spawned directly on
 *     Node >=18.20/20 (it rejects with EINVAL for security); such shim binaries
 *     require `shell:true`. We detect the extension and opt in only for those.
 * Both ENOENT (not found) and EINVAL (the .cmd-without-shell case) advance to
 * the next candidate so the `claude` → `claude.cmd` fallback actually works.
 */
function isShellScript(bin: string): boolean {
  return /\.(cmd|bat)$/i.test(bin);
}

function spawnClaude(args: string[]): Promise<string> {
  const [first, ...rest] = claudeBinCandidates();

  const tryBin = (bin: string, fallbacks: string[]): Promise<string> =>
    new Promise<string>((resolve, reject) => {
      const advance = (): boolean => {
        if (fallbacks.length === 0) return false;
        const [next, ...more] = fallbacks;
        tryBin(next, more).then(resolve, reject);
        return true;
      };

      let child;
      try {
        child = spawn(bin, args, {
          windowsHide: true,
          env: process.env,
          // stdin = 'ignore': the prompt is passed via -p (an arg), NOT stdin.
          // Without this, `claude -p` inherits the parent stdin and, when that is
          // a non-TTY pipe with no data (the Next.js route / driver case), the
          // CLI waits ~3s then emits "Warning: no stdin data received in 3s,
          // proceeding without it" and intermittently exits code 1 — the #1
          // run-killer. Giving it /dev/null-equivalent stdin ('ignore' attaches
          // no pipe and provides immediate EOF) means it never waits and never
          // flakes. Mirrors the manual `claude -p … < /dev/null` that works 100%.
          // stdout/stderr stay piped so we read the JSON envelope + any error.
          stdio: ['ignore', 'pipe', 'pipe'],
          // .cmd/.bat shims need a shell on Windows; native exes must NOT use
          // one (shell:true would re-introduce string quoting of our args).
          // CAVEAT: shell:true does NOT escape args (Node DEP0190) — only the
          // npm-shim fallback hits this, never Dennis's native `claude` exe
          // (shell:false, fully escaped). If a future box only has a .cmd shim,
          // prefer setting FACTORY_CLAUDE_BIN to the real exe to stay shell-free.
          shell: isShellScript(bin),
        });
      } catch (err) {
        const e = err as NodeJS.ErrnoException;
        if ((e.code === 'ENOENT' || e.code === 'EINVAL') && advance()) return;
        reject(new Error(`claude CLI spawn failed (bin=${bin}): ${e.message}`));
        return;
      }

      let stdout = '';
      let stderr = '';
      let overflow = false;
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill();
        reject(
          new Error(
            `claude CLI timed out after ${CLI_TIMEOUT_MS}ms (model ${FACTORY_MODEL}).`,
          ),
        );
      }, CLI_TIMEOUT_MS);

      child.stdout?.on('data', (d: Buffer) => {
        if (stdout.length + d.length > CLI_MAX_BUFFER) {
          overflow = true;
          return;
        }
        stdout += d.toString();
      });
      child.stderr?.on('data', (d: Buffer) => {
        if (stderr.length < 64 * 1024) stderr += d.toString();
      });

      child.on('error', (err) => {
        if (settled) return;
        const e = err as NodeJS.ErrnoException;
        // Not found, or .cmd-without-shell rejection → try the next candidate.
        if ((e.code === 'ENOENT' || e.code === 'EINVAL') && advance()) {
          settled = true;
          clearTimeout(timer);
          return;
        }
        settled = true;
        clearTimeout(timer);
        reject(new Error(`claude CLI spawn error (bin=${bin}): ${e.message}`));
      });

      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (overflow) {
          reject(
            new Error(`claude CLI stdout exceeded ${CLI_MAX_BUFFER} bytes.`),
          );
          return;
        }
        if (code !== 0) {
          reject(
            new Error(
              `claude CLI exited with code ${code} (bin=${bin}): ${
                stderr.trim() || '(no stderr)'
              }`,
            ),
          );
          return;
        }
        resolve(stdout);
      });
    });

  return tryBin(first, rest);
}

async function callViaLocalCLI<T>(opts: CallOptions): Promise<T> {
  const args = cliArgs(opts);
  let lastErr: unknown;
  const lastAttempt = MAX_ATTEMPTS - 1; // 0-based index of the final attempt

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Back off before EVERY retry (attempts 1..N) — never before attempt 0.
    // De-correlates retries so they don't all slam the rate wall in lockstep.
    if (attempt > 0) {
      await sleep(backoffDelayMs(attempt));
    }

    let stdout: string;
    try {
      stdout = await spawnClaude(args);
    } catch (err) {
      // Spawn/timeout failure. A timeout (message contains "timed out") or a
      // rate-classified non-zero exit is a throttled-but-not-dead call → retry
      // with backoff. Any other spawn error is also retried (transient), but
      // none of these short-circuit: all give up only after the last attempt.
      lastErr = err;
      if (attempt === lastAttempt) throw err;
      continue;
    }

    let env: CliEnvelope;
    try {
      env = JSON.parse(stdout) as CliEnvelope;
    } catch {
      lastErr = new Error(
        `claude CLI returned non-JSON stdout. First 200 chars: ${stdout.slice(0, 200)}`,
      );
      if (attempt === lastAttempt) throw lastErr;
      continue;
    }

    // Hard error envelope (error_max_turns / error_during_execution / refusals
    // / a rate-cap envelope all land here). Classify before deciding:
    //   - If it matches the rate/throttle signature → retryable WITH backoff
    //     (set lastErr + continue), unless this is already the last attempt.
    //   - Otherwise it's a genuine non-retryable error (a refusal must fail
    //     fast, not burn all attempts) → throw immediately.
    if (env.is_error === true || (env.subtype && env.subtype !== 'success')) {
      const detail =
        `claude CLI error (subtype=${env.subtype ?? 'unknown'}). ` +
        `errors=${safeJson(env.errors)} ` +
        `permission_denials=${safeJson(env.permission_denials)}`;
      const err = new Error(detail);
      const classifierText = `${env.subtype ?? ''} ${safeJson(env.errors)} ${safeJson(
        env.permission_denials,
      )}`;
      if (isRetryableRateFailure(classifierText) && attempt !== lastAttempt) {
        lastErr = err;
        continue; // rate-classified hard error → back off and retry
      }
      throw err; // non-rate hard error → fail fast
    }

    // Success but no structured output → the StructuredOutput tool never fired,
    // so the data is unreliable. Do NOT fall back to parsing `.result` prose.
    if (env.structured_output === undefined || env.structured_output === null) {
      lastErr = new Error(
        'claude CLI returned success but no `structured_output` — the schema ' +
          'tool did not fire. Refusing to trust `.result` prose.',
      );
      if (attempt === lastAttempt) throw lastErr;
      continue; // retry
    }

    // Real token burn for this successful call → per-run usage log (best-effort).
    meterUsage(env.usage);

    return env.structured_output as T;
  }

  // Unreachable — the loop either returns or throws.
  throw (lastErr as Error) ??
    new Error('callClaudeJSON(local-cli): exhausted retries unexpectedly.');
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v) ?? 'undefined';
  } catch {
    return '[unserializable]';
  }
}

// ─── Backend: @anthropic-ai/sdk (DORMANT — server/OAuth phase) ───────────────
//
// Preserved verbatim behind FACTORY_LLM_BACKEND=anthropic-sdk. Uses dynamic
// import so the SDK is never loaded for the local-cli run, and so module load
// stays auth-free for Next's build-time page-data collection.

async function callViaAnthropicSDK<T>(opts: CallOptions): Promise<T> {
  const { system, user, schema, maxTokens = 8000 } = opts;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'FACTORY_LLM_BACKEND=anthropic-sdk requires ANTHROPIC_API_KEY — unset it ' +
        'or use the default local-cli backend.',
    );
  }

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const cli = new Anthropic({ apiKey });

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await cli.messages.create({
      model: FACTORY_MODEL,
      max_tokens: maxTokens,
      thinking: { type: 'adaptive' },
      system,
      output_config: { format: { type: 'json_schema', schema } },
      messages: [{ role: 'user', content: user }],
    });

    if (res.stop_reason === 'refusal') {
      throw new Error(
        `Claude refused the request (stage producer/gate). category=${
          res.stop_details?.category ?? 'unknown'
        }`,
      );
    }
    if (res.stop_reason === 'max_tokens') {
      throw new Error(
        `Claude hit max_tokens (${maxTokens}) before completing JSON — increase maxTokens for this call.`,
      );
    }

    const text = res.content
      .filter((b): b is import('@anthropic-ai/sdk').Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    try {
      return JSON.parse(text) as T;
    } catch {
      if (attempt === 1) {
        throw new Error(
          `Claude returned non-JSON output twice for a json_schema call. First 200 chars: ${text.slice(0, 200)}`,
        );
      }
    }
  }

  throw new Error('callClaudeJSON(anthropic-sdk): exhausted retries unexpectedly.');
}
