import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Brain, CalendarClock, CheckCircle2, ChevronsDown, ChevronsUp, MessageCircle, Play, RefreshCw, Workflow, X } from "lucide-react"
import { Button } from "./Button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./Card"
import { AutopilotReviewStepper } from "./AutopilotReviewStepper"
import { AutopilotProjectChat } from "./AutopilotProjectChat"
import { AutopilotRunMapView } from "./autopilotGraph/AutopilotRunMapView"
import { AutopilotTemplateMapEditor } from "./autopilotGraph/AutopilotTemplateMapEditor"

type InboxStatus = "ready_for_review" | "in_progress" | "scheduled" | "archived"

type ProjectConfig = {
  id: string
  name: string
  schedule?: {
    enabled: boolean
    cron: string
    timezone: string
    maxConcurrentRuns: number
  }
}

type SubprojectConfig = {
  id: string
  projectId: string
  name: string
  storyTitle?: string
}

type DraftPackage = {
  packageId: string
  projectId: string
  topic: string
  format: "long" | "short"
  status: InboxStatus
  latestRunId: string | null
  runtimeEstimateSeconds: number
  manager: { score: number; status: "ready" | "needs_attention"; topIssues: string[] }
  assets: { script: boolean; scenes: boolean; prompts: boolean; storyboard: boolean; clips: boolean }
  updatedAt: number
}

type AutopilotRun = {
  runId: string
  source?: "manual" | "scheduled"
  status?: string
  createdAt?: number
  currentStep: string
  finalDeliverable?: {
    scriptDraft?: string
    durations?: number[]
    prompts?: string[]
    imageryPlan?: Array<{ scene: number; prompt: string; style: string }>
    videoPlan?: Array<{ scene: number; prompt: string; duration: number }>
    qaSummary?: string
  }
}

type RunHistoryItem = {
  runId: string
  topic: string
  status: string
  source: "manual" | "scheduled"
  currentStep: string
  createdAt: number
  updatedAt: number
  artifactCount: number
}

type RunArtifact = {
  id: string
  kind: string
  title: string
  mime: string
  summary?: string
  preview?: string
}

type PackageDetailView = "review" | "map"

interface AutopilotInboxProps {
  onSendToImageQueue?: (prompts: string[], runId?: string) => void
  onSendToVideoQueue?: (prompts: string[], durations?: number[], runId?: string) => void
}

const TABS: Array<{ id: InboxStatus; label: string }> = [
  { id: "ready_for_review", label: "ReadyForReview" },
  { id: "in_progress", label: "InProgress" },
  { id: "scheduled", label: "Scheduled" },
  { id: "archived", label: "Archived" },
]

const AUTOPILOT_SELECTED_PROJECT_STORAGE_KEY = "autopilot_selected_project_id"

