import * as fs from "node:fs"
import * as path from "node:path"
import { BrainConfig, getDefaultBrainConfig } from "./autopilotBrain"
import {
  BrandSpec,
  PromptRules,
  ScheduleSettings,
  getDefaultBrandSpec,
  getDefaultPromptRules,
  getDefaultScheduleSettings,
} from "./categoryTemplates"

export interface ProjectRole {
  id: string
  name: string
  description: string
  personality: string
  model: string
}

export interface ProjectSoul {
  voiceTone: string
  writingStyle: string
  targetAudience: string
  channelName: string
  doList: string[]
  dontList: string[]
}

export interface ProjectProductionRules {
  draftsPerEpisode: number
  targetWordCount: { min: number; max: number }
  episodesPerBatch: number
  sceneCount: { min: number; max: number }
  scheduleCron: string
  imageModel: string
  videoModel: string
  aspectRatio: string
  imageSize: string
  videoQuality: string
  videoDuration: number
}

export interface ModelRouting {
  chatWorker: string // "gpt-5-nano"
  scriptWriter: string // "gpt-5-nano"
  brainModel: string // "claude-opus-4-6"
  sceneExtractor: string // "gpt-5-nano"
}

export interface ProjectConfig {
  id: string
  name: string
  description: string
  createdAt: number
  updatedAt: number
  roles: ProjectRole[]
  characters: string[]
  primaryAvatar: string
  storyBaseId: string
  soul: ProjectSoul
  guidelines: string
  restrictions: string[]
  exampleScripts: string[]
  production: ProjectProductionRules
  imageryStyleId: string
  currentPipelineRun: string | null
  brainConfig: BrainConfig
  modelRouting: ModelRouting
  categoryTemplateId: string
  brandSpec: BrandSpec
  promptRules: PromptRules
  schedule: ScheduleSettings
}

export interface SubprojectConfig {
  id: string
  projectId: string
  name: string
  slug: string
  description?: string
  storyTitle?: string
  createdAt: number
  updatedAt: number
}

const PROJECTS_ROOT = path.join(process.cwd(), "data", "projects")

function ensureProjectsRoot(): void {
  if (!fs.existsSync(PROJECTS_ROOT)) {
    fs.mkdirSync(PROJECTS_ROOT, { recursive: true })
  }
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function toSlug(raw: string): string {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "untitled"
}

export function getProjectDir(projectId: string): string {
  ensureProjectsRoot()
  return path.join(PROJECTS_ROOT, projectId)
}

export function getProjectFilePath(projectId: string): string {
  return path.join(getProjectDir(projectId), "project.json")
}

function ensureProjectStructure(projectId: string): void {
  const projectDir = getProjectDir(projectId)
  const conversationsDir = path.join(projectDir, "conversations")
  const runsDir = path.join(projectDir, "runs")
  const subprojectsDir = path.join(projectDir, "subprojects")
  if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true })
  if (!fs.existsSync(conversationsDir)) fs.mkdirSync(conversationsDir, { recursive: true })
  if (!fs.existsSync(runsDir)) fs.mkdirSync(runsDir, { recursive: true })
  if (!fs.existsSync(subprojectsDir)) fs.mkdirSync(subprojectsDir, { recursive: true })
}

export function getSubprojectsDir(projectId: string): string {
  return path.join(getProjectDir(projectId), "subprojects")
}

export function getSubprojectDir(projectId: string, subprojectId: string): string {
  return path.join(getSubprojectsDir(projectId), subprojectId)
}

export function getSubprojectFilePath(projectId: string, subprojectId: string): string {
  return path.join(getSubprojectDir(projectId, subprojectId), "subproject.json")
}

export function ensureSubprojectStructure(projectId: string, subprojectId: string): void {
  ensureProjectStructure(projectId)
  const subprojectDir = getSubprojectDir(projectId, subprojectId)
  const docsDir = path.join(subprojectDir, "docs")
  const promptsDir = path.join(subprojectDir, "prompts")
  const timelinesDir = path.join(subprojectDir, "timelines")
  const artifactsDir = path.join(subprojectDir, "artifacts")
  const runsDir = path.join(subprojectDir, "runs")
  const graphsDir = path.join(subprojectDir, "graphs")
  if (!fs.existsSync(subprojectDir)) fs.mkdirSync(subprojectDir, { recursive: true })
  if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true })
  if (!fs.existsSync(promptsDir)) fs.mkdirSync(promptsDir, { recursive: true })
  if (!fs.existsSync(timelinesDir)) fs.mkdirSync(timelinesDir, { recursive: true })
  if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true })
  if (!fs.existsSync(runsDir)) fs.mkdirSync(runsDir, { recursive: true })
  if (!fs.existsSync(graphsDir)) fs.mkdirSync(graphsDir, { recursive: true })
}

