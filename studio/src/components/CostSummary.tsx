import { useState, useEffect } from "react"
import { DollarSign, MessageSquare, Image, Video, Trash2, ChevronDown, ChevronUp, Calendar, Eye } from "lucide-react"
import { Button } from "./Button"
import { Select } from "./Select"
import { cn } from "@/lib/utils"

// Cost per 1M tokens (December 2024 pricing)
// Chat costs per million tokens
const CHAT_COSTS = {
  "gpt-4o": { input: 2.50, output: 10.00 }, // Updated pricing
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
  "gpt-5-nano": { input: 0.05, output: 0.40 },
  "gpt-5": { input: 1.25, output: 10.00 },
  "gpt-5.2": { input: 2.75, output: 14.00 },
}

export interface UsageEntry {
  id: string
  type: "chat" | "image" | "video"
  timestamp: number
  cost: number
  details: {
    model?: string
    actualModel?: string // The model that was actually used by backend
    inputTokens?: number
    outputTokens?: number
    imageSize?: string
    duration?: number // Video duration in seconds
    quality?: string
    fps?: number
    prompt?: string // Optional: store prompt for reference
  }
}

interface CostSummaryProps {
  entries: UsageEntry[]
  onClear: () => void
}

interface ServerUsageSummary {
  period: string
  fromTimestamp: number
  toTimestamp: number
  totalCost: number
  chatCost: number
  imageCost: number
  videoCost: number
  chatCount: number
  imageCount: number
  videoCount: number
  totalCount: number
}

