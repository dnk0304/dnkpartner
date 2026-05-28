import Anthropic from "@anthropic-ai/sdk"
import * as fs from "node:fs"
import * as path from "node:path"
import { ProjectConfig } from "./projects"
import { ProjectMemoryState } from "./projectMemory"

// ==================== INTERFACES ====================

export interface BrainConfig {
  enabled: boolean
  model: string // "claude-opus-4-6"
  qualityThreshold: number // e.g. 80 = auto-approve above 80
  maxAutoRevisions: number // e.g. 3
  autoApproveAboveScore: number // e.g. 90
  tokenBudgetPerReview: number // Max tokens per brain call
  enablePromptCaching: boolean // Use Anthropic prompt caching
  enableTokenEfficientTools: boolean
}

export interface BrainTool {
  name: string
  description: string
  input_schema: {
    type: "object"
    properties: Record<string, any>
    required?: string[]
  }
}

export interface BrainVerdict {
  approved: boolean
  score: number // 0-100
  issues: string[]
  suggestions: string[]
  revisedDraft?: string // If auto-revised
  reasoning: string
  tokenUsage: {
    input: number
    output: number
    cached: number
  }
}

export interface DraftScore {
  score: number
  breakdown: {
    guidelineCompliance: number
    toneConsistency: number
    structuralQuality: number
    audienceAlignment: number
  }
  strengths: string[]
  weaknesses: string[]
}

export interface ChatOrchestration {
  workerSystemPrompt: string // Opus crafts the system prompt for the cheap model
  suggestedResponse?: string // Optional: Opus pre-drafts the response
  memoryUpdates: Partial<ProjectMemoryState>
  internalNotes: string // Brain's private reasoning (never shown to user)
  tokenUsage: {
    input: number
    output: number
    cached: number
  }
}

export interface BrainContext {
  task: "review_draft" | "score_draft" | "revise_draft" | "orchestrate_chat" | "extract_rules"
  projectId: string
  project: ProjectConfig
  memory: ProjectMemoryState
  input: any
}

export interface BrainDecision {
  action: "approve" | "revise" | "escalate" | "respond"
  output: any
  reasoning: string
  toolCallsMade: string[]
  tokenUsage: {
    input: number
    output: number
    cached: number
  }
}

export interface BrainLogEntry {
  timestamp: number
  projectId: string
  runId?: string
  step?: string
  action: "review" | "revise" | "approve" | "escalate" | "orchestrate" | "extract"
  score?: number
  reasoning: string
  tokenUsage: {
    input: number
    output: number
    cached: number
  }
}

interface ScoreCriteria {
  guidelines: string
  restrictions: string[]
  soul: {
    voiceTone: string
    writingStyle: string
    targetAudience: string
  }
  exampleScripts: string[]
}

// ==================== BRAIN CLASS ====================

export class AutopilotBrain {
  private anthropic: Anthropic | null
  private toolRegistry: BrainTool[]
  private cachedProjectContext: Map<string, { context: string; timestamp: number }> = new Map()
  private cacheTTL = 5 * 60 * 1000 // 5 minutes to match Anthropic's cache duration

  constructor(anthropic: Anthropic | null) {
    this.anthropic = anthropic
    this.toolRegistry = this.initializeTools()
  }

