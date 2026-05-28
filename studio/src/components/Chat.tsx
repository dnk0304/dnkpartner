import { useState, useRef, useEffect } from "react"
import { Send, Bot, User, Loader2, X, MessageSquare } from "lucide-react"
import { Button } from "./Button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./Card"
import { Textarea } from "./Textarea"
import { cn } from "@/lib/utils"

interface Message {
  role: "user" | "assistant"
  content: string
  prompts?: string[]
}

interface ChatProps {
  onPromptsExtracted: (prompts: string[]) => void
  disabled?: boolean
}

export function Chat({ onPromptsExtracted, disabled }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hi! I'm your AI assistant. Describe the images you want to generate, and I'll automatically identify and extract the prompts for you. You can describe multiple images in one message!",
    },
  ])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || isLoading || disabled) return

    const userMessage = input.trim()
    setInput("")
    setIsLoading(true)

    // Add user message
    const newMessages: Message[] = [
      ...messages,
      { role: "user", content: userMessage },
    ]
    setMessages(newMessages)

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Unknown error" }))
        throw new Error(errorData.message || errorData.response || "Failed to get AI response")
      }

      const data = await response.json()
      
      // Add assistant response
      const assistantMessage: Message = {
        role: "assistant",
        content: data.response,
        prompts: data.prompts || [],
      }
      
      setMessages([...newMessages, assistantMessage])

      // If prompts were extracted, notify parent
      if (data.prompts && data.prompts.length > 0) {
        onPromptsExtracted(data.prompts)
      }
    } catch (error) {
      const errorMessage: Message = {
        role: "assistant",
        content: error instanceof Error 
          ? `Sorry, I encountered an error: ${error.message}. Please make sure your OpenAI API key is configured.`
          : "Sorry, I encountered an error. Please try again.",
      }
      setMessages([...newMessages, errorMessage])
    } finally {
      setIsLoading(false)
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
        content: "Hi! I'm your AI assistant. Describe the images you want to generate, and I'll automatically identify and extract the prompts for you. You can describe multiple images in one message!",
      },
    ])
  }

  if (!isOpen) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          onClick={() => setIsOpen(true)}
          size="lg"
          className="rounded-full shadow-2xl h-16 w-16"
          disabled={disabled}
        >
          <MessageSquare className="w-6 h-6" />
        </Button>
      </div>
    )
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-96 max-w-[calc(100vw-3rem)]">
      <Card className="shadow-2xl border-2 border-[var(--color-primary)] animate-fade-in-up h-[600px] flex flex-col">
        <CardHeader className="pb-3 flex-shrink-0 border-b border-[var(--color-border)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)] rounded-lg">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-base">AI Prompt Assistant</CardTitle>
                <CardDescription className="text-xs">
                  I'll extract image prompts for you
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={clearChat}
                className="h-8 w-8"
                title="Clear chat"
              >
                <X className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                className="h-8 w-8"
                title="Close chat"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  {message.prompts && message.prompts.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-[var(--color-border)]">
                      <p className="text-xs font-medium text-[var(--color-accent)] mb-1">
                        Extracted {message.prompts.length} prompt{message.prompts.length > 1 ? "s" : ""}:
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
          <div className="p-4 border-t border-[var(--color-border)] flex-shrink-0">
            <div className="flex gap-2">
              <Textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe the images you want to generate..."
                className="min-h-[60px] max-h-[120px] resize-none"
                disabled={isLoading || disabled}
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || isLoading || disabled}
                className="self-end"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-[var(--color-text-dim)] mt-2">
              Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

