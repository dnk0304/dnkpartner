import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { validateSessionToken } from '@/lib/auth';
import { DASHBOARD_PROJECTS, type DashboardProject } from './projects';

/**
 * /dashboard — the post-login project picker.
 *
 * This is the FIRST authenticated page in the dnkpartner app, so it
 * establishes the server-side auth-gate pattern that every future authed
 * page reuses:
 *
 *   1. Read the shared `auth_token` cookie (HttpOnly, Path=/, set by
 *      /api/auth/login and /api/auth/google/callback).
 *   2. Run validateSessionToken — signature + sessionVersion check, so a
 *      kicked or rotated session is rejected here, not just at the API.
 *   3. On failure, server-redirect to /login?next=/dashboard. Doing this
 *      on the server (not via client-side /api/auth/me) avoids a flash of
 *      content before the bounce.
 *
 * UI scaffolding is intentionally minimal — Pixel restyles the card grid
 * next. The DASHBOARD_PROJECTS array below is the locked source of truth
 * for the card set; Pixel maps over it, we don't ship copy in JSX.
 *
 * Force dynamic: this route depends on cookies(), and we never want it
 * statically pre-rendered or served from a CDN. Explicit > implicit.
 */
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  // ── Server-side auth gate ────────────────────────────────────────────
  // cookies() is async in Next 15+; await it before .get().
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;

  if (!token) {
    redirect('/login?next=/dashboard');
  }

  const payload = await validateSessionToken(token);
  if (!payload) {
    // Token present but invalid (bad sig, rotated sessionVersion, user
    // deleted). Send through the same login bounce as no-cookie — the
    // stale cookie will be overwritten on next successful login.
    redirect('/login?next=/dashboard');
  }

  // ── Scaffold render ──────────────────────────────────────────────────
  // Intentionally minimal: Pixel owns the card-grid UI. The data-testid
  // hooks below let the verification harness and Pixel's restyle both
  // target the right nodes without prop-drilling.
  return (
    <main
      data-testid="dashboard-root"
      className="min-h-screen bg-brand-light/40"
    >
      <div className="mx-auto max-w-6xl px-4 py-12">
        <header className="mb-10">
          <h1
            data-testid="dashboard-heading"
            className="text-3xl font-semibold tracking-tight text-brand-accent"
          >
            Your projects
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Signed in as {payload.email}.
          </p>
        </header>

        {/* Mount point for Pixel's card grid. Rendered as a plain list of
            anchors for now so the gate-pass verification can see real
            content; Pixel restyles into the brand card grid next. */}
        <section
          data-testid="dashboard-projects"
          aria-label="Projects"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {DASHBOARD_PROJECTS.map((p) => {
            const isLive = p.state === 'live' && p.href !== null;
            const baseClass =
              'block rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow';
            const liveClass = `${baseClass} hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40`;
            const mutedClass = `${baseClass} opacity-60 cursor-not-allowed`;

            if (isLive && p.external) {
              return (
                <a
                  key={p.id}
                  href={p.href as string}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid={`project-card-${p.id}`}
                  className={liveClass}
                >
                  <CardBody project={p} />
                </a>
              );
            }
            if (isLive) {
              return (
                <Link
                  key={p.id}
                  href={p.href as string}
                  data-testid={`project-card-${p.id}`}
                  className={liveClass}
                >
                  <CardBody project={p} />
                </Link>
              );
            }
            return (
              <div
                key={p.id}
                data-testid={`project-card-${p.id}`}
                aria-disabled="true"
                className={mutedClass}
              >
                <CardBody project={p} />
              </div>
            );
          })}
        </section>
      </div>
    </main>
  );
}

function CardBody({ project }: { project: DashboardProject }) {
  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-brand-accent">
          {project.name}
        </h2>
        {project.state === 'coming-soon' && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
            Coming soon
          </span>
        )}
      </div>
      <p className="mt-2 text-sm text-slate-500">{project.description}</p>
    </>
  );
}