export function CostSummary({ entries, onClear }: CostSummaryProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [selectedPeriod, setSelectedPeriod] = useState<"today" | "week" | "month" | "year" | "all">("today")
  const [serverSummary, setServerSummary] = useState<ServerUsageSummary | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [historyEntries, setHistoryEntries] = useState<UsageEntry[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  // Fetch server summary - always load on mount and when period changes
  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const response = await fetch(`/api/usage/summary?period=${selectedPeriod}`)
        if (response.ok) {
          const summary = await response.json()
          setServerSummary(summary)
        }
      } catch (error) {
        console.error("Failed to fetch usage summary:", error)
      }
    }

    // Always fetch on mount and period change (not just when expanded)
    fetchSummary()
    
    // Auto-refresh every 30 seconds to keep costs up to date
    const interval = setInterval(fetchSummary, 30000)
    return () => clearInterval(interval)
  }, [selectedPeriod])

  // Fetch history when requested
  const loadHistory = async () => {
    setIsLoadingHistory(true)
    try {
      let from: number | undefined
      let to: number | undefined
      
      if (selectedPeriod !== "all") {
        const now = Date.now()
        switch (selectedPeriod) {
          case "today":
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            from = today.getTime()
            break
          case "week":
            from = now - 7 * 24 * 60 * 60 * 1000
            break
          case "month":
            from = now - 30 * 24 * 60 * 60 * 1000
            break
          case "year":
            from = now - 365 * 24 * 60 * 60 * 1000
            break
        }
        to = now
      }

      const params = new URLSearchParams()
      if (from) params.append("from", from.toString())
      if (to) params.append("to", to.toString())

      const response = await fetch(`/api/usage/history?${params}`)
      if (response.ok) {
        const history = await response.json()
        setHistoryEntries(history)
        setShowHistory(true)
      }
    } catch (error) {
      console.error("Failed to fetch usage history:", error)
    } finally {
      setIsLoadingHistory(false)
    }
  }

  // Handle clear - only clears frontend view, keeps server data
  const handleClear = async () => {
    if (!confirm("Clear the current session view? Note: All historical data will remain stored on the server and can be viewed in the History section.")) {
      return
    }

    // Only clear the frontend, do NOT clear server data
    onClear()
    // Optionally refresh the server summary to show that data is still there
    try {
      const response = await fetch(`/api/usage/summary?period=${selectedPeriod}`)
      if (response.ok) {
        const summary = await response.json()
        setServerSummary(summary)
      }
    } catch (error) {
      console.error("Failed to refresh summary:", error)
    }
  }

  // Add a separate function for truly deleting all server data (if needed)
  const handlePermanentClear = async () => {
    if (!confirm("⚠️ PERMANENT DELETE: This will delete ALL historical usage data from the server. This cannot be undone. Are you sure?")) {
      return
    }

    try {
      const response = await fetch("/api/usage/clear?confirm=true", {
        method: "DELETE",
      })

      if (response.ok) {
        onClear() // Clear local state
        setServerSummary(null)
        setHistoryEntries([])
        setShowHistory(false)
      } else {
        alert("Failed to clear usage history on server")
      }
    } catch (error) {
      console.error("Failed to clear usage history:", error)
      alert("Failed to clear usage history")
    }
  }

  // Calculate display values from server summary or fallback to local
  const summary = serverSummary || {
    totalCost: 0,
    chatCost: 0,
    imageCost: 0,
    videoCost: 0,
    chatCount: 0,
    imageCount: 0,
    videoCount: 0,
  }

  return (
    <div className="fixed top-4 right-4 z-50">
      <div 
        className={cn(
          "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xl transition-all duration-300",
          isExpanded ? "w-80" : "w-auto"
        )}
      >
        {/* Header - Always visible */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between p-3 hover:bg-[var(--color-background)] rounded-xl transition-colors"
        >
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg">
              <DollarSign className="w-4 h-4 text-white" />
            </div>
            <div className="text-left">
              <p className="text-xs text-[var(--color-text-dim)] capitalize">{selectedPeriod}</p>
              <p className="text-sm font-bold text-[var(--color-text)]">
                ${summary.totalCost.toFixed(4)}
              </p>
            </div>
          </div>
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-[var(--color-text-dim)]" />
          ) : (
            <ChevronUp className="w-4 h-4 text-[var(--color-text-dim)]" />
          )}
        </button>

        {/* Expanded content */}
        {isExpanded && (
          <div className="border-t border-[var(--color-border)] p-3 space-y-3">
            {/* Time period selector */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
                <Calendar className="w-3 h-3" />
                Time Period
              </label>
              <Select
                value={selectedPeriod}
                onChange={(e) => {
                  setSelectedPeriod(e.target.value as any)
                  setShowHistory(false)
                }}
                className="w-full text-xs"
              >
                <option value="today">Today</option>
                <option value="week">Last 7 Days</option>
                <option value="month">Last 30 Days</option>
                <option value="year">Last Year</option>
                <option value="all">All Time</option>
              </Select>
            </div>

            {/* Usage breakdown */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
                Usage Breakdown
              </p>
              
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-3.5 h-3.5 text-[var(--color-accent)]" />
                  <span className="text-white">Chat ({summary.chatCount})</span>
                </div>
                <span className="font-mono text-[var(--color-text)]">${summary.chatCost.toFixed(4)}</span>
              </div>
              
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Image className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                  <span className="text-white">Images ({summary.imageCount})</span>
                </div>
                <span className="font-mono text-[var(--color-text)]">${summary.imageCost.toFixed(4)}</span>
              </div>
              
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Video className="w-3.5 h-3.5 text-[var(--color-secondary)]" />
                  <span className="text-white">Videos ({summary.videoCount})</span>
                </div>
                <span className="font-mono text-[var(--color-text)]">${summary.videoCost.toFixed(4)}</span>
              </div>
              
              <div className="pt-2 border-t border-[var(--color-border)] flex items-center justify-between">
                <span className="text-sm font-medium text-[var(--color-text)]">Total</span>
                <span className="font-mono font-bold text-[var(--color-success)]">${summary.totalCost.toFixed(4)}</span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 pt-2 border-t border-[var(--color-border)]">
              <Button
                variant="outline"
                size="sm"
                onClick={loadHistory}
                disabled={isLoadingHistory}
                className="flex-1 text-xs"
              >
                <Eye className="w-3 h-3 mr-1" />
                {isLoadingHistory ? "Loading..." : "View History"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
                className="text-xs text-[var(--color-text-dim)] hover:text-[var(--color-error)]"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>

            {/* History list */}
            {showHistory && historyEntries.length > 0 && (
              <div className="pt-2 border-t border-[var(--color-border)] space-y-2 max-h-60 overflow-y-auto">
                <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
                  Recent Entries ({historyEntries.length})
                </p>
                {historyEntries.slice(0, 20).map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-[var(--color-background)] border border-[var(--color-border)]"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {entry.type === "chat" && <MessageSquare className="w-3 h-3 text-[var(--color-accent)] flex-shrink-0" />}
                      {entry.type === "image" && <Image className="w-3 h-3 text-[var(--color-primary)] flex-shrink-0" />}
                      {entry.type === "video" && <Video className="w-3 h-3 text-[var(--color-secondary)] flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-[var(--color-text)] truncate">
                          {entry.details.actualModel || entry.details.model || "Unknown"}
                        </p>
                        <p className="text-xs text-[var(--color-text-dim)]">
                          {new Date(entry.timestamp).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                    <span className="font-mono text-xs text-[var(--color-text)] ml-2">${entry.cost.toFixed(4)}</span>
                  </div>
                ))}
                {historyEntries.length > 20 && (
                  <p className="text-xs text-center text-[var(--color-text-dim)]">
                    +{historyEntries.length - 20} more entries
                  </p>
                )}
              </div>
            )}

            {showHistory && historyEntries.length === 0 && (
              <p className="text-xs text-center text-[var(--color-text-dim)] py-4">
                No usage history for this period
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Helper function to calculate chat cost
export function calculateChatCost(model: string, inputTokens: number, outputTokens: number): number {
  const costs = CHAT_COSTS[model as keyof typeof CHAT_COSTS] || CHAT_COSTS["gpt-5-nano"]
  const inputCost = (inputTokens / 1_000_000) * costs.input
  const outputCost = (outputTokens / 1_000_000) * costs.output
  return inputCost + outputCost
}
