import type express from "express"

type RegisterTelegramBotOptions = {
  app: express.Express
  port: number
}

type TelegramUpdate = {
  update_id: number
  message?: {
    message_id: number
    text?: string
    chat: { id: number; type: string }
    from?: { id: number; username?: string; first_name?: string }
  }
}

type ChatContext = {
  projectId?: string
  subprojectId?: string
}

type PendingAction = {
  chatId: number
  expiresAt: number
  kind: "manager_prompt"
  payload: { text: string }
}

const MAX_TG_MESSAGE = 3900

function parseIdSet(raw: string | undefined): Set<number> {
  return new Set(
    String(raw || "")
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value))
  )
}

function isHighImpactPrompt(text: string): boolean {
  return /\b(delete|overwrite|publish|mass|all issues|regenerate all|abort all|wipe)\b/i.test(text)
}

function formatRunStatus(run: any): string {
  const parts = [
    `Run: ${String(run?.runId || "unknown")}`,
    `Status: ${String(run?.status || "unknown")}`,
    `Step: ${String(run?.currentStep || "unknown")}`,
  ]
  if (run?.subprojectId) parts.push(`Subproject: ${String(run.subprojectId)}`)
  if (run?.topic) parts.push(`Topic: ${String(run.topic)}`)
  return parts.join("\n")
}

