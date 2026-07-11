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
  updatedLabel = "Última actualización",
  children,
}: {
  title: string;
  /** Human-readable "last reviewed" date, e.g. "10 de junio de 2026". */
  updated?: string;
  /**
   * Localised prefix for the "last updated" line. Defaults to the Spanish
   * "Última actualización" so the es pages render byte-for-byte as before;
   * the en legal pages pass "Last updated" (i18n Phase 2).
   */
  updatedLabel?: string;
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
            {updatedLabel}: {updated}
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
 * LegalTable — lightweight, muted, hairline-bordered table for the cookie /
 * privacy schedules (name / purpose / duration read clearer than prose).
 * Shared by the cookies and privacidad pages, es + en (i18n Phase 2).
 */
export function LegalTable({
  head,
  rows,
}: {
  head: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--color-hairline)]">
            {head.map((h) => (
              <th
                key={h}
                scope="col"
                className="py-2 pr-4 align-top font-semibold text-[var(--color-ink-primary)]"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr
              key={i}
              className="border-b border-[var(--color-hairline-soft)] last:border-0"
            >
              {cells.map((cell, j) => (
                <td
                  key={j}
                  className="py-2.5 pr-4 align-top text-[var(--color-ink-secondary)]"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * BindingNotice — the prevailing-language notice shown only on the English
 * legal pages (i18n Phase 2). Lex-validated wording (2026-07-10); the es
 * pages render no notice. Styled as a quiet, hairline-bordered callout,
 * consistent with the muted note style used inside the legal bodies.
 */
export function BindingNotice() {
  return (
    <p className="rounded-md border-l-2 border-[var(--color-hairline)] bg-[var(--color-surface-muted)] px-4 py-3 text-sm text-[var(--color-ink-tertiary)]">
      This English translation is provided for convenience only. The Spanish
      version is the legally binding text.
    </p>
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
