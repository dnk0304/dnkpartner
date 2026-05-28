import * as fs from "node:fs"
import * as path from "node:path"

export type ChatAssistantMode = "normal" | "storymaker" | "advanced-prompting" | "manager"
export type DelegatedChatAssistantMode = Exclude<ChatAssistantMode, "manager">
export type ManagerDelegationSource = "explicit" | "memory-match"

export interface ManagerDelegationDecision {
  targetMode: DelegatedChatAssistantMode
  normalizedInstruction: string
  reason: string
  source: ManagerDelegationSource
  matchedKeywords: string[]
}

export interface ManagerAgentProfile {
  id: DelegatedChatAssistantMode
  label: string
  functions: string[]
  keywords: string[]
  examples: string[]
}

export interface ManagerAgentMemory {
  filePath: string
  loadedAt: number
  routingRules: string[]
  agents: Record<DelegatedChatAssistantMode, ManagerAgentProfile>
  rawMarkdown: string
}

const MANAGER_MEMORY_DIR = path.join(process.cwd(), "data", "manager")
const MANAGER_MEMORY_FILE = path.join(MANAGER_MEMORY_DIR, "memory.md")

const DEFAULT_MANAGER_MEMORY_MD = `# Master Manager Default Memory

## Routing Rules
- Auto-route every user request to the most suitable specialist assistant when confidence is high.
- Use StoryCreator for script splitting, scene extraction, storyboard, pacing, and timeline requests.
- Use Advanced Prompting for refining, polishing, optimizing, or productionizing prompts.
- Use Normal assistant for general chat, planning, Q&A, troubleshooting, and mixed requests.
- If uncertain, route to Normal assistant by default.

## Agent: normal
### Functions
- Handle natural conversation and general requests.
- Explain concepts, summarize plans, and answer operational questions.
- Coordinate next steps when the user asks for strategy or project management.
### Keywords
- explain
- summarize
- plan
- strategy
- troubleshoot
- fix
- why
- how
- question
### Examples
- Explain what this workflow does.
- Give me a short action plan.
- Help me debug this issue.

## Agent: storymaker
### Functions
- Convert scripts/transcripts into scene prompts.
- Split stories into shots/scenes with pacing and durations.
- Expand, condense, or restructure scene flow while preserving narrative continuity.
### Keywords
- script
- transcript
- scene
- storyboard
- pacing
- timeline
- split into scenes
- shot list
- sequence
### Examples
- Split this script into 12 scenes.
- Turn this transcript into a shot list.
- Improve pacing across these scenes.

## Agent: advanced-prompting
### Functions
- Refine rough ideas into production-ready prompts.
- Improve visual detail, style consistency, camera language, and constraints.
- Generate multiple polished prompt variants for image/video tools.
### Keywords
- refine
- polish
- optimize
- improve prompt
- prompt engineering
- production-ready
- cinematic prompt
- style consistency
- variant
### Examples
- Refine these prompts for cinematic realism.
- Make this prompt production-ready.
- Generate 5 polished prompt variants.
`

const DEFAULT_AGENT_PROFILES: Record<DelegatedChatAssistantMode, ManagerAgentProfile> = {
  normal: {
    id: "normal",
    label: "Normal",
    functions: [
      "Handle natural conversation and general requests.",
      "Explain concepts, summarize plans, and answer operational questions.",
    ],
    keywords: ["explain", "summarize", "plan", "strategy", "troubleshoot", "fix", "question", "how", "why"],
    examples: ["Explain this workflow.", "Give me an action plan.", "Help me troubleshoot this."],
  },
  storymaker: {
    id: "storymaker",
    label: "StoryCreator",
    functions: [
      "Convert scripts/transcripts into scene prompts.",
      "Split stories into scenes and suggest durations.",
    ],
    keywords: ["script", "transcript", "scene", "storyboard", "pacing", "timeline", "shot list", "split into scenes"],
    examples: ["Split this script into scenes.", "Turn this transcript into scene prompts."],
  },
  "advanced-prompting": {
    id: "advanced-prompting",
    label: "Advanced",
    functions: [
      "Refine rough ideas into production-ready prompts.",
      "Improve detail, style consistency, and prompt quality.",
    ],
    keywords: [
      "refine",
      "polish",
      "optimize",
      "prompt engineering",
      "production-ready",
      "improve prompt",
      "style consistency",
      "variant",
    ],
    examples: ["Refine these prompts.", "Make this prompt production-ready."],
  },
}

