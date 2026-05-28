import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Plus, RefreshCw } from "lucide-react"
import { Button } from "./Button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./Card"
import { InlineChat, Message } from "./InlineChat"

interface SessionListItem {
  sessionId: string
  title: string
  createdAt: number
  updatedAt: number
  messageCount: number
}

interface SessionDetails {
  sessionId: string
  title: string
  messages: Array<{
    role: "user" | "assistant" | "system"
    content: string
  }>
}

interface AutopilotProjectChatProps {
  projectId?: string
  sessionId?: string
  onSessionIdChange?: (sessionId: string) => void
  onSendToImageQueue?: (prompts: string[]) => void
  onSendToVideoQueue?: (prompts: string[], durations?: number[]) => void
  disabled?: boolean
}

export function AutopilotProjectChat({
  projectId,
  sessionId,
  onSessionIdChange,
  onSendToImageQueue,
  onSendToVideoQueue,
  disabled,
}: AutopilotProjectChatProps) {
  const hasProject = Boolean(projectId)
  const projectRef = useRef(projectId)
  const sessionListRequestSeq = useRef(0)
  const sessionMessagesRequestSeq = useRef(0)
  const previousProjectIdRef = useRef(projectId)
  const [sessions, setSessions] = useState<SessionListItem[]>([])
  const [chatMessages, setChatMessages] = useState<Message[]>([])
  const [sessionTitleDraft, setSessionTitleDraft] = useState("")
  const [isLoadingSessions, setIsLoadingSessions] = useState(false)
  const [isLoadingSessionData, setIsLoadingSessionData] = useState(false)
  const [isCreatingSession, setIsCreatingSession] = useState(false)
  const [errorText, setErrorText] = useState("")

  const activeSessionId = sessionId || ""

  useEffect(() => {
    projectRef.current = projectId
  }, [projectId])

  useEffect(() => {
    const previousProjectId = previousProjectIdRef.current
    if (previousProjectId !== projectId) {
      // Cancel stale in-flight loads and immediately clear scoped state on project switch.
      sessionListRequestSeq.current += 1
      sessionMessagesRequestSeq.current += 1
      setSessions([])
      setChatMessages([])
      setErrorText("")
      setSessionTitleDraft("")
      onSessionIdChange?.("")
    }
    previousProjectIdRef.current = projectId
  }, [projectId, onSessionIdChange])

  const sessionSummary = useMemo(
    () => sessions.find((item) => item.sessionId === activeSessionId),
    [sessions, activeSessionId]
  )

  const loadSessions = useCallback(async (preferredSessionId?: string) => {
    const requestProjectId = projectId
    const requestId = ++sessionListRequestSeq.current
    if (!projectId) {
      setSessions([])
      setErrorText("")
      return
    }
    setIsLoadingSessions(true)
    setErrorText("")
    try {
      const response = await fetch(`/api/projects/${projectId}/conversations`)
      if (!response.ok) {
        throw new Error("Failed to load sessions")
      }
      const data = await response.json()
      if (requestId !== sessionListRequestSeq.current || requestProjectId !== projectRef.current) return
      const list = Array.isArray(data) ? data as SessionListItem[] : []
      setSessions(list)

      let nextSessionId = preferredSessionId || activeSessionId
      if (!nextSessionId || !list.some((item) => item.sessionId === nextSessionId)) {
        nextSessionId = list[0]?.sessionId || ""
      }
      if (nextSessionId && nextSessionId !== activeSessionId) {
        onSessionIdChange?.(nextSessionId)
      }
    } catch (error) {
      if (requestId !== sessionListRequestSeq.current || requestProjectId !== projectRef.current) return
      setErrorText(error instanceof Error ? error.message : "Failed to load sessions")
      setSessions([])
    } finally {
      if (requestId !== sessionListRequestSeq.current || requestProjectId !== projectRef.current) return
      setIsLoadingSessions(false)
    }
  }, [projectId, activeSessionId, onSessionIdChange])

  const loadSessionMessages = useCallback(async () => {
    const requestProjectId = projectId
    const requestId = ++sessionMessagesRequestSeq.current
    if (!projectId || !activeSessionId) {
      setChatMessages([])
      return
    }
    setIsLoadingSessionData(true)
    setErrorText("")
    try {
      const response = await fetch(`/api/projects/${projectId}/conversations/${activeSessionId}`)
      if (!response.ok) {
        throw new Error("Failed to load session messages")
      }
      const data = await response.json() as SessionDetails
      if (requestId !== sessionMessagesRequestSeq.current || requestProjectId !== projectRef.current) return
      const normalized = (Array.isArray(data.messages) ? data.messages : [])
        .filter((message) => message.role === "user" || message.role === "assistant")
        .map((message) => ({
          role: message.role as "user" | "assistant",
          content: String(message.content || ""),
        }))
      setChatMessages(normalized)
    } catch (error) {
      if (requestId !== sessionMessagesRequestSeq.current || requestProjectId !== projectRef.current) return
      setErrorText(error instanceof Error ? error.message : "Failed to load session messages")
      setChatMessages([])
    } finally {
      if (requestId !== sessionMessagesRequestSeq.current || requestProjectId !== projectRef.current) return
      setIsLoadingSessionData(false)
    }
  }, [projectId, activeSessionId])

  useEffect(() => {
    loadSessions().catch(console.error)
  }, [loadSessions])

  useEffect(() => {
    loadSessionMessages().catch(console.error)
  }, [loadSessionMessages])

  useEffect(() => {
    if (!projectId) {
      setSessions([])
      setChatMessages([])
      setErrorText("")
      setSessionTitleDraft("")
    }
  }, [projectId])

  const createSession = useCallback(async () => {
    if (!projectId || isCreatingSession) return
    setIsCreatingSession(true)
    setErrorText("")
    try {
      const response = await fetch(`/api/projects/${projectId}/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: sessionTitleDraft.trim() || undefined,
        }),
      })
      if (!response.ok) {
        throw new Error("Failed to create session")
      }
      const data = await response.json()
      const nextSessionId = typeof data?.sessionId === "string" ? data.sessionId : ""
      setSessionTitleDraft("")
      if (nextSessionId) {
        onSessionIdChange?.(nextSessionId)
        await loadSessions(nextSessionId)
      } else {
        await loadSessions()
      }
      setChatMessages([])
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Failed to create session")
    } finally {
      setIsCreatingSession(false)
    }
  }, [projectId, isCreatingSession, sessionTitleDraft, onSessionIdChange, loadSessions])

  return (
    <Card className="h-full">
      <CardHeader className="space-y-3">
        <div>
          <CardTitle className="text-base">Unified Project Chat</CardTitle>
          <CardDescription>
            One persistent manager thread that can delegate to Normal, StoryCreator, and Advanced assistants.
          </CardDescription>
        </div>
        {hasProject ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <select
                className="h-9 flex-1 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] px-2 text-sm"
                value={activeSessionId}
                onChange={(event) => onSessionIdChange?.(event.target.value)}
                disabled={disabled || isLoadingSessions}
              >
                {sessions.length === 0 ? (
                  <option value="">No sessions yet</option>
                ) : null}
                {sessions.map((item) => (
                  <option key={item.sessionId} value={item.sessionId}>
                    {item.title} ({item.messageCount})
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadSessions().catch(console.error)}
                disabled={disabled || isLoadingSessions}
                title="Refresh sessions"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <input
                className="h-9 flex-1 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] px-2 text-sm"
                placeholder="New session title (optional)"
                value={sessionTitleDraft}
                onChange={(event) => setSessionTitleDraft(event.target.value)}
                disabled={disabled || isCreatingSession}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => createSession().catch(console.error)}
                disabled={disabled || isCreatingSession || !projectId}
              >
                <Plus className="w-4 h-4 mr-1" />
                New Session
              </Button>
            </div>
            {sessionSummary ? (
              <p className="text-xs text-[var(--color-text-muted)]">
                Active: {sessionSummary.title} · {sessionSummary.messageCount} messages
              </p>
            ) : null}
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="pt-0">
        {hasProject ? (
          <div className="h-[760px]">
            <InlineChat
              presentation="embedded"
              disabled={disabled || isLoadingSessionData}
              mode="image"
              onPromptsExtracted={() => {}}
              onSendToImageQueue={onSendToImageQueue}
              onSendToVideoQueue={onSendToVideoQueue}
              projectId={projectId}
              sessionId={activeSessionId || undefined}
              onSessionIdChange={(nextSessionId) => {
                onSessionIdChange?.(nextSessionId)
                loadSessions(nextSessionId).catch(console.error)
              }}
              initialMessages={chatMessages}
              roleName="Autopilot Manager"
              initialAssistantMode="manager"
              autopilotInstructions="Respond as a practical manager: keep a natural back-and-forth conversation by default, and only delegate to specialist assistants when the task clearly requires it. Keep concise action plans and project-scoped continuity."
            />
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-[var(--color-border)] p-4 text-sm text-[var(--color-text-muted)]">
            Select a project to open the persistent unified assistant chat.
          </div>
        )}
        {errorText ? (
          <p className="mt-3 text-sm text-red-400">{errorText}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}
