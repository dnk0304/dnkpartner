'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  X,
  Check,
  CircleSlash,
  ShieldCheck,
  Loader2,
  AlertTriangle,
  Info,
  Play,
  ThumbsUp,
  FileText,
} from 'lucide-react';
import { cn } from '../_lib/cn';
import {
  ACTIVE_STAGES,
  deriveCardState,
  extractScoredAngles,
  TOTAL_STAGES,
  type RunDetail as RunDetailData,
  type GateLog,
  type Verdict,
  type Challenge,
} from '../_lib/types';
import { StatusChip } from './StatusChip';
import { ScoredRanking } from './ScoredRanking';
import { ProgressBar } from './ProgressBar';

/**
 * RunDetail — the card → open surface. A right-side drawer that polls
 * GET /api/factory/runs/:id while the run is non-terminal and renders:
 *   1. the 8-stage pipeline with each stage's honest state,
 *   2. the scored-ranking leaderboard (dnk-trends ranking on the niche-brief
 *      angles),
 *   3. per-stage 3-expert gate verdicts (round1 PASS/FAIL + round2 challenges),
 *   4. the human-gate approve card (Resume / Approve / Reject) → POST .../gate
 *      or .../tick.
 */
export function RunDetail({
  detail,
  refreshing,
  onClose,
  onAction,
}: {
  detail: RunDetailData;
  refreshing: boolean;
  onClose: () => void;
  /** Fires after a successful gate/tick so the workspace re-polls immediately. */
  onAction: () => void;
}) {
  const mounted = typeof document !== 'undefined';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!mounted) return null;

  const state = deriveCardState(detail);
  const angles = extractScoredAngles(
    detail.artifacts.find((a) => a.kind === 'niche_brief') ??
      detail.artifacts.find((a) => a.stage === 1),
  );

  return createPortal(
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label={`${detail.seed} project detail`}>
      <button
        type="button"
        aria-label="Close detail"
        className="absolute inset-0 bg-brand-dark/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative flex h-full w-full max-w-2xl flex-col bg-brand-light/40 shadow-2xl motion-safe:animate-in motion-safe:slide-in-from-right motion-safe:duration-300">
        {/* Header */}
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-6 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-primary">
              Project
            </p>
            <h2 className="mt-0.5 truncate text-xl font-semibold text-brand-accent">{detail.seed}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusChip state={state} stage={detail.stage} gate={detail.pendingGate?.gate} />
              <span className="text-xs text-brand-dark/45">
                Stage {detail.stage} / {TOTAL_STAGES}
              </span>
              {refreshing && (
                <span className="inline-flex items-center gap-1 text-xs text-brand-dark/40">
                  <Loader2 className="h-3 w-3 animate-spin" /> live
                </span>
              )}
            </div>
            {/* Real progress bar — stage fill + live token-log liveness. */}
            <div className="mt-3">
              <ProgressBar run={detail} size="detail" />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-brand-dark/40 transition-colors hover:bg-slate-100 hover:text-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {/* Read the files — jump to the full readable project view. */}
          {detail.artifacts.length > 0 && (
            <Link
              href={`/factory/${detail.id}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-brand-primary/30 bg-brand-light/60 px-4 py-3 transition-colors hover:border-brand-primary/50 hover:bg-brand-light focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
            >
              <span className="flex items-center gap-2.5">
                <FileText className="h-5 w-5 text-brand-primary" />
                <span>
                  <span className="block text-sm font-semibold text-brand-accent">
                    Read &amp; download the files
                  </span>
                  <span className="block text-xs text-brand-dark/55">
                    Open the blueprint, product draft and every stage output.
                  </span>
                </span>
              </span>
              <span className="text-sm font-semibold text-brand-primary">Open →</span>
            </Link>
          )}

          {/* Escalation banner */}
          {state === 'escalated' && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3" role="alert">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
              <div>
                <p className="text-sm font-semibold text-rose-800">Needs Dennis — gate loop ceiling hit</p>
                <p className="mt-0.5 text-sm text-rose-700">
                  This run exhausted its automatic fix attempts on stage {detail.stage}. See the
                  blocking expert verdicts below.
                </p>
              </div>
            </div>
          )}

          {/* Human-gate action card */}
          {detail.pendingGate && (
            <GateActionCard detail={detail} onAction={onAction} />
          )}

          {/* Resume card. Shown for any running/stalled draft; the Resume button
              is greyed + non-clickable while the engine is actively processing
              (state === 'running'), enabled only once it's genuinely idle
              (state === 'draft_stalled'). */}
          {(state === 'running' || state === 'draft_stalled') && (
            <ResumeCard
              runId={detail.id}
              onAction={onAction}
              stage={detail.stage}
              processing={state === 'running'}
            />
          )}

          {/* Scored ranking leaderboard */}
          {angles.length > 0 && (
            <section aria-labelledby="ranking-h">
              <h3 id="ranking-h" className="mb-2.5 flex items-center gap-1.5 text-sm font-semibold text-brand-accent">
                Scored angles
              </h3>
              <ScoredRanking angles={angles} />
            </section>
          )}

          {/* Pipeline */}
          <section aria-labelledby="pipeline-h">
            <h3 id="pipeline-h" className="mb-2.5 text-sm font-semibold text-brand-accent">
              Pipeline
            </h3>
            <ol className="space-y-2.5">
              {ACTIVE_STAGES.map((s) => {
                const isCurrent = s.n === detail.stage;
                const isDone = s.n < detail.stage;
                const logs = detail.gateLogs.filter((g) => g.stage === s.n);
                return (
                  <li
                    key={s.n}
                    className={cn(
                      'rounded-xl border bg-white p-3.5 shadow-sm',
                      isCurrent ? 'border-brand-primary/40 ring-1 ring-brand-primary/20' : 'border-slate-200',
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={cn(
                          'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold',
                          isDone
                            ? 'bg-emerald-100 text-emerald-700'
                            : isCurrent
                              ? 'bg-brand-primary text-white'
                              : 'bg-slate-100 text-brand-dark/40',
                        )}
                        aria-hidden="true"
                      >
                        {isDone ? <Check className="h-4 w-4" strokeWidth={3} /> : s.n}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-brand-accent">{s.name}</p>
                        <p className="text-xs text-brand-dark/45">
                          {isDone ? 'Passed' : isCurrent ? 'Current stage' : 'Pending'}
                        </p>
                      </div>
                    </div>
                    {logs.length > 0 && (
                      <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
                        {logs.map((log) => (
                          <GateLogBlock key={log.id} log={log} />
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** One gate-loop's 3-expert round1 + round2 verdicts. */
function GateLogBlock({ log }: { log: GateLog }) {
  const resolutionTone =
    log.resolution === 'pass'
      ? 'text-emerald-700'
      : log.resolution === 'escalate'
        ? 'text-rose-700'
        : 'text-amber-700';

  return (
    <div>
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
          <VerdictRow key={`${v.expert}-${i}`} verdict={v} challenge={findChallenge(log.round2, v.expert)} />
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
    <li className="flex gap-2 rounded-lg bg-slate-50 px-2.5 py-2">
      <span
        className={cn(
          'mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
          pass ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700',
        )}
        aria-hidden="true"
      >
        {pass ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : <CircleSlash className="h-2.5 w-2.5" strokeWidth={3} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-brand-accent">
          {verdict.expert}
          <span className={cn('ml-1.5 font-medium', pass ? 'text-emerald-600' : 'text-rose-600')}>
            · {effective}
          </span>
          {challenge?.revisedVerdict && challenge.revisedVerdict !== verdict.verdict && (
            <span className="ml-1 text-[10px] font-normal text-brand-dark/40">(revised in round 2)</span>
          )}
        </p>
        {verdict.reasons?.length > 0 && (
          <p className="mt-0.5 text-[11px] leading-snug text-brand-dark/60">{verdict.reasons.join(' · ')}</p>
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

/** Human-gate approve/reject card → POST /api/factory/runs/:id/gate. */
function GateActionCard({ detail, onAction }: { detail: RunDetailData; onAction: () => void }) {
  const gate = detail.pendingGate!;
  const isPublish = gate.gate === 'publish';
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(choice: 'approve' | 'reject') {
    setBusy(choice);
    setError(null);
    try {
      const res = await fetch(`/api/factory/runs/${detail.id}/gate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gate: gate.gate, choice }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error?.message ?? `Gate ${choice} failed (${res.status}).`);
        setBusy(null);
        return;
      }
      onAction();
    } catch {
      setError('Network error.');
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-center gap-2">
        <ThumbsUp className="h-4 w-4 text-amber-600" />
        <h3 className="text-sm font-semibold text-amber-900">
          Waiting for you · {gate.gate} gate
        </h3>
      </div>
      <div className="mt-2 flex items-start gap-2 rounded-lg bg-white/70 px-3 py-2">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <p className="text-sm text-amber-800">{gate.message}</p>
      </div>
      {error && <p className="mt-2 text-sm text-rose-700">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => decide('approve')}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:opacity-50"
        >
          {busy === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {isPublish ? 'Approve & save draft' : 'Approve & continue'}
        </button>
        <button
          type="button"
          onClick={() => decide('reject')}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3.5 py-2 text-sm font-semibold text-amber-800 transition-colors hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 disabled:opacity-50"
        >
          {busy === 'reject' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CircleSlash className="h-4 w-4" />}
          Reject
        </button>
      </div>
    </div>
  );
}

