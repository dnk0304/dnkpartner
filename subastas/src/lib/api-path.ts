/**
 * Client-side API path helper.
 *
 * Historical context: when the app ran under Next basePath "/subastas"
 * (dnkpartner.com/subastas), `fetch("/api/...")` from the browser did NOT
 * get the basePath applied automatically — so this helper existed to inject
 * the prefix. As of 2026-06-02 the app is root-mounted at subastasactivas.com
 * and BASE_PATH defaults to "" — meaning apiUrl is now effectively an identity
 * function unless NEXT_PUBLIC_BASE_PATH is set. Kept so callers (and the SW
 * scope helper) don't have to change; safe to inline later.
 *
 * Configured via NEXT_PUBLIC_BASE_PATH (defaults to "" for root mount).
 */

const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");

/**
 * Prefix an API path with the app basePath (no-op at root mount).
 * apiUrl("/api/auctions/stats") -> "/api/auctions/stats" (root mount)
 */
export function apiUrl(path: string): string {
  if (!path.startsWith("/")) {
    path = "/" + path;
  }
  // If caller already included the basePath, do not double-prefix.
  if (BASE_PATH && path.startsWith(BASE_PATH + "/")) {
    return path;
  }
  return `${BASE_PATH}${path}`;
}

/**
 * Drop-in fetch wrapper that prefixes API paths.
 */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), init);
}
