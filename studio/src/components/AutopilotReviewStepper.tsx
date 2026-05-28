import { AlertTriangle, CheckCircle2 } from "lucide-react"
import { Button } from "./Button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./Card"
import { AutopilotChatDock } from "./AutopilotChatDock"

type DraftPackage = {
  packageId: string
  topic: string
  manager: { status: "ready" | "needs_attention"; score: number; topIssues: string[] }
}

type AutopilotRun = {
  runId: string
  source?: "manual" | "scheduled"
  status?: string
  createdAt?: number
  currentStep: string
  finalDeliverable?: {
    scriptDraft?: string
    durations?: number[]
    prompts?: string[]
    imageryPlan?: Array<{ scene: number; prompt: string; style: string }>
    videoPlan?: Array<{ scene: number; prompt: string; duration: number }>
    qaSummary?: string
  }
}

type RunHistoryItem = {
  runId: string
  topic: string
  status: string
  source: "manual" | "scheduled"
  currentStep: string
  createdAt: number
  updatedAt: number
  artifactCount: number
}

type RunArtifact = {
  id: string
  kind: string
  title: string
  mime: string
  summary?: string
  preview?: string
}

interface AutopilotReviewStepperProps {
  pkg: DraftPackage
  run: AutopilotRun | null
  schedule?: {
    enabled: boolean
    cron: string
    timezone: string
    maxConcurrentRuns: number
  }
  runHistory?: RunHistoryItem[]
  selectedRunId?: string
  artifacts?: RunArtifact[]
  isArtifactsLoading?: boolean
  onSelectRun?: (runId: string) => void
  onBack: () => void
  onRefresh: () => void
  onFixAndRecheck: () => void
  onApprove: () => void
  onSendToImageQueue?: (prompts: string[], runId?: string) => void
  onSendToVideoQueue?: (prompts: string[], durations?: number[], runId?: string) => void
}

const STEP_TITLES = [
  "Concept",
  "Outline + runtime",
  "Script",
  "Timing",
  "Scenes + prompt pack",
  "Storyboard images",
  "Video clips",
  "Manager QA",
  "Final approval",
]

export function AutopilotReviewStepper({
  pkg,
  run,
  schedule,
  runHistory = [],
  selectedRunId,
  artifacts = [],
  isArtifactsLoading,
  onSelectRun,
  onBack,
  onRefresh,
  onFixAndRecheck,
  onApprove,
  onSendToImageQueue,
  onSendToVideoQueue,
}: AutopilotReviewStepperProps) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-10 gap-4">
      <div className="xl:col-span-7 space-y-4">
        <Card className={pkg.manager.status === "needs_attention" ? "border-amber-400/50" : "border-emerald-500/40"}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {pkg.manager.status === "needs_attention" ? (
                <AlertTriangle className="w-4 h-4 text-amber-400" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              )}
              Manager {pkg.manager.status === "needs_attention" ? "Needs Attention" : "Ready"}
            </CardTitle>
            <CardDescription>
              Score {pkg.manager.score}/100{pkg.manager.topIssues.length ? ` - ${pkg.manager.topIssues.join(" | ")}` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={onBack}>Back to Inbox</Button>
            <Button variant="secondary" onClick={onRefresh}>Refresh</Button>
            <Button variant="outline" onClick={onFixAndRecheck}>FixAndRecheck</Button>
            <Button onClick={onApprove}>Approve</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{pkg.topic}</CardTitle>
            <CardDescription>Playful review stepper</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="rounded-md border border-[var(--color-border)] p-3 bg-[var(--color-surface)] space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">Map Context</p>
                <span className="text-xs rounded border border-[var(--color-border)] px-2 py-0.5">
                  Schedule {schedule?.enabled ? "enabled" : "disabled"}
                </span>
                <span className="text-xs rounded border border-[var(--color-border)] px-2 py-0.5">
                  Cron {schedule?.cron || "-"}
                </span>
                <span className="text-xs rounded border border-[var(--color-border)] px-2 py-0.5">
                  TZ {schedule?.timezone || "-"}
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                <label className="text-xs text-[var(--color-text-muted)] flex flex-col gap-1">
                  Run history
                  <select
                    className="h-9 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] px-2 text-sm"
                    value={selectedRunId || run?.runId || ""}
                    onChange={(event) => onSelectRun?.(event.target.value)}
                  >
                    <option value="">Select run</option>
                    {runHistory.map((item) => (
                      <option key={item.runId} value={item.runId}>
                        {item.source === "scheduled" ? "[Scheduled]" : "[Manual]"} {new Date(item.createdAt).toLocaleString()} ({item.artifactCount} artifacts)
                      </option>
                    ))}
                  </select>
                </label>
                <div className="text-xs text-[var(--color-text-muted)] flex items-end">
                  Current: {run?.source === "scheduled" ? "Scheduled run" : "Manual run"} · Step {run?.currentStep || "-"}
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium">Scheduled-run artifacts</p>
                {isArtifactsLoading ? (
                  <p className="text-xs text-[var(--color-text-muted)]">Loading artifacts...</p>
                ) : artifacts.length > 0 ? (
                  <div className="grid grid-cols-1 gap-2">
                    {artifacts.map((artifact) => (
                      <div key={artifact.id} className="rounded border border-[var(--color-border)] p-2">
                        <p className="text-xs font-medium">{artifact.title}</p>
                        <p className="text-[11px] text-[var(--color-text-muted)]">
                          {artifact.kind} · {artifact.mime}{artifact.summary ? ` · ${artifact.summary}` : ""}
                        </p>
                        {artifact.preview ? (
                          <p className="text-[11px] text-[var(--color-text-muted)] mt-1 line-clamp-2">{artifact.preview}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[var(--color-text-muted)]">No artifacts surfaced for this run yet.</p>
                )}
              </div>
            </div>

            {STEP_TITLES.map((title, index) => (
              <div
                key={title}
                className="rounded-md border border-[var(--color-border)] p-3 bg-[var(--color-surface)]"
              >
                <p className="text-sm font-medium">{index + 1}. {title}</p>
                {title === "Script" && run?.finalDeliverable?.scriptDraft ? (
                  <p className="text-xs text-[var(--color-text-muted)] mt-1 line-clamp-4">
                    {run.finalDeliverable.scriptDraft}
                  </p>
                ) : null}
                {title === "Timing" && run?.finalDeliverable?.durations?.length ? (
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">
                    {run.finalDeliverable.durations.map((d, idx) => `S${idx + 1}: ${d}s`).join(" | ")}
                  </p>
                ) : null}
                {title === "Manager QA" && run?.finalDeliverable?.qaSummary ? (
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">{run.finalDeliverable.qaSummary}</p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="xl:col-span-3">
        <AutopilotChatDock
          packageId={pkg.packageId}
          runId={run?.runId}
          prompts={run?.finalDeliverable?.prompts}
          durations={run?.finalDeliverable?.durations}
          onActionComplete={onRefresh}
          onSendToImageQueue={(prompts) => onSendToImageQueue?.(prompts, run?.runId)}
          onSendToVideoQueue={(prompts, durations) => onSendToVideoQueue?.(prompts, durations, run?.runId)}
        />
      </div>
    </div>
  )
}