/**
 * Resume a stopped draft → POST /api/factory/runs/:id/tick (advance one stage).
 * `processing` = the engine is actively working this stage; Resume is then
 * greyed + non-clickable (the server would reject a /tick anyway) and the copy
 * explains the run is still moving. Enabled only when the run is genuinely idle.
 */
function ResumeCard({
  runId,
  onAction,
  stage,
  processing,
}: {
  runId: string;
  onAction: () => void;
  stage: number;
  processing: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resume() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/factory/runs/${runId}/tick`, { method: 'POST' });
      if (!res.ok && res.status !== 409) {
        const data = await res.json().catch(() => ({}));
        setError(data.error?.message ?? `Resume failed (${res.status}).`);
        setBusy(false);
        return;
      }
      onAction();
      setBusy(false);
    } catch {
      setError('Network error.');
      setBusy(false);
    }
  }

  const disabled = busy || processing;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-brand-accent">
        {processing ? `Running · stage ${stage} in progress` : `Draft · stopped on stage ${stage}`}
      </h3>
      <p className="mt-1 text-sm text-brand-dark/60">
        {processing
          ? 'The engine is working this stage now — Resume unlocks once it goes idle.'
          : 'This run paused without finishing. Resume to advance it one stage.'}
      </p>
      {error && <p className="mt-2 text-sm text-rose-700">{error}</p>}
      <button
        type="button"
        onClick={resume}
        disabled={disabled}
        aria-disabled={disabled}
        title={processing ? 'Processing — Resume is available once the run is idle.' : undefined}
        className={cn(
          'mt-3 inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40',
          processing
            ? 'cursor-not-allowed bg-slate-100 text-brand-dark/35 shadow-none'
            : 'bg-brand-primary text-white hover:bg-brand-primary-hover disabled:opacity-50',
        )}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Play className="h-4 w-4" />
        )}
        {busy ? 'Resuming…' : processing ? 'Processing…' : 'Resume'}
      </button>
    </div>
  );
}
