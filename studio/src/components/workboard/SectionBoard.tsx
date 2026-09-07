// ============================================================
// DNK AI Studio - Section Board (Workboard P4)
// ------------------------------------------------------------
// The Buzzy.now-style view of a project: its scenes grouped into
// named, ordered sections (warm-up → main part → closing → finish).
//
//   Overview   sections as cards — order rail, name, scene count,
//              filmstrip of the first few scene stills.
//   Detail     click a card → grid of that section's scenes, with a
//              back button and prev/next section paging so you can
//              flip through the running order without backing out.
//
// The section order rail (01 / 02 / 03) is not decoration: sections
// are a running order, and the number is the thing that tells you
// where you are in it.
//
// Data: GET/POST /api/workboard/:storyBaseId
//   The POST handler REPLACES nodes/edges wholesale and 400s when
//   `nodes` is missing, so this view is fetch-merge-save: it holds
//   the canvas nodes/edges it loaded and sends them back untouched
//   alongside the full sections + scenes arrays.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  ImageIcon,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react"
import { SceneImportDialog, type SceneSourceScene } from "./SceneImportDialog"

// ------------------------------------------------------------
// Model (mirrors the server's WorkboardSection / WorkboardScene)
// ------------------------------------------------------------

export interface WorkboardSection {
  id: string
  name: string
  order: number
  sceneIds: string[]
}

export interface WorkboardScene {
  id: string
  title: string
  prompt?: string
  image?: string
  order: number
}

interface CanvasGraph {
  nodes: unknown[]
  edges: unknown[]
}

interface SectionBoardProps {
  storyBaseId: string
}

type LoadState = "loading" | "ready" | "error"
type SaveState = "idle" | "saving" | "saved" | "error"

const UNASSIGNED = "__unassigned__"

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function byOrder<T extends { order: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.order - b.order)
}

// ------------------------------------------------------------
// Scene tile — a still when we have one, the prompt as type when we don't.
// ------------------------------------------------------------

function SceneTile({
  scene,
  sections,
  currentSectionId,
  onMove,
  onRemove,
}: {
  scene: WorkboardScene
  sections: WorkboardSection[]
  currentSectionId: string
  onMove: (sceneId: string, toSectionId: string) => void
  onRemove: (sceneId: string) => void
}) {
  return (
    <li className="flex flex-col rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
      <div className="aspect-video bg-[var(--color-background)] flex items-center justify-center overflow-hidden">
        {scene.image ? (
          <img
            src={scene.image}
            alt={scene.title}
            className="w-full h-full object-cover"
            loading="lazy"
            draggable={false}
          />
        ) : scene.prompt ? (
          <p className="p-3 text-[11px] leading-snug text-[var(--color-text-muted)] line-clamp-4">
            {scene.prompt}
          </p>
        ) : (
          <ImageIcon className="w-6 h-6 text-[var(--color-text-dim)]" aria-hidden="true" />
        )}
      </div>

      <div className="flex items-center justify-between gap-2 px-2.5 py-2">
        <span
          className="min-w-0 truncate text-xs font-medium text-[var(--color-text)]"
          title={scene.title}
        >
          {scene.title}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <label className="sr-only" htmlFor={`move-${scene.id}`}>
            Move {scene.title} to another section
          </label>
          <select
            id={`move-${scene.id}`}
            value={currentSectionId}
            onChange={(e) => onMove(scene.id, e.target.value)}
            className="max-w-[110px] rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-1.5 py-1 text-[11px] text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
          >
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            <option value={UNASSIGNED}>Unassigned</option>
          </select>
          <button
            type="button"
            onClick={() => onRemove(scene.id)}
            aria-label={`Delete scene ${scene.title}`}
            className="p-1 rounded-md text-[var(--color-text-dim)] hover:text-red-400 hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </li>
  )
}

// ------------------------------------------------------------
// Section card — overview entry.
// ------------------------------------------------------------

