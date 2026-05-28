import * as fs from "node:fs"
import * as path from "node:path"

export interface BrandSpec {
  toneAnchors: string[]
  bannedPhrases: string[]
  formattingRules: string[]
  safetyConstraints: string[]
}

export interface PromptRecipe {
  requiredFields: string[]
  structure: string
  negativePrompt: string
}

export interface PromptRules {
  imageryRecipe: PromptRecipe
  videoRecipe: PromptRecipe
  consistencyRules: string[]
  validationChecklist: string[]
}

export interface ScheduleSettings {
  enabled: boolean
  cron: string
  timezone: string
  maxConcurrentRuns: number
}

export interface CategoryTemplate {
  id: string
  name: string
  category: string
  description: string
  createdAt: number
  updatedAt: number
  brandSpec: BrandSpec
  promptRules: PromptRules
}

export interface RulesContext {
  templateId: string | null
  brandSpec: BrandSpec
  promptRules: PromptRules
}

type ProjectRulesLike = {
  categoryTemplateId?: string
  brandSpec?: Partial<BrandSpec>
  promptRules?: Partial<PromptRules>
}

const TEMPLATE_ROOT = path.join(process.cwd(), "data", "category-templates")

function ensureTemplateRoot(): void {
  if (!fs.existsSync(TEMPLATE_ROOT)) {
    fs.mkdirSync(TEMPLATE_ROOT, { recursive: true })
  }
}

function defaultBrandSpec(raw?: Partial<BrandSpec>): BrandSpec {
  return {
    toneAnchors: Array.isArray(raw?.toneAnchors) ? raw!.toneAnchors.map(String) : ["clear", "consistent", "brand-safe"],
    bannedPhrases: Array.isArray(raw?.bannedPhrases) ? raw!.bannedPhrases.map(String) : [],
    formattingRules: Array.isArray(raw?.formattingRules) ? raw!.formattingRules.map(String) : [],
    safetyConstraints: Array.isArray(raw?.safetyConstraints) ? raw!.safetyConstraints.map(String) : [],
  }
}

function defaultPromptRecipe(raw?: Partial<PromptRecipe>): PromptRecipe {
  return {
    requiredFields: Array.isArray(raw?.requiredFields)
      ? raw!.requiredFields.map(String)
      : ["subject", "style", "lighting", "composition", "camera", "mood"],
    structure: String(raw?.structure || "subject -> context -> style -> camera -> lighting -> mood -> quality constraints"),
    negativePrompt: String(raw?.negativePrompt || "low quality, artifacts, inconsistent style"),
  }
}

