'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  FileText,
  FileDown,
  FileSpreadsheet,
  ShieldCheck,
  AlertCircle,
  Compass,
  ClipboardList,
  Package,
  Swords,
  Tag,
  Rocket,
  Sparkles,
  Check,
  X,
  Loader2,
  CircleSlash,
  ChevronDown,
  Target,
  CircleDot,
} from 'lucide-react';
import { cn } from '../_lib/cn';
import {
  readCompetitorScan,
  readWorkbookManifest,
  readNicheCandidates,
  deriveCardState,
  getTier,
  type Artifact,
  type CompetitorScan,
  type GateLog,
  type Verdict,
  type Challenge,
  type RunStatus,
  type WorkbookManifest,
} from '../_lib/types';
import {
  stageView,
  stageNote,
  artifactTitle,
  artifactToMarkdown,
  artifactToMarkdownDocument,
  artifactFilename,
  combinedMarkdownDocument,
  combinedFilename,
} from '../_lib/artifactMarkdown';
import { Markdown } from './Markdown';
import { NicheConsideredRecap } from './NicheConsideredRecap';
import { FactoryPrintDocument } from './FactoryPrintDocument';
import { StatusChip } from './StatusChip';

/**
 * Plain-language section icons, matching Vinci's spec §3.3 (the board labels).
 * These replace the older audit/blueprint icon set so the detail-view section
 * nav reads with the SAME journey the board teaches.
 */
const STAGE_ICON: Record<number, React.ComponentType<{ className?: string }>> = {
  1: Compass,
  2: ClipboardList,
  3: Package,
  4: Swords,
  5: Tag,
  6: Rocket,
};

/** MIME for an Office Open XML (.xlsx) spreadsheet. */
const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

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
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Trigger a client-side download of base64-encoded binary (no deps). Used for the
 * Stage-3 live-formula .xlsx workbook, whose bytes the artifact carries as base64.
 */
function downloadBase64(filename: string, base64: string, mime: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * The live-formula spreadsheet a computational Stage-3 build carries alongside
 * its markdown. Absent entirely for non-computational products.
 */
interface ArtifactWorkbook {
  base64: string;
  filename: string;
  sheetNames: string[];
  computational: boolean;
}

function readWorkbook(payload: unknown): ArtifactWorkbook | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const wb = (payload as { workbook?: unknown }).workbook;
  if (typeof wb !== 'object' || wb === null) return null;
  const { base64, filename, sheetNames, computational } = wb as Record<string, unknown>;
  if (computational !== true) return null;
  if (typeof base64 !== 'string' || base64.trim() === '') return null;
  return {
    base64,
    filename: typeof filename === 'string' && filename.trim() ? filename : '',
    sheetNames: Array.isArray(sheetNames)
      ? sheetNames.filter((s): s is string => typeof s === 'string')
      : [],
    computational: true,
  };
}

/**
 * ProjectView — the readable PROJECT command center (Vinci spec, Screen 3).
 *
 * Three-column layout: a sticky section nav (left), the stage section cards
 * (center), and the PERMANENT Competitor Scan sidebar (right). The competitor
 * scan is no longer buried inside the Stage-4 card — it is always on screen as
 * its own region (Dennis's #1 ask: "I couldn't find it"). On screens < lg the
 * sidebar reflows BELOW the content; it is never returned to a hidden drawer.
 *
 * A sticky top action bar surfaces every export (.md / .xlsx / PDF) and a
 * "Show Gate Verdicts" trigger that opens the per-stage 3-expert verdict drawer.
 * Gate logs come from the existing GET /api/factory/runs/:id endpoint (no API
 * contract change) — fetched lazily the first time the verdicts drawer opens.
 */