function normalizeSubproject(projectId: string, raw: any): SubprojectConfig {
  const now = Date.now()
  const id = String(raw?.id || makeId("subproj"))
  const name = String(raw?.name || raw?.storyTitle || "Untitled story")
  const slug = String(raw?.slug || toSlug(raw?.storyTitle || name))
  return {
    id,
    projectId,
    name,
    slug,
    description: raw?.description ? String(raw.description) : undefined,
    storyTitle: raw?.storyTitle ? String(raw.storyTitle) : undefined,
    createdAt: Number(raw?.createdAt || now),
    updatedAt: Number(raw?.updatedAt || now),
  }
}

export function listSubprojects(projectId: string): SubprojectConfig[] {
  ensureProjectStructure(projectId)
  const root = getSubprojectsDir(projectId)
  if (!fs.existsSync(root)) return []
  const ids = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
  const out: SubprojectConfig[] = []
  for (const id of ids) {
    const filePath = getSubprojectFilePath(projectId, id)
    if (!fs.existsSync(filePath)) continue
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"))
      out.push(normalizeSubproject(projectId, raw))
    } catch (error) {
      console.error(`[Projects] Failed to parse subproject ${id}:`, error)
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt)
}

export function getSubproject(projectId: string, subprojectId: string): SubprojectConfig | null {
  const filePath = getSubprojectFilePath(projectId, subprojectId)
  if (!fs.existsSync(filePath)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"))
    return normalizeSubproject(projectId, raw)
  } catch (error) {
    console.error(`[Projects] Failed to parse subproject ${subprojectId}:`, error)
    return null
  }
}

export function createSubproject(
  projectId: string,
  input: Partial<SubprojectConfig> & { name?: string; storyTitle?: string }
): SubprojectConfig {
  ensureProjectStructure(projectId)
  const now = Date.now()
  const next = normalizeSubproject(projectId, {
    ...input,
    id: input.id || makeId("subproj"),
    name: input.name || input.storyTitle || "Untitled story",
    storyTitle: input.storyTitle || input.name,
    createdAt: now,
    updatedAt: now,
  })
  ensureSubprojectStructure(projectId, next.id)
  fs.writeFileSync(getSubprojectFilePath(projectId, next.id), JSON.stringify(next, null, 2), "utf-8")
  return next
}

export function updateSubproject(
  projectId: string,
  subprojectId: string,
  updates: Partial<SubprojectConfig>
): SubprojectConfig | null {
  const current = getSubproject(projectId, subprojectId)
  if (!current) return null
  const next = normalizeSubproject(projectId, {
    ...current,
    ...updates,
    id: current.id,
    projectId,
    slug: updates.slug || toSlug(updates.storyTitle || updates.name || current.storyTitle || current.name),
    updatedAt: Date.now(),
  })
  ensureSubprojectStructure(projectId, subprojectId)
  fs.writeFileSync(getSubprojectFilePath(projectId, subprojectId), JSON.stringify(next, null, 2), "utf-8")
  return next
}

function normalizeRole(raw: any): ProjectRole {
  return {
    id: String(raw?.id || makeId("role")),
    name: String(raw?.name || "role"),
    description: String(raw?.description || ""),
    personality: String(raw?.personality || ""),
    model: String(raw?.model || "gpt-5-nano"),
  }
}

function defaultProduction(raw?: Partial<ProjectProductionRules>): ProjectProductionRules {
  return {
    draftsPerEpisode: Number(raw?.draftsPerEpisode ?? 2),
    targetWordCount: {
      min: Number(raw?.targetWordCount?.min ?? 900),
      max: Number(raw?.targetWordCount?.max ?? 1400),
    },
    episodesPerBatch: Number(raw?.episodesPerBatch ?? 1),
    sceneCount: {
      min: Number(raw?.sceneCount?.min ?? 6),
      max: Number(raw?.sceneCount?.max ?? 12),
    },
    scheduleCron: String(raw?.scheduleCron ?? ""),
    imageModel: String(raw?.imageModel ?? "z-image-turbo-replicate"),
    videoModel: String(raw?.videoModel ?? "veo-3.1"),
    aspectRatio: String(raw?.aspectRatio ?? "16:9"),
    imageSize: String(raw?.imageSize ?? "1K"),
    videoQuality: String(raw?.videoQuality ?? "standard"),
    videoDuration: Number(raw?.videoDuration ?? 6),
  }
}

function defaultSoul(raw?: Partial<ProjectSoul>): ProjectSoul {
  return {
    voiceTone: String(raw?.voiceTone ?? "warm and adventurous"),
    writingStyle: String(raw?.writingStyle ?? "first-person travel storytelling"),
    targetAudience: String(raw?.targetAudience ?? "travel enthusiasts"),
    channelName: String(raw?.channelName ?? "Untitled Travel Channel"),
    doList: Array.isArray(raw?.doList) ? raw!.doList.map(String) : [],
    dontList: Array.isArray(raw?.dontList) ? raw!.dontList.map(String) : [],
  }
}

