import * as fs from "node:fs"
import * as path from "node:path"
import type express from "express"
import {
  createSubproject,
  getProject,
  getProjectDir,
  getSubproject,
  getSubprojectDir,
  listSubprojects,
  updateProject,
} from "./projects"
import { addMemoryEntry, buildMemoryPromptContext } from "./projectMemory"
import { AutopilotBrain } from "./autopilotBrain"
import { RulesContext, getCategoryTemplate, resolveRulesContext } from "./categoryTemplates"
import {
  createDraftPackage,
  getDraftPackageById,
  listDraftPackages,
  saveDraftPackage,
  updateDraftPackage,
  upsertDraftPackageFromRun,
} from "./draftPackages"
import { GraphTemplate } from "./workflowGraph/types"
import { listTemplates, loadRunGraph, loadTemplate, saveTemplateVersion } from "./workflowGraph/storage"
import { bridgeStepToRunGraph } from "./workflowGraph/executionBridge"

type RunStatus = "running" | "awaiting_approval" | "completed" | "aborted" | "failed"
type StepStatus = "pending" | "processing" | "awaiting_approval" | "completed" | "failed" | "skipped"
type ApprovalState = "pending" | "approved" | "rejected"

export type AutopilotStepId =
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

export interface WorkflowPlanTask {
  id: string
  title: string
  description: string
  dependsOn: string[]
  owner: string
  acceptanceCriteria: string[]
}

export interface WorkflowPlan {
  objectives: string[]
  scope: string
  assumptions: string[]
  acceptanceCriteria: string[]
  tasks: WorkflowPlanTask[]
  riskMitigations: string[]
}

export interface AgentNode {
  id: string
  role: string
  model: string
  responsibilities: string[]
  tools: string[]
  handoffTo: string[]
}

export interface AgentGraph {
  orchestrator: string
  agents: AgentNode[]
}

export interface LoopIteration {
  iteration: number
  producedOutput: string
  score: number
  passed: boolean
  failureReasons: string[]
  revisedFromFeedback?: string
  createdAt: number
}

export interface LoopMetrics {
  maxIterations: number
  iterations: LoopIteration[]
  finalScore: number
  stoppedReason: "passed" | "max_iterations" | "aborted"
  repeatedFailureSignatureCount: number
}

export interface AutopilotStep {
  id: AutopilotStepId
  title: string
  status: StepStatus
  requiresApproval: boolean
  startedAt?: number
  completedAt?: number
  output?: any
  error?: string
}

export interface AutopilotRun {
  runId: string
  projectId: string
  subprojectId?: string
  packageId?: string
  topic: string
  format?: "long" | "short"
  targetTranscriptSeconds?: number
  targetWordCount?: number
  targetWordRange?: { min: number; max: number }
  graphRef?: {
    templateId: string
    version: number
  }
  status: RunStatus
  currentStep: AutopilotStepId
  createdAt: number
  updatedAt: number
  runtimeEstimateSeconds?: number
  templateVersion?: string
  rulesVersion?: string
  artifacts?: Array<{ version: number; createdAt: number; summary: string }>
  steps: AutopilotStep[]
  source?: "manual" | "scheduled"
  rulesContext?: RulesContext
  brainstormNotes?: string
  workflowPlan?: WorkflowPlan
  planDraftRaw?: string
  planQuality?: {
    score: number
    passed: boolean
    reasons: string[]
  }
  agentGraph?: AgentGraph
  loopMetrics?: LoopMetrics
  finalDeliverable?: {
    summary: string
    artifact: string
    acceptanceCriteriaResults: Array<{ criterion: string; passed: boolean; note: string }>
    scriptDraft?: string
    wordCount?: number
    targetTranscriptSeconds?: number
    targetWordCount?: number
    targetWordRange?: { min: number; max: number }
    prompts?: string[]
    durations?: number[]
    imageryPlan?: Array<{ scene: number; prompt: string; style: string }>
    videoPlan?: Array<{ scene: number; prompt: string; duration: number }>
    qaSummary?: string
  }
  approvalState: {
    planApproval: ApprovalState
    finalApproval: ApprovalState
  }
}

interface RegisterAutopilotRoutesOptions {
  app: express.Express
  port: number
  generateText: (params: { model: string; systemPrompt: string; userPrompt: string }) => Promise<string>
  extractScenes: (params: {
    script: string
    model: string
    projectMemoryContext?: string
    desiredPromptCount?: number
    storyBase?: any
  }) => Promise<{ prompts: string[]; durations: number[] }>
  brain: AutopilotBrain
}

const STEP_ORDER: AutopilotStepId[] = [
  "brainstorm",
  "plan_generation",
  "plan_approval",
  "agent_orchestration",
  "script_generation",
  "scene_split_to_prompts",
  "imagery_generation",
  "video_generation",
  "quality_gate",
  "review_package",
  "final_approval",
  "memory_update_archive",
]
export const AUTOPILOT_STEP_ORDER = STEP_ORDER

function defaultSteps(): AutopilotStep[] {
  return [
    { id: "brainstorm", title: "Brainstorm", status: "pending", requiresApproval: false },
    { id: "plan_generation", title: "Plan Generation", status: "pending", requiresApproval: false },
    { id: "plan_approval", title: "Plan Approval", status: "pending", requiresApproval: true },
    { id: "agent_orchestration", title: "Agent Orchestration", status: "pending", requiresApproval: false },
    { id: "script_generation", title: "Script Generation", status: "pending", requiresApproval: false },
    { id: "scene_split_to_prompts", title: "Scene Split To Prompts", status: "pending", requiresApproval: false },
    { id: "imagery_generation", title: "Imagery Generation", status: "pending", requiresApproval: false },
    { id: "video_generation", title: "Video Generation", status: "pending", requiresApproval: false },
    { id: "quality_gate", title: "Quality Gate", status: "pending", requiresApproval: false },
    { id: "review_package", title: "Review Package", status: "pending", requiresApproval: false },
    { id: "final_approval", title: "Final Approval", status: "pending", requiresApproval: true },
    { id: "memory_update_archive", title: "Memory Update + Archive", status: "pending", requiresApproval: false },
  ]
}

function getRunDir(projectId: string): string {
  return path.join(getProjectDir(projectId), "runs")
}

function getRunStorageRoot(projectId: string, subprojectId?: string): string {
  if (subprojectId && subprojectId.trim()) {
    return getSubprojectDir(projectId, subprojectId.trim())
  }
  return getProjectDir(projectId)
}

function getRunDirResolved(projectId: string, subprojectId?: string): string {
  return path.join(getRunStorageRoot(projectId, subprojectId), "runs")
}

function getRunFile(projectId: string, runId: string, subprojectId?: string): string {
  return path.join(getRunDirResolved(projectId, subprojectId), `${runId}.json`)
}

function ensureRunDir(projectId: string, subprojectId?: string): void {
  const runDir = getRunDirResolved(projectId, subprojectId)
  if (!fs.existsSync(runDir)) {
    fs.mkdirSync(runDir, { recursive: true })
  }
}

function saveRun(run: AutopilotRun): void {
  if (run.subprojectId && run.subprojectId.trim()) {
    const subproject = getSubproject(run.projectId, run.subprojectId)
    if (!subproject) {
      createSubproject(run.projectId, { id: run.subprojectId, name: run.topic || run.subprojectId, storyTitle: run.topic || run.subprojectId })
    }
  }
  ensureRunDir(run.projectId, run.subprojectId)
  run.updatedAt = Date.now()
  fs.writeFileSync(getRunFile(run.projectId, run.runId, run.subprojectId), JSON.stringify(run, null, 2), "utf-8")
}

function loadRun(projectId: string, runId: string, subprojectId?: string): AutopilotRun | null {
  const filePath = getRunFile(projectId, runId, subprojectId)
  if (!fs.existsSync(filePath)) return null
  try {
    const run = JSON.parse(fs.readFileSync(filePath, "utf-8")) as AutopilotRun
    if (subprojectId && !run.subprojectId) run.subprojectId = subprojectId
    return run
  } catch {
    return null
  }
}

function getRunById(runId: string): AutopilotRun | null {
  const projectsRoot = path.join(process.cwd(), "data", "projects")
  if (!fs.existsSync(projectsRoot)) return null
  const projectDirs = fs
    .readdirSync(projectsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
  for (const projectId of projectDirs) {
    const run = loadRun(projectId, runId)
    if (run) return run
    const subprojects = listSubprojects(projectId)
    for (const subproject of subprojects) {
      const nestedRun = loadRun(projectId, runId, subproject.id)
      if (nestedRun) return nestedRun
    }
  }
  return null
}

const SAFE_ARTIFACT_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".json",
  ".jsonl",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".mp4",
])

function resolveSafeProjectPath(projectId: string, relPath: string): string | null {
  if (!relPath || typeof relPath !== "string") return null
  const trimmed = relPath.trim()
  if (!trimmed || path.isAbsolute(trimmed)) return null
  const projectDir = path.resolve(getProjectDir(projectId))
  const resolved = path.resolve(projectDir, trimmed)
  const relToProject = path.relative(projectDir, resolved)
  if (!relToProject || relToProject.startsWith("..") || path.isAbsolute(relToProject)) return null
  const extension = path.extname(resolved).toLowerCase()
  if (extension && !SAFE_ARTIFACT_EXTENSIONS.has(extension)) return null
  return resolved
}

