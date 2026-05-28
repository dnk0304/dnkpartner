import * as fs from "node:fs"
import * as path from "node:path"
import { ensureSubprojectStructure, getProjectDir, getSubprojectDir } from "../projects"
import type { GraphTemplate, GraphTemplateSummary, RunInstanceGraph } from "./types"

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function getStorageRoot(projectId: string, subprojectId?: string): string {
  if (subprojectId && subprojectId.trim()) {
    return getSubprojectDir(projectId, subprojectId.trim())
  }
  return getProjectDir(projectId)
}

function getGraphsDir(projectId: string, subprojectId?: string): string {
  return path.join(getStorageRoot(projectId, subprojectId), "graphs")
}

function getTemplatesRootDir(projectId: string, subprojectId?: string): string {
  return path.join(getGraphsDir(projectId, subprojectId), "templates")
}

function getTemplateDir(projectId: string, templateId: string, subprojectId?: string): string {
  return path.join(getTemplatesRootDir(projectId, subprojectId), templateId)
}

function getTemplateVersionFile(projectId: string, templateId: string, version: number, subprojectId?: string): string {
  return path.join(getTemplateDir(projectId, templateId, subprojectId), `v${version}.json`)
}

function getRunGraphsDir(projectId: string, subprojectId?: string): string {
  return path.join(getGraphsDir(projectId, subprojectId), "runs")
}

function getRunGraphFile(projectId: string, runId: string, subprojectId?: string): string {
  return path.join(getRunGraphsDir(projectId, subprojectId), `${runId}.json`)
}

export function ensureGraphDirs(projectId: string, subprojectId?: string): void {
  const storageRoot = getStorageRoot(projectId, subprojectId)
  if (subprojectId && subprojectId.trim()) {
    ensureSubprojectStructure(projectId, subprojectId.trim())
  }
  const graphsDir = getGraphsDir(projectId, subprojectId)
  const templatesDir = getTemplatesRootDir(projectId, subprojectId)
  const runsDir = getRunGraphsDir(projectId, subprojectId)
  if (!fs.existsSync(storageRoot)) fs.mkdirSync(storageRoot, { recursive: true })
  if (!fs.existsSync(graphsDir)) fs.mkdirSync(graphsDir, { recursive: true })
  if (!fs.existsSync(templatesDir)) fs.mkdirSync(templatesDir, { recursive: true })
  if (!fs.existsSync(runsDir)) fs.mkdirSync(runsDir, { recursive: true })
}

function parseTemplateVersionFileName(fileName: string): number | null {
  const match = /^v(\d+)\.json$/.exec(fileName)
  if (!match) return null
  const num = Number(match[1])
  return Number.isFinite(num) && num > 0 ? num : null
}

function listTemplateVersions(projectId: string, templateId: string, subprojectId?: string): number[] {
  const dir = getTemplateDir(projectId, templateId, subprojectId)
  if (!fs.existsSync(dir)) return []
  const versions: number[] = []
  for (const entry of fs.readdirSync(dir)) {
    const v = parseTemplateVersionFileName(entry)
    if (v) versions.push(v)
  }
  versions.sort((a, b) => a - b)
  return versions
}

function normalizeGraphTemplate(raw: Partial<GraphTemplate> & { projectId: string; templateId: string }): GraphTemplate {
  const now = Date.now()
  const nodes = Array.isArray(raw.nodes) ? raw.nodes : []
  const edges = Array.isArray(raw.edges) ? raw.edges : []
  return {
    templateId: String(raw.templateId),
    projectId: String(raw.projectId),
    subprojectId: raw.subprojectId ? String(raw.subprojectId) : undefined,
    name: String(raw.name || "Untitled workflow"),
    description: raw.description ? String(raw.description) : undefined,
    version: Math.max(1, Number(raw.version || 1)),
    createdAt: Number(raw.createdAt || now),
    updatedAt: Number(raw.updatedAt || now),
    tags: Array.isArray(raw.tags) ? raw.tags.map(String).slice(0, 50) : undefined,
    nodes: nodes.map((n: any, idx: number) => ({
      id: String(n?.id || `node-${idx + 1}`),
      type: String(n?.type || "Unknown"),
      title: n?.title ? String(n.title) : undefined,
      position: {
        x: Number.isFinite(Number(n?.position?.x)) ? Number(n.position.x) : 0,
        y: Number.isFinite(Number(n?.position?.y)) ? Number(n.position.y) : 0,
      },
      ui: n?.ui && typeof n.ui === "object"
        ? {
            width: n.ui.width !== undefined ? Number(n.ui.width) : undefined,
            collapsed: n.ui.collapsed !== undefined ? Boolean(n.ui.collapsed) : undefined,
          }
        : undefined,
      config: n?.config && typeof n.config === "object" ? n.config : {},
    })),
    edges: edges.map((e: any, idx: number) => ({
      id: String(e?.id || `edge-${idx + 1}`),
      from: {
        nodeId: String(e?.from?.nodeId || ""),
        portId: String(e?.from?.portId || ""),
      },
      to: {
        nodeId: String(e?.to?.nodeId || ""),
        portId: String(e?.to?.portId || ""),
      },
    })),
    defaults: raw.defaults && typeof raw.defaults === "object" ? raw.defaults : undefined,
  }
}

