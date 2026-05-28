export type ValueType =
  | "string"
  | "number"
  | "boolean"
  | "json"
  | "markdown"
  | "string[]"
  | "number[]"
  | "fileRef"
  | "fileRef[]"
  | "promptPack"
  | "scriptDraft"
  | "qaReport"

export type FieldSchema = {
  key: string
  label: string
  type: ValueType
  required?: boolean
  default?: any
  description?: string
  ui?: { multiline?: boolean; placeholder?: string; options?: string[] }
}

export type PortDef = { id: string; label: string; type: ValueType; required?: boolean }

export type NodeTypeDef = {
  type: string
  label: string
  category:
    | "Triggers"
    | "Planning"
    | "Writing"
    | "Directing"
    | "QA"
    | "Media"
    | "Storage"
    | "ControlFlow"
    | "HumanInLoop"
    | "Notifications"
  description: string
  inputs: PortDef[]
  outputs: PortDef[]
  fields: FieldSchema[]
}

export type GraphTemplateNode = {
  id: string
  type: string
  title?: string
  position: { x: number; y: number }
  ui?: { width?: number; collapsed?: boolean }
  config: Record<string, any>
}

export type GraphTemplateEdge = {
  id: string
  from: { nodeId: string; portId: string }
  to: { nodeId: string; portId: string }
}

export type GraphTemplate = {
  templateId: string
  projectId: string
  subprojectId?: string
  name: string
  description?: string
  version: number
  createdAt: number
  updatedAt: number
  tags?: string[]
  nodes: GraphTemplateNode[]
  edges: GraphTemplateEdge[]
  defaults?: {
    modelRouting?: { brainModel?: string; scriptWriter?: string; director?: string }
    approvals?: { requirePlanApproval?: boolean; requireFinalApproval?: boolean }
  }
}

export type GraphTemplateSummary = {
  templateId: string
  projectId: string
  subprojectId?: string
  name: string
  description?: string
  latestVersion: number
  versions: number[]
  updatedAt: number
}
export type GraphValueType =
  | "string"
  | "number"
  | "boolean"
  | "json"
  | "markdown"
  | "string[]"
  | "number[]"
  | "fileRef"
  | "fileRef[]"
  | "promptPack"
  | "scriptDraft"
  | "qaReport"

export type GraphNodePort = {
  id: string
  label: string
  type: GraphValueType
  required?: boolean
}

export type GraphTemplateEdge = {
  id: string
  from: { nodeId: string; portId: string }
  to: { nodeId: string; portId: string }
}

export type GraphTemplateNode = {
  id: string
  type: string
  title?: string
  position: { x: number; y: number }
  ui?: { width?: number; collapsed?: boolean }
  config: Record<string, any>
}

export type GraphTemplate = {
  templateId: string
  projectId: string
  name: string
  description?: string
  version: number
  createdAt: number
  updatedAt: number
  tags?: string[]
  nodes: GraphTemplateNode[]
  edges: GraphTemplateEdge[]
  defaults?: {
    modelRouting?: { brainModel?: string; scriptWriter?: string; director?: string }
    approvals?: { requirePlanApproval?: boolean; requireFinalApproval?: boolean }
  }
}

export type NodeRunStatus =
  | "pending"
  | "blocked"
  | "running"
  | "needs_approval"
  | "completed"
  | "failed"
  | "skipped"

export type ArtifactRef = {
  artifactId: string
  projectId: string
  subprojectId?: string
  runId: string
  nodeId: string
  kind:
    | "outline"
    | "scriptDraft"
    | "sceneTimestamps"
    | "promptPack"
    | "qaReport"
    | "storyboardPlan"
    | "videoPlan"
    | "imageFile"
    | "videoFile"
    | "runJson"
    | "packageJson"
    | "conversationJsonl"
  title: string
  mime: string
  relPath: string
  createdAt: number
  summary?: string
  preview?: { textSnippet?: string; jsonKeys?: string[] }
}

