import { AUTOPILOT_NODE_TYPES_BY_TYPE } from "./nodeTypes"
import { GraphTemplateNode } from "./types"

type NodeEdge = {
  id: string
  source: string
  target: string
}

type NodeInspectorProps = {
  node: GraphTemplateNode | null
  allNodes?: GraphTemplateNode[]
  edges?: NodeEdge[]
  onChange: (node: GraphTemplateNode) => void
  onConnectNodes?: (sourceNodeId: string, targetNodeId: string) => void
  onDeleteEdge?: (edgeId: string) => void
  onTestNode?: () => void
  isTestingNode?: boolean
  testNodeResult?: string
  testNodeError?: string
}

export function NodeInspector({
  node,
  allNodes = [],
  edges = [],
  onChange,
  onConnectNodes,
  onDeleteEdge,
  onTestNode,
  isTestingNode,
  testNodeResult,
  testNodeError,
}: NodeInspectorProps) {
  if (!node) {
    return <p className="text-xs text-[var(--color-text-muted)]">Select a node to edit its settings.</p>
  }

  const nodeTypeDef = AUTOPILOT_NODE_TYPES_BY_TYPE[node.type]
  const fields = nodeTypeDef?.fields || []
  const availableTargets = allNodes.filter((item) => item.id !== node.id)
  const outgoingEdges = edges.filter((edge) => edge.source === node.id)
  const incomingEdges = edges.filter((edge) => edge.target === node.id)

  return (
    <div className="space-y-2">
      <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
        <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">Node</p>
        <p className="text-sm font-medium truncate">{node.title || nodeTypeDef?.label || node.type}</p>
        <p className="text-[11px] text-[var(--color-text-muted)] truncate">{nodeTypeDef?.label || node.type}</p>
      </div>

      <label className="block space-y-1">
        <span className="text-[11px] text-[var(--color-text-muted)]">Title</span>
        <input
          className="h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-sm"
          value={node.title || ""}
          onChange={(event) => onChange({ ...node, title: event.target.value })}
          placeholder="Node title"
        />
      </label>

      <details open className="rounded-md border border-[var(--color-border)]">
        <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-medium text-[var(--color-text-muted)]">
          Settings {fields.length > 0 ? `(${fields.length})` : ""}
        </summary>
        <div className="space-y-2 border-t border-[var(--color-border)] px-3 py-2">
          {fields.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)]">No custom settings for this node.</p>
          ) : null}
          {fields.map((field) => {
            const currentValue = node.config[field.key]
            if (field.type === "boolean") {
              return (
                <label key={field.key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(currentValue)}
                    onChange={(event) => onChange({
                      ...node,
                      config: { ...node.config, [field.key]: event.target.checked },
                    })}
                  />
                  {field.label}
                </label>
              )
            }

            if (Array.isArray(field.ui?.options) && field.ui?.options.length > 0) {
              return (
                <label key={field.key} className="block space-y-1">
                  <span className="text-[11px] text-[var(--color-text-muted)]">{field.label}</span>
                  <select
                    className="h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-sm"
                    value={typeof currentValue === "string" ? currentValue : ""}
                    onChange={(event) => onChange({
                      ...node,
                      config: { ...node.config, [field.key]: event.target.value },
                    })}
                  >
                    <option value="">Select...</option>
                    {field.ui.options.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
              )
            }

            if (field.ui?.multiline) {
              return (
                <label key={field.key} className="block space-y-1">
                  <span className="text-[11px] text-[var(--color-text-muted)]">{field.label}</span>
                  <textarea
                    className="min-h-16 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2 text-sm"
                    value={typeof currentValue === "string" ? currentValue : ""}
                    placeholder={field.ui?.placeholder || ""}
                    onChange={(event) => onChange({
                      ...node,
                      config: { ...node.config, [field.key]: event.target.value },
                    })}
                  />
                </label>
              )
            }

            const isNumber = field.type === "number"
            return (
              <label key={field.key} className="block space-y-1">
                <span className="text-[11px] text-[var(--color-text-muted)]">{field.label}</span>
                <input
                  type={isNumber ? "number" : "text"}
                  className="h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-sm"
                  value={isNumber ? String(currentValue ?? "") : (typeof currentValue === "string" ? currentValue : "")}
                  placeholder={field.ui?.placeholder || ""}
                  onChange={(event) => onChange({
                    ...node,
                    config: {
                      ...node.config,
                      [field.key]: isNumber ? Number(event.target.value || 0) : event.target.value,
                    },
                  })}
                />
              </label>
            )
          })}
        </div>
      </details>

      <details className="rounded-md border border-[var(--color-border)]">
        <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-medium text-[var(--color-text-muted)]">
          Prompt + Notes
        </summary>
        <div className="space-y-2 border-t border-[var(--color-border)] px-3 py-2">
          <div className="space-y-1">
            <p className="text-[11px] text-[var(--color-text-muted)]">Node Prompt</p>
            <textarea
              className="min-h-16 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2 text-sm"
              placeholder="Describe what this node should do..."
              value={typeof node.config.__prompt === "string" ? node.config.__prompt : ""}
              onChange={(event) => onChange({
                ...node,
                config: { ...node.config, __prompt: event.target.value },
              })}
            />
          </div>

          <div className="space-y-1">
            <p className="text-[11px] text-[var(--color-text-muted)]">System Notes</p>
            <textarea
              className="min-h-14 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2 text-sm"
              placeholder="Optional constraints..."
              value={typeof node.config.__system === "string" ? node.config.__system : ""}
              onChange={(event) => onChange({
                ...node,
                config: { ...node.config, __system: event.target.value },
              })}
            />
          </div>
        </div>
      </details>

      <details className="rounded-md border border-[var(--color-border)]">
        <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-medium text-[var(--color-text-muted)]">
          Test Node
        </summary>
        <div className="space-y-2 border-t border-[var(--color-border)] px-3 py-2">
          <div className="space-y-1">
            <p className="text-[11px] text-[var(--color-text-muted)]">Test Input (optional JSON/text)</p>
            <textarea
              className="min-h-14 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2 text-sm"
              placeholder='{"topic":"Example"}'
              value={typeof node.config.__testInput === "string" ? node.config.__testInput : ""}
              onChange={(event) => onChange({
                ...node,
                config: { ...node.config, __testInput: event.target.value },
              })}
            />
          </div>
          {onTestNode ? (
            <>
              <button
                type="button"
                className="h-8 rounded-md border border-[var(--color-border)] px-3 text-xs hover:border-[var(--color-primary)]"
                onClick={onTestNode}
                disabled={Boolean(isTestingNode)}
              >
                {isTestingNode ? "Testing..." : "Run Test"}
              </button>
              {testNodeError ? <p className="text-xs text-red-300">{testNodeError}</p> : null}
              {testNodeResult ? (
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-xs">
                  {testNodeResult}
                </pre>
              ) : null}
            </>
          ) : null}
        </div>
      </details>

      <details open className="rounded-md border border-[var(--color-border)]">
        <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-medium text-[var(--color-text-muted)]">
          Connections ({incomingEdges.length} in / {outgoingEdges.length} out)
        </summary>
        <div className="space-y-2 border-t border-[var(--color-border)] px-3 py-2">
          {onConnectNodes ? (
            <div className="flex gap-2">
              <select
                className="h-8 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs"
                onChange={(event) => {
                  const targetId = event.target.value
                  if (!targetId) return
                  onConnectNodes(node.id, targetId)
                  event.currentTarget.value = ""
                }}
                defaultValue=""
              >
                <option value="">Connect to...</option>
                {availableTargets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.title || target.type}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {outgoingEdges.length > 0 ? (
            <div className="space-y-1">
              {outgoingEdges.map((edge) => {
                const targetNode = allNodes.find((item) => item.id === edge.target)
                return (
                  <div key={edge.id} className="flex items-center justify-between rounded border border-[var(--color-border)] px-2 py-1">
                    <span className="text-xs truncate">{targetNode?.title || targetNode?.type || edge.target}</span>
                    {onDeleteEdge ? (
                      <button
                        type="button"
                        className="text-[11px] text-red-300 hover:text-red-200"
                        onClick={() => onDeleteEdge(edge.id)}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-[var(--color-text-muted)]">No outgoing connections yet.</p>
          )}
        </div>
      </details>
    </div>
  )
}