function defaultPromptRules(raw?: Partial<PromptRules>): PromptRules {
  return {
    imageryRecipe: defaultPromptRecipe(raw?.imageryRecipe),
    videoRecipe: defaultPromptRecipe(raw?.videoRecipe),
    consistencyRules: Array.isArray(raw?.consistencyRules)
      ? raw!.consistencyRules.map(String)
      : ["Keep identity consistency across scenes.", "Keep color palette aligned with brand."],
    validationChecklist: Array.isArray(raw?.validationChecklist)
      ? raw!.validationChecklist.map(String)
      : ["Matches brand voice", "Meets prompt structure", "Safe and policy-compliant"],
  }
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function getTemplateFilePath(id: string): string {
  return path.join(TEMPLATE_ROOT, `${id}.json`)
}

function normalizeTemplate(raw: any): CategoryTemplate {
  return {
    id: String(raw?.id || makeId("template")),
    name: String(raw?.name || "Untitled Template"),
    category: String(raw?.category || "general"),
    description: String(raw?.description || ""),
    createdAt: Number(raw?.createdAt || Date.now()),
    updatedAt: Number(raw?.updatedAt || Date.now()),
    brandSpec: defaultBrandSpec(raw?.brandSpec),
    promptRules: defaultPromptRules(raw?.promptRules),
  }
}

export function listCategoryTemplates(): CategoryTemplate[] {
  ensureTemplateRoot()
  const files = fs.readdirSync(TEMPLATE_ROOT).filter((f) => f.endsWith(".json"))
  const templates: CategoryTemplate[] = []
  for (const file of files) {
    const full = path.join(TEMPLATE_ROOT, file)
    try {
      const raw = JSON.parse(fs.readFileSync(full, "utf-8"))
      templates.push(normalizeTemplate(raw))
    } catch (error) {
      console.error(`[CategoryTemplates] Failed to load ${file}:`, error)
    }
  }
  return templates.sort((a, b) => b.updatedAt - a.updatedAt)
}

export function getCategoryTemplate(templateId: string): CategoryTemplate | null {
  ensureTemplateRoot()
  const filePath = getTemplateFilePath(templateId)
  if (!fs.existsSync(filePath)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"))
    return normalizeTemplate(raw)
  } catch {
    return null
  }
}

export function createCategoryTemplate(input: Partial<CategoryTemplate>): CategoryTemplate {
  ensureTemplateRoot()
  const now = Date.now()
  const template = normalizeTemplate({
    ...input,
    id: input.id || makeId("template"),
    createdAt: now,
    updatedAt: now,
  })
  saveCategoryTemplate(template)
  return template
}

export function updateCategoryTemplate(templateId: string, updates: Partial<CategoryTemplate>): CategoryTemplate | null {
  const current = getCategoryTemplate(templateId)
  if (!current) return null
  const next = normalizeTemplate({
    ...current,
    ...updates,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: Date.now(),
    brandSpec: defaultBrandSpec({ ...current.brandSpec, ...updates.brandSpec }),
    promptRules: defaultPromptRules({ ...current.promptRules, ...updates.promptRules }),
  })
  saveCategoryTemplate(next)
  return next
}

export function saveCategoryTemplate(template: CategoryTemplate): void {
  ensureTemplateRoot()
  fs.writeFileSync(getTemplateFilePath(template.id), JSON.stringify(template, null, 2), "utf-8")
}

export function deleteCategoryTemplate(templateId: string): boolean {
  const filePath = getTemplateFilePath(templateId)
  if (!fs.existsSync(filePath)) return false
  fs.unlinkSync(filePath)
  return true
}

export function resolveRulesContext(project: ProjectRulesLike): RulesContext {
  const template = project.categoryTemplateId ? getCategoryTemplate(project.categoryTemplateId) : null
  const baseBrand = template?.brandSpec || defaultBrandSpec()
  const basePromptRules = template?.promptRules || defaultPromptRules()

  const mergedBrandSpec: BrandSpec = {
    toneAnchors: Array.isArray(project.brandSpec?.toneAnchors) && project.brandSpec!.toneAnchors!.length > 0
      ? project.brandSpec!.toneAnchors!.map(String)
      : baseBrand.toneAnchors,
    bannedPhrases: Array.isArray(project.brandSpec?.bannedPhrases) && project.brandSpec!.bannedPhrases!.length > 0
      ? project.brandSpec!.bannedPhrases!.map(String)
      : baseBrand.bannedPhrases,
    formattingRules: Array.isArray(project.brandSpec?.formattingRules) && project.brandSpec!.formattingRules!.length > 0
      ? project.brandSpec!.formattingRules!.map(String)
      : baseBrand.formattingRules,
    safetyConstraints: Array.isArray(project.brandSpec?.safetyConstraints) && project.brandSpec!.safetyConstraints!.length > 0
      ? project.brandSpec!.safetyConstraints!.map(String)
      : baseBrand.safetyConstraints,
  }

  const mergedPromptRules: PromptRules = {
    imageryRecipe: defaultPromptRecipe({ ...basePromptRules.imageryRecipe, ...project.promptRules?.imageryRecipe }),
    videoRecipe: defaultPromptRecipe({ ...basePromptRules.videoRecipe, ...project.promptRules?.videoRecipe }),
    consistencyRules: Array.isArray(project.promptRules?.consistencyRules) && project.promptRules!.consistencyRules!.length > 0
      ? project.promptRules!.consistencyRules!.map(String)
      : basePromptRules.consistencyRules,
    validationChecklist: Array.isArray(project.promptRules?.validationChecklist) && project.promptRules!.validationChecklist!.length > 0
      ? project.promptRules!.validationChecklist!.map(String)
      : basePromptRules.validationChecklist,
  }

  return {
    templateId: template?.id || null,
    brandSpec: mergedBrandSpec,
    promptRules: mergedPromptRules,
  }
}

export function getDefaultScheduleSettings(raw?: Partial<ScheduleSettings>): ScheduleSettings {
  return {
    enabled: Boolean(raw?.enabled || false),
    cron: String(raw?.cron || "0 9 * * 1"),
    timezone: String(raw?.timezone || "Europe/Oslo"),
    maxConcurrentRuns: Number(raw?.maxConcurrentRuns || 1),
  }
}

export function getDefaultBrandSpec(raw?: Partial<BrandSpec>): BrandSpec {
  return defaultBrandSpec(raw)
}

export function getDefaultPromptRules(raw?: Partial<PromptRules>): PromptRules {
  return defaultPromptRules(raw)
}

