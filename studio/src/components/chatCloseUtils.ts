export type EscapeCloseAction = "close_preview" | "close_chat" | "noop"

export function resolveInlineChatEscapeAction(params: {
  isOpen: boolean
  showPromptPreview: boolean
  hasOnClose: boolean
}): EscapeCloseAction {
  if (params.showPromptPreview) return "close_preview"
  if (params.isOpen && params.hasOnClose) return "close_chat"
  return "noop"
}

