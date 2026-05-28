import { useState } from "react"
import { Button } from "./Button"
import { Select } from "./Select"
import { Textarea } from "./Textarea"
import { ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"

interface AdvancedViewProps {
  onGenerate: (prompt: string, settings: any) => void
  prompts: Array<{
    id: string
    text: string
    image?: string
    timestamp: Date
  }>
}

export function AdvancedView({ onGenerate, prompts }: AdvancedViewProps) {
  const [prompt, setPrompt] = useState("")
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [settings, setSettings] = useState({
    preset: "lifelike-vision",
    style: "cinematic",
    contrast: "medium",
    genMode: "fast",
    dimensions: "16:9",
    numImages: 1,
    privateMode: false,
  })

  const handleGenerate = () => {
    if (prompt.trim()) {
      onGenerate(prompt, settings)
    }
  }

  return (
    <div className="flex h-screen">
      {/* Left Settings Panel */}
      <aside className="w-52 border-r border-[var(--color-border)] bg-[var(--color-surface)] p-3 overflow-y-auto">
        <div className="space-y-3">
          {/* Preset */}
          <div>
            <label className="text-xs text-[var(--color-text-muted)] mb-1 block">Preset</label>
            <Select
              value={settings.preset}
              onValueChange={(val) => setSettings({ ...settings, preset: val })}
              options={[
                { value: "lifelike-vision", label: "Lifelike Vision" },
                { value: "creative", label: "Creative" },
                { value: "realistic", label: "Realistic" },
              ]}
              className="w-full"
            />
          </div>

          {/* Style */}
          <div>
            <label className="text-xs text-[var(--color-text-muted)] mb-1 block">Style</label>
            <Select
              value={settings.style}
              onValueChange={(val) => setSettings({ ...settings, style: val })}
              options={[
                { value: "cinematic", label: "Cinematic" },
                { value: "photographic", label: "Photographic" },
                { value: "artistic", label: "Artistic" },
              ]}
              className="w-full"
            />
          </div>

          {/* Contrast */}
          <div>
            <label className="text-xs text-[var(--color-text-muted)] mb-1 block">Contrast</label>
            <Select
              value={settings.contrast}
              onValueChange={(val) => setSettings({ ...settings, contrast: val })}
              options={[
                { value: "low", label: "Low" },
                { value: "medium", label: "Medium" },
                { value: "high", label: "High" },
              ]}
              className="w-full"
            />
          </div>

          {/* Generation Mode */}
          <div>
            <label className="text-xs text-[var(--color-text-muted)] mb-1 block">Gen Mode</label>
            <div className="flex gap-1 p-0.5 bg-[var(--color-background)] rounded-lg">
              <button
                onClick={() => setSettings({ ...settings, genMode: "fast" })}
                className={cn(
                  "flex-1 text-xs py-1.5 rounded-md transition-all",
                  settings.genMode === "fast"
                    ? "bg-[var(--color-primary)] text-white"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                )}
              >
                Fast
              </button>
              <button
                onClick={() => setSettings({ ...settings, genMode: "quality" })}
                className={cn(
                  "flex-1 text-xs py-1.5 rounded-md transition-all",
                  settings.genMode === "quality"
                    ? "bg-[var(--color-primary)] text-white"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                )}
              >
                Quality
              </button>
            </div>
          </div>

          {/* Dimensions */}
          <div>
            <label className="text-xs text-[var(--color-text-muted)] mb-1 block">Dimensions</label>
            <div className="grid grid-cols-3 gap-1">
              {["1:1", "16:9", "9:16"].map((dim) => (
                <button
                  key={dim}
                  onClick={() => setSettings({ ...settings, dimensions: dim })}
                  className={cn(
                    "aspect-square rounded-md text-xs transition-all border-2",
                    settings.dimensions === dim
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                      : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-border-bright)]"
                  )}
                >
                  {dim}
                </button>
              ))}
            </div>
          </div>

          {/* Number of Images */}
          <div>
            <label className="text-xs text-[var(--color-text-muted)] mb-1 block"># Images</label>
            <div className="flex gap-1">
              {[1, 2, 3, 4].map((num) => (
                <button
                  key={num}
                  onClick={() => setSettings({ ...settings, numImages: num })}
                  className={cn(
                    "flex-1 py-1.5 rounded-md text-xs transition-all",
                    settings.numImages === num
                      ? "bg-[var(--color-primary)] text-white"
                      : "bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
                  )}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* Private Mode */}
          <div className="flex items-center justify-between">
            <label className="text-xs text-[var(--color-text-muted)]">Private</label>
            <button
              onClick={() => setSettings({ ...settings, privateMode: !settings.privateMode })}
              className={cn(
                "w-10 h-5 rounded-full transition-all relative",
                settings.privateMode ? "bg-[var(--color-primary)]" : "bg-[var(--color-border)]"
              )}
            >
              <div
                className={cn(
                  "w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all",
                  settings.privateMode ? "left-5" : "left-0.5"
                )}
              />
            </button>
          </div>

          {/* Advanced Settings Toggle */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between py-2 px-2 rounded-md hover:bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] text-xs"
          >
            <span>Advanced</span>
            {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {showAdvanced && (
            <div className="space-y-2 text-xs text-[var(--color-text-muted)]">
              <div>
                <label className="block mb-1">Seed</label>
                <input
                  type="number"
                  className="w-full px-2 py-1 rounded bg-[var(--color-background)] border border-[var(--color-border)] text-[var(--color-text)]"
                  placeholder="Random"
                />
              </div>
              <div>
                <label className="block mb-1">Steps</label>
                <input
                  type="number"
                  className="w-full px-2 py-1 rounded bg-[var(--color-background)] border border-[var(--color-border)] text-[var(--color-text)]"
                  defaultValue={30}
                />
              </div>
            </div>
          )}

          {/* Reset Button */}
          <button className="w-full py-2 rounded-md border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]">
            ⟳ Reset to Defaults
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {/* Top Prompt Bar */}
        <div className="border-b border-[var(--color-border)] p-4 bg-[var(--color-surface)]">
          <div className="flex gap-3">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe what you want to create..."
              className="flex-1 min-h-[60px] max-h-[120px] resize-none border-gradient-animated"
            />
            <Button
              onClick={handleGenerate}
              variant="playful"
              size="lg"
              className="px-8"
            >
              Generate
            </Button>
          </div>
        </div>

        {/* Results Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {prompts.map((item) => (
              <div
                key={item.id}
                className="group relative bg-[var(--color-surface)] rounded-lg overflow-hidden border border-[var(--color-border)] hover:border-[var(--color-primary)] transition-all"
              >
                {/* Image */}
                {item.image ? (
                  <div className="aspect-square">
                    <img
                      src={item.image}
                      alt={item.text}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="aspect-square bg-[var(--color-background)] flex items-center justify-center">
                    <span className="text-[var(--color-text-muted)] text-sm">Generating...</span>
                  </div>
                )}

                {/* Prompt Text */}
                <div className="p-3">
                  <p className="text-xs text-[var(--color-text-muted)] line-clamp-2">
                    {item.text}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {prompts.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <p className="text-[var(--color-text-muted)]">
                Enter a prompt and click Generate to start creating
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

