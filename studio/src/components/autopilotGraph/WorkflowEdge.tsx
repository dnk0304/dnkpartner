import { BaseEdge, EdgeLabelRenderer, EdgeProps, getBezierPath } from "reactflow"

type WorkflowEdgeData = {
  onDeleteEdge?: (edgeId: string) => void
}

export function WorkflowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  selected,
  data,
}: EdgeProps<WorkflowEdgeData>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      {selected && data?.onDeleteEdge ? (
        <EdgeLabelRenderer>
          <button
            type="button"
            className="absolute h-6 w-6 rounded-full border border-red-400/70 bg-red-900/85 text-xs text-red-100 shadow-lg"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
            title="Delete connection"
            aria-label="Delete connection"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              data.onDeleteEdge?.(id)
            }}
          >
            X
          </button>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}

