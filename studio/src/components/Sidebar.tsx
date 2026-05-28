import {
  Home,
  Library,
  Image,
  Video,
  Crop,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Sparkles,
  LayoutGrid,
  Sliders,
  Settings,
  DollarSign,
  TrendingUp,
  Rocket,
  Film,
} from "lucide-react"
import { cn } from "@/lib/utils"

type GenerationMode = "image" | "video" | "rescaler" | "kdp" | "autopilot"
type ViewMode = "simple" | "advanced"

interface SidebarProps {
  mode: GenerationMode
  onModeChange: (mode: GenerationMode) => void
  isCollapsed: boolean
  onToggleCollapse: () => void
  onOpenCostSummary?: () => void
  onOpenAIAssistant?: () => void
  viewMode?: ViewMode
  onViewModeChange?: (mode: ViewMode) => void
  usageSummary?: { today: string; total: string }
  onNavigate?: (path: string) => void
}

const aiToolsItems = [
  {
    id: "image" as GenerationMode,
    label: "Image Creation",
    icon: Image,
  },
  {
    id: "video" as GenerationMode,
    label: "Video Creation",
    icon: Video,
  },
  {
    id: "rescaler" as GenerationMode,
    label: "Rescaler",
    icon: Crop,
  },
  {
    id: "kdp" as GenerationMode,
    label: "KDP Mode",
    icon: BookOpen,
  },
  {
    id: "autopilot" as GenerationMode,
    label: "Autopilot",
    icon: Rocket,
  },
]

