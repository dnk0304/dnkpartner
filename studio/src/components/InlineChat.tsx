import { useState, useRef, useEffect } from "react"
import { Send, Bot, User, Loader2, X, Image as ImageIcon, XCircle, ChevronDown, Check, Plus, Film, Sparkles, SplitSquareHorizontal, Wand2, Layers, Download, Palette } from "lucide-react"
import { Button } from "./Button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./Card"
import { Textarea } from "./Textarea"
import { ModeDescription } from "./ModeDescription"
import { resolveInlineChatEscapeAction } from "./chatCloseUtils"
import { cn } from "@/lib/utils"

export interface Message {
  role: "user" | "assistant"
  content: string
  prompts?: string[]
  images?: string[] // Base64 image URLs
}

type AssistantMode = "normal" | "storymaker" | "advanced-prompting" | "manager"

interface ChatUsage {
  model: string
  inputTokens: number
  outputTokens: number
}

interface ExtractedPrompt {
  prompt: string
  duration?: number // Video duration in seconds
}

interface ImageryStyle {
  id: string
  name: string
  description: string
  prompt: string
}

interface InlineChatProps {
  onPromptsExtracted: (prompts: string[], durations?: number[]) => void
  onSendToImageQueue?: (prompts: string[]) => void
  onSendToVideoQueue?: (prompts: string[], durations?: number[]) => void
  onChatUsage?: (usage: ChatUsage) => void
  disabled?: boolean
  isOpen?: boolean
  presentation?: "modal" | "embedded"
  onClose?: () => void
  onLoadingChange?: (isLoading: boolean) => void
  mode?: "image" | "video"
  activeStoryBase?: any // Active story base for context
  selectedImageryStyle?: ImageryStyle | null // Currently selected imagery style
  onSelectImageryStyle?: (style: ImageryStyle | null) => void // Callback to change style
  availableStyles?: ImageryStyle[] // Available styles to choose from
  initialImages?: string[] // Pre-load images for auto-analysis (base64 URLs)
  autoAnalyze?: boolean // Automatically analyze initial images when opened
  projectId?: string
  sessionId?: string
  onSessionIdChange?: (sessionId: string) => void
  initialMessages?: Message[]
  roleName?: string
  autopilotInstructions?: string
  initialAssistantMode?: AssistantMode
}

