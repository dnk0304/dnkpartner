import * as fs from "node:fs"
import * as path from "node:path"
import { ensureSubprojectStructure, getProjectDir, getSubprojectDir } from "../projects"
import { loadTemplate } from "./storage"

type StepStatus = "pending" | "processing" | "awaiting_approval" | "completed" | "failed" | "skipped"
type NodeRunStatus = "pending" | "blocked" | "running" | "needs_approval" | "completed" | "failed" | "skipped"
type AutopilotStepId =
  | "brainstorm"
  | "plan_generation"
  | "plan_approval"
  | "agent_orchestration"
  | "script_generation"
  | "scene_split_to_prompts"
  | "imagery_generation"
  | "video_generation"
  | "quality_gate"
  | "review_package"
  | "final_approval"
  | "memory_update_archive"

type ArtifactKind =
  | "outline"
  | "scriptDraft"
  | "sceneTimestamps"
  | "promptPack"
  | "qaReport"
  | "storyboardPlan"
  | "videoPlan"
  | "runJson"
  | "packageJson"

type AutopilotRunLike = {
  runId: string
  projectId: string
  subprojectId?: string
  topic?: string
  graphRef?: { templateId: string; version: number }
  templateVersion?: string
  source?: "manual" | "scheduled"
  steps: Array<{
    id: AutopilotStepId
    title: string
    status: StepStatus
    startedAt?: number
    completedAt?: number
    output?: any
    error?: string
    requiresApproval: boolean
  }>
}

type ArtifactRef = {
  artifactId: string
  projectId: string
  subprojectId?: string
  runId: string
  nodeId: string
  kind: ArtifactKind
  title: string
  mime: string
  relPath: string
  createdAt: number
  summary?: string
  preview?: { textSnippet?: string; jsonKeys?: string[] }
}

type RunGraphNode = {
  id: string
  type: string
  title?: string
  position: { x: number; y: number }
  configSnapshot: Record<string, any>
  status: NodeRunStatus
  startedAt?: number
  completedAt?: number
  error?: { message: string }
  outputs?: Record<string, any>
  logs?: Array<{ ts: number; level: "info" | "warn" | "error"; message: string }>
  artifacts?: ArtifactRef[]
  approval?: {
    required: boolean
    state: "pending" | "approved" | "rejected"
    feedback?: string
    decidedAt?: number
  }
}

export type RunInstanceGraph = {
  runId: string
  projectId: string
  subprojectId?: string
  templateRef: { templateId: string; version: number }
  createdAt: number
  updatedAt: number
  source: "manual" | "scheduled"
  nodes: RunGraphNode[]
  edges: Array<{
    id: string
    from: { nodeId: string; portId: string }
    to: { nodeId: string; portId: string }
  }>
}

type ArtifactCandidate = {
  fileName: string
  kind: ArtifactKind
  title: string
  mime: string
  body: string
  preview?: { textSnippet?: string; jsonKeys?: string[] }
}

const STEP_NODE: Record<AutopilotStepId, { nodeId: string; type: string; title: string }> = {
  brainstorm: { nodeId: "planning_brainstorm", type: "Planning.Brainstorm", title: "Brainstorm" },
  plan_generation: { nodeId: "planning_workflow_plan", type: "Planning.WorkflowPlan", title: "Workflow Plan" },
  plan_approval: { nodeId: "approval_plan", type: "HumanInLoop.PlanApprovalGate", title: "Plan Approval Gate" },
  agent_orchestration: { nodeId: "orchestrator_assign_agents", type: "Orchestrator.AssignAgents", title: "Assign Agents" },
  script_generation: { nodeId: "manuscript_script_draft", type: "ManuscriptWriter.ScriptDraft", title: "Script Draft" },
  scene_split_to_prompts: {
    nodeId: "director_scene_split_timestamps",
    type: "Director.SceneSplitterWithTimestamps",
    title: "Scene Split + Timestamps",
  },
  imagery_generation: {
    nodeId: "director_storyboard_plan",
    type: "Director.StoryboardPlanner",
    title: "Storyboard Plan",
  },
  video_generation: { nodeId: "director_video_plan", type: "Director.VideoPlanner", title: "Video Plan" },
  quality_gate: { nodeId: "qa_quality_gate", type: "QA.QualityGate", title: "Quality Gate" },
  review_package: { nodeId: "storage_review_package", type: "Storage.SaveDraftPackage", title: "Review Package" },
  final_approval: { nodeId: "approval_final", type: "HumanInLoop.FinalApprovalGate", title: "Final Approval Gate" },
  memory_update_archive: { nodeId: "storage_archive", type: "Storage.ExportBundle", title: "Memory Update + Archive" },
}

