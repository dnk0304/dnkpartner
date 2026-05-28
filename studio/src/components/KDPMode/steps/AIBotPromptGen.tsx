// ============================================================
// AI Bot Prompt Generation Step - Custom compact chat bubble for prompt generation
// ============================================================

import { useState, useCallback, useRef, useEffect } from "react"
import { 
  Sparkles, 
  CheckCircle, 
  AlertCircle, 
  Grid3x3, 
  Send, 
  Loader2,
  FileText,
  Palette,
  ChevronDown,
  Eye,
  X,
  RefreshCw,
  Edit3,
  Check,
  Cpu
} from "lucide-react"
import { Button } from "../../Button"
import { cn } from "@/lib/utils"
import type { AIBotWizardState } from "../KDPAIBotWizard"
import { ImageryStyle, IMAGERY_STYLE_PRESETS } from "@/types/StudioMode"

// LLM Model options for prompt generation
const LLM_MODELS = [
  { id: "gpt-4o", name: "GPT-4o", description: "Previous generation, reliable and tested" },
  { id: "gpt-5-nano", name: "GPT-5 Nano", description: "Fastest, most cost-efficient" },
  { id: "gpt-5", name: "GPT-5", description: "Balanced performance" },
  { id: "gpt-5.2", name: "GPT-5.2", description: "Most capable, highest quality" },
] as const

// ============================================================
// Types
// ============================================================

interface AIBotPromptGenProps {
  state: AIBotWizardState
  onUpdate: (updates: Partial<AIBotWizardState>) => void
  onNext: () => void
  onBack: () => void
}

interface ChatMessage {
  role: "user" | "assistant"
  content: string
  prompts?: string[]
}

// Page count options
const PAGE_COUNT_OPTIONS = [24, 32, 40, 48, 56, 64, 72, 80]

// ============================================================
// Component
// ============================================================