export function registerTelegramBot(options: RegisterTelegramBotOptions): void {
  const { app, port } = options
  const botToken = String(process.env.TELEGRAM_BOT_TOKEN || "").trim()
  const enabled = String(process.env.TELEGRAM_ENABLED || "true").toLowerCase() !== "false"
  const ownerChatIds = parseIdSet(process.env.TELEGRAM_OWNER_CHAT_IDS)
  const ownerUserIds = parseIdSet(process.env.TELEGRAM_OWNER_USER_IDS)
  const pollIntervalMs = Math.max(800, Number(process.env.TELEGRAM_POLL_INTERVAL_MS || 1500))

  const chatContext = new Map<number, ChatContext>()
  const pendingActions = new Map<string, PendingAction>()

  let started = false
  let offset = 0
  let polling = false

  async function callTelegram(method: string, payload: Record<string, any>): Promise<any> {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || !data?.ok) {
      throw new Error(data?.description || `Telegram API ${method} failed (${response.status})`)
    }
    return data.result
  }

  async function sendMessage(chatId: number, text: string): Promise<void> {
    const chunks: string[] = []
    let left = String(text || "")
    while (left.length > MAX_TG_MESSAGE) {
      chunks.push(left.slice(0, MAX_TG_MESSAGE))
      left = left.slice(MAX_TG_MESSAGE)
    }
    chunks.push(left)
    for (const chunk of chunks) {
      await callTelegram("sendMessage", { chat_id: chatId, text: chunk || " " })
    }
  }

  async function apiJson(path: string, init?: RequestInit): Promise<any> {
    const response = await fetch(`http://localhost:${port}${path}`, init)
    const bodyText = await response.text().catch(() => "")
    let body: any = null
    try {
      body = bodyText ? JSON.parse(bodyText) : null
    } catch {
      body = bodyText
    }
    if (!response.ok) {
      const details = typeof body === "string" ? body : body?.message || JSON.stringify(body)
      throw new Error(details || `${path} failed (${response.status})`)
    }
    return body
  }

  function isAllowed(chatId: number, userId?: number): boolean {
    if (ownerChatIds.size === 0 && ownerUserIds.size === 0) return false
    if (ownerChatIds.has(chatId)) return true
    if (userId !== undefined && ownerUserIds.has(userId)) return true
    return false
  }

  function ensureContext(chatId: number): ChatContext {
    const existing = chatContext.get(chatId)
    if (existing) return existing
    const next: ChatContext = {}
    chatContext.set(chatId, next)
    return next
  }

  function issueConfirmToken(action: PendingAction): string {
    const token = Math.random().toString(36).slice(2, 10)
    pendingActions.set(token, action)
    return token
  }

  async function runManagerPrompt(chatId: number, context: ChatContext, text: string): Promise<string> {
    if (!context.projectId) {
      return "Select project first with /project <projectId>."
    }
    const payload = await apiJson("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "image",
        assistantMode: "manager",
        model: "gpt-5-nano",
        projectId: context.projectId,
        messages: [{ role: "user", content: text }],
      }),
    })
    return String(payload?.response || "Manager responded with no text.")
  }

  async function sendArtifactFile(chatId: number, projectId: string, relPath: string): Promise<void> {
    const downloadUrl = `http://localhost:${port}/api/autopilot/artifacts/download?projectId=${encodeURIComponent(projectId)}&relPath=${encodeURIComponent(relPath)}`
    const response = await fetch(downloadUrl)
    if (!response.ok) {
      throw new Error(`Failed to download artifact (${response.status})`)
    }
    const contentType = response.headers.get("content-type") || "application/octet-stream"
    const bytes = new Uint8Array(await response.arrayBuffer())
    const form = new FormData()
    form.append("chat_id", String(chatId))
    form.append("document", new Blob([bytes], { type: contentType }), relPath.split("/").pop() || "artifact.bin")
    const tgResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
      method: "POST",
      body: form,
    })
    const payload = await tgResponse.json().catch(() => ({}))
    if (!tgResponse.ok || !payload?.ok) {
      throw new Error(payload?.description || "Telegram sendDocument failed")
    }
  }

  async function handleCommand(update: TelegramUpdate): Promise<void> {
    const message = update.message
    if (!message || !message.text) return
    const chatId = message.chat.id
    const userId = message.from?.id
    if (!isAllowed(chatId, userId)) {
      await sendMessage(chatId, "Unauthorized chat/user for this bot.")
      return
    }

    const text = message.text.trim()
    const context = ensureContext(chatId)
    const [commandRaw, ...rest] = text.split(" ")
    const command = commandRaw.toLowerCase()
    const args = rest.join(" ").trim()

    if (command === "/help" || command === "/start") {
      await sendMessage(
        chatId,
        [
          "OpenClaw Telegram manager commands:",
          "/projects",
          "/project <projectId>",
          "/subprojects [projectId]",
          "/subproject <subprojectId>",
          "/newproject <name>",
          "/newsubproject <name>",
          "/start_run <topic>",
          "/runs",
          "/status <runId>",
          "/approve <runId> <plan_approval|final_approval>",
          "/revise <runId> <step> <feedback>",
          "/drafts",
          "/artifacts <runId>",
          "/sendartifact <runId> <index>",
          "/manager <instruction>",
          "/confirm <token>",
        ].join("\n")
      )
      return
    }

    if (command === "/projects") {
      const projects = await apiJson("/api/projects")
      const lines = Array.isArray(projects)
        ? projects.map((project: any) => `${project.id} - ${project.name}`)
        : []
      await sendMessage(chatId, lines.length > 0 ? lines.join("\n") : "No projects found.")
      return
    }

    if (command === "/project") {
      if (!args) {
        await sendMessage(chatId, "Usage: /project <projectId>")
        return
      }
      const project = await apiJson(`/api/projects/${encodeURIComponent(args)}`)
      context.projectId = String(project?.id || args)
      context.subprojectId = undefined
      await sendMessage(chatId, `Selected project: ${context.projectId}`)
      return
    }

    if (command === "/newproject") {
      if (!args) {
        await sendMessage(chatId, "Usage: /newproject <name>")
        return
      }
      const project = await apiJson("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: args }),
      })
      context.projectId = String(project?.id || "")
      context.subprojectId = undefined
      await sendMessage(chatId, `Created project ${project?.name || args} (${context.projectId}).`)
      return
    }

    if (command === "/subprojects") {
      const projectId = args || context.projectId
      if (!projectId) {
        await sendMessage(chatId, "Select a project first with /project <projectId>.")
        return
      }
      const items = await apiJson(`/api/projects/${encodeURIComponent(projectId)}/subprojects`)
      const lines = Array.isArray(items)
        ? items.map((item: any) => `${item.id} - ${item.name}`)
        : []
      await sendMessage(chatId, lines.length > 0 ? lines.join("\n") : "No subprojects found yet.")
      return
    }

    if (command === "/subproject") {
      if (!context.projectId) {
        await sendMessage(chatId, "Select a project first with /project <projectId>.")
        return
      }
      if (!args) {
        context.subprojectId = undefined
        await sendMessage(chatId, "Cleared subproject selection (auto mode).")
        return
      }
      const subproject = await apiJson(`/api/projects/${encodeURIComponent(context.projectId)}/subprojects/${encodeURIComponent(args)}`)
      context.subprojectId = String(subproject?.id || args)
      await sendMessage(chatId, `Selected subproject: ${context.subprojectId}`)
      return
    }

    if (command === "/newsubproject") {
      if (!context.projectId) {
        await sendMessage(chatId, "Select a project first with /project <projectId>.")
        return
      }
      if (!args) {
        await sendMessage(chatId, "Usage: /newsubproject <name>")
        return
      }
      const created = await apiJson(`/api/projects/${encodeURIComponent(context.projectId)}/subprojects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: args, storyTitle: args }),
      })
      context.subprojectId = String(created?.id || "")
      await sendMessage(chatId, `Created subproject ${created?.name || args} (${context.subprojectId}).`)
      return
    }

    if (command === "/start_run") {
      if (!context.projectId) {
        await sendMessage(chatId, "Select a project first with /project <projectId>.")
        return
      }
      if (!args) {
        await sendMessage(chatId, "Usage: /start_run <topic>")
        return
      }
      const payload = await apiJson("/api/autopilot/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: context.projectId,
          subprojectId: context.subprojectId,
          topic: args,
          autoApprovePlan: true,
        }),
      })
      const runId = String(payload?.run?.runId || "")
      if (payload?.run?.subprojectId) {
        context.subprojectId = String(payload.run.subprojectId)
      }
      await sendMessage(chatId, `Started run ${runId || "(unknown)"} for "${args}".`)
      return
    }

    if (command === "/runs") {
      if (!context.projectId) {
        await sendMessage(chatId, "Select a project first with /project <projectId>.")
        return
      }
      const query = new URLSearchParams({ projectId: context.projectId, limit: "15" })
      if (context.subprojectId) query.set("subprojectId", context.subprojectId)
      const runs = await apiJson(`/api/autopilot/runs?${query.toString()}`)
      const lines = Array.isArray(runs)
        ? runs.map((run: any) => `${run.runId} - ${run.status} - ${run.currentStep} - ${run.topic}`)
        : []
      await sendMessage(chatId, lines.length > 0 ? lines.join("\n") : "No runs found.")
      return
    }

    if (command === "/status") {
      if (!args) {
        await sendMessage(chatId, "Usage: /status <runId>")
        return
      }
      const run = await apiJson(`/api/autopilot/status/${encodeURIComponent(args)}`)
      await sendMessage(chatId, formatRunStatus(run))
      return
    }

    if (command === "/approve") {
      const [runId, step] = args.split(/\s+/)
      if (!runId || !step) {
        await sendMessage(chatId, "Usage: /approve <runId> <plan_approval|final_approval>")
        return
      }
      const run = await apiJson(`/api/autopilot/approve/${encodeURIComponent(runId)}/${encodeURIComponent(step)}`, { method: "POST" })
      await sendMessage(chatId, `Approved ${step}.\n${formatRunStatus(run)}`)
      return
    }

    if (command === "/revise") {
      const [runId, step, ...feedbackParts] = args.split(" ")
      const feedback = feedbackParts.join(" ").trim()
      if (!runId || !step || !feedback) {
        await sendMessage(chatId, "Usage: /revise <runId> <step> <feedback>")
        return
      }
      const run = await apiJson(`/api/autopilot/revise/${encodeURIComponent(runId)}/${encodeURIComponent(step)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback }),
      })
      await sendMessage(chatId, `Revision sent for ${step}.\n${formatRunStatus(run)}`)
      return
    }

    if (command === "/drafts") {
      if (!context.projectId) {
        await sendMessage(chatId, "Select a project first with /project <projectId>.")
        return
      }
      const query = new URLSearchParams({ projectId: context.projectId, status: "ready_for_review" })
      const items = await apiJson(`/api/autopilot/inbox?${query.toString()}`)
      const lines = Array.isArray(items)
        ? items.slice(0, 10).map((item: any) => `${item.packageId} - ${item.topic} - ${item.status}`)
        : []
      await sendMessage(chatId, lines.length > 0 ? lines.join("\n") : "No ready drafts.")
      return
    }

    if (command === "/artifacts") {
      if (!args) {
        await sendMessage(chatId, "Usage: /artifacts <runId>")
        return
      }
      const payload = await apiJson(`/api/autopilot/graphs/runs/${encodeURIComponent(args)}/artifacts`)
      const artifacts = Array.isArray(payload?.artifacts) ? payload.artifacts : []
      if (artifacts.length === 0) {
        await sendMessage(chatId, "No artifacts found for that run.")
        return
      }
      const lines = artifacts.slice(0, 25).map((artifact: any, idx: number) => (
        `${idx + 1}. ${artifact.title || artifact.relPath} (${artifact.relPath})`
      ))
      await sendMessage(chatId, `Artifacts for ${args}:\n${lines.join("\n")}\nUse /sendartifact ${args} <index>`)
      return
    }

    if (command === "/sendartifact") {
      const [runId, indexRaw] = args.split(/\s+/)
      const index = Number(indexRaw)
      if (!runId || !Number.isFinite(index) || index <= 0) {
        await sendMessage(chatId, "Usage: /sendartifact <runId> <index>")
        return
      }
      const payload = await apiJson(`/api/autopilot/graphs/runs/${encodeURIComponent(runId)}/artifacts`)
      const artifacts = Array.isArray(payload?.artifacts) ? payload.artifacts : []
      const artifact = artifacts[index - 1]
      if (!artifact?.relPath) {
        await sendMessage(chatId, "Artifact index not found.")
        return
      }
      await sendArtifactFile(chatId, String(payload?.projectId || ""), String(artifact.relPath))
      await sendMessage(chatId, `Sent artifact #${index}: ${artifact.relPath}`)
      return
    }

    if (command === "/manager") {
      if (!args) {
        await sendMessage(chatId, "Usage: /manager <instruction>")
        return
      }
      if (isHighImpactPrompt(args)) {
        const token = issueConfirmToken({
          chatId,
          expiresAt: Date.now() + 5 * 60 * 1000,
          kind: "manager_prompt",
          payload: { text: args },
        })
        await sendMessage(chatId, `High-impact manager request requires confirmation.\nUse /confirm ${token}`)
        return
      }
      const responseText = await runManagerPrompt(chatId, context, args)
      await sendMessage(chatId, responseText)
      return
    }

    if (command === "/confirm") {
      if (!args) {
        await sendMessage(chatId, "Usage: /confirm <token>")
        return
      }
      const action = pendingActions.get(args)
      if (!action) {
        await sendMessage(chatId, "Unknown confirmation token.")
        return
      }
      if (action.chatId !== chatId) {
        await sendMessage(chatId, "Token does not belong to this chat.")
        return
      }
      if (Date.now() > action.expiresAt) {
        pendingActions.delete(args)
        await sendMessage(chatId, "Token expired.")
        return
      }
      pendingActions.delete(args)
      if (action.kind === "manager_prompt") {
        const responseText = await runManagerPrompt(chatId, context, action.payload.text)
        await sendMessage(chatId, responseText)
        return
      }
      await sendMessage(chatId, "Nothing to confirm.")
      return
    }

    if (text.startsWith("/")) {
      await sendMessage(chatId, "Unknown command. Use /help.")
      return
    }

    if (isHighImpactPrompt(text)) {
      const token = issueConfirmToken({
        chatId,
        expiresAt: Date.now() + 5 * 60 * 1000,
        kind: "manager_prompt",
        payload: { text },
      })
      await sendMessage(chatId, `High-impact manager request requires confirmation.\nUse /confirm ${token}`)
      return
    }
    const responseText = await runManagerPrompt(chatId, context, text)
    await sendMessage(chatId, responseText)
  }

  async function pollOnce(): Promise<void> {
    if (polling || !enabled || !botToken) return
    polling = true
    try {
      const params = new URLSearchParams({
        timeout: "20",
        allowed_updates: JSON.stringify(["message"]),
      })
      if (offset > 0) params.set("offset", String(offset))
      const response = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?${params.toString()}`)
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.description || "getUpdates failed")
      }
      const updates = Array.isArray(payload?.result) ? payload.result as TelegramUpdate[] : []
      for (const update of updates) {
        offset = Math.max(offset, Number(update.update_id || 0) + 1)
        await handleCommand(update)
      }
      for (const [token, action] of pendingActions.entries()) {
        if (Date.now() > action.expiresAt) pendingActions.delete(token)
      }
    } catch (error) {
      console.error("[TelegramBot] polling error:", error)
    } finally {
      polling = false
    }
  }

  app.get("/api/telegram/health", (_req, res) => {
    res.json({
      enabled,
      configured: Boolean(botToken),
      started,
      polling,
      ownerChats: ownerChatIds.size,
      ownerUsers: ownerUserIds.size,
      offset,
      pendingConfirmations: pendingActions.size,
    })
  })

  app.post("/api/telegram/poll-now", async (_req, res) => {
    await pollOnce()
    res.json({ success: true, offset })
  })

  if (!enabled) {
    console.log("[TelegramBot] disabled via TELEGRAM_ENABLED=false")
    return
  }
  if (!botToken) {
    console.log("[TelegramBot] TELEGRAM_BOT_TOKEN missing; bot not started")
    return
  }
  if (ownerChatIds.size === 0 && ownerUserIds.size === 0) {
    console.log("[TelegramBot] owner allowlist empty; set TELEGRAM_OWNER_CHAT_IDS or TELEGRAM_OWNER_USER_IDS")
    return
  }

  started = true
  setInterval(() => {
    pollOnce().catch((error) => {
      console.error("[TelegramBot] poll cycle failed:", error)
    })
  }, pollIntervalMs)
  pollOnce().catch((error) => {
    console.error("[TelegramBot] initial poll failed:", error)
  })
  console.log(`[TelegramBot] polling started (interval ${pollIntervalMs}ms)`)
}