function toNodeStatus(stepStatus: StepStatus): NodeRunStatus {
  if (stepStatus === "processing") return "running"
  if (stepStatus === "awaiting_approval") return "needs_approval"
  return stepStatus
}

function toSafeVersion(raw: string | undefined): number {
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 1
}

function getRunStorageRoot(projectId: string, subprojectId?: string): string {
  if (subprojectId && subprojectId.trim()) {
    return getSubprojectDir(projectId, subprojectId.trim())
  }
  return getProjectDir(projectId)
}

function getRunGraphFile(projectId: string, runId: string, subprojectId?: string): string {
  return path.join(getRunStorageRoot(projectId, subprojectId), "graphs", "runs", `${runId}.json`)
}

function getArtifactsRoot(projectId: string, runId: string, subprojectId?: string): string {
  return path.join(getRunStorageRoot(projectId, subprojectId), "artifacts", runId)
}

function ensureGraphDirs(projectId: string, runId: string, subprojectId?: string): void {
  if (subprojectId && subprojectId.trim()) {
    ensureSubprojectStructure(projectId, subprojectId.trim())
  }
  fs.mkdirSync(path.dirname(getRunGraphFile(projectId, runId, subprojectId)), { recursive: true })
  fs.mkdirSync(getArtifactsRoot(projectId, runId, subprojectId), { recursive: true })
}

function loadGraph(run: AutopilotRunLike): RunInstanceGraph | null {
  const filePath = getRunGraphFile(run.projectId, run.runId, run.subprojectId)
  if (!fs.existsSync(filePath)) return null
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as RunInstanceGraph
  } catch {
    return null
  }
}

function buildInitialGraph(run: AutopilotRunLike): RunInstanceGraph {
  const createdAt = Date.now()
  const nodes: RunGraphNode[] = run.steps.map((step, idx) => {
    const nodeDef = STEP_NODE[step.id]
    return {
      id: nodeDef.nodeId,
      type: nodeDef.type,
      title: nodeDef.title,
      position: { x: idx * 260, y: 120 },
      configSnapshot: {},
      status: toNodeStatus(step.status),
      startedAt: step.startedAt,
      completedAt: step.completedAt,
      error: step.error ? { message: step.error } : undefined,
      outputs: step.output,
      logs: [],
      artifacts: [],
      approval: step.requiresApproval
        ? {
            required: true,
            state: step.status === "completed"
              ? "approved"
              : step.status === "failed"
                ? "rejected"
                : "pending",
            decidedAt: step.status === "completed" ? Date.now() : undefined,
          }
        : undefined,
    }
  })
  const edges = run.steps.slice(0, -1).map((step, idx) => {
    const from = STEP_NODE[step.id].nodeId
    const to = STEP_NODE[run.steps[idx + 1].id].nodeId
    return {
      id: `edge-${from}-${to}`,
      from: { nodeId: from, portId: "default" },
      to: { nodeId: to, portId: "default" },
    }
  })
  return {
    runId: run.runId,
    projectId: run.projectId,
    subprojectId: run.subprojectId,
    templateRef: {
      templateId: "legacy-autopilot",
      version: toSafeVersion(run.templateVersion),
    },
    createdAt,
    updatedAt: createdAt,
    source: run.source || "manual",
    nodes,
    edges,
  }
}

