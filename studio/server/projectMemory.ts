import * as fs from "node:fs"
import * as path from "node:path"
import { getProjectDir, getProject } from "./projects"

export type MemoryRole = "user" | "assistant" | "system"

export interface ConversationMessage {
  type: "message"
  role: MemoryRole
  content: string
  timestamp: number
  model?: string
  tokenUsage?: {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
  }
  metadata?: Record<string, any>
}

interface ConversationHeader {
  type: "session"
  version: number
  projectId: string
  sessionId: string
  createdAt: number
  title: string
}

interface ConversationSummary {
  type: "summary"
  timestamp: number
  summary: string
  compactedMessages: number
}

type ConversationLine = ConversationHeader | ConversationMessage | ConversationSummary

export interface ProjectMemoryState {
  version: number
  projectId: string
  decisions: string[]
  feedback: string[]
  writingNotes: string[]
  episodes: Array<{
    id: string
    title: string
    summary: string
    createdAt: number
    approvedScript?: string
  }>
  recentChats: Array<{
    sessionId: string
    user: string
    assistant: string
    timestamp: number
  }>
  updateLog: Array<{
    timestamp: number
    message: string
    keysUpdated: string[]
  }>
  lastUpdated: number
}

export interface SessionListItem {
  sessionId: string
  title: string
  createdAt: number
  updatedAt: number
  messageCount: number
}

const MEMORY_VERSION = 1
const MAX_LOG_ENTRIES = 50
const MAX_RECENT_CHATS = 100

function getConversationsDir(projectId: string): string {
  return path.join(getProjectDir(projectId), "conversations")
}

function getSessionFilePath(projectId: string, sessionId: string): string {
  return path.join(getConversationsDir(projectId), `${sessionId}.jsonl`)
}

function getMemoryFilePath(projectId: string): string {
  return path.join(getProjectDir(projectId), "memory.json")
}

function ensureProjectMemoryDirs(projectId: string): void {
  const projectDir = getProjectDir(projectId)
  const conversationsDir = getConversationsDir(projectId)
  const runsDir = path.join(projectDir, "runs")
  if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true })
  if (!fs.existsSync(conversationsDir)) fs.mkdirSync(conversationsDir, { recursive: true })
  if (!fs.existsSync(runsDir)) fs.mkdirSync(runsDir, { recursive: true })
}

function makeSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function sanitizeText(input: string, maxChars = 4000): string {
  if (!input) return ""
  return String(input).replace(/\s+/g, " ").trim().slice(0, maxChars)
}

export function createSession(projectId: string, title?: string): string {
  ensureProjectMemoryDirs(projectId)
  const sessionId = makeSessionId()
  const project = getProject(projectId)
  const header: ConversationHeader = {
    type: "session",
    version: 1,
    projectId,
    sessionId,
    createdAt: Date.now(),
    title: title?.trim() || project?.name || "Project Chat",
  }

  const filePath = getSessionFilePath(projectId, sessionId)
  fs.writeFileSync(filePath, `${JSON.stringify(header)}\n`, "utf-8")
  return sessionId
}

function ensureSession(projectId: string, sessionId?: string): string {
  const id = sessionId || createSession(projectId)
  const filePath = getSessionFilePath(projectId, id)
  if (!fs.existsSync(filePath)) {
    const project = getProject(projectId)
    const header: ConversationHeader = {
      type: "session",
      version: 1,
      projectId,
      sessionId: id,
      createdAt: Date.now(),
      title: project?.name || "Project Chat",
    }
    ensureProjectMemoryDirs(projectId)
    fs.writeFileSync(filePath, `${JSON.stringify(header)}\n`, "utf-8")
  }
  return id
}

export function appendConversationMessage(
  projectId: string,
  sessionId: string | undefined,
  message: Omit<ConversationMessage, "type" | "timestamp"> & { timestamp?: number }
): { sessionId: string; stored: ConversationMessage } {
  const actualSessionId = ensureSession(projectId, sessionId)
  const stored: ConversationMessage = {
    type: "message",
    role: message.role,
    content: sanitizeText(message.content, 24000),
    timestamp: message.timestamp ?? Date.now(),
    model: message.model,
    tokenUsage: message.tokenUsage,
    metadata: message.metadata,
  }
  const filePath = getSessionFilePath(projectId, actualSessionId)
  fs.appendFileSync(filePath, `${JSON.stringify(stored)}\n`, "utf-8")
  return { sessionId: actualSessionId, stored }
}

