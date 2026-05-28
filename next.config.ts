import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable StrictMode in dev — it double-renders every component on every
  // state change (intentional for side-effect detection, but halves perf on
  // complex components like Dashboard). Re-enable if auditing for side effects.
  reactStrictMode: false,

  // Externalize Prisma client from server bundling so Turbopack doesn't
  // try to materialize a symlink to it inside the build output. On Windows
  // (where SeCreateSymbolicLinkPrivilege is typically absent) that symlink
  // step panics with os error 1314 and every API route that imports Prisma
  // returns 500. With `serverExternalPackages`, Next/Turbopack leaves the
  // package as a runtime require — no symlink, no panic.
  // Refs: https://www.prisma.io/docs/orm/more/help-and-troubleshooting/nextjs-help
  serverExternalPackages: ['@prisma/client', '.prisma/client'],

  // Permanent 308 redirects for the auth-lockdown URL move (2026-05-28).
  // Old /auth/login + /auth/forgot-password URLs survive in bookmarks, email
  // links, search-engine indices — 308 preserves the method on the redirect
  // (matters for any POST, though both targets are GET-only in practice).
  // Registration was deleted entirely (no redirect) so /auth/register and
  // /api/auth/register naturally 404 once their directories are removed.
  async redirects() {
    return [
      { source: '/auth/login', destination: '/login', permanent: true },
      { source: '/auth/forgot-password', destination: '/forgot-password', permanent: true },
    ];
  },

  // ─────────────────────────────────────────────────────────────────────────
  // DNK Studio reverse-proxy (2026-05-28).
  //
  // The studio (vendored under /studio in this repo) runs as a SEPARATE
  // Coolify app (`dnkstudio`) bound to the internal Docker network only —
  // no public domain, no DNS, no exposed port. Requests reach it ONLY via
  // these rewrites, which the dnkpartner middleware (proxy.ts) gates with
  // validateSessionToken FIRST. Next.js applies middleware before rewrites,
  // so an unauthenticated request is bounced to /login before any forward.
  //
  // STUDIO_INTERNAL_URL env example (Coolify): http://dnkstudio:3100
  //   (or http://127.0.0.1:3100 if Coolify maps the studio port to the host).
  //
  // The /studio/editor path is excluded from the proxy because that route
  // is implemented natively in this Next.js app (app/(studio)/studio/editor/
  // — a "Coming soon" stub for the future drag-and-drop builder). The
  // negative-lookahead in the source pattern keeps `/studio/editor` and
  // `/studio/editor/anything` resolving locally instead of forwarding.
  // ─────────────────────────────────────────────────────────────────────────
  async rewrites() {
    const studioUrl = process.env.STUDIO_INTERNAL_URL;
    if (!studioUrl) {
      // Don't fail the build if the env var is missing in CI/local builds
      // without studio access — Coolify sets it in the dnkpartner app.
      // The rewrite simply doesn't activate; /studio/* will 404 (handled
      // gracefully by the auth gate bouncing unauthed traffic anyway).
      return [];
    }
    return [
      {
        source: '/studio/:path((?!editor$|editor/).*)?',
        destination: `${studioUrl}/studio/:path*`,
      },
      {
        source: '/api/studio/:path*',
        destination: `${studioUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
