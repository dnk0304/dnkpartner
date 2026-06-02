/**
 * Client-side web-push helpers.
 *
 * Pixel — Wave 2c.
 *
 * Owns:
 *   - Feature-detection for service workers + Push API.
 *   - VAPID key (base64url -> Uint8Array) conversion required by PushManager.
 *   - subscribe/unsubscribe round-trips against the Wave 2b API:
 *       POST /api/web-push/subscribe   { endpoint, keys: { p256dh, auth } }
 *       POST /api/web-push/unsubscribe { endpoint } | { all: true }
 *
 * NEVER auto-prompts. The caller decides when to ask for permission (e.g.,
 * the user toggled "Push" in their notify-prefs). The first call to
 * `requestPushSubscription()` triggers the browser permission prompt.
 *
 * Notes on the SW path: BASE_PATH derives from NEXT_PUBLIC_BASE_PATH
 * (default "" — root mount at subastasactivas.com as of 2026-06-02). The SW
 * file is served at `${BASE_PATH}/sw.js` and registered with
 * `{ scope: "${BASE_PATH}/" }` so browsers grant the expected scope.
 */

const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export type PushSupport =
  | { supported: true }
  | { supported: false; reason: "no_service_worker" | "no_push_manager" | "no_notification" | "no_vapid_key" | "insecure_context" };

export type PushPermission = "default" | "granted" | "denied" | "unsupported";

export function getPushSupport(): PushSupport {
  if (typeof window === "undefined") {
    return { supported: false, reason: "no_service_worker" };
  }
  if (!window.isSecureContext) return { supported: false, reason: "insecure_context" };
  if (!("serviceWorker" in navigator)) return { supported: false, reason: "no_service_worker" };
  if (!("PushManager" in window)) return { supported: false, reason: "no_push_manager" };
  if (!("Notification" in window)) return { supported: false, reason: "no_notification" };
  if (!VAPID_PUBLIC_KEY) return { supported: false, reason: "no_vapid_key" };
  return { supported: true };
}

export function getPermission(): PushPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission as PushPermission;
}

/**
 * Convert a base64url VAPID public key into the Uint8Array
 * format expected by `PushManager.subscribe({ applicationServerKey })`.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = typeof atob === "function" ? atob(base64) : Buffer.from(base64, "base64").toString("binary");
  // Explicit ArrayBuffer (not SharedArrayBuffer) — PushManager.subscribe's
  // applicationServerKey type narrowed in lib.dom 4.8+ to require this.
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  // basePath-aware: SW file is served at `${BASE_PATH}/sw.js`, scope must match.
  const swUrl = `${BASE_PATH}/sw.js`;
  const scope = `${BASE_PATH}/`;
  const existing = await navigator.serviceWorker.getRegistration(scope);
  if (existing) return existing;
  return navigator.serviceWorker.register(swUrl, { scope });
}

function subscriptionToBody(sub: PushSubscription) {
  const json = sub.toJSON();
  return {
    endpoint: json.endpoint,
    keys: {
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
    },
  };
}

/**
 * Idempotent: if a subscription already exists, returns it without re-prompting.
 * If permission has not been granted, requests it (this is the only place that
 * can trigger the browser prompt — callers gate this behind explicit user action).
 */
export async function requestPushSubscription(): Promise<
  | { ok: true; subscription: PushSubscription }
  | { ok: false; reason: "permission_denied" | "permission_dismissed" | "unsupported" | "subscribe_failed"; detail?: string }
> {
  const support = getPushSupport();
  if (!support.supported) return { ok: false, reason: "unsupported", detail: support.reason };

  const permission = await Notification.requestPermission();
  if (permission === "denied") return { ok: false, reason: "permission_denied" };
  if (permission !== "granted") return { ok: false, reason: "permission_dismissed" };

  try {
    const registration = await registerServiceWorker();
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    // Persist on server (idempotent on endpoint).
    const body = subscriptionToBody(subscription);
    const res = await fetch(`${BASE_PATH}/api/web-push/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      return { ok: false, reason: "subscribe_failed", detail: `server_${res.status}` };
    }

    return { ok: true, subscription };
  } catch (err) {
    return {
      ok: false,
      reason: "subscribe_failed",
      detail: err instanceof Error ? err.message : "unknown",
    };
  }
}

/**
 * Unsubscribe the current browser endpoint (default) or all of the user's
 * endpoints. Best-effort — local SW unsubscription always runs.
 */
export async function unsubscribePush(opts: { all?: boolean } = {}): Promise<{ ok: boolean }> {
  const support = getPushSupport();
  if (!support.supported) return { ok: false };
  try {
    const registration = await registerServiceWorker();
    const subscription = await registration.pushManager.getSubscription();

    if (opts.all) {
      await fetch(`${BASE_PATH}/api/web-push/unsubscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
    } else if (subscription) {
      const body = subscriptionToBody(subscription);
      await fetch(`${BASE_PATH}/api/web-push/unsubscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: body.endpoint }),
      });
    }

    if (subscription) {
      try {
        await subscription.unsubscribe();
      } catch {
        // Browser unsubscription is best-effort.
      }
    }
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/**
 * True if the browser has an active subscription for this scope.
 * Does NOT prompt for permission.
 */
export async function hasActiveSubscription(): Promise<boolean> {
  const support = getPushSupport();
  if (!support.supported) return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration(`${BASE_PATH}/`);
    if (!registration) return false;
    const sub = await registration.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}
