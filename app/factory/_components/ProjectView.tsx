'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Download,
  Printer,
  FileText,
  AlertCircle,
  Compass,
  ClipboardCheck,
  Package,
  ShieldCheck,
  Tag,
  Store,
  Sparkles,
} from 'lucide-react';
import { cn } from '../_lib/cn';
import type { Artifact } from '../_lib/types';
import {
  stageView,
  artifactTitle,
  artifactToMarkdown,
  artifactToMarkdownDocument,
  artifactFilename,
  combinedMarkdownDocument,
  combinedFilename,
} from '../_lib/artifactMarkdown';
import { Markdown } from './Markdown';
import { FactoryPrintDocument } from './FactoryPrintDocument';

const STAGE_ICON: Record<number, React.ComponentType<{ className?: string }>> = {
  1: Compass,
  2: ClipboardCheck,
  3: Package,
  4: ShieldCheck,
  5: Tag,
  6: Store,
};

/** Trigger a client-side download of a text file (no deps). */
function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the download has committed.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * ProjectView — the full readable project. Fetches the run's artifacts from the
 * owner-gated endpoint, renders each stage as nicely-formatted Markdown under a
 * human label, and offers per-stage + whole-project .md downloads. The Blueprint
 * (stage 2) is pulled to the top as the "how to go forward" guide Dennis asks
 * for; a sticky stage nav lets him jump between sections.
 */
export function ProjectView({ runId, seed }: { runId: string; seed: string }) {
  const [artifacts, setArtifacts] = useState<Artifact[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/factory/runs/${runId}/artifacts`, { cache: 'no-store' });
        if (!res.ok) {
          if (alive) setError(`Couldn't load this project (${res.status}).`);
          return;
        }
        const data = (await res.json()) as { artifacts: Artifact[] };
        if (alive) setArtifacts((data.artifacts ?? []).slice().sort((a, b) => a.stage - b.stage));
      } catch {
        if (alive) setError('Network error loading this project.');
      }
    })();
    return () => {
      alive = false;
    };
  }, [runId]);

  const downloadAll = useCallback(() => {
    if (!artifacts?.length) return;
    downloadText(combinedFilename(seed), combinedMarkdownDocument(seed, artifacts));
  }, [artifacts, seed]);

  // PDF export = print the dedicated print document via the browser's own PDF
  // engine ("Save as PDF"). The print stylesheet (globals.css) hides all the
  // on-screen chrome and reveals only .factory-print-doc, so the output is a
  // clean blueprint with a cover sheet + per-stage page breaks. Robust + no deps.
  const downloadPdf = useCallback(() => {
    if (typeof window !== 'undefined') window.print();
  }, []);

  // Blueprint first (the guide), then the rest in stage order.
  const ordered = useMemo(() => {
    if (!artifacts) return [];
    const blueprint = artifacts.find((a) => a.stage === 2);
    const rest = artifacts.filter((a) => a.stage !== 2);
    return blueprint ? [blueprint, ...rest] : artifacts;
  }, [artifacts]);

  return (
    <>
    <div data-print-hide className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      {/* Breadcrumb / back */}
      <Link
        href="/factory"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-primary transition-colors hover:text-brand-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 rounded-md"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to all projects
      </Link>

      {/* Header */}
      <header className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-primary">Project</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-brand-accent sm:text-3xl">
            {seed}
          </h1>
          <p className="mt-1.5 text-sm text-brand-dark/60">
            Everything the factory produced for this project — read it here or download the files.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={`/factory?run=${runId}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-brand-dark/70 shadow-sm transition-colors hover:bg-slate-50 hover:text-brand-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
          >
            <Compass className="h-4 w-4" />
            Live pipeline &amp; gates
          </Link>
          {artifacts && artifacts.length > 0 && (
            <>
              <button
                type="button"
                onClick={downloadPdf}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-brand-dark/70 shadow-sm transition-colors hover:bg-slate-50 hover:text-brand-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
              >
                <Printer className="h-4 w-4" />
                Download PDF
              </button>
              <button
                type="button"
                onClick={downloadAll}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
              >
                <Download className="h-4 w-4" />
                Download all (.md)
              </button>
            </>
          )}
        </div>
      </header>

      {/* States */}
      {error ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-6 py-14 text-center">
          <AlertCircle className="mb-3 h-9 w-9 text-rose-400" />
          <p className="font-semibold text-rose-800">{error}</p>
          <Link href="/factory" className="mt-3 text-sm font-medium text-rose-700 underline">
            Back to the board
          </Link>
        </div>
      ) : artifacts === null ? (
        <ProjectSkeleton />
      ) : artifacts.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <Sparkles className="mb-3 h-9 w-9 text-brand-primary/50" />
          <h2 className="text-lg font-semibold text-brand-accent">Nothing to read yet</h2>
          <p className="mt-1 max-w-sm text-sm text-brand-dark/55">
            This project hasn&apos;t produced any stage outputs yet. They&apos;ll appear here as the
            factory completes each stage.
          </p>
        </div>
      ) : (
        <div className="mt-7 lg:flex lg:items-start lg:gap-8">
          {/* Sticky stage nav */}
          <nav
            aria-label="Project sections"
            className="mb-6 lg:sticky lg:top-20 lg:mb-0 lg:w-52 lg:shrink-0"
          >
            <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-dark/40">
              Sections
            </p>
            <ul className="space-y-0.5">
              {ordered.map((a) => {
                const v = stageView(a.stage);
                const Icon = STAGE_ICON[a.stage] ?? FileText;
                return (
                  <li key={a.stage}>
                    <a
                      href={`#stage-${a.stage}`}
                      className={cn(
                        'flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors',
                        'text-brand-dark/70 hover:bg-white hover:text-brand-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40',
                        v.feature && 'font-semibold text-brand-primary',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{v.label}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Stage documents */}
          <div className="min-w-0 flex-1 space-y-6">
            {ordered.map((a) => (
              <StageSection key={a.stage} artifact={a} />
            ))}
          </div>
        </div>
      )}
    </div>

      {/* Print-only blueprint — hidden on screen, rendered for window.print(). */}
      {artifacts && artifacts.length > 0 && (
        <FactoryPrintDocument seed={seed} artifacts={artifacts} />
      )}
    </>
  );
}

