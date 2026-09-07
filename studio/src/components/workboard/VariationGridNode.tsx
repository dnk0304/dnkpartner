// ============================================================
// DNK AI Studio - VariationGridNode (Workboard · Phase 3)
// ------------------------------------------------------------
// Buzzy "nine-grid": a NON-DESTRUCTIVE 3×3 grid of 9 variation
// thumbnails spawned as its OWN node, spline-linked from the
// source casting node (lineage). Thumbnails stream in as each
// generation resolves (loading / done / error per cell).
//
// Clicking a finished thumbnail "pops it out" — the parent canvas
// spawns a fresh canonical ShotNode from that cell and persists
// the pick against the element. The other 8 cells stay put
// (orphaned artifacts, never deleted).
// ============================================================

import { memo } from "react"
import { Handle, Position, type NodeProps } from "reactflow"
import { Grid3x3, Loader2, AlertTriangle, ImageIcon, Check } from "lucide-react"
import type { CastingType } from "../CastingCard"

export type VariationCellStatus = "loading" | "done" | "error"

export interface VariationCell {
  status: VariationCellStatus
  image?: string
  seed?: number
}

export interface VariationGridNodeData {
  sourceNodeId: string
  castingType: CastingType
  elementId: string
  elementName: string
  storyBaseId: string
  /** 9 cells, index-stable. */
  cells: VariationCell[]
  /** Index of the cell promoted to canonical (if any). */
  pickedIndex?: number | null
  /** Fires when a finished cell is clicked → parent pops it out. */
  onPickCell?: (gridNodeId: string, cellIndex: number, image: string) => void
  /** The grid node's own id (React Flow doesn't pass it into data). */
  nodeId: string
}

function VariationGridNodeComponent({ data, selected }: NodeProps<VariationGridNodeData>) {
  const { cells, elementName, pickedIndex, onPickCell, nodeId } = data
  const doneCount = cells.filter((c) => c.status === "done").length
  const allSettled = cells.every((c) => c.status !== "loading")

  return (
    <div
      className={`w-[300px] rounded-xl border bg-[var(--color-background)] shadow-[0_6px_16px_rgba(0,0,0,0.25)] overflow-hidden transition-colors ${
        selected ? "border-orange-500 ring-2 ring-orange-500/40" : "border-[var(--color-border)]"
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-orange-400 !w-2.5 !h-2.5 !border-0" />

      {/* Header ribbon (also the drag handle) */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--color-surface)] border-b border-[var(--color-border)]">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          <Grid3x3 className="w-3.5 h-3.5 text-orange-400" />
          Variations
        </span>
        <span className="text-[10px] text-[var(--color-text-muted)] tabular-nums">
          {allSettled ? `${doneCount}/9` : `${doneCount}/9…`}
        </span>
      </div>

      <p className="px-3 pt-2 text-xs text-[var(--color-text)] font-medium truncate" title={elementName}>
        {elementName}
      </p>
      <p className="px-3 pb-2 text-[10px] text-[var(--color-text-muted)]">
        {allSettled ? "Click a thumbnail to make it canonical" : "Generating 9 variations…"}
      </p>

      {/* 3×3 grid */}
      <div className="grid grid-cols-3 gap-1 p-2 pt-0">
        {cells.map((cell, i) => {
          const isPicked = pickedIndex === i
          const clickable = cell.status === "done"
          return (
            <button
              key={i}
              type="button"
              disabled={!clickable}
              onClick={
                clickable && cell.image
                  ? () => onPickCell?.(nodeId, i, cell.image as string)
                  : undefined
              }
              aria-label={
                cell.status === "done"
                  ? `Make variation ${i + 1} the canonical image for ${elementName}`
                  : `Variation ${i + 1} (${cell.status})`
              }
              className={`nodrag relative aspect-square rounded-md overflow-hidden bg-[var(--color-surface)] flex items-center justify-center outline-none transition ${
                clickable
                  ? "cursor-pointer hover:ring-2 hover:ring-orange-400 focus-visible:ring-2 focus-visible:ring-orange-500"
                  : "cursor-default"
              } ${isPicked ? "ring-2 ring-emerald-400" : ""}`}
            >
              {cell.status === "done" && cell.image ? (
                <img
                  src={cell.image}
                  alt={`Variation ${i + 1} of ${elementName}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  draggable={false}
                />
              ) : cell.status === "loading" ? (
                <Loader2 className="w-4 h-4 text-orange-400 animate-spin" />
              ) : cell.status === "error" ? (
                <AlertTriangle className="w-4 h-4 text-red-500" />
              ) : (
                <ImageIcon className="w-4 h-4 text-[var(--color-text-dim)]" />
              )}

              {isPicked && (
                <span className="absolute top-0.5 right-0.5 rounded-full bg-emerald-500 p-0.5">
                  <Check className="w-2.5 h-2.5 text-white" />
                </span>
              )}
            </button>
          )
        })}
      </div>

      <Handle type="source" position={Position.Right} className="!bg-orange-400 !w-2.5 !h-2.5 !border-0" />
    </div>
  )
}

export const VariationGridNode = memo(VariationGridNodeComponent)
