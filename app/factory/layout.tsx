import { AppShell } from '@/components/AppShell';
import { FactoryShell } from './_components/FactoryShell';

/**
 * /factory layout — the persistent chrome for the whole Product Factory area:
 * the global AppShell (logo + profile) plus the two-pane FactoryShell (the
 * Monetise-style left projects nav + routed content). Mounting it here means the
 * projects sidebar is shared, identical, and STAYS PUT across the board and
 * every project view — client navigation between projects swaps only the content
 * pane, never the nav.
 *
 * Auth stays on each page (server `cookies()` → validateSessionToken → /login).
 * This layout adds no data fetching of its own; the sidebar reads the same
 * owner-gated /api/factory/runs as the rest of the app.
 */
export default function FactoryLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <FactoryShell>{children}</FactoryShell>
    </AppShell>
  );
}
