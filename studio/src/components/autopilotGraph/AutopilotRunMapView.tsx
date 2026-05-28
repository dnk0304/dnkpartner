import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, CheckCircle2, Clock3, Download, Loader2, RefreshCw } from "lucide-react"
import { Button } from "../Button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../Card"

type StepStatus = "pending" | "processing" | "awaiting_approval" | "completed" | "failed" | "skipped"

type AutopilotStep = {
  id: string
  title: string
  status: StepStatus
  startedAt?: number
  completedAt?: number
  output?: Record<string, unknown>
  error?: string
}

type AutopilotRun = {
  runId: string
  currentStep: string
  steps?: AutopilotStep[]
  finalDeliverable?: {
    summary?: string
    scriptDraft?: string
    prompts?: string[]
    durations?: number[]
    imageryPlan?: Array<{ scene: number; prompt: string; style: string }>
    videoPlan?: Array<{ scene: number; prompt: string; duration: number }>
    qaSummary?: string
  }
}

type NodeRunStatus = "pending" | "blocked" | "running" | "needs_approval" | "completed" | "failed" | "skipped"

type ArtifactRef = {
  artifactId: string
  nodeId: string
  kind: string
  title: string
  mime: string
  relPath?: string
  previewText?: string
  previewJson?: unknown
}

type RunGraphNode = {
  id: string
  type: string
  title: string
  status: NodeRunStatus
  startedAt?: number
  completedAt?: number
  error?: { message: string }
  outputs?: Record<string, unknown>
  artifacts: ArtifactRef[]
}

type RunGraph = {
  runId: string
  source?: "manual" | "scheduled"
  nodes: RunGraphNode[]
  edges: Array<{
    id: string
    from: { nodeId: string; portId: string }
    to: { nodeId: string; portId: string }
  }>
}

type PreviewPayload = {
  text: string
  mime: string
}

interface AutopilotRunMapViewProps {
  run: AutopilotRun | null
  projectId?: string
  onRefresh?: () => void
}

function mapStepStatusToNodeStatus(status: StepStatus): NodeRunStatus {
  if (status === "processing") return "running"
  if (status === "awaiting_approval") return "needs_approval"
  return status
}

function createArtifactId(nodeId: string, key: string): string {
  return `${nodeId}:${key}`
}

function buildStepArtifacts(step: AutopilotStep, run: AutopilotRun): ArtifactRef[] {
  const nodeId = step.id
  const output = step.output || {}
  const artifacts: ArtifactRef[] = []

  if (typeof output.scriptDraft === "string" && output.scriptDraft.trim()) {
    artifacts.push({
      artifactId: createArtifactId(nodeId, "script"),
      nodeId,
      kind: "scriptDraft",
      title: "script.md",
      mime: "text/markdown",
      previewText: output.scriptDraft,
    })
  }
  if (Array.isArray(output.prompts) && output.prompts.length > 0) {
    artifacts.push({
      artifactId: createArtifactId(nodeId, "prompts"),
      nodeId,
      kind: "promptPack",
      title: "prompt_pack.json",
      mime: "application/json",
      previewJson: {
        prompts: output.prompts,
        durations: output.durations,
      },
    })
  }
  if (Array.isArray(output.imageryPlan) && output.imageryPlan.length > 0) {
    artifacts.push({
      artifactId: createArtifactId(nodeId, "imagery"),
      nodeId,
      kind: "storyboardPlan",
      title: "storyboard_plan.json",
      mime: "application/json",
      previewJson: output.imageryPlan,
    })
  }
  if (Array.isArray(output.videoPlan) && output.videoPlan.length > 0) {
    artifacts.push({
      artifactId: createArtifactId(nodeId, "video"),
      nodeId,
      kind: "videoPlan",
      title: "video_plan.json",
      mime: "application/json",
      previewJson: output.videoPlan,
    })
  }
  if (typeof output.summary === "string" && output.summary.trim()) {
    artifacts.push({
      artifactId: createArtifactId(nodeId, "summary"),
      nodeId,
      kind: "qaReport",
      title: "run_summary.md",
      mime: "text/markdown",
      previewText: output.summary,
    })
  }

  if (step.id === "quality_gate" && run.finalDeliverable?.qaSummary) {
    artifacts.push({
      artifactId: createArtifactId(nodeId, "qa"),
      nodeId,
      kind: "qaReport",
      title: "qa_report.md",
      mime: "text/markdown",
      previewText: run.finalDeliverable.qaSummary,
    })
  }

  return artifacts
}

