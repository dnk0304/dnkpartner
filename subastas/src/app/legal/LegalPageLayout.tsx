/**
 * LegalPageLayout — shared chrome for the static legal / contact pages
 * (Aviso legal, Privacidad, Cookies, Contacto).
 *
 * Server component. The site header + footer are injected by `SiteChrome`
 * in the root layout, so this only owns the editorial content column:
 * a constrained reading measure, a page H1, an optional "last updated"
 * line, and a vertical-rhythm prose stack.
 *
 * NOTE (v1 placeholder): the legal copy passed into these pages is
 * boilerplate structure pending Dennis's final, lawyer-reviewed text.
 * The layout itself is production-ready; only the words are provisional.
 */

import * as React from "react";

export function LegalPageLayout({
  title,
  updated,
  children,
}: {
  title: string;
  /** Human-readable "last reviewed" date, e.g. "10 de junio de 2026". */
  updated?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-3xl px-4 md:px-6 py-12 md:py-16">
      <header className="mb-8 md:mb-10">
        <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight text-[var(--color-ink-primary)]">
          {title}
        </h1>
        {updated ? (
          <p className="mt-3 text-sm text-[var(--color-ink-tertiary)]">
            Última actualización: {updated}
          </p>
        ) : null}
      </header>
      <div className="legal-prose space-y-6 text-[15px] leading-relaxed text-[var(--color-ink-secondary)]">
        {children}
      </div>
    </main>
  );
}

/**
 * LegalSection — a titled block inside a legal page. Keeps heading rhythm
 * and ink colour consistent across all four pages.
 */
export function LegalSection({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg md:text-xl font-semibold tracking-tight text-[var(--color-ink-primary)]">
        {heading}
      </h2>
      {children}
    </section>
  );
}
