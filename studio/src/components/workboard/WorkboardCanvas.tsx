// ============================================================
// DNK AI Studio - Workboard Canvas (Phase 2)
// ------------------------------------------------------------
// A Buzzy-style infinite node canvas for a StoryBase's casting.
// Built on the already-installed React Flow 11 — this component
// mounts its OWN <ReactFlowProvider> and its OWN node registry,
// completely separate from the Autopilot graph editor (two
// providers = two isolated stores, no context/store collision).
//
// - Dark dotted-grid background (<Background variant="dots">)
// - Default bezier edges
// - Every casting element (characters/objects/scenery/atmospheres)
//   renders as a draggable <CastingNode> wrapping the shared card.
// - Graph (node ids + positions + edges) persists per StoryBase via
//   /api/workboard/:storyBaseId. Images stay under /api/casting/:type.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
} from "reactflow"
import "reactflow/dist/style.css"
import { Loader2, Save, Check } from "lucide-react"
import { CastingNode, VARIATION_COUNT, type CastingNodeData } from "./CastingNode"
import {
  VariationGridNode,
  type VariationGridNodeData,
  type VariationCell,
} from "./VariationGridNode"
import { CanonicalShotNode, type CanonicalShotNodeData } from "./CanonicalShotNode"
import { buildElementPrompt, type CastingElement, type CastingType } from "../CastingCard"
import type { ImageryStyle } from "@/types/StudioMode"

interface StoryBaseLike {
  id: string
  name: string
  characters: CastingElement[]
  objects: CastingElement[]
  environments: CastingElement[]
  atmospheres: CastingElement[]
  imageryStyleId: string | null
}

interface WorkboardCanvasProps {
  storyBase: StoryBaseLike
  availableStyles: ImageryStyle[]
  onStoryBaseUpdated: (storyBase: StoryBaseLike) => void
  model?: string
}

const SECTIONS: { type: CastingType; singular: string }[] = [
  { type: "characters", singular: "character" },
  { type: "objects", singular: "object" },
  { type: "environments", singular: "environment" },
  { type: "atmospheres", singular: "atmosphere" },
]

// Node id derived deterministically from casting type + element id, so a
// saved position always re-attaches to the right element on reload.
const nodeId = (type: CastingType, elementId: string) => `${type}:${elementId}`

const COL_WIDTH = 250
const ROW_HEIGHT = 380
const COLS_PER_ROW = 5

// Deterministic auto-layout: one band per casting type, wrapping at COLS_PER_ROW.
function autoLayout(indexWithinType: number, sectionIndex: number) {
  const col = indexWithinType % COLS_PER_ROW
  const rowInBand = Math.floor(indexWithinType / COLS_PER_ROW)
  return {
    x: col * COL_WIDTH,
    y: sectionIndex * ROW_HEIGHT + rowInBand * ROW_HEIGHT,
  }
}

const FLOW_NODE_TYPES: NodeTypes = {
  castingNode: CastingNode,
  variationGrid: VariationGridNode,
  canonicalShot: CanonicalShotNode,
}

// A generic node union for the mixed-type graph.
type WBNodeData = CastingNodeData | VariationGridNodeData | CanonicalShotNodeData
type WBNode = Node<WBNodeData>

// Node-id builders for the Phase-3 node types (deterministic prefix so the
// loader can tell them apart from casting nodes on reload).
const variationGridId = (elementId: string, ts: number) => `vargrid:${elementId}:${ts}`
const canonicalShotId = (elementId: string, ts: number) => `shot:${elementId}:${ts}`

// Strip function-valued fields so node.data is JSON-serializable for persistence.
function serializableData(data: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === "function") continue
    out[k] = v
  }
  return out
}

