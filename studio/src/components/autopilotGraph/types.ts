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
