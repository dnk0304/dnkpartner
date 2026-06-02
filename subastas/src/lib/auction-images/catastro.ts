/**
 * Catastro facade photo fetcher (PRIMARY image source for inmuebles with RC).
 *
 * Endpoint (Spanish gov open data, no API key, ToS-clean for redistribution):
 *   GET https://ovc.catastro.meh.es/OVCServWeb/OVCWcfLibres/OVCFotoFachada.svc/RecuperarFotoFachadaGet?ReferenciaCatastral=<RC>
 *
 * Behavior observed (verified 2026-05-30):
 *   - Valid RC with photo → HTTP 200, Content-Type: image/jpeg, body = jpeg bytes (~100kB).
 *   - Valid RC, no photo  → HTTP 200, Content-Length: 0, empty body. Treat as MISS.
 *   - Invalid RC          → HTTP 200, empty (same shape). Treat as MISS.
 *   - HEAD                → 405 Method Not Allowed. Always GET.
 */

const ENDPOINT =
  'https://ovc.catastro.meh.es/OVCServWeb/OVCWcfLibres/OVCFotoFachada.svc/RecuperarFotoFachadaGet';

const RC_RE = /^[0-9A-Z]{20}$/i;

export function isValidRC(rc: string | null | undefined): rc is string {
  if (!rc) return false;
  return RC_RE.test(rc.trim());
}

export type CatastroResult =
  | { ok: true; bytes: Buffer; bytesLen: number }
  | { ok: false; reason: 'invalid-rc' | 'no-photo' | 'http-error' | 'network-error'; status?: number };

export async function fetchCatastroFacade(
  rc: string,
  opts: { timeoutMs?: number } = {}
): Promise<CatastroResult> {
  const ref = (rc || '').trim();
  if (!isValidRC(ref)) return { ok: false, reason: 'invalid-rc' };

  const url = `${ENDPOINT}?ReferenciaCatastral=${encodeURIComponent(ref)}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000);

  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        // Spanish gov sites occasionally block default fetch UAs; identify ourselves.
        'User-Agent': 'subastasactivas/1.0 (+https://subastasactivas.com)',
        Accept: 'image/jpeg,image/*;q=0.8',
      },
    });

    if (!res.ok) return { ok: false, reason: 'http-error', status: res.status };

    const ab = await res.arrayBuffer();
    const buf = Buffer.from(ab);
    // Catastro returns 200 + empty body when there is no facade photo for the RC.
    // Also guard against tiny non-image responses.
    if (buf.byteLength < 1024) return { ok: false, reason: 'no-photo' };
    // Sanity: JPEG magic bytes FF D8 FF
    if (buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) {
      return { ok: false, reason: 'no-photo' };
    }
    return { ok: true, bytes: buf, bytesLen: buf.byteLength };
  } catch {
    return { ok: false, reason: 'network-error' };
  } finally {
    clearTimeout(t);
  }
}
