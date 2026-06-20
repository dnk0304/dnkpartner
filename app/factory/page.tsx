import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { validateSessionToken } from '@/lib/auth';
import { FactoryWorkspace } from './_components/FactoryWorkspace';

/**
 * /factory — the Product Factory CRM workspace.
 *
 * Server-gated route (cookie → validateSessionToken → /login, verbatim from the
 * prior shell). The body is now a LIVE kanban/CRM dashboard, not a static
 * brochure: a project directory, "+ Create a project", a kanban board where
 * each run is a card in its current-stage column (cards move as runs advance),
 * honest RunStatus chips, and a card-detail drawer with the 3-expert gate
 * verdicts + the dnk-trends scored-angle ranking.
 *
 * All data + interaction lives client-side in FactoryWorkspace, which polls the
 * real /api/factory/runs contract. This server component only does the auth gate
 * and mounts the chrome.
 */
export const dynamic = 'force-dynamic';

export default async function FactoryPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;

  if (!token) {
    redirect('/login?next=/factory');
  }

  const payload = await validateSessionToken(token);
  if (!payload) {
    redirect('/login?next=/factory');
  }

  return (
    <div data-testid="factory-root">
      <Suspense fallback={null}>
        <FactoryWorkspace />
      </Suspense>
    </div>
  );
}
