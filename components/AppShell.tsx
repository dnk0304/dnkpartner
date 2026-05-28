'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ProfileMenu } from '@/components/ProfileMenu';

/**
 * AppShell — thin persistent chrome wrapper for any future authenticated
 * portfolio route (e.g. /studio, /subastas, /defensapenal).
 *
 * Phase 1 (scaffold, 2026-05-28): no portfolio routes ship yet, so nothing
 * actually mounts this component. It exists so Phase 2+ can drop in
 * `<AppShell>{children}</AppShell>` from a portfolio layout without
 * re-deriving the shell pattern. Pixel will theme the chrome in Phase 2.
 *
 * Shape:
 *   ┌──────────────────────────────────────────────────────────┐
 *   │  [logo]                                  [ProfileMenu]   │
 *   ├──────────────────────────────────────────────────────────┤
 *   │                  {children}                              │
 *   └──────────────────────────────────────────────────────────┘
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 font-sans">
      <header className="h-16 px-6 flex items-center justify-between bg-white/80 backdrop-blur border-b border-slate-200 sticky top-0 z-10">
        <Link href="/" className="flex items-center gap-2" aria-label="DNK Partner — home">
          <Image
            src="/brand/dnk-partner-logo.png"
            alt="DNK Partner"
            width={600}
            height={200}
            priority
            className="h-9 w-auto"
          />
        </Link>
        <ProfileMenu />
      </header>
      <main className="flex-1 min-w-0">
        {children}
      </main>
    </div>
  );
}