function parseJsonlFile(filePath: string): ConversationLine[] {
  if (!fs.existsSync(filePath)) return []
  const raw = fs.readFileSync(filePath, "utf-8")
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0)
  const parsed: ConversationLine[] = []
  for (const line of lines) {
    try {
      parsed.push(JSON.parse(line) as ConversationLine)
    } catch {
      // Keep going if a malformed line appears.
    }
  }
  return parsed
}

export function listConversationSessions(projectId: string): SessionListItem[] {
  const dir = getConversationsDir(projectId)
  if (!fs.existsSync(dir)) return []

  const sessions = fs
    .readdirSync(dir)
    .filter((fileName) => fileName.endsWith(".jsonl"))
    .map((fileName) => {
      const filePath = path.join(dir, fileName)
      const lines = parseJsonlFile(filePath)
      const header = lines.find((line) => line.type === "session") as ConversationHeader | undefined
      const messages = lines.filter((line) => line.type === "message") as ConversationMessage[]
      const updatedAt = messages.length > 0 ? messages[messages.length - 1].timestamp : header?.createdAt || Date.now()
      return {
        sessionId: fileName.replace(/\.jsonl$/, ""),
        title: header?.title || "Project Chat",
        createdAt: header?.createdAt || updatedAt,
        updatedAt,
        messageCount: messages.length,
      }
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)

  return sessions
}

export function getConversationSession(projectId: string, sessionId: string): {
  sessionId: string
  title: string
  createdAt: number
  messages: ConversationMessage[]
  summaries: ConversationSummary[]
} | null {
  const filePath = getSessionFilePath(projectId, sessionId)
  if (!fs.existsSync(filePath)) return null
  const lines = parseJsonlFile(filePath)
  const header = lines.find((line) => line.type === "session") as ConversationHeader | undefined
  const messages = lines.filter((line) => line.type === "message") as ConversationMessage[]
  const summaries = lines.filter((line) => line.type === "summary") as ConversationSummary[]
  return {
    sessionId,
    title: header?.title || "Project Chat",
    createdAt: header?.createdAt || Date.now(),
    messages,
    summaries,
  }
}

export function getRecentSessionMessages(projectId: string, sessionId: string, limit = 20): ConversationMessage[] {
  const session = getConversationSession(projectId, sessionId)
  if (!session) return []
  return session.messages.slice(-Math.max(1, limit))
}

function defaultMemory(projectId: string): ProjectMemoryState {
  return {
    version: MEMORY_VERSION,
    projectId,
    decisions: [],
    feedback: [],
    writingNotes: [],
    episodes: [],
    recentChats: [],
    updateLog: [],
    lastUpdated: Date.now(),
  }
}

export function loadProjectMemory(projectId: string): ProjectMemoryState {
  ensureProjectMemoryDirs(projectId)
  const filePath = getMemoryFilePath(projectId)
  if (!fs.existsSync(filePath)) {
    const state = defaultMemory(projectId)
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8")
    return state
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as ProjectMemoryState
    return { ...defaultMemory(projectId), ...parsed, projectId }
  } catch (error) {
    console.error(`[ProjectMemory] Failed to parse memory for ${projectId}:`, error)
    return defaultMemory(projectId)
  }
}

export function saveProjectMemory(projectId: string, state: ProjectMemoryState): ProjectMemoryState {
  ensureProjectMemoryDirs(projectId)
  const next: ProjectMemoryState = {
    ...state,
    projectId,
    version: MEMORY_VERSION,
    lastUpdated: Date.now(),
  }
  fs.writeFileSync(getMemoryFilePath(projectId), JSON.stringify(next, null, 2), "utf-8")
  return next
}

function dedupeStrings(input: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of input) {
    const trimmed = item.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
  }
  return out
}