function ensureManagerMemoryFile(): string {
  if (!fs.existsSync(MANAGER_MEMORY_DIR)) {
    fs.mkdirSync(MANAGER_MEMORY_DIR, { recursive: true })
  }
  if (!fs.existsSync(MANAGER_MEMORY_FILE)) {
    fs.writeFileSync(MANAGER_MEMORY_FILE, DEFAULT_MANAGER_MEMORY_MD, "utf-8")
  }
  return MANAGER_MEMORY_FILE
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function extractSection(markdown: string, headingPattern: string): string {
  const regex = new RegExp(`${headingPattern}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`, "i")
  const match = markdown.match(regex)
  return match?.[1] || ""
}

function extractSubsection(section: string, title: string): string {
  const regex = new RegExp(`###\\s*${escapeRegex(title)}\\s*\\n([\\s\\S]*?)(?=\\n###\\s+|$)`, "i")
  const match = section.match(regex)
  return match?.[1] || ""
}

function parseBullets(block: string): string[] {
  return String(block || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "").trim())
    .filter(Boolean)
}

function parseAgentProfile(markdown: string, profileId: DelegatedChatAssistantMode): ManagerAgentProfile {
  const section = extractSection(markdown, `##\\s*Agent:\\s*${escapeRegex(profileId)}`)
  const fallback = DEFAULT_AGENT_PROFILES[profileId]
  if (!section.trim()) return fallback

  const functions = parseBullets(extractSubsection(section, "Functions"))
  const keywords = parseBullets(extractSubsection(section, "Keywords")).map((item) => item.toLowerCase())
  const examples = parseBullets(extractSubsection(section, "Examples"))

  return {
    ...fallback,
    functions: functions.length > 0 ? functions : fallback.functions,
    keywords: keywords.length > 0 ? keywords : fallback.keywords,
    examples: examples.length > 0 ? examples : fallback.examples,
  }
}

function parseRoutingRules(markdown: string): string[] {
  const rules = parseBullets(extractSection(markdown, "##\\s*Routing Rules"))
  return rules.length > 0 ? rules : [
    "Use StoryCreator for script/scene requests.",
    "Use Advanced Prompting for prompt-refinement requests.",
    "Use Normal assistant for general requests or uncertainty.",
  ]
}

function normalizeKeyword(input: string): string {
  return String(input || "").trim().toLowerCase()
}

function detectKeywordMatches(text: string, keywords: string[]): string[] {
  const lowered = text.toLowerCase()
  const matches: string[] = []
  for (const keyword of keywords.map(normalizeKeyword).filter(Boolean)) {
    if (keyword.includes(" ")) {
      if (lowered.includes(keyword)) matches.push(keyword)
      continue
    }
    const pattern = new RegExp(`\\b${escapeRegex(keyword)}\\b`, "i")
    if (pattern.test(lowered)) matches.push(keyword)
  }
  return [...new Set(matches)]
}

export function normalizeAssistantMode(value: unknown): ChatAssistantMode {
  if (value === "storymaker" || value === "advanced-prompting" || value === "manager") {
    return value
  }
  return "normal"
}

export function getAssistantModeLabel(mode: DelegatedChatAssistantMode): string {
  if (mode === "storymaker") return "StoryCreator"
  if (mode === "advanced-prompting") return "Advanced"
  return "Normal"
}

