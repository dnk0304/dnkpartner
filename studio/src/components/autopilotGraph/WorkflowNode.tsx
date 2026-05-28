import { Handle, NodeProps, Position } from "reactflow"
import { AUTOPILOT_NODE_TYPES_BY_TYPE } from "./nodeTypes"

type WorkflowNodeData = {
  label: string
  title: string
  nodeType: string
  config: Record<string, any>
  justConnected?: boolean
}

function portLeft(index: number, total: number): string {
  if (total <= 1) return "50%"
  const step = 100 / (total + 1)
  return `${step * (index + 1)}%`
}

export function WorkflowNode({ data, selected }: NodeProps<WorkflowNodeData>) {
  const typeDef = AUTOPILOT_NODE_TYPES_BY_TYPE[data.nodeType]
  const inputs = typeDef?.inputs || []
  const outputs = typeDef?.outputs || []

  return (
    <div
      className={`rounded-md border bg-[var(--color-surface)] text-[var(--color-text)] shadow-lg min-w-[230px] px-3 py-2 transition-all duration-200 ${selected ? "border-[var(--color-primary)]" : "border-[var(--color-border)]"} ${data.justConnected ? "ring-2 ring-emerald-400/80 animate-pulse" : ""}`}
    >
      <p className="text-sm font-semibold leading-tight">{data.title || data.label}</p>
      <p className="text-[11px] text-[var(--color-text-muted)] mt-1">{typeDef?.label || data.nodeType}</p>
      <div className="mt-2 space-y-1">
        {inputs.map((input) => (
          <div key={input.id} className="text-[10px] text-[var(--color-text-muted)]">
            In: {input.label}
          </div>
        ))}
        {outputs.map((output) => (
          <div key={output.id} className="text-[10px] text-[var(--color-text-muted)]">
            Out: {output.label}
          </div>
        ))}
      </div>

      {inputs.map((input, index) => (
        <Handle
          key={`in-${input.id}`}
          id={input.id}
          type="target"
          position={Position.Top}
          style={{ left: portLeft(index, inputs.length), width: 10, height: 10 }}
          title={`${input.label} (${input.type})`}
        />
      ))}
      {outputs.map((output, index) => (
        <Handle
          key={`out-${output.id}`}
          id={output.id}
          type="source"
          position={Position.Bottom}
          style={{ left: portLeft(index, outputs.length), width: 10, height: 10 }}
          title={`${output.label} (${output.type})`}
        />
      ))}
    </div>
  )
}
