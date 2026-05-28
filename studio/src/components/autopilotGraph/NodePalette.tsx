import { AUTOPILOT_NODE_HIERARCHY, AUTOPILOT_NODE_TYPES, AUTOPILOT_NODE_TYPES_BY_TYPE } from "./nodeTypes"

type NodePaletteProps = {
  onAddNode: (nodeType: string) => void
}

export function NodePalette({ onAddNode }: NodePaletteProps) {
  const grouped = AUTOPILOT_NODE_TYPES.reduce<Record<string, typeof AUTOPILOT_NODE_TYPES>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = []
    acc[item.category].push(item)
    return acc
  }, {})

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--color-text-muted)]">
        Drag a node onto the map or click to add.
      </p>
      <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Recommended Hierarchy</p>
        <ol className="mt-1 space-y-0.5 text-[11px] text-[var(--color-text-muted)]">
          {AUTOPILOT_NODE_HIERARCHY.map((typeName) => (
            <li key={typeName}>
              {AUTOPILOT_NODE_TYPES_BY_TYPE[typeName]?.label || typeName}
            </li>
          ))}
        </ol>
      </div>
      {Object.entries(grouped).map(([category, items]) => (
        <div key={category} className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{category}</p>
          <div className="space-y-1">
            {items.map((item) => (
              <button
                key={item.type}
                type="button"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData("application/x-autopilot-node-type", item.type)
                  event.dataTransfer.effectAllowed = "copyMove"
                }}
                onClick={() => onAddNode(item.type)}
                className="w-full text-left rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 hover:border-[var(--color-primary)]"
              >
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-xs text-[var(--color-text-muted)]">{item.description}</p>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
