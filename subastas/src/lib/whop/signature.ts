/**
 * Whop webhook signature verification.
 *
 * Contract (confirmed in Whop docs 2026-06-02):
 *   Header  : `webhook-signature` — value formatted as `v1,<base64-hmac-sha256>`
 *   Payload : `${id}.${timestamp}.${rawBody}`
 *   Algo    : HMAC-SHA256 keyed with WHOP_WEBHOOK_SECRET
 *   Compare : constant-time
 *
 * The `id` and `timestamp` come from the JSON body — Whop puts them in the
 * envelope alongside the event payload. We re-serialize NOTHING: the raw body
 * string is signed as-received, so the caller MUST pass the exact text it read
 * off the request. Mirrors the constant-time discipline in `auth-helpers.ts`.
 */
import { createHmac, timingSafeEqual } from 'crypto';

export type WhopSigCheck =
  | { ok: true }
  | { ok: false; reason: 'missing_header' | 'malformed_header' | 'bad_signature' | 'missing_id_or_ts' };

const HEADER_NAME = 'webhook-signature';

export function getWhopSignatureHeader(headers: Headers): string | null {
  return headers.get(HEADER_NAME);
}

/**
 * Verify a Whop webhook request. Returns `{ ok: true }` on success.
 *
 * @param rawBody the request body as a string, BYTE-FOR-BYTE as received
 * @param signatureHeader value of the `webhook-signature` header
 * @param secret WHOP_WEBHOOK_SECRET (the `ws_…` value)
 * @param idTs   optional override — if not supplied, we parse `id` and
 *               `timestamp` out of the JSON body. Exposed for tests.
 */
export function verifyWhopSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  idTs?: { id: string; timestamp: string | number },
): WhopSigCheck {
  if (!signatureHeader) return { ok: false, reason: 'missing_header' };

  // Format: v1,<base64-hmac-sha256>. Be liberal in what we accept (whitespace
  // around comma), strict in what we compare.
  const parts = signatureHeader.split(',').map((s) => s.trim());
  if (parts.length !== 2 || parts[0] !== 'v1' || !parts[1]) {
    return { ok: false, reason: 'malformed_header' };
  }
  const suppliedB64 = parts[1];

  let id: string | undefined;
  let timestamp: string | number | undefined;
  if (idTs) {
    id = idTs.id;
    timestamp = idTs.timestamp;
  } else {
    try {
      const parsed = JSON.parse(rawBody) as { id?: string; timestamp?: string | number };
      id = parsed.id;
      timestamp = parsed.timestamp;
    } catch {
      return { ok: false, reason: 'missing_id_or_ts' };
    }
  }
  if (!id || timestamp === undefined || timestamp === null) {
    return { ok: false, reason: 'missing_id_or_ts' };
  }

  const signedPayload = `${id}.${String(timestamp)}.${rawBody}`;
  const expected = createHmac('sha256', secret).update(signedPayload).digest('base64');

  // Constant-time compare. Buffers MUST be the same length for timingSafeEqual;
  // length mismatch is itself a failure (and not a side channel since both
  // sides are public base64-encoded hashes of fixed length).
  const a = Buffer.from(suppliedB64);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return { ok: false, reason: 'bad_signature' };
  return timingSafeEqual(a, b)
    ? { ok: true }
    : { ok: false, reason: 'bad_signature' };
}

/**
 * Build the `webhook-signature` header value for an outgoing test request.
 * Used by the verification unit test — NOT for production.
 */
export function signForTest(
  rawBody: string,
  secret: string,
  id: string,
  timestamp: string | number,
): string {
  const signedPayload = `${id}.${String(timestamp)}.${rawBody}`;
  const mac = createHmac('sha256', secret).update(signedPayload).digest('base64');
  return `v1,${mac}`;
}