function normalizeProject(raw: any): ProjectConfig {
  const now = Date.now()
  return {
    id: String(raw?.id || makeId("project")),
    name: String(raw?.name || "Untitled Project"),
    description: String(raw?.description || ""),
    createdAt: Number(raw?.createdAt || now),
    updatedAt: Number(raw?.updatedAt || now),
    roles: Array.isArray(raw?.roles) && raw.roles.length > 0
      ? raw.roles.map(normalizeRole)
      : [
          {
            id: makeId("role"),
            name: "scriptwriter",
            description: "Writes long-form story scripts",
            personality: "Creative, cinematic, detail-oriented",
            model: "gpt-5.2",
          },
          {
            id: makeId("role"),
            name: "director",
            description: "Converts scripts into visual scenes and pacing",
            personality: "Visual thinker, concise, production minded",
            model: "gpt-5",
          },
        ],
    characters: Array.isArray(raw?.characters) ? raw.characters.map(String) : [],
    primaryAvatar: String(raw?.primaryAvatar || ""),
    storyBaseId: String(raw?.storyBaseId || ""),
    soul: defaultSoul(raw?.soul),
    guidelines: String(raw?.guidelines || ""),
    restrictions: Array.isArray(raw?.restrictions) ? raw.restrictions.map(String) : [],
    exampleScripts: Array.isArray(raw?.exampleScripts) ? raw.exampleScripts.map(String) : [],
    production: defaultProduction(raw?.production),
    imageryStyleId: String(raw?.imageryStyleId || ""),
    currentPipelineRun: raw?.currentPipelineRun || null,
    brainConfig: raw?.brainConfig || getDefaultBrainConfig(),
    modelRouting: raw?.modelRouting || {
      chatWorker: "gpt-5-nano",
      scriptWriter: "gpt-5-nano",
      brainModel: "claude-opus-4-6",
      sceneExtractor: "gpt-5-nano",
    },
    categoryTemplateId: String(raw?.categoryTemplateId || ""),
    brandSpec: getDefaultBrandSpec(raw?.brandSpec),
    promptRules: getDefaultPromptRules(raw?.promptRules),
    schedule: getDefaultScheduleSettings(raw?.schedule),
  }
}

export function listProjects(): ProjectConfig[] {
  ensureProjectsRoot()
  const dirs = fs
    .readdirSync(PROJECTS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)

  const projects: ProjectConfig[] = []
  for (const dir of dirs) {
    const filePath = getProjectFilePath(dir)
    if (!fs.existsSync(filePath)) continue
    try {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as ProjectConfig
      projects.push(normalizeProject(data))
    } catch (error) {
      console.error(`[Projects] Failed to read ${filePath}:`, error)
    }
  }

  return projects.sort((a, b) => b.updatedAt - a.updatedAt)
}

export function getProject(projectId: string): ProjectConfig | null {
  const filePath = getProjectFilePath(projectId)
  if (!fs.existsSync(filePath)) return null
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as ProjectConfig
    return normalizeProject(data)
  } catch (error) {
    console.error(`[Projects] Failed to parse project ${projectId}:`, error)
    return null
  }
}

export function createProject(input: Partial<ProjectConfig>): ProjectConfig {
  const now = Date.now()
  const id = String(input.id || makeId("project"))
  ensureProjectStructure(id)

  const project: ProjectConfig = normalizeProject({
    ...input,
    id,
    createdAt: now,
    updatedAt: now,
  })

  saveProject(project)
  return project
}

export function updateProject(projectId: string, updates: Partial<ProjectConfig>): ProjectConfig | null {
  const current = getProject(projectId)
  if (!current) return null

  const next: ProjectConfig = {
    ...normalizeProject({ ...current, ...updates }),
    roles: Array.isArray(updates.roles) ? updates.roles.map(normalizeRole) : current.roles,
    soul: updates.soul ? defaultSoul({ ...current.soul, ...updates.soul }) : current.soul,
    production: updates.production
      ? defaultProduction({ ...current.production, ...updates.production })
      : current.production,
    brandSpec: updates.brandSpec ? getDefaultBrandSpec({ ...current.brandSpec, ...updates.brandSpec }) : current.brandSpec,
    promptRules: updates.promptRules ? getDefaultPromptRules({ ...current.promptRules, ...updates.promptRules }) : current.promptRules,
    schedule: updates.schedule ? getDefaultScheduleSettings({ ...current.schedule, ...updates.schedule }) : current.schedule,
    updatedAt: Date.now(),
  }

  saveProject(next)
  return next
}

export function saveProject(project: ProjectConfig): void {
  ensureProjectStructure(project.id)
  const filePath = getProjectFilePath(project.id)
  fs.writeFileSync(filePath, JSON.stringify(project, null, 2), "utf-8")
}

export function deleteProject(projectId: string): boolean {
  const dir = getProjectDir(projectId)
  if (!fs.existsSync(dir)) return false
  fs.rmSync(dir, { recursive: true, force: true })
  return true
}

