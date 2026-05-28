import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react"
import ReactFlow, {
  addEdge,
  Background,
  Connection,
  ConnectionLineType,
  ConnectionMode,
  Controls,
  Edge,
  EdgeTypes,
  NodeTypes,
  MarkerType,
  MiniMap,
  Node,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "reactflow"
import "reactflow/dist/style.css"
import { CheckCircle2, Circle, CircleAlert, Sparkles } from "lucide-react"
import { Button } from "../Button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../Card"
import { NodePalette } from "./NodePalette"
import { NodeInspector } from "./NodeInspector"
import { AUTOPILOT_NODE_TYPES_BY_TYPE } from "./nodeTypes"
import { getWorkflowPresetById, WORKFLOW_PRESETS, type WorkflowPresetId } from "./presetWorkflows"
import { GraphTemplate, GraphTemplateSummary } from "./types"
import { WorkflowEdge } from "./WorkflowEdge"
import { WorkflowNode } from "./WorkflowNode"

type FlowNodeData = {
  label: string
  title: string
  nodeType: string
  config: Record<string, any>
  justConnected?: boolean
}

type TemplateMapEditorProps = {
  projectId: string
  subprojectId?: string
  onRunStarted?: (message: string) => void
}

const FLOW_NODE_TYPES: NodeTypes = {
  workflowNode: WorkflowNode,
}

const FLOW_EDGE_TYPES: EdgeTypes = {
  workflowEdge: WorkflowEdge,
}

const CONNECT_HINT_DISMISSED_KEY = "autopilot_map_hint_connect_dismissed"
const EDGE_DELETE_HINT_DISMISSED_KEY = "autopilot_map_hint_edge_delete_dismissed"

function makeNodeId(): string {
  return `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function getDefaultConfigForType(nodeType: string): Record<string, any> {
  const def = AUTOPILOT_NODE_TYPES_BY_TYPE[nodeType]
  if (!def) return {}
  const config: Record<string, any> = {}
  for (const field of def.fields) {
    if (field.default !== undefined) config[field.key] = field.default
  }
  return config
}

function getFlowNodeStyle(): CSSProperties {
  return {
    background: "var(--color-surface)",
    color: "var(--color-text)",
    border: "1px solid var(--color-border)",
    borderRadius: 10,
    minWidth: 220,
    padding: "10px 12px",
    fontSize: 12,
    boxShadow: "0 6px 16px rgba(0, 0, 0, 0.25)",
  }
}

function getDefaultOutputHandleId(nodeType: string): string {
  return AUTOPILOT_NODE_TYPES_BY_TYPE[nodeType]?.outputs?.[0]?.id || "out"
}

function getDefaultInputHandleId(nodeType: string): string {
  return AUTOPILOT_NODE_TYPES_BY_TYPE[nodeType]?.inputs?.[0]?.id || "in"
}

function isPortTypeCompatible(sourceType?: string, targetType?: string): boolean {
  if (!sourceType || !targetType) return true
  if (sourceType === targetType) return true
  // Keep JSON nodes flexible as a bridge type.
  if (sourceType === "json" || targetType === "json") return true
  return false
}

function hasPath(edges: Edge[], fromId: string, toId: string): boolean {
  const stack = [fromId]
  const visited = new Set<string>()
  while (stack.length > 0) {
    const current = stack.pop()!
    if (current === toId) return true
    if (visited.has(current)) continue
    visited.add(current)
    for (const edge of edges) {
      if (edge.source === current) stack.push(edge.target)
    }
  }
  return false
}

function isRulesetNodeType(nodeType: string): boolean {
  return nodeType.startsWith("Rulesets.")
}

function templateToFlowNodes(template: GraphTemplate): Node<FlowNodeData>[] {
  return template.nodes.map((templateNode) => ({
    id: templateNode.id,
    type: "workflowNode",
    position: templateNode.position,
    data: {
      label: templateNode.title || AUTOPILOT_NODE_TYPES_BY_TYPE[templateNode.type]?.label || templateNode.type,
      title: templateNode.title || AUTOPILOT_NODE_TYPES_BY_TYPE[templateNode.type]?.label || templateNode.type,
      nodeType: templateNode.type,
      config: templateNode.config || {},
    },
    style: getFlowNodeStyle(),
  }))
}

function templateToFlowEdges(template: GraphTemplate): Edge[] {
  return template.edges.map((templateEdge) => ({
    id: templateEdge.id,
    type: "workflowEdge",
    source: templateEdge.from.nodeId,
    sourceHandle: templateEdge.from.portId || "out",
    target: templateEdge.to.nodeId,
    targetHandle: templateEdge.to.portId || "in",
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: "#8b5cf6", strokeWidth: 2.4 },
  }))
}

function flowToTemplatePayload(
  templateId: string,
  projectId: string,
  name: string,
  description: string,
  nodes: Node<FlowNodeData>[],
  edges: Edge[]
) {
  return {
    templateId,
    projectId,
    name,
    description,
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.data.nodeType,
      title: node.data.title,
      position: node.position,
      config: node.data.config || {},
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      from: { nodeId: edge.source, portId: edge.sourceHandle || "out" },
      to: { nodeId: edge.target, portId: edge.targetHandle || "in" },
    })),
  }
}

function TemplateMapEditorCanvas({
  projectId,
  subprojectId,
  onRunStarted,
  templateSummaries,
  setTemplateSummaries,
}: {
  projectId: string
  subprojectId?: string
  onRunStarted?: (message: string) => void
  templateSummaries: GraphTemplateSummary[]
  setTemplateSummaries: (templates: GraphTemplateSummary[]) => void
}) {
  const [selectedTemplateId, setSelectedTemplateId] = useState("")
  const [selectedVersion, setSelectedVersion] = useState<number | "latest">("latest")
  const [templateName, setTemplateName] = useState("")
  const [templateDescription, setTemplateDescription] = useState("")
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [isTestingNode, setIsTestingNode] = useState(false)
  const [isApplyingPreset, setIsApplyingPreset] = useState(false)
  const [editorMode, setEditorMode] = useState<"guided" | "advanced">("guided")
  const [focusMode, setFocusMode] = useState(false)
  const [activeGuidePresetId, setActiveGuidePresetId] = useState<WorkflowPresetId | null>(null)
  const [showConnectHint, setShowConnectHint] = useState(() => {
    if (typeof window === "undefined") return true
    return window.localStorage.getItem(CONNECT_HINT_DISMISSED_KEY) !== "1"
  })
  const [showEdgeDeleteHint, setShowEdgeDeleteHint] = useState(() => {
    if (typeof window === "undefined") return true
    return window.localStorage.getItem(EDGE_DELETE_HINT_DISMISSED_KEY) !== "1"
  })
  const [testNodeResult, setTestNodeResult] = useState("")
  const [testNodeError, setTestNodeError] = useState("")
  const [connectionNotice, setConnectionNotice] = useState("")
  const [error, setError] = useState("")
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const connectionStartRef = useRef<{ nodeId: string; handleId?: string; handleType?: "source" | "target" } | null>(null)
  const { screenToFlowPosition } = useReactFlow()
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNodeData>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  const deleteEdgeById = useCallback((edgeId: string) => {
    setEdges((currentEdges) => currentEdges.filter((edge) => edge.id !== edgeId))
  }, [setEdges])

  const selectedTemplateSummary = useMemo(
    () => templateSummaries.find((template) => template.templateId === selectedTemplateId) || null,
    [templateSummaries, selectedTemplateId]
  )
  const activeGuidePreset = useMemo(
    () => (activeGuidePresetId ? getWorkflowPresetById(activeGuidePresetId) : null),
    [activeGuidePresetId]
  )
  const memoizedNodeTypes = useMemo(() => FLOW_NODE_TYPES, [])
  const memoizedEdgeTypes = useMemo(() => FLOW_EDGE_TYPES, [])
  const showAdvancedSidePanels = editorMode === "advanced" && !focusMode

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null
    const node = nodes.find((item) => item.id === selectedNodeId)
    if (!node) return null
    return {
      id: node.id,
      type: node.data.nodeType,
      title: node.data.title,
      position: node.position,
      config: node.data.config || {},
    }
  }, [nodes, selectedNodeId])

  const templateNodesForInspector = useMemo(
    () => nodes.map((node) => ({
      id: node.id,
      type: node.data.nodeType,
      title: node.data.title,
      position: node.position,
      config: node.data.config || {},
    })),
    [nodes]
  )

  const getIncomingNodes = useCallback((nodeId: string) => {
    const incoming = edges.filter((edge) => edge.target === nodeId)
    return incoming
      .map((edge) => nodes.find((node) => node.id === edge.source))
      .filter((node): node is Node<FlowNodeData> => Boolean(node))
  }, [edges, nodes])

  const getConnectedRulesForNode = useCallback((nodeId: string) => {
    const incomingNodes = getIncomingNodes(nodeId)
    return incomingNodes.filter((node) => isRulesetNodeType(node.data.nodeType))
  }, [getIncomingNodes])

  const scriptNodesMissingRules = useMemo(
    () => nodes.filter((node) => node.data.nodeType === "ManuscriptWriter.ScriptDraft" && getConnectedRulesForNode(node.id).length === 0),
    [nodes, getConnectedRulesForNode]
  )
  const readinessChecks = useMemo(
    () => [
      { id: "template", label: "Template selected", ok: Boolean(selectedTemplateId), hint: "Choose a template or apply a preset." },
      { id: "nodes", label: "Workflow has nodes", ok: nodes.length > 0, hint: "Add nodes to the map first." },
      { id: "edges", label: "Nodes are connected", ok: edges.length > 0, hint: "Create at least one connection between nodes." },
      { id: "rules", label: "Script rules connected", ok: scriptNodesMissingRules.length === 0, hint: "Connect a Rulesets node into each Script Draft node." },
    ],
    [selectedTemplateId, nodes.length, edges.length, scriptNodesMissingRules.length]
  )
  const firstReadinessBlocker = readinessChecks.find((item) => !item.ok) || null
  const canRunWorkflow = Boolean(selectedTemplateId) && !isRunning && !firstReadinessBlocker

  const loadTemplate = useCallback(async (templateId: string, version: number | "latest") => {
    setIsLoadingTemplate(true)
    setError("")
    try {
      const query = new URLSearchParams({ projectId })
      if (subprojectId) query.set("subprojectId", subprojectId)
      if (version !== "latest") query.set("version", String(version))
      const response = await fetch(`/api/autopilot/graphs/templates/${templateId}?${query.toString()}`)
      if (!response.ok) {
        throw new Error(await response.text().catch(() => "Failed to load template"))
      }
      const template = await response.json() as GraphTemplate
      setTemplateName(template.name)
      setTemplateDescription(template.description || "")
      setNodes(templateToFlowNodes(template))
      setEdges(templateToFlowEdges(template).map((edge) => ({
        ...edge,
        data: { ...(edge.data || {}), onDeleteEdge: deleteEdgeById },
      })))
      setSelectedNodeId(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load template")
    } finally {
      setIsLoadingTemplate(false)
    }
  }, [projectId, setEdges, setNodes, subprojectId, deleteEdgeById])

  const refreshTemplates = useCallback(async () => {
    const query = new URLSearchParams({ projectId })
    if (subprojectId) query.set("subprojectId", subprojectId)
    const response = await fetch(`/api/autopilot/graphs/templates?${query.toString()}`)
    if (!response.ok) return
    const data = await response.json()
    setTemplateSummaries(Array.isArray(data) ? data as GraphTemplateSummary[] : [])
  }, [projectId, setTemplateSummaries, subprojectId])

  useEffect(() => {
    if (!templateSummaries.length) {
      setSelectedTemplateId("")
      setSelectedVersion("latest")
      setTemplateName("")
      setTemplateDescription("")
      setNodes([])
      setEdges([])
      return
    }
    const exists = templateSummaries.some((template) => template.templateId === selectedTemplateId)
    if (!selectedTemplateId || !exists) {
      setSelectedTemplateId(templateSummaries[0].templateId)
      setSelectedVersion("latest")
      return
    }
    loadTemplate(selectedTemplateId, selectedVersion).catch(console.error)
  }, [templateSummaries, selectedTemplateId, selectedVersion, loadTemplate, setEdges, setNodes])

  const addNode = useCallback((nodeType: string, position?: { x: number; y: number }) => {
    const def = AUTOPILOT_NODE_TYPES_BY_TYPE[nodeType]
    const node: Node<FlowNodeData> = {
      id: makeNodeId(),
      type: "workflowNode",
      position: position || { x: 150 + Math.random() * 220, y: 140 + Math.random() * 180 },
      data: {
        label: def?.label || nodeType,
        title: def?.label || nodeType,
        nodeType,
        config: getDefaultConfigForType(nodeType),
      },
      style: getFlowNodeStyle(),
    }
    setNodes((currentNodes) => [...currentNodes, node])
  }, [setNodes])

  const pulseConnectedNodes = useCallback((sourceNodeId: string, targetNodeId: string) => {
    const highlightIds = new Set([sourceNodeId, targetNodeId])
    setNodes((currentNodes) => currentNodes.map((node) => (
      highlightIds.has(node.id)
        ? { ...node, data: { ...node.data, justConnected: true } }
        : node
    )))
    window.setTimeout(() => {
      setNodes((currentNodes) => currentNodes.map((node) => (
        highlightIds.has(node.id)
          ? { ...node, data: { ...node.data, justConnected: false } }
          : node
      )))
    }, 1600)
  }, [setNodes])

  const findNearestTargetNode = useCallback((sourceNodeId: string, x: number, y: number) => {
    let closest: Node<FlowNodeData> | null = null
    let closestDistance = Number.POSITIVE_INFINITY
    for (const node of nodes) {
      if (node.id === sourceNodeId) continue
      const centerX = node.position.x + Number(node.width || 220) / 2
      const centerY = node.position.y + Number(node.height || 120) / 2
      const dx = centerX - x
      const dy = centerY - y
      const distance = Math.sqrt(dx * dx + dy * dy)
      if (distance < closestDistance) {
        closestDistance = distance
        closest = node
      }
    }
    return closestDistance <= 260 ? closest : null
  }, [nodes])

  const connectNodes = useCallback(
    (
      sourceNodeId: string,
      targetNodeId: string,
      sourceHandle = "out",
      targetHandle = "in"
    ) => {
      const sourceNode = nodes.find((node) => node.id === sourceNodeId)
      const targetNode = nodes.find((node) => node.id === targetNodeId)
      if (!sourceNode || !targetNode) {
        setError("Could not connect nodes: missing source or target.")
        return
      }

      if (sourceNodeId === targetNodeId) {
        setError("Cannot connect a node to itself.")
        return
      }

      const sourceTypeDef = AUTOPILOT_NODE_TYPES_BY_TYPE[sourceNode.data.nodeType]
      const targetTypeDef = AUTOPILOT_NODE_TYPES_BY_TYPE[targetNode.data.nodeType]
      const sourcePort = sourceTypeDef?.outputs[0]?.type
      const targetPort = targetTypeDef?.inputs[0]?.type
      if (!isPortTypeCompatible(sourcePort, targetPort)) {
        setError(
          `Port mismatch: ${sourceTypeDef?.label || sourceNode.data.nodeType} output (${sourcePort || "unknown"}) cannot connect to ${targetTypeDef?.label || targetNode.data.nodeType} input (${targetPort || "unknown"}).`
        )
        return
      }

      setEdges((currentEdges) => {
        if (currentEdges.some((edge) => edge.source === sourceNodeId && edge.target === targetNodeId)) {
          setError("These nodes are already connected.")
          return currentEdges
        }

        if (hasPath(currentEdges, targetNodeId, sourceNodeId)) {
          setError("This connection would create a cycle. Keep workflows directional.")
          return currentEdges
        }

        setError("")
        setConnectionNotice(`Connected ${sourceNode.data.title} -> ${targetNode.data.title}`)
        pulseConnectedNodes(sourceNodeId, targetNodeId)
        const edgeId = `edge-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        window.setTimeout(() => {
          setEdges((liveEdges) => liveEdges.map((edge) => (
            edge.id === edgeId
              ? {
                ...edge,
                style: { stroke: "#8b5cf6", strokeWidth: 2.4 },
              }
              : edge
          )))
        }, 1500)
        return addEdge(
          {
            type: "workflowEdge",
            source: sourceNodeId,
            sourceHandle,
            target: targetNodeId,
            targetHandle,
            id: edgeId,
            markerEnd: { type: MarkerType.ArrowClosed },
            animated: true,
            style: { stroke: "#10b981", strokeWidth: 3.4 },
            data: { onDeleteEdge: deleteEdgeById },
          },
          currentEdges
        )
      })
    },
    [nodes, pulseConnectedNodes, setEdges, deleteEdgeById]
  )

  useEffect(() => {
    setTestNodeResult("")
    setTestNodeError("")
  }, [selectedNodeId])

  useEffect(() => {
    if (edges.length === 0 || !showConnectHint) return
    setShowConnectHint(false)
    if (typeof window !== "undefined") {
      window.localStorage.setItem(CONNECT_HINT_DISMISSED_KEY, "1")
    }
  }, [edges.length, showConnectHint])

  useEffect(() => {
    if (!connectionNotice) return
    const timeout = setTimeout(() => setConnectionNotice(""), 2400)
    return () => clearTimeout(timeout)
  }, [connectionNotice])

  const dismissEdgeDeleteHint = useCallback(() => {
    setShowEdgeDeleteHint(false)
    if (typeof window !== "undefined") {
      window.localStorage.setItem(EDGE_DELETE_HINT_DISMISSED_KEY, "1")
    }
  }, [])

  const handleEdgesChange = useCallback((changes: any[]) => {
    onEdgesChange(changes)
    if (!showEdgeDeleteHint) return
    const selectedEdge = changes.some((change) => change?.type === "select" && change?.selected === true)
    if (selectedEdge) {
      dismissEdgeDeleteHint()
    }
  }, [onEdgesChange, showEdgeDeleteHint, dismissEdgeDeleteHint])

  const onDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const nodeType = event.dataTransfer.getData("application/x-autopilot-node-type")
    if (!nodeType) return
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })
    addNode(nodeType, position)
  }, [addNode, screenToFlowPosition])

  const createTemplate = useCallback(async () => {
    const proposedName = window.prompt("Template name", templateName || "Autopilot workflow")
    if (!proposedName || !proposedName.trim()) return
    setIsSaving(true)
    setError("")
    try {
      const payload = flowToTemplatePayload("temp", projectId, proposedName.trim(), templateDescription, nodes, edges)
      const response = await fetch("/api/autopilot/graphs/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          subprojectId,
          name: payload.name,
          description: payload.description,
          nodes: payload.nodes,
          edges: payload.edges,
        }),
      })
      if (!response.ok) {
        throw new Error(await response.text().catch(() => "Failed to create template"))
      }
      const created = await response.json() as GraphTemplate
      await refreshTemplates()
      setSelectedTemplateId(created.templateId)
      setSelectedVersion(created.version)
      setTemplateName(created.name)
      setTemplateDescription(created.description || "")
      onRunStarted?.(`Template "${created.name}" saved as v${created.version}.`)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to create template")
    } finally {
      setIsSaving(false)
    }
  }, [projectId, subprojectId, templateName, templateDescription, nodes, edges, refreshTemplates, onRunStarted])

  const saveVersion = useCallback(async () => {
    if (!selectedTemplateId) return
    setIsSaving(true)
    setError("")
    try {
      const payload = flowToTemplatePayload(
        selectedTemplateId,
        projectId,
        templateName || "Untitled Workflow",
        templateDescription,
        nodes,
        edges
      )
      const response = await fetch(`/api/autopilot/graphs/templates/${selectedTemplateId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, subprojectId }),
      })
      if (!response.ok) {
        throw new Error(await response.text().catch(() => "Failed to save version"))
      }
      const created = await response.json() as GraphTemplate
      await refreshTemplates()
      setSelectedVersion(created.version)
      onRunStarted?.(`Saved ${created.name} as v${created.version}.`)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save version")
    } finally {
      setIsSaving(false)
    }
  }, [selectedTemplateId, projectId, subprojectId, templateName, templateDescription, nodes, edges, refreshTemplates, onRunStarted])

  const runWorkflow = useCallback(async () => {
    if (!selectedTemplateId) return
    setIsRunning(true)
    setError("")
    try {
      const scriptNodes = nodes.filter((node) => node.data.nodeType === "ManuscriptWriter.ScriptDraft")
      const missingRules = scriptNodes.filter((node) => getConnectedRulesForNode(node.id).length === 0)
      if (missingRules.length > 0) {
        const names = missingRules.map((node) => node.data.title || node.id).join(", ")
        setError(`Ruleset required: connect at least one Rulesets node into Script Draft node(s): ${names}`)
        return
      }
      const resolvedVersion = selectedVersion === "latest"
        ? selectedTemplateSummary?.latestVersion
        : selectedVersion
      const response = await fetch("/api/autopilot/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          subprojectId,
          topic: templateName || "Template workflow run",
          templateId: selectedTemplateId,
          templateVersion: resolvedVersion,
          autoApprovePlan: true,
        }),
      })
      if (!response.ok) {
        throw new Error(await response.text().catch(() => "Failed to start run"))
      }
      onRunStarted?.(`Run started from ${selectedTemplateId} (v${resolvedVersion || "latest"}).`)
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Failed to start run")
    } finally {
      setIsRunning(false)
    }
  }, [selectedTemplateId, nodes, getConnectedRulesForNode, selectedVersion, selectedTemplateSummary, projectId, subprojectId, templateName, onRunStarted])

  const applyPresetTemplate = useCallback(async (presetId: WorkflowPresetId) => {
    const preset = getWorkflowPresetById(presetId)
    if (!preset) return
    setIsApplyingPreset(true)
    setError("")
    try {
      const response = await fetch("/api/autopilot/graphs/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          subprojectId,
          name: preset.templateName,
          description: preset.description,
          nodes: preset.nodes,
          edges: preset.edges,
          tags: ["preset", "youtube", preset.id],
        }),
      })
      if (!response.ok) {
        throw new Error(await response.text().catch(() => "Failed to apply preset template"))
      }
      const created = await response.json() as GraphTemplate
      await refreshTemplates()
      setSelectedTemplateId(created.templateId)
      setSelectedVersion(created.version)
      setTemplateName(created.name)
      setTemplateDescription(created.description || "")
      setNodes(templateToFlowNodes(created))
      setEdges(templateToFlowEdges(created).map((edge) => ({
        ...edge,
        data: { ...(edge.data || {}), onDeleteEdge: deleteEdgeById },
      })))
      setActiveGuidePresetId(preset.id)
      onRunStarted?.(`Applied preset: ${preset.title}. Review setup guide and run when ready.`)
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "Failed to apply preset")
    } finally {
      setIsApplyingPreset(false)
    }
  }, [projectId, subprojectId, refreshTemplates, deleteEdgeById, onRunStarted, setEdges, setNodes])

  const testSelectedNode = useCallback(async () => {
    if (!selectedNode) return
    const incomingNodes = getIncomingNodes(selectedNode.id)
    const connectedRules = incomingNodes.filter((node) => isRulesetNodeType(node.data.nodeType))
    if (selectedNode.type === "ManuscriptWriter.ScriptDraft" && connectedRules.length === 0) {
      setTestNodeError("Script Draft requires at least one connected Rulesets node.")
      setTestNodeResult("")
      return
    }
    const upstreamContext = incomingNodes.map((node) => ({
      id: node.id,
      nodeType: node.data.nodeType,
      title: node.data.title,
      config: node.data.config || {},
    }))
    setIsTestingNode(true)
    setTestNodeError("")
    setTestNodeResult("")
    try {
      const response = await fetch("/api/autopilot/graphs/test-node", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          nodeType: selectedNode.type,
          nodeTitle: selectedNode.title,
          config: selectedNode.config,
          upstreamContext,
          resolvedRules: connectedRules.map((node) => ({
            id: node.id,
            title: node.data.title,
            nodeType: node.data.nodeType,
            config: node.data.config || {},
          })),
        }),
      })
      if (!response.ok) {
        throw new Error(await response.text().catch(() => "Node test failed"))
      }
      const payload = await response.json() as { output?: string; model?: string; promptPreview?: string }
      const output = typeof payload.output === "string" ? payload.output : JSON.stringify(payload, null, 2)
      setTestNodeResult(output)
    } catch (testError) {
      setTestNodeError(testError instanceof Error ? testError.message : "Node test failed")
    } finally {
      setIsTestingNode(false)
    }
  }, [projectId, selectedNode, getIncomingNodes])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant={editorMode === "guided" ? "default" : "outline"} onClick={() => setEditorMode("guided")}>
          Guided Build
        </Button>
        <Button variant={editorMode === "advanced" ? "default" : "outline"} onClick={() => setEditorMode("advanced")}>
          Advanced Builder
        </Button>
        <Button variant="outline" onClick={() => setFocusMode((prev) => !prev)}>
          {focusMode ? "Exit Focus Map" : "Focus Map"}
        </Button>
      </div>

      {editorMode === "guided" ? (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-start gap-2">
              <Sparkles className="w-4 h-4 mt-0.5 text-emerald-300" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Guided flow</p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  1) Apply preset or choose template, 2) verify readiness, 3) run workflow.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Workflow Templates</CardTitle>
          <CardDescription>Choose a template version, edit graph, and launch a run.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 lg:grid-cols-12 gap-2">
          <div className="lg:col-span-12 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Workflow readiness</p>
            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
              {readinessChecks.map((check) => (
                <div
                  key={check.id}
                  className={`rounded border px-2 py-1.5 text-xs ${check.ok ? "border-emerald-400/40 bg-emerald-950/25 text-emerald-200" : "border-amber-400/40 bg-amber-950/25 text-amber-200"}`}
                >
                  <span className="inline-flex items-center gap-1">
                    {check.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <CircleAlert className="w-3.5 h-3.5" />}
                    {check.label}
                  </span>
                </div>
              ))}
            </div>
            {firstReadinessBlocker ? (
              <p className="mt-2 text-xs text-amber-300">Run blocked: {firstReadinessBlocker.hint}</p>
            ) : (
              <p className="mt-2 text-xs text-emerald-300">Ready to run.</p>
            )}
          </div>

          <div className="lg:col-span-12 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3 space-y-2">
            <p className="text-sm font-medium">Quick Start Presets</p>
            <p className="text-xs text-[var(--color-text-muted)]">
              Choose a creator-optimized template. We auto-generate the full graph and show guided setup.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {WORKFLOW_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`rounded-md border px-3 py-2 text-left transition-colors ${activeGuidePresetId === preset.id ? "border-[var(--color-primary)] bg-[var(--color-surface-hover)]" : "border-[var(--color-border)] hover:border-[var(--color-primary)]"}`}
                  onClick={() => applyPresetTemplate(preset.id).catch(console.error)}
                  disabled={isApplyingPreset || isSaving}
                >
                  <p className="text-sm font-semibold">{preset.title}</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">{preset.subtitle}</p>
                </button>
              ))}
            </div>
            {activeGuidePreset ? (
              <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  Guided setup: {activeGuidePreset.title}
                </p>
                <ol className="mt-2 space-y-1 text-xs text-[var(--color-text-muted)] list-decimal pl-4">
                  {activeGuidePreset.guidance.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </div>
            ) : null}
          </div>
          <select
            className="h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 lg:col-span-4"
            value={selectedTemplateId}
            onChange={(event) => {
              setSelectedTemplateId(event.target.value)
              setSelectedVersion("latest")
            }}
          >
            <option value="">Select template</option>
            {templateSummaries.map((template) => (
              <option key={template.templateId} value={template.templateId}>
                {template.name}
              </option>
            ))}
          </select>
          <select
            className="h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 lg:col-span-2"
            value={String(selectedVersion)}
            onChange={(event) => {
              const next = event.target.value
              setSelectedVersion(next === "latest" ? "latest" : Number(next))
            }}
            disabled={!selectedTemplateSummary}
          >
            <option value="latest">Latest</option>
            {(selectedTemplateSummary?.versions || []).map((version) => (
              <option key={version} value={version}>v{version}</option>
            ))}
          </select>
          <input
            className="h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 lg:col-span-3"
            value={templateName}
            onChange={(event) => setTemplateName(event.target.value)}
            placeholder="Template name"
          />
          <div className="flex gap-2 lg:col-span-3">
            <Button variant="outline" onClick={() => createTemplate().catch(console.error)} disabled={isSaving}>
              {isSaving ? "Saving..." : "New Template"}
            </Button>
            <Button variant="secondary" onClick={() => saveVersion().catch(console.error)} disabled={!selectedTemplateId || isSaving}>
              Save Version
            </Button>
            <Button
              onClick={() => runWorkflow().catch(console.error)}
              disabled={!canRunWorkflow}
              title={firstReadinessBlocker?.hint || "Start workflow run"}
            >
              {isRunning ? "Starting..." : "Run Workflow"}
            </Button>
          </div>
          <textarea
            className="min-h-20 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 lg:col-span-12"
            value={templateDescription}
            onChange={(event) => setTemplateDescription(event.target.value)}
            placeholder="Template description"
          />
          {error ? <p className="text-sm text-red-400 lg:col-span-12">{error}</p> : null}
          {connectionNotice ? (
            <p className="text-sm text-emerald-300 lg:col-span-12 inline-flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" />
              {connectionNotice}
            </p>
          ) : null}
          {isLoadingTemplate ? <p className="text-xs text-[var(--color-text-muted)] lg:col-span-12">Loading template...</p> : null}
        </CardContent>
      </Card>

      <div className={`grid grid-cols-1 gap-3 min-h-[860px] ${showAdvancedSidePanels ? "xl:grid-cols-[260px_minmax(0,1fr)_320px]" : ""}`}>
        {showAdvancedSidePanels ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Node Palette</CardTitle>
            </CardHeader>
            <CardContent>
              <NodePalette onAddNode={addNode} />
            </CardContent>
          </Card>
        ) : null}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Map Editor</CardTitle>
            <CardDescription>
              Drag/drop nodes and connect edges. {edges.length > 0 ? `Connected: ${edges.length} link${edges.length === 1 ? "" : "s"}.` : "No links yet."}
              {!showAdvancedSidePanels ? " Switch to Advanced Builder for palette and inspector." : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[780px] p-0 relative">
            {showConnectHint ? (
              <div className="absolute top-2 left-2 z-20 rounded-md border border-sky-400/40 bg-sky-950/80 text-sky-100 px-3 py-1.5 text-xs shadow-lg">
                <div className="flex items-center gap-2">
                  <Circle className="w-3.5 h-3.5" />
                  Drag from a node handle and release near another node to auto-connect.
                </div>
              </div>
            ) : null}
            {connectionNotice ? (
              <div className="absolute top-2 right-2 z-20 pointer-events-none rounded-md border border-emerald-400/40 bg-emerald-900/80 text-emerald-100 px-3 py-1.5 text-xs shadow-lg">
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Connection saved
                </span>
              </div>
            ) : null}
            {showEdgeDeleteHint && edges.length > 0 ? (
              <div className="absolute bottom-2 left-2 z-20 rounded-md border border-violet-400/40 bg-violet-950/80 text-violet-100 px-3 py-1.5 text-xs shadow-lg">
                <div className="flex items-center gap-2">
                  Click a connection line to reveal the X delete button.
                  <button
                    type="button"
                    className="underline"
                    onClick={dismissEdgeDeleteHint}
                  >
                    Hide
                  </button>
                </div>
              </div>
            ) : null}
            <div className="h-full w-full" onDrop={onDrop} onDragOver={(event) => event.preventDefault()}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={handleEdgesChange}
                onConnect={(connection: Connection) => {
                  if (!connection.source || !connection.target) {
                    setError("Invalid connection.")
                    return
                  }
                  const sourceNode = nodes.find((node) => node.id === connection.source)
                  const targetNode = nodes.find((node) => node.id === connection.target)
                  connectNodes(
                    connection.source,
                    connection.target,
                    connection.sourceHandle || getDefaultOutputHandleId(sourceNode?.data.nodeType || ""),
                    connection.targetHandle || getDefaultInputHandleId(targetNode?.data.nodeType || "")
                  )
                }}
                onConnectStart={(_, params) => {
                  connectionStartRef.current = {
                    nodeId: params.nodeId || "",
                    handleId: params.handleId || undefined,
                    handleType: params.handleType || undefined,
                  }
                }}
                onConnectEnd={(event) => {
                  const started = connectionStartRef.current
                  connectionStartRef.current = null
                  if (!started?.nodeId || started.handleType !== "source") return
                  const targetElement = event.target as HTMLElement | null
                  if (targetElement?.closest?.(".react-flow__handle")) return
                  const point = "changedTouches" in event ? event.changedTouches[0] : event
                  const flowPoint = screenToFlowPosition({ x: point.clientX, y: point.clientY })
                  const targetNode = findNearestTargetNode(started.nodeId, flowPoint.x, flowPoint.y)
                  if (!targetNode) return
                  const sourceNode = nodes.find((node) => node.id === started.nodeId)
                  connectNodes(
                    started.nodeId,
                    targetNode.id,
                    started.handleId || getDefaultOutputHandleId(sourceNode?.data.nodeType || ""),
                    getDefaultInputHandleId(targetNode.data.nodeType || "")
                  )
                }}
                connectionRadius={220}
                onNodeClick={(_, node) => setSelectedNodeId(node.id)}
                nodeTypes={memoizedNodeTypes}
                edgeTypes={memoizedEdgeTypes}
                connectionMode={ConnectionMode.Loose}
                connectionLineType={ConnectionLineType.SmoothStep}
                connectionLineStyle={{
                  stroke: "#22c55e",
                  strokeWidth: 3,
                  strokeDasharray: "8 6",
                }}
                autoPanOnConnect
                fitView
              >
                <MiniMap />
                <Controls />
                <Background />
              </ReactFlow>
            </div>
          </CardContent>
        </Card>
        {showAdvancedSidePanels ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Inspector</CardTitle>
            </CardHeader>
            <CardContent>
              <NodeInspector
                node={selectedNode}
                allNodes={templateNodesForInspector}
                edges={edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target }))}
                onChange={(updatedNode) => {
                  setNodes((currentNodes) => currentNodes.map((node) => node.id === updatedNode.id
                    ? {
                      ...node,
                      data: {
                        ...node.data,
                        label: updatedNode.title || node.data.nodeType,
                        title: updatedNode.title || node.data.nodeType,
                        config: updatedNode.config,
                      },
                    }
                    : node
                  ))
                }}
                onConnectNodes={(sourceNodeId, targetNodeId) => {
                  const sourceNode = nodes.find((node) => node.id === sourceNodeId)
                  const targetNode = nodes.find((node) => node.id === targetNodeId)
                  connectNodes(
                    sourceNodeId,
                    targetNodeId,
                    getDefaultOutputHandleId(sourceNode?.data.nodeType || ""),
                    getDefaultInputHandleId(targetNode?.data.nodeType || "")
                  )
                }}
                onDeleteEdge={(edgeId) => {
                  deleteEdgeById(edgeId)
                }}
                onTestNode={testSelectedNode}
                isTestingNode={isTestingNode}
                testNodeResult={testNodeResult}
                testNodeError={testNodeError}
              />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}

export function AutopilotTemplateMapEditor({ projectId, subprojectId, onRunStarted }: TemplateMapEditorProps) {
  const [templateSummaries, setTemplateSummaries] = useState<GraphTemplateSummary[]>([])

  useEffect(() => {
    if (!projectId) {
      setTemplateSummaries([])
      return
    }
    const query = new URLSearchParams({ projectId })
    if (subprojectId) query.set("subprojectId", subprojectId)
    fetch(`/api/autopilot/graphs/templates?${query.toString()}`)
      .then((response) => response.ok ? response.json() : [])
      .then((data) => setTemplateSummaries(Array.isArray(data) ? data as GraphTemplateSummary[] : []))
      .catch(() => setTemplateSummaries([]))
  }, [projectId, subprojectId])

  if (!projectId) {
    return (
      <Card>
        <CardContent className="pt-5">
          <p className="text-sm text-[var(--color-text-muted)]">Select a project to open the map editor.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <ReactFlowProvider>
      <TemplateMapEditorCanvas
        projectId={projectId}
        subprojectId={subprojectId}
        onRunStarted={onRunStarted}
        templateSummaries={templateSummaries}
        setTemplateSummaries={setTemplateSummaries}
      />
    </ReactFlowProvider>
  )
}