export function AutopilotInbox({ onSendToImageQueue, onSendToVideoQueue }: AutopilotInboxProps) {
  const [workspaceView, setWorkspaceView] = useState<"review" | "map">("review")
  const [mapChatOpen, setMapChatOpen] = useState(false)
  const [mapChatMinimized, setMapChatMinimized] = useState(false)
  const [projects, setProjects] = useState<ProjectConfig[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState(() => {
    if (typeof window === "undefined") return ""
    return window.localStorage.getItem(AUTOPILOT_SELECTED_PROJECT_STORAGE_KEY) || ""
  })
  const [selectedSessionId, setSelectedSessionId] = useState("")
  const [subprojects, setSubprojects] = useState<SubprojectConfig[]>([])
  const [isLoadingSubprojects, setIsLoadingSubprojects] = useState(false)
  const [subprojectLoadError, setSubprojectLoadError] = useState("")
  const [subprojectEndpointsUnavailable, setSubprojectEndpointsUnavailable] = useState(false)
  const [selectedSubprojectId, setSelectedSubprojectId] = useState("")
  const [topic, setTopic] = useState("")
  const [targetTranscriptSeconds, setTargetTranscriptSeconds] = useState<number | "">("")
  const [format, setFormat] = useState<"long" | "short">("long")
  const [activeTab, setActiveTab] = useState<InboxStatus>("ready_for_review")
  const [items, setItems] = useState<DraftPackage[]>([])
  const [selectedPackage, setSelectedPackage] = useState<DraftPackage | null>(null)
  const [selectedRun, setSelectedRun] = useState<AutopilotRun | null>(null)
  const [packageDetailView, setPackageDetailView] = useState<PackageDetailView>("review")
  const [runHistory, setRunHistory] = useState<RunHistoryItem[]>([])
  const [selectedMapRunId, setSelectedMapRunId] = useState("")
  const [mapArtifacts, setMapArtifacts] = useState<RunArtifact[]>([])
  const [isLoadingMapArtifacts, setIsLoadingMapArtifacts] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [isCreatingProject, setIsCreatingProject] = useState(false)
  const [projectDraftName, setProjectDraftName] = useState("")
  const [projectDraftDescription, setProjectDraftDescription] = useState("")
  const [banner, setBanner] = useState<string>("")
  const [errorBanner, setErrorBanner] = useState<string>("")
  const [scheduleDraft, setScheduleDraft] = useState({
    enabled: false,
    cron: "0 9 * * 1",
    timezone: "Europe/Oslo",
    maxConcurrentRuns: 1,
  })
  const inboxRequestSeq = useRef(0)

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  )
  const targetWordEstimate = useMemo(() => {
    if (targetTranscriptSeconds === "" || targetTranscriptSeconds <= 0) return null
    const wordsPerMinute = format === "short" ? 175 : 145
    const targetWordCount = Math.max(1, Math.round((targetTranscriptSeconds / 60) * wordsPerMinute))
    const tolerance = Math.max(25, Math.round(targetWordCount * 0.12))
    return {
      targetWordCount,
      minWords: Math.max(1, targetWordCount - tolerance),
      maxWords: targetWordCount + tolerance,
    }
  }, [targetTranscriptSeconds, format])

  const loadProjects = useCallback(async (preferredProjectId?: string) => {
    const response = await fetch("/api/projects")
    if (!response.ok) throw new Error("Failed to load projects")
    const data = await response.json()
    const normalized = Array.isArray(data) ? data as ProjectConfig[] : []
    setProjects(normalized)

    const storedProjectId = typeof window === "undefined"
      ? ""
      : window.localStorage.getItem(AUTOPILOT_SELECTED_PROJECT_STORAGE_KEY) || ""
    const fallbackProjectId = preferredProjectId || selectedProjectId || storedProjectId
    const resolvedProjectId = normalized.some((project) => project.id === fallbackProjectId)
      ? fallbackProjectId
      : normalized[0]?.id || ""
    if (resolvedProjectId !== selectedProjectId) {
      setSelectedProjectId(resolvedProjectId)
    }
  }, [selectedProjectId])

  const loadInbox = useCallback(async (statusOverride?: InboxStatus, projectOverride?: string) => {
    const status = statusOverride || activeTab
    const projectId = projectOverride ?? selectedProjectId
    const requestId = ++inboxRequestSeq.current
    const query = new URLSearchParams()
    query.set("status", status)
    if (projectId) query.set("projectId", projectId)
    if (selectedSubprojectId) query.set("subprojectId", selectedSubprojectId)
    const response = await fetch(`/api/autopilot/inbox?${query.toString()}`)
    if (!response.ok) return
    const data = await response.json()
    if (requestId !== inboxRequestSeq.current) return
    setItems(Array.isArray(data) ? data : [])
  }, [activeTab, selectedProjectId, selectedSubprojectId])

  const loadSubprojects = useCallback(async (projectId: string) => {
    if (!projectId) {
      setSubprojects([])
      setSelectedSubprojectId("")
      setSubprojectLoadError("")
      setSubprojectEndpointsUnavailable(false)
      return
    }
    if (subprojectEndpointsUnavailable) {
      setSubprojects([])
      setSelectedSubprojectId("")
      setSubprojectLoadError("")
      return
    }
    setIsLoadingSubprojects(true)
    setSubprojectLoadError("")
    try {
      const autopilotResponse = await fetch(`/api/autopilot/subprojects?projectId=${encodeURIComponent(projectId)}`)
      let data: any = null
      if (autopilotResponse.ok) {
        data = await autopilotResponse.json()
      } else if (autopilotResponse.status === 404) {
        // Backward-compatible fallback for environments that only expose project-scoped subproject routes.
        const fallbackResponse = await fetch(`/api/projects/${encodeURIComponent(projectId)}/subprojects`)
        if (!fallbackResponse.ok) {
          setSubprojects([])
          setSelectedSubprojectId("")
          if (fallbackResponse.status !== 404) {
            setSubprojectLoadError(`Could not load story folders (${fallbackResponse.status}).`)
          } else {
            // If both route variants are unavailable, keep auto mode without blocking the workflow.
            setSubprojectEndpointsUnavailable(true)
            setSubprojectLoadError("")
          }
          return
        }
        data = await fallbackResponse.json()
      } else {
        setSubprojects([])
        setSelectedSubprojectId("")
        setSubprojectLoadError(`Could not load story folders (${autopilotResponse.status}).`)
        return
      }
      const normalized = Array.isArray(data) ? data as SubprojectConfig[] : []
      setSubprojects(normalized)
      if (!normalized.some((item) => item.id === selectedSubprojectId)) {
        setSelectedSubprojectId(normalized[0]?.id || "")
      }
    } catch {
      setSubprojects([])
      setSelectedSubprojectId("")
      setSubprojectLoadError("Could not load story folders. Check API/server.")
    } finally {
      setIsLoadingSubprojects(false)
    }
  }, [selectedSubprojectId, subprojectEndpointsUnavailable])

  const loadRun = useCallback(async (runId: string) => {
    const response = await fetch(`/api/autopilot/status/${runId}`)
    if (!response.ok) return null
    return await response.json()
  }, [])

  const loadRunHistory = useCallback(async (projectId: string) => {
    if (!projectId) {
      setRunHistory([])
      return
    }
    const query = new URLSearchParams({
      projectId,
      limit: "50",
    })
    if (selectedSubprojectId) query.set("subprojectId", selectedSubprojectId)
    const response = await fetch(`/api/autopilot/runs?${query.toString()}`)
    if (!response.ok) {
      setRunHistory([])
      return
    }
    const data = await response.json()
    setRunHistory(Array.isArray(data) ? data as RunHistoryItem[] : [])
  }, [selectedSubprojectId])

  const loadRunArtifacts = useCallback(async (runId: string) => {
    if (!runId) {
      setMapArtifacts([])
      return
    }
    setIsLoadingMapArtifacts(true)
    try {
      const response = await fetch(`/api/autopilot/runs/${encodeURIComponent(runId)}/artifacts`)
      if (!response.ok) {
        setMapArtifacts([])
        return
      }
      const data = await response.json()
      setMapArtifacts(Array.isArray(data?.artifacts) ? data.artifacts as RunArtifact[] : [])
    } finally {
      setIsLoadingMapArtifacts(false)
    }
  }, [])

  useEffect(() => {
    loadProjects().catch(console.error)
  }, [loadProjects])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (selectedProjectId) {
      window.localStorage.setItem(AUTOPILOT_SELECTED_PROJECT_STORAGE_KEY, selectedProjectId)
    } else {
      window.localStorage.removeItem(AUTOPILOT_SELECTED_PROJECT_STORAGE_KEY)
    }
  }, [selectedProjectId])

  useEffect(() => {
    setSelectedSessionId("")
  }, [selectedProjectId])

  useEffect(() => {
    loadSubprojects(selectedProjectId).catch(console.error)
  }, [selectedProjectId, loadSubprojects])

  useEffect(() => {
    if (workspaceView !== "map") {
      setMapChatOpen(false)
      setMapChatMinimized(false)
    }
  }, [workspaceView])

  useEffect(() => {
    if (!selectedProject) return
    setScheduleDraft({
      enabled: Boolean(selectedProject.schedule?.enabled),
      cron: selectedProject.schedule?.cron || "0 9 * * 1",
      timezone: selectedProject.schedule?.timezone || "Europe/Oslo",
      maxConcurrentRuns: Number(selectedProject.schedule?.maxConcurrentRuns || 1),
    })
  }, [selectedProject])

  useEffect(() => {
    loadInbox(activeTab, selectedProjectId).catch(console.error)
  }, [loadInbox, activeTab, selectedProjectId])

  useEffect(() => {
    if (!selectedProjectId) {
      setRunHistory([])
      setSelectedMapRunId("")
      setMapArtifacts([])
      return
    }
    loadRunHistory(selectedProjectId).catch(console.error)
  }, [selectedProjectId, loadRunHistory])

  useEffect(() => {
    if (!selectedMapRunId) {
      setMapArtifacts([])
      return
    }
    loadRunArtifacts(selectedMapRunId).catch(console.error)
  }, [selectedMapRunId, loadRunArtifacts])

  const refreshSelection = useCallback(async () => {
    if (!selectedPackage?.latestRunId) {
      await loadInbox()
      return
    }
    const run = await loadRun(selectedPackage.latestRunId)
    setSelectedRun(run)
    await loadInbox()
  }, [selectedPackage, loadRun, loadInbox])

  const createProject = useCallback(async () => {
    const name = projectDraftName.trim()
    if (!name || isCreatingProject) return
    setIsCreatingProject(true)
    setErrorBanner("")
    setBanner("")
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: projectDraftDescription.trim(),
        }),
      })
      if (!response.ok) {
        const details = await response.text().catch(() => "")
        throw new Error(details || "Failed to create project")
      }
      const created = await response.json()
      const createdProjectId = typeof created?.id === "string" ? created.id : ""
      setProjectDraftName("")
      setProjectDraftDescription("")
      await loadProjects(createdProjectId || undefined)
      if (createdProjectId) {
        setSelectedProjectId(createdProjectId)
        await loadInbox(activeTab, createdProjectId)
      }
      setBanner(`Project "${name}" created and selected.`)
    } catch (error) {
      setErrorBanner(error instanceof Error ? error.message : "Failed to create project")
    } finally {
      setIsCreatingProject(false)
    }
  }, [projectDraftName, projectDraftDescription, isCreatingProject, loadProjects, loadInbox, activeTab])

  const quickCreateProject = useCallback(async () => {
    const name = window.prompt("Project name")
    if (!name || !name.trim()) return
    setErrorBanner("")
    setBanner("")
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      })
      if (!response.ok) {
        const details = await response.text().catch(() => "")
        throw new Error(details || "Failed to create project")
      }
      const created = await response.json()
      const createdProjectId = typeof created?.id === "string" ? created.id : ""
      await loadProjects(createdProjectId || undefined)
      if (createdProjectId) {
        setSelectedProjectId(createdProjectId)
        await loadInbox(activeTab, createdProjectId)
      }
      setBanner(`Project "${name.trim()}" created.`)
    } catch (error) {
      setErrorBanner(error instanceof Error ? error.message : "Failed to create project")
    }
  }, [activeTab, loadInbox, loadProjects])

  const startRun = useCallback(async (mode: "draft" | "brainstorm") => {
    if (!selectedProjectId) return
    setIsStarting(true)
    setErrorBanner("")
    setBanner("")
    try {
      const resolvedTopic = topic.trim()
        || (mode === "brainstorm" ? "Brainstorm idea" : "New Draft")
      const response = await fetch("/api/autopilot/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProjectId,
          subprojectId: selectedSubprojectId || undefined,
          topic: resolvedTopic,
          format,
          targetTranscriptSeconds: targetTranscriptSeconds === "" ? undefined : Number(targetTranscriptSeconds),
        }),
      })
      if (!response.ok) {
        const details = await response.text().catch(() => "")
        throw new Error(details || "Failed to start run")
      }
      const data = await response.json()
      setTopic("")
      if (mode === "brainstorm" && data?.package) {
        setSelectedPackage(data.package as DraftPackage)
        setPackageDetailView("review")
        const nextRun = (data.run || null) as AutopilotRun | null
        setSelectedRun(nextRun)
        if (nextRun?.runId) {
          setSelectedMapRunId(nextRun.runId)
          loadRunArtifacts(nextRun.runId).catch(console.error)
        } else {
          setSelectedMapRunId("")
          setMapArtifacts([])
        }
      } else {
        setActiveTab("in_progress")
        await loadInbox("in_progress", selectedProjectId)
      }
      if (mode === "brainstorm") {
        await loadInbox("in_progress", selectedProjectId)
        await loadRunHistory(selectedProjectId)
      }
      setBanner(mode === "brainstorm"
        ? "Brainstorm started. Opening review while pipeline runs."
        : "New draft started. It now appears under InProgress.")
    } catch (error) {
      setErrorBanner(error instanceof Error ? error.message : "Failed to start run")
    } finally {
      setIsStarting(false)
    }
  }, [selectedProjectId, selectedSubprojectId, topic, format, targetTranscriptSeconds, loadInbox, loadRunArtifacts, loadRunHistory])

  const approvePackage = useCallback(async (pkg: DraftPackage) => {
    if (pkg.manager.status === "needs_attention") {
      const shouldProceed = window.confirm("Manager has warnings. Approve and archive anyway?")
      if (!shouldProceed) return
    }
    const response = await fetch(`/api/autopilot/inbox/${pkg.packageId}/approve`, { method: "POST" })
    if (!response.ok) return
    if (selectedPackage?.packageId === pkg.packageId) {
      setSelectedPackage(null)
      setSelectedRun(null)
    }
    await loadInbox()
  }, [selectedPackage?.packageId, loadInbox])

  const fixAndRecheck = useCallback(async (pkg: DraftPackage) => {
    const response = await fetch(`/api/autopilot/inbox/${pkg.packageId}/fix-and-recheck`, { method: "POST" })
    if (!response.ok) return
    const data = await response.json()
    if (selectedPackage?.packageId === pkg.packageId) {
      const nextRun = (data.run || null) as AutopilotRun | null
      setSelectedRun(nextRun)
      if (nextRun?.runId) {
        setSelectedMapRunId(nextRun.runId)
        await loadRunArtifacts(nextRun.runId)
      }
    }
    if (selectedProjectId) await loadRunHistory(selectedProjectId)
    await loadInbox()
  }, [selectedPackage?.packageId, loadInbox, loadRunArtifacts, selectedProjectId, loadRunHistory])

  const saveSchedule = useCallback(async () => {
    if (!selectedProjectId) return
    const response = await fetch(`/api/projects/${selectedProjectId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schedule: scheduleDraft }),
    })
    if (!response.ok) return
    await fetch("/api/autopilot/scheduler/refresh", { method: "POST" })
    await loadProjects()
  }, [selectedProjectId, scheduleDraft, loadProjects])

  const transferChatPromptsToImage = useCallback((prompts: string[]) => {
    if (!prompts.length) {
      setErrorBanner("No prompts available to send to image queue.")
      return
    }
    onSendToImageQueue?.(prompts)
    setBanner(`Sent ${prompts.length} prompt(s) to image queue.`)
    setErrorBanner("")
  }, [onSendToImageQueue])

  const transferChatPromptsToVideo = useCallback((prompts: string[], durations?: number[]) => {
    if (!prompts.length) {
      setErrorBanner("No prompts available to send to video queue.")
      return
    }
    onSendToVideoQueue?.(prompts, durations)
    setBanner(`Sent ${prompts.length} scene(s) to video queue.`)
    setErrorBanner("")
  }, [onSendToVideoQueue])

  if (selectedPackage) {
    return (
      <div className="max-w-[1440px] mx-auto px-4 py-6">
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-4 items-start">
          <div className="relative z-10 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={packageDetailView === "review" ? "default" : "outline"}
                onClick={() => setPackageDetailView("review")}
              >
                Review
              </Button>
              <Button
                variant={packageDetailView === "map" ? "default" : "outline"}
                onClick={() => setPackageDetailView("map")}
              >
                Map
              </Button>
            </div>
            {packageDetailView === "review" ? (
              <AutopilotReviewStepper
                pkg={selectedPackage}
                run={selectedRun}
                schedule={selectedProject?.schedule}
                runHistory={runHistory}
                selectedRunId={selectedMapRunId || selectedRun?.runId || ""}
                artifacts={mapArtifacts}
                isArtifactsLoading={isLoadingMapArtifacts}
                onSelectRun={(runId) => {
                  if (!runId) return
                  setSelectedMapRunId(runId)
                  loadRun(runId)
                    .then((nextRun) => setSelectedRun(nextRun))
                    .catch(console.error)
                }}
                onBack={() => {
                  setSelectedPackage(null)
                  setSelectedRun(null)
                  setSelectedMapRunId("")
                  setMapArtifacts([])
                  setPackageDetailView("review")
                }}
                onRefresh={() => {
                  refreshSelection().catch(console.error)
                }}
                onFixAndRecheck={() => {
                  fixAndRecheck(selectedPackage).catch(console.error)
                }}
                onApprove={() => {
                  approvePackage(selectedPackage).catch(console.error)
                }}
                onSendToImageQueue={(prompts, runId) => {
                  if (!prompts.length) {
                    setErrorBanner("No prompts available to send to image queue.")
                    return
                  }
                  onSendToImageQueue?.(prompts, runId)
                  setBanner(`Sent ${prompts.length} prompt(s) to image queue.`)
                  setErrorBanner("")
                }}
                onSendToVideoQueue={(prompts, durations, runId) => {
                  if (!prompts.length) {
                    setErrorBanner("No prompts available to send to video queue.")
                    return
                  }
                  onSendToVideoQueue?.(prompts, durations, runId)
                  setBanner(`Sent ${prompts.length} scene(s) to video queue.`)
                  setErrorBanner("")
                }}
              />
            ) : (
              <AutopilotRunMapView
                run={selectedRun}
                projectId={selectedProjectId || undefined}
                onRefresh={() => {
                  refreshSelection().catch(console.error)
                }}
              />
            )}
          </div>
          <div className="relative z-0 xl:sticky xl:top-6">
            <AutopilotProjectChat
              projectId={selectedProjectId || undefined}
              sessionId={selectedSessionId || undefined}
              onSessionIdChange={setSelectedSessionId}
              onSendToImageQueue={transferChatPromptsToImage}
              onSendToVideoQueue={transferChatPromptsToVideo}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[1440px] mx-auto px-4 py-6">
      <div className={`grid grid-cols-1 gap-4 items-start ${workspaceView === "map" ? "" : "xl:grid-cols-[minmax(0,1fr)_420px]"}`}>
        <div className="space-y-4 relative z-10">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={workspaceView === "review" ? "default" : "outline"}
          onClick={() => setWorkspaceView("review")}
        >
          Review
        </Button>
        <Button
          variant={workspaceView === "map" ? "default" : "outline"}
          onClick={() => setWorkspaceView("map")}
        >
          Map
        </Button>
        <Button variant="outline" onClick={() => quickCreateProject().catch(console.error)}>
          Create Project
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setWorkspaceView("map")
            setBanner("Create a workflow in Map view with New Template.")
            setErrorBanner("")
          }}
        >
          <Workflow className="w-4 h-4 mr-2" />
          Create Workflow
        </Button>
      </div>
      {workspaceView === "map" ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Autopilot Map Editor</CardTitle>
              <CardDescription>Select project, edit versioned templates, and run workflows from map.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <select
                  className="h-10 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] px-3 w-full"
                  value={selectedProjectId}
                  onChange={(event) => setSelectedProjectId(event.target.value)}
                >
                  <option value="">Select project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </select>
                <select
                  className="h-10 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] px-3 w-full"
                  value={selectedSubprojectId}
                  onChange={(event) => setSelectedSubprojectId(event.target.value)}
                  disabled={!selectedProjectId || subprojects.length === 0}
                >
                  <option value="">Auto story folder</option>
                  {subprojects.map((subproject) => (
                    <option key={subproject.id} value={subproject.id}>{subproject.name}</option>
                  ))}
                </select>
              </div>
              {isLoadingSubprojects ? (
                <p className="mt-2 text-xs text-[var(--color-text-muted)]">Loading story folders...</p>
              ) : null}
              {!isLoadingSubprojects && subprojectLoadError ? (
                <p className="mt-2 text-xs text-amber-300">{subprojectLoadError}</p>
              ) : null}
              {!isLoadingSubprojects && !subprojectLoadError && selectedProjectId && subprojects.length === 0 ? (
                <p className="mt-2 text-xs text-[var(--color-text-muted)]">No story folders yet. Auto mode will create one when needed.</p>
              ) : null}
            </CardContent>
          </Card>
          <AutopilotTemplateMapEditor
            projectId={selectedProjectId}
            subprojectId={selectedSubprojectId || undefined}
            onRunStarted={(message) => {
              setBanner(message)
              setErrorBanner("")
              loadInbox("in_progress", selectedProjectId).catch(console.error)
              if (selectedProjectId) {
                loadRunHistory(selectedProjectId).catch(console.error)
              }
            }}
          />
        </>
      ) : (
        <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Project Creator</CardTitle>
          <CardDescription>Create a project directly from Inbox and refresh selector context.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-2">
          <input
            className="h-10 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] px-3 md:col-span-2"
            value={projectDraftName}
            onChange={(event) => setProjectDraftName(event.target.value)}
            placeholder="Project name"
          />
          <input
            className="h-10 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] px-3 md:col-span-2"
            value={projectDraftDescription}
            onChange={(event) => setProjectDraftDescription(event.target.value)}
            placeholder="Description (optional)"
          />
          <Button
            onClick={() => createProject().catch(console.error)}
            disabled={isCreatingProject || !projectDraftName.trim()}
          >
            {isCreatingProject ? "Creating..." : "Create Project"}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Autopilot Inbox Studio</CardTitle>
          <CardDescription>Inbox-first draft factory with permissive manager warnings.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 lg:grid-cols-6 gap-3">
          <select
            className="h-10 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] px-3"
            value={selectedProjectId}
            onChange={(event) => setSelectedProjectId(event.target.value)}
          >
            <option value="">Select project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
          <select
            className="h-10 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] px-3"
            value={selectedSubprojectId}
            onChange={(event) => setSelectedSubprojectId(event.target.value)}
            disabled={!selectedProjectId || subprojects.length === 0}
          >
            <option value="">Auto story folder</option>
            {subprojects.map((subproject) => (
              <option key={subproject.id} value={subproject.id}>{subproject.name}</option>
            ))}
          </select>
          {isLoadingSubprojects ? (
            <p className="text-xs text-[var(--color-text-muted)] lg:col-span-6">Loading story folders...</p>
          ) : null}
          {!isLoadingSubprojects && subprojectLoadError ? (
            <p className="text-xs text-amber-300 lg:col-span-6">{subprojectLoadError}</p>
          ) : null}
          {!isLoadingSubprojects && !subprojectLoadError && selectedProjectId && subprojects.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)] lg:col-span-6">No story folders yet. Start a run to auto-create one, or keep Auto mode.</p>
          ) : null}
          <input
            className="h-10 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] px-3"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="Draft topic"
          />
          <select
            className="h-10 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] px-3"
            value={format}
            onChange={(event) => setFormat(event.target.value as "long" | "short")}
          >
            <option value="long">Long</option>
            <option value="short">Short</option>
          </select>
          <input
            type="number"
            min={15}
            max={7200}
            className="h-10 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] px-3"
            value={targetTranscriptSeconds}
            onChange={(event) => {
              const nextValue = event.target.value
              if (!nextValue) {
                setTargetTranscriptSeconds("")
                return
              }
              const parsed = Number(nextValue)
              if (!Number.isFinite(parsed)) return
              setTargetTranscriptSeconds(Math.min(7200, Math.max(1, parsed)))
            }}
            placeholder="Target seconds"
          />
          <Button
            variant="outline"
            disabled={!selectedProjectId || isStarting}
            onClick={() => startRun("brainstorm").catch(console.error)}
          >
            <Brain className="w-4 h-4 mr-2" />
            Brainstorm
          </Button>
          <div className="flex gap-2">
            <Button onClick={() => startRun("draft").catch(console.error)} disabled={!selectedProjectId || isStarting}>
              <Play className="w-4 h-4 mr-2" />
              {isStarting ? "Starting..." : "NewDraft"}
            </Button>
            <Button variant="outline" onClick={() => setShowSchedule((prev) => !prev)} disabled={!selectedProjectId}>
              <CalendarClock className="w-4 h-4 mr-2" />
              Schedule
            </Button>
          </div>
          <p className="text-xs text-[var(--color-text-muted)] lg:col-span-6">
            {targetWordEstimate
              ? `Target pacing: ${targetTranscriptSeconds}s -> ~${targetWordEstimate.targetWordCount} words (range ${targetWordEstimate.minWords}-${targetWordEstimate.maxWords}).`
              : "Optional: set target transcript seconds to enforce script pacing by word count."}
          </p>
        </CardContent>
      </Card>
      {banner ? (
        <p className="text-sm text-emerald-400">{banner}</p>
      ) : null}
      {errorBanner ? (
        <p className="text-sm text-red-400">{errorBanner}</p>
      ) : null}

      {showSchedule && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Schedule Settings</CardTitle>
            <CardDescription>Every schedule creates a draft package for inbox review.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 lg:grid-cols-4 gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={scheduleDraft.enabled}
                onChange={(event) => setScheduleDraft((prev) => ({ ...prev, enabled: event.target.checked }))}
              />
              Enabled
            </label>
            <input
              className="h-10 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] px-3"
              value={scheduleDraft.cron}
              onChange={(event) => setScheduleDraft((prev) => ({ ...prev, cron: event.target.value }))}
              placeholder="Cron"
            />
            <input
              className="h-10 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] px-3"
              value={scheduleDraft.timezone}
              onChange={(event) => setScheduleDraft((prev) => ({ ...prev, timezone: event.target.value }))}
              placeholder="Timezone"
            />
            <Button onClick={saveSchedule}>Save Schedule</Button>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-2">
        {TABS.map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? "default" : "outline"}
            onClick={() => {
              setActiveTab(tab.id)
              loadInbox(tab.id, selectedProjectId).catch(console.error)
            }}
          >
            {tab.label}
          </Button>
        ))}
        <Button variant="ghost" onClick={() => loadInbox(activeTab, selectedProjectId).catch(console.error)}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {items.length === 0 ? (
          <Card>
            <CardContent className="pt-5">
              <p className="text-sm text-[var(--color-text-muted)]">
                No items in this inbox tab yet.
              </p>
            </CardContent>
          </Card>
        ) : null}
        {items.map((pkg) => (
          <Card key={pkg.packageId}>
            <CardContent className="pt-5 space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-medium">{pkg.topic}</p>
                <span className="text-xs rounded px-2 py-1 border border-[var(--color-border)]">{pkg.format}</span>
              </div>
              <p className="text-xs text-[var(--color-text-muted)]">
                Score {pkg.manager.score}/100 · {pkg.manager.status} · ETA {Math.round(pkg.runtimeEstimateSeconds / 60)} min
              </p>
              <p className="text-xs text-[var(--color-text-muted)]">
                Assets: {pkg.assets.script ? "Script " : ""}{pkg.assets.scenes ? "Scenes " : ""}{pkg.assets.prompts ? "Prompts " : ""}{pkg.assets.storyboard ? "Storyboard " : ""}{pkg.assets.clips ? "Clips" : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={async () => {
                    setSelectedPackage(pkg)
                    setPackageDetailView("review")
                    if (pkg.latestRunId) {
                      setSelectedMapRunId(pkg.latestRunId)
                      const run = await loadRun(pkg.latestRunId)
                      setSelectedRun(run)
                      await loadRunArtifacts(pkg.latestRunId)
                    } else {
                      setSelectedRun(null)
                      setSelectedMapRunId("")
                      setMapArtifacts([])
                    }
                    if (selectedProjectId) await loadRunHistory(selectedProjectId)
                  }}
                >
                  Review
                </Button>
                {pkg.manager.status === "needs_attention" ? (
                  <Button variant="outline" onClick={() => fixAndRecheck(pkg).catch(console.error)}>FixAndRecheck</Button>
                ) : null}
                <Button variant="secondary" onClick={() => approvePackage(pkg).catch(console.error)}>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Approve
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      </>
      )}
        </div>
        {workspaceView !== "map" ? (
          <div className="relative z-0 xl:sticky xl:top-6">
            <AutopilotProjectChat
              projectId={selectedProjectId || undefined}
              sessionId={selectedSessionId || undefined}
              onSessionIdChange={setSelectedSessionId}
              onSendToImageQueue={transferChatPromptsToImage}
              onSendToVideoQueue={transferChatPromptsToVideo}
            />
          </div>
        ) : null}
      </div>
      {workspaceView === "map" ? (
        <>
          {!mapChatOpen ? (
            <button
              type="button"
              onClick={() => {
                setMapChatOpen(true)
                setMapChatMinimized(false)
              }}
              className="fixed bottom-6 right-6 z-50 inline-flex h-12 w-12 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-primary)] text-white shadow-lg hover:opacity-95"
              aria-label="Open Autopilot manager chat"
              title="Open Autopilot manager chat"
            >
              <MessageCircle className="w-5 h-5" />
            </button>
          ) : (
            <div className="fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-1.5rem)]">
              <Card className={`shadow-2xl ${mapChatMinimized ? "" : "h-[68vh] min-h-[360px] max-h-[780px]"}`}>
                <CardHeader className={`${mapChatMinimized ? "pb-3" : "pb-2"}`}>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Autopilot Manager</CardTitle>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setMapChatMinimized((prev) => !prev)}
                        title={mapChatMinimized ? "Expand chat" : "Minimize chat"}
                      >
                        {mapChatMinimized ? <ChevronsUp className="w-4 h-4" /> : <ChevronsDown className="w-4 h-4" />}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setMapChatOpen(false)} title="Close chat">
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <CardDescription>Chat with the manager while editing workflows.</CardDescription>
                </CardHeader>
                {!mapChatMinimized ? (
                  <CardContent className="h-[calc(100%-76px)] pt-0">
                    <AutopilotProjectChat
                      projectId={selectedProjectId || undefined}
                      sessionId={selectedSessionId || undefined}
                      onSessionIdChange={setSelectedSessionId}
                      onSendToImageQueue={transferChatPromptsToImage}
                      onSendToVideoQueue={transferChatPromptsToVideo}
                    />
                  </CardContent>
                ) : null}
              </Card>
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}
