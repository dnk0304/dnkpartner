// ============================================================
// DNK AI Studio - Scene Import Dialog (Workboard P4)
// ------------------------------------------------------------
// Pulls scenes out of a past Autopilot run's imageryPlan and
// drops them into a workboard section.
//
// Data: GET /api/workboard/:storyBaseId/scene-sources
//       -> { runs: [{ runId, topic, createdAt, sceneCount, scenes }] }
// Autopilot runs are keyed by projectId, not storyBaseId, so the
// endpoint hands back every run that carries a plan and the user
// picks the one that belongs to this project.
// ============================================================

import { useEffect, useRef, useState } from "react"
import { Loader2, AlertTriangle, X, Download } from "lucide-react"

export interface SceneSourceScene {
  scene: number
  prompt: string
  style?: string
}

export interface SceneSourceRun {
  runId: string
  projectId: string
  topic?: string
  createdAt: number
  sceneCount: number
  scenes: SceneSourceScene[]
}

interface SceneImportDialogProps {
  storyBaseId: string
  /** Existing sections offered as an import destination. */
  sections: { id: string; name: string }[]
  onClose: () => void
  /**
   * `destination` is an existing section id, or `{ newName }` when the user
   * wants the scenes to land in a section that doesn't exist yet.
   */
  onImport: (
    scenes: SceneSourceScene[],
    destination: { sectionId: string } | { newName: string }
  ) => void
}

type LoadState = "loading" | "ready" | "error"

const NEW_SECTION = "__new__"

function formatRunDate(createdAt: number): string {
  if (!createdAt) return "Unknown date"
  const d = new Date(createdAt)
  if (Number.isNaN(d.getTime())) return "Unknown date"
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function SceneImportDialog({
  storyBaseId,
  sections,
  onClose,
  onImport,
}: SceneImportDialogProps) {
  const [state, setState] = useState<LoadState>("loading")
  const [runs, setRuns] = useState<SceneSourceRun[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [destination, setDestination] = useState<string>(sections[0]?.id ?? NEW_SECTION)
  const [newSectionName, setNewSectionName] = useState("Imported scenes")
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  // Escape closes, as any dialog should.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    setState("loading")

    fetch(`/api/workboard/${encodeURIComponent(storyBaseId)}/scene-sources`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return await res.json()
      })
      .then((data) => {
        if (cancelled) return
        // Tolerate both `{ runs: [...] }` and a bare array.
        const list: SceneSourceRun[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.runs)
            ? data.runs
            : []
        setRuns(list)
        setSelectedRunId(list[0]?.runId ?? null)
        setState("ready")
      })
      .catch(() => {
        if (cancelled) return
        setState("error")
      })

    return () => {
      cancelled = true
    }
  }, [storyBaseId])

  const selectedRun = runs.find((r) => r.runId === selectedRunId) ?? null
  const canImport =
    selectedRun !== null &&
    selectedRun.scenes.length > 0 &&
    (destination !== NEW_SECTION || newSectionName.trim().length > 0)

  const handleImport = () => {
    if (!selectedRun || !canImport) return
    onImport(
      selectedRun.scenes,
      destination === NEW_SECTION
        ? { newName: newSectionName.trim() }
        : { sectionId: destination }
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="scene-import-title"
        className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] shadow-2xl"
      >
        <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--color-border)]">
          <h2
            id="scene-import-title"
            className="text-sm font-semibold text-[var(--color-text)]"
          >
            Import scenes from an Autopilot run
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close import dialog"
            className="p-1 rounded-md text-[var(--color-text-dim)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          {state === "loading" && (
            <p className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              Loading Autopilot runs…
            </p>
          )}

          {state === "error" && (
            <p className="flex items-center gap-1.5 text-xs text-red-500">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              Couldn&apos;t load Autopilot runs. Close this and try again.
            </p>
          )}

          {state === "ready" && runs.length === 0 && (
            <p className="text-xs text-[var(--color-text-muted)]">
              No Autopilot scenes found. Run Autopilot with an imagery plan, then import
              here.
            </p>
          )}

          {state === "ready" && runs.length > 0 && (
            <>
              <fieldset>
                <legend className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-dim)] mb-2">
                  Pick a run
                </legend>
                <ul role="list" className="flex flex-col gap-1.5">
                  {runs.map((run) => {
                    const checked = run.runId === selectedRunId
                    return (
                      <li key={run.runId}>
                        <label
                          className={`flex items-start gap-2.5 rounded-lg border p-2.5 cursor-pointer transition-colors ${
                            checked
                              ? "border-orange-500 bg-orange-500/10"
                              : "border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]"
                          }`}
                        >
                          <input
                            type="radio"
                            name="scene-source-run"
                            value={run.runId}
                            checked={checked}
                            onChange={() => setSelectedRunId(run.runId)}
                            className="mt-0.5 accent-orange-500"
                          />
                          <span className="min-w-0">
                            <span className="block text-xs font-medium text-[var(--color-text)] truncate">
                              {run.topic || run.runId}
                            </span>
                            <span className="block text-[11px] text-[var(--color-text-dim)]">
                              {formatRunDate(run.createdAt)} · {run.sceneCount}{" "}
                              {run.sceneCount === 1 ? "scene" : "scenes"}
                            </span>
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </fieldset>

              <div className="mt-5">
                <label
                  htmlFor="scene-import-destination"
                  className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-dim)] mb-2"
                >
                  Add them to
                </label>
                <select
                  id="scene-import-destination"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                >
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                  <option value={NEW_SECTION}>New section…</option>
                </select>

                {destination === NEW_SECTION && (
                  <input
                    type="text"
                    value={newSectionName}
                    onChange={(e) => setNewSectionName(e.target.value)}
                    aria-label="New section name"
                    placeholder="Section name"
                    className="mt-2 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                  />
                )}
              </div>
            </>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--color-border)]">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={!canImport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background)]"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            Import{selectedRun ? ` ${selectedRun.scenes.length}` : ""}
          </button>
        </footer>
      </div>
    </div>
  )
}