export function loadTemplate(
  projectId: string,
  templateId: string,
  version?: number,
  subprojectId?: string
): GraphTemplate | null {
  ensureGraphDirs(projectId, subprojectId)
  const versions = listTemplateVersions(projectId, templateId, subprojectId)
  if (versions.length === 0) return null
  const resolvedVersion = version ? Number(version) : versions[versions.length - 1]
  if (!Number.isFinite(resolvedVersion) || resolvedVersion <= 0) return null
  const filePath = getTemplateVersionFile(projectId, templateId, resolvedVersion, subprojectId)
  if (!fs.existsSync(filePath)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as GraphTemplate
    return normalizeGraphTemplate({ ...raw, projectId, templateId, version: resolvedVersion })
  } catch {
    return null
  }
}

export function listTemplates(projectId: string, subprojectId?: string): GraphTemplateSummary[] {
  ensureGraphDirs(projectId, subprojectId)
  const root = getTemplatesRootDir(projectId, subprojectId)
  if (!fs.existsSync(root)) return []
  const templateIds = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)

  const out: GraphTemplateSummary[] = []
  for (const templateId of templateIds) {
    const versions = listTemplateVersions(projectId, templateId, subprojectId)
    if (versions.length === 0) continue
    const latest = versions[versions.length - 1]
    const tmpl = loadTemplate(projectId, templateId, latest, subprojectId)
    if (!tmpl) continue
    out.push({
      templateId,
      projectId,
      subprojectId: tmpl.subprojectId,
      name: tmpl.name,
      description: tmpl.description,
      latestVersion: tmpl.version,
      versions,
      updatedAt: tmpl.updatedAt,
    })
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt)
}

export function saveTemplateVersion(input: {
  projectId: string
  subprojectId?: string
  templateId?: string
  name: string
  description?: string
  tags?: string[]
  nodes: GraphTemplate["nodes"]
  edges: GraphTemplate["edges"]
  defaults?: GraphTemplate["defaults"]
}): GraphTemplate {
  ensureGraphDirs(input.projectId, input.subprojectId)
  const templateId = String(input.templateId || makeId("tmpl"))
  const existingVersions = listTemplateVersions(input.projectId, templateId, input.subprojectId)
  const nextVersion = (existingVersions[existingVersions.length - 1] || 0) + 1
  const now = Date.now()
  const prev = existingVersions.length > 0
    ? loadTemplate(input.projectId, templateId, existingVersions[existingVersions.length - 1], input.subprojectId)
    : null
  const template: GraphTemplate = normalizeGraphTemplate({
    templateId,
    projectId: input.projectId,
    subprojectId: input.subprojectId,
    name: input.name,
    description: input.description,
    tags: input.tags,
    version: nextVersion,
    createdAt: prev?.createdAt || now,
    updatedAt: now,
    nodes: input.nodes,
    edges: input.edges,
    defaults: input.defaults,
  })
  const dir = getTemplateDir(template.projectId, template.templateId, input.subprojectId)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    getTemplateVersionFile(template.projectId, template.templateId, template.version, input.subprojectId),
    JSON.stringify(template, null, 2),
    "utf-8"
  )
  return template
}

