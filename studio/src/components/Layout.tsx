import { ReactNode } from "react"
import { Sidebar } from "./Sidebar"
import { cn } from "@/lib/utils"

type GenerationMode = "image" | "video" | "rescaler" | "kdp" | "autopilot"
type ViewMode = "simple" | "advanced"

interface LayoutProps {
  children: ReactNode
  mode: GenerationMode
  onModeChange: (mode: GenerationMode) => void
  isSidebarCollapsed: boolean
  onToggleSidebar: () => void
  onOpenCostSummary?: () => void
  onOpenAIAssistant?: () => void
  viewMode?: ViewMode
  onViewModeChange?: (mode: ViewMode) => void
  usageSummary?: { today: string; total: string }
  onNavigate?: (path: string) => void
}

export function Layout({
  children,
  mode,
  onModeChange,
  isSidebarCollapsed,
  onToggleSidebar,
  onOpenCostSummary,
  onOpenAIAssistant,
  viewMode,
  onViewModeChange,
  usageSummary,
  onNavigate,
}: LayoutProps) {
  return (
    <div className="min-h-screen bg-transparent relative">
      {/* Sidebar */}
      <Sidebar
        mode={mode}
        onModeChange={onModeChange}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={onToggleSidebar}
        onOpenCostSummary={onOpenCostSummary}
        onOpenAIAssistant={onOpenAIAssistant}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
        usageSummary={usageSummary}
        onNavigate={onNavigate}
      />

      {/* Main Content Area - NO RIGHT PANEL MARGIN */}
      <main
        className={cn(
          "relative z-10 transition-all duration-300 min-h-screen",
          isSidebarCollapsed ? "ml-20" : "ml-60"
        )}
      >
        {children}
      </main>
    </div>
  )
}
