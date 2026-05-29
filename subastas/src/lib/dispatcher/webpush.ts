/**
 * Web-push send helper for the dispatcher.
 *
 * Wraps the `web-push` library, configures VAPID once per process, sends to a
 * single subscription, and reports back whether the subscription is GONE
 * (HTTP 410 / 404) so the caller can prune it.
 *
 * The pre-existing `lib/notifications/channels/push-channel.ts` had the same
 * intent but bundled DB I/O. The dispatcher needs to handle DB writes itself
 * (inside the same Prisma transaction as the Notification row mutation), so we
 * keep this helper I/O-free.
 */
import webpush from 'web-push';

let vapidConfigured = false;

function ensureVapid(): boolean {
  if (vapidConfigured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:dennis.kotlenko@gmail.com';
  if (!pub || !priv) {
    return false;
  }
  webpush.setVapidDetails(subject, pub, priv);
  vapidConfigured = true;
  return true;
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushSendResult {
  ok: boolean;
  /** True when the subscription is expired/unregistered and the caller should delete it. */
  gone: boolean;
  statusCode?: number;
  error?: string;
}

export async function sendPush(
  target: PushTarget,
  payload: unknown,
): Promise<PushSendResult> {
  if (!ensureVapid()) {
    return { ok: false, gone: false, error: 'vapid_not_configured' };
  }

  try {
    const result = await webpush.sendNotification(
      {
        endpoint: target.endpoint,
        keys: { p256dh: target.p256dh, auth: target.auth },
      },
      typeof payload === 'string' ? payload : JSON.stringify(payload),
    );
    return { ok: true, gone: false, statusCode: result.statusCode };
  } catch (err: unknown) {
    const e = err as { statusCode?: number; body?: string; message?: string };
    const code = e.statusCode ?? 0;
    const gone = code === 410 || code === 404;
    return {
      ok: false,
      gone,
      statusCode: code || undefined,
      error: e.message ?? e.body ?? String(err),
    };
  }
}

export function isVapidConfigured(): boolean {
  return ensureVapid();
}