  private initializeTools(): BrainTool[] {
    return [
      {
        name: "score_draft",
        description: "Score a draft against project rules and guidelines. Returns a score from 0-100 with detailed breakdown.",
        input_schema: {
          type: "object",
          properties: {
            draft: { type: "string", description: "The draft text to score" },
            criteria: {
              type: "object",
              description: "Scoring criteria including guidelines, restrictions, and style requirements"
            }
          },
          required: ["draft", "criteria"]
        }
      },
      {
        name: "list_issues",
        description: "Extract specific issues from a draft that violate project guidelines or quality standards.",
        input_schema: {
          type: "object",
          properties: {
            draft: { type: "string", description: "The draft text to analyze" },
            guidelines: { type: "string", description: "Project guidelines to check against" }
          },
          required: ["draft", "guidelines"]
        }
      },
      {
        name: "revise_section",
        description: "Rewrite a specific section of a draft to fix identified issues.",
        input_schema: {
          type: "object",
          properties: {
            section: { type: "string", description: "The section to revise" },
            issues: { type: "array", items: { type: "string" }, description: "List of issues to fix" },
            guidelines: { type: "string", description: "Guidelines to follow" }
          },
          required: ["section", "issues", "guidelines"]
        }
      },
      {
        name: "check_guidelines",
        description: "Verify if a draft matches project soul, restrictions, and writing style requirements.",
        input_schema: {
          type: "object",
          properties: {
            draft: { type: "string", description: "The draft to verify" },
            soul: { type: "object", description: "Project soul configuration" },
            restrictions: { type: "array", items: { type: "string" }, description: "List of restrictions" }
          },
          required: ["draft", "soul", "restrictions"]
        }
      },
      {
        name: "update_memory",
        description: "Write decisions, feedback, or notes to project memory.",
        input_schema: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["decision", "feedback", "note"], description: "Type of memory entry" },
            content: { type: "string", description: "The content to save" }
          },
          required: ["type", "content"]
        }
      },
      {
        name: "approve_step",
        description: "Auto-approve a pipeline step when quality threshold is met.",
        input_schema: {
          type: "object",
          properties: {
            step: { type: "string", description: "Step identifier" },
            score: { type: "number", description: "Quality score that justified approval" },
            reasoning: { type: "string", description: "Why this was approved" }
          },
          required: ["step", "score", "reasoning"]
        }
      },
      {
        name: "request_owner_review",
        description: "Escalate to owner when uncertain or when quality is below auto-approval threshold.",
        input_schema: {
          type: "object",
          properties: {
            reason: { type: "string", description: "Why owner review is needed" },
            concerns: { type: "array", items: { type: "string" }, description: "Specific concerns" }
          },
          required: ["reason", "concerns"]
        }
      },
      {
        name: "delegate_to_worker",
        description: "Send orchestrated prompt and instructions to a cheaper worker model for execution.",
        input_schema: {
          type: "object",
          properties: {
            workerModel: { type: "string", description: "Which worker model to use" },
            systemPrompt: { type: "string", description: "System prompt for the worker" },
            task: { type: "string", description: "Task description" }
          },
          required: ["workerModel", "systemPrompt", "task"]
        }
      }
    ]
  }

  // ==================== MAIN THINK METHOD ====================

  async think(context: BrainContext): Promise<BrainDecision> {
    if (!this.anthropic) {
      throw new Error("Anthropic client not initialized. Set ANTHROPIC_API_KEY in environment.")
    }

    const config = context.project.brainConfig
    if (!config?.enabled) {
      throw new Error("Brain is not enabled for this project")
    }

    // Build cached context
    const cachedContext = this.buildCachedContext(context.project, context.memory)
    
    // Build task-specific prompt
    const taskPrompt = this.buildTaskPrompt(context)

    try {
      const response = await this.anthropic.messages.create({
        model: config.model || "claude-opus-4-6",
        max_tokens: config.tokenBudgetPerReview || 4096,
        system: this.buildSystemPrompt(context.task),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: cachedContext,
                cache_control: config.enablePromptCaching ? { type: "ephemeral" } : undefined
              } as any,
              {
                type: "text",
                text: taskPrompt
              }
            ]
          }
        ],
        tools: config.enableTokenEfficientTools ? this.toolRegistry : undefined,
        tool_choice: config.enableTokenEfficientTools ? { type: "auto" } : undefined
      })

      // Extract token usage
      const tokenUsage = {
        input: response.usage.input_tokens || 0,
        output: response.usage.output_tokens || 0,
        cached: (response.usage as any).cache_read_input_tokens || 0
      }

      // Parse response
      const decision = this.parseThinkingResponse(response, context, tokenUsage)
      
      // Log decision
      await this.logDecision(context, decision)

      return decision
    } catch (error: any) {
      console.error("[Brain] Error during think:", error)
      throw new Error(`Brain think failed: ${error.message}`)
    }
  }

  // ==================== SPECIFIC REVIEW FUNCTIONS ====================

  async reviewDraft(
    draft: string,
    project: ProjectConfig,
    memory: ProjectMemoryState,
    runId?: string
  ): Promise<BrainVerdict> {
    const context: BrainContext = {
      task: "review_draft",
      projectId: project.id,
      project,
      memory,
      input: { draft, runId }
    }

    const decision = await this.think(context)
    
    return {
      approved: decision.action === "approve",
      score: decision.output.score || 0,
      issues: decision.output.issues || [],
      suggestions: decision.output.suggestions || [],
      revisedDraft: decision.output.revisedDraft,
      reasoning: decision.reasoning,
      tokenUsage: decision.tokenUsage
    }
  }

  async scoreDraft(
    draft: string,
    criteria: ScoreCriteria,
    project: ProjectConfig,
    memory: ProjectMemoryState
  ): Promise<DraftScore> {
    const context: BrainContext = {
      task: "score_draft",
      projectId: project.id,
      project,
      memory,
      input: { draft, criteria }
    }

    const decision = await this.think(context)
    
    return decision.output as DraftScore
  }

  async autoRevise(
    draft: string,
    verdict: BrainVerdict,
    project: ProjectConfig,
    memory: ProjectMemoryState
  ): Promise<string> {
    const context: BrainContext = {
      task: "revise_draft",
      projectId: project.id,
      project,
      memory,
      input: { draft, verdict }
    }

    const decision = await this.think(context)
    
    return decision.output.revisedDraft || draft
  }

  async orchestrateChat(
    userMessage: string,
    projectContext: string,
    project: ProjectConfig,
    memory: ProjectMemoryState
  ): Promise<ChatOrchestration> {
    const context: BrainContext = {
      task: "orchestrate_chat",
      projectId: project.id,
      project,
      memory,
      input: { userMessage, projectContext }
    }

    const decision = await this.think(context)
    
    return {
      workerSystemPrompt: decision.output.workerSystemPrompt || "",
      suggestedResponse: decision.output.suggestedResponse,
      memoryUpdates: decision.output.memoryUpdates || {},
      internalNotes: decision.reasoning,
      tokenUsage: decision.tokenUsage
    }
  }

  async extractRules(
    userText: string,
    project: ProjectConfig,
    memory: ProjectMemoryState
  ): Promise<{ decisions: string[]; feedback: string[]; writingNotes: string[] }> {
    const context: BrainContext = {
      task: "extract_rules",
      projectId: project.id,
      project,
      memory,
      input: { userText }
    }

    const decision = await this.think(context)
    
    return {
      decisions: decision.output.decisions || [],
      feedback: decision.output.feedback || [],
      writingNotes: decision.output.writingNotes || []
    }
  }

  // ==================== CONTEXT BUILDING ====================

  private buildCachedContext(project: ProjectConfig, memory: ProjectMemoryState): string {
    const cacheKey = `${project.id}-${project.updatedAt}`
    const cached = this.cachedProjectContext.get(cacheKey)
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.context
    }

    const context = `# PROJECT CONTEXT

## Project: ${project.name}
${project.description}

## Soul & Voice
Tone: ${project.soul.voiceTone}
Writing Style: ${project.soul.writingStyle}
Target Audience: ${project.soul.targetAudience}
Channel: ${project.soul.channelName}

### Do List:
${project.soul.doList.map(item => `- ${item}`).join('\n')}

### Don't List:
${project.soul.dontList.map(item => `- ${item}`).join('\n')}

## Guidelines
${project.guidelines}

## Restrictions
${project.restrictions.map((r, i) => `${i + 1}. ${r}`).join('\n')}

## Production Rules
- Drafts per episode: ${project.production.draftsPerEpisode}
- Word count: ${project.production.targetWordCount.min}-${project.production.targetWordCount.max}
- Scene count: ${project.production.sceneCount.min}-${project.production.sceneCount.max}

## Memory Summary
- Decisions: ${memory.decisions.length} recorded
- Feedback: ${memory.feedback.length} items
- Writing Notes: ${memory.writingNotes.length} notes
- Episodes: ${memory.episodes.length} completed

Recent Decisions:
${memory.decisions.slice(-5).map(d => `- ${d}`).join('\n') || '- None yet'}

Recent Feedback:
${memory.feedback.slice(-5).map(f => `- ${f}`).join('\n') || '- None yet'}

Key Writing Notes:
${memory.writingNotes.slice(-10).map(n => `- ${n}`).join('\n') || '- None yet'}
`

    this.cachedProjectContext.set(cacheKey, { context, timestamp: Date.now() })
    return context
  }

  private buildSystemPrompt(task: string): string {
    const basePrompt = `You are an elite AI orchestrator and quality control brain. Your role is to review, score, revise, and orchestrate content creation without directly interacting with the user. You work behind the scenes to ensure all content meets the highest standards before it reaches the owner for approval.

Your capabilities:
- Review drafts against project guidelines and quality standards
- Score content objectively using detailed criteria
- Auto-revise content to fix issues when below threshold
- Orchestrate cheaper worker models to handle user-facing tasks
- Extract and structure important rules and decisions from conversations
- Make autonomous approval decisions when quality exceeds thresholds

You have access to tools for scoring, revising, checking guidelines, updating memory, approving steps, and escalating to the owner when needed.`

    const taskSpecific = {
      review_draft: "\n\nCurrent task: Review a draft script or content. Score it 0-100, identify issues, provide suggestions. If score >= threshold, approve. If below, either auto-revise or escalate to owner.",
      score_draft: "\n\nCurrent task: Score a draft using detailed criteria. Provide breakdown scores for guideline compliance, tone consistency, structural quality, and audience alignment. List strengths and weaknesses.",
      revise_draft: "\n\nCurrent task: Revise a draft to fix identified issues while maintaining the project's voice and guidelines. Improve quality without changing the core message.",
      orchestrate_chat: "\n\nCurrent task: Analyze user's message and project context. Create a system prompt for the worker model that will respond. Update memory with important decisions or feedback. Provide internal notes on strategy.",
      extract_rules: "\n\nCurrent task: Extract decisions, feedback, and writing notes from user's text. Structure them into clear, actionable items for the project memory."
    }

    return basePrompt + (taskSpecific[task as keyof typeof taskSpecific] || "")
  }

  private buildTaskPrompt(context: BrainContext): string {
    switch (context.task) {
      case "review_draft":
        return `# DRAFT TO REVIEW

${context.input.draft}

Please review this draft:
1. Score it 0-100 based on the project guidelines and quality standards
2. List any issues that violate guidelines or reduce quality
3. Provide specific suggestions for improvement
4. If score >= ${context.project.brainConfig.autoApproveAboveScore}, approve it
5. If score < ${context.project.brainConfig.qualityThreshold}, identify what needs revision

Return your verdict in this structure:
{
  "score": <number>,
  "issues": [<list of issues>],
  "suggestions": [<list of suggestions>],
  "reasoning": "<your detailed analysis>"
}`

      case "score_draft":
        return `# DRAFT TO SCORE

${context.input.draft}

Score this draft using these criteria:
${JSON.stringify(context.input.criteria, null, 2)}

Provide detailed breakdown:
{
  "score": <overall 0-100>,
  "breakdown": {
    "guidelineCompliance": <0-100>,
    "toneConsistency": <0-100>,
    "structuralQuality": <0-100>,
    "audienceAlignment": <0-100>
  },
  "strengths": [<what works well>],
  "weaknesses": [<what needs work>]
}`

      case "revise_draft":
        return `# DRAFT TO REVISE

Original:
${context.input.draft}

Issues identified:
${context.input.verdict.issues.join('\n')}

Suggestions:
${context.input.verdict.suggestions.join('\n')}

Please revise this draft to fix the issues while maintaining the project's voice and guidelines. Return only the revised draft text.`

      case "orchestrate_chat":
        return `# USER MESSAGE

${context.input.userMessage}

Analyze this message and create:
1. A system prompt for the worker model that will respond to the user
2. Optional: Pre-draft a suggested response structure
3. Memory updates: any decisions, feedback, or notes from this exchange
4. Internal notes: your strategic thinking (not shown to user)

Return:
{
  "workerSystemPrompt": "<prompt for the cheap model>",
  "suggestedResponse": "<optional response structure>",
  "memoryUpdates": {
    "decisions": [<new decisions>],
    "feedback": [<new feedback>],
    "writingNotes": [<new notes>]
  }
}`

      case "extract_rules":
        return `# USER TEXT

${context.input.userText}

Extract structured information:
- Decisions: definitive choices the user made
- Feedback: opinions or reactions about quality/style
- Writing Notes: guidelines, tips, or writing preferences

Return:
{
  "decisions": [<extracted decisions>],
  "feedback": [<extracted feedback>],
  "writingNotes": [<extracted notes>]
}`

      default:
        return JSON.stringify(context.input)
    }
  }

  private parseThinkingResponse(
    response: Anthropic.Message,
    context: BrainContext,
    tokenUsage: { input: number; output: number; cached: number }
  ): BrainDecision {
    let textContent = ""
    const toolCallsMade: string[] = []

    // Extract text and tool calls from response
    for (const block of response.content) {
      if (block.type === "text") {
        textContent += block.text
      } else if (block.type === "tool_use") {
        toolCallsMade.push(block.name)
      }
    }

    // Parse JSON from text content if present
    let output: any = {}
    try {
      const jsonMatch = textContent.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        output = JSON.parse(jsonMatch[0])
      }
    } catch {
      output = { raw: textContent }
    }

    // Determine action based on task and output
    let action: BrainDecision["action"] = "respond"
    if (context.task === "review_draft" || context.task === "score_draft") {
      const score = output.score || 0
      const threshold = context.project.brainConfig.autoApproveAboveScore || 90
      action = score >= threshold ? "approve" : (score < (context.project.brainConfig.qualityThreshold || 80) ? "revise" : "escalate")
    } else if (context.task === "orchestrate_chat") {
      action = "respond"
    }

    return {
      action,
      output,
      reasoning: output.reasoning || textContent,
      toolCallsMade,
      tokenUsage
    }
  }

  // ==================== LOGGING ====================

  private async logDecision(context: BrainContext, decision: BrainDecision): Promise<void> {
    const logEntry: BrainLogEntry = {
      timestamp: Date.now(),
      projectId: context.projectId,
      runId: context.input.runId,
      step: context.task,
      action: this.mapActionToLogAction(decision.action),
      score: decision.output.score,
      reasoning: decision.reasoning,
      tokenUsage: decision.tokenUsage
    }

    const logPath = this.getBrainLogPath(context.projectId)
    const logLine = JSON.stringify(logEntry) + "\n"
    
    try {
      fs.appendFileSync(logPath, logLine, "utf-8")
    } catch (error) {
      console.error("[Brain] Failed to write log:", error)
    }
  }

  private mapActionToLogAction(action: BrainDecision["action"]): BrainLogEntry["action"] {
    const map: Record<string, BrainLogEntry["action"]> = {
      approve: "approve",
      revise: "revise",
      escalate: "escalate",
      respond: "orchestrate"
    }
    return map[action] || "review"
  }

  private getBrainLogPath(projectId: string): string {
    const projectDir = path.join(process.cwd(), "data", "projects", projectId)
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true })
    }
    return path.join(projectDir, "brain-log.jsonl")
  }

  // ==================== PUBLIC UTILITIES ====================

  public async readBrainLog(projectId: string, limit?: number): Promise<BrainLogEntry[]> {
    const logPath = this.getBrainLogPath(projectId)
    
    if (!fs.existsSync(logPath)) {
      return []
    }

    const lines = fs.readFileSync(logPath, "utf-8").trim().split("\n").filter(Boolean)
    const entries = lines.map(line => JSON.parse(line) as BrainLogEntry)
    
    return limit ? entries.slice(-limit) : entries
  }

  public clearCache(): void {
    this.cachedProjectContext.clear()
  }

  /**
   * Deterministic quality gate for workflow plans.
   * Uses local scoring so autopilot remains functional even without external model calls.
   */
  public async evaluatePlanQuality(plan: {
    objectives?: string[]
    tasks?: Array<{ title?: string; acceptanceCriteria?: string[]; dependsOn?: string[] }>
    acceptanceCriteria?: string[]
  }): Promise<{ score: number; passed: boolean; reasons: string[] }> {
    const reasons: string[] = []
    let score = 100

    const objectives = Array.isArray(plan?.objectives) ? plan.objectives : []
    const tasks = Array.isArray(plan?.tasks) ? plan.tasks : []
    const acceptanceCriteria = Array.isArray(plan?.acceptanceCriteria) ? plan.acceptanceCriteria : []

    if (objectives.length < 1) {
      score -= 20
      reasons.push("Plan needs at least one objective.")
    }
    if (tasks.length < 2) {
      score -= 30
      reasons.push("Plan needs at least two executable tasks.")
    }
    if (acceptanceCriteria.length < 2) {
      score -= 20
      reasons.push("Plan needs measurable acceptance criteria.")
    }

    const taskWithoutCriteria = tasks.find((task) => !Array.isArray(task.acceptanceCriteria) || task.acceptanceCriteria.length === 0)
    if (taskWithoutCriteria) {
      score -= 20
      reasons.push("Every task should include acceptance criteria.")
    }

    const taskWithoutTitle = tasks.find((task) => !String(task.title || "").trim())
    if (taskWithoutTitle) {
      score -= 10
      reasons.push("Every task should include a title.")
    }

    score = Math.max(0, Math.min(100, score))
    return {
      score,
      passed: score >= 75,
      reasons,
    }
  }

  /**
   * Deterministic quality gate for execution artifacts against acceptance criteria.
   */
  public async evaluateExecutionQuality(
    artifact: string,
    acceptanceCriteria: string[]
  ): Promise<{
    score: number
    passed: boolean
    reasons: string[]
    checklist: Array<{ criterion: string; passed: boolean; note: string }>
  }> {
    const text = String(artifact || "").toLowerCase()
    const criteria = Array.isArray(acceptanceCriteria) ? acceptanceCriteria : []
    const checklist = criteria.map((criterion) => {
      const key = criterion.toLowerCase().slice(0, 18)
      const passed = key.length > 3 ? text.includes(key) : text.length > 300
      return {
        criterion,
        passed,
        note: passed ? "Criterion appears covered in artifact." : "Criterion not clearly represented in artifact.",
      }
    })

    let score = 70
    if (text.length > 1200) score += 10
    if (text.length > 2000) score += 5
    const passedCount = checklist.filter((item) => item.passed).length
    if (criteria.length > 0) {
      score += Math.round((passedCount / criteria.length) * 20)
    }

    const reasons: string[] = []
    if (text.length < 350) reasons.push("Artifact is too short for a complete workflow handoff.")
    checklist
      .filter((item) => !item.passed)
      .slice(0, 4)
      .forEach((item) => reasons.push(`Missing criterion: ${item.criterion}`))

    score = Math.max(0, Math.min(100, score))
    return {
      score,
      passed: score >= 80 && reasons.length === 0,
      reasons,
      checklist,
    }
  }
}

// ==================== DEFAULT CONFIG ====================

export function getDefaultBrainConfig(): BrainConfig {
  return {
    enabled: false,
    model: "claude-opus-4-6",
    qualityThreshold: 80,
    maxAutoRevisions: 3,
    autoApproveAboveScore: 90,
    tokenBudgetPerReview: 4096,
    enablePromptCaching: true,
    enableTokenEfficientTools: true
  }
}
