"use client";

/**
 * AccountSection — the shared white card chrome every "Tu cuenta" section
 * sits inside. One source of truth for the section header (eyebrow + title +
 * optional action slot) and the winter-green card frame, so the four sections
 * stay visually identical and we don't repeat the hairline/padding/heading
 * markup four times.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export type AccountSectionProps = {
  /** Small uppercase label above the heading. */
  eyebrow: string;
  /** Section heading (h2). */
  title: string;
  /** Optional right-aligned action(s) in the header (e.g. Editar buttons). */
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
};

export function AccountSection({
  eyebrow,
  title,
  action,
  className,
  children,
}: AccountSectionProps) {
  return (
    <section
      className={cn(
        "rounded-xl border border-[var(--color-hairline)] bg-[var(--color-surface)] shadow-sm",
        className,
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-hairline)] px-5 py-4 md:px-6 md:py-5">
        <div className="min-w-0">
          <p className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-[var(--color-ink-tertiary)]">
            {eyebrow}
          </p>
          <h2 className="mt-1 font-display text-lg font-semibold leading-tight text-[var(--color-ink-primary)] md:text-xl">
            {title}
          </h2>
        </div>
        {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
      </header>
      <div className="px-5 py-5 md:px-6 md:py-6">{children}</div>
    </section>
  );
}

/**
 * DataRow — a label/value pair used inside Perfil and Subscripción. Stacks on
 * mobile, two columns on desktop, hairline divider between rows.
 */
export function DataRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-[var(--color-hairline-soft)] py-3 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="text-sm text-[var(--color-ink-tertiary)]">{label}</dt>
      <dd className="text-sm font-medium text-[var(--color-ink-primary)] tnum sm:text-right">
        {children}
      </dd>
    </div>
  );
}