function saveGraph(graph: RunInstanceGraph): void {
  fs.writeFileSync(getRunGraphFile(graph.projectId, graph.runId, graph.subprojectId), JSON.stringify(graph, null, 2), "utf-8")
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function textSnippet(text: string, maxChars = 220): string {
  const compact = text.trim().replace(/\s+/g, " ")
  return compact.length <= maxChars ? compact : `${compact.slice(0, maxChars)}...`
}

function toRelPath(projectId: string, absolutePath: string): string {
  return path.relative(getProjectDir(projectId), absolutePath).replace(/\\/g, "/")
}

function writeArtifact(run: AutopilotRunLike, nodeId: string, candidate: ArtifactCandidate): ArtifactRef {
  const nodeDir = path.join(getArtifactsRoot(run.projectId, run.runId, run.subprojectId), nodeId)
  fs.mkdirSync(nodeDir, { recursive: true })
  const filePath = path.join(nodeDir, candidate.fileName)
  fs.writeFileSync(filePath, candidate.body, "utf-8")
  return {
    artifactId: `${run.runId}-${nodeId}-${candidate.fileName}`.replace(/[^\w.-]/g, "_"),
    projectId: run.projectId,
    subprojectId: run.subprojectId,
    runId: run.runId,
    nodeId,
    kind: candidate.kind,
    title: candidate.title,
    mime: candidate.mime,
    relPath: toRelPath(run.projectId, filePath),
    createdAt: Date.now(),
    summary: candidate.preview?.textSnippet,
    preview: candidate.preview,
  }
}

function toFileStem(raw: string): string {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "story"
}

function archiveStepOutputs(run: AutopilotRunLike, stepId: AutopilotStepId, output: any): void {
  if (!run.subprojectId || !run.subprojectId.trim()) return
  const subprojectDir = getSubprojectDir(run.projectId, run.subprojectId.trim())
  const storyStem = toFileStem(run.topic || run.runId)
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  if (stepId === "script_generation" && typeof output?.scriptDraft === "string") {
    const docsDir = path.join(subprojectDir, "docs")
    fs.mkdirSync(docsDir, { recursive: true })
    fs.writeFileSync(path.join(docsDir, `${storyStem}-${stamp}.md`), output.scriptDraft, "utf-8")
    return
  }
  if (stepId === "scene_split_to_prompts" && Array.isArray(output?.prompts)) {
    const promptsDir = path.join(subprojectDir, "prompts")
    const timelinesDir = path.join(subprojectDir, "timelines")
    fs.mkdirSync(promptsDir, { recursive: true })
    fs.mkdirSync(timelinesDir, { recursive: true })
    const promptsPayload = { prompts: output.prompts, durations: Array.isArray(output?.durations) ? output.durations : [] }
    fs.writeFileSync(path.join(promptsDir, `${storyStem}-${stamp}.json`), stringifyJson(promptsPayload), "utf-8")
    const timeline = sceneTimestampManifest(
      output.prompts.map(String),
      Array.isArray(output?.durations) ? output.durations.map(Number) : []
    )
    fs.writeFileSync(path.join(timelinesDir, `${storyStem}-${stamp}.json`), stringifyJson(timeline), "utf-8")
    return
  }
  if (stepId === "quality_gate" && output?.finalDeliverable) {
    const docsDir = path.join(subprojectDir, "docs")
    fs.mkdirSync(docsDir, { recursive: true })
    fs.writeFileSync(path.join(docsDir, `${storyStem}-${stamp}-final.json`), stringifyJson(output.finalDeliverable), "utf-8")
  }
}

function getTelegramNodes(run: AutopilotRunLike): Array<{
  id: string
  title: string
  config: Record<string, any>
}> {
  const templateId = run.graphRef?.templateId
  const version = run.graphRef?.version
  if (!templateId) return []
  const template = loadTemplate(run.projectId, templateId, version, run.subprojectId)
  if (!template || !Array.isArray(template.nodes)) return []
  return template.nodes
    .filter((node: any) => node?.type === "Notifications.TelegramMessage")
    .map((node: any) => ({
      id: String(node.id || "telegram-node"),
      title: String(node.title || "Telegram Message"),
      config: node?.config && typeof node.config === "object" ? node.config : {},
    }))
}

function shouldSendTelegramForStep(mode: string, stepId: AutopilotStepId, status: StepStatus, output: any): boolean {
  if (mode === "summary") {
    return status === "completed" || status === "failed"
  }
  if (mode === "approval_request") {
    return status === "awaiting_approval" && (stepId === "plan_approval" || stepId === "final_approval")
  }
  if (mode === "script") {
    return stepId === "script_generation" && status === "completed" && typeof output?.scriptDraft === "string"
  }
  if (mode === "artifacts") {
    return (stepId === "quality_gate" || stepId === "review_package" || stepId === "memory_update_archive") && status === "completed"
  }
  return false
}

async function sendTelegramText(chatId: string, text: string): Promise<void> {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim()
  if (!token) return
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text.slice(0, 3900),
    }),
  })
  if (!response.ok) {
    const details = await response.text().catch(() => "")
    throw new Error(`Telegram sendMessage failed: ${response.status} ${details}`)
  }
}