export function InlineChat({
  onPromptsExtracted,
  onSendToImageQueue,
  onSendToVideoQueue,
  onChatUsage,
  disabled,
  isOpen = true,
  presentation = "modal",
  onClose,
  onLoadingChange,
  mode = "image",
  activeStoryBase,
  selectedImageryStyle,
  onSelectImageryStyle,
  availableStyles,
  initialImages,
  autoAnalyze,
  projectId,
  sessionId,
  onSessionIdChange,
  initialMessages,
  roleName,
  autopilotInstructions,
  initialAssistantMode,
}: InlineChatProps) {
  const isEmbedded = presentation === "embedded"
  const isChatVisible = isEmbedded ? true : isOpen
  const supportsManagerMode = Boolean(
    initialAssistantMode === "manager" ||
    (typeof roleName === "string" && roleName.toLowerCase().includes("manager")) ||
    (typeof autopilotInstructions === "string" && autopilotInstructions.trim().length > 0)
  )
  const defaultAssistantMode: AssistantMode = initialAssistantMode || (supportsManagerMode ? "manager" : "normal")

  // State declarations - must come before getWelcomeMessage
  const [assistantMode, setAssistantMode] = useState<AssistantMode>(defaultAssistantMode) // AI mode toggle
  const [originalScript, setOriginalScript] = useState<string>("") // Store original script for side-by-side view
  const [desiredPromptCount, setDesiredPromptCount] = useState<number>(0) // 0 means auto-detect
  const [chatName, setChatName] = useState<string>("Untitled Chat") // Chat name for Advanced Prompting Mode
  const [isRenamingChat, setIsRenamingChat] = useState(false)
  const [input, setInput] = useState("")
  const [uploadedImages, setUploadedImages] = useState<string[]>([]) // Base64 image URLs
  const [isLoading, setIsLoading] = useState(false)
  const [isExpanded, setIsExpanded] = useState(true)
  const [isDragging, setIsDragging] = useState(false)
  const [selectedModel, setSelectedModel] = useState("gpt-5-nano") // Default to GPT-5 Nano
  const [showPromptPreview, setShowPromptPreview] = useState(false)
  const [previewPrompts, setPreviewPrompts] = useState<ExtractedPrompt[]>([])
  const [isStyleDropdownOpen, setIsStyleDropdownOpen] = useState(false)

  const getWelcomeMessage = (targetAssistantMode: AssistantMode = assistantMode) => {
    if (targetAssistantMode === "manager") {
      return "Hi! I am your Master Autopilot Manager. Talk normally and I will auto-route your request to the right specialist assistant."
    }
    if (targetAssistantMode === "storymaker") {
      return "🎬 Welcome to AI StoryCreator Mode! Paste your full script or transcript here, and I'll automatically split it into scenes and create detailed prompts for each one. I can also enhance the prompts and integrate your Story Base elements!"
    }
    if (targetAssistantMode === "advanced-prompting") {
      return "🎨 Welcome to Advanced Prompting Mode! I'm your professional prompt engineering assistant. Tell me what you want to create, and I'll help you craft highly detailed, professional-grade image prompts. You can save this chat session, export prompts, and send them directly to the image generator!"
    }
    if (mode === "video") {
      return "Hi! I'm your AI assistant for video generation. Describe your video scenes and I'll extract prompts with durations. You can specify duration like '5 second scene of...' or '8s clip showing...' and I'll detect it automatically!"
    }
    return "Hi! I'm your AI assistant. Describe the images you want to generate, and I'll automatically identify and extract the prompts for you. You can describe multiple images in one message!"
  }

  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: getWelcomeMessage(),
    },
  ])
  const isWelcomeOnlyThread = (nextMessages: Message[]) => {
    if (nextMessages.length !== 1 || nextMessages[0]?.role !== "assistant") return false
    const content = nextMessages[0].content
    return [
      getWelcomeMessage("manager"),
      getWelcomeMessage("normal"),
      getWelcomeMessage("storymaker"),
      getWelcomeMessage("advanced-prompting"),
    ].includes(content)
  }
  const handleAssistantModeChange = (nextMode: AssistantMode) => {
    if (nextMode === assistantMode) return
    setAssistantMode(nextMode)

    // Embedded chat (Autopilot) keeps a single persistent thread across mode switches.
    if (isEmbedded) {
      setMessages((prev) => {
        if (isWelcomeOnlyThread(prev)) {
          return [{ role: "assistant", content: getWelcomeMessage(nextMode) }]
        }
        return prev
      })
      return
    }

    // Modal chat preserves previous behavior: switching mode starts a fresh context.
    setMessages([{ role: "assistant", content: getWelcomeMessage(nextMode) }])
  }
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)

  // Model pricing info (per 100k tokens)
  const modelPricing: Record<string, { input: string; output: string }> = {
    "gpt-4o": { input: "$0.25", output: "$1.00" },
    "gpt-5-nano": { input: "$0.005", output: "$0.04" },
    "gpt-5": { input: "$0.125", output: "$1.00" },
    "gpt-5.2": { input: "$0.175", output: "$1.40" },
  }
  
  // Resizable chat state - 40% larger (850*1.4=1190, 650*1.4=910)
  const [chatSize, setChatSize] = useState({ width: 1190, height: 910 })
  const [isResizing, setIsResizing] = useState(false)
  const resizeRef = useRef<{ startX: number; startY: number; startWidth: number; startHeight: number } | null>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    if (!initialMessages) return
    if (initialMessages.length === 0) {
      setMessages([
        {
          role: "assistant",
          content: getWelcomeMessage(),
        },
      ])
      return
    }
    setMessages(initialMessages)
  }, [initialMessages])
  
  // Resize handlers
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startWidth: chatSize.width,
      startHeight: chatSize.height,
    }
  }
  
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !resizeRef.current) return
      
      const deltaX = e.clientX - resizeRef.current.startX
      const deltaY = e.clientY - resizeRef.current.startY
      
      const newWidth = Math.max(400, Math.min(window.innerWidth * 0.9, resizeRef.current.startWidth + deltaX))
      const newHeight = Math.max(300, Math.min(window.innerHeight * 0.9, resizeRef.current.startHeight + deltaY))
      
      setChatSize({ width: newWidth, height: newHeight })
    }
    
    const handleMouseUp = () => {
      if (isResizing) {
        setIsResizing(false)
        resizeRef.current = null
        // Save to localStorage
        localStorage.setItem('chatSize', JSON.stringify(chatSize))
      }
    }
    
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, chatSize])
  
  // Load saved chat size
  useEffect(() => {
    const saved = localStorage.getItem('chatSize')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setChatSize(parsed)
      } catch (e) {
        // Ignore
      }
    }
  }, [])

  // Auto-analyze initial images when chat opens
  const hasAutoAnalyzedRef = useRef(false)
  
  useEffect(() => {
    if (isChatVisible && autoAnalyze && initialImages && initialImages.length > 0 && !hasAutoAnalyzedRef.current && !isLoading) {
      hasAutoAnalyzedRef.current = true
      
      // Set the uploaded images
      setUploadedImages(initialImages)
      
      // Set a prompt for analysis
      const analysisPrompt = initialImages.length === 1
        ? "Analyze this image and generate a detailed visual description prompt that could recreate it. Focus on: composition, colors, lighting, style, mood, and key visual elements."
        : `Analyze these ${initialImages.length} images and generate detailed visual description prompts for each. For each image, describe: composition, colors, lighting, style, mood, and key visual elements.`
      
      setInput(analysisPrompt)
      
      // Auto-send after a short delay to allow UI to update
      setTimeout(() => {
        // Trigger send by simulating the send action
        const sendButton = document.querySelector('[data-auto-send="true"]') as HTMLButtonElement
        if (sendButton) {
          sendButton.click()
        }
      }, 500)
    }
    
    // Reset when chat closes
    if (!isChatVisible) {
      hasAutoAnalyzedRef.current = false
    }
  }, [isChatVisible, autoAnalyze, initialImages, isLoading])

  useEffect(() => {
    const handleEscapeClose = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      const action = resolveInlineChatEscapeAction({
        isOpen: isChatVisible,
        showPromptPreview,
        hasOnClose: Boolean(onClose),
      })
      if (action === "close_preview") {
        setShowPromptPreview(false)
      } else if (action === "close_chat") {
        onClose?.()
      }
    }

    window.addEventListener("keydown", handleEscapeClose)
    return () => window.removeEventListener("keydown", handleEscapeClose)
  }, [isChatVisible, onClose, showPromptPreview])

  const processImageFiles = (files: FileList | File[]) => {
    Array.from(files).forEach((file) => {
      if (file.type.startsWith("image/")) {
        const reader = new FileReader()
        reader.onload = () => {
          const base64 = reader.result as string
          setUploadedImages((prev) => [...prev, base64])
        }
        reader.readAsDataURL(file)
      }
    })
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    processImageFiles(files)

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled && !isLoading) {
      setIsDragging(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    if (disabled || isLoading) return

    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      processImageFiles(files)
    }
  }

  const removeImage = (index: number) => {
    setUploadedImages((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSend = async () => {
    if ((!input.trim() && uploadedImages.length === 0) || isLoading || disabled) return

    const userMessage = input.trim()
    const images = [...uploadedImages]
    setInput("")
    setUploadedImages([])
    setIsLoading(true)
    onLoadingChange?.(true)

    // Add user message with images
    const newMessages: Message[] = [
      ...messages,
      { role: "user", content: userMessage || "Look at this image", images },
    ]
    setMessages(newMessages)

    try {
      // Store original script for side-by-side view in AI StoryCreator Mode
      if (assistantMode === "storymaker" && userMessage) {
        setOriginalScript(userMessage)
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => {
            const msg: any = {
              role: m.role,
              content: m.content,
            }
            if (m.images && m.images.length > 0) {
              msg.images = m.images
            }
            return msg
          }),
          mode, // Pass the mode (image or video) to the server
          model: selectedModel, // Pass the selected model
          assistantMode, // Pass AI StoryCreator Mode flag
          storyBase: assistantMode === "storymaker" ? activeStoryBase : null, // Pass story base for AI StoryCreator Mode
          desiredPromptCount: assistantMode === "storymaker" && desiredPromptCount > 0 ? desiredPromptCount : undefined, // Pass desired prompt count for AI Story Creator
          projectId,
          sessionId,
          roleName,
          autopilotInstructions,
        }),
      })

      // Check content type before parsing
      const contentType = response.headers.get("content-type") || ""
      
      if (!response.ok) {
        // Try to get error message, but handle HTML responses
        let errorData: any = { message: "Unknown error" }
        try {
          if (contentType.includes("application/json")) {
            errorData = await response.json()
            
            // Check if it's a rate limit error with cooldown
            if (response.status === 429 && errorData.cooldownSeconds) {
              const cooldownMessage = `⏳ Rate limit: Please wait ${errorData.cooldownSeconds} seconds before sending another message. ${selectedModel} has a ${errorData.model === 'gpt-4o' ? '30,000' : ''} tokens-per-minute limit.`
              throw new Error(cooldownMessage)
            }
          } else {
            const text = await response.text()
            // If HTML response, provide helpful message
            if (text.includes("<!DOCTYPE") || text.includes("<html")) {
              errorData = { 
                message: "Server returned HTML instead of JSON. This usually means the API endpoint is incorrect or the server encountered an error.",
                response: "I'm sorry, but there was a server error. Please check your OpenAI API key and try again."
              }
            } else {
              errorData = { message: text.slice(0, 200) }
            }
          }
        } catch (e) {
          // If it's already our formatted error, re-throw it
          if (e instanceof Error && e.message.includes('⏳')) {
            throw e
          }
          errorData = { message: `HTTP ${response.status}: ${response.statusText}` }
        }
        throw new Error(errorData.message || errorData.response || "Failed to get AI response")
      }

      // Check if response is JSON before parsing
      let data: any
      try {
        if (!contentType.includes("application/json")) {
          const text = await response.text()
          if (text.includes("<!DOCTYPE") || text.includes("<html")) {
            throw new Error("Server returned HTML instead of JSON. Please check your server configuration.")
          }
          throw new Error(`Unexpected response type: ${contentType}`)
        }
        data = await response.json()
      } catch (parseError) {
        if (parseError instanceof Error && parseError.message.includes("HTML")) {
          throw parseError
        }
        const text = await response.text()
        throw new Error(`Failed to parse response: ${text.slice(0, 200)}`)
      }
      
      // Add assistant response
      const assistantMessage: Message = {
        role: "assistant",
        content: data.response,
        prompts: data.prompts || [],
      }
      
      setMessages([...newMessages, assistantMessage])
      if (typeof data.sessionId === "string" && onSessionIdChange) {
        onSessionIdChange(data.sessionId)
      }

      // If prompts were extracted, show preview instead of directly adding
      if (data.prompts && data.prompts.length > 0) {
        const extractedWithDurations: ExtractedPrompt[] = data.prompts.map((prompt: string, index: number) => ({
          prompt,
          duration: data.durations?.[index],
        }))
        setPreviewPrompts(extractedWithDurations)
        setShowPromptPreview(true)
      }

      // Report usage for cost tracking
      if (data.usage && onChatUsage) {
        onChatUsage({
          model: data.usage.model,
          inputTokens: data.usage.inputTokens,
          outputTokens: data.usage.outputTokens,
        })
      }
    } catch (error) {
      const errorMessage: Message = {
        role: "assistant",
        content: error instanceof Error 
          ? `Sorry, I encountered an error: ${error.message}. Please make sure your OpenAI API key is configured and the server is running.`
          : "Sorry, I encountered an error. Please try again.",
      }
      setMessages([...newMessages, errorMessage])
    } finally {
      setIsLoading(false)
      onLoadingChange?.(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const clearChat = () => {
    setMessages([
      {
        role: "assistant",
        content: getWelcomeMessage(),
      },
    ])
  }

  const getPreviewTransferPayload = () => {
    const entries = previewPrompts
      .map((item) => ({
        prompt: String(item.prompt || "").trim(),
        duration: Number(item.duration),
      }))
      .filter((item) => item.prompt.length > 0)
      .map((item) => ({
        prompt: selectedImageryStyle?.prompt
          ? `${item.prompt}, ${selectedImageryStyle.prompt}`
          : item.prompt,
        duration: Number.isFinite(item.duration) && item.duration > 0 ? item.duration : 0,
      }))
    const prompts = entries.map((item) => item.prompt)
    const durations = entries.map((item) => item.duration)
    const hasDurations = durations.some((value) => value > 0)
    return {
      prompts,
      durations: hasDurations ? durations : undefined,
    }
  }

  const handleConfirmPrompts = () => {
    const payload = getPreviewTransferPayload()
    if (payload.prompts.length === 0) return
    onPromptsExtracted(payload.prompts, payload.durations)
    setShowPromptPreview(false)
    setPreviewPrompts([])
  }

  const handleSendPreviewToImageQueue = () => {
    if (!onSendToImageQueue) return
    const payload = getPreviewTransferPayload()
    if (payload.prompts.length === 0) return
    onSendToImageQueue(payload.prompts)
    setShowPromptPreview(false)
    setPreviewPrompts([])
  }

  const handleSendPreviewToVideoQueue = () => {
    if (!onSendToVideoQueue) return
    const payload = getPreviewTransferPayload()
    if (payload.prompts.length === 0) return
    onSendToVideoQueue(payload.prompts, payload.durations)
    setShowPromptPreview(false)
    setPreviewPrompts([])
  }

  const handleCancelPrompts = () => {
    setShowPromptPreview(false)
    setPreviewPrompts([])
  }

  // Download prompts as JSON
  const handleDownloadJSON = () => {
    const data = assistantMode === "storymaker" 
      ? {
          projectName: chatName,
          generatedAt: new Date().toISOString(),
          totalScenes: previewPrompts.length,
          totalDuration: previewPrompts.reduce((sum, p) => sum + (p.duration || 0), 0),
          scenes: previewPrompts.map((p, i) => ({
            sceneNumber: i + 1,
            prompt: p.prompt,
            duration: p.duration,
          })),
        }
      : {
          sessionName: chatName,
          generatedAt: new Date().toISOString(),
          prompts: previewPrompts.map(p => p.prompt),
        }

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${chatName.replace(/[^a-z0-9]/gi, '_')}.json`
    document.body.appendChild(a)
    a.click()
    URL.revokeObjectURL(url)
    document.body.removeChild(a)
  }

  // Download prompts as TXT
  const handleDownloadTXT = () => {
    let content = ""
    if (assistantMode === "storymaker") {
      content = `${chatName}\n`
      content += `Generated: ${new Date().toLocaleString()}\n`
      content += `Total Scenes: ${previewPrompts.length}\n`
      content += `Total Duration: ${previewPrompts.reduce((sum, p) => sum + (p.duration || 0), 0)} seconds\n`
      content += "\n" + "=".repeat(60) + "\n\n"
      
      previewPrompts.forEach((p, i) => {
        content += `SCENE ${i + 1}${p.duration ? ` [Duration: ${p.duration}s]` : ""}\n`
        content += "-".repeat(40) + "\n"
        content += `${p.prompt}\n\n`
      })
    } else {
      content = `${chatName}\n`
      content += `Generated: ${new Date().toLocaleString()}\n`
      content += `Total Prompts: ${previewPrompts.length}\n\n`
      content += "=".repeat(60) + "\n\n"
      
      previewPrompts.forEach((p, i) => {
        content += `Prompt ${i + 1}:\n`
        content += `${p.prompt}\n\n`
      })
    }

    const blob = new Blob([content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${chatName.replace(/[^a-z0-9]/gi, '_')}.txt`
    document.body.appendChild(a)
    a.click()
    URL.revokeObjectURL(url)
    document.body.removeChild(a)
  }

  // Download prompts as PDF
  const handleDownloadPDF = async () => {
    try {
      const data = assistantMode === "storymaker"
        ? {
            sessionName: chatName,
            prompts: [],
            mode: "storymaker",
            scenes: previewPrompts.map((p, i) => ({
              sceneNumber: i + 1,
              prompt: p.prompt,
              duration: p.duration,
            })),
          }
        : {
            sessionName: chatName,
            prompts: previewPrompts.map(p => p.prompt),
            mode: "advanced-prompting",
          }

      const response = await fetch("/api/prompts/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        throw new Error("Failed to generate PDF")
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${chatName.replace(/[^a-z0-9]/gi, '_')}.pdf`
      document.body.appendChild(a)
      a.click()
      URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error("Failed to download PDF:", error)
      alert("Failed to generate PDF. Please try again.")
    }
  }

  const updatePreviewPrompt = (index: number, prompt: string) => {
    setPreviewPrompts(prev => prev.map((p, i) => i === index ? { ...p, prompt } : p))
  }

  const updatePreviewDuration = (index: number, duration: number) => {
    setPreviewPrompts(prev => prev.map((p, i) => i === index ? { ...p, duration } : p))
  }

  const removePreviewPrompt = (index: number) => {
    setPreviewPrompts(prev => prev.filter((_, i) => i !== index))
  }

  const addPreviewPrompt = () => {
    setPreviewPrompts(prev => [...prev, { prompt: "", duration: mode === "video" ? 5 : undefined }])
  }

  return (
    <>
      {/* Backdrop - only show when open */}
      {!isEmbedded && isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity animate-fade-in"
          onClick={() => onClose?.()}
        />
      )}
      
      {/* Centered Modal */}
      <div className={cn(
        isEmbedded
          ? "relative w-full h-full"
          : "fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none",
        isEmbedded
          ? "opacity-100"
          : isOpen
            ? "opacity-100"
            : "opacity-0"
      )}>
        <div 
          className={cn(
            "bg-[var(--color-surface)] shadow-2xl rounded-2xl transform transition-all duration-300 ease-out overflow-hidden flex flex-col pointer-events-auto relative",
            isEmbedded
              ? "w-full h-full scale-100 opacity-100"
              : isOpen
                ? "scale-100 opacity-100"
                : "scale-95 opacity-0 pointer-events-none",
            isResizing && "select-none"
          )}
          style={isEmbedded
            ? undefined
            : {
                width: `${chatSize.width}px`,
                height: `${chatSize.height}px`,
                maxWidth: "90vw",
                maxHeight: "90vh",
              }}
        >
        <Card className={cn(
          "h-full border-0 rounded-2xl mb-0 flex flex-col",
          isEmbedded && "rounded-xl"
        )}>
          <CardHeader className="pb-4 border-b border-[var(--color-border)] bg-gradient-to-r from-[var(--color-surface)] to-[var(--color-background)]">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "p-2.5 rounded-xl shadow-lg",
                    assistantMode === "storymaker"
                    ? "bg-gradient-to-br from-purple-500 to-pink-500"
                      : assistantMode === "manager"
                        ? "bg-gradient-to-br from-emerald-500 to-teal-500"
                    : "bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)]"
                )}>
                  {assistantMode === "storymaker" ? (
                    <Film className="w-6 h-6 text-white" />
                  ) : assistantMode === "manager" ? (
                    <Wand2 className="w-6 h-6 text-white" />
                  ) : (
                    <Bot className="w-6 h-6 text-white" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-xl">
                      {assistantMode === "manager"
                        ? (roleName || "Autopilot Manager")
                        : assistantMode === "storymaker" 
                        ? "AI StoryCreator Mode" 
                        : assistantMode === "advanced-prompting"
                        ? "Advanced Prompting Mode"
                        : "AI Prompt Assistant"}
                    </CardTitle>
                    {/* Mode Toggle Buttons */}
                    <div className="flex items-center gap-1">
                      {supportsManagerMode ? (
                        <button
                          onClick={() => handleAssistantModeChange("manager")}
                          disabled={isLoading}
                          className={cn(
                            "px-2 py-1 text-xs font-medium rounded-md transition-all",
                            assistantMode === "manager"
                              ? "bg-emerald-600/30 text-emerald-300 hover:bg-emerald-600/40"
                              : "bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
                          )}
                          title="Master Manager Mode"
                        >
                          Manager
                        </button>
                      ) : null}
                      <button
                        onClick={() => handleAssistantModeChange("normal")}
                        disabled={isLoading}
                        className={cn(
                          "px-2 py-1 text-xs font-medium rounded-md transition-all",
                          assistantMode === "normal"
                            ? "bg-[var(--color-primary)] text-white"
                            : "bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
                        )}
                        title="Normal Mode"
                      >
                        Normal
                      </button>
                      <button
                        onClick={() => handleAssistantModeChange("storymaker")}
                        disabled={isLoading}
                        className={cn(
                          "px-2 py-1 text-xs font-medium rounded-md transition-all",
                          assistantMode === "storymaker"
                            ? "bg-purple-500/20 text-purple-400 hover:bg-purple-500/30"
                            : "bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
                        )}
                        title="AI StoryCreator Mode"
                      >
                        StoryCreator
                      </button>
                      <button
                        onClick={() => handleAssistantModeChange("advanced-prompting")}
                        disabled={isLoading}
                        className={cn(
                          "px-2 py-1 text-xs font-medium rounded-md transition-all",
                          assistantMode === "advanced-prompting"
                            ? "bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30"
                            : "bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
                        )}
                        title="Advanced Prompting Mode"
                      >
                        Advanced
                      </button>
                    </div>
                  </div>
                  <CardDescription className="text-sm">
                    {assistantMode === "manager"
                      ? "Dynamic conversation first, with smart specialist delegation when needed"
                      : assistantMode === "storymaker"
                      ? "Turn scripts into scene prompts automatically"
                      : assistantMode === "advanced-prompting"
                      ? "Professional prompt engineering with persistence and export"
                      : mode === "video" 
                        ? "Describe video scenes with durations (e.g., '5s scene of...')" 
                        : "Describe images and I'll extract prompts automatically"}
                  </CardDescription>
                </div>
              </div>
              
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={clearChat}
                    className="h-9 w-9 hover:bg-[var(--color-error)]/10 hover:text-[var(--color-error)]"
                    title="Clear chat"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                  {onClose && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onClose}
                      className="h-9 px-4"
                    >
                      Close
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-[var(--color-text-dim)] font-medium">Model:</label>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    disabled={isLoading}
                    className="text-xs h-7 px-2 py-1 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] disabled:opacity-50"
                  >
                    <option value="gpt-4o">GPT-4o</option>
                    <option value="gpt-5-nano">GPT-5 Nano</option>
                    <option value="gpt-5">GPT-5</option>
                    <option value="gpt-5.2">GPT-5.2</option>
                  </select>
                </div>
                {assistantMode === "storymaker" && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-[var(--color-text-dim)] font-medium">Prompts:</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={desiredPromptCount}
                      onChange={(e) => setDesiredPromptCount(parseInt(e.target.value) || 0)}
                      disabled={isLoading}
                      placeholder="Auto"
                      className="text-xs h-7 w-20 px-2 py-1 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] disabled:opacity-50"
                      title="Number of prompts to generate (0 = auto-detect)"
                    />
                  </div>
                )}
                {/* Imagery Style Selector */}
                {onSelectImageryStyle && (
                  <div className="flex items-center gap-2 relative">
                    <label className="text-xs text-[var(--color-text-dim)] font-medium flex items-center gap-1">
                      <Palette className="w-3 h-3" />
                      Style:
                    </label>
                    <button
                      onClick={() => setIsStyleDropdownOpen(!isStyleDropdownOpen)}
                      disabled={isLoading}
                      className={cn(
                        "text-xs h-7 px-2 py-1 bg-[var(--color-background)] border rounded-lg flex items-center gap-1.5 min-w-[120px] justify-between transition-colors",
                        selectedImageryStyle 
                          ? "border-[var(--color-primary)] text-[var(--color-text)]" 
                          : "border-[var(--color-border)] text-[var(--color-text-muted)]",
                        isLoading && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <span className="truncate">
                        {selectedImageryStyle?.name || "None"}
                      </span>
                      <ChevronDown className={cn("w-3 h-3 transition-transform", isStyleDropdownOpen && "rotate-180")} />
                    </button>
                    
                    {/* Style Dropdown */}
                    {isStyleDropdownOpen && (
                      <div className="absolute top-full right-0 mt-1 w-64 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-xl z-50 overflow-hidden">
                        <div className="max-h-60 overflow-y-auto">
                          <button
                            onClick={() => {
                              onSelectImageryStyle(null)
                              setIsStyleDropdownOpen(false)
                            }}
                            className={cn(
                              "w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-hover)] transition-colors flex items-center gap-2",
                              !selectedImageryStyle && "bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                            )}
                          >
                            <X className="w-4 h-4" />
                            <span>No Style</span>
                          </button>
                          {availableStyles?.map((style) => (
                            <button
                              key={style.id}
                              onClick={() => {
                                onSelectImageryStyle(style)
                                setIsStyleDropdownOpen(false)
                              }}
                              className={cn(
                                "w-full px-3 py-2 text-left hover:bg-[var(--color-surface-hover)] transition-colors",
                                selectedImageryStyle?.id === style.id && "bg-[var(--color-primary)]/10"
                              )}
                            >
                              <div className="flex items-center justify-between">
                                <span className={cn(
                                  "text-sm font-medium",
                                  selectedImageryStyle?.id === style.id ? "text-[var(--color-primary)]" : "text-[var(--color-text)]"
                                )}>
                                  {style.name}
                                </span>
                                {selectedImageryStyle?.id === style.id && (
                                  <Check className="w-4 h-4 text-[var(--color-primary)]" />
                                )}
                              </div>
                              <p className="text-xs text-[var(--color-text-dim)] mt-0.5 line-clamp-1">
                                {style.description}
                              </p>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Mode Description */}
            <ModeDescription
              mode={assistantMode}
              className="mt-4"
            />

            {/* Pricing Info Bar & Story Base Indicator */}
            <div className="px-4 py-2 bg-[var(--color-background)]/50 border-t border-[var(--color-border)]">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-[var(--color-text-dim)]">
                  <span className="font-medium text-[var(--color-text)]">
                    {selectedModel === "gpt-4o" ? "GPT-4o" : selectedModel === "gpt-5-nano" ? "GPT-5 Nano" : selectedModel === "gpt-5" ? "GPT-5" : "GPT-5.2"}
                  </span> • 
                  Input: <span className="text-[var(--color-primary)]">{modelPricing[selectedModel].input}</span> / 
                  Output: <span className="text-[var(--color-primary)]">{modelPricing[selectedModel].output}</span> per 100k tokens
                  {modelPricing[selectedModel].description && (
                    <span className="ml-1 text-[var(--color-text-dim)]">({modelPricing[selectedModel].description})</span>
                  )}
                </p>
                {assistantMode === "storymaker" && activeStoryBase && (
                  <div className="px-2 py-1 bg-orange-500/20 border border-orange-500/30 rounded text-xs text-orange-400 flex items-center gap-1">
                    <Layers className="w-3 h-3" />
                    Story Base: {activeStoryBase.name}
                  </div>
                )}
                {selectedImageryStyle && (
                  <div className="px-2 py-1 bg-purple-500/20 border border-purple-500/30 rounded text-xs text-purple-400 flex items-center gap-1">
                    <Palette className="w-3 h-3" />
                    Style: {selectedImageryStyle.name}
                  </div>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent 
            ref={dropZoneRef}
            className="p-0 relative flex-1 flex flex-col overflow-hidden"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
          {/* Drag overlay */}
          {isDragging && (
            <div className="absolute inset-0 z-50 bg-[var(--color-primary)]/20 border-2 border-dashed border-[var(--color-primary)] rounded-lg flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <ImageIcon className="w-12 h-12 mx-auto mb-2 text-[var(--color-primary)]" />
                <p className="text-lg font-medium text-[var(--color-primary)]">Drop images here</p>
                <p className="text-sm text-[var(--color-text-muted)]">Release to upload</p>
              </div>
            </div>
          )}
          
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[var(--color-background)]">
            {messages.map((message, index) => (
              <div
                key={index}
                className={cn(
                  "flex gap-3",
                  message.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {message.role === "assistant" && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)] flex items-center justify-center">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[80%] rounded-lg px-4 py-2",
                    message.role === "user"
                      ? "bg-[var(--color-primary)] text-white"
                      : "bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-border)]"
                  )}
                >
                  {/* Display images if present */}
                  {message.images && message.images.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {message.images.map((img, imgIndex) => (
                        <img
                          key={imgIndex}
                          src={img}
                          alt={`Upload ${imgIndex + 1}`}
                          className="max-w-[200px] max-h-[200px] rounded-lg object-cover border border-white/20"
                        />
                      ))}
                    </div>
                  )}
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  {message.prompts && message.prompts.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-[var(--color-border)]">
                      <p className="text-xs font-medium text-[var(--color-accent)] mb-1">
                        ✨ Extracted {message.prompts.length} prompt{message.prompts.length > 1 ? "s" : ""}:
                      </p>
                      <ul className="text-xs space-y-1">
                        {message.prompts.map((prompt, i) => (
                          <li key={i} className="text-[var(--color-text-muted)]">
                            • {prompt}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                {message.role === "user" && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center">
                    <User className="w-4 h-4 text-[var(--color-text)]" />
                  </div>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3 justify-start">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)] flex items-center justify-center">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-2">
                  <Loader2 className="w-4 h-4 animate-spin text-[var(--color-accent)]" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
              {/* Uploaded images preview */}
              {uploadedImages.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {uploadedImages.map((img, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={img}
                        alt={`Preview ${index + 1}`}
                        className="w-16 h-16 rounded-lg object-cover border border-[var(--color-border)]"
                      />
                      <button
                        onClick={() => removeImage(index)}
                        className="absolute -top-1 -right-1 p-0.5 bg-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <XCircle className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <div className="flex-1 flex flex-col gap-2">
                  <Textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={uploadedImages.length > 0 ? "Describe what you see or what you want to generate..." : "Describe the images you want to generate or upload an image..."}
                    className="min-h-[60px] max-h-[120px] resize-none"
                    disabled={isLoading || disabled}
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageUpload}
                    className="hidden"
                    disabled={isLoading || disabled}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading || disabled}
                    className="h-10 w-10"
                    title="Upload image"
                  >
                    <ImageIcon className="w-4 h-4" />
                  </Button>
                  <Button
                    onClick={handleSend}
                    disabled={(!input.trim() && uploadedImages.length === 0) || isLoading || disabled}
                    className="h-10"
                    data-auto-send="true"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-[var(--color-text-dim)] mt-2">
                Press Enter to send, Shift+Enter for new line • Manager mode auto-routes specialist tasks • Click image icon to upload
              </p>
            </div>
          </CardContent>
        </Card>
        </div>
      </div>

      {/* Prompt Preview Modal */}
      {showPromptPreview && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in"
          onClick={() => setShowPromptPreview(false)}
        >
          <div className={cn(
            "w-full max-h-[90vh] bg-[var(--color-surface)] rounded-2xl shadow-2xl overflow-hidden flex flex-col",
            assistantMode === "storymaker" && originalScript ? "max-w-7xl" : "max-w-3xl"
          )} onClick={(event) => event.stopPropagation()}>
            {/* Header */}
            <div className={cn(
              "p-4 border-b border-[var(--color-border)]",
              assistantMode === "storymaker" 
                ? "bg-gradient-to-r from-purple-500/10 to-pink-500/10"
                : "bg-gradient-to-r from-[var(--color-primary)]/10 to-[var(--color-accent)]/10"
            )}>
              <h3 className="text-lg font-semibold text-[var(--color-text)] flex items-center gap-2">
                {assistantMode === "storymaker" ? (
                  <>
                    <Film className="w-5 h-5 text-purple-400" />
                    AI StoryCreator Mode: Scene Extraction
                  </>
                ) : (
                  "📋 Review Extracted Prompts"
                )}
                <span className="text-sm font-normal text-[var(--color-text-dim)] bg-[var(--color-background)] px-2 py-0.5 rounded-full">
                  {previewPrompts.length} scene{previewPrompts.length !== 1 ? "s" : ""}
                </span>
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                {assistantMode === "storymaker" 
                  ? "Compare your original script with extracted scenes side-by-side"
                  : "Review and edit the extracted prompts before adding them to your batch"}
              </p>
            </div>

            {/* Side-by-Side View for AI StoryCreator Mode */}
            {assistantMode === "storymaker" && originalScript ? (
              <div className="flex-1 overflow-hidden flex">
                {/* Left: Original Script */}
                <div className="w-1/2 border-r border-[var(--color-border)] flex flex-col">
                  <div className="p-3 bg-[var(--color-background)] border-b border-[var(--color-border)]">
                    <h4 className="text-sm font-semibold text-[var(--color-text)] flex items-center gap-2">
                      <SplitSquareHorizontal className="w-4 h-4" />
                      Original Script
                    </h4>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4">
                    <pre className="text-sm text-[var(--color-text)] whitespace-pre-wrap font-mono leading-relaxed">
                      {originalScript}
                    </pre>
                  </div>
                </div>

                {/* Right: Extracted Scenes */}
                <div className="w-1/2 flex flex-col">
                  <div className="p-3 bg-[var(--color-background)] border-b border-[var(--color-border)]">
                    <h4 className="text-sm font-semibold text-[var(--color-text)] flex items-center gap-2">
                      <Sparkles className="w-4 h-4" />
                      Extracted Scenes
                    </h4>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {previewPrompts.map((item, index) => (
                <div
                  key={index}
                  className="p-3 bg-[var(--color-background)] rounded-lg border border-[var(--color-border)] hover:border-[var(--color-primary)] transition-colors"
                >
                  <div className="flex items-start gap-2 mb-2">
                    <div className="flex-shrink-0 w-6 h-6 bg-[var(--color-primary)] rounded-full flex items-center justify-center text-xs font-bold text-white">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <Textarea
                        value={item.prompt}
                        onChange={(e) => updatePreviewPrompt(index, e.target.value)}
                        placeholder="Enter prompt..."
                        className="text-sm min-h-[60px]"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removePreviewPrompt(index)}
                      className="flex-shrink-0 h-8 w-8 text-[var(--color-error)] hover:bg-red-950/20"
                      title="Remove prompt"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  {mode === "video" && (
                    <div className="flex items-center gap-2 mt-2">
                      <label className="text-xs text-[var(--color-text-muted)] font-medium">Duration:</label>
                      <select
                        value={item.duration || 5}
                        onChange={(e) => updatePreviewDuration(index, Number(e.target.value))}
                        className="text-xs h-7 px-2 py-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                      >
                        <option value={4}>4s</option>
                        <option value={5}>5s</option>
                        <option value={6}>6s</option>
                        <option value={8}>8s</option>
                        <option value={10}>10s</option>
                        <option value={15}>15s</option>
                        <option value={20}>20s</option>
                      </select>
                    </div>
                  )}
                </div>
              ))}

              {/* Add Another Prompt Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={addPreviewPrompt}
                className="w-full"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Another Scene
              </Button>
                  </div>
                </div>
              </div>
            ) : (
              /* Normal View (No Side-by-Side) */
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {previewPrompts.map((item, index) => (
                  <div
                    key={index}
                    className="p-3 bg-[var(--color-background)] rounded-lg border border-[var(--color-border)] hover:border-[var(--color-primary)] transition-colors"
                  >
                    <div className="flex items-start gap-2 mb-2">
                      <div className="flex-shrink-0 w-6 h-6 bg-[var(--color-primary)] rounded-full flex items-center justify-center text-xs font-bold text-white">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <Textarea
                          value={item.prompt}
                          onChange={(e) => updatePreviewPrompt(index, e.target.value)}
                          placeholder="Enter prompt..."
                          className="text-sm min-h-[60px]"
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removePreviewPrompt(index)}
                        className="flex-shrink-0 h-8 w-8 text-[var(--color-error)] hover:bg-red-950/20"
                        title="Remove prompt"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    {mode === "video" && (
                      <div className="flex items-center gap-2 mt-2">
                        <label className="text-xs text-[var(--color-text-muted)] font-medium">Duration:</label>
                        <select
                          value={item.duration || 5}
                          onChange={(e) => updatePreviewDuration(index, Number(e.target.value))}
                          className="text-xs h-7 px-2 py-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                        >
                          <option value={4}>4s</option>
                          <option value={5}>5s</option>
                          <option value={6}>6s</option>
                          <option value={8}>8s</option>
                          <option value={10}>10s</option>
                          <option value={15}>15s</option>
                          <option value={20}>20s</option>
                        </select>
                      </div>
                    )}
                  </div>
                ))}

                {/* Add Another Prompt Button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addPreviewPrompt}
                  className="w-full"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Another Prompt
                </Button>
              </div>
            )}

            {/* Footer Actions */}
            <div className="p-4 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
              {/* AI StoryCreator Mode Extra Actions */}
              {assistantMode === "storymaker" && (
                <div className="flex items-center gap-2 mb-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      if (isLoading) return
                      setIsLoading(true)
                      try {
                        // Send request to split scenes further
                        const response = await fetch("/api/chat", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            messages: [
                              { role: "user", content: `Split these ${previewPrompts.length} scenes into more detailed scenes:\n\n${previewPrompts.map((p, i) => `Scene ${i+1}: ${p.prompt}`).join('\n\n')}` }
                            ],
                            mode,
                            model: selectedModel,
                            assistantMode: "storymaker",
                          }),
                        })
                        const data = await response.json()
                        if (data.prompts && data.prompts.length > 0) {
                          const extracted: ExtractedPrompt[] = data.prompts.map((prompt: string, index: number) => ({
                            prompt,
                            duration: data.durations?.[index],
                          }))
                          setPreviewPrompts(extracted)
                        }
                      } catch (error) {
                        console.error("Failed to split scenes:", error)
                      } finally {
                        setIsLoading(false)
                      }
                    }}
                    disabled={isLoading || previewPrompts.length === 0}
                    className="flex-1"
                  >
                    <SplitSquareHorizontal className="w-4 h-4 mr-1" />
                    Split into More Scenes
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      if (isLoading) return
                      setIsLoading(true)
                      try {
                        // Send request to enhance scenes
                        const response = await fetch("/api/chat", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            messages: [
                              { role: "user", content: `Enhance these scene prompts with more visual details, camera movements, lighting, and atmosphere:\n\n${previewPrompts.map((p, i) => `Scene ${i+1}: ${p.prompt}`).join('\n\n')}` }
                            ],
                            mode,
                            model: selectedModel,
                            assistantMode: "storymaker",
                          }),
                        })
                        const data = await response.json()
                        if (data.prompts && data.prompts.length > 0) {
                          const enhanced: ExtractedPrompt[] = data.prompts.map((prompt: string, index: number) => ({
                            prompt,
                            duration: data.durations?.[index] || previewPrompts[index]?.duration,
                          }))
                          setPreviewPrompts(enhanced)
                        }
                      } catch (error) {
                        console.error("Failed to enhance scenes:", error)
                      } finally {
                        setIsLoading(false)
                      }
                    }}
                    disabled={isLoading || previewPrompts.length === 0}
                    className="flex-1"
                  >
                    <Wand2 className="w-4 h-4 mr-1" />
                    Enhance Details
                  </Button>
                </div>
              )}

              {/* Download Options */}
              {assistantMode === "storymaker" && previewPrompts.length > 0 && (
                <div className="flex items-center gap-2 pt-2 border-t border-[var(--color-border)]">
                  <p className="text-xs text-[var(--color-text-dim)] flex-shrink-0">Download:</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDownloadJSON}
                    className="text-xs"
                  >
                    <Download className="w-3 h-3 mr-1" />
                    JSON
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDownloadTXT}
                    className="text-xs"
                  >
                    <Download className="w-3 h-3 mr-1" />
                    TXT
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDownloadPDF}
                    className="text-xs"
                  >
                    <Download className="w-3 h-3 mr-1" />
                    PDF
                  </Button>
                </div>
              )}

              {/* Main Actions */}
              {(onSendToImageQueue || onSendToVideoQueue) && (
                <div className="flex items-center gap-2 mb-2">
                  {onSendToImageQueue ? (
                    <Button
                      variant="outline"
                      onClick={handleSendPreviewToImageQueue}
                      disabled={previewPrompts.length === 0 || previewPrompts.every(p => !p.prompt.trim())}
                      className="flex-1"
                    >
                      <ImageIcon className="w-4 h-4 mr-1" />
                      Send to Image
                    </Button>
                  ) : null}
                  {onSendToVideoQueue ? (
                    <Button
                      variant="outline"
                      onClick={handleSendPreviewToVideoQueue}
                      disabled={previewPrompts.length === 0 || previewPrompts.every(p => !p.prompt.trim())}
                      className="flex-1"
                    >
                      <Film className="w-4 h-4 mr-1" />
                      Send to Video
                    </Button>
                  ) : null}
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={handleCancelPrompts}
                  className="flex-1"
                >
                  <X className="w-4 h-4 mr-1" />
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirmPrompts}
                  disabled={previewPrompts.length === 0 || previewPrompts.every(p => !p.prompt.trim())}
                  className="flex-1"
                >
                  <Check className="w-4 h-4 mr-1" />
                  Confirm & Add {previewPrompts.filter(p => p.prompt.trim()).length} {assistantMode === "storymaker" ? "Scene" : "Prompt"}{previewPrompts.filter(p => p.prompt.trim()).length !== 1 ? "s" : ""}
                </Button>
              </div>
            </div>
          </div>
          
          {/* Resize Handle */}
          {!isEmbedded && (
            <div
              className="absolute bottom-0 right-0 w-6 h-6 cursor-se-resize hover:bg-[var(--color-primary)]/20 rounded-tl-lg flex items-center justify-center group transition-colors"
              onMouseDown={handleResizeStart}
              title="Drag to resize"
            >
              <div className="w-3 h-3 border-r-2 border-b-2 border-[var(--color-border-bright)] group-hover:border-[var(--color-primary)] transition-colors" />
            </div>
          )}
        </div>
      )}
    </>
  )
}