function StageSection({ artifact }: { artifact: Artifact }) {
  const v = stageView(artifact.stage);
  const Icon = STAGE_ICON[artifact.stage] ?? FileText;
  const markdown = useMemo(() => artifactToMarkdown(artifact), [artifact]);
  const isEmpty = markdown.trim() === '';

  const download = () =>
    downloadText(artifactFilename(artifact), artifactToMarkdownDocument(artifact));

  return (
    <section
      id={`stage-${artifact.stage}`}
      aria-labelledby={`stage-${artifact.stage}-h`}
      className={cn(
        'scroll-mt-20 overflow-hidden rounded-2xl border bg-white shadow-sm',
        v.feature ? 'border-brand-primary/30 ring-1 ring-brand-primary/15' : 'border-slate-200',
      )}
    >
      <header
        className={cn(
          'flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4',
          v.feature ? 'border-brand-primary/15 bg-brand-light/60' : 'border-slate-100',
        )}
      >
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              'mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
              v.feature ? 'bg-brand-primary text-white' : 'bg-slate-100 text-brand-primary',
            )}
            aria-hidden="true"
          >
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-dark/40">
              Stage {artifact.stage}
            </p>
            <h2 id={`stage-${artifact.stage}-h`} className="text-lg font-semibold text-brand-accent">
              {v.label}
            </h2>
            {v.blurb && <p className="mt-0.5 text-sm text-brand-dark/55">{v.blurb}</p>}
          </div>
        </div>
        {!isEmpty && (
          <button
            type="button"
            onClick={download}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-dark/70 shadow-sm transition-colors hover:bg-slate-50 hover:text-brand-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
          >
            <Download className="h-3.5 w-3.5" />
            Download .md
          </button>
        )}
      </header>

      <div className="px-5 py-5 sm:px-6">
        {v.note && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <p className="text-sm text-amber-800">{v.note}</p>
          </div>
        )}
        {isEmpty ? (
          <p className="text-sm italic text-brand-dark/45">
            This stage produced no readable content.
          </p>
        ) : (
          <article>
            <h3 className="sr-only">{artifactTitle(artifact)}</h3>
            <Markdown source={markdown} />
          </article>
        )}
      </div>
    </section>
  );
}

function ProjectSkeleton() {
  return (
    <div className="mt-8 space-y-5" aria-hidden="true">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="h-9 w-9 animate-pulse rounded-lg bg-slate-200" />
            <div className="h-5 w-48 animate-pulse rounded bg-slate-200" />
          </div>
          <div className="space-y-2">
            <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-slate-100" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}
