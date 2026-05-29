/**
 * Client-side API path helper.
 *
 * Next.js basePath ("/subastas") auto-prefixes server-rendered links and
 * Next-imported routes, but `fetch("/api/...")` from client code does NOT
 * get the basePath applied — it hits site root and 404s when the app is
 * mounted under a subpath. Use `apiUrl(path)` or `apiFetch(path, init)`
 * for every client-side API call so we get one consistent prefixed URL.
 *
 * Configured via NEXT_PUBLIC_BASE_PATH (defaults to "/subastas" to match
 * next.config.ts). Empty string for root-mounted dev.
 */

const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "/subastas").replace(/\/$/, "");

/**
 * Prefix an API path with the app basePath.
 * apiUrl("/api/auctions/stats") -> "/subastas/api/auctions/stats"
 * apiUrl("/api/x?y=1") -> "/subastas/api/x?y=1"
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