async function dispatchTelegramNodes(params: {
  run: AutopilotRunLike
  stepId: AutopilotStepId
  status: StepStatus
  output?: any
}): Promise<void> {
  const { run, stepId, status, output } = params
  const nodes = getTelegramNodes(run)
  if (nodes.length === 0) return
  const fallbackChatId = String(process.env.TELEGRAM_DEFAULT_CHAT_ID || "").trim()
  for (const node of nodes) {
    const mode = String(node.config.mode || "summary").trim().toLowerCase()
    if (!shouldSendTelegramForStep(mode, stepId, status, output)) continue
    const chatId = String(node.config.chatId || fallbackChatId).trim()
    if (!chatId) continue
    const base = [
      `Workflow update from ${node.title}`,
      `Project: ${run.projectId}${run.subprojectId ? `/${run.subprojectId}` : ""}`,
      `Run: ${run.runId}`,
      `Topic: ${run.topic || "Untitled"}`,
      `Step: ${stepId}`,
      `Status: ${status}`,
    ]
    let details = ""
    if (mode === "script" && typeof output?.scriptDraft === "string") {
      details = `\n\nScript preview:\n${textSnippet(output.scriptDraft, 700)}`
    } else if (mode === "approval_request") {
      details = "\n\nAction needed: approve or revise this step."
    } else if (mode === "artifacts") {
      details = "\n\nArtifacts updated. Use Telegram bot commands to fetch files from this run."
    }
    const template = typeof node.config.messageTemplate === "string" ? node.config.messageTemplate.trim() : ""
    const finalText = template
      ? template
        .replace(/\{\{projectId\}\}/g, run.projectId)
        .replace(/\{\{subprojectId\}\}/g, run.subprojectId || "")
        .replace(/\{\{runId\}\}/g, run.runId)
        .replace(/\{\{topic\}\}/g, run.topic || "")
        .replace(/\{\{step\}\}/g, stepId)
        .replace(/\{\{status\}\}/g, status)
      : `${base.join("\n")}${details}`
    await sendTelegramText(chatId, finalText)
  }
}

function sceneTimestampManifest(prompts: string[], durations: number[]): Array<{ scene: number; start: number; end: number; prompt: string }> {
  let cursor = 0
  return prompts.map((prompt, idx) => {
    const duration = Number(durations[idx] || 0)
    const start = cursor
    const end = cursor + Math.max(0, duration)
    cursor = end
    return { scene: idx + 1, start, end, prompt }
  })
}

