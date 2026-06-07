'use client';

/**
 * FullInfoWall — the "Regístrate gratis para ver" wall shown BELOW the public
 * teaser on auction detail pages when the viewer doesn't have full access.
 *
 * Two states:
 *   - logged-out                → CTA "Regístrate gratis" → /register?next=…
 *   - signed-in, trial-expired  → CTA "Activar plan Acceso" → opens UpgradeModal
 *
 * 2026-06-07 redesign: cleaner card surface — single soft shadow + pale cold
 * mint→frost halo, action-green CTA (the SOLID saturated mint, not the pale
 * gradient). Copy reflects the wave-B1 re-gate: registration is the next
 * step for logged-out viewers; the upgrade path stays unchanged.
 *
 * SEO note: this component renders client-side. The IMPORTANT SEO content —
 * the teaser — is in the SSR HTML stream above this wall. The wall is a
 * conversion surface; whether Google sees the wall or the unlocked content
 * doesn't matter, because the indexable teaser is the same in both.
 */

import { useState } from 'react';
import { usePathname } from 'next/navigation';
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
  const pathname = usePathname();
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  // While the session resolves, render the wall (treat as locked) so we
  // don't briefly flash gated content to a logged-out viewer.
  if (access.hasFullAccess) return null;

  const isAuthed = access.state !== 'logged-out';
  const title = headline ?? (isAuthed
    ? 'Activa el plan Acceso para el expediente completo'
    : 'Regístrate gratis para ver los detalles');
  const sub = isAuthed
    ? 'Tu periodo de prueba ha terminado. Activa el plan Acceso para ver dirección exacta, edicto, panel del juzgado y crear alertas.'
    : 'Crea una cuenta gratuita para ver la dirección exacta, los documentos, el edicto y el panel del juzgado. Sin tarjeta.';
  const cta = isAuthed ? 'Activar plan Acceso' : 'Regístrate gratis';

  // Preserve where the user came from so /register can bounce them back.
  const registerHref = pathname ? `/register?next=${encodeURIComponent(pathname)}` : '/register';
  const loginHref = pathname ? `/login?next=${encodeURIComponent(pathname)}` : '/login';

  return (
    <>
      <section
        aria-labelledby="full-info-wall-heading"
        className="my-8 summary-card p-6 md:p-9 text-center"
      >
        <div
          className="mx-auto mb-4 inline-flex h-11 w-11 items-center justify-center rounded-full"
          style={{ backgroundColor: 'var(--color-action-soft)' }}
        >
          <Lock className="h-5 w-5" style={{ color: 'var(--color-action)' }} aria-hidden="true" />
        </div>
        <h2
          id="full-info-wall-heading"
          className="font-serif text-xl md:text-2xl text-[--color-ink-primary]"
        >
          {title}
        </h2>
        <p className="mx-auto mt-2.5 max-w-readable text-sm leading-relaxed text-[--color-ink-secondary]">
          {sub}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {isAuthed ? (
            <button
              type="button"
              onClick={() => setUpgradeOpen(true)}
              className="inline-flex items-center justify-center rounded-md bg-[--color-action] px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[--color-action-hover] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-action]/40 focus-visible:ring-offset-2 transition-colors"
              aria-label="Activar plan Acceso"
            >
              {cta}
            </button>
          ) : (
            <Link
              href={registerHref}
              className="inline-flex items-center justify-center rounded-md bg-[--color-action] px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[--color-action-hover] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-action]/40 focus-visible:ring-offset-2 transition-colors"
              aria-label="Crear una cuenta gratuita para ver la información completa"
            >
              {cta}
            </Link>
          )}
          {!isAuthed && (
            <Link
              href={loginHref}
              className="inline-flex items-center justify-center rounded-md border border-[--color-hairline] bg-[--color-surface] px-5 py-2.5 text-sm font-medium text-[--color-ink-primary] hover:bg-[--color-surface-muted] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-action]/30 transition-colors"
            >
              Ya tengo cuenta
            </Link>
          )}
        </div>
        <p className="mt-5 text-[11px] text-[--color-ink-tertiary]">
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
