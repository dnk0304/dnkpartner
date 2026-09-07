// ============================================================
// DNK AI Studio - CastingNode (Workboard · Phase 2)
// ------------------------------------------------------------
// A custom React Flow node that wraps the shared <CastingCard>
// (thumbnail + name + Generate/Regenerate). One node per casting
// element on the infinite canvas. Source/target handles are
// present so later phases can spline lineage into shot nodes.
// ============================================================

import { memo } from "react"
import { Handle, Position, type NodeProps } from "reactflow"
import { Users, Box, MapPin, Cloud, Grid3x3 } from "lucide-react"
import { CastingCard, type CastingElement, type CastingType } from "../CastingCard"
import type { ImageryStyle } from "@/types/StudioMode"

/** Number of variations spawned per "Generate Variations" click (Buzzy nine-grid). */
export const VARIATION_COUNT = 9

export interface CastingNodeData {
  type: CastingType
  singular: string
  element: CastingElement
  storyBaseId: string
  activeStyle: ImageryStyle | null
  model?: string
  nodeId: string
  /** Called with the fresh element after generate + persist. */
  onGenerated: (type: CastingType, updated: CastingElement) => void
  /** Spawns a non-destructive 3×3 variation grid node from this casting node. */
  onGenerateVariations?: (sourceNodeId: string, type: CastingType, element: CastingElement) => void
  /** True while this node's variation grid is generating (disables the button). */
  variationsBusy?: boolean
}

const TYPE_META: Record<CastingType, { label: string; Icon: typeof Users }> = {
  characters: { label: "Cast", Icon: Users },
  objects: { label: "Object", Icon: Box },
  environments: { label: "Scenery", Icon: MapPin },
  atmospheres: { label: "Atmosphere", Icon: Cloud },
}

function CastingNodeComponent({ data, selected }: NodeProps<CastingNodeData>) {
  const {
    type,
    singular,
    element,
    storyBaseId,
    activeStyle,
    model,
    nodeId,
    onGenerated,
    onGenerateVariations,
    variationsBusy,
  } = data
  const { label, Icon } = TYPE_META[type]

  return (
    <div
      className={`w-[210px] rounded-xl border bg-[var(--color-background)] shadow-[0_6px_16px_rgba(0,0,0,0.25)] overflow-hidden transition-colors ${
        selected ? "border-orange-500 ring-2 ring-orange-500/40" : "border-[var(--color-border)]"
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-orange-400 !w-2.5 !h-2.5 !border-0"
      />

      {/* Type ribbon (also the drag handle — the card body has .nodrag on its button) */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-surface)] border-b border-[var(--color-border)] text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        <Icon className="w-3.5 h-3.5 text-orange-400" />
        {label}
      </div>

      <CastingCard
        type={type}
        singular={singular}
        element={element}
        storyBaseId={storyBaseId}
        activeStyle={activeStyle}
        model={model}
        variant="node"
        onGenerated={(updated) => onGenerated(type, updated)}
      />

      {/* Generate Variations — spawns a non-destructive nine-grid node */}
      {onGenerateVariations && (
        <div className="px-3 pb-3 -mt-1">
          <button
            type="button"
            disabled={variationsBusy}
            onClick={() => onGenerateVariations(nodeId, type, element)}
            aria-label={`Generate ${VARIATION_COUNT} variations of ${element.name}`}
            className="nodrag w-full flex items-center justify-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-xs font-medium text-[var(--color-text)] transition-colors hover:border-orange-400 hover:text-orange-400 disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
          >
            <Grid3x3 className="w-3.5 h-3.5" />
            {variationsBusy ? "Generating…" : "Generate Variations"}
          </button>
          <p className="mt-1 text-center text-[10px] text-[var(--color-text-muted)]">
            ~{VARIATION_COUNT} generations
          </p>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        className="!bg-orange-400 !w-2.5 !h-2.5 !border-0"
      />
    </div>
  )
}

export const CastingNode = memo(CastingNodeComponent)
