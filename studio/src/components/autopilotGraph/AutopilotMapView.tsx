import { AutopilotRunMapView } from "./AutopilotRunMapView"
import { AutopilotTemplateMapEditor } from "./AutopilotTemplateMapEditor"

type AutopilotMapViewProps = {
  projectId: string
  onRunStarted?: (message: string) => void
}

/**
 * Backward-compatible map editor export.
 * The map runtime viewer is available as `AutopilotRunMapView`.
 */
export function AutopilotMapView({ projectId, onRunStarted }: AutopilotMapViewProps) {
  return <AutopilotTemplateMapEditor projectId={projectId} onRunStarted={onRunStarted} />
}

export { AutopilotRunMapView }
