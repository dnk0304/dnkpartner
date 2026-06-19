'use client';

import { useMemo } from 'react';
import type { Artifact } from '../_lib/types';
import { stageView, artifactTitle, artifactToMarkdown } from '../_lib/artifactMarkdown';
import { Markdown } from './Markdown';

/**
 * FactoryPrintDocument — the print-only blueprint. Hidden on screen (the
 * `.factory-print-doc` class is display:none until @media print), it renders the
 * FULL project as a clean printable document: a title/cover sheet with the
 * product name, then every stage IN ORDER (1→N), each on its own sheet, rendered
 * from the exact same Markdown the on-screen view shows. The print stylesheet in
 * globals.css owns page breaks, margins and black-on-white typography so
 * File → Save as PDF (or the Download PDF button → window.print()) produces a
 * blueprint Dennis can hand to a buyer or print.
 *
 * It reuses artifactToMarkdown + the Markdown renderer, so what prints is exactly
 * what reads — no second source of truth, nothing fabricated.
 */
export function FactoryPrintDocument({
  seed,
  artifacts,
}: {
  seed: string;
  artifacts: Artifact[];
}) {
  const ordered = useMemo(
    () => [...artifacts].sort((a, b) => a.stage - b.stage),
    [artifacts],
  );

  const printedOn = useMemo(
    () =>
      new Date().toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    [],
  );

  return (
    <div className="factory-print-doc" aria-hidden="true">
      {/* Cover / title page */}
      <section className="factory-print-cover">
        <p className="kicker">Product Factory · Blueprint</p>
        <h1>{seed}</h1>
        <p className="sub">The full build-and-launch blueprint for this product.</p>
        <p className="meta">
          Generated {printedOn} · {ordered.length} stage{ordered.length === 1 ? '' : 's'} included
        </p>
      </section>

      {/* One section per stage, in pipeline order. */}
      {ordered.map((a) => {
        const v = stageView(a.stage);
        const md = artifactToMarkdown(a);
        return (
          <section key={a.stage} className="factory-print-stage">
            <p className="stage-eyebrow">Stage {a.stage}</p>
            <h2>{v.label}</h2>
            {v.blurb && <p className="stage-blurb">{v.blurb}</p>}
            {v.note && <p className="stage-note">{v.note}</p>}
            <div className="factory-print-body">
              {md.trim() ? (
                <Markdown source={md} />
              ) : (
                <p>
                  <em>This stage produced no readable content.</em>
                </p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