function buildArtifactsForStep(stepId: AutopilotStepId, output: any): ArtifactCandidate[] {
  if (!output || typeof output !== "object") return []
  if (stepId === "brainstorm" && typeof output.brainstormNotes === "string") {
    return [{
      fileName: "brainstorm.md",
      kind: "outline",
      title: "Brainstorm Notes",
      mime: "text/markdown",
      body: output.brainstormNotes,
      preview: { textSnippet: textSnippet(output.brainstormNotes) },
    }]
  }
  if (stepId === "plan_generation" && output.workflowPlan) {
    const plan = stringifyJson(output.workflowPlan)
    const quality = output.planQuality ? `\n\nPlan quality:\n${stringifyJson(output.planQuality)}` : ""
    return [{
      fileName: "workflow_plan.json",
      kind: "outline",
      title: "Workflow Plan",
      mime: "application/json",
      body: plan,
      preview: { jsonKeys: Object.keys(output.workflowPlan || {}) },
    }, {
      fileName: "workflow_plan.md",
      kind: "outline",
      title: "Workflow Plan Summary",
      mime: "text/markdown",
      body: `# Workflow Plan\n\n\`\`\`json\n${plan}\n\`\`\`${quality}`,
      preview: { textSnippet: textSnippet(plan) },
    }]
  }
  if (stepId === "agent_orchestration" && output.agentGraph) {
    return [{
      fileName: "agent_assignment.json",
      kind: "runJson",
      title: "Agent Assignment",
      mime: "application/json",
      body: stringifyJson(output.agentGraph),
      preview: { jsonKeys: Object.keys(output.agentGraph || {}) },
    }]
  }
  if (stepId === "script_generation" && typeof output.scriptDraft === "string") {
    return [{
      fileName: "script.md",
      kind: "scriptDraft",
      title: "Script Draft",
      mime: "text/markdown",
      body: output.scriptDraft,
      preview: { textSnippet: textSnippet(output.scriptDraft) },
    }]
  }
  if (stepId === "scene_split_to_prompts" && Array.isArray(output.prompts)) {
    const prompts = output.prompts.map(String)
    const durations = Array.isArray(output.durations) ? output.durations.map(Number) : []
    const sceneManifest = sceneTimestampManifest(prompts, durations)
    return [{
      fileName: "prompt_pack.json",
      kind: "promptPack",
      title: "Prompt Pack",
      mime: "application/json",
      body: stringifyJson({ prompts, durations }),
      preview: { jsonKeys: ["prompts", "durations"] },
    }, {
      fileName: "scene_timestamps.json",
      kind: "sceneTimestamps",
      title: "Scene Timestamps",
      mime: "application/json",
      body: stringifyJson(sceneManifest),
      preview: { jsonKeys: sceneManifest.length > 0 ? Object.keys(sceneManifest[0]) : ["scene", "start", "end", "prompt"] },
    }]
  }
  if (stepId === "imagery_generation" && output.imageryPlan) {
    return [{
      fileName: "storyboard_plan.json",
      kind: "storyboardPlan",
      title: "Storyboard Plan",
      mime: "application/json",
      body: stringifyJson(output.imageryPlan),
      preview: { jsonKeys: Array.isArray(output.imageryPlan) && output.imageryPlan[0] ? Object.keys(output.imageryPlan[0]) : [] },
    }]
  }
  if (stepId === "video_generation" && output.videoPlan) {
    return [{
      fileName: "video_plan.json",
      kind: "videoPlan",
      title: "Video Plan",
      mime: "application/json",
      body: stringifyJson(output.videoPlan),
      preview: { jsonKeys: Array.isArray(output.videoPlan) && output.videoPlan[0] ? Object.keys(output.videoPlan[0]) : [] },
    }]
  }
  if (stepId === "quality_gate" && output.finalDeliverable) {
    const finalDeliverable = output.finalDeliverable
    const failed = Array.isArray(finalDeliverable?.acceptanceCriteriaResults)
      ? finalDeliverable.acceptanceCriteriaResults.filter((item: any) => !item?.passed).length
      : 0
    const qaSummary = typeof finalDeliverable?.qaSummary === "string"
      ? finalDeliverable.qaSummary
      : `${failed} checks need attention.`
    return [{
      fileName: "final_deliverable.json",
      kind: "runJson",
      title: "Final Deliverable",
      mime: "application/json",
      body: stringifyJson(finalDeliverable),
      preview: { jsonKeys: Object.keys(finalDeliverable || {}) },
    }, {
      fileName: "qa_report.md",
      kind: "qaReport",
      title: "QA Report",
      mime: "text/markdown",
      body: `# QA Report\n\n${qaSummary}`,
      preview: { textSnippet: textSnippet(qaSummary) },
    }]
  }
  if (stepId === "review_package" && typeof output.summary === "string") {
    return [{
      fileName: "review_summary.md",
      kind: "qaReport",
      title: "Review Summary",
      mime: "text/markdown",
      body: output.summary,
      preview: { textSnippet: textSnippet(output.summary) },
    }]
  }
  if (stepId === "memory_update_archive" && typeof output.summary === "string") {
    return [{
      fileName: "archive_summary.md",
      kind: "packageJson",
      title: "Archive Summary",
      mime: "text/markdown",
      body: output.summary,
      preview: { textSnippet: textSnippet(output.summary) },
    }]
  }
  return [{
    fileName: `${stepId}_output.json`,
    kind: "runJson",
    title: `${stepId} Output`,
    mime: "application/json",
    body: stringifyJson(output),
    preview: { jsonKeys: Object.keys(output) },
  }]
}

