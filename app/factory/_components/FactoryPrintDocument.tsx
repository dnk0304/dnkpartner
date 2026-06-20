'use client';

import { useMemo } from 'react';
import { readWorkbookManifest, type Artifact } from '../_lib/types';
import { stageView, artifactTitle, artifactToMarkdown } from '../_lib/artifactMarkdown';
import { Markdown } from './Markdown';

/**
 * The honest doc-only note for a COMPUTATIONAL product. The PDF renders only the
 * markdown — it physically cannot embed a live-formula spreadsheet — so without
 * this line the PDF would silently look like the whole product. Shown on the
 * cover and the Stage-3 section whenever the project carries a computational
 * workbook. (Non-computational products are already covered by artifactMarkdown's
 * stageNote "this product is a document"; we don't duplicate that here.)
 */
const DOC_ONLY_NOTE =
  'This PDF is the reference document. The working tool is the live-formula spreadsheet (.xlsx) — ' +
  "download it from the on-screen project view; its Excel formulas can't be embedded in a PDF.";

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
  // Skip the Stage-1 candidate-set artifact: its only serialization is raw JSON
  // (mdGeneric), which we deliberately keep out of every read surface — the PDF
  // included. The chosen-niche brief carries the printable Stage-1 record.
  const ordered = useMemo(
    () =>
      artifacts
        .filter((a) => a.kind !== 'niche_candidates')
        .sort((a, b) => a.stage - b.stage),
    [artifacts],
  );

  // True when the project's Stage-3 build carries a real computational workbook —
  // the case where the PDF is only the reference document and the .xlsx is the tool.
  const isComputational = useMemo(
    () =>
      readWorkbookManifest(artifacts.find((a) => a.stage === 3)?.payload) !== null,
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
        {isComputational && <p className="stage-note">{DOC_ONLY_NOTE}</p>}
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
            {a.stage === 3 && isComputational && <p className="stage-note">{DOC_ONLY_NOTE}</p>}
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