export function ProjectView({
  runId,
  seed,
  stage,
  status,
}: {
  runId: string;
  seed: string;
  stage: number;
  status: RunStatus;
}) {
  const [artifacts, setArtifacts] = useState<Artifact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<number | null>(null);

  // Gate verdicts: pulled lazily from the run-detail endpoint on first open.
  const [verdictsOpen, setVerdictsOpen] = useState(false);
  const [gateLogs, setGateLogs] = useState<GateLog[] | null>(null);
  const [gateError, setGateError] = useState<string | null>(null);
  const [gateLoading, setGateLoading] = useState(false);

  // PDF / .md busy flags so the buttons can show a spinner + disable.
  const [pdfBusy, setPdfBusy] = useState(false);
  const [mdBusy, setMdBusy] = useState(false);

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
        if (alive) {
          setArtifacts((data.artifacts ?? []).slice().sort((a, b) => a.stage - b.stage));
        }
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
    setMdBusy(true);
    try {
      downloadText(combinedFilename(seed), combinedMarkdownDocument(seed, artifacts));
    } finally {
      // Re-enable on the next tick — the download has been kicked off synchronously.
      setTimeout(() => setMdBusy(false), 400);
    }
  }, [artifacts, seed]);

  // PDF export = print the dedicated print document via the browser's PDF engine.
  const downloadPdf = useCallback(() => {
    if (typeof window === 'undefined') return;
    setPdfBusy(true);
    window.print();
    setTimeout(() => setPdfBusy(false), 600);
  }, []);

  // Lazy-load gate logs the first time the verdicts drawer is opened.
  const openVerdicts = useCallback(async () => {
    setVerdictsOpen(true);
    if (gateLogs !== null || gateLoading) return;
    setGateLoading(true);
    setGateError(null);
    try {
      const res = await fetch(`/api/factory/runs/${runId}`, { cache: 'no-store' });
      if (!res.ok) {
        setGateError(`Couldn't load the gate verdicts (${res.status}).`);
        setGateLoading(false);
        return;
      }
      const data = (await res.json()) as { run?: { gateLogs?: GateLog[] } };
      setGateLogs(data.run?.gateLogs ?? []);
    } catch {
      setGateError('Network error loading the gate verdicts.');
    } finally {
      setGateLoading(false);
    }
  }, [runId, gateLogs, gateLoading]);

  // Blueprint first (the guide), then the rest in stage order.
  const ordered = useMemo(() => {
    if (!artifacts) return [];
    const blueprint = artifacts.find((a) => a.stage === 2);
    const rest = artifacts.filter((a) => a.stage !== 2);
    return blueprint ? [blueprint, ...rest] : artifacts;
  }, [artifacts]);

  // The Stage-4 competitor scan that feeds the permanent sidebar (null = not yet
  // run / older run — the sidebar then shows its honest "runs at Stage 4" state).
  const competitorScan = useMemo<CompetitorScan | null>(() => {
    if (!artifacts) return null;
    const audit =
      artifacts.find((a) => a.stage === 4 && a.kind === 'audit_report') ??
      artifacts.find((a) => a.stage === 4);
    return readCompetitorScan(audit?.payload);
  }, [artifacts]);

  // Scroll-spy: highlight the section nearest the top of the viewport.
  useEffect(() => {
    if (!ordered.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          const id = visible[0].target.id.replace('stage-', '');
          const n = Number(id);
          if (Number.isFinite(n)) setActiveStage(n);
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 },
    );
    ordered.forEach((a) => {
      const el = document.getElementById(`stage-${a.stage}`);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [ordered]);

  const cardState = useMemo(
    () =>
      deriveCardState({
        id: runId,
        seed,
        stage,
        status,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    [runId, seed, stage, status],
  );

  // Count of stages whose gate FAILED at least once → the verdicts button badge.
  const failedStageCount = useMemo(() => {
    if (!gateLogs) return 0;
    const failed = new Set<number>();
    for (const log of gateLogs) {
      const r1 = Array.isArray(log.round1) ? log.round1 : [];
      const r2 = Array.isArray(log.round2) ? log.round2 : [];
      const anyFail =
        r1.some((v) => {
          const challenge = r2.find((c) => c.expert === v.expert);
          return (challenge?.revisedVerdict ?? v.verdict) === 'FAIL';
        }) || log.resolution === 'escalate';
      if (anyFail) failed.add(log.stage);
    }
    return failed.size;
  }, [gateLogs]);

  const hasArtifacts = artifacts !== null && artifacts.length > 0;

  return (
    <>
      <div data-print-hide className="min-h-screen bg-brand-canvas pb-16">
        {/* ── Sticky action bar (spec §5.1) ─────────────────────────────────── */}
        <div className="sticky top-0 z-20 border-b border-brand-line bg-brand-surface/90 backdrop-blur">
          <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-6 py-3 sm:flex-row sm:flex-wrap sm:items-center">
            {/* Left: back + title + status. Full-width < sm so the export cluster
                stacks BELOW it instead of overlapping the title at 390px. */}
            <div className="flex min-w-0 items-center gap-3 sm:flex-1">
              <Link
                href="/factory"
                aria-label="Back to all projects"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-brand-line bg-white text-brand-dark/70 transition-colors hover:bg-brand-light hover:text-brand-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <div className="min-w-0">
                <h1 className="truncate text-xl font-semibold tracking-tight text-brand-accent md:text-2xl">
                  {seed}
                </h1>
                <div className="mt-0.5 flex items-center gap-2">
                  <StatusChip state={cardState} stage={stage} />
                  <span className="text-xs text-brand-muted">Stage {stage} / 6</span>
                </div>
              </div>
            </div>

            {/* Right: export cluster + verdicts (spec order/labels/icons). The
                primary "Show Gate Verdicts" DOMINATES (solid fill); the export
                buttons recede to quiet outlines. */}
            {hasArtifacts && (
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <ActionButton
                  onClick={downloadAll}
                  busy={mdBusy}
                  icon={FileText}
                  label="Download .md"
                  hint="All text"
                />
                <WorkbookBarButton artifacts={artifacts!} />
                <ActionButton
                  onClick={downloadPdf}
                  busy={pdfBusy}
                  icon={FileDown}
                  label="PDF"
                  hint="PDF export"
                />
                <button
                  type="button"
                  onClick={openVerdicts}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
                >
                  <ShieldCheck className="h-4 w-4" />
                  <span className="hidden sm:inline">Show Gate Verdicts</span>
                  <span className="sm:hidden">Verdicts</span>
                  {failedStageCount > 0 && (
                    <span
                      className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white"
                      aria-label={`${failedStageCount} stage(s) with a failed gate`}
                    >
                      {failedStageCount}
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Body ──────────────────────────────────────────────────────────── */}
        <div className="mx-auto max-w-[1600px] px-6 pt-6">
          {error ? (
            <div className="mt-2 flex flex-col items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-6 py-14 text-center">
              <AlertCircle className="mb-3 h-9 w-9 text-rose-400" />
              <p className="font-semibold text-rose-800">{error}</p>
              <Link href="/factory" className="mt-3 text-sm font-medium text-rose-700 underline">
                Back to the board
              </Link>
            </div>
          ) : artifacts === null ? (
            <ProjectSkeleton />
          ) : artifacts.length === 0 ? (
            <div className="mt-2 flex flex-col items-center justify-center rounded-2xl border border-dashed border-brand-line bg-brand-surface px-6 py-16 text-center">
              <Sparkles className="mb-3 h-9 w-9 text-brand-primary/50" />
              <h2 className="text-lg font-semibold text-brand-accent">Nothing to read yet</h2>
              <p className="mt-1 max-w-sm text-sm text-brand-muted">
                This project hasn&apos;t produced any stage outputs yet. They&apos;ll appear here as
                the factory completes each stage.
              </p>
              <Link
                href={`/factory?run=${runId}`}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
              >
                <Compass className="h-4 w-4" />
                Open the board
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-12 gap-6">
              {/* Left — Section nav (col-span-2, sticky on lg+; pill row < lg) */}
              <SectionNav
                ordered={ordered}
                activeStage={activeStage}
                currentStage={stage}
                className="col-span-12 lg:col-span-2"
              />

              {/* Center — section cards (col-span-7). space-y-8 gives the section
                  cards more breathing room between them (audit §7). */}
              <div className="col-span-12 min-w-0 space-y-8 lg:col-span-7">
                {ordered.map((a) => (
                  <StageSection key={a.id} artifact={a} chosenNiche={seed} />
                ))}
              </div>

              {/* Right — PERMANENT Competitor Scan sidebar (col-span-3). Sticky on
                  lg+, reflows BELOW the content < lg. Always rendered. */}
              <div className="col-span-12 lg:col-span-3">
                <div className="lg:sticky lg:top-24">
                  <CompetitorScanSidebar scan={competitorScan} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Gate Verdicts drawer — reuses the run-detail gate-log UI. */}
      {verdictsOpen && (
        <GateVerdictsDrawer
          loading={gateLoading}
          error={gateError}
          gateLogs={gateLogs}
          onClose={() => setVerdictsOpen(false)}
        />
      )}

      {/* Print-only blueprint — hidden on screen, rendered for window.print(). */}
      {hasArtifacts && <FactoryPrintDocument seed={seed} artifacts={artifacts!} />}
    </>
  );
}

/* ── Action-bar building blocks ───────────────────────────────────────────── */

function ActionButton({
  onClick,
  busy,
  icon: Icon,
  label,
  hint,
}: {
  onClick: () => void;
  busy?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={hint}
      className="inline-flex items-center gap-1.5 rounded-lg border border-brand-line bg-white px-3 py-2 text-sm font-medium text-brand-accent shadow-sm transition-colors hover:bg-brand-light focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      <span className="hidden md:inline">{label}</span>
      <span className="md:hidden">{label.replace('Download ', '')}</span>
    </button>
  );
}

/**
 * The .xlsx download button — only mounts when a computational Stage-3 workbook
 * exists (spec: "only shown if a workbook manifest exists, else omit"). Decodes
 * the base64 bytes the artifact carries; no extra fetch.
 */
function WorkbookBarButton({ artifacts }: { artifacts: Artifact[] }) {
  const workbook = useMemo(() => {
    const s3 = artifacts.find((a) => a.stage === 3);
    return s3 ? readWorkbook(s3.payload) : null;
  }, [artifacts]);

  if (!workbook) return null;

  const download = () => {
    const s3 = artifacts.find((a) => a.stage === 3);
    const fallback = s3 ? artifactFilename(s3).replace(/\.md$/i, '').trim() : 'workbook';
    const name = workbook.filename || `${fallback || 'workbook'}.xlsx`;
    downloadBase64(name, workbook.base64, XLSX_MIME);
  };

  return (
    <button
      type="button"
      onClick={download}
      title="Excel workbook"
      className="inline-flex items-center gap-1.5 rounded-lg border border-brand-line bg-white px-3 py-2 text-sm font-medium text-brand-accent shadow-sm transition-colors hover:bg-brand-light focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
    >
      <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
      <span className="hidden md:inline">Download .xlsx</span>
      <span className="md:hidden">.xlsx</span>
    </button>
  );
}

/* ── Left section nav ─────────────────────────────────────────────────────── */

function SectionNav({
  ordered,
  activeStage,
  currentStage,
  className,
}: {
  ordered: Artifact[];
  activeStage: number | null;
  currentStage: number;
  className?: string;
}) {
  // One nav entry per stage. The Stage-1 candidate-set recap is a SUB-section of
  // stage 1 (it owns `#stage-1-considered`, not `#stage-1`), so it must not add a
  // second "Find Your Market" link — prefer the non-candidate artifact per stage.
  const navStages: Artifact[] = [];
  const seenStages = new Set<number>();
  for (const a of ordered) {
    if (a.kind === 'niche_candidates') continue;
    if (seenStages.has(a.stage)) continue;
    seenStages.add(a.stage);
    navStages.push(a);
  }

  return (
    <nav aria-label="Project sections" className={className}>
      <div className="lg:sticky lg:top-24">
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-muted">
          Sections
        </p>
        {/* lg+: vertical list · < lg: horizontal scrollable pill row */}
        <ul className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0">
          {navStages.map((a) => {
            const v = stageView(a.stage);
            const Icon = STAGE_ICON[a.stage] ?? FileText;
            const isActive = activeStage === a.stage;
            const isDone = a.stage < currentStage;
            return (
              <li key={a.stage} className="shrink-0 lg:shrink">
                <a
                  href={`#stage-${a.stage}`}
                  aria-current={isActive ? 'true' : undefined}
                  className={cn(
                    'flex items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm transition-colors lg:whitespace-normal',
                    isActive
                      ? 'bg-brand-tint font-semibold text-brand-primary'
                      : 'text-brand-dark/70 hover:bg-brand-surface hover:text-brand-accent',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{sectionLabel(a.stage)}</span>
                  {isDone && (
                    <Check
                      className="ml-auto hidden h-3.5 w-3.5 shrink-0 text-emerald-600 lg:block"
                      strokeWidth={3}
                      aria-hidden="true"
                    />
                  )}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

/**
 * Plain-language section label for the nav + card heading (spec §3.3 board copy).
 * Falls back to the artifactMarkdown StageView label for any unmapped stage.
 */
function sectionLabel(stage: number): string {
  const map: Record<number, string> = {
    1: 'Find Your Market',
    2: 'See the Build Plan',
    3: 'Get the Product',
    4: 'Beat Competitors',
    5: 'Brand It',
    6: 'Launch It',
  };
  return map[stage] ?? stageView(stage).label;
}

/* ── Center stage section card ────────────────────────────────────────────── */

function StageSection({
  artifact,
  chosenNiche,
}: {
  artifact: Artifact;
  /** The picked niche (Run.seed after selection) — marks the chosen recap card. */
  chosenNiche?: string;
}) {
  const v = stageView(artifact.stage);
  const Icon = STAGE_ICON[artifact.stage] ?? FileText;

  // Stage-1 candidate set: render the scored candidates as human cards (the
  // "Niches considered" recap), NOT raw JSON. This is the artifact that used to
  // fall through to mdGeneric → a fenced ```json block (the app's only remaining
  // horizontal scroll). Intercepted here so the picker UI stays visible after a
  // niche is chosen.
  const isCandidateSet = artifact.kind === 'niche_candidates';
  const candidates = useMemo(
    () => (isCandidateSet ? readNicheCandidates(artifact.payload) : []),
    [artifact, isCandidateSet],
  );

  const markdown = useMemo(
    () => (isCandidateSet ? '' : artifactToMarkdown(artifact)),
    [artifact, isCandidateSet],
  );
  const isEmpty = isCandidateSet ? candidates.length === 0 : markdown.trim() === '';

  const workbook = useMemo(() => readWorkbook(artifact.payload), [artifact]);
  const workbookManifest = useMemo<WorkbookManifest | null>(
    () => (artifact.stage === 3 ? readWorkbookManifest(artifact.payload) : null),
    [artifact],
  );
  const note = stageNote(artifact);

  const download = () =>
    downloadText(artifactFilename(artifact), artifactToMarkdownDocument(artifact));

  const downloadWorkbook = () => {
    if (!workbook) return;
    const fallback =
      artifactFilename(artifact).replace(/\.md$/i, '').trim() || `stage-${artifact.stage}`;
    const name = workbook.filename || `${fallback}.xlsx`;
    downloadBase64(name, workbook.base64, XLSX_MIME);
  };

  // The candidate-set recap gets a DISTINCT section id + heading so it never
  // collides with the niche_brief's `#stage-1` anchor (both are stage 1).
  const sectionId = isCandidateSet ? `stage-${artifact.stage}-considered` : `stage-${artifact.stage}`;
  const heading = isCandidateSet ? 'Niches considered' : sectionLabel(artifact.stage);
  const blurb = isCandidateSet
    ? 'Every niche the factory scored at Stage 1 — and the one that was picked to build.'
    : v.blurb;

  return (
    <section
      id={sectionId}
      aria-labelledby={`${sectionId}-h`}
      className="scroll-mt-24 overflow-hidden rounded-xl bg-brand-surface shadow-sm ring-1 ring-brand-line"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-line-soft px-6 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary"
            aria-hidden="true"
          >
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-primary">
              Stage {artifact.stage}
            </p>
            <h2
              id={`${sectionId}-h`}
              className="text-lg font-bold tracking-tight text-brand-accent"
            >
              {heading}
            </h2>
            {blurb && <p className="mt-0.5 text-[13px] leading-snug text-brand-dark/60">{blurb}</p>}
          </div>
        </div>
        {/* The candidate recap has no .md download — its honest export is JSON,
            which is exactly what we removed from the read view. The chosen-niche
            brief carries the downloadable Stage-1 record. */}
        {!isEmpty && !isCandidateSet && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {workbook && (
              <span className="inline-flex items-center rounded-full bg-brand-tint px-2 py-0.5 text-[11px] font-medium text-brand-primary">
                {workbook.sheetNames.length} {workbook.sheetNames.length === 1 ? 'tab' : 'tabs'} · live
                formulas
              </span>
            )}
            <button
              type="button"
              onClick={download}
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand-line bg-white px-3 py-1.5 text-xs font-semibold text-brand-dark/70 shadow-sm transition-colors hover:bg-brand-light hover:text-brand-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
            >
              <FileText className="h-3.5 w-3.5" />
              .md
            </button>
            {workbook && (
              <button
                type="button"
                onClick={downloadWorkbook}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-sm transition-colors hover:bg-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                .xlsx
              </button>
            )}
          </div>
        )}
      </header>

      <div className="px-6 py-5">
        {note && !isCandidateSet && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <p className="text-sm text-amber-800">{note}</p>
          </div>
        )}
        {/* Stage-3 workbook gate-lens (spec §5.4 — kept surfaced on stage 3). */}
        {workbookManifest && <WorkbookLens manifest={workbookManifest} />}
        {isCandidateSet ? (
          <NicheConsideredRecap candidates={candidates} chosenNiche={chosenNiche} />
        ) : isEmpty ? (
          <p className="text-sm italic text-brand-dark/45">This stage produced no readable content.</p>
        ) : (
          <article className={cn(workbookManifest && 'mt-4')}>
            <h3 className="sr-only">{artifactTitle(artifact)}</h3>
            <Markdown source={markdown} />
          </article>
        )}
      </div>
    </section>
  );
}

/* ── Right: PERMANENT Competitor Scan sidebar (spec §5.5) ─────────────────── */

/**
 * The Competitor Scan as a PERMANENT page sidebar. This is the hard requirement:
 * the scan is ALWAYS rendered on the detail view — Top Competitors, Our Edge, and
 * an always-on "Read the full Sparring Debate" expander. When the scan hasn't run
 * (Stage 4 not reached / older run), the region still renders with locked headers
 * and an honest placeholder, so the panel is discoverable from day one — it is
 * never hidden behind a click or returned to a drawer.
 */
function CompetitorScanSidebar({ scan }: { scan: CompetitorScan | null }) {
  const [debateOpen, setDebateOpen] = useState(false);

  const tier = scan ? getTier(scan.confidence) : null;
  const hasDebate = !!scan && (scan.rounds.length > 0 || scan.redTeamChallenges.length > 0 || scan.whereCompetitorsAreStronger.length > 0);

  return (
    <section
      aria-labelledby="competitor-scan-h"
      className="space-y-4 rounded-xl bg-brand-surface p-5 shadow-sm ring-1 ring-brand-line"
    >
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <span
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-primary text-white"
          aria-hidden="true"
        >
          <Swords className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id="competitor-scan-h" className="text-sm font-semibold text-brand-accent">
            Competitor Scan
          </h3>
        </div>
        {scan && tier && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-brand-primary/10 px-2 py-0.5 text-xs font-bold text-brand-primary"
            title={`Edge confidence ${scan.confidence}/100`}
            aria-label={`Edge confidence ${scan.confidence} out of 100`}
          >
            <span className="tabular-nums">{scan.confidence}</span>
            <span className="text-[10px] font-semibold uppercase opacity-80">conf</span>
          </span>
        )}
      </div>

      {!scan ? (
        /* Honest absent state — region still discoverable, locked headers shown. */
        <div className="space-y-4">
          <div className="rounded-lg border border-dashed border-brand-line bg-brand-light/60 px-4 py-5 text-center">
            <Swords className="mx-auto mb-2 h-6 w-6 text-brand-primary/40" aria-hidden="true" />
            <p className="text-sm font-medium text-brand-accent">No competitor scan yet</p>
            <p className="mt-1 text-xs leading-snug text-brand-muted">
              The competitor scan runs at Stage&nbsp;4 — Beat Competitors. It will appear here
              automatically.
            </p>
          </div>
          <LockedRegion label="Top Competitors" />
          <LockedRegion label="Our Edge" />
          <div className="rounded-lg bg-brand-light px-4 py-3 text-left text-sm font-semibold text-brand-dark/40">
            Read the full Sparring Debate
            <span className="mt-0.5 block text-[11px] font-normal text-brand-muted">
              Available once Stage 4 completes.
            </span>
          </div>
        </div>
      ) : (
        <>
          {/* 1. Top Competitors */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-primary">
              Top Competitors
            </p>
            {scan.competitors.length > 0 ? (
              <ul className="space-y-2">
                {scan.competitors.slice(0, 5).map((c, i) => {
                  // direct vs indirect: a priced, named offer reads as a direct rival.
                  const direct = !!c.priceRange;
                  const TagIcon = direct ? Target : CircleDot;
                  const offer =
                    c.whatTheyOffer || c.priceRange
                      ? [c.whatTheyOffer, c.priceRange].filter(Boolean).join(' · ')
                      : '';
                  const note = c.weaknesses[0] ?? c.strengths[0] ?? '';
                  return (
                    <li
                      key={`${c.name}-${i}`}
                      className="rounded-lg border border-brand-line bg-white p-2.5"
                    >
                      <div className="flex items-start gap-2">
                        <TagIcon
                          className={cn(
                            'mt-0.5 h-3.5 w-3.5 shrink-0',
                            direct ? 'text-brand-primary' : 'text-brand-muted',
                          )}
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold text-brand-accent">{c.name}</p>
                          {offer && (
                            <p className="mt-0.5 line-clamp-1 text-[11px] text-brand-muted">{offer}</p>
                          )}
                          {note && (
                            <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-brand-dark/60">
                              {note}
                            </p>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-xs italic text-brand-muted">No named competitors surfaced.</p>
            )}
          </div>

          {/* 2. Our Edge */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-primary">
              Our Edge
            </p>
            {scan.edgeThesis ? (
              <div className="rounded-lg bg-brand-tint p-3">
                <p className="flex items-start gap-1.5 text-sm font-medium leading-snug text-brand-accent">
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-primary" aria-hidden="true" />
                  {scan.edgeThesis}
                </p>
              </div>
            ) : (
              <p className="text-xs italic text-brand-muted">No edge thesis recorded.</p>
            )}
            {scan.whereCompetitorsAreStronger.length > 0 && (
              <p className="mt-2 text-[11px] leading-snug text-brand-muted">
                <span className="font-semibold">Where they&apos;re stronger:</span>{' '}
                {scan.whereCompetitorsAreStronger.slice(0, 2).join('; ')}
              </p>
            )}
          </div>

          {/* 3. Read the full Sparring Debate — always-present expander */}
          <div>
            <button
              type="button"
              onClick={() => setDebateOpen((v) => !v)}
              aria-expanded={debateOpen}
              disabled={!hasDebate}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg bg-brand-light px-4 py-3 text-left font-semibold text-brand-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40',
                hasDebate ? 'hover:bg-brand-tint' : 'cursor-default opacity-70',
              )}
            >
              <span className="flex-1">
                Read the full Sparring Debate
                <span className="mt-0.5 block text-[11px] font-normal text-brand-muted">
                  Red Team vs. Edge Strategist
                </span>
              </span>
              {hasDebate && (
                <ChevronDown
                  className={cn(
                    'h-4 w-4 shrink-0 text-brand-dark/40 transition-transform motion-safe:duration-200',
                    debateOpen && 'rotate-180',
                  )}
                  aria-hidden="true"
                />
              )}
            </button>
            {debateOpen && hasDebate && (
              <div className="mt-3 space-y-3">
                {scan.redTeamChallenges.length > 0 && (
                  <DebateList
                    label="Challenges the edge answered"
                    tone="amber"
                    items={scan.redTeamChallenges}
                  />
                )}
                {scan.whereCompetitorsAreStronger.length > 0 && (
                  <DebateList
                    label="Where competitors are honestly stronger"
                    tone="rose"
                    items={scan.whereCompetitorsAreStronger}
                  />
                )}
                {scan.rounds.length > 0 && (
                  <ol className="space-y-2.5">
                    {scan.rounds.map((r, i) => (
                      <li
                        key={`${r.round}-${i}`}
                        className="rounded-lg border border-brand-line bg-brand-light/50 p-3"
                      >
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-muted">
                          Round {r.round}
                        </p>
                        {r.edge.thesis && (
                          <div className="rounded-md border-l-2 border-emerald-300 bg-white px-2.5 py-1.5">
                            <p className="text-[10px] font-semibold uppercase text-emerald-700">Edge</p>
                            <p className="mt-0.5 text-[11px] leading-snug text-brand-dark/75">
                              {r.edge.thesis}
                            </p>
                          </div>
                        )}
                        {r.redTeam.challenges.length > 0 && (
                          <div className="mt-1.5 rounded-md border-l-2 border-rose-300 bg-white px-2.5 py-1.5">
                            <p className="text-[10px] font-semibold uppercase text-rose-700">Red team</p>
                            <ul className="mt-0.5 space-y-0.5">
                              {r.redTeam.challenges.map((c, j) => (
                                <li key={j} className="text-[11px] leading-snug text-rose-800/85">
                                  → {c}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function LockedRegion({ label }: { label: string }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-muted">
        {label}
      </p>
      <div className="h-10 rounded-lg border border-dashed border-brand-line bg-brand-light/40" />
    </div>
  );
}

function DebateList({
  label,
  tone,
  items,
}: {
  label: string;
  tone: 'amber' | 'rose';
  items: string[];
}) {
  const toneCls =
    tone === 'amber'
      ? { head: 'text-amber-700', dot: 'bg-amber-400', text: 'text-amber-900/85' }
      : { head: 'text-rose-700', dot: 'bg-rose-400', text: 'text-rose-900/85' };
  return (
    <div>
      <p className={cn('text-[11px] font-semibold', toneCls.head)}>{label}</p>
      <ul className="mt-1 space-y-1">
        {items.map((item, i) => (
          <li key={i} className={cn('flex gap-2 text-[11px] leading-snug', toneCls.text)}>
            <span className={cn('mt-1.5 h-1 w-1 shrink-0 rounded-full', toneCls.dot)} aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Stage-3 Workbook gate-lens (kept surfaced on stage 3, spec §5.4) ─────── */

function WorkbookLens({ manifest }: { manifest: WorkbookManifest }) {
  const [open, setOpen] = useState(false);
  const { formulaCount, sheetCount, samples } = manifest;
  const audited = formulaCount > 0;
  const hasSamples = samples.length > 0;

  const sheetLabel = `${sheetCount} ${sheetCount === 1 ? 'sheet' : 'sheets'}`;
  const cellLabel = `${formulaCount} ${formulaCount === 1 ? 'formula cell' : 'formula cells'}`;

  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2.5',
        audited ? 'border-emerald-200 bg-emerald-50/70' : 'border-amber-300 bg-amber-50',
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className={cn(
            'mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md',
            audited ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700',
          )}
          aria-hidden="true"
        >
          {audited ? (
            <FileSpreadsheet className="h-3 w-3" strokeWidth={2.5} />
          ) : (
            <AlertCircle className="h-3 w-3" strokeWidth={2.5} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'text-[11px] font-semibold uppercase tracking-[0.1em]',
              audited ? 'text-emerald-700' : 'text-amber-700',
            )}
          >
            {audited ? 'Spreadsheet audited' : 'Spreadsheet flagged'}
          </p>
          {audited ? (
            <p className="mt-0.5 text-xs leading-snug text-brand-dark/65">
              Live formulas audited —{' '}
              <strong className="font-semibold text-emerald-700">{cellLabel}</strong> across{' '}
              {sheetLabel}.
            </p>
          ) : (
            <p className="mt-0.5 text-xs leading-snug text-amber-800">
              <strong className="font-semibold">0 live-formula cells</strong> in a computational
              workbook across {sheetLabel} — this should have failed the gate.
            </p>
          )}

          {audited && hasSamples && (
            <>
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className="mt-1.5 inline-flex items-center gap-1 rounded text-[11px] font-semibold text-emerald-700 transition-colors hover:text-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
              >
                {open ? 'Hide' : 'Show'} {samples.length === 1 ? 'sample formula' : 'sample formulas'}
              </button>
              {open && (
                <ul className="mt-1.5 space-y-1">
                  {samples.slice(0, 3).map((s, i) => (
                    <li
                      key={`${s.sheet}-${s.cell}-${i}`}
                      className="rounded bg-white/70 px-2 py-1 font-mono text-[11px] leading-snug text-brand-dark/70"
                    >
                      <span className="text-brand-dark/45">
                        {s.sheet}
                        {s.cell ? `!${s.cell}` : ''}
                      </span>{' '}
                      <span className="text-emerald-700">{s.formula}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Gate Verdicts drawer (reuses the 3-expert gate-log UI) ───────────────── */

/**
 * The per-stage 3-expert verdict drawer the action-bar "Show Gate Verdicts"
 * button opens. Mirrors the RunDetail gate-log layout (round1 PASS/FAIL +
 * round2 challenges) but reads the gate logs the ProjectView fetched from the
 * existing GET /api/factory/runs/:id endpoint — no new API.
 */
function GateVerdictsDrawer({
  loading,
  error,
  gateLogs,
  onClose,
}: {
  loading: boolean;
  error: string | null;
  gateLogs: GateLog[] | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const byStage = useMemo(() => {
    const groups = new Map<number, GateLog[]>();
    for (const log of gateLogs ?? []) {
      const arr = groups.get(log.stage) ?? [];
      arr.push(log);
      groups.set(log.stage, arr);
    }
    return [...groups.entries()].sort((a, b) => a[0] - b[0]);
  }, [gateLogs]);

  return (
    <div
      data-print-hide
      className="fixed inset-0 z-40 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Gate verdicts"
    >
      <button
        type="button"
        aria-label="Close gate verdicts"
        className="absolute inset-0 bg-brand-dark/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative flex h-full w-full max-w-md flex-col bg-brand-canvas shadow-2xl motion-safe:animate-in motion-safe:slide-in-from-right motion-safe:duration-300">
        <header className="flex items-center justify-between gap-3 border-b border-brand-line bg-brand-surface px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary"
              aria-hidden="true"
            >
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-brand-accent">Gate verdicts</h2>
              <p className="text-[11px] text-brand-muted">3-expert review, per stage</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-brand-dark/40 transition-colors hover:bg-brand-line-soft hover:text-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-brand-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading verdicts…
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-4 py-10 text-center">
              <AlertCircle className="mb-2 h-7 w-7 text-rose-400" />
              <p className="text-sm font-semibold text-rose-800">{error}</p>
            </div>
          ) : byStage.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-brand-line bg-brand-surface px-4 py-12 text-center">
              <ShieldCheck className="mb-2 h-7 w-7 text-brand-primary/40" />
              <p className="text-sm font-semibold text-brand-accent">No gate verdicts yet</p>
              <p className="mt-1 text-xs text-brand-muted">
                Verdicts appear as each stage passes its 3-expert review.
              </p>
            </div>
          ) : (
            byStage.map(([stageN, logs]) => (
              <section key={stageN}>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-primary">
                  Stage {stageN} · {sectionLabel(stageN)}
                </h3>
                <div className="space-y-3">
                  {logs.map((log) => (
                    <GateLogBlock key={log.id} log={log} />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function GateLogBlock({ log }: { log: GateLog }) {
  const resolutionTone =
    log.resolution === 'pass'
      ? 'text-emerald-700'
      : log.resolution === 'escalate'
        ? 'text-rose-700'
        : 'text-amber-700';

  return (
    <div className="rounded-xl bg-brand-surface p-3.5 shadow-sm ring-1 ring-brand-line">
      <div className="mb-2 flex items-center gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5 text-brand-primary" aria-hidden="true" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-primary">
          3-expert gate · loop {log.loop}
        </span>
        <span className={cn('ml-auto text-[11px] font-semibold capitalize', resolutionTone)}>
          {log.resolution}
        </span>
      </div>
      <ul className="space-y-1.5">
        {(Array.isArray(log.round1) ? log.round1 : []).map((v, i) => (
          <VerdictRow
            key={`${v.expert}-${i}`}
            verdict={v}
            challenge={findChallenge(log.round2, v.expert)}
          />
        ))}
      </ul>
    </div>
  );
}

function findChallenge(round2: Challenge[] | undefined, expert: string): Challenge | undefined {
  if (!Array.isArray(round2)) return undefined;
  return round2.find((c) => c.expert === expert);
}

function VerdictRow({ verdict, challenge }: { verdict: Verdict; challenge?: Challenge }) {
  const effective = challenge?.revisedVerdict ?? verdict.verdict;
  const pass = effective === 'PASS';
  return (
    <li className="flex gap-2 rounded-lg bg-brand-light/60 px-2.5 py-2">
      <span
        className={cn(
          'mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
          pass ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700',
        )}
        aria-hidden="true"
      >
        {pass ? (
          <Check className="h-2.5 w-2.5" strokeWidth={3} />
        ) : (
          <CircleSlash className="h-2.5 w-2.5" strokeWidth={3} />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-brand-accent">
          {verdict.expert}
          <span className={cn('ml-1.5 font-medium', pass ? 'text-emerald-600' : 'text-rose-600')}>
            · {effective}
          </span>
          {challenge?.revisedVerdict && challenge.revisedVerdict !== verdict.verdict && (
            <span className="ml-1 text-[10px] font-normal text-brand-dark/40">
              (revised in round 2)
            </span>
          )}
        </p>
        {verdict.reasons?.length > 0 && (
          <p className="mt-0.5 text-[11px] leading-snug text-brand-dark/60">
            {verdict.reasons.join(' · ')}
          </p>
        )}
        {!pass && verdict.deltas?.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {verdict.deltas.map((d, i) => (
              <li key={i} className="text-[11px] leading-snug text-rose-700/90">
                → {d}
              </li>
            ))}
          </ul>
        )}
        {challenge?.note && (
          <p className="mt-1 text-[11px] italic leading-snug text-brand-dark/45">
            R2: {challenge.note}
          </p>
        )}
      </div>
    </li>
  );
}

/* ── Loading skeleton ─────────────────────────────────────────────────────── */

function ProjectSkeleton() {
  return (
    <div className="grid grid-cols-12 gap-6" aria-hidden="true">
      <div className="col-span-12 lg:col-span-2">
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded-lg bg-brand-line-soft" />
          ))}
        </div>
      </div>
      <div className="col-span-12 space-y-6 lg:col-span-7">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-brand-surface p-6 shadow-sm ring-1 ring-brand-line">
            <div className="mb-4 flex items-center gap-3">
              <div className="h-9 w-9 animate-pulse rounded-lg bg-brand-line-soft" />
              <div className="h-5 w-48 animate-pulse rounded bg-brand-line-soft" />
            </div>
            <div className="space-y-2">
              <div className="h-4 w-full animate-pulse rounded bg-brand-line-soft" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-brand-line-soft" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-brand-line-soft" />
            </div>
          </div>
        ))}
      </div>
      <div className="col-span-12 lg:col-span-3">
        <div className="rounded-xl bg-brand-surface p-5 shadow-sm ring-1 ring-brand-line">
          <div className="mb-4 h-6 w-40 animate-pulse rounded bg-brand-line-soft" />
          <div className="space-y-2.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-brand-line-soft" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