export function Sidebar({
  mode,
  onModeChange,
  isCollapsed,
  onToggleCollapse,
  onOpenCostSummary,
  onOpenAIAssistant,
  viewMode,
  onViewModeChange,
  usageSummary,
  onNavigate,
}: SidebarProps) {
  return (
    <aside
      className={cn(
        "fixed left-0 top-0 h-screen bg-[#0d0d14] border-r border-[var(--color-border)] transition-all duration-300 z-50 flex flex-col",
        isCollapsed ? "w-20" : "w-60"
      )}
    >
      {/* Expand button at top when collapsed */}
      {isCollapsed && (
        <div className="p-2 border-b border-[var(--color-border)]">
          <button
            onClick={onToggleCollapse}
            className="w-full p-2 flex items-center justify-center hover:bg-[var(--color-surface)] rounded-lg transition-colors"
            title="Expand sidebar"
          >
            <ChevronRight className="w-5 h-5 text-[var(--color-text-muted)]" />
          </button>
        </div>
      )}

      {/* Logo / Header */}
      <div className={cn("p-4 border-b border-[var(--color-border)]", isCollapsed && "hidden")}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-[var(--color-primary)] text-sm whitespace-nowrap">
              DNK AI Studio
            </span>
          </div>
          <button
            onClick={onToggleCollapse}
            className="p-1 hover:bg-[var(--color-surface)] rounded transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-[var(--color-text-muted)]" />
          </button>
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {/* Home & Library */}
        <div className="px-2 space-y-1 mb-4">
          <button
            className={cn(
              "w-full flex items-center rounded-lg transition-all text-left",
              isCollapsed 
                ? "flex-col gap-1 px-1 py-2 justify-center" 
                : "flex-row gap-3 px-3 py-2",
              "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)]"
            )}
          >
            <Home className="w-5 h-5 flex-shrink-0" />
            <span className={cn("text-sm", isCollapsed && "text-[9px] text-center truncate w-full")}>Home</span>
          </button>
          
          <button
            className={cn(
              "w-full flex items-center rounded-lg transition-all text-left",
              isCollapsed 
                ? "flex-col gap-1 px-1 py-2 justify-center" 
                : "flex-row gap-3 px-3 py-2",
              "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)]"
            )}
          >
            <Library className="w-5 h-5 flex-shrink-0" />
            <span className={cn("text-sm", isCollapsed && "text-[9px] text-center truncate w-full")}>Library</span>
          </button>
        </div>

        {/* AI Tools Section */}
        <div className="px-2 mb-4">
          {!isCollapsed && (
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider px-3 mb-2">
              AI Tools
            </p>
          )}
          {isCollapsed && (
            <p className="text-[8px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider text-center mb-2">
              AI Tools
            </p>
          )}
          
          <div className="space-y-1">
            {aiToolsItems.map((item) => {
              const Icon = item.icon
              const isActive = mode === item.id
              // Short labels for collapsed state
              const shortLabel = item.id === "image" ? "Image" 
                : item.id === "video" ? "Video" 
                : item.id === "rescaler" ? "Rescale" 
                : item.id === "kdp" ? "KDP" : "Auto"
              
              return (
                <button
                  key={item.id}
                  onClick={() => onModeChange(item.id)}
                  className={cn(
                    "w-full flex items-center rounded-lg transition-all",
                    isCollapsed 
                      ? "flex-col gap-1 px-1 py-2 justify-center" 
                      : "flex-row gap-3 px-3 py-2 text-left",
                    isActive
                      ? "bg-[var(--color-primary)]/10 text-[var(--color-text)] border-l-2 border-[var(--color-primary)]"
                      : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)]"
                  )}
                >
                  <Icon className={cn(
                    "w-5 h-5 flex-shrink-0",
                    isActive && "text-[var(--color-primary)]"
                  )} />
                  <span className={cn(
                    "text-sm",
                    isCollapsed && "text-[9px] text-center truncate w-full"
                  )}>
                    {isCollapsed ? shortLabel : item.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* AI Assistant */}
        <div className="px-2 mb-4">
          <button
            onClick={onOpenAIAssistant}
            className={cn(
              "w-full flex items-center rounded-lg transition-all",
              isCollapsed 
                ? "flex-col gap-1 px-1 py-2 justify-center" 
                : "flex-row gap-3 px-3 py-2 text-left",
              "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)]"
            )}
          >
            <MessageSquare className="w-5 h-5 flex-shrink-0" />
            <span className={cn("text-sm", isCollapsed && "text-[9px] text-center truncate w-full")}>
              {isCollapsed ? "Chat" : "AI Assistant"}
            </span>
          </button>
        </div>

        {/* Tools Section */}
        <div className="px-2 mb-4">
          {!isCollapsed && (
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider px-3 mb-2">
              Tools
            </p>
          )}
          {isCollapsed && (
            <p className="text-[8px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider text-center mb-2">
              Tools
            </p>
          )}
          
          <button
            onClick={() => onNavigate?.("/ai-trends")}
            className={cn(
              "w-full flex items-center rounded-lg transition-all",
              isCollapsed 
                ? "flex-col gap-1 px-1 py-2 justify-center" 
                : "flex-row gap-3 px-3 py-2 text-left",
              "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)]"
            )}
          >
            <TrendingUp className="w-5 h-5 flex-shrink-0" />
            <span className={cn("text-sm", isCollapsed && "text-[9px] text-center truncate w-full")}>
              {isCollapsed ? "Trends" : "AI Trends"}
            </span>
          </button>

          <button
            onClick={() => onNavigate?.("/video-editor")}
            className={cn(
              "w-full flex items-center rounded-lg transition-all",
              isCollapsed
                ? "flex-col gap-1 px-1 py-2 justify-center"
                : "flex-row gap-3 px-3 py-2 text-left",
              "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)]"
            )}
          >
            <Film className="w-5 h-5 flex-shrink-0" />
            <span className={cn("text-sm", isCollapsed && "text-[9px] text-center truncate w-full")}>
              {isCollapsed ? "Editor" : "Video Editor"}
            </span>
          </button>
        </div>
      </nav>

      {/* Bottom Section - Cost Summary, Settings, and View Mode */}
      <div className="border-t border-[var(--color-border)] mt-auto">
        {/* Usage & Cost Section */}
        {!isCollapsed && (
          <div className="px-3 py-3">
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider px-3 mb-2 flex items-center gap-1">
              <DollarSign className="w-3 h-3" />
              Usage & Cost
            </p>
            
            <div className="px-3 py-3 bg-[var(--color-surface)]/50 rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--color-text-muted)]">Today:</span>
                <span className="text-[var(--color-text)] font-medium">{usageSummary?.today || "$0.00"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--color-text-muted)]">Total:</span>
                <span className="text-[var(--color-success)] font-medium">{usageSummary?.total || "$0.04"}</span>
              </div>
              <button
                onClick={onOpenCostSummary}
                className="w-full py-2 text-xs text-center text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] bg-[var(--color-primary)]/10 hover:bg-[var(--color-primary)]/20 rounded-lg transition-colors"
              >
                View Full History
              </button>
            </div>
          </div>
        )}
        
        {/* Settings */}
        <div className="px-2 py-2">
          <button
            className={cn(
              "w-full flex items-center rounded-lg transition-all",
              isCollapsed 
                ? "flex-col gap-1 px-1 py-2 justify-center" 
                : "flex-row gap-3 px-3 py-2 text-left",
              "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)]"
            )}
          >
            <Settings className="w-5 h-5 flex-shrink-0" />
            <span className={cn("text-sm", isCollapsed && "text-[9px] text-center truncate w-full")}>Settings</span>
          </button>
        </div>

        {/* View Mode Toggle - Above Collapse Button */}
        {!isCollapsed && onViewModeChange && (mode === "image" || mode === "video") && (
          <div className="px-3 py-3 border-t border-[var(--color-border)]">
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider px-1 mb-2">
              View Mode
            </p>
            <div className="flex items-center gap-1 p-1 bg-[var(--color-surface)] rounded-lg">
              <button
                onClick={() => onViewModeChange("simple")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all",
                  viewMode === "simple"
                    ? "bg-[var(--color-primary)] text-white"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                )}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                Simple
              </button>
              <button
                onClick={() => onViewModeChange("advanced")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all",
                  viewMode === "advanced"
                    ? "bg-[var(--color-primary)] text-white"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                )}
              >
                <Sliders className="w-3.5 h-3.5" />
                Advanced
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