function normalizeRunGraph(raw: Partial<RunInstanceGraph> & { projectId: string; runId: string }): RunInstanceGraph {
  const now = Date.now()
  const nodes = Array.isArray(raw.nodes) ? raw.nodes : []
  const edges = Array.isArray(raw.edges) ? raw.edges : []
  const templateId = String((raw as any)?.templateRef?.templateId || "")
  const templateVersion = Number((raw as any)?.templateRef?.version || 1)
  return {
    runId: String(raw.runId),
    projectId: String(raw.projectId),
    subprojectId: raw.subprojectId ? String(raw.subprojectId) : undefined,
    templateRef: { templateId, version: Number.isFinite(templateVersion) ? templateVersion : 1 },
    createdAt: Number(raw.createdAt || now),
    updatedAt: Number(raw.updatedAt || now),
    source: raw.source === "scheduled" ? "scheduled" : "manual",
    nodes: nodes.map((n: any, idx: number) => ({
      id: String(n?.id || `node-${idx + 1}`),
      type: String(n?.type || "Unknown"),
      title: n?.title ? String(n.title) : undefined,
      position: {
        x: Number.isFinite(Number(n?.position?.x)) ? Number(n.position.x) : 0,
        y: Number.isFinite(Number(n?.position?.y)) ? Number(n.position.y) : 0,
      },
      configSnapshot: n?.configSnapshot && typeof n.configSnapshot === "object" ? n.configSnapshot : {},
      status: (n?.status as any) || "pending",
      startedAt: n?.startedAt !== undefined ? Number(n.startedAt) : undefined,
      completedAt: n?.completedAt !== undefined ? Number(n.completedAt) : undefined,
      error: n?.error && typeof n.error === "object"
        ? { message: String(n.error.message || "Unknown error"), stack: n.error.stack ? String(n.error.stack) : undefined }
        : undefined,
      inputsResolved: n?.inputsResolved && typeof n.inputsResolved === "object" ? n.inputsResolved : undefined,
      outputs: n?.outputs && typeof n.outputs === "object" ? n.outputs : undefined,
      logs: Array.isArray(n?.logs)
        ? n.logs.map((l: any) => ({
            ts: Number(l?.ts || now),
            level: l?.level === "warn" || l?.level === "error" ? l.level : "info",
            message: String(l?.message || ""),
          }))
        : undefined,
      artifacts: Array.isArray(n?.artifacts) ? n.artifacts : undefined,
      approval: n?.approval && typeof n.approval === "object"
        ? {
            required: Boolean(n.approval.required),
            state: n.approval.state === "approved" || n.approval.state === "rejected" ? n.approval.state : "pending",
            feedback: n.approval.feedback ? String(n.approval.feedback) : undefined,
            decidedAt: n.approval.decidedAt !== undefined ? Number(n.approval.decidedAt) : undefined,
          }
        : undefined,
    })),
    edges: edges.map((e: any, idx: number) => ({
      id: String(e?.id || `edge-${idx + 1}`),
      from: { nodeId: String(e?.from?.nodeId || ""), portId: String(e?.from?.portId || "") },
      to: { nodeId: String(e?.to?.nodeId || ""), portId: String(e?.to?.portId || "") },
    })),
  }
}

export function saveRunGraph(graph: RunInstanceGraph): RunInstanceGraph {
  ensureGraphDirs(graph.projectId, (graph as any).subprojectId)
  const next = normalizeRunGraph({ ...graph, projectId: graph.projectId, runId: graph.runId })
  next.updatedAt = Date.now()
  fs.writeFileSync(
    getRunGraphFile(next.projectId, next.runId, (graph as any).subprojectId),
    JSON.stringify(next, null, 2),
    "utf-8"
  )
  return next
}

export function loadRunGraph(projectId: string, runId: string, subprojectId?: string): RunInstanceGraph | null {
  ensureGraphDirs(projectId, subprojectId)
  const filePath = getRunGraphFile(projectId, runId, subprojectId)
  if (!fs.existsSync(filePath)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as RunInstanceGraph
    return normalizeRunGraph({ ...raw, projectId, runId })
  } catch {
    return null
  }
}

export function getProjectArtifactsRoot(projectId: string, subprojectId?: string): string {
  return path.join(getStorageRoot(projectId, subprojectId), "artifacts")
}

export function getRunArtifactsDir(projectId: string, runId: string, subprojectId?: string): string {
  return path.join(getProjectArtifactsRoot(projectId, subprojectId), runId)
}

export function getNodeArtifactsDir(projectId: string, runId: string, nodeId: string, subprojectId?: string): string {
  return path.join(getRunArtifactsDir(projectId, runId, subprojectId), nodeId)
}

export function ensureArtifactsDir(projectId: string, runId: string, nodeId?: string, subprojectId?: string): string {
  if (subprojectId && subprojectId.trim()) {
    ensureSubprojectStructure(projectId, subprojectId.trim())
  }
  const dir = nodeId
    ? getNodeArtifactsDir(projectId, runId, nodeId, subprojectId)
    : getRunArtifactsDir(projectId, runId, subprojectId)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function toProjectRelPath(projectId: string, absolutePath: string): string {
  const projectDir = getProjectDir(projectId)
  const resolvedProjectDir = path.resolve(projectDir)
  const resolvedAbs = path.resolve(absolutePath)
  const rel = path.relative(resolvedProjectDir, resolvedAbs)
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Path is outside project directory")
  }
  return rel.split(path.sep).join("/")
}

