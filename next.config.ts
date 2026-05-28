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
};

export default nextConfig;