function toPreviewMime(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase()
  if (extension === ".md") return "text/markdown; charset=utf-8"
  if (extension === ".txt") return "text/plain; charset=utf-8"
  if (extension === ".json") return "application/json; charset=utf-8"
  if (extension === ".jsonl") return "application/x-ndjson; charset=utf-8"
  if (extension === ".png") return "image/png"
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg"
  if (extension === ".webp") return "image/webp"
  if (extension === ".mp4") return "video/mp4"
  return "application/octet-stream"
}

function listRuns(projectId: string, subprojectId?: string): AutopilotRun[] {
  const runDir = getRunDirResolved(projectId, subprojectId)
  if (!fs.existsSync(runDir)) return []
  const entries = fs.readdirSync(runDir, { withFileTypes: true })
  const runs: AutopilotRun[] = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!entry.name.endsWith(".json")) continue
    const runId = entry.name.replace(/\.json$/i, "")
    const run = loadRun(projectId, runId, subprojectId)
    if (run) runs.push(run)
  }
  return runs.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
}

type AutopilotArtifactView = {
  id: string
  kind: "scriptDraft" | "timings" | "promptPack" | "storyboardPlan" | "videoPlan" | "qaReport" | "artifactVersion"
  title: string
  mime: string
  summary?: string
  preview?: string
}

function buildRunArtifacts(run: AutopilotRun): AutopilotArtifactView[] {
  const artifacts: AutopilotArtifactView[] = []
  const deliverable = run.finalDeliverable
  if (deliverable?.scriptDraft) {
    artifacts.push({
      id: `${run.runId}-script`,
      kind: "scriptDraft",
      title: "script_draft.md",
      mime: "text/markdown",
      preview: deliverable.scriptDraft.slice(0, 320),
    })
  }
  if (Array.isArray(deliverable?.durations) && deliverable.durations.length > 0) {
    artifacts.push({
      id: `${run.runId}-timings`,
      kind: "timings",
      title: "scene_timings.json",
      mime: "application/json",
      summary: `${deliverable.durations.length} scene timings`,
      preview: JSON.stringify(deliverable.durations.slice(0, 12)),
    })
  }
  if (Array.isArray(deliverable?.prompts) && deliverable.prompts.length > 0) {
    artifacts.push({
      id: `${run.runId}-prompt-pack`,
      kind: "promptPack",
      title: "prompt_pack.json",
      mime: "application/json",
      summary: `${deliverable.prompts.length} prompts`,
      preview: JSON.stringify(deliverable.prompts.slice(0, 6), null, 2).slice(0, 320),
    })
  }
  if (Array.isArray(deliverable?.imageryPlan) && deliverable.imageryPlan.length > 0) {
    artifacts.push({
      id: `${run.runId}-storyboard-plan`,
      kind: "storyboardPlan",
      title: "storyboard_plan.json",
      mime: "application/json",
      summary: `${deliverable.imageryPlan.length} storyboard scenes`,
      preview: JSON.stringify(deliverable.imageryPlan.slice(0, 4), null, 2).slice(0, 320),
    })
  }
  if (Array.isArray(deliverable?.videoPlan) && deliverable.videoPlan.length > 0) {
    artifacts.push({
      id: `${run.runId}-video-plan`,
      kind: "videoPlan",
      title: "video_plan.json",
      mime: "application/json",
      summary: `${deliverable.videoPlan.length} video scenes`,
      preview: JSON.stringify(deliverable.videoPlan.slice(0, 4), null, 2).slice(0, 320),
    })
  }
  if (deliverable?.qaSummary) {
    artifacts.push({
      id: `${run.runId}-qa-report`,
      kind: "qaReport",
      title: "qa_report.md",
      mime: "text/markdown",
      preview: deliverable.qaSummary.slice(0, 320),
    })
  }
  if (Array.isArray(run.artifacts) && run.artifacts.length > 0) {
    for (const version of run.artifacts) {
      artifacts.push({
        id: `${run.runId}-version-${version.version}`,
        kind: "artifactVersion",
        title: `artifact_version_${version.version}.json`,
        mime: "application/json",
        summary: version.summary,
        preview: JSON.stringify(version),
      })
    }
  }
  return artifacts
}

function getRunWordCount(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
}

function getWordsPerMinute(format: "long" | "short"): number {
  return format === "short" ? 175 : 145
}

export function estimateTargetWordCount(targetSeconds: number, format: "long" | "short"): number {
  const safeSeconds = Math.max(1, Number(targetSeconds || 0))
  const wordsPerMinute = getWordsPerMinute(format)
  return Math.max(1, Math.round((safeSeconds / 60) * wordsPerMinute))
}

export function estimateTargetWordRange(targetWordCount: number): { min: number; max: number } {
  const safeTarget = Math.max(1, Number(targetWordCount || 0))
  const tolerance = Math.max(25, Math.round(safeTarget * 0.12))
  return {
    min: Math.max(1, safeTarget - tolerance),
    max: safeTarget + tolerance,
  }
}

function getWordCountTarget(run: AutopilotRun): {
  targetSeconds: number
  targetWords: number
  minWords: number
  maxWords: number
} | null {
  const targetSeconds = Number(run.targetTranscriptSeconds || 0)
  if (!Number.isFinite(targetSeconds) || targetSeconds <= 0) return null
  const targetWords = estimateTargetWordCount(targetSeconds, run.format || "long")
  const range = estimateTargetWordRange(targetWords)
  return {
    targetSeconds,
    targetWords,
    minWords: range.min,
    maxWords: range.max,
  }
}

function getWordCountViolation(
  wordCount: number,
  target: { targetSeconds: number; targetWords: number; minWords: number; maxWords: number }
): string {
  if (wordCount < target.minWords) {
    return `Script is shorter than target pacing (${wordCount} words vs target range ${target.minWords}-${target.maxWords} for ${target.targetSeconds}s).`
  }
  if (wordCount > target.maxWords) {
    return `Script is longer than target pacing (${wordCount} words vs target range ${target.minWords}-${target.maxWords} for ${target.targetSeconds}s).`
  }
  return ""
}

function estimateRuntimeSeconds(scriptDraft: string, durations: number[], format: "long" | "short"): number {
  const words = getRunWordCount(scriptDraft)
  const wordsPerMinute = getWordsPerMinute(format)
  const speakingSeconds = Math.round((words / wordsPerMinute) * 60)
  const sceneSeconds = Math.round(durations.reduce((acc, value) => acc + Number(value || 0), 0))
  // Blend speaking estimate with scene timeline when both exist.
  if (speakingSeconds > 0 && sceneSeconds > 0) return Math.round((speakingSeconds * 0.6) + (sceneSeconds * 0.4))
  return Math.max(speakingSeconds, sceneSeconds)
}

function appendArtifactVersion(run: AutopilotRun, summary: string): void {
  const nextVersion = (run.artifacts?.length || 0) + 1
  const next = {
    version: nextVersion,
    createdAt: Date.now(),
    summary,
  }
  run.artifacts = [...(run.artifacts || []), next]
}

function setStepStatus(run: AutopilotRun, stepId: AutopilotStepId, status: StepStatus, output?: any, error?: string): void {
  const step = run.steps.find((s) => s.id === stepId)
  if (!step) return
  step.status = status
  if (status === "processing") step.startedAt = Date.now()
  if (status === "completed" || status === "failed" || status === "skipped") step.completedAt = Date.now()
  if (output !== undefined) step.output = output
  if (error) step.error = error
  run.currentStep = stepId
  bridgeStepToRunGraph({ run, stepId, status, output, error })
}

function normalizePlan(raw: any, topic: string): WorkflowPlan {
  const tasksRaw: any[] = Array.isArray(raw?.tasks) ? raw.tasks : []
  const tasks: WorkflowPlanTask[] = tasksRaw.slice(0, 20).map((task, idx) => ({
    id: String(task?.id || `task-${idx + 1}`),
    title: String(task?.title || `Task ${idx + 1}`),
    description: String(task?.description || "No description provided."),
    dependsOn: Array.isArray(task?.dependsOn) ? task.dependsOn.map(String) : [],
    owner: String(task?.owner || "orchestrator"),
    acceptanceCriteria: Array.isArray(task?.acceptanceCriteria)
      ? task.acceptanceCriteria.map(String)
      : ["Output is complete and aligns with project scope."],
  }))

  const plan: WorkflowPlan = {
    objectives: Array.isArray(raw?.objectives)
      ? raw.objectives.map(String).slice(0, 8)
      : [`Deliver high-quality project workflow for topic: ${topic}`],
    scope: String(raw?.scope || "Create a full end-to-end workflow for the selected project topic."),
    assumptions: Array.isArray(raw?.assumptions) ? raw.assumptions.map(String).slice(0, 10) : [],
    acceptanceCriteria: Array.isArray(raw?.acceptanceCriteria)
      ? raw.acceptanceCriteria.map(String).slice(0, 12)
      : [
          "Workflow is structured, executable, and aligned with user instructions.",
          "Agent responsibilities are explicit and non-overlapping.",
          "Quality checks are measurable and testable.",
        ],
    tasks: tasks.length > 0 ? tasks : [
      {
        id: "task-1",
        title: "Brainstorm and define concept",
        description: "Refine idea and align with project brand rules.",
        dependsOn: [],
        owner: "planner",
        acceptanceCriteria: ["Concept is clear and aligned with audience and category rules."],
      },
      {
        id: "task-2",
        title: "Generate script and split into prompts",
        description: "Produce script, scene prompts, and durations for image/video flow.",
        dependsOn: ["task-1"],
        owner: "scriptwriter",
        acceptanceCriteria: ["Prompts match brand and technical production rules."],
      },
    ],
    riskMitigations: Array.isArray(raw?.riskMitigations) ? raw.riskMitigations.map(String).slice(0, 10) : [],
  }

  return plan
}