function upsertArtifacts(existing: ArtifactRef[] | undefined, next: ArtifactRef[]): ArtifactRef[] {
  const byRelPath = new Map<string, ArtifactRef>()
  for (const item of existing || []) byRelPath.set(item.relPath, item)
  for (const item of next) byRelPath.set(item.relPath, item)
  return Array.from(byRelPath.values()).sort((a, b) => a.relPath.localeCompare(b.relPath))
}

export function bridgeStepToRunGraph(params: {
  run: AutopilotRunLike
  stepId: AutopilotStepId
  status: StepStatus
  output?: any
  error?: string
}): void {
  const { run, stepId, status, output, error } = params
  try {
    ensureGraphDirs(run.projectId, run.runId, run.subprojectId)
    const graph = loadGraph(run) || buildInitialGraph(run)
    const nodeDef = STEP_NODE[stepId]
    const node = graph.nodes.find((item) => item.id === nodeDef.nodeId)
    if (!node) return

    node.status = toNodeStatus(status)
    node.startedAt = status === "processing" ? Date.now() : (node.startedAt || undefined)
    if (status === "completed" || status === "failed" || status === "skipped") {
      node.completedAt = Date.now()
    }
    if (output !== undefined) {
      node.outputs = output
    }
    if (error) {
      node.error = { message: error }
    }

    if (node.approval?.required) {
      node.approval.state = status === "completed"
        ? "approved"
        : status === "failed"
          ? "rejected"
          : "pending"
      if (node.approval.state !== "pending") {
        node.approval.decidedAt = Date.now()
      }
    }

    const level = status === "failed" ? "error" : "info"
    node.logs = [
      ...(node.logs || []),
      { ts: Date.now(), level, message: `Step ${stepId} -> ${status}` },
    ].slice(-200)

    const shouldWriteArtifacts = output !== undefined && status !== "processing" && status !== "pending"
    if (shouldWriteArtifacts) {
      const candidates = buildArtifactsForStep(stepId, output)
      const artifacts = candidates.map((candidate) => writeArtifact(run, node.id, candidate))
      node.artifacts = upsertArtifacts(node.artifacts, artifacts)
      archiveStepOutputs(run, stepId, output)
    }

    void dispatchTelegramNodes({ run, stepId, status, output }).catch((telegramError) => {
      console.error("[WorkflowGraph] telegram node dispatch failed:", telegramError)
    })

    graph.updatedAt = Date.now()
    saveGraph(graph)
  } catch (bridgeError) {
    console.error("[WorkflowGraph] execution bridge failed:", bridgeError)
  }
}