export function AIBotPromptGen({ state, onUpdate, onNext, onBack }: AIBotPromptGenProps) {
  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: `Hi! I'm ready to generate image prompts for your book. Tell me about your book's theme, story, or concept, and I'll create ${state.pageCount} unique prompts for you!`,
    },
  ])
  const [inputValue, setInputValue] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [extractedPrompts, setExtractedPrompts] = useState<string[]>(state.prompts)
  
  // Dropdown states
  const [showPageDropdown, setShowPageDropdown] = useState(false)
  const [showStyleDropdown, setShowStyleDropdown] = useState(false)
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const [showAllPrompts, setShowAllPrompts] = useState(false)
  const [showCustomPageInput, setShowCustomPageInput] = useState(false)
  const [customPageValue, setCustomPageValue] = useState("")
  
  // LLM Model selection
  const [selectedModel, setSelectedModel] = useState<string>("gpt-4o")
  
  // Prompt editing state
  const [editingPromptIndex, setEditingPromptIndex] = useState<number | null>(null)
  const [editingPromptValue, setEditingPromptValue] = useState("")
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null)
  const [isRegeneratingAll, setIsRegeneratingAll] = useState(false)
  
  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pageDropdownRef = useRef<HTMLDivElement>(null)
  const styleDropdownRef = useRef<HTMLDivElement>(null)
  const modelDropdownRef = useRef<HTMLDivElement>(null)
  const customPageInputRef = useRef<HTMLInputElement>(null)
  const editInputRef = useRef<HTMLTextAreaElement>(null)

  // Convert presets to full ImageryStyle objects
  const imageryStyles: ImageryStyle[] = IMAGERY_STYLE_PRESETS.map((preset, index) => ({
    id: preset.name.toLowerCase().replace(/\s+/g, "-").replace(/&/g, "and"),
    name: preset.name,
    description: preset.description,
    prompt: preset.prompt,
    isCustom: false,
    createdAt: Date.now() - (IMAGERY_STYLE_PRESETS.length - index) * 1000,
  }))

  // Scroll to bottom of messages
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pageDropdownRef.current && !pageDropdownRef.current.contains(e.target as Node)) {
        setShowPageDropdown(false)
      }
      if (styleDropdownRef.current && !styleDropdownRef.current.contains(e.target as Node)) {
        setShowStyleDropdown(false)
      }
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])
  
  // Focus edit input when editing starts
  useEffect(() => {
    if (editingPromptIndex !== null && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingPromptIndex])

  // Update welcome message when page count changes
  useEffect(() => {
    setMessages(prev => {
      if (prev.length === 1 && prev[0].role === "assistant") {
        return [{
          role: "assistant",
          content: `Hi! I'm ready to generate image prompts for your book. Tell me about your book's theme, story, or concept, and I'll create ${state.pageCount} unique prompts for you!`,
        }]
      }
      return prev
    })
  }, [state.pageCount])

  // Handle sending a message
  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return

    const userMessage = inputValue.trim()
    setInputValue("")
    
    // Add user message
    const newMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: userMessage },
    ]
    setMessages(newMessages)
    setIsLoading(true)

    try {
      // Build enhanced prompt with book context
      let enhancedPrompt = userMessage
      
      // Add context about book if available
      const contextParts: string[] = []
      if (state.bookTitle) contextParts.push(`Book title: "${state.bookTitle}"`)
      if (state.authorName) contextParts.push(`Author: ${state.authorName}`)
      if (state.subtitle) contextParts.push(`Subtitle: "${state.subtitle}"`)
      
      // Add instruction for prompt count
      const promptInstruction = `\n\n[SYSTEM: Generate exactly ${state.pageCount} unique image prompts. Each prompt should be a detailed visual description suitable for image generation. Format them as a numbered list.]`
      
      // Build the final message
      const finalMessage = contextParts.length > 0
        ? `${enhancedPrompt}\n\nContext: ${contextParts.join(", ")}${promptInstruction}`
        : `${enhancedPrompt}${promptInstruction}`

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map(m => ({
            role: m.role,
            content: m === newMessages[newMessages.length - 1] ? finalMessage : m.content,
          })),
          mode: "image",
          model: selectedModel, // Use selected LLM model
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Unknown error" }))
        throw new Error(errorData.message || "Failed to get AI response")
      }

      const data = await response.json()
      
      // Add assistant response
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: data.response,
        prompts: data.prompts || [],
      }
      setMessages([...newMessages, assistantMessage])

      // If prompts were extracted, update state
      if (data.prompts && data.prompts.length > 0) {
        // Apply imagery style suffix if selected
        const finalPrompts = data.prompts.map((prompt: string) => {
          if (state.imageryStyle && state.imageryStyle.prompt) {
            return `${prompt}, ${state.imageryStyle.prompt}`
          }
          return prompt
        })
        
        setExtractedPrompts(finalPrompts)
        onUpdate({ prompts: finalPrompts })
      }
    } catch (error) {
      const errorMessage: ChatMessage = {
        role: "assistant",
        content: error instanceof Error 
          ? `Sorry, I encountered an error: ${error.message}. Please try again.`
          : "Sorry, I encountered an error. Please try again.",
      }
      setMessages([...newMessages, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Handle page count change
  const handlePageCountChange = (count: number) => {
    onUpdate({ pageCount: count })
    setShowPageDropdown(false)
    setShowCustomPageInput(false)
  }

  // Handle custom page count
  const handleCustomPageClick = () => {
    setShowCustomPageInput(true)
    setCustomPageValue(state.pageCount.toString())
    // Focus input after render
    setTimeout(() => customPageInputRef.current?.focus(), 0)
  }

  const handleCustomPageSubmit = () => {
    const value = parseInt(customPageValue, 10)
    if (!isNaN(value) && value >= 1 && value <= 500) {
      onUpdate({ pageCount: value })
      setShowPageDropdown(false)
      setShowCustomPageInput(false)
    }
  }

  const handleCustomPageKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleCustomPageSubmit()
    } else if (e.key === "Escape") {
      setShowCustomPageInput(false)
    }
  }

  // Handle style selection
  const handleStyleSelect = (style: ImageryStyle | null) => {
    onUpdate({ imageryStyle: style })
    setShowStyleDropdown(false)
    
    // Re-apply style to existing prompts if any
    if (extractedPrompts.length > 0) {
      const updatedPrompts = extractedPrompts.map(prompt => {
        // Remove any existing style suffix (rough heuristic)
        const basePrompt = prompt.split(", photorealistic")[0]
          .split(", cinematic")[0]
          .split(", anime")[0]
          .split(", Pixar")[0]
          .split(", oil painting")[0]
          .split(", watercolor")[0]
        
        if (style && style.prompt) {
          return `${basePrompt}, ${style.prompt}`
        }
        return basePrompt
      })
      setExtractedPrompts(updatedPrompts)
      onUpdate({ prompts: updatedPrompts })
    }
  }

  // Handle starting to edit a prompt
  const handleStartEdit = useCallback((index: number) => {
    setEditingPromptIndex(index)
    setEditingPromptValue(extractedPrompts[index])
  }, [extractedPrompts])
  
  // Handle saving an edited prompt
  const handleSaveEdit = useCallback(() => {
    if (editingPromptIndex === null) return
    
    const updatedPrompts = [...extractedPrompts]
    updatedPrompts[editingPromptIndex] = editingPromptValue.trim()
    
    setExtractedPrompts(updatedPrompts)
    onUpdate({ prompts: updatedPrompts })
    setEditingPromptIndex(null)
    setEditingPromptValue("")
  }, [editingPromptIndex, editingPromptValue, extractedPrompts, onUpdate])
  
  // Handle canceling edit
  const handleCancelEdit = useCallback(() => {
    setEditingPromptIndex(null)
    setEditingPromptValue("")
  }, [])
  
  // Handle regenerating a single prompt
  const handleRegenerateSingle = useCallback(async (index: number) => {
    if (!extractedPrompts[index]) return
    
    setRegeneratingIndex(index)
    
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: `Generate a NEW, different image prompt for image #${index + 1} in a children's book. 
The current prompt is: "${extractedPrompts[index]}"

Create a completely different but thematically related prompt. Return ONLY the new prompt, nothing else.`,
            },
          ],
          mode: "image",
          model: selectedModel,
        }),
      })
      
      if (!response.ok) {
        throw new Error("Failed to regenerate prompt")
      }
      
      const data = await response.json()
      const newPrompt = data.response.trim()
      
      // Apply imagery style if selected
      const finalPrompt = state.imageryStyle?.prompt 
        ? `${newPrompt}, ${state.imageryStyle.prompt}`
        : newPrompt
      
      const updatedPrompts = [...extractedPrompts]
      updatedPrompts[index] = finalPrompt
      
      setExtractedPrompts(updatedPrompts)
      onUpdate({ prompts: updatedPrompts })
    } catch (error) {
      console.error("Error regenerating prompt:", error)
    } finally {
      setRegeneratingIndex(null)
    }
  }, [extractedPrompts, selectedModel, state.imageryStyle, onUpdate])
  
  // Handle regenerating all prompts
  const handleRegenerateAll = useCallback(async () => {
    if (messages.length < 2) return // Need at least user input
    
    setIsRegeneratingAll(true)
    
    try {
      // Get the original user message
      const userMessage = messages.find(m => m.role === "user")
      if (!userMessage) {
        throw new Error("No user message found")
      }
      
      // Build the regeneration request
      const contextParts: string[] = []
      if (state.bookTitle) contextParts.push(`Book title: "${state.bookTitle}"`)
      if (state.authorName) contextParts.push(`Author: ${state.authorName}`)
      if (state.subtitle) contextParts.push(`Subtitle: "${state.subtitle}"`)
      
      const promptInstruction = `\n\n[SYSTEM: Generate exactly ${state.pageCount} completely NEW and DIFFERENT unique image prompts. Each prompt should be a detailed visual description suitable for image generation. These should be different from any previous prompts. Format them as a numbered list.]`
      
      const finalMessage = contextParts.length > 0
        ? `${userMessage.content}\n\nContext: ${contextParts.join(", ")}${promptInstruction}`
        : `${userMessage.content}${promptInstruction}`
      
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: finalMessage }],
          mode: "image",
          model: selectedModel,
        }),
      })
      
      if (!response.ok) {
        throw new Error("Failed to regenerate prompts")
      }
      
      const data = await response.json()
      
      if (data.prompts && data.prompts.length > 0) {
        // Apply imagery style suffix if selected
        const finalPrompts = data.prompts.map((prompt: string) => {
          if (state.imageryStyle && state.imageryStyle.prompt) {
            return `${prompt}, ${state.imageryStyle.prompt}`
          }
          return prompt
        })
        
        setExtractedPrompts(finalPrompts)
        onUpdate({ prompts: finalPrompts })
        
        // Add to chat messages
        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: data.response,
          prompts: data.prompts,
        }
        setMessages(prev => [...prev, assistantMessage])
      }
    } catch (error) {
      console.error("Error regenerating all prompts:", error)
    } finally {
      setIsRegeneratingAll(false)
    }
  }, [messages, state, selectedModel, onUpdate])

  // Check prompt status
  const promptCountMatch = extractedPrompts.length === state.pageCount
  const hasPrompts = extractedPrompts.length > 0

  return (
    <div className="flex flex-col h-full">
      {/* Settings Row */}
      <div className="p-4 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-3 p-3 bg-[var(--color-background)] rounded-lg border border-[var(--color-border)]">
          {/* Page Count Dropdown */}
          <div className="relative" ref={pageDropdownRef}>
            <button
              onClick={() => setShowPageDropdown(!showPageDropdown)}
              className="flex items-center gap-2 px-3 py-2 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] hover:border-[var(--color-primary)] transition-colors"
            >
              <FileText className="w-4 h-4 text-[var(--color-primary)]" />
              <span className="text-sm font-medium text-[var(--color-text)]">
                {state.pageCount} Pages
              </span>
              <ChevronDown className={cn(
                "w-4 h-4 text-[var(--color-text-dim)] transition-transform",
                showPageDropdown && "rotate-180"
              )} />
            </button>
            
            {showPageDropdown && (
              <div className="absolute top-full left-0 mt-1 w-40 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] shadow-lg z-10 py-1">
                {PAGE_COUNT_OPTIONS.map(count => (
                  <button
                    key={count}
                    onClick={() => handlePageCountChange(count)}
                    className={cn(
                      "w-full px-3 py-2 text-sm text-left hover:bg-[var(--color-background)] transition-colors",
                      state.pageCount === count && !showCustomPageInput
                        ? "text-[var(--color-primary)] font-medium" 
                        : "text-[var(--color-text)]"
                    )}
                  >
                    {count} pages
                  </button>
                ))}
                {/* Custom option */}
                <div className="border-t border-[var(--color-border)] mt-1 pt-1">
                  {showCustomPageInput ? (
                    <div className="px-2 py-1.5 flex items-center gap-2">
                      <input
                        ref={customPageInputRef}
                        type="number"
                        min="1"
                        max="500"
                        value={customPageValue}
                        onChange={(e) => setCustomPageValue(e.target.value)}
                        onKeyDown={handleCustomPageKeyDown}
                        onBlur={handleCustomPageSubmit}
                        className="w-16 px-2 py-1 text-sm bg-[var(--color-background)] border border-[var(--color-border)] rounded text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                        placeholder="1-500"
                      />
                      <span className="text-xs text-[var(--color-text-dim)]">pages</span>
                    </div>
                  ) : (
                    <button
                      onClick={handleCustomPageClick}
                      className={cn(
                        "w-full px-3 py-2 text-sm text-left hover:bg-[var(--color-background)] transition-colors",
                        !PAGE_COUNT_OPTIONS.includes(state.pageCount)
                          ? "text-[var(--color-primary)] font-medium" 
                          : "text-[var(--color-text)]"
                      )}
                    >
                      Custom...
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* LLM Model Dropdown */}
          <div className="relative" ref={modelDropdownRef}>
            <button
              onClick={() => setShowModelDropdown(!showModelDropdown)}
              className="flex items-center gap-2 px-3 py-2 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] hover:border-cyan-500 transition-colors"
            >
              <Cpu className="w-4 h-4 text-cyan-400" />
              <span className="text-sm font-medium text-[var(--color-text)]">
                {LLM_MODELS.find(m => m.id === selectedModel)?.name || "GPT-4o"}
              </span>
              <ChevronDown className={cn(
                "w-4 h-4 text-[var(--color-text-dim)] transition-transform",
                showModelDropdown && "rotate-180"
              )} />
            </button>
            
            {showModelDropdown && (
              <div className="absolute top-full left-0 mt-1 w-56 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] shadow-lg z-10 py-1">
                {LLM_MODELS.map(model => (
                  <button
                    key={model.id}
                    onClick={() => {
                      setSelectedModel(model.id)
                      setShowModelDropdown(false)
                    }}
                    className={cn(
                      "w-full px-3 py-2 text-sm text-left hover:bg-[var(--color-background)] transition-colors",
                      selectedModel === model.id 
                        ? "text-cyan-400 font-medium" 
                        : "text-[var(--color-text)]"
                    )}
                  >
                    <div className="font-medium">{model.name}</div>
                    <div className="text-xs text-[var(--color-text-dim)]">
                      {model.description}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Imagery Style Dropdown */}
          <div className="relative flex-1" ref={styleDropdownRef}>
            <button
              onClick={() => setShowStyleDropdown(!showStyleDropdown)}
              className="flex items-center gap-2 px-3 py-2 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] hover:border-[var(--color-primary)] transition-colors w-full"
            >
              <Palette className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-medium text-[var(--color-text)] flex-1 text-left truncate">
                {state.imageryStyle ? state.imageryStyle.name : "No Style"}
              </span>
              <ChevronDown className={cn(
                "w-4 h-4 text-[var(--color-text-dim)] transition-transform flex-shrink-0",
                showStyleDropdown && "rotate-180"
              )} />
            </button>
            
            {showStyleDropdown && (
              <div className="absolute top-full left-0 mt-1 w-full max-h-64 overflow-y-auto bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] shadow-lg z-10 py-1">
                <button
                  onClick={() => handleStyleSelect(null)}
                  className={cn(
                    "w-full px-3 py-2 text-sm text-left hover:bg-[var(--color-background)] transition-colors",
                    !state.imageryStyle 
                      ? "text-[var(--color-primary)] font-medium" 
                      : "text-[var(--color-text)]"
                  )}
                >
                  No Style
                </button>
                {imageryStyles.map(style => (
                  <button
                    key={style.id}
                    onClick={() => handleStyleSelect(style)}
                    className={cn(
                      "w-full px-3 py-2 text-sm text-left hover:bg-[var(--color-background)] transition-colors",
                      state.imageryStyle?.id === style.id 
                        ? "text-[var(--color-primary)] font-medium" 
                        : "text-[var(--color-text)]"
                    )}
                  >
                    <div className="font-medium">{style.name}</div>
                    <div className="text-xs text-[var(--color-text-dim)] truncate">
                      {style.description}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Compact Chat Bubble */}
      <div className="flex-1 flex flex-col min-h-0 mx-4 my-4">
        <div className="flex-1 border border-[var(--color-border)] rounded-xl overflow-hidden flex flex-col bg-[var(--color-surface)]">
          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px] max-h-[300px]">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={cn(
                  "flex",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                    msg.role === "user"
                      ? "bg-[var(--color-primary)] text-white rounded-br-md"
                      : "bg-[var(--color-background)] text-[var(--color-text)] border border-[var(--color-border)] rounded-bl-md"
                  )}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  {msg.prompts && msg.prompts.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-current/20">
                      <span className="text-xs opacity-75">
                        ✓ Extracted {msg.prompts.length} prompts
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-[var(--color-background)] text-[var(--color-text)] border border-[var(--color-border)] rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-[var(--color-primary)]" />
                    <span className="text-sm text-[var(--color-text-muted)]">
                      Generating prompts...
                    </span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="border-t border-[var(--color-border)] p-3 bg-[var(--color-background)]">
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe your book's theme or story..."
                className="flex-1 resize-none rounded-xl px-4 py-2.5 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] placeholder-[var(--color-text-dim)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/50 focus:border-[var(--color-primary)] min-h-[42px] max-h-[120px]"
                rows={1}
                disabled={isLoading}
              />
              <Button
                onClick={handleSend}
                disabled={!inputValue.trim() || isLoading}
                className="h-[42px] px-4 gap-2"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Prompts Status Section */}
      <div className="p-4 border-t border-[var(--color-border)]">
        <div className={cn(
          "p-4 rounded-xl border-2 transition-colors",
          hasPrompts
            ? promptCountMatch
              ? "border-green-500/50 bg-green-500/5"
              : "border-yellow-500/50 bg-yellow-500/5"
            : "border-[var(--color-border)] bg-[var(--color-background)]"
        )}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {hasPrompts ? (
                promptCountMatch ? (
                  <CheckCircle className="w-5 h-5 text-green-400" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-yellow-400" />
                )
              ) : (
                <Grid3x3 className="w-5 h-5 text-[var(--color-text-dim)]" />
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[var(--color-text)]">
                    {extractedPrompts.length} of {state.pageCount} prompts
                  </span>
                  {promptCountMatch && (
                    <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full font-medium">
                      Ready
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  {!hasPrompts
                    ? "Chat with the AI to generate prompts for your book"
                    : promptCountMatch 
                    ? "Perfect! You have the right number of prompts."
                    : extractedPrompts.length < state.pageCount
                    ? `Need ${state.pageCount - extractedPrompts.length} more prompts.`
                    : `${extractedPrompts.length - state.pageCount} extra prompts.`
                  }
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {hasPrompts && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRegenerateAll}
                    disabled={isRegeneratingAll || isLoading}
                    className="gap-1.5 text-cyan-400 border-cyan-500/50 hover:bg-cyan-500/10"
                  >
                    {isRegeneratingAll ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    Regenerate All
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAllPrompts(true)}
                    className="gap-1.5"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    View & Edit
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="p-4 border-t border-[var(--color-border)] flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          Back
        </Button>
        <Button
          onClick={onNext}
          disabled={!promptCountMatch}
          className="gap-2"
        >
          Continue to Generate Images
          <Sparkles className="w-4 h-4" />
        </Button>
      </div>

      {/* View All Prompts Modal with Editing */}
      {showAllPrompts && (
        <>
          <div 
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              setShowAllPrompts(false)
              handleCancelEdit()
            }}
          />
          <div className="fixed inset-8 z-50 flex items-center justify-center pointer-events-none">
            <div className="w-full max-w-3xl max-h-full bg-[var(--color-surface)] rounded-2xl shadow-2xl border border-[var(--color-border)] overflow-hidden pointer-events-auto flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
                <div className="flex items-center gap-2">
                  <Grid3x3 className="w-5 h-5 text-[var(--color-primary)]" />
                  <h3 className="text-lg font-bold text-[var(--color-text)]">
                    Generated Prompts ({extractedPrompts.length})
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRegenerateAll}
                    disabled={isRegeneratingAll}
                    className="gap-1.5 text-cyan-400 border-cyan-500/50 hover:bg-cyan-500/10"
                  >
                    {isRegeneratingAll ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    Regenerate All
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setShowAllPrompts(false)
                      handleCancelEdit()
                    }}
                  >
                    <X className="w-5 h-5" />
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {extractedPrompts.map((prompt, index) => (
                  <div
                    key={index}
                    className={cn(
                      "p-3 bg-[var(--color-background)] border rounded-lg transition-colors",
                      editingPromptIndex === index 
                        ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/30" 
                        : "border-[var(--color-border)] hover:border-[var(--color-primary)]"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-7 h-7 bg-[var(--color-primary)]/20 rounded-full flex items-center justify-center text-xs font-bold text-[var(--color-primary)]">
                        {index + 1}
                      </div>
                      
                      {editingPromptIndex === index ? (
                        <div className="flex-1 space-y-2">
                          <textarea
                            ref={editInputRef}
                            value={editingPromptValue}
                            onChange={(e) => setEditingPromptValue(e.target.value)}
                            className="w-full p-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/50 resize-none min-h-[80px]"
                            placeholder="Enter prompt..."
                          />
                          <div className="flex items-center gap-2 justify-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={handleCancelEdit}
                              className="gap-1"
                            >
                              <X className="w-3.5 h-3.5" />
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={handleSaveEdit}
                              disabled={!editingPromptValue.trim()}
                              className="gap-1"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Save
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm text-[var(--color-text)] flex-1">
                            {prompt}
                          </p>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => handleStartEdit(index)}
                              className="p-1.5 rounded-lg hover:bg-[var(--color-surface)] text-[var(--color-text-dim)] hover:text-[var(--color-text)] transition-colors"
                              title="Edit prompt"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleRegenerateSingle(index)}
                              disabled={regeneratingIndex === index}
                              className={cn(
                                "p-1.5 rounded-lg transition-colors",
                                regeneratingIndex === index
                                  ? "text-cyan-400"
                                  : "hover:bg-[var(--color-surface)] text-[var(--color-text-dim)] hover:text-cyan-400"
                              )}
                              title="Regenerate prompt"
                            >
                              {regeneratingIndex === index ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <RefreshCw className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-4 border-t border-[var(--color-border)]">
                <p className="text-xs text-[var(--color-text-dim)] text-center mb-3">
                  Click the edit icon to modify a prompt, or the refresh icon to regenerate it with AI
                </p>
                <Button
                  onClick={() => {
                    setShowAllPrompts(false)
                    handleCancelEdit()
                  }}
                  className="w-full"
                >
                  Done
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