function validatePlanStages(plan: WorkflowPlan): { passed: boolean; reasons: string[] } {
  const required = ["brainstorm", "script", "prompt", "quality", "review"]
  const haystack = `${plan.scope} ${plan.objectives.join(" ")} ${plan.tasks.map((t) => `${t.title} ${t.description}`).join(" ")}`.toLowerCase()
  const missing = required.filter((stage) => !haystack.includes(stage))
  return {
    passed: missing.length === 0,
    reasons: missing.map((stage) => `Plan does not explicitly cover required stage: ${stage}`),
  }
}

function parseJsonFromModelText(text: string): any | null {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }
}

async function generateWorkflowPlan(run: AutopilotRun, deps: RegisterAutopilotRoutesOptions, revisionFeedback?: string): Promise<void> {
  const project = getProject(run.projectId)
  if (!project) throw new Error("Project not found")

  setStepStatus(run, "plan_generation", "processing")
  run.status = "running"
  saveRun(run)

  const memoryContext = buildMemoryPromptContext(run.projectId, 2200)
  const plannerPrompt = `
You are a planning model. Build a complete project workflow plan in strict JSON.

Project: ${project.name}
Topic: ${run.topic}
Project Guidelines: ${project.guidelines}
Restrictions: ${(project.restrictions || []).join("; ") || "none"}
Revision Feedback: ${revisionFeedback || "none"}
Rules context:
${JSON.stringify(run.rulesContext || {}, null, 2)}

Memory context:
${memoryContext}

Return JSON with fields:
{
  "objectives": string[],
  "scope": string,
  "assumptions": string[],
  "acceptanceCriteria": string[],
  "tasks": [
    {
      "id": string,
      "title": string,
      "description": string,
      "dependsOn": string[],
      "owner": string,
      "acceptanceCriteria": string[]
    }
  ],
  "riskMitigations": string[]
}
`

  const rawPlanText = await deps.generateText({
    model: project.modelRouting?.scriptWriter || "gpt-5.2",
    systemPrompt: "You design executable project workflows. Output valid JSON only.",
    userPrompt: plannerPrompt,
  })
  run.planDraftRaw = rawPlanText

  const parsed = parseJsonFromModelText(rawPlanText)
  run.workflowPlan = normalizePlan(parsed, run.topic)
  const stageValidation = validatePlanStages(run.workflowPlan)
  const planScore = project.brainConfig?.enabled
    ? await deps.brain.evaluatePlanQuality(run.workflowPlan)
    : {
        score: run.workflowPlan.tasks.length >= 2 && run.workflowPlan.acceptanceCriteria.length >= 2 ? 88 : 60,
        passed: run.workflowPlan.tasks.length >= 2,
        reasons: run.workflowPlan.tasks.length >= 2 ? [] : ["Plan must contain at least two tasks."],
      }
  run.planQuality = {
    score: stageValidation.passed ? planScore.score : Math.max(0, planScore.score - 20),
    passed: planScore.passed && stageValidation.passed,
    reasons: [...(planScore.reasons || []), ...stageValidation.reasons],
  }

  setStepStatus(run, "plan_generation", "completed", {
    workflowPlan: run.workflowPlan,
    planQuality: run.planQuality,
  })
  setStepStatus(run, "plan_approval", "awaiting_approval", {
    workflowPlan: run.workflowPlan,
    planQuality: run.planQuality,
  })
  run.approvalState.planApproval = "pending"
  run.status = "awaiting_approval"
  run.currentStep = "plan_approval"
  saveRun(run)
}

async function generateBrainstorm(run: AutopilotRun, deps: RegisterAutopilotRoutesOptions): Promise<void> {
  const project = getProject(run.projectId)
  if (!project) throw new Error("Project not found")

  setStepStatus(run, "brainstorm", "processing")
  run.status = "running"
  saveRun(run)

  const memoryContext = buildMemoryPromptContext(run.projectId, 1200)
  const text = await deps.generateText({
    model: project.modelRouting?.chatWorker || "gpt-5-nano",
    systemPrompt: "You are a creative strategist. Create concise idea directions aligned with strict brand rules.",
    userPrompt: `
Topic: ${run.topic}
Project: ${project.name}
Rules Context:
${JSON.stringify(run.rulesContext || {}, null, 2)}

Memory context:
${memoryContext}

Provide:
1) 5 short brainstorm angles
2) One recommended direction
3) Why it matches the brand and prompt rules
`,
  })

  run.brainstormNotes = text
  setStepStatus(run, "brainstorm", "completed", { brainstormNotes: text })
  saveRun(run)
}

async function setupAgentGraphFromPlan(run: AutopilotRun, deps: RegisterAutopilotRoutesOptions): Promise<void> {
  const project = getProject(run.projectId)
  if (!project) throw new Error("Project not found")
  if (!run.workflowPlan) throw new Error("Workflow plan missing")

  setStepStatus(run, "agent_orchestration", "processing")
  run.status = "running"
  saveRun(run)

  const defaultTools = ["research", "writing", "scene_split", "prompt_engineering", "quality_check", "memory_update"]
  const orchestratorPrompt = `
Build an agent graph from the workflow plan. Return strict JSON:
{
  "orchestrator": string,
  "agents": [
    {
      "id": string,
      "role": string,
      "model": string,
      "responsibilities": string[],
      "tools": string[],
      "handoffTo": string[]
    }
  ]
}

Workflow plan:
${JSON.stringify(run.workflowPlan, null, 2)}

Rules context:
${JSON.stringify(run.rulesContext || {}, null, 2)}
`

  const raw = await deps.generateText({
    model: project.modelRouting?.brainModel || "gpt-5.2",
    systemPrompt: "You are an orchestrator model. Output valid JSON only.",
    userPrompt: orchestratorPrompt,
  })
  const parsed = parseJsonFromModelText(raw)
  const parsedAgents = Array.isArray(parsed?.agents) ? parsed.agents : []
  const normalizedAgents: AgentNode[] = parsedAgents.map((agent: any, idx: number) => ({
    id: String(agent?.id || `agent-${idx + 1}`),
    role: String(agent?.role || "worker"),
    model: String(agent?.model || project.modelRouting?.scriptWriter || "gpt-5-nano"),
    responsibilities: Array.isArray(agent?.responsibilities) ? agent.responsibilities.map(String) : [],
    tools: Array.isArray(agent?.tools) && agent.tools.length > 0 ? agent.tools.map(String) : [...defaultTools],
    handoffTo: Array.isArray(agent?.handoffTo) ? agent.handoffTo.map(String) : [],
  }))

  if (normalizedAgents.length === 0) {
    const roleMap = new Map<string, AgentNode>()
    for (const task of run.workflowPlan.tasks) {
      const key = task.owner.toLowerCase().trim() || "orchestrator"
      if (!roleMap.has(key)) {
        roleMap.set(key, {
          id: `agent-${key.replace(/\s+/g, "-")}`,
          role: key,
          model: key.includes("plan") || key.includes("orchestrator")
            ? project.modelRouting?.brainModel || "gpt-5.2"
            : project.modelRouting?.scriptWriter || "gpt-5-nano",
          responsibilities: [],
          tools: [...defaultTools],
          handoffTo: [],
        })
      }
      roleMap.get(key)!.responsibilities.push(`${task.id}: ${task.title}`)
    }
    const fallback = Array.from(roleMap.values())
    for (let i = 0; i < fallback.length; i++) {
      fallback[i].handoffTo = fallback.filter((_, idx) => idx !== i).slice(0, 2).map((agent) => agent.id)
    }
    run.agentGraph = {
      orchestrator: project.modelRouting?.brainModel || "gpt-5.2",
      agents: fallback,
    }
  } else {
    run.agentGraph = {
      orchestrator: String(parsed?.orchestrator || project.modelRouting?.brainModel || "gpt-5.2"),
      agents: normalizedAgents,
    }
  }

  setStepStatus(run, "agent_orchestration", "completed", { agentGraph: run.agentGraph })
  saveRun(run)
}

function getFailureSignature(reasons: string[]): string {
  return reasons.slice(0, 3).join("|").toLowerCase().trim()
}

