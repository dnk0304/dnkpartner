import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowUpRight, ArrowRight, Gavel, PenSquare, LineChart, PhoneCall, Sofa, Sticker } from 'lucide-react';
import { validateSessionToken } from '@/lib/auth';
import { AppShell } from '@/components/AppShell';
import { DASHBOARD_PROJECTS, type DashboardProject } from './projects';

/**
 * /dashboard — the post-login project picker.
 *
 * Server-gated route (see auth block below). UI is composed of:
 *   - AppShell chrome (logo + ProfileMenu) for continuity with the
 *     rest of the authed surface.
 *   - A welcome header that pulls the email from the validated JWT
 *     payload so the user instantly sees which account they're in.
 *   - A responsive card grid (1/2/3 cols) over the locked
 *     DASHBOARD_PROJECTS set. Live cards are linkable; coming-soon
 *     cards render visibly dimmed, dashed, non-interactive.
 *
 * Auth gate (Forge): cookie -> validateSessionToken -> /login on fail.
 */
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  // ── Server-side auth gate ────────────────────────────────────────────
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;

  if (!token) {
    redirect('/login?next=/dashboard');
  }

  const payload = await validateSessionToken(token);
  if (!payload) {
    redirect('/login?next=/dashboard');
  }

  return (
    <AppShell>
      <div
        data-testid="dashboard-root"
        className="mx-auto max-w-6xl px-6 py-12 sm:py-16"
      >
        <header className="mb-10 sm:mb-12">
          <p className="text-xs uppercase tracking-[0.2em] font-semibold text-brand-primary">
            Welcome back
          </p>
          <h1
            data-testid="dashboard-heading"
            className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-brand-accent text-balance"
          >
            Your projects
          </h1>
          <p className="mt-3 text-base text-brand-dark/70">
            Signed in as <span className="font-medium text-brand-accent">{payload.email}</span>.
          </p>
        </header>

        <section
          data-testid="dashboard-projects"
          aria-label="Projects"
          className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          {DASHBOARD_PROJECTS.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </section>
      </div>
    </AppShell>
  );
}

/**
 * Icon registry — keyed by project id so the data file stays
 * presentation-free. Falls back to a generic shape if an id is added
 * without a matching glyph (cheap forward-compat, no runtime crash).
 */
const PROJECT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  subastas: Gavel,
  studio: PenSquare,
  trends: LineChart,
  computercaller: PhoneCall,
  'room-designer': Sofa,
  'panini-pano': Sticker,
};

function ProjectCard({ project }: { project: DashboardProject }) {
  const Icon = PROJECT_ICONS[project.id] ?? PenSquare;
  const isLive = project.state === 'live' && project.href !== null;

  // ── Shared visual primitives ─────────────────────────────────────────
  // Card chrome is identical across live + coming-soon so the grid
  // reads as one family; differentiation comes from border style,
  // surface tint, icon treatment, and the footer chip.
  const base =
    'group relative flex h-full flex-col rounded-2xl p-6 transition-all duration-200 ease-out';
  const liveChrome =
    'bg-white border border-slate-200/80 shadow-sm hover:shadow-md hover:border-brand-primary/40 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50 focus-visible:ring-offset-2';
  const soonChrome =
    'bg-brand-light/50 border border-dashed border-slate-300 cursor-not-allowed';

  const className = `${base} ${isLive ? liveChrome : soonChrome}`;

  const inner = <CardBody project={project} Icon={Icon} isLive={isLive} />;

  if (isLive && project.external) {
    return (
      <a
        href={project.href as string}
        target="_blank"
        rel="noopener noreferrer"
        data-testid={`project-card-${project.id}`}
        className={className}
        aria-label={`${project.name} — opens in new tab`}
      >
        {inner}
      </a>
    );
  }

  if (isLive) {
    return (
      <Link
        href={project.href as string}
        data-testid={`project-card-${project.id}`}
        className={className}
      >
        {inner}
      </Link>
    );
  }

  return (
    <div
      data-testid={`project-card-${project.id}`}
      aria-disabled="true"
      className={className}
    >
      {inner}
    </div>
  );
}

function CardBody({
  project,
  Icon,
  isLive,
}: {
  project: DashboardProject;
  Icon: React.ComponentType<{ className?: string }>;
  isLive: boolean;
}) {
  return (
    <>
      {/* Icon tile — teal-tinted for live, slate-tinted (muted) for coming-soon. */}
      <div
        className={
          isLive
            ? 'inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary'
            : 'inline-flex h-11 w-11 items-center justify-center rounded-xl bg-slate-200/60 text-slate-400'
        }
        aria-hidden="true"
      >
        <Icon className="h-5 w-5" />
      </div>

      <div className="mt-5 flex items-start justify-between gap-3">
        <h2
          className={
            isLive
              ? 'text-lg font-semibold text-brand-accent'
              : 'text-lg font-semibold text-brand-accent/60'
          }
        >
          {project.name}
        </h2>
        {project.external && isLive && (
          <ArrowUpRight
            className="h-4 w-4 flex-shrink-0 text-brand-dark/40 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-primary"
            aria-hidden="true"
          />
        )}
      </div>

      <p
        className={
          isLive
            ? 'mt-2 text-sm leading-relaxed text-brand-dark/70'
            : 'mt-2 text-sm leading-relaxed text-brand-dark/45'
        }
      >
        {project.description}
      </p>

      {/* Footer chip — pushed to the bottom so cards line up vertically
          across the row regardless of description length. */}
      <div className="mt-6 flex-1" />
      <div className="flex items-center justify-between">
        {isLive ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-primary">
            <span
              className="h-1.5 w-1.5 rounded-full bg-brand-primary"
              aria-hidden="true"
            />
            Live
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-white/70 px-2.5 py-0.5 text-xs font-medium text-brand-dark/55 border border-slate-200">
            Coming soon
          </span>
        )}
        {isLive && !project.external && (
          <ArrowRight
            className="h-4 w-4 text-brand-dark/30 transition-all group-hover:translate-x-1 group-hover:text-brand-primary"
            aria-hidden="true"
          />
        )}
      </div>
    </>
  );
}
