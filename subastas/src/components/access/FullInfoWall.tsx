'use client';

/**
 * FullInfoWall — the "Crea tu cuenta — 30 días de acceso gratis" wall shown
 * BELOW the public teaser on auction detail pages when the viewer doesn't
 * have full access.
 *
 * Two states:
 *   - logged-out                → CTA "Crea tu cuenta — 30 días gratis" → /register
 *   - signed-in, trial-expired  → CTA "Activar plan Acceso" → opens UpgradeModal
 *
 * SEO note: this component renders client-side. Google ALSO renders client
 * Next pages (it executes JS), but the IMPORTANT SEO content — the teaser —
 * is in the SSR HTML stream above this wall. This wall is purely a
 * conversion surface; whether Google sees the wall or the unlocked content
 * doesn't matter, because the indexable teaser is the same in both.
 */

import { useState } from 'react';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { useAccess } from '@/lib/access-client';
import { UpgradeModal } from '@/components/dashboard/UpgradeModal';

export interface FullInfoWallProps {
  /** Optional override for the headline; defaults to the freemium copy. */
  headline?: string;
}

export function FullInfoWall({ headline }: FullInfoWallProps) {
  const access = useAccess();
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  // While the session resolves, render the wall (treat as locked) so we
  // don't briefly flash gated content to a logged-out viewer.
  if (access.hasFullAccess) return null;

  const isAuthed = access.state !== 'logged-out';
  const title = headline ?? 'Acceso al expediente completo';
  const sub = isAuthed
    ? 'Tu periodo de prueba ha terminado. Activa el plan Acceso para ver dirección exacta, edicto y documentos.'
    : 'Crea tu cuenta — 30 días de acceso gratis. Verás la dirección exacta, los documentos, el edicto y el panel del juzgado.';
  const cta = isAuthed ? 'Activar plan Acceso' : 'Crear cuenta gratis';

  return (
    <>
      <section
        aria-labelledby="full-info-wall-heading"
        className="my-8 rounded-lg border border-[--color-hairline] bg-[--color-surface] p-6 md:p-8 text-center"
      >
        <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[--color-surface-muted]">
          <Lock className="h-5 w-5 text-[--color-ink-tertiary]" aria-hidden="true" />
        </div>
        <h2
          id="full-info-wall-heading"
          className="font-serif text-xl md:text-2xl text-[--color-ink-primary]"
        >
          {title}
        </h2>
        <p className="mx-auto mt-2 max-w-readable text-sm text-[--color-ink-secondary]">
          {sub}
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          {isAuthed ? (
            <button
              type="button"
              onClick={() => setUpgradeOpen(true)}
              className="inline-flex items-center justify-center rounded-md bg-[--color-brand] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-brand]/40"
            >
              {cta}
            </button>
          ) : (
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-md bg-[--color-brand] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-brand]/40"
            >
              {cta}
            </Link>
          )}
          {!isAuthed && (
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-md border border-[--color-hairline] bg-[--color-surface] px-5 py-2.5 text-sm font-medium text-[--color-ink-primary] hover:bg-[--color-surface-muted]"
            >
              Ya tengo cuenta
            </Link>
          )}
        </div>
        <p className="mt-4 text-[11px] text-[--color-ink-tertiary]">
          Buscar y navegar el catálogo es siempre gratis. La cuenta desbloquea el detalle completo de cada subasta.
        </p>
      </section>
      {isAuthed && (
        <UpgradeModal open={upgradeOpen} onOpenChange={setUpgradeOpen} />
      )}
    </>
  );
}

export default FullInfoWall;