function fallbackGraphFromRun(run: AutopilotRun): RunGraph {
  const steps = Array.isArray(run.steps) ? run.steps : []
  const nodes: RunGraphNode[] = steps.map((step) => ({
    id: step.id,
    type: step.id,
    title: step.title || step.id,
    status: mapStepStatusToNodeStatus(step.status),
    startedAt: step.startedAt,
    completedAt: step.completedAt,
    error: step.error ? { message: step.error } : undefined,
    outputs: step.output,
    artifacts: buildStepArtifacts(step, run),
  }))

  const edges = nodes.slice(0, -1).map((node, index) => ({
    id: `edge-${node.id}-${nodes[index + 1].id}`,
    from: { nodeId: node.id, portId: "out" },
    to: { nodeId: nodes[index + 1].id, portId: "in" },
  }))

  return {
    runId: run.runId,
    nodes,
    edges,
  }
}

function getStatusTone(status: NodeRunStatus): string {
  if (status === "completed") return "text-emerald-300 border-emerald-400/60 bg-emerald-500/10"
  if (status === "failed") return "text-red-300 border-red-400/60 bg-red-500/10"
  if (status === "running") return "text-sky-300 border-sky-400/60 bg-sky-500/10"
  if (status === "needs_approval") return "text-amber-300 border-amber-400/60 bg-amber-500/10"
  if (status === "skipped") return "text-zinc-300 border-zinc-400/60 bg-zinc-500/10"
  return "text-zinc-300 border-zinc-500/60 bg-zinc-500/10"
}

function formatTs(ts?: number): string {
  if (!ts) return "-"
  return new Date(ts).toLocaleString()
}