function WorkboardFlow({
  storyBase,
  availableStyles,
  onStoryBaseUpdated,
  model,
}: WorkboardCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<WBNodeData>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [isLoading, setIsLoading] = useState(true)
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle")

  const memoNodeTypes = useMemo(() => FLOW_NODE_TYPES, [])

  // Latest nodes/edges in refs so async generation callbacks always persist the
  // freshest graph (they capture the graph at spawn time otherwise).
  const nodesRef = useRef<WBNode[]>([])
  const edgesRef = useRef<Edge[]>([])
  useEffect(() => {
    nodesRef.current = nodes as WBNode[]
  }, [nodes])
  useEffect(() => {
    edgesRef.current = edges
  }, [edges])

  // Stable indirection: node data holds these thin wrappers (stable identity),
  // which dispatch to the real implementations defined below. This keeps node
  // data serializable-stable and avoids reference-before-definition ordering.
  const handlersRef = useRef<{
    generateVariations: (sourceNodeId: string, type: CastingType, element: CastingElement) => void
    pickCell: (gridNodeId: string, cellIndex: number, image: string) => void
  }>({ generateVariations: () => {}, pickCell: () => {} })

  const stableGenerateVariations = useCallback(
    (sourceNodeId: string, type: CastingType, element: CastingElement) =>
      handlersRef.current.generateVariations(sourceNodeId, type, element),
    []
  )
  const stablePickCell = useCallback(
    (gridNodeId: string, cellIndex: number, image: string) =>
      handlersRef.current.pickCell(gridNodeId, cellIndex, image),
    []
  )

  const activeStyle = useMemo(
    () =>
      storyBase.imageryStyleId
        ? availableStyles.find((s) => s.id === storyBase.imageryStyleId) || null
        : null,
    [storyBase.imageryStyleId, availableStyles]
  )

  // Keep the freshest storyBase in a ref so node callbacks never go stale
  // without forcing a full node rebuild (which would drop drag positions).
  const storyBaseRef = useRef(storyBase)
  useEffect(() => {
    storyBaseRef.current = storyBase
  }, [storyBase])

  // When an element's image is (re)generated + persisted: update the node's
  // data in place AND bubble the change up so the grid view stays in sync.
  const handleGenerated = useCallback(
    (type: CastingType, updated: CastingElement) => {
      setNodes((current) =>
        current.map((n) =>
          n.id === nodeId(type, updated.id)
            ? { ...n, data: { ...(n.data as CastingNodeData), element: updated } }
            : n
        )
      )
      const sb = storyBaseRef.current
      onStoryBaseUpdated({
        ...sb,
        [type]: sb[type].map((e) => (e.id === updated.id ? updated : e)),
      })
    },
    [onStoryBaseUpdated, setNodes]
  )

  // Build the node set from casting elements, overlaying any saved positions.
  useEffect(() => {
    let cancelled = false
    setIsLoading(true)

    fetch(`/api/workboard/${storyBase.id}`)
      .then((r) => (r.ok ? r.json() : { nodes: [], edges: [] }))
      .catch(() => ({ nodes: [], edges: [] }))
      .then(
        (graph: {
          nodes?: { id: string; position: { x: number; y: number }; type?: string; data?: any }[]
          edges?: Edge[]
        }) => {
          if (cancelled) return
          const savedNodes = graph.nodes || []
          const savedPos = new Map(savedNodes.map((n) => [n.id, n.position]))

          const built: WBNode[] = []

          // 1) Casting nodes — always rebuilt from the current element roster.
          SECTIONS.forEach(({ type, singular }, sectionIndex) => {
            storyBase[type].forEach((el, i) => {
              const id = nodeId(type, el.id)
              built.push({
                id,
                type: "castingNode",
                position: savedPos.get(id) || autoLayout(i, sectionIndex),
                data: {
                  type,
                  singular,
                  element: el,
                  storyBaseId: storyBase.id,
                  activeStyle,
                  model,
                  nodeId: id,
                  onGenerated: handleGenerated,
                  onGenerateVariations: stableGenerateVariations,
                  variationsBusy: false,
                },
              })
            })
          })

          // 2) Phase-3 nodes — reconstructed from the persisted graph, with
          //    live callbacks re-attached (the saved data is JSON only).
          savedNodes.forEach((n) => {
            if (n.type === "variationGrid" && n.data) {
              built.push({
                id: n.id,
                type: "variationGrid",
                position: n.position,
                data: {
                  ...(n.data as VariationGridNodeData),
                  nodeId: n.id,
                  onPickCell: stablePickCell,
                } as VariationGridNodeData,
              })
            } else if (n.type === "canonicalShot" && n.data) {
              built.push({
                id: n.id,
                type: "canonicalShot",
                position: n.position,
                data: n.data as CanonicalShotNodeData,
              })
            }
          })

          setNodes(built)
          setEdges(Array.isArray(graph.edges) ? graph.edges : [])
          setIsLoading(false)
        }
      )

    return () => {
      cancelled = true
    }
    // Rebuild when the story base identity or its element roster changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    storyBase.id,
    storyBase.characters.length,
    storyBase.objects.length,
    storyBase.environments.length,
    storyBase.atmospheres.length,
    activeStyle,
    model,
    handleGenerated,
  ])

  const persistGraph = useCallback(
    async (nextNodes: WBNode[], nextEdges: Edge[]) => {
      setSaveState("saving")
      try {
        await fetch(`/api/workboard/${storyBase.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodes: nextNodes.map((n) => ({
              id: n.id,
              position: n.position,
              type: n.type,
              // Casting nodes rebuild from elements → no data needed. Phase-3
              // nodes must round-trip their (serializable) data to survive reload.
              ...(n.type === "variationGrid" || n.type === "canonicalShot"
                ? { data: serializableData(n.data as Record<string, any>) }
                : {}),
            })),
            edges: nextEdges.map((e) => ({
              id: e.id,
              source: e.source,
              target: e.target,
              sourceHandle: e.sourceHandle ?? null,
              targetHandle: e.targetHandle ?? null,
            })),
          }),
        })
        setSaveState("saved")
        window.setTimeout(() => setSaveState("idle"), 1500)
      } catch {
        setSaveState("idle")
      }
    },
    [storyBase.id]
  )

  // Auto-persist positions when a drag finishes.
  const onNodeDragStop = useCallback(() => {
    persistGraph(nodes, edges)
  }, [nodes, edges, persistGraph])

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => {
        const next = addEdge(
          { ...connection, id: `wb-edge-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` },
          eds
        )
        persistGraph(nodes, next)
        return next
      })
    },
    [nodes, persistGraph, setEdges]
  )

  // Patch a single cell inside a variation grid node (used as results stream in).
  const patchGridCell = useCallback(
    (gridNodeId: string, cellIndex: number, cell: VariationCell) => {
      setNodes((current) =>
        current.map((n) => {
          if (n.id !== gridNodeId) return n
          const data = n.data as VariationGridNodeData
          const cells = data.cells.map((c, i) => (i === cellIndex ? cell : c))
          return { ...n, data: { ...data, cells } }
        })
      )
    },
    [setNodes]
  )

  const setSourceVariationsBusy = useCallback(
    (sourceNodeId: string, busy: boolean) => {
      setNodes((current) =>
        current.map((n) =>
          n.id === sourceNodeId && n.type === "castingNode"
            ? { ...n, data: { ...(n.data as CastingNodeData), variationsBusy: busy } }
            : n
        )
      )
    },
    [setNodes]
  )

  // ── Generate Variations ────────────────────────────────────────────────
  // Non-destructive: spawns a NEW variationGrid node (spline from the source),
  // fires the generation pipeline VARIATION_COUNT times with varied seeds, and
  // streams each result into its grid cell. Never touches the source's image.
  const runVariations = useCallback(
    async (sourceNodeId: string, type: CastingType, element: CastingElement) => {
      const source = nodesRef.current.find((n) => n.id === sourceNodeId)
      const basePos = source?.position || { x: 0, y: 0 }
      const ts = Date.now()
      const gridNodeId = variationGridId(element.id, ts)
      const prompt = buildElementPrompt(type, element)
      const baseSeed = ts % 100000

      const initialCells: VariationCell[] = Array.from({ length: VARIATION_COUNT }, (_, i) => ({
        status: "loading",
        seed: baseSeed + i * 1013,
      }))

      const gridNode: WBNode = {
        id: gridNodeId,
        type: "variationGrid",
        position: { x: basePos.x + 260, y: basePos.y },
        data: {
          sourceNodeId,
          castingType: type,
          elementId: element.id,
          elementName: element.name,
          storyBaseId: storyBase.id,
          cells: initialCells,
          pickedIndex: null,
          nodeId: gridNodeId,
          onPickCell: stablePickCell,
        } as VariationGridNodeData,
      }

      const edge: Edge = {
        id: `wb-edge-${ts}-${Math.random().toString(36).slice(2, 6)}`,
        source: sourceNodeId,
        target: gridNodeId,
        type: "default",
      }

      // Mount grid + spline, mark source busy, persist the skeleton. Build the
      // next arrays explicitly so the persist is never stale.
      const nextNodes: WBNode[] = [
        ...nodesRef.current.map((n) =>
          n.id === sourceNodeId && n.type === "castingNode"
            ? { ...n, data: { ...(n.data as CastingNodeData), variationsBusy: true } }
            : n
        ),
        gridNode,
      ]
      const nextEdges: Edge[] = [...edgesRef.current, edge]
      nodesRef.current = nextNodes
      edgesRef.current = nextEdges
      setNodes(nextNodes)
      setEdges(nextEdges)
      persistGraph(nextNodes, nextEdges)

      // Fire the 9 generations concurrently; stream each into its cell.
      await Promise.all(
        initialCells.map(async (cell, i) => {
          try {
            const genRes = await fetch("/api/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                prompt,
                model,
                aspectRatio: "1:1",
                imageSize: "1K",
                seed: cell.seed,
                imageryStyle: activeStyle || undefined,
              }),
            })
            if (!genRes.ok) throw new Error("gen failed")
            const gen = await genRes.json()
            if (!gen.imageUrl) throw new Error("no image")
            patchGridCell(gridNodeId, i, { status: "done", image: gen.imageUrl, seed: cell.seed })
          } catch {
            patchGridCell(gridNodeId, i, { status: "error", seed: cell.seed })
          }
        })
      )

      // All settled → clear busy + persist the grid with its final image set.
      setSourceVariationsBusy(sourceNodeId, false)
      persistGraph(nodesRef.current, edgesRef.current)
    },
    [
      storyBase.id,
      model,
      activeStyle,
      stablePickCell,
      setNodes,
      setEdges,
      setSourceVariationsBusy,
      patchGridCell,
      persistGraph,
    ]
  )

  // ── Pick canonical (pop-out) ───────────────────────────────────────────
  // Clicking a finished cell: persist it as the element's canonical image,
  // spawn a fresh CanonicalShotNode (spline from the grid), update the source
  // casting node's thumbnail, and leave the other 8 cells untouched.
  const pickCanonical = useCallback(
    async (gridNodeId: string, cellIndex: number, image: string) => {
      const grid = nodesRef.current.find((n) => n.id === gridNodeId)
      if (!grid) return
      const gridData = grid.data as VariationGridNodeData
      const { castingType, elementId, elementName } = gridData

      // 1) Persist as the element's canonical image.
      try {
        await fetch(`/api/casting/${castingType}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storyBaseId: storyBase.id, elementId, image }),
        })
      } catch {
        /* best-effort; UI still reflects the pick */
      }

      const ts = Date.now()
      const shotNodeId = canonicalShotId(elementId, ts)
      const shotNode: WBNode = {
        id: shotNodeId,
        type: "canonicalShot",
        position: { x: grid.position.x + 340, y: grid.position.y },
        data: {
          castingType,
          elementId,
          elementName,
          storyBaseId: storyBase.id,
          image,
        } as CanonicalShotNodeData,
      }
      const edge: Edge = {
        id: `wb-edge-${ts}-${Math.random().toString(36).slice(2, 6)}`,
        source: gridNodeId,
        target: shotNodeId,
        type: "default",
      }

      // 2) Mark the picked cell, add the pop-out node + spline. Build the next
      //    arrays explicitly so the persist below is never stale.
      const nextNodes: WBNode[] = [
        ...nodesRef.current.map((n) =>
          n.id === gridNodeId
            ? { ...n, data: { ...(n.data as VariationGridNodeData), pickedIndex: cellIndex } }
            : n
        ),
        shotNode,
      ]
      const nextEdges: Edge[] = [...edgesRef.current, edge]
      nodesRef.current = nextNodes
      edgesRef.current = nextEdges
      setNodes(nextNodes)
      setEdges(nextEdges)

      // 3) Update the source casting node's thumbnail + bubble up to grid view.
      const sb = storyBaseRef.current
      const updatedEl = sb[castingType].find((e) => e.id === elementId)
      if (updatedEl) {
        handleGenerated(castingType, { ...updatedEl, image, updatedAt: ts })
      }

      // 4) Persist the graph (grid pickedIndex + new shot node + spline).
      persistGraph(nextNodes, nextEdges)
    },
    [storyBase.id, setNodes, setEdges, handleGenerated, persistGraph]
  )

  // Keep the stable wrappers pointing at the freshest implementations.
  useEffect(() => {
    handlersRef.current = { generateVariations: runVariations, pickCell: pickCanonical }
  }, [runVariations, pickCanonical])

  const totalElements =
    storyBase.characters.length +
    storyBase.objects.length +
    storyBase.environments.length +
    storyBase.atmospheres.length

  if (totalElements === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-10">
        <h3 className="text-lg font-semibold text-[var(--color-text)]">
          Nothing to lay out yet
        </h3>
        <p className="text-sm text-[var(--color-text-muted)] max-w-sm mt-1">
          Add characters, objects, scenery or atmospheres in the List view and
          they'll appear here as nodes on the canvas.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 relative">
      {/* Save indicator */}
      <div className="absolute top-2 right-2 z-20 flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]/90 px-2.5 py-1 text-xs text-[var(--color-text-muted)]">
        {saveState === "saving" ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving layout…
          </>
        ) : saveState === "saved" ? (
          <>
            <Check className="w-3.5 h-3.5 text-emerald-400" /> Layout saved
          </>
        ) : (
          <>
            <Save className="w-3.5 h-3.5" /> Auto-saves on move
          </>
        )}
      </div>

      {isLoading ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20">
          <Loader2 className="w-6 h-6 animate-spin text-orange-400" />
        </div>
      ) : null}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        nodeTypes={memoNodeTypes}
        defaultEdgeOptions={{ type: "default" }}
        minZoom={0.2}
        maxZoom={1.75}
        proOptions={{ hideAttribution: true }}
        fitView
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="#3a3a42" />
        <MiniMap pannable zoomable className="!bg-[var(--color-surface)]" />
        <Controls />
      </ReactFlow>
    </div>
  )
}

// Own ReactFlowProvider — isolated store, no collision with the autopilot graph.
export function WorkboardCanvas(props: WorkboardCanvasProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <ReactFlowProvider>
        <WorkboardFlow {...props} />
      </ReactFlowProvider>
    </div>
  )
}