function stripManagerCommandAliases(input: string): string {
  return String(input || "")
    .replace(/(?:^|\s)@(?:storymaker|storycreator|advanced|normal)\b/gi, " ")
    .replace(/(?:^|\s)\/(?:storymaker|story|advanced|normal)\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
}

export function loadManagerAgentMemory(): ManagerAgentMemory {
  const filePath = ensureManagerMemoryFile()
  let markdown = ""
  try {
    markdown = fs.readFileSync(filePath, "utf-8")
  } catch {
    markdown = DEFAULT_MANAGER_MEMORY_MD
  }

  return {
    filePath,
    loadedAt: Date.now(),
    routingRules: parseRoutingRules(markdown),
    agents: {
      normal: parseAgentProfile(markdown, "normal"),
      storymaker: parseAgentProfile(markdown, "storymaker"),
      "advanced-prompting": parseAgentProfile(markdown, "advanced-prompting"),
    },
    rawMarkdown: markdown,
  }
}

export function getManagerAgentMemoryPrompt(memory: ManagerAgentMemory, maxChars = 2200): string {
  const lines: string[] = ["MANAGER MEMORY PROFILE:"]
  if (memory.routingRules.length > 0) {
    lines.push("Routing rules:")
    memory.routingRules.slice(0, 8).forEach((rule) => lines.push(`- ${rule}`))
  }
  ;(["normal", "storymaker", "advanced-prompting"] as DelegatedChatAssistantMode[]).forEach((mode) => {
    const profile = memory.agents[mode]
    lines.push(`Agent ${profile.label} (${mode}):`)
    lines.push(`- Functions: ${profile.functions.slice(0, 5).join(" | ")}`)
    lines.push(`- Keywords: ${profile.keywords.slice(0, 16).join(", ")}`)
  })
  let prompt = lines.join("\n")
  if (prompt.length > maxChars) {
    prompt = `${prompt.slice(0, maxChars - 26)}\n[MANAGER MEMORY TRUNCATED]`
  }
  return prompt
}

export function resolveManagerDelegationFromMemory(
  input: string,
  memory: ManagerAgentMemory
): ManagerDelegationDecision | null {
  const raw = String(input || "").trim()
  if (!raw) return null
  const lowered = raw.toLowerCase()
  const normalizedInstruction = stripManagerCommandAliases(raw) || raw

  if (/@(?:storymaker|storycreator)\b|\/(?:storymaker|story)\b/.test(lowered)) {
    return {
      targetMode: "storymaker",
      normalizedInstruction,
      reason: "User explicitly requested StoryCreator assistant.",
      source: "explicit",
      matchedKeywords: ["@storymaker"],
    }
  }
  if (/@advanced\b|\/advanced\b/.test(lowered)) {
    return {
      targetMode: "advanced-prompting",
      normalizedInstruction,
      reason: "User explicitly requested Advanced assistant.",
      source: "explicit",
      matchedKeywords: ["@advanced"],
    }
  }
  if (/@normal\b|\/normal\b/.test(lowered)) {
    return {
      targetMode: "normal",
      normalizedInstruction,
      reason: "User explicitly requested Normal assistant.",
      source: "explicit",
      matchedKeywords: ["@normal"],
    }
  }

  const profileEntries: Array<{ mode: DelegatedChatAssistantMode; matches: string[]; score: number }> = (
    ["storymaker", "advanced-prompting", "normal"] as DelegatedChatAssistantMode[]
  ).map((mode) => {
    const profile = memory.agents[mode]
    const matches = detectKeywordMatches(lowered, profile.keywords)
    let score = matches.length

    // Lightweight boosts to avoid brittle routing in common scenarios.
    if (mode === "storymaker" && /(script|transcript|scene|storyboard|shot list|timeline)/i.test(lowered)) score += 2
    if (mode === "advanced-prompting" && /(refine|polish|optimi[sz]e|prompt engineering|production-ready)/i.test(lowered)) score += 2
    if (mode === "normal" && /(explain|plan|how|why|what|debug|troubleshoot)/i.test(lowered)) score += 1

    return { mode, matches, score }
  })

  const normalEntry = profileEntries.find((entry) => entry.mode === "normal") || { mode: "normal" as const, matches: [], score: 0 }
  const specialistEntries = profileEntries
    .filter((entry) => entry.mode !== "normal")
    .sort((a, b) => b.score - a.score)
  const bestSpecialist = specialistEntries[0]

  // Preserve manager back-and-forth by delegating only when a specialist intent is clearly stronger.
  const shouldDelegateToSpecialist = Boolean(
    bestSpecialist &&
    bestSpecialist.score >= 2 &&
    bestSpecialist.score > normalEntry.score
  )
  if (!shouldDelegateToSpecialist) return null

  const label = getAssistantModeLabel(bestSpecialist.mode)
  return {
    targetMode: bestSpecialist.mode,
    normalizedInstruction: raw,
    reason: `Matched ${label} assistant from manager memory profile.`,
    source: "memory-match",
    matchedKeywords: bestSpecialist.matches.slice(0, 8),
  }
}

