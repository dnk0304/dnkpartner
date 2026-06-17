import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ShieldCheck, ArrowRight, ArrowDown, Check } from 'lucide-react';
import { validateSessionToken } from '@/lib/auth';
import { AppShell } from '@/components/AppShell';
import { FACTORY_STAGES, type FactoryStage, type FactoryLens } from './stages';

/**
 * /factory — the Product Factory control panel (v1 shell).
 *
 * Server-gated route (see auth block below), structurally a sibling of
 * /dashboard: same cookie -> validateSessionToken gate, same AppShell
 * chrome, same brand card language.
 *
 * The page renders FACTORY_STAGES as an ordered pipeline. Each stage is
 * a card; the STAR of each card is the "3-expert gate" — three lenses
 * (check + expert role + pass-bar) that must clear before the product
 * advances. v1 is display-only: no actions wire up yet.
 *
 * Semantics: page <h1>, the pipeline is an <ol>, each stage is an <li>
 * with an <h2>, and each gate is a nested <ul> of the three lenses.
 *
 * Auth gate (Forge): cookie -> validateSessionToken -> /login on fail.
 */
export const dynamic = 'force-dynamic';

export default async function FactoryPage() {
  // ── Server-side auth gate (verbatim from /dashboard, retargeted) ─────
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
    <AppShell>
      <div
        data-testid="factory-root"
        className="mx-auto max-w-7xl px-6 py-12 sm:py-16"
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <header className="mb-10 sm:mb-14 max-w-3xl">
          <p className="text-xs uppercase tracking-[0.2em] font-semibold text-brand-primary">
            Internal · control panel
          </p>
          <h1
            data-testid="factory-heading"
            className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-brand-accent text-balance"
          >
            Product Factory
          </h1>
          <p className="mt-4 text-base sm:text-lg leading-relaxed text-brand-dark/70 text-pretty">
            From a raw niche to a launched, branded product — with{' '}
            <span className="font-medium text-brand-accent">
              3 expert specialists cross-checking every stage
            </span>
            . Remove the thinking.
          </p>
          <p className="mt-3 text-sm text-brand-dark/55">
            Signed in as{' '}
            <span className="font-medium text-brand-accent">{payload.email}</span>.
          </p>
        </header>

        {/* ── Pipeline ────────────────────────────────────────────────── */}
        <ol
          data-testid="factory-pipeline"
          aria-label="Product Factory pipeline — 8 stages"
          className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4"
        >
          {FACTORY_STAGES.map((stage, i) => (
            <StageCard
              key={stage.id}
              stage={stage}
              isLast={i === FACTORY_STAGES.length - 1}
            />
          ))}
        </ol>

        {/* ── Footer note ─────────────────────────────────────────────── */}
        <footer className="mt-14 border-t border-slate-200/70 pt-6">
          <p className="text-xs text-brand-dark/45">
            v1 control panel. Stage automation wires in over the phased plan.
          </p>
        </footer>
      </div>
    </AppShell>
  );
}

/**
 * StageCard — one pipeline stage + its 3-expert gate.
 *
 * Connectors:
 *   - Desktop (lg, 4-up): a right-pointing arrow sits in the inter-card
 *     gutter for every card that is not last in its visual row (n % 4).
 *   - Mobile / 2-up: a down-pointing arrow under every non-last card.
 * Both are aria-hidden — the <ol> already conveys order to AT.
 */
function StageCard({ stage, isLast }: { stage: FactoryStage; isLast: boolean }) {
  // Hide the desktop right-arrow on the last card of each 4-wide row.
  const endsDesktopRow = stage.n % 4 === 0;

  return (
    <li
      data-testid={`stage-${stage.id}`}
      className="relative flex h-full flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-shadow duration-200 hover:shadow-md focus-within:ring-2 focus-within:ring-brand-primary/40"
    >
      {/* Stage head: number badge + name, with a low-key shell pill. */}
      <div className="flex items-start gap-3">
        <span
          className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-sm font-semibold text-brand-primary"
          aria-hidden="true"
        >
          {stage.n}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold leading-snug text-brand-accent">
            <span className="sr-only">{`Stage ${stage.n}: `}</span>
            {stage.name}
          </h2>
        </div>
      </div>

      {/* What this stage produces. */}
      <p className="mt-3 text-sm leading-relaxed text-brand-dark/70">
        {stage.produces}
      </p>

      {/* ── The 3-expert gate — the star of the card. ─────────────────── */}
      <div className="mt-4 flex-1 rounded-xl border border-brand-primary/15 bg-brand-light/40 p-3">
        <div className="mb-2.5 flex items-center gap-1.5">
          <ShieldCheck
            className="h-3.5 w-3.5 text-brand-primary"
            aria-hidden="true"
          />
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-primary">
            3-expert gate
          </span>
        </div>
        <ul className="space-y-2" aria-label={`Quality gate for ${stage.name}`}>
          {stage.lenses.map((lens) => (
            <LensRow key={lens.name} lens={lens} />
          ))}
        </ul>
      </div>

      {/* Low-key shell status pill. */}
      <div className="mt-4">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-0.5 text-[11px] font-medium text-brand-dark/55 ring-1 ring-inset ring-slate-200">
          <span
            className="h-1.5 w-1.5 rounded-full bg-slate-300"
            aria-hidden="true"
          />
          Shell · automation coming
        </span>
      </div>

      {/* ── Flow connectors (decorative; order conveyed by <ol>). ─────── */}
      {!isLast && (
        <>
          {/* Desktop: right arrow in the gutter (hidden at row ends). */}
          {!endsDesktopRow && (
            <span
              className="pointer-events-none absolute right-0 top-1/2 hidden -translate-y-1/2 translate-x-[calc(100%+2px)] text-brand-primary/50 lg:block"
              aria-hidden="true"
            >
              <ArrowRight className="h-5 w-5" />
            </span>
          )}
          {/* Mobile / 2-up: down arrow centered under the card. */}
          <span
            className="pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 text-brand-primary/50 lg:hidden"
            aria-hidden="true"
          >
            <ArrowDown className="h-5 w-5" />
          </span>
        </>
      )}
    </li>
  );
}

/**
 * LensRow — one expert lens inside a gate: the check name, the expert
 * role, and the pass-bar caption. The check sits on a check-marked chip
 * so the "must pass" idea reads instantly.
 */
function LensRow({ lens }: { lens: FactoryLens }) {
  return (
    <li className="flex gap-2">
      <span
        className="mt-0.5 inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-brand-primary/15 text-brand-primary"
        aria-hidden="true"
      >
        <Check className="h-2.5 w-2.5" strokeWidth={3} />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold leading-tight text-brand-accent">
          {lens.name}
          <span className="ml-1.5 font-normal text-brand-dark/45">
            · {lens.role}
          </span>
        </p>
        <p className="mt-0.5 text-[11px] leading-snug text-brand-dark/60">
          {lens.bar}
        </p>
      </div>
    </li>
  );
}
