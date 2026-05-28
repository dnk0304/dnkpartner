import { useMemo, useState } from "react"
import { Button } from "./Button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./Card"
import { Film, Image as ImageIcon, MessageSquareText, Wand2 } from "lucide-react"

type SuggestedAction = {
  id: string
  label: string
  actionType: string
  params?: Record<string, any>
}

interface AutopilotChatDockProps {
  packageId?: string
  runId?: string
  prompts?: string[]
  durations?: number[]
  disabled?: boolean
  onActionComplete?: () => void
  onSendToImageQueue?: (prompts: string[]) => void
  onSendToVideoQueue?: (prompts: string[], durations?: number[]) => void
}

export function AutopilotChatDock({
  packageId,
  runId,
  prompts,
  durations,
  disabled,
  onActionComplete,
  onSendToImageQueue,
  onSendToVideoQueue,
}: AutopilotChatDockProps) {
  const [request, setRequest] = useState("")
  const [isRunning, setIsRunning] = useState(false)
  const [transferNotice, setTransferNotice] = useState("")
  const availablePrompts = useMemo(
    () => (prompts || []).map((prompt) => String(prompt || "").trim()).filter(Boolean),
    [prompts]
  )

  const suggestions = useMemo<SuggestedAction[]>(
    () => [
      { id: "tighten", label: "Tighten pacing", actionType: "tighten_pacing" },
      { id: "fix-all", label: "Fix all issues", actionType: "fix_all_issues" },
      { id: "scene-4", label: "Regenerate scene 4", actionType: "regenerate_scene", params: { sceneIndex: 4 } },
    ],
    []
  )

  const dispatchAction = async (actionType: string, params?: Record<string, any>) => {
    if (!packageId && !runId) return
    setIsRunning(true)
    try {
      const response = await fetch("/api/autopilot/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageId,
          runId,
          actionType,
          params,
        }),
      })
      if (!response.ok) throw new Error("Action failed")
      onActionComplete?.()
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquareText className="w-4 h-4" />
          Master Command
        </CardTitle>
        <CardDescription>Always-on chat dock with one-click actions.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <textarea
          value={request}
          onChange={(event) => setRequest(event.target.value)}
          placeholder="Ask for a change, then use one-click actions."
          className="w-full min-h-24 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] p-3 text-sm"
          disabled={disabled || isRunning}
        />
        <Button
          variant="outline"
          className="w-full"
          disabled={disabled || isRunning || !request.trim()}
          onClick={() => {
            dispatchAction("fix_all_issues", { instruction: request.trim() }).catch(console.error)
            setRequest("")
          }}
        >
          <Wand2 className="w-4 h-4 mr-2" />
          Apply Request
        </Button>
        <div className="grid grid-cols-1 gap-2">
          {suggestions.map((action) => (
            <Button
              key={action.id}
              variant="secondary"
              disabled={disabled || isRunning}
              onClick={() => dispatchAction(action.actionType, action.params).catch(console.error)}
            >
              {action.label}
            </Button>
          ))}
        </div>
        <div className="pt-2 border-t border-[var(--color-border)] space-y-2">
          <Button
            variant="outline"
            disabled={disabled || isRunning || availablePrompts.length === 0}
            onClick={() => {
              if (!onSendToImageQueue || availablePrompts.length === 0) return
              onSendToImageQueue(availablePrompts)
              setTransferNotice(`Sent ${availablePrompts.length} prompt(s) to image queue.`)
            }}
          >
            <ImageIcon className="w-4 h-4 mr-2" />
            Send to Image
          </Button>
          <Button
            variant="outline"
            disabled={disabled || isRunning || availablePrompts.length === 0}
            onClick={() => {
              if (!onSendToVideoQueue || availablePrompts.length === 0) return
              onSendToVideoQueue(availablePrompts, durations)
              setTransferNotice(`Sent ${availablePrompts.length} scene(s) to video queue.`)
            }}
          >
            <Film className="w-4 h-4 mr-2" />
            Send to Video
          </Button>
          {transferNotice ? (
            <p className="text-xs text-emerald-400">{transferNotice}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
