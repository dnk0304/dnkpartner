/**
 * locale-path — client-safe helpers to keep the `/en` URL prefix intact
 * across auth redirects (i18n Phase 1, 2026-07-10).
 *
 * Why: middleware serves `/en/...` via an internal rewrite, so client code
 * building redirect targets from hardcoded paths (`/login?callbackUrl=/favoritos`)
 * silently dropped the `/en` prefix — the user landed back on the Spanish URL
 * space and locale survived only via cookie (which no longer drives content;
 * URL wins). Every auth redirect must therefore build BOTH the login path and
 * the callbackUrl in the current URL's locale space.
 *
 * Usage (client components):
 *   const pathname = usePathname();
 *   router.push(buildLoginRedirect(pathname, "/favoritos"));
 */

/** True when the browser pathname lives in the `/en` URL space. */
export function isEnPathname(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === "/en" || pathname.startsWith("/en/");
}

/** Prefix `path` with `/en` when the current pathname is in the en space. */
export function localizePath(path: string, currentPathname: string | null | undefined): string {
  if (!isEnPathname(currentPathname)) return path;
  if (path === "/") return "/en";
  return path.startsWith("/en/") || path === "/en" ? path : "/en" + path;
}

/**
 * Build a locale-preserving `/login?callbackUrl=...` redirect.
 * `callbackPath` is the locale-agnostic path to return to after login
 * (defaults to the current pathname itself, already locale-prefixed).
 */
export function buildLoginRedirect(
  currentPathname: string | null | undefined,
  callbackPath?: string,
): string {
  const cb = callbackPath
    ? localizePath(callbackPath, currentPathname)
    : (currentPathname ?? "/");
  return `${localizePath("/login", currentPathname)}?callbackUrl=${encodeURIComponent(cb)}`;
}
