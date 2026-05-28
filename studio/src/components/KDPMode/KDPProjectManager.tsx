import { useState } from "react"
import { Button } from "../Button"
import { cn } from "@/lib/utils"
import {
  KDPProject,
  BOOK_TYPES,
  KDP_TRIM_SIZES,
  KDPTrimSizeKey,
} from "@/types/KDPMode"
import { 
  X, 
  Plus, 
  Trash2, 
  FolderOpen,
  Clock,
  BookOpen,
  Search,
  Grid,
  List,
} from "lucide-react"

interface KDPProjectManagerProps {
  projects: KDPProject[]
  currentProjectId: string
  onClose: () => void
  onLoad: (projectId: string) => void
  onDelete: (projectId: string) => void
  onNew: () => void
}

export function KDPProjectManager({
  projects,
  currentProjectId,
  onClose,
  onLoad,
  onDelete,
  onNew,
}: KDPProjectManagerProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [sortBy, setSortBy] = useState<"updated" | "name" | "created">("updated")

  // Filter and sort projects
  const filteredProjects = projects
    .filter(p => 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description?.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name)
      if (sortBy === "created") return b.createdAt - a.createdAt
      return b.updatedAt - a.updatedAt
    })

  // Format date
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) {
      return "Today"
    } else if (diffDays === 1) {
      return "Yesterday"
    } else if (diffDays < 7) {
      return `${diffDays} days ago`
    } else {
      return date.toLocaleDateString()
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative z-10 w-full max-w-4xl max-h-[85vh] bg-[var(--color-background)] rounded-2xl shadow-2xl border border-[var(--color-border)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[var(--color-primary)]/20 flex items-center justify-center">
              <FolderOpen className="w-5 h-5 text-[var(--color-primary)]" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[var(--color-text)]">Projects</h2>
              <p className="text-sm text-[var(--color-text-muted)]">
                {projects.length} project{projects.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Button onClick={onNew} className="gap-2">
              <Plus className="w-4 h-4" />
              New Project
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-4 p-4 border-b border-[var(--color-border)]">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-dim)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects..."
              className="w-full pl-10 pr-4 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>
          
          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          >
            <option value="updated">Last Modified</option>
            <option value="created">Date Created</option>
            <option value="name">Name</option>
          </select>
          
          {/* View Mode */}
          <div className="flex gap-1 p-1 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)]">
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "p-2 rounded-md transition-colors",
                viewMode === "grid" 
                  ? "bg-[var(--color-primary)] text-white" 
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              )}
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "p-2 rounded-md transition-colors",
                viewMode === "list" 
                  ? "bg-[var(--color-primary)] text-white" 
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              )}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Projects List */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredProjects.length === 0 ? (
            <div className="text-center py-12">
              <BookOpen className="w-16 h-16 mx-auto mb-4 text-[var(--color-text-dim)]" />
              <h3 className="text-lg font-semibold text-[var(--color-text)] mb-2">
                {searchQuery ? "No matching projects" : "No projects yet"}
              </h3>
              <p className="text-sm text-[var(--color-text-muted)] mb-4">
                {searchQuery 
                  ? "Try a different search term"
                  : "Create your first KDP book project to get started"
                }
              </p>
              {!searchQuery && (
                <Button onClick={onNew} className="gap-2">
                  <Plus className="w-4 h-4" />
                  Create Project
                </Button>
              )}
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {filteredProjects.map((project) => {
                const trim = project.trimSize ? KDP_TRIM_SIZES[project.trimSize as KDPTrimSizeKey] : null
                const isCurrent = project.id === currentProjectId
                
                return (
                  <div
                    key={project.id}
                    className={cn(
                      "group relative rounded-xl border-2 overflow-hidden cursor-pointer transition-all hover:shadow-lg",
                      isCurrent
                        ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/20"
                        : "border-[var(--color-border)] hover:border-[var(--color-border-bright)]"
                    )}
                    onClick={() => onLoad(project.id)}
                  >
                    {/* Thumbnail */}
                    <div className="aspect-[3/4] bg-[var(--color-surface)] flex items-center justify-center">
                      {project.thumbnail ? (
                        <img
                          src={project.thumbnail}
                          alt={project.name}
                          className="w-full h-full object-cover"
                        />
                      ) : project.cover && project.cover.frontImage?.src ? (
                        <img
                          src={project.cover.frontImage.src}
                          alt={project.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="text-center p-4">
                          <BookOpen className="w-12 h-12 mx-auto mb-2 text-[var(--color-text-dim)]" />
                          <span className="text-sm text-[var(--color-text-dim)]">No Cover</span>
                        </div>
                      )}
                    </div>
                    
                    {/* Info */}
                    <div className="p-3 bg-[var(--color-background)]">
                      <h4 className="font-semibold text-[var(--color-text)] truncate">
                        {project.name}
                      </h4>
                      <div className="flex items-center gap-2 mt-1 text-xs text-[var(--color-text-dim)]">
                        {project.bookType && <span>{BOOK_TYPES[project.bookType].icon}</span>}
                        <span>{trim?.label || project.trimSize}</span>
                        <span>•</span>
                        <span>{project.pageCount || 0} pages</span>
                      </div>
                      <div className="flex items-center gap-1 mt-2 text-xs text-[var(--color-text-dim)]">
                        <Clock className="w-3 h-3" />
                        {formatDate(project.updatedAt)}
                      </div>
                    </div>
                    
                    {/* Current Badge */}
                    {isCurrent && (
                      <div className="absolute top-2 right-2 px-2 py-1 bg-[var(--color-primary)] text-white text-xs rounded-full">
                        Current
                      </div>
                    )}
                    
                    {/* Delete Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm(`Delete "${project.name}"? This cannot be undone.`)) {
                          onDelete(project.id)
                        }
                      }}
                      className="absolute top-2 left-2 p-1.5 bg-red-500/80 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredProjects.map((project) => {
                const trim = project.trimSize ? KDP_TRIM_SIZES[project.trimSize as KDPTrimSizeKey] : null
                const isCurrent = project.id === currentProjectId
                
                return (
                  <div
                    key={project.id}
                    className={cn(
                      "flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all hover:shadow-md",
                      isCurrent
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5"
                        : "border-[var(--color-border)] hover:border-[var(--color-border-bright)]"
                    )}
                    onClick={() => onLoad(project.id)}
                  >
                    {/* Thumbnail */}
                    <div className="w-16 h-20 rounded-lg bg-[var(--color-surface)] overflow-hidden flex-shrink-0">
                      {project.thumbnail || (project.cover && project.cover.frontImage?.src) ? (
                        <img
                          src={project.thumbnail || (project.cover && project.cover.frontImage?.src) || ''}
                          alt={project.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <BookOpen className="w-6 h-6 text-[var(--color-text-dim)]" />
                        </div>
                      )}
                    </div>
                    
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-[var(--color-text)] truncate">
                          {project.name}
                        </h4>
                        {isCurrent && (
                          <span className="px-2 py-0.5 bg-[var(--color-primary)] text-white text-xs rounded-full">
                            Current
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-sm text-[var(--color-text-muted)]">
                        {project.bookType && (
                          <span className="flex items-center gap-1">
                            {BOOK_TYPES[project.bookType].icon} {BOOK_TYPES[project.bookType].label}
                          </span>
                        )}
                        <span>{trim?.label || project.trimSize}</span>
                        <span>{project.pageCount || 0} pages</span>
                      </div>
                      <div className="flex items-center gap-1 mt-1 text-xs text-[var(--color-text-dim)]">
                        <Clock className="w-3 h-3" />
                        Modified {formatDate(project.updatedAt)}
                      </div>
                    </div>
                    
                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (confirm(`Delete "${project.name}"? This cannot be undone.`)) {
                            onDelete(project.id)
                          }
                        }}
                        className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

