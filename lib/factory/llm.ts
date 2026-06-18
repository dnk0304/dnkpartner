/**
 * Thin typed Claude wrapper for the Product Factory runner.
 *
 * One job: make a single structured (JSON) call to claude-opus-4-8 and return
 * parsed, schema-shaped data — retrying ONCE on a bad/empty structured result.
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
 *     --append-system-prompt "<SYSTEM>" --model claude-opus-4-8
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

export const FACTORY_MODEL = 'claude-opus-4-8';

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
 * Exponential-backoff-with-jitter knobs for the retry loop. The subscription
 * CLI trips a rolling rate wall after ~9–10 consecutive heavy calls; firing a
 * retry instantly just slams the same wall. We back off before each retry.
 *   delay = min(BASE * 2^(attempt-1), CAP) + random(0..BASE)   (full-jitter-ish)
 */
const BACKOFF_BASE_MS = envInt('FACTORY_BACKOFF_BASE_MS', 5_000);
const BACKOFF_CAP_MS = envInt('FACTORY_BACKOFF_CAP_MS', 120_000);
/** Total attempts (incl. the first). Default 5; override FACTORY_MAX_ATTEMPTS. */
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
 * Retries ONCE on a transient spawn failure or a missing structured result.
 * Throws on: refusal, max_tokens/turns, a CLI error envelope, or a second fail.
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

interface CliEnvelope {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  structured_output?: unknown;
  errors?: unknown;
  permission_denials?: unknown;
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
