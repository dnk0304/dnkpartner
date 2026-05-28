import * as fs from "node:fs"
import * as path from "node:path"
import { getProjectDir } from "./projects"
import type { AutopilotRun } from "./autopilot"

export type DraftPackageStatus = "ready_for_review" | "in_progress" | "scheduled" | "archived"
export type DraftPackageFormat = "long" | "short"
export type ManagerStatus = "ready" | "needs_attention"

export interface DraftPackageAssetSummary {
  script: boolean
  scenes: boolean
  prompts: boolean
  storyboard: boolean
  clips: boolean
}

export interface DraftPackageManager {
  score: number
  status: ManagerStatus
  topIssues: string[]
}

export interface DraftPackage {
  packageId: string
  projectId: string
  topic: string
  format: DraftPackageFormat
  status: DraftPackageStatus
  createdAt: number
  updatedAt: number
  latestRunId: string | null
  runtimeEstimateSeconds: number
  manager: DraftPackageManager
  assets: DraftPackageAssetSummary
}

export interface ListPackagesFilters {
  status?: DraftPackageStatus
  projectId?: string
  format?: DraftPackageFormat
  managerStatus?: ManagerStatus
  minScore?: number
  search?: string
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function getPackagesDir(projectId: string): string {
  return path.join(getProjectDir(projectId), "packages")
}

function getPackageFile(projectId: string, packageId: string): string {
  return path.join(getPackagesDir(projectId), `${packageId}.json`)
}

function ensurePackagesDir(projectId: string): void {
  const dir = getPackagesDir(projectId)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function normalizePackage(raw: Partial<DraftPackage>): DraftPackage {
  const now = Date.now()
  const managerScore = Number(raw.manager?.score ?? 0)
  const topIssues = Array.isArray(raw.manager?.topIssues) ? raw.manager!.topIssues.slice(0, 3).map(String) : []
  const managerStatus: ManagerStatus = raw.manager?.status || (managerScore >= 80 && topIssues.length === 0 ? "ready" : "needs_attention")
  return {
    packageId: String(raw.packageId || makeId("pkg")),
    projectId: String(raw.projectId || ""),
    topic: String(raw.topic || "Untitled draft"),
    format: raw.format === "short" ? "short" : "long",
    status: raw.status || "in_progress",
    createdAt: Number(raw.createdAt || now),
    updatedAt: Number(raw.updatedAt || now),
    latestRunId: raw.latestRunId || null,
    runtimeEstimateSeconds: Number(raw.runtimeEstimateSeconds || 0),
    manager: {
      score: Math.max(0, Math.min(100, managerScore)),
      status: managerStatus,
      topIssues,
    },
    assets: {
      script: Boolean(raw.assets?.script),
      scenes: Boolean(raw.assets?.scenes),
      prompts: Boolean(raw.assets?.prompts),
      storyboard: Boolean(raw.assets?.storyboard),
      clips: Boolean(raw.assets?.clips),
    },
  }
}

export function saveDraftPackage(input: DraftPackage): DraftPackage {
  const draftPackage = normalizePackage(input)
  ensurePackagesDir(draftPackage.projectId)
  draftPackage.updatedAt = Date.now()
  fs.writeFileSync(
    getPackageFile(draftPackage.projectId, draftPackage.packageId),
    JSON.stringify(draftPackage, null, 2),
    "utf-8"
  )
  return draftPackage
}

export function loadDraftPackage(projectId: string, packageId: string): DraftPackage | null {
  const filePath = getPackageFile(projectId, packageId)
  if (!fs.existsSync(filePath)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as DraftPackage
    return normalizePackage(raw)
  } catch {
    return null
  }
}

export function listProjectDraftPackages(projectId: string): DraftPackage[] {
  const dir = getPackagesDir(projectId)
  if (!fs.existsSync(dir)) return []
  const files = fs.readdirSync(dir).filter((entry) => entry.endsWith(".json"))
  const packages: DraftPackage[] = []
  for (const file of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8")) as DraftPackage
      packages.push(normalizePackage(raw))
    } catch {
      // no-op: skip malformed package file
    }
  }
  return packages.sort((a, b) => b.updatedAt - a.updatedAt)
}

export function listDraftPackages(filters: ListPackagesFilters = {}): DraftPackage[] {
  const root = path.join(process.cwd(), "data", "projects")
  if (!fs.existsSync(root)) return []
  const projectIds = filters.projectId
    ? [filters.projectId]
    : fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  const all = projectIds.flatMap((projectId) => listProjectDraftPackages(projectId))
  const search = (filters.search || "").trim().toLowerCase()

  return all.filter((pkg) => {
    if (filters.status && pkg.status !== filters.status) return false
    if (filters.format && pkg.format !== filters.format) return false
    if (filters.managerStatus && pkg.manager.status !== filters.managerStatus) return false
    if (typeof filters.minScore === "number" && pkg.manager.score < filters.minScore) return false
    if (search && !`${pkg.topic} ${pkg.packageId}`.toLowerCase().includes(search)) return false
    return true
  })
}

export function getDraftPackageById(packageId: string): DraftPackage | null {
  const root = path.join(process.cwd(), "data", "projects")
  if (!fs.existsSync(root)) return null
  const projectIds = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  for (const projectId of projectIds) {
    const pkg = loadDraftPackage(projectId, packageId)
    if (pkg) return pkg
  }
  return null
}

export function createDraftPackage(input: {
  projectId: string
  topic: string
  format?: DraftPackageFormat
  status?: DraftPackageStatus
  latestRunId?: string | null
}): DraftPackage {
  return saveDraftPackage(
    normalizePackage({
      packageId: makeId("pkg"),
      projectId: input.projectId,
      topic: input.topic,
      format: input.format || "long",
      status: input.status || "in_progress",
      latestRunId: input.latestRunId || null,
      runtimeEstimateSeconds: 0,
      manager: { score: 0, status: "needs_attention", topIssues: [] },
      assets: { script: false, scenes: false, prompts: false, storyboard: false, clips: false },
    })
  )
}

export function updateDraftPackage(
  projectId: string,
  packageId: string,
  updates: Partial<DraftPackage>
): DraftPackage | null {
  const current = loadDraftPackage(projectId, packageId)
  if (!current) return null
  const merged = normalizePackage({
    ...current,
    ...updates,
    manager: {
      ...current.manager,
      ...(updates.manager || {}),
    },
    assets: {
      ...current.assets,
      ...(updates.assets || {}),
    },
  })
  return saveDraftPackage(merged)
}

export function buildPackageFromRun(run: AutopilotRun, current?: DraftPackage): DraftPackage {
  const failedChecks = (run.finalDeliverable?.acceptanceCriteriaResults || [])
    .filter((item) => !item.passed)
    .map((item) => item.criterion)
    .slice(0, 3)
  const managerScore = Number(run.loopMetrics?.finalScore || run.planQuality?.score || 0)
  const managerStatus: ManagerStatus = managerScore >= 80 && failedChecks.length === 0 ? "ready" : "needs_attention"
  const assets: DraftPackageAssetSummary = {
    script: Boolean(run.finalDeliverable?.scriptDraft),
    scenes: Array.isArray(run.finalDeliverable?.durations) && run.finalDeliverable!.durations!.length > 0,
    prompts: Array.isArray(run.finalDeliverable?.prompts) && run.finalDeliverable!.prompts!.length > 0,
    storyboard: Array.isArray(run.finalDeliverable?.imageryPlan) && run.finalDeliverable!.imageryPlan!.length > 0,
    clips: Array.isArray(run.finalDeliverable?.videoPlan) && run.finalDeliverable!.videoPlan!.length > 0,
  }
  return normalizePackage({
    packageId: current?.packageId || run.packageId || makeId("pkg"),
    projectId: run.projectId,
    topic: run.topic,
    format: run.format || "long",
    status: run.status === "completed" ? "archived" : run.status === "awaiting_approval" ? "ready_for_review" : "in_progress",
    createdAt: current?.createdAt || Date.now(),
    updatedAt: Date.now(),
    latestRunId: run.runId,
    runtimeEstimateSeconds: Number(run.runtimeEstimateSeconds || 0),
    manager: {
      score: managerScore,
      status: managerStatus,
      topIssues: failedChecks,
    },
    assets,
  })
}

export function upsertDraftPackageFromRun(run: AutopilotRun): DraftPackage {
  const existing = run.packageId ? getDraftPackageById(run.packageId) : null
  const next = buildPackageFromRun(run, existing || undefined)
  return saveDraftPackage(next)
}
