/**
 * Thin typed Claude wrapper for the Product Factory runner.
 *
 * One job: make a single structured (JSON) call to claude-opus-4-8 and return
 * parsed, schema-shaped data — retrying ONCE on malformed JSON. Provider/model
 * confirmed via the `claude-api` skill (2026-06-18):
 *   - model: claude-opus-4-8 (do not date-suffix)
 *   - JSON mode: output_config.format = { type: 'json_schema', schema }
 *   - adaptive thinking; NO budget_tokens / temperature (400 on Opus 4.8)
 *
 * The factory key is read from ANTHROPIC_API_KEY at call time (NOT module load)
 * so the Next.js build's "Collect page data" pass — which imports every server
 * module without runtime secrets — never fails closed. See agent-memory
 * patterns_nextjs_build_env.
 */

import Anthropic from '@anthropic-ai/sdk';

export const FACTORY_MODEL = 'claude-opus-4-8';

let _client: Anthropic | null = null;

/** Lazily construct the client on first real call — never at module load. */
function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set — the Product Factory runner needs it to call Claude.',
    );
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

export interface CallOptions {
  /** Stable system prompt (e.g. an expert persona or a producer brief). */
  system: string;
  /** The user turn — the task + the artifact/context. */
  user: string;
  /** JSON Schema the response must conform to (object schema, additionalProperties:false). */
  schema: Record<string, unknown>;
  /** Output ceiling. Default 8000 — gate verdicts and stage artifacts are small. */
  maxTokens?: number;
}

/**
 * Make one structured JSON call and return the parsed object typed as T.
 * Retries ONCE if the model returns text that doesn't parse as JSON (rare with
 * json_schema, but the schema isn't a hard guarantee under refusal/truncation).
 * Throws on: missing key, refusal, max_tokens truncation, or a second parse fail.
 */
export async function callClaudeJSON<T>(opts: CallOptions): Promise<T> {
  const { system, user, schema, maxTokens = 8000 } = opts;

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await client().messages.create({
      model: FACTORY_MODEL,
      max_tokens: maxTokens,
      thinking: { type: 'adaptive' },
      system,
      output_config: { format: { type: 'json_schema', schema } },
      messages: [{ role: 'user', content: user }],
    });

    if (res.stop_reason === 'refusal') {
      throw new Error(
        `Claude refused the request (stage producer/gate). category=${res.stop_details?.category ?? 'unknown'}`,
      );
    }
    if (res.stop_reason === 'max_tokens') {
      // Truncated JSON is unparseable — bump caller's budget rather than retry blindly.
      throw new Error(
        `Claude hit max_tokens (${maxTokens}) before completing JSON — increase maxTokens for this call.`,
      );
    }

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
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
      // fall through to one retry
    }
  }
  // Unreachable — the loop either returns or throws.
  throw new Error('callClaudeJSON: exhausted retries unexpectedly.');
}