export type RunGraphNode = {
  id: string
  type: string
  title?: string
  position: { x: number; y: number }
  configSnapshot: Record<string, any>
  status: NodeRunStatus
  startedAt?: number
  completedAt?: number
  error?: { message: string; stack?: string }
  inputsResolved?: Record<string, any>
  outputs?: Record<string, any>
  logs?: Array<{ ts: number; level: "info" | "warn" | "error"; message: string }>
  artifacts?: ArtifactRef[]
  approval?: {
    required: boolean
    state: "pending" | "approved" | "rejected"
    feedback?: string
    decidedAt?: number
  }
}

export type RunInstanceGraph = {
  runId: string
  projectId: string
  subprojectId?: string
  templateRef: { templateId: string; version: number }
  createdAt: number
  updatedAt: number
  source: "manual" | "scheduled"
  nodes: RunGraphNode[]
  edges: GraphTemplateEdge[]
}

export type ValueType =
  | "string"
  | "number"
  | "boolean"
  | "json"
  | "markdown"
  | "string[]"
  | "number[]"
  | "fileRef"
  | "fileRef[]"
  | "promptPack"
  | "scriptDraft"
  | "qaReport"

export type NodeRunStatus =
  | "pending"
  | "blocked"
  | "running"
  | "needs_approval"
  | "completed"
  | "failed"
  | "skipped"

export type GraphTemplateNode = {
  id: string
  type: string
  title?: string
  position: { x: number; y: number }
  ui?: { width?: number; collapsed?: boolean }
  config: Record<string, any>
}

export type GraphTemplateEdge = {
  id: string
  from: { nodeId: string; portId: string }
  to: { nodeId: string; portId: string }
}

export type GraphTemplate = {
  templateId: string
  projectId: string
  subprojectId?: string
  name: string
  description?: string
  version: number
  createdAt: number
  updatedAt: number
  tags?: string[]
  nodes: GraphTemplateNode[]
  edges: GraphTemplateEdge[]
  defaults?: {
    modelRouting?: { brainModel?: string; scriptWriter?: string; director?: string }
    approvals?: { requirePlanApproval?: boolean; requireFinalApproval?: boolean }
  }
}

export type ArtifactKind =
  | "outline"
  | "scriptDraft"
  | "sceneTimestamps"
  | "promptPack"
  | "qaReport"
  | "storyboardPlan"
  | "videoPlan"
  | "imageFile"
  | "videoFile"
  | "runJson"
  | "packageJson"
  | "conversationJsonl"

export type ArtifactRef = {
  artifactId: string
  projectId: string
  subprojectId?: string
  runId: string
  nodeId: string
  kind: ArtifactKind
  title: string
  mime: string
  /**
   * File path relative to `data/projects/<projectId>/`.
   * Must never be absolute. Prefer forward slashes.
   */
  relPath: string
  createdAt: number
  summary?: string
  preview?: { textSnippet?: string; jsonKeys?: string[] }
}

export type RunInstanceGraphNode = {
  id: string
  type: string
  title?: string
  position: { x: number; y: number }
  configSnapshot: Record<string, any>
  status: NodeRunStatus
  startedAt?: number
  completedAt?: number
  error?: { message: string; stack?: string }
  inputsResolved?: Record<string, any>
  outputs?: Record<string, any>
  logs?: Array<{ ts: number; level: "info" | "warn" | "error"; message: string }>
  artifacts?: ArtifactRef[]
  approval?: {
    required: boolean
    state: "pending" | "approved" | "rejected"
    feedback?: string
    decidedAt?: number
  }
}

export type RunInstanceGraph = {
  runId: string
  projectId: string
  subprojectId?: string
  templateRef: { templateId: string; version: number }
  createdAt: number
  updatedAt: number
  source: "manual" | "scheduled"
  nodes: RunInstanceGraphNode[]
  edges: GraphTemplateEdge[]
}

