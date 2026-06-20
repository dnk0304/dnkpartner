import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { validateSessionToken } from '@/lib/auth';
import { db } from '@/lib/db';
import { ProjectView } from '../_components/ProjectView';

/**
 * /factory/:id — the readable PROJECT view. This is where Dennis OPENS a project
 * and actually reads + downloads the files the factory produced.
 *
 * Server-gated exactly like /factory (cookie → validateSessionToken → /login).
 * We resolve the run server-side so the page can 404 cleanly and hand the client
 * the seed for the header; the artifacts themselves stream from
 * GET /api/factory/runs/:id/artifacts (same owner gate).
 */
export const dynamic = 'force-dynamic';

export default async function FactoryProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  if (!token) redirect('/login?next=/factory');

  const payload = await validateSessionToken(token);
  if (!payload) redirect('/login?next=/factory');

  const { id } = await params;
  const run = await db.run.findUnique({
    where: { id },
    select: { id: true, seed: true, stage: true, status: true },
  });
  if (!run) redirect('/factory');

  return (
    <div data-testid="factory-project-root">
      <ProjectView runId={run.id} seed={run.seed} stage={run.stage} status={run.status} />
    </div>
  );
}
