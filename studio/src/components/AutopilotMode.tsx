import { AutopilotInbox } from "./AutopilotInbox"

interface AutopilotModeProps {
  onSendToImageQueue?: (prompts: string[], runId?: string) => void
  onSendToVideoQueue?: (prompts: string[], durations?: number[], runId?: string) => void
}

export function AutopilotMode({ onSendToImageQueue, onSendToVideoQueue }: AutopilotModeProps) {
  return <AutopilotInbox onSendToImageQueue={onSendToImageQueue} onSendToVideoQueue={onSendToVideoQueue} />
}