async function runExecutionLoop(
  run: AutopilotRun,
  deps: RegisterAutopilotRoutesOptions,
  revisionFeedback?: string
): Promise<void> {
  const project = getProject(run.projectId)
  if (!project) throw new Error("Project not found")
  if (!run.workflowPlan) throw new Error("Workflow plan missing")
  if (!run.agentGraph) throw new Error("Agent graph missing")

  setStepStatus(run, "script_generation", "processing")
  run.status = "running"
  saveRun(run)

  const maxIterations = Math.max(2, project.brainConfig?.maxAutoRevisions || 3)
  const metrics: LoopMetrics = {
    maxIterations,
    iterations: [],
    finalScore: 0,
    stoppedReason: "max_iterations",
    repeatedFailureSignatureCount: 0,
  }

  const failureSignatureCounter = new Map<string, number>()
  let scriptDraft = ""
  let prompts: string[] = []
  let durations: number[] = []
  let finalArtifact = ""
  let finalChecklist: Array<{ criterion: string; passed: boolean; note: string }> = []
  const targetSceneCount = run.format === "short"
    ? Math.max(4, project.production.sceneCount.min)
    : project.production.sceneCount.max
  const wordCountTarget = getWordCountTarget(run)
  if (wordCountTarget) {
    run.targetWordCount = wordCountTarget.targetWords
    run.targetWordRange = { min: wordCountTarget.minWords, max: wordCountTarget.maxWords }
  }
  let currentRevisionFeedback = revisionFeedback?.trim() || ""

  for (let i = 1; i <= maxIterations; i++) {
    const iterationFeedback = currentRevisionFeedback
    const pacingInstruction = wordCountTarget
      ? `
Target transcript duration: ${wordCountTarget.targetSeconds} seconds.
Target word count: ${wordCountTarget.targetWords} words.
Hard constraint: keep the script between ${wordCountTarget.minWords} and ${wordCountTarget.maxWords} words to match pacing.
`
      : ""
    const scriptPrompt = `
Create a production-ready script for this project.
Topic: ${run.topic}
Format: ${run.format || "long"}
Iteration: ${i}/${maxIterations}
Revision feedback: ${iterationFeedback || "none"}
Rules:
${JSON.stringify(run.rulesContext || {}, null, 2)}
Plan:
${JSON.stringify(run.workflowPlan, null, 2)}
${pacingInstruction}
`
    scriptDraft = await deps.generateText({
      model: project.modelRouting?.scriptWriter || "gpt-5.2",
      systemPrompt: "You are the scriptwriter role. Produce branded, consistent, production-ready script output.",
      userPrompt: scriptPrompt,
    })
    const scriptWordCount = getRunWordCount(scriptDraft)

    setStepStatus(run, "script_generation", "completed", {
      scriptDraft,
      iteration: i,
      scriptWordCount,
      targetTranscriptSeconds: wordCountTarget?.targetSeconds,
      targetWordCount: wordCountTarget?.targetWords,
      targetWordRange: wordCountTarget
        ? { min: wordCountTarget.minWords, max: wordCountTarget.maxWords }
        : undefined,
    })
    setStepStatus(run, "scene_split_to_prompts", "processing")
    saveRun(run)
    const extracted = await deps.extractScenes({
      script: scriptDraft,
      model: project.modelRouting?.sceneExtractor || "gpt-5-nano",
      projectMemoryContext: buildMemoryPromptContext(run.projectId, 1400),
      desiredPromptCount: targetSceneCount,
    })
    prompts = extracted.prompts
    durations = extracted.durations
    setStepStatus(run, "scene_split_to_prompts", "completed", {
      prompts,
      durations,
      iteration: i,
    })

    setStepStatus(run, "imagery_generation", "processing")
    const imageryPlan = prompts.map((prompt, idx) => ({
      scene: idx + 1,
      prompt,
      style: run.rulesContext?.promptRules?.imageryRecipe?.structure || "default",
    }))
    setStepStatus(run, "imagery_generation", "completed", { imageryPlan })

    setStepStatus(run, "video_generation", "processing")
    const videoPlan = prompts.map((prompt, idx) => ({
      scene: idx + 1,
      prompt,
      duration: Number(durations[idx] || project.production.videoDuration || 6),
    }))
    setStepStatus(run, "video_generation", "completed", { videoPlan })

    setStepStatus(run, "quality_gate", "processing")
    finalArtifact = [
      `Script:\n${scriptDraft}`,
      `Prompts:\n${prompts.map((p, idx) => `${idx + 1}. ${p}`).join("\n")}`,
      `Rules:\n${JSON.stringify(run.rulesContext || {}, null, 2)}`,
    ].join("\n\n")

    let quality: {
      score: number
      passed: boolean
      reasons: string[]
      checklist: Array<{ criterion: string; passed: boolean; note: string }>
    }
    if (project.brainConfig?.enabled) {
      const evaluated = await deps.brain.evaluateExecutionQuality(
        finalArtifact,
        [
          ...run.workflowPlan.acceptanceCriteria,
          ...(run.rulesContext?.promptRules?.validationChecklist || []),
        ]
      )
      quality = {
        score: Number(evaluated.score || 0),
        passed: Boolean(evaluated.passed),
        reasons: Array.isArray(evaluated.reasons) ? evaluated.reasons : [],
        checklist: Array.isArray(evaluated.checklist) ? evaluated.checklist : [],
      }
    } else {
      quality = {
        score: finalArtifact.length > 400 ? 84 : 65,
        passed: finalArtifact.length > 400,
        reasons: finalArtifact.length > 400 ? [] : ["Output is too short to satisfy acceptance criteria."],
        checklist: [...run.workflowPlan.acceptanceCriteria, ...(run.rulesContext?.promptRules?.validationChecklist || [])].map((criterion) => ({
          criterion,
          passed: finalArtifact.toLowerCase().includes(criterion.toLowerCase().slice(0, 14)),
          note: "Heuristic local check.",
        })),
      }
    }
    const currentWordCount = getRunWordCount(scriptDraft)
    let pacingViolation = ""
    if (wordCountTarget) {
      const pacingCriterion = `Script pacing target (${wordCountTarget.minWords}-${wordCountTarget.maxWords} words for ${wordCountTarget.targetSeconds}s)`
      const violation = getWordCountViolation(currentWordCount, wordCountTarget)
      pacingViolation = violation
      quality.checklist = quality.checklist.filter((item) => item.criterion !== pacingCriterion)
      quality.checklist.push({
        criterion: pacingCriterion,
        passed: !violation,
        note: violation || `Script pacing is on target at ${currentWordCount} words.`,
      })
      if (violation) {
        quality.passed = false
        quality.score = Math.max(0, quality.score - 15)
        quality.reasons = [...quality.reasons, violation]
      }
    }
    let nextRevisionFeedback = currentRevisionFeedback
    if (pacingViolation && wordCountTarget) {
      nextRevisionFeedback = `${pacingViolation} Rewrite the full script to land between ${wordCountTarget.minWords}-${wordCountTarget.maxWords} words while preserving story flow and constraints.`
    } else if (!quality.passed && quality.reasons.length > 0) {
      nextRevisionFeedback = `Revise based on quality gate findings: ${quality.reasons.slice(0, 3).join(" ")}`
    }

    const signature = getFailureSignature(quality.reasons || [])
    if (signature) {
      failureSignatureCounter.set(signature, (failureSignatureCounter.get(signature) || 0) + 1)
      const repeats = failureSignatureCounter.get(signature) || 0
      metrics.repeatedFailureSignatureCount = Math.max(metrics.repeatedFailureSignatureCount, repeats)
      if (!quality.passed && repeats >= 2) {
        metrics.iterations.push({
          iteration: i,
          producedOutput: finalArtifact,
          score: quality.score,
          passed: false,
          failureReasons: [...quality.reasons, "Fail-fast triggered due to repeated failure signature."],
          revisedFromFeedback: iterationFeedback || undefined,
          createdAt: Date.now(),
        })
        metrics.finalScore = quality.score
        metrics.stoppedReason = "max_iterations"
        finalChecklist = quality.checklist || []
        break
      }
    }

    metrics.iterations.push({
      iteration: i,
      producedOutput: finalArtifact,
      score: quality.score,
      passed: quality.passed,
      failureReasons: quality.reasons || [],
      revisedFromFeedback: iterationFeedback || undefined,
      createdAt: Date.now(),
    })
    metrics.finalScore = quality.score
    finalChecklist = quality.checklist || []

    if (quality.passed) {
      metrics.stoppedReason = "passed"
      break
    }
    currentRevisionFeedback = nextRevisionFeedback
  }

  const imageryPlan = prompts.map((prompt, idx) => ({
    scene: idx + 1,
    prompt,
    style: run.rulesContext?.promptRules?.imageryRecipe?.structure || "default",
  }))
  const videoPlan = prompts.map((prompt, idx) => ({
    scene: idx + 1,
    prompt,
    duration: Number(durations[idx] || project.production.videoDuration || 6),
  }))

  run.loopMetrics = metrics
  const finalWordCount = getRunWordCount(scriptDraft)
  const finalPacingViolation = wordCountTarget
    ? getWordCountViolation(finalWordCount, wordCountTarget)
    : ""
  run.runtimeEstimateSeconds = estimateRuntimeSeconds(scriptDraft, durations, run.format || "long")
  const durationWarning = run.format === "short" && run.runtimeEstimateSeconds > 180
    ? "Estimated runtime is long for short format."
    : run.format === "long" && run.runtimeEstimateSeconds > 0 && run.runtimeEstimateSeconds < 360
      ? "Estimated runtime may be short for long format."
      : ""
  run.finalDeliverable = {
    summary: `Autopilot completed ${metrics.iterations.length} execution iteration(s) with final score ${metrics.finalScore}.`,
    artifact: finalArtifact,
    acceptanceCriteriaResults: finalChecklist,
    scriptDraft,
    wordCount: finalWordCount,
    targetTranscriptSeconds: wordCountTarget?.targetSeconds,
    targetWordCount: wordCountTarget?.targetWords,
    targetWordRange: wordCountTarget
      ? { min: wordCountTarget.minWords, max: wordCountTarget.maxWords }
      : undefined,
    prompts,
    durations,
    imageryPlan,
    videoPlan,
    qaSummary: finalChecklist.filter((item) => !item.passed).length === 0
      ? "All quality checks passed."
      : `${finalChecklist.filter((item) => !item.passed).length} checks need attention.`,
  }
  if (durationWarning) {
    run.finalDeliverable.qaSummary = `${run.finalDeliverable.qaSummary} ${durationWarning}`.trim()
  }
  if (finalPacingViolation) {
    run.finalDeliverable.qaSummary = `${run.finalDeliverable.qaSummary} ${finalPacingViolation}`.trim()
  }
  appendArtifactVersion(run, `Execution loop generated deliverable with score ${metrics.finalScore}.`)

  setStepStatus(run, "quality_gate", "completed", {
    loopMetrics: run.loopMetrics,
    finalDeliverable: run.finalDeliverable,
  })
  setStepStatus(run, "review_package", "completed", {
    summary: run.finalDeliverable.summary,
    acceptanceCriteriaResults: run.finalDeliverable.acceptanceCriteriaResults,
    scriptDraft: run.finalDeliverable.scriptDraft,
    promptCount: run.finalDeliverable.prompts?.length || 0,
  })
  setStepStatus(run, "final_approval", "awaiting_approval", {
    finalDeliverable: run.finalDeliverable,
  })
  run.approvalState.finalApproval = "pending"
  run.status = "awaiting_approval"
  run.currentStep = "final_approval"
  saveRun(run)
}