function SectionCard({
  section,
  index,
  scenes,
  isFirst,
  isLast,
  onOpen,
  onRename,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  section: WorkboardSection
  index: number
  scenes: WorkboardScene[]
  isFirst: boolean
  isLast: boolean
  onOpen: () => void
  onRename: () => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const strip = scenes.slice(0, 4)
  const count = scenes.length

  return (
    <li className="flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden transition-colors hover:border-[var(--color-border-bright)]">
      <button
        type="button"
        onClick={onOpen}
        className="text-left p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-inset"
      >
        <span className="flex items-baseline gap-2.5">
          <span
            className="font-mono text-xs tabular-nums text-orange-500"
            aria-hidden="true"
          >
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-[var(--color-text)] truncate">
              {section.name}
            </span>
            <span className="block text-[11px] text-[var(--color-text-dim)]">
              {count} {count === 1 ? "scene" : "scenes"}
            </span>
          </span>
        </span>

        <span className="mt-3 grid grid-cols-4 gap-1.5">
          {Array.from({ length: 4 }).map((_, i) => {
            const scene = strip[i]
            return (
              <span
                key={i}
                className="aspect-video rounded-md bg-[var(--color-background)] border border-[var(--color-border)] overflow-hidden flex items-center justify-center"
              >
                {scene?.image ? (
                  <img
                    src={scene.image}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                    draggable={false}
                  />
                ) : null}
              </span>
            )
          })}
        </span>
      </button>

      <div className="flex items-center gap-0.5 px-2.5 py-1.5 border-t border-[var(--color-border)]">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          aria-label={`Move ${section.name} earlier`}
          className="p-1 rounded-md text-[var(--color-text-dim)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
        >
          <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          aria-label={`Move ${section.name} later`}
          className="p-1 rounded-md text-[var(--color-text-dim)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
        >
          <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onRename}
          aria-label={`Rename ${section.name}`}
          className="p-1 rounded-md text-[var(--color-text-dim)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
        >
          <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${section.name}`}
          className="p-1 rounded-md text-[var(--color-text-dim)] hover:text-red-400 hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
        >
          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>
    </li>
  )
}

// ------------------------------------------------------------
// SectionBoard
// ------------------------------------------------------------

export function SectionBoard({ storyBaseId }: SectionBoardProps) {
  const [state, setState] = useState<LoadState>("loading")
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [sections, setSections] = useState<WorkboardSection[]>([])
  const [scenes, setScenes] = useState<WorkboardScene[]>([])
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [newSectionName, setNewSectionName] = useState("")

  // Canvas half of the graph. We never read or render it — we only hold it so
  // a section save can hand it straight back to the server unchanged.
  const canvasRef = useRef<CanvasGraph>({ nodes: [], edges: [] })
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadedRef = useRef(false)

  // ---- load ------------------------------------------------
  useEffect(() => {
    let cancelled = false
    setState("loading")
    loadedRef.current = false

    fetch(`/api/workboard/${encodeURIComponent(storyBaseId)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return await res.json()
      })
      .then((graph) => {
        if (cancelled) return
        canvasRef.current = {
          nodes: Array.isArray(graph?.nodes) ? graph.nodes : [],
          edges: Array.isArray(graph?.edges) ? graph.edges : [],
        }
        setSections(Array.isArray(graph?.sections) ? byOrder(graph.sections) : [])
        setScenes(Array.isArray(graph?.scenes) ? graph.scenes : [])
        setState("ready")
        loadedRef.current = true
      })
      .catch(() => {
        if (cancelled) return
        setState("error")
      })

    return () => {
      cancelled = true
      loadedRef.current = false
    }
  }, [storyBaseId])

  // ---- save (debounced, fetch-merge-save) ------------------
  const persist = useCallback(
    (nextSections: WorkboardSection[], nextScenes: WorkboardScene[]) => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      setSaveState("saving")
      saveTimer.current = setTimeout(() => {
        fetch(`/api/workboard/${encodeURIComponent(storyBaseId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            // Canvas fields round-trip untouched — the handler replaces them.
            nodes: canvasRef.current.nodes,
            edges: canvasRef.current.edges,
            sections: nextSections,
            scenes: nextScenes,
          }),
        })
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            setSaveState("saved")
          })
          .catch(() => setSaveState("error"))
      }, 600)
    },
    [storyBaseId]
  )

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  // Every mutation goes through here so state and the server never diverge.
  const commit = useCallback(
    (nextSections: WorkboardSection[], nextScenes: WorkboardScene[]) => {
      setSections(nextSections)
      setScenes(nextScenes)
      if (loadedRef.current) persist(nextSections, nextScenes)
    },
    [persist]
  )

  // ---- derived --------------------------------------------
  const sceneById = useMemo(() => {
    const map = new Map<string, WorkboardScene>()
    for (const s of scenes) map.set(s.id, s)
    return map
  }, [scenes])

  const scenesOf = useCallback(
    (section: WorkboardSection): WorkboardScene[] =>
      section.sceneIds
        .map((id) => sceneById.get(id))
        .filter((s): s is WorkboardScene => s !== undefined),
    [sceneById]
  )

  const assignedIds = useMemo(() => {
    const set = new Set<string>()
    for (const s of sections) for (const id of s.sceneIds) set.add(id)
    return set
  }, [sections])

  const unassigned = useMemo(
    () => byOrder(scenes.filter((s) => !assignedIds.has(s.id))),
    [scenes, assignedIds]
  )

  const activeIndex = sections.findIndex((s) => s.id === activeSectionId)
  const activeSection = activeIndex >= 0 ? sections[activeIndex] : null

  // ---- section mutations ----------------------------------
  const addSection = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const next: WorkboardSection = {
      id: makeId("sec"),
      name: trimmed,
      order: sections.length,
      sceneIds: [],
    }
    commit([...sections, next], scenes)
    setNewSectionName("")
  }

  const renameSection = (section: WorkboardSection) => {
    const name = window.prompt("Section name", section.name)
    if (name === null) return
    const trimmed = name.trim()
    if (!trimmed) return
    commit(
      sections.map((s) => (s.id === section.id ? { ...s, name: trimmed } : s)),
      scenes
    )
  }

  const deleteSection = (section: WorkboardSection) => {
    const confirmed = window.confirm(
      `Delete "${section.name}"? Its ${section.sceneIds.length} scene(s) move back to Unassigned.`
    )
    if (!confirmed) return
    const next = sections
      .filter((s) => s.id !== section.id)
      .map((s, i) => ({ ...s, order: i }))
    if (activeSectionId === section.id) setActiveSectionId(null)
    commit(next, scenes)
  }

  const reorderSection = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= sections.length) return
    const next = [...sections]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    commit(
      next.map((s, i) => ({ ...s, order: i })),
      scenes
    )
  }

  // ---- scene mutations ------------------------------------
  const addScene = (sectionId: string) => {
    const title = window.prompt("Scene title")
    if (title === null) return
    const trimmedTitle = title.trim()
    if (!trimmedTitle) return
    const prompt = window.prompt("Prompt (optional)") ?? ""

    const scene: WorkboardScene = {
      id: makeId("scn"),
      title: trimmedTitle,
      order: scenes.length,
      ...(prompt.trim() ? { prompt: prompt.trim() } : {}),
    }
    commit(
      sections.map((s) =>
        s.id === sectionId ? { ...s, sceneIds: [...s.sceneIds, scene.id] } : s
      ),
      [...scenes, scene]
    )
  }

  const moveScene = (sceneId: string, toSectionId: string) => {
    commit(
      sections.map((s) => {
        const without = s.sceneIds.filter((id) => id !== sceneId)
        return s.id === toSectionId ? { ...s, sceneIds: [...without, sceneId] } : { ...s, sceneIds: without }
      }),
      scenes
    )
  }

  const removeScene = (sceneId: string) => {
    const scene = sceneById.get(sceneId)
    if (!window.confirm(`Delete scene "${scene?.title ?? sceneId}"?`)) return
    commit(
      sections.map((s) => ({ ...s, sceneIds: s.sceneIds.filter((id) => id !== sceneId) })),
      scenes.filter((s) => s.id !== sceneId)
    )
  }

  const importScenes = (
    incoming: SceneSourceScene[],
    destination: { sectionId: string } | { newName: string }
  ) => {
    const base = scenes.length
    const created: WorkboardScene[] = incoming.map((s, i) => ({
      id: makeId("scn"),
      title: `Scene ${s.scene ?? i + 1}`,
      order: base + (Number(s.scene) || i + 1),
      ...(s.prompt ? { prompt: s.prompt } : {}),
    }))
    const ids = created.map((s) => s.id)

    let nextSections: WorkboardSection[]
    if ("sectionId" in destination) {
      nextSections = sections.map((s) =>
        s.id === destination.sectionId ? { ...s, sceneIds: [...s.sceneIds, ...ids] } : s
      )
    } else {
      nextSections = [
        ...sections,
        {
          id: makeId("sec"),
          name: destination.newName,
          order: sections.length,
          sceneIds: ids,
        },
      ]
    }

    commit(nextSections, [...scenes, ...created])
    setImportOpen(false)
  }

  // ---- render ---------------------------------------------
  if (state === "loading") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          Loading sections…
        </p>
      </div>
    )
  }

  if (state === "error") {
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <p className="flex items-center gap-1.5 text-xs text-red-500">
          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
          Couldn&apos;t load this workboard. Reload the page to try again.
        </p>
      </div>
    )
  }

  const saveIndicator = (
    <span
      role="status"
      aria-live="polite"
      className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-dim)] min-w-[72px]"
    >
      {saveState === "saving" && (
        <>
          <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
          Saving…
        </>
      )}
      {saveState === "saved" && (
        <>
          <Check className="w-3 h-3 text-emerald-400" aria-hidden="true" />
          Saved
        </>
      )}
      {saveState === "error" && (
        <span className="text-red-500">Save failed</span>
      )}
    </span>
  )

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[var(--color-background)]">
      {activeSection ? (
        /* ---------------- Section detail ---------------- */
        <>
          <header className="shrink-0 flex items-center gap-2 px-6 py-3 border-b border-[var(--color-border)]">
            <button
              type="button"
              onClick={() => setActiveSectionId(null)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              All sections
            </button>

            <span className="mx-1 h-4 w-px bg-[var(--color-border)]" aria-hidden="true" />

            <h2 className="min-w-0 flex items-baseline gap-2">
              <span className="font-mono text-xs tabular-nums text-orange-500" aria-hidden="true">
                {String(activeIndex + 1).padStart(2, "0")}
              </span>
              <span className="text-sm font-semibold text-[var(--color-text)] truncate">
                {activeSection.name}
              </span>
              <span className="text-[11px] text-[var(--color-text-dim)] shrink-0">
                {activeSection.sceneIds.length}{" "}
                {activeSection.sceneIds.length === 1 ? "scene" : "scenes"}
              </span>
            </h2>

            <div className="flex-1" />
            {saveIndicator}

            <nav aria-label="Section navigation" className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setActiveSectionId(sections[activeIndex - 1].id)}
                disabled={activeIndex <= 0}
                aria-label="Previous section"
                className="p-1.5 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
              >
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setActiveSectionId(sections[activeIndex + 1].id)}
                disabled={activeIndex >= sections.length - 1}
                aria-label="Next section"
                className="p-1.5 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
              >
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </nav>

            <button
              type="button"
              onClick={() => addScene(activeSection.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-orange-500 text-white hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background)]"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              Add scene
            </button>
          </header>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
            {activeSection.sceneIds.length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)]">
                No scenes in this section yet. Add one, or import a set from an Autopilot
                run.
              </p>
            ) : (
              <ul
                role="list"
                className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(200px,1fr))]"
              >
                {scenesOf(activeSection).map((scene) => (
                  <SceneTile
                    key={scene.id}
                    scene={scene}
                    sections={sections}
                    currentSectionId={activeSection.id}
                    onMove={moveScene}
                    onRemove={removeScene}
                  />
                ))}
              </ul>
            )}
          </div>
        </>
      ) : (
        /* ---------------- Sections overview ---------------- */
        <>
          <header className="shrink-0 flex items-center gap-2 px-6 py-3 border-b border-[var(--color-border)]">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-dim)]">
              Sections{sections.length > 0 ? ` (${sections.length})` : ""}
            </h2>
            <div className="flex-1" />
            {saveIndicator}
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              Import scenes
            </button>
          </header>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                addSection(newSectionName)
              }}
              className="flex items-center gap-2 mb-5 max-w-md"
            >
              <label htmlFor="new-section-name" className="sr-only">
                New section name
              </label>
              <input
                id="new-section-name"
                type="text"
                value={newSectionName}
                onChange={(e) => setNewSectionName(e.target.value)}
                placeholder="New section — e.g. Warm-up"
                className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
              />
              <button
                type="submit"
                disabled={!newSectionName.trim()}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background)]"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                Add section
              </button>
            </form>

            {sections.length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)]">
                No sections yet. Name your first one above — most projects run warm-up,
                main part, closing, finish.
              </p>
            ) : (
              <ul
                role="list"
                className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(260px,1fr))]"
              >
                {sections.map((section, i) => (
                  <SectionCard
                    key={section.id}
                    section={section}
                    index={i}
                    scenes={scenesOf(section)}
                    isFirst={i === 0}
                    isLast={i === sections.length - 1}
                    onOpen={() => setActiveSectionId(section.id)}
                    onRename={() => renameSection(section)}
                    onDelete={() => deleteSection(section)}
                    onMoveUp={() => reorderSection(i, -1)}
                    onMoveDown={() => reorderSection(i, 1)}
                  />
                ))}
              </ul>
            )}

            {unassigned.length > 0 && (
              <section className="mt-8" aria-label="Unassigned scenes">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-dim)] mb-3">
                  Unassigned ({unassigned.length})
                </h3>
                <ul
                  role="list"
                  className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(200px,1fr))]"
                >
                  {unassigned.map((scene) => (
                    <SceneTile
                      key={scene.id}
                      scene={scene}
                      sections={sections}
                      currentSectionId={UNASSIGNED}
                      onMove={moveScene}
                      onRemove={removeScene}
                    />
                  ))}
                </ul>
              </section>
            )}
          </div>
        </>
      )}

      {importOpen && (
        <SceneImportDialog
          storyBaseId={storyBaseId}
          sections={sections.map((s) => ({ id: s.id, name: s.name }))}
          onClose={() => setImportOpen(false)}
          onImport={importScenes}
        />
      )}
    </div>
  )
}
