'use client';

import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { cn } from '../_lib/cn';
import { ProjectsSidebar } from './ProjectsSidebar';

/**
 * FactoryShell — the two-pane factory chrome: a persistent left projects nav
 * (Monetise-style) + the routed content. Mounted once by app/factory/layout.tsx
 * so the sidebar is identical on the board and on every project view, and so it
 * never unmounts/remounts (no flash, no re-fetch) when Dennis jumps between
 * projects via client navigation.
 *
 * Responsive: the sidebar is a fixed rail on lg+, and a slide-in drawer (with a
 * focus-trapping backdrop) below that, toggled by a header button. The drawer
 * closes on backdrop click or Escape.
 */
export function FactoryShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="relative flex min-h-[calc(100vh-4rem)]">
      {/* Desktop rail */}
      <aside data-print-hide className="hidden w-64 shrink-0 lg:block">
        <div className="sticky top-16 h-[calc(100vh-4rem)]">
          <ProjectsSidebar />
        </div>
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div data-print-hide className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close projects menu"
            className="absolute inset-0 bg-brand-dark/30 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
            onKeyDown={(e) => e.key === 'Escape' && setDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-xl">
            <ProjectsSidebar />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="min-w-0 flex-1">
        {/* Mobile-only bar to open the projects drawer */}
        <div data-print-hide className="flex items-center gap-2 border-b border-slate-200/70 bg-white/70 px-4 py-2.5 lg:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen((v) => !v)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-brand-dark/70 shadow-sm transition-colors hover:bg-slate-50',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40',
            )}
            aria-expanded={drawerOpen}
          >
            {drawerOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            Projects
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
