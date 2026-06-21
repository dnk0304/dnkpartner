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

  // The Product Factory runner reads its 24 vendored expert prompts from
  // lib/factory/experts/**/*.md at runtime via fs (so they stay editable
  // assets, not inlined strings). Next.js can't statically trace a dynamic
  // readFileSync path, so explicitly include the prompts in the output trace
  // for the factory API routes. Harmless under `next start` (files already
  // present); load-bearing if standalone output is ever enabled.
  outputFileTracingIncludes: {
    '/api/factory/**': ['./lib/factory/experts/**/*.md'],
  },

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


      // ───────────────────────────────────────────────────────────────────────
      // Studio index: NO redirect (2026-06-22 — land bare /studio on the
      // creative suite, not Trends).
      //
      // There is intentionally NO `/studio` → `/studio/...` redirect here. An
      // earlier fix landed `/studio` on `/studio/ai-trends` (Trends) via a 307;
      // that bounced the trailing slash against Next's `trailingSlash:false` and
      // re-created ERR_TOO_MANY_REDIRECTS in production. It is removed.
      //
      // Bare `GET /studio` is matched by the `/studio/:path*` rewrite below
      // (Next `:path*` matches zero segments) and forwarded to the studio
      // container, where an explicit `app.get(['/studio','/studio/'])` handler
      // (studio/server/index.ts), registered BEFORE the serve-static mounts,
      // returns index.html with 200 — so serve-static's mount-root 301 can never
      // fire. React Router (basename '/studio') then resolves `/studio` → route
      // `/` → <App/>, the full creative suite (the destination Dennis wants).
      // `/studio/` → Next 308 → `/studio` → 200 (single terminating hop, no loop).
      // Verified locally end-to-end through `next start` + the studio Express
      // server: GET/HEAD /studio = 200 (not 301); /studio/ai-trends and
      // /studio/video-editor unchanged (200).
      // ───────────────────────────────────────────────────────────────────────
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
  // Previously /studio/editor was a native "Coming soon" stub here; that
  // stub was removed (2026-05-30, Dennis decision H) — the real editors
  // (site builder + video editor) live inside the studio container under
  // /studio/site-builder and /studio/video-editor, both proxied below.
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
        source: '/studio/:path*',
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
