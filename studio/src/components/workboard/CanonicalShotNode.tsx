// ============================================================
// DNK AI Studio - CanonicalShotNode (Workboard · Phase 3)
// ------------------------------------------------------------
// The "pop-out": when a cell in a VariationGridNode is picked,
// the parent spawns THIS node from that cell (spline from the
// grid) holding the chosen image. It is the element's canonical
// image going forward (persisted via /api/casting/:type). The
// grid it came from stays as an artifact; the other 8 cells are
// orphaned, not deleted.
// ============================================================

import { memo } from "react"
import { Handle, Position, type NodeProps } from "reactflow"
import { Star } from "lucide-react"
import type { CastingType } from "../CastingCard"

export interface CanonicalShotNodeData {
  castingType: CastingType
  elementId: string
  elementName: string
  storyBaseId: string
  image: string
}

function CanonicalShotNodeComponent({ data, selected }: NodeProps<CanonicalShotNodeData>) {
  const { image, elementName } = data
  return (
    <div
      className={`w-[210px] rounded-xl border bg-[var(--color-background)] shadow-[0_6px_16px_rgba(0,0,0,0.25)] overflow-hidden transition-colors ${
        selected ? "border-emerald-500 ring-2 ring-emerald-500/40" : "border-emerald-500/60"
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-emerald-400 !w-2.5 !h-2.5 !border-0" />

      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border-b border-emerald-500/30 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
        <Star className="w-3.5 h-3.5 fill-emerald-400" />
        Canonical
      </div>

      <div className="relative aspect-square bg-[var(--color-surface)]">
        <img
          src={image}
          alt={`Canonical image for ${elementName}`}
          className="w-full h-full object-cover"
          loading="lazy"
          draggable={false}
        />
      </div>

      <p className="px-3 py-2 text-sm font-semibold text-[var(--color-text)] truncate" title={elementName}>
        {elementName}
      </p>

      <Handle type="source" position={Position.Right} className="!bg-emerald-400 !w-2.5 !h-2.5 !border-0" />
    </div>
  )
}

export const CanonicalShotNode = memo(CanonicalShotNodeComponent)