function finalizeRun(run: AutopilotRun): AutopilotRun {
  setStepStatus(run, "final_approval", "completed")
  setStepStatus(run, "memory_update_archive", "processing")

  const summary = run.finalDeliverable?.summary || `Completed autopilot run for topic "${run.topic}".`
  addMemoryEntry(run.projectId, {
    decision: `Approved final autopilot package for run ${run.runId}`,
    feedback: "Owner approved final workflow deliverable.",
    writingNote: `Run produced ${run.loopMetrics?.iterations.length || 0} loop iterations.`,
    episode: {
      title: run.topic,
      summary,
      approvedScript: run.finalDeliverable?.artifact || "",
    },
  })

  setStepStatus(run, "memory_update_archive", "completed", { summary })
  run.status = "completed"
  run.currentStep = "memory_update_archive"
  run.approvalState.finalApproval = "approved"
  appendArtifactVersion(run, "Owner approved final package and run archived.")
  saveRun(run)
  const pkg = upsertDraftPackageFromRun(run)
  saveDraftPackage({ ...pkg, status: "archived" })
  updateProject(run.projectId, { currentPipelineRun: null })
  return run
}

function ensureRunHasDefaults(run: AutopilotRun): void {
  if (!Array.isArray((run as any).steps) || (run as any).steps.length === 0) {
    run.steps = defaultSteps()
  }
  if (!(run as any).approvalState) {
    ;(run as any).approvalState = { planApproval: "pending", finalApproval: "pending" }
  }
  if (!Array.isArray((run as any).artifacts)) {
    run.artifacts = []
  }
  if (run.format !== "short" && run.format !== "long") {
    run.format = "long"
  }
  if (!run.currentStep) {
    run.currentStep = STEP_ORDER[0]
  }
}

function resetRunForRecheck(run: AutopilotRun): void {
  const resetSteps: AutopilotStepId[] = [
    "script_generation",
    "scene_split_to_prompts",
    "imagery_generation",
    "video_generation",
    "quality_gate",
    "review_package",
    "final_approval",
    "memory_update_archive",
  ]
  for (const stepId of resetSteps) {
    const step = run.steps.find((s) => s.id === stepId)
    if (!step) continue
    step.status = "pending"
    delete step.startedAt
    delete step.completedAt
    delete step.output
    delete step.error
  }
  run.status = "running"
  run.currentStep = "script_generation"
  run.approvalState.finalApproval = "pending"
}

async function ensureRunReadyForExecutionLoop(
  run: AutopilotRun,
  deps: RegisterAutopilotRoutesOptions,
  feedbackForPlanIfGenerated?: string
): Promise<void> {
  ensureRunHasDefaults(run)
  const project = getProject(run.projectId)
  if (!project) throw new Error("Project not found")
  if (!run.rulesContext) {
    run.rulesContext = resolveRulesContext(project)
  }

  if (!run.workflowPlan) {
    await generateWorkflowPlan(run, deps, feedbackForPlanIfGenerated)
    // Autopilot actions/fix flows should not dead-end on plan approval.
    setStepStatus(run, "plan_approval", "completed", { approvedAt: Date.now(), autoApproved: true })
    run.approvalState.planApproval = "approved"
    run.status = "running"
  } else if (run.approvalState.planApproval !== "approved") {
    run.approvalState.planApproval = "approved"
    setStepStatus(run, "plan_approval", "completed", { approvedAt: Date.now(), autoApproved: true })
  }

  if (!run.agentGraph) {
    await setupAgentGraphFromPlan(run, deps)
  }

  saveRun(run)
}