export function AutopilotRunMapView({ run, projectId, onRefresh }: AutopilotRunMapViewProps) {
  const [graph, setGraph] = useState<RunGraph | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactRef | null>(null)
  const [preview, setPreview] = useState<PreviewPayload | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadGraph() {
      setSelectedArtifact(null)
      setPreview(null)
      if (!run?.runId) {
        setGraph(null)
        return
      }
      setLoading(true)
      setError("")
      try {
        const graphResponse = await fetch(`/api/autopilot/graphs/runs/${run.runId}`)
        if (graphResponse.ok) {
          const data = await graphResponse.json()
          if (!cancelled) {
            setGraph(data as RunGraph)
          }
          return
        }
        if (!cancelled) {
          setGraph(fallbackGraphFromRun(run))
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load map")
          setGraph(fallbackGraphFromRun(run))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadGraph().catch((loadError) => {
      if (!cancelled) {
        setLoading(false)
        setError(loadError instanceof Error ? loadError.message : "Failed to load map")
      }
    })

    return () => {
      cancelled = true
    }
  }, [run])

  const nodeCountLabel = useMemo(() => {
    if (!graph) return "No nodes"
    return `${graph.nodes.length} node${graph.nodes.length === 1 ? "" : "s"}`
  }, [graph])

  const openArtifact = async (artifact: ArtifactRef) => {
    setSelectedArtifact(artifact)
    if (artifact.previewText) {
      setPreview({ text: artifact.previewText, mime: artifact.mime || "text/plain" })
      return
    }
    if (artifact.previewJson !== undefined) {
      setPreview({ text: JSON.stringify(artifact.previewJson, null, 2), mime: "application/json" })
      return
    }
    if (!artifact.relPath || !projectId) {
      setPreview({ text: "No preview is available for this artifact yet.", mime: "text/plain" })
      return
    }
    setPreviewLoading(true)
    try {
      const query = new URLSearchParams({
        projectId,
        relPath: artifact.relPath,
      })
      const response = await fetch(`/api/autopilot/artifacts/preview?${query.toString()}`)
      if (!response.ok) {
        const fallbackMessage = await response.text().catch(() => "")
        throw new Error(fallbackMessage || "Preview request failed")
      }
      const contentType = response.headers.get("content-type") || "text/plain"
      if (contentType.includes("application/json")) {
        const payload = await response.json().catch(() => null) as { content?: string; mime?: string } | null
        if (payload && typeof payload.content === "string") {
          setPreview({ text: payload.content, mime: payload.mime || contentType })
          return
        }
      }
      const text = await response.text()
      setPreview({ text, mime: contentType })
    } catch (previewError) {
      setPreview({
        text: previewError instanceof Error ? previewError.message : "Failed to load artifact preview.",
        mime: "text/plain",
      })
    } finally {
      setPreviewLoading(false)
    }
  }

  const downloadArtifact = (artifact: ArtifactRef) => {
    if (!artifact.relPath || !projectId) return
    const query = new URLSearchParams({
      projectId,
      relPath: artifact.relPath,
    })
    window.open(`/api/autopilot/artifacts/download?${query.toString()}`, "_blank", "noopener,noreferrer")
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workflow Map (Read-only)</CardTitle>
          <CardDescription>
            {run ? `Run ${run.runId} · ${nodeCountLabel}` : "Select a run to view graph state and artifacts."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onRefresh}>
              <RefreshCw className="w-4 h-4" />
              Refresh
            </Button>
            {loading ? (
              <span className="text-xs text-[var(--color-text-muted)] inline-flex items-center gap-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Loading map...
              </span>
            ) : null}
            {error ? <span className="text-xs text-red-300">{error}</span> : null}
          </div>

          {!graph || graph.nodes.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">No graph data available yet for this run.</p>
          ) : (
            <>
              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-xs text-[var(--color-text-muted)]">
                Flow: {graph.nodes.map((node) => node.title).join(" -> ")}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {graph.nodes.map((node) => (
                  <div
                    key={node.id}
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{node.title}</p>
                        <p className="text-xs text-[var(--color-text-muted)]">{node.type}</p>
                      </div>
                      <span className={`text-[11px] px-2 py-1 rounded border ${getStatusTone(node.status)}`}>
                        {node.status}
                      </span>
                    </div>
                    <div className="text-xs text-[var(--color-text-muted)] space-y-1">
                      <p className="inline-flex items-center gap-1">
                        <Clock3 className="w-3.5 h-3.5" />
                        Start: {formatTs(node.startedAt)}
                      </p>
                      <p>End: {formatTs(node.completedAt)}</p>
                    </div>
                    {node.error?.message ? (
                      <p className="text-xs text-red-300 inline-flex items-start gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        {node.error.message}
                      </p>
                    ) : null}
                    <div>
                      <p className="text-xs font-medium mb-1">Artifacts</p>
                      {node.artifacts.length === 0 ? (
                        <p className="text-xs text-[var(--color-text-muted)]">No artifacts from this node.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {node.artifacts.map((artifact) => (
                            <Button
                              key={artifact.artifactId}
                              variant="outline"
                              size="sm"
                              onClick={() => openArtifact(artifact).catch(console.error)}
                            >
                              {artifact.title}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Artifact Preview</CardTitle>
          <CardDescription>
            {selectedArtifact ? `${selectedArtifact.title} (${selectedArtifact.kind})` : "Click an artifact on a node."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {!selectedArtifact ? (
            <p className="text-sm text-[var(--color-text-muted)]">No artifact selected.</p>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="text-xs rounded border border-[var(--color-border)] px-2 py-1">{selectedArtifact.mime}</span>
                {selectedArtifact.relPath ? (
                  <Button variant="outline" size="sm" onClick={() => downloadArtifact(selectedArtifact)}>
                    <Download className="w-4 h-4" />
                    Download
                  </Button>
                ) : null}
              </div>
              {previewLoading ? (
                <p className="text-xs text-[var(--color-text-muted)] inline-flex items-center gap-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Loading preview...
                </p>
              ) : null}
              {preview ? (
                <pre className="text-xs whitespace-pre-wrap rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] p-3 max-h-[520px] overflow-auto">
                  {preview.text}
                </pre>
              ) : (
                <p className="text-xs text-[var(--color-text-muted)]">
                  Preview unavailable for this artifact.
                </p>
              )}
            </>
          )}
          {run && run.currentStep ? (
            <p className="text-xs text-[var(--color-text-muted)] inline-flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Current step: {run.currentStep}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