function deepMerge(base: any, updates: any): any {
  if (Array.isArray(base) && Array.isArray(updates)) {
    return dedupeStrings([...base.map(String), ...updates.map(String)])
  }
  if (typeof base === "object" && base && typeof updates === "object" && updates) {
    const merged: Record<string, any> = { ...base }
    for (const key of Object.keys(updates)) {
      merged[key] = key in merged ? deepMerge(merged[key], updates[key]) : updates[key]
    }
    return merged
  }
  return updates
}

export function mergeProjectMemoryUpdates(
  projectId: string,
  updates: Partial<ProjectMemoryState>,
  logMessage = "Memory updated"
): ProjectMemoryState {
  const current = loadProjectMemory(projectId)
  const merged = deepMerge(current, updates) as ProjectMemoryState
  const logEntry = {
    timestamp: Date.now(),
    message: logMessage,
    keysUpdated: Object.keys(updates),
  }
  merged.updateLog = [...(merged.updateLog || []), logEntry].slice(-MAX_LOG_ENTRIES)
  merged.recentChats = (merged.recentChats || []).slice(-MAX_RECENT_CHATS)
  return saveProjectMemory(projectId, merged)
}

export function addMemoryEntry(projectId: string, entry: {
  decision?: string
  feedback?: string
  writingNote?: string
  episode?: { title: string; summary: string; approvedScript?: string }
}): ProjectMemoryState {
  const updates: Partial<ProjectMemoryState> = {}
  if (entry.decision) updates.decisions = [entry.decision]
  if (entry.feedback) updates.feedback = [entry.feedback]
  if (entry.writingNote) updates.writingNotes = [entry.writingNote]
  if (entry.episode) {
    updates.episodes = [
      {
        id: `episode-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: entry.episode.title,
        summary: entry.episode.summary,
        approvedScript: entry.episode.approvedScript,
        createdAt: Date.now(),
      },
    ]
  }
  return mergeProjectMemoryUpdates(projectId, updates, "Memory entry added")
}

function extractRulesFromUserText(userText: string, brain?: any): {
  decisions: string[]
  feedback: string[]
  writingNotes: string[]
} {
  const text = sanitizeText(userText, 12000)
  if (!text) return { decisions: [], feedback: [], writingNotes: [] }

  // 🧠 Use brain-powered extraction if available
  if (brain && typeof brain.extractRules === 'function') {
    try {
      // Note: This would require project and memory context
      // For now, we'll use regex as fallback since we don't have those here
      // The brain extraction is better called directly from the chat endpoint
    } catch (brainError) {
      console.error("[Memory] Brain extraction failed, using regex fallback:", brainError)
    }
  }

  // Regex-based extraction (fallback or default)
  const sentences = text
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  const decisions = sentences.filter((s) => /(must|always|never|do not|don't|should)/i.test(s))
  const feedback = sentences.filter((s) => /(change|fix|adjust|revise|improve|not good|too|less|more)/i.test(s))
  const writingNotes = sentences.filter((s) => /(word|draft|tone|style|scene|character|avatar|script)/i.test(s))

  return {
    decisions: decisions.slice(0, 5),
    feedback: feedback.slice(0, 5),
    writingNotes: writingNotes.slice(0, 8),
  }
}

export function updateMemoryAfterChatExchange(projectId: string, payload: {
  sessionId: string
  userText: string
  assistantText: string
}): ProjectMemoryState {
  const extracted = extractRulesFromUserText(payload.userText)
  const updates: Partial<ProjectMemoryState> = {
    decisions: extracted.decisions,
    feedback: extracted.feedback,
    writingNotes: extracted.writingNotes,
    recentChats: [
      {
        sessionId: payload.sessionId,
        user: sanitizeText(payload.userText, 400),
        assistant: sanitizeText(payload.assistantText, 350),
        timestamp: Date.now(),
      },
    ],
  }
  return mergeProjectMemoryUpdates(projectId, updates, "Chat exchange persisted")
}

export function buildMemoryPromptContext(projectId: string, maxChars = 3500): string {
  const memory = loadProjectMemory(projectId)
  const project = getProject(projectId)
  const parts: string[] = []

  if (project) {
    parts.push(`PROJECT: ${project.name}`)
    if (project.description) parts.push(`DESCRIPTION: ${project.description}`)
    parts.push(`PRIMARY AVATAR: ${project.primaryAvatar || "not set"}`)
    parts.push(`ROLES: ${project.roles.map((r) => `${r.name}(${r.model})`).join(", ") || "none"}`)
    if (project.guidelines) parts.push(`GUIDELINES:\n${project.guidelines.slice(0, 1200)}`)
    if (project.restrictions.length > 0) parts.push(`RESTRICTIONS: ${project.restrictions.join(" | ")}`)
    parts.push(
      `SOUL: tone=${project.soul.voiceTone}; style=${project.soul.writingStyle}; audience=${project.soul.targetAudience}; do=${project.soul.doList.join(", ")}; dont=${project.soul.dontList.join(", ")}`
    )
    parts.push(
      `PRODUCTION RULES: drafts=${project.production.draftsPerEpisode}; words=${project.production.targetWordCount.min}-${project.production.targetWordCount.max}; scenes=${project.production.sceneCount.min}-${project.production.sceneCount.max}`
    )
    if (project.exampleScripts?.length > 0) {
      parts.push(`EXAMPLE SCRIPT 1:\n${project.exampleScripts[0].slice(0, 800)}`)
      if (project.exampleScripts[1]) parts.push(`EXAMPLE SCRIPT 2:\n${project.exampleScripts[1].slice(0, 800)}`)
    }
  }

  if (memory.decisions.length > 0) parts.push(`KEY DECISIONS: ${memory.decisions.slice(-12).join(" | ")}`)
  if (memory.feedback.length > 0) parts.push(`RECENT FEEDBACK: ${memory.feedback.slice(-10).join(" | ")}`)
  if (memory.writingNotes.length > 0) parts.push(`WRITING NOTES: ${memory.writingNotes.slice(-12).join(" | ")}`)
  if (memory.episodes.length > 0) {
    const episodeSummary = memory.episodes
      .slice(-10)
      .map((e) => `${e.title}: ${sanitizeText(e.summary, 220)}`)
      .join(" || ")
    parts.push(`EPISODE HISTORY: ${episodeSummary}`)
  }

  let context = parts.join("\n\n")
  if (context.length > maxChars) {
    context = `${context.slice(0, maxChars - 24)}\n\n[TRUNCATED FOR CONTEXT]`
  }
  return context
}

export async function compactSession(
  projectId: string,
  sessionId: string,
  maxMessages: number,
  summarizeFn?: (messages: ConversationMessage[]) => Promise<string>
): Promise<{ compacted: boolean; kept: number; archived?: string }> {
  const filePath = getSessionFilePath(projectId, sessionId)
  if (!fs.existsSync(filePath)) return { compacted: false, kept: 0 }

  const lines = parseJsonlFile(filePath)
  const header = lines.find((line) => line.type === "session") as ConversationHeader | undefined
  const messages = lines.filter((line) => line.type === "message") as ConversationMessage[]
  if (messages.length <= maxMessages) return { compacted: false, kept: messages.length }

  const keepCount = Math.max(20, maxMessages)
  const oldMessages = messages.slice(0, messages.length - keepCount)
  const recentMessages = messages.slice(-keepCount)
  const summaryText = summarizeFn
    ? await summarizeFn(oldMessages)
    : `Compacted ${oldMessages.length} older messages to preserve context window.`

  const summaryLine: ConversationSummary = {
    type: "summary",
    timestamp: Date.now(),
    summary: sanitizeText(summaryText, 4000),
    compactedMessages: oldMessages.length,
  }

  const archivePath = `${filePath}.bak.${Date.now()}`
  fs.copyFileSync(filePath, archivePath)

  const nextLines: string[] = []
  if (header) nextLines.push(JSON.stringify(header))
  nextLines.push(JSON.stringify(summaryLine))
  for (const msg of recentMessages) nextLines.push(JSON.stringify(msg))
  fs.writeFileSync(filePath, `${nextLines.join("\n")}\n`, "utf-8")

  return { compacted: true, kept: recentMessages.length + 1, archived: archivePath }
}