export function registerAutopilotRoutes(options: RegisterAutopilotRoutesOptions): void {
  const { app, port, generateText, extractScenes, brain } = options
  const deps = { app, port, generateText, extractScenes, brain }

  async function continueRunPipeline(run: AutopilotRun, autoApprovePlan: boolean): Promise<void> {
    try {
      await generateBrainstorm(run, deps)
      upsertDraftPackageFromRun(run)
      await generateWorkflowPlan(run, deps)
      upsertDraftPackageFromRun(run)
      if (autoApprovePlan) {
        setStepStatus(run, "plan_approval", "completed", { approvedAt: Date.now(), autoApproved: true })
        run.approvalState.planApproval = "approved"
        await setupAgentGraphFromPlan(run, deps)
        await runExecutionLoop(run, deps)
        upsertDraftPackageFromRun(run)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Pipeline execution failed"
      run.status = "failed"
      setStepStatus(run, run.currentStep, "failed", undefined, message)
      saveRun(run)
      upsertDraftPackageFromRun(run)
      updateProject(run.projectId, { currentPipelineRun: null })
      console.error("[Autopilot] async pipeline failed:", error)
    }
  }

  app.get("/api/autopilot/graphs/templates", (req, res) => {
    try {
      const projectId = typeof req.query.projectId === "string" ? req.query.projectId : ""
      const subprojectId = typeof req.query.subprojectId === "string" ? req.query.subprojectId : undefined
      if (!projectId) {
        return res.status(400).json({ message: "projectId is required" })
      }
      const project = getProject(projectId)
      if (!project) {
        return res.status(404).json({ message: "Project not found" })
      }
      if (subprojectId && !getSubproject(projectId, subprojectId)) {
        return res.status(404).json({ message: "Subproject not found" })
      }
      return res.json(listTemplates(projectId, subprojectId))
    } catch (error) {
      console.error("[Autopilot] failed to list graph templates:", error)
      return res.status(500).json({ message: "Failed to list templates" })
    }
  })

  app.get("/api/autopilot/graphs/templates/:templateId", (req, res) => {
    try {
      const projectId = typeof req.query.projectId === "string" ? req.query.projectId : ""
      const subprojectId = typeof req.query.subprojectId === "string" ? req.query.subprojectId : undefined
      if (!projectId) {
        return res.status(400).json({ message: "projectId is required" })
      }
      const project = getProject(projectId)
      if (!project) {
        return res.status(404).json({ message: "Project not found" })
      }
      const parsedVersion = typeof req.query.version === "string" ? Number(req.query.version) : undefined
      const template = loadTemplate(
        projectId,
        req.params.templateId,
        Number.isFinite(parsedVersion) ? parsedVersion : undefined,
        subprojectId
      )
      if (!template) {
        return res.status(404).json({ message: "Template not found" })
      }
      return res.json(template)
    } catch (error) {
      console.error("[Autopilot] failed to load graph template:", error)
      return res.status(500).json({ message: "Failed to load template" })
    }
  })

  app.post("/api/autopilot/graphs/templates", (req, res) => {
    try {
      const { projectId, subprojectId, name, description, nodes, edges, defaults, tags } = req.body || {}
      if (!projectId || typeof projectId !== "string") {
        return res.status(400).json({ message: "projectId is required" })
      }
      const project = getProject(projectId)
      if (!project) {
        return res.status(404).json({ message: "Project not found" })
      }
      if (typeof subprojectId === "string" && subprojectId.trim() && !getSubproject(projectId, subprojectId)) {
        return res.status(404).json({ message: "Subproject not found" })
      }
      const templateId = `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const template = saveTemplateVersion({
        templateId,
        projectId,
        subprojectId: typeof subprojectId === "string" && subprojectId.trim() ? subprojectId.trim() : undefined,
        name: typeof name === "string" && name.trim() ? name.trim() : "Untitled Workflow",
        description: typeof description === "string" ? description : "",
        tags: Array.isArray(tags) ? tags.map(String) : [],
        nodes: Array.isArray(nodes) ? nodes : [],
        edges: Array.isArray(edges) ? edges : [],
        defaults: defaults && typeof defaults === "object" ? defaults : undefined,
      })
      return res.json(template)
    } catch (error) {
      console.error("[Autopilot] failed to create graph template:", error)
      return res.status(500).json({ message: "Failed to create template" })
    }
  })

  app.post("/api/autopilot/graphs/templates/:templateId/versions", (req, res) => {
    try {
      const { projectId, subprojectId, name, description, nodes, edges, defaults, tags } = req.body || {}
      if (!projectId || typeof projectId !== "string") {
        return res.status(400).json({ message: "projectId is required" })
      }
      const project = getProject(projectId)
      if (!project) {
        return res.status(404).json({ message: "Project not found" })
      }
      if (typeof subprojectId === "string" && subprojectId.trim() && !getSubproject(projectId, subprojectId)) {
        return res.status(404).json({ message: "Subproject not found" })
      }
      const latest = loadTemplate(
        projectId,
        req.params.templateId,
        undefined,
        typeof subprojectId === "string" && subprojectId.trim() ? subprojectId.trim() : undefined
      )
      if (!latest) {
        return res.status(404).json({ message: "Template not found" })
      }
      const next = saveTemplateVersion({
        templateId: latest.templateId,
        projectId: latest.projectId,
        subprojectId: typeof subprojectId === "string" && subprojectId.trim() ? subprojectId.trim() : undefined,
        name: typeof name === "string" && name.trim() ? name.trim() : latest.name,
        description: typeof description === "string" ? description : latest.description || "",
        tags: Array.isArray(tags) ? tags.map(String) : latest.tags || [],
        nodes: Array.isArray(nodes) ? nodes : latest.nodes,
        edges: Array.isArray(edges) ? edges : latest.edges,
        defaults: defaults && typeof defaults === "object" ? defaults : latest.defaults,
      })
      return res.json(next)
    } catch (error) {
      console.error("[Autopilot] failed to create template version:", error)
      return res.status(500).json({ message: "Failed to save template version" })
    }
  })

  app.get("/api/autopilot/subprojects", (req, res) => {
    try {
      const projectId = typeof req.query.projectId === "string" ? req.query.projectId : ""
      if (!projectId) return res.status(400).json({ message: "projectId is required" })
      const project = getProject(projectId)
      if (!project) return res.status(404).json({ message: "Project not found" })
      return res.json(listSubprojects(projectId))
    } catch (error) {
      console.error("[Autopilot] failed to list subprojects:", error)
      return res.status(500).json({ message: "Failed to list subprojects" })
    }
  })

  app.post("/api/autopilot/subprojects", (req, res) => {
    try {
      const { projectId, name, storyTitle, description } = req.body || {}
      if (!projectId || typeof projectId !== "string") {
        return res.status(400).json({ message: "projectId is required" })
      }
      const project = getProject(projectId)
      if (!project) return res.status(404).json({ message: "Project not found" })
      const normalizedName = typeof name === "string" && name.trim()
        ? name.trim()
        : typeof storyTitle === "string" && storyTitle.trim()
          ? storyTitle.trim()
          : "Untitled Story"
      const created = createSubproject(projectId, {
        name: normalizedName,
        storyTitle: typeof storyTitle === "string" && storyTitle.trim() ? storyTitle.trim() : normalizedName,
        description: typeof description === "string" ? description : "",
      })
      return res.status(201).json(created)
    } catch (error) {
      console.error("[Autopilot] failed to create subproject:", error)
      return res.status(500).json({ message: "Failed to create subproject" })
    }
  })

  app.post("/api/autopilot/graphs/test-node", async (req, res) => {
    try {
      const {
        projectId,
        nodeType,
        nodeTitle,
        config,
        upstreamContext,
        resolvedRules,
      } = req.body || {}
      if (!projectId || typeof projectId !== "string") {
        return res.status(400).json({ message: "projectId is required" })
      }
      if (!nodeType || typeof nodeType !== "string") {
        return res.status(400).json({ message: "nodeType is required" })
      }
      const project = getProject(projectId)
      if (!project) {
        return res.status(404).json({ message: "Project not found" })
      }

      const safeConfig = config && typeof config === "object" ? config : {}
      const userPrompt = String((safeConfig as any).__prompt || "").trim()
      const systemNotes = String((safeConfig as any).__system || "").trim()
      const rawTestInput = String((safeConfig as any).__testInput || "").trim()
      const safeUpstreamContext = Array.isArray(upstreamContext) ? upstreamContext : []
      const safeResolvedRules = Array.isArray(resolvedRules) ? resolvedRules : []
      let parsedTestInput: unknown = rawTestInput
      if (rawTestInput.startsWith("{") || rawTestInput.startsWith("[")) {
        try {
          parsedTestInput = JSON.parse(rawTestInput)
        } catch {
          parsedTestInput = rawTestInput
        }
      }

      const model =
        project.modelRouting?.scriptWriter ||
        project.modelRouting?.brainModel ||
        project.modelRouting?.chatWorker ||
        "gpt-5-nano"

      const prompt = `
You are testing one isolated workflow node for a graph editor.

Node type: ${nodeType}
Node title: ${typeof nodeTitle === "string" ? nodeTitle : nodeType}
Project: ${project.name}

Node config:
${JSON.stringify(safeConfig, null, 2)}

Upstream connected node context:
${JSON.stringify(safeUpstreamContext, null, 2)}

Resolved rulesets from connected nodes:
${JSON.stringify(safeResolvedRules, null, 2)}

Node prompt:
${userPrompt || "No explicit node prompt provided."}

System notes:
${systemNotes || "None"}

Test input:
${typeof parsedTestInput === "string" ? parsedTestInput : JSON.stringify(parsedTestInput, null, 2)}

Return a concise result for this node test:
1) What the node would do
2) The produced output draft/structure
3) Any risks or missing inputs
4) How it adheres to connected rulesets
`

      const fallbackOutput = [
        `Node test fallback for ${nodeType}.`,
        userPrompt
          ? `Would execute with prompt: ${userPrompt}`
          : "No explicit node prompt provided; would use node defaults.",
        `Config keys: ${Object.keys(safeConfig).join(", ") || "none"}`,
        `Connected rulesets: ${safeResolvedRules.length}`,
      ].join("\n")

      let output = fallbackOutput
      try {
        const timeoutMs = 12000
        const generated = await Promise.race([
          generateText({
            model,
            systemPrompt: "You simulate workflow node execution for iterative node testing.",
            userPrompt: prompt,
          }),
          new Promise<string>((_, reject) => {
            setTimeout(() => reject(new Error("Node test timed out")), timeoutMs)
          }),
        ])
        output = generated
      } catch (testModelError) {
        console.warn("[Autopilot] test-node fallback used:", testModelError)
      }

      return res.json({
        ok: true,
        model,
        output,
        promptPreview: prompt.slice(0, 1200),
      })
    } catch (error) {
      console.error("[Autopilot] test-node failed:", error)
      return res.status(500).json({ message: error instanceof Error ? error.message : "Node test failed" })
    }
  })

  app.get("/api/autopilot/graphs/runs/:runId", (req, res) => {
    try {
      const run = getRunById(req.params.runId)
      if (!run) return res.status(404).json({ message: "Run not found" })
      const graph = loadRunGraph(run.projectId, run.runId, run.subprojectId)
      if (!graph) return res.status(404).json({ message: "Run graph not found" })
      return res.json(graph)
    } catch (error) {
      console.error("[Autopilot] run graph fetch failed:", error)
      return res.status(500).json({ message: "Failed to load run graph" })
    }
  })

  app.get("/api/autopilot/graphs/runs/:runId/artifacts", (req, res) => {
    try {
      const run = getRunById(req.params.runId)
      if (!run) return res.status(404).json({ message: "Run not found" })
      const graph = loadRunGraph(run.projectId, run.runId, run.subprojectId)
      if (!graph) return res.status(404).json({ message: "Run graph not found" })
      const artifacts = graph.nodes.flatMap((node) => Array.isArray(node.artifacts) ? node.artifacts : [])
      return res.json({
        runId: graph.runId,
        projectId: graph.projectId,
        subprojectId: (graph as any).subprojectId || run.subprojectId || null,
        source: graph.source,
        artifacts,
      })
    } catch (error) {
      console.error("[Autopilot] graph artifacts fetch failed:", error)
      return res.status(500).json({ message: "Failed to load graph artifacts" })
    }
  })

  app.get("/api/autopilot/artifacts/preview", (req, res) => {
    try {
      const projectId = typeof req.query.projectId === "string" ? req.query.projectId : ""
      const relPath = typeof req.query.relPath === "string" ? req.query.relPath : ""
      if (!projectId || !relPath) {
        return res.status(400).json({ message: "projectId and relPath are required" })
      }
      const project = getProject(projectId)
      if (!project) return res.status(404).json({ message: "Project not found" })
      const safePath = resolveSafeProjectPath(projectId, relPath)
      if (!safePath) {
        return res.status(400).json({ message: "Invalid artifact path" })
      }
      if (!fs.existsSync(safePath) || !fs.statSync(safePath).isFile()) {
        return res.status(404).json({ message: "Artifact not found" })
      }

      const mime = toPreviewMime(safePath)
      const extension = path.extname(safePath).toLowerCase()
      if (extension === ".md" || extension === ".txt" || extension === ".json" || extension === ".jsonl") {
        const content = fs.readFileSync(safePath, "utf-8")
        return res.json({
          relPath,
          mime,
          content,
        })
      }

      res.setHeader("Content-Type", mime)
      return res.sendFile(safePath)
    } catch (error) {
      console.error("[Autopilot] artifact preview failed:", error)
      return res.status(500).json({ message: "Failed to preview artifact" })
    }
  })

  app.get("/api/autopilot/artifacts/download", (req, res) => {
    try {
      const projectId = typeof req.query.projectId === "string" ? req.query.projectId : ""
      const relPath = typeof req.query.relPath === "string" ? req.query.relPath : ""
      if (!projectId || !relPath) {
        return res.status(400).json({ message: "projectId and relPath are required" })
      }
      const project = getProject(projectId)
      if (!project) return res.status(404).json({ message: "Project not found" })
      const safePath = resolveSafeProjectPath(projectId, relPath)
      if (!safePath) {
        return res.status(400).json({ message: "Invalid artifact path" })
      }
      if (!fs.existsSync(safePath) || !fs.statSync(safePath).isFile()) {
        return res.status(404).json({ message: "Artifact not found" })
      }
      return res.download(safePath, path.basename(safePath))
    } catch (error) {
      console.error("[Autopilot] artifact download failed:", error)
      return res.status(500).json({ message: "Failed to download artifact" })
    }
  })

  app.post("/api/autopilot/start", async (req, res) => {
    try {
      const {
        projectId,
        topic,
        scheduled,
        autoApprovePlan,
        format,
        packageId,
        targetTranscriptSeconds,
        templateId,
        templateVersion,
        subprojectId,
      } = req.body || {}
      if (!projectId || typeof projectId !== "string") {
        return res.status(400).json({ message: "projectId is required" })
      }
      const project = getProject(projectId)
      if (!project) return res.status(404).json({ message: "Project not found" })
      let resolvedSubprojectId: string | undefined
      if (typeof subprojectId === "string" && subprojectId.trim()) {
        const existing = getSubproject(projectId, subprojectId.trim())
        if (!existing) return res.status(404).json({ message: "Subproject not found" })
        resolvedSubprojectId = existing.id
      } else if (typeof topic === "string" && topic.trim()) {
        const createdSubproject = createSubproject(projectId, {
          name: topic.trim(),
          storyTitle: topic.trim(),
          description: "Auto-created from Autopilot run topic",
        })
        resolvedSubprojectId = createdSubproject.id
      }
      let selectedTemplate: GraphTemplate | null = null
      if (typeof templateId === "string" && templateId.trim()) {
        const parsedTemplateVersion = Number(templateVersion)
        selectedTemplate = loadTemplate(
          projectId,
          templateId,
          Number.isFinite(parsedTemplateVersion) ? parsedTemplateVersion : undefined,
          resolvedSubprojectId
        )
        if (!selectedTemplate) {
          return res.status(400).json({ message: "Selected workflow template was not found" })
        }
      }
      let normalizedTargetSeconds: number | undefined
      if (targetTranscriptSeconds !== undefined && targetTranscriptSeconds !== null && targetTranscriptSeconds !== "") {
        const parsedTarget = Number(targetTranscriptSeconds)
        if (!Number.isFinite(parsedTarget) || parsedTarget <= 0) {
          return res.status(400).json({ message: "targetTranscriptSeconds must be a positive number" })
        }
        normalizedTargetSeconds = Math.min(Math.round(parsedTarget), 7200)
      }

      const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const normalizedFormat = format === "short" ? "short" : "long"
      const startWordTarget = normalizedTargetSeconds
        ? estimateTargetWordCount(normalizedTargetSeconds, normalizedFormat)
        : undefined
      const startWordRange = startWordTarget
        ? estimateTargetWordRange(startWordTarget)
        : undefined
      const run: AutopilotRun = {
        runId,
        projectId,
        subprojectId: resolvedSubprojectId,
        packageId: undefined,
        topic: typeof topic === "string" && topic.trim() ? topic.trim() : "Untitled Project Workflow",
        format: normalizedFormat,
        targetTranscriptSeconds: normalizedTargetSeconds,
        targetWordCount: startWordTarget,
        targetWordRange: startWordRange,
        status: "running",
        currentStep: STEP_ORDER[0],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        steps: defaultSteps(),
        source: scheduled ? "scheduled" : "manual",
        approvalState: {
          planApproval: "pending",
          finalApproval: "pending",
        },
      }
      if (selectedTemplate) {
        run.graphRef = { templateId: selectedTemplate.templateId, version: selectedTemplate.version }
      }
      run.rulesContext = resolveRulesContext(project)
      const template = project.categoryTemplateId ? getCategoryTemplate(project.categoryTemplateId) : null
      run.templateVersion = selectedTemplate
        ? `${selectedTemplate.templateId}:v${selectedTemplate.version}`
        : template
          ? String(template.updatedAt)
          : "none"
      run.rulesVersion = String(project.updatedAt)
      run.artifacts = []

      const linkedPackage = packageId && typeof packageId === "string"
        ? getDraftPackageById(packageId)
        : null
      const nextPackage = linkedPackage || createDraftPackage({
        projectId,
        topic: run.topic,
        format: run.format || "long",
        status: scheduled ? "scheduled" : "in_progress",
      })
      run.packageId = nextPackage.packageId

      updateProject(projectId, { currentPipelineRun: runId })
      saveRun(run)
      const createdPackage = upsertDraftPackageFromRun(run)
      // Return immediately so UI never blocks; pipeline continues in background.
      setTimeout(() => {
        continueRunPipeline(run, Boolean(autoApprovePlan)).catch((error) => {
          console.error("[Autopilot] background pipeline error:", error)
        })
      }, 0)
      return res.json({
        run,
        package: createdPackage,
      })
    } catch (error) {
      console.error("[Autopilot] start failed:", error)
      return res.status(500).json({ message: error instanceof Error ? error.message : "Failed to start autopilot run" })
    }
  })

  app.get("/api/autopilot/status/:runId", (req, res) => {
    try {
      const run = getRunById(req.params.runId)
      if (!run) return res.status(404).json({ message: "Run not found" })
      return res.json(run)
    } catch {
      return res.status(500).json({ message: "Failed to fetch run status" })
    }
  })

  app.get("/api/autopilot/runs", (req, res) => {
    try {
      const projectId = typeof req.query.projectId === "string" ? req.query.projectId : ""
      const subprojectId = typeof req.query.subprojectId === "string" ? req.query.subprojectId : undefined
      if (!projectId) return res.status(400).json({ message: "projectId is required" })
      const project = getProject(projectId)
      if (!project) return res.status(404).json({ message: "Project not found" })
      if (subprojectId && !getSubproject(projectId, subprojectId)) {
        return res.status(404).json({ message: "Subproject not found" })
      }
      const limitRaw = Number(req.query.limit || 30)
      const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, Math.round(limitRaw))) : 30
      const runs = listRuns(projectId, subprojectId).slice(0, limit).map((run) => ({
        runId: run.runId,
        topic: run.topic,
        subprojectId: run.subprojectId || null,
        status: run.status,
        source: run.source || "manual",
        currentStep: run.currentStep,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
        artifactCount: buildRunArtifacts(run).length,
      }))
      return res.json(runs)
    } catch (error) {
      console.error("[Autopilot] run history failed:", error)
      return res.status(500).json({ message: "Failed to list runs" })
    }
  })

  app.get("/api/autopilot/runs/:runId/artifacts", (req, res) => {
    try {
      const run = getRunById(req.params.runId)
      if (!run) return res.status(404).json({ message: "Run not found" })
      return res.json({
        runId: run.runId,
        projectId: run.projectId,
        subprojectId: run.subprojectId || null,
        source: run.source || "manual",
        artifacts: buildRunArtifacts(run),
      })
    } catch (error) {
      console.error("[Autopilot] run artifacts failed:", error)
      return res.status(500).json({ message: "Failed to load run artifacts" })
    }
  })

  app.post("/api/autopilot/approve/:runId/:step", async (req, res) => {
    try {
      const { runId, step } = req.params
      const run = getRunById(runId)
      if (!run) return res.status(404).json({ message: "Run not found" })
      if (run.status === "aborted" || run.status === "completed") {
        return res.status(400).json({ message: `Run is ${run.status}` })
      }

      if (step === "plan_approval") {
        setStepStatus(run, "plan_approval", "completed", { approvedAt: Date.now() })
        run.approvalState.planApproval = "approved"
        await setupAgentGraphFromPlan(run, { app, port, generateText, extractScenes, brain })
        await runExecutionLoop(run, { app, port, generateText, extractScenes, brain })
        upsertDraftPackageFromRun(run)
        return res.json(run)
      }
      if (step === "final_approval") {
        const next = finalizeRun(run)
        return res.json(next)
      }

      return res.status(400).json({ message: `Unknown or non-approvable step: ${step}` })
    } catch (error) {
      console.error("[Autopilot] approve failed:", error)
      return res.status(500).json({ message: error instanceof Error ? error.message : "Approve failed" })
    }
  })

  app.post("/api/autopilot/revise/:runId/:step", async (req, res) => {
    try {
      const { runId, step } = req.params
      const feedback = String(req.body?.feedback || "Revision requested")
      const run = getRunById(runId)
      if (!run) return res.status(404).json({ message: "Run not found" })
      const project = getProject(run.projectId)
      if (!project) return res.status(404).json({ message: "Project not found" })

      if (step === "plan_approval") {
        run.approvalState.planApproval = "rejected"
        setStepStatus(run, "plan_approval", "processing", { feedback })
        run.status = "running"
        saveRun(run)
        await generateWorkflowPlan(run, { app, port, generateText, extractScenes, brain }, feedback)
        upsertDraftPackageFromRun(run)
        addMemoryEntry(run.projectId, { feedback: `Plan revision requested: ${feedback}` })
        return res.json(run)
      }

      if (step === "final_approval") {
        run.approvalState.finalApproval = "rejected"
        setStepStatus(run, "final_approval", "processing", { feedback })
        run.status = "running"
        saveRun(run)
        await runExecutionLoop(run, { app, port, generateText, extractScenes, brain }, feedback)
        upsertDraftPackageFromRun(run)
        addMemoryEntry(run.projectId, { feedback: `Final package revision requested: ${feedback}` })
        return res.json(run)
      }

      return res.status(400).json({ message: `Revision for step '${step}' is not implemented` })
    } catch (error) {
      console.error("[Autopilot] revise failed:", error)
      return res.status(500).json({ message: error instanceof Error ? error.message : "Revise failed" })
    }
  })

  app.get("/api/autopilot/inbox", (req, res) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : undefined
      const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined
      const format = req.query.format === "short" ? "short" : req.query.format === "long" ? "long" : undefined
      const managerStatus = req.query.managerStatus === "ready"
        ? "ready"
        : req.query.managerStatus === "needs_attention"
          ? "needs_attention"
          : undefined
      const minScore = typeof req.query.minScore === "string" ? Number(req.query.minScore) : undefined
      const search = typeof req.query.search === "string" ? req.query.search : undefined
      const items = listDraftPackages({
        status: status as any,
        projectId,
        format,
        managerStatus,
        minScore: Number.isFinite(minScore) ? minScore : undefined,
        search,
      })
      return res.json(items)
    } catch (error) {
      console.error("[Autopilot] inbox list failed:", error)
      return res.status(500).json({ message: "Failed to load inbox" })
    }
  })

  app.post("/api/autopilot/inbox/:packageId/fix-and-recheck", async (req, res) => {
    try {
      const pkg = getDraftPackageById(req.params.packageId)
      if (!pkg) return res.status(404).json({ message: "Package not found" })
      if (!pkg.latestRunId) return res.status(400).json({ message: "Package has no linked run" })
      const run = getRunById(pkg.latestRunId)
      if (!run) return res.status(404).json({ message: "Linked run not found" })
      ensureRunHasDefaults(run)
      await ensureRunReadyForExecutionLoop(run, deps, "Fix and recheck requested from inbox")
      resetRunForRecheck(run)
      saveRun(run)
      await runExecutionLoop(run, deps, "Fix and recheck requested from inbox")
      const next = upsertDraftPackageFromRun(run)
      return res.json({ run, package: next })
    } catch (error) {
      console.error("[Autopilot] fix-and-recheck failed:", error)
      return res.status(500).json({ message: error instanceof Error ? error.message : "Fix and recheck failed" })
    }
  })

  app.post("/api/autopilot/inbox/:packageId/approve", async (req, res) => {
    try {
      const pkg = getDraftPackageById(req.params.packageId)
      if (!pkg) return res.status(404).json({ message: "Package not found" })
      let run = pkg.latestRunId ? getRunById(pkg.latestRunId) : null
      if (run && run.status === "awaiting_approval" && run.currentStep === "final_approval") {
        run = finalizeRun(run)
      }
      const updated = updateDraftPackage(pkg.projectId, pkg.packageId, {
        status: "archived",
        latestRunId: run?.runId || pkg.latestRunId,
      })
      return res.json({ package: updated, run, warning: pkg.manager.status === "needs_attention" ? "Approved with manager warnings." : null })
    } catch (error) {
      console.error("[Autopilot] inbox approve failed:", error)
      return res.status(500).json({ message: error instanceof Error ? error.message : "Approve failed" })
    }
  })

  app.post("/api/autopilot/inbox/:packageId/archive", (req, res) => {
    try {
      const pkg = getDraftPackageById(req.params.packageId)
      if (!pkg) return res.status(404).json({ message: "Package not found" })
      const updated = updateDraftPackage(pkg.projectId, pkg.packageId, { status: "archived" })
      return res.json({ package: updated })
    } catch (error) {
      console.error("[Autopilot] inbox archive failed:", error)
      return res.status(500).json({ message: "Archive failed" })
    }
  })

  app.post("/api/autopilot/action", async (req, res) => {
    try {
      const actionType = String(req.body?.actionType || "").trim()
      const packageId = typeof req.body?.packageId === "string" ? req.body.packageId : null
      const runId = typeof req.body?.runId === "string" ? req.body.runId : null
      const params = req.body?.params || {}

      const linkedPackage = packageId ? getDraftPackageById(packageId) : null
      const run = runId ? getRunById(runId) : linkedPackage?.latestRunId ? getRunById(linkedPackage.latestRunId) : null
      if (!run) return res.status(404).json({ message: "Run not found for action" })

      if (actionType === "tighten_pacing") {
        await ensureRunReadyForExecutionLoop(run, deps, "Tighten pacing and reduce filler.")
        resetRunForRecheck(run)
        const extra = typeof params.instruction === "string" && params.instruction.trim()
          ? ` Owner request: ${params.instruction.trim()}`
          : ""
        await runExecutionLoop(run, deps, `Tighten pacing and reduce filler.${extra}`.trim())
      } else if (actionType === "regenerate_scene") {
        const sceneIndex = Number(params.sceneIndex || 0)
        if (!Number.isFinite(sceneIndex) || sceneIndex <= 0) {
          return res.status(400).json({ message: "sceneIndex must be a positive number" })
        }
        await ensureRunReadyForExecutionLoop(run, deps, `Regenerate scene ${sceneIndex} while preserving continuity.`)
        resetRunForRecheck(run)
        await runExecutionLoop(run, deps, `Regenerate scene ${sceneIndex} while preserving continuity.`)
      } else if (actionType === "fix_all_issues") {
        await ensureRunReadyForExecutionLoop(run, deps, "Fix all manager issues and recheck.")
        resetRunForRecheck(run)
        const extra = typeof params.instruction === "string" && params.instruction.trim()
          ? ` Owner request: ${params.instruction.trim()}`
          : ""
        await runExecutionLoop(run, deps, `Fix all manager issues and recheck.${extra}`.trim())
      } else if (actionType === "update_rules") {
        const confirmed = Boolean(params.confirmed)
        if (!confirmed) {
          return res.status(400).json({ message: "Rules update requires explicit confirmation." })
        }
        const project = getProject(run.projectId)
        if (!project) return res.status(404).json({ message: "Project not found" })
        const updatedProject = updateProject(run.projectId, {
          brandSpec: params.brandSpec || project.brandSpec,
          promptRules: params.promptRules || project.promptRules,
        })
        run.rulesContext = resolveRulesContext(updatedProject || project)
        saveRun(run)
      } else {
        return res.status(400).json({ message: "Unknown actionType" })
      }

      const nextPackage = upsertDraftPackageFromRun(run)
      return res.json({
        success: true,
        run,
        package: nextPackage,
      })
    } catch (error) {
      console.error("[Autopilot] action dispatch failed:", error)
      return res.status(500).json({ message: error instanceof Error ? error.message : "Action dispatch failed" })
    }
  })

  app.post("/api/autopilot/abort/:runId", (req, res) => {
    try {
      const run = getRunById(req.params.runId)
      if (!run) return res.status(404).json({ message: "Run not found" })
      run.status = "aborted"
      run.updatedAt = Date.now()
      saveRun(run)
      if (run.packageId) {
        const existing = getDraftPackageById(run.packageId)
        if (existing) {
          saveDraftPackage({ ...existing, status: "in_progress", latestRunId: run.runId, updatedAt: Date.now() })
        }
      }
      updateProject(run.projectId, { currentPipelineRun: null })
      return res.json({ success: true, run })
    } catch {
      return res.status(500).json({ message: "Failed to abort run" })
    }
  })
}

