// ============================================================
// DNK AI Studio - Casting Card (shared)
// ------------------------------------------------------------
// The single source of truth for a casting element card:
// thumbnail + name/description + per-element Generate/Regenerate
// wired to /api/generate (with StoryBase imagery-style injection)
// then persisted via /api/casting/:type.
//
// Mounted in TWO places, zero rewrite:
//   1) CastingBoard  — responsive grid (Phase 1 grid view)
//   2) CastingNode   — a React Flow node on the Workboard canvas (Phase 2)
// ============================================================

import { useState } from "react"
import {
  Sparkles,
  RefreshCw,
  ImageIcon,
  AlertTriangle,
  Loader2,
} from "lucide-react"
import { Button } from "./Button"
import type { ImageryStyle } from "@/types/StudioMode"

export type CastingType = "characters" | "objects" | "environments" | "atmospheres"

export interface CastingElement {
  id: string
  name: string
  description: string
  image?: string
  createdAt: number
  updatedAt?: number
}

interface CastingCardProps {
  type: CastingType
  singular: string
  element: CastingElement
  storyBaseId: string
  activeStyle: ImageryStyle | null
  model?: string
  /** Fired after a fresh image is generated + persisted for this element. */
  onGenerated: (updated: CastingElement) => void
  /** Compact chrome for the canvas node (removes rounded card border/shadow duplication). */
  variant?: "grid" | "node"
}

// Build an isolated, on-style prompt for a single casting element.
// We intentionally render ONLY this subject — visual-style consistency
// comes from the injected imageryStyle prompt, not from blending elements.
export function buildElementPrompt(type: CastingType, el: CastingElement): string {
  const base = `${el.name}. ${el.description}`.trim()
  switch (type) {
    case "characters":
      return `${base}. Full character reference portrait, single subject, centered composition, clean neutral studio background, consistent character design.`
    case "objects":
      return `${base}. Clean product-style reference shot of this single object, centered, neutral background, no people.`
    case "environments":
      return `${base}. Establishing wide reference shot of this location/setting, no people, no text.`
    case "atmospheres":
      return `${base}. Atmospheric mood reference emphasizing lighting, color and ambience.`
  }
}

export function CastingCard({
  type,
  singular,
  element,
  storyBaseId,
  activeStyle,
  model = "gemini-3-pro-image-preview",
  onGenerated,
  variant = "grid",
}: CastingCardProps) {
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasImage = !!element.image

  const handleGenerate = async () => {
    setIsBusy(true)
    setError(null)
    try {
      // 1) Generate via the existing pipeline, injecting the story's imagery style.
      const genRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: buildElementPrompt(type, element),
          model,
          aspectRatio: "1:1",
          imageSize: "1K",
          imageryStyle: activeStyle || undefined,
        }),
      })
      if (!genRes.ok) {
        const err = await genRes.json().catch(() => ({}))
        throw new Error(err.message || "Image generation failed")
      }
      const gen = await genRes.json()
      const imageUrl: string | undefined = gen.imageUrl
      if (!imageUrl) throw new Error("No image was returned by the generator")

      // 2) Persist the image against this element.
      const saveRes = await fetch(`/api/casting/${type}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyBaseId, elementId: element.id, image: imageUrl }),
      })
      if (!saveRes.ok) {
        const err = await saveRes.json().catch(() => ({}))
        throw new Error(err.error || "Failed to save image")
      }

      // 3) Bubble the fresh element up to the parent.
      onGenerated({ ...element, image: imageUrl, updatedAt: Date.now() })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      setIsBusy(false)
    }
  }

  const shellClass =
    variant === "node"
      ? "flex flex-col overflow-hidden"
      : "group flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] overflow-hidden focus-within:ring-2 focus-within:ring-orange-500"

  return (
    <div className={shellClass}>
      {/* Thumbnail */}
      <div className="relative aspect-square bg-[var(--color-surface)] flex items-center justify-center overflow-hidden">
        {hasImage ? (
          <img
            src={element.image}
            alt={`${element.name} — generated ${singular} thumbnail`}
            className="w-full h-full object-cover"
            loading="lazy"
            draggable={false}
          />
        ) : (
          <div className="flex flex-col items-center text-[var(--color-text-dim)]">
            <ImageIcon className="w-8 h-8" />
            <span className="text-[10px] mt-1 uppercase tracking-wide">No image</span>
          </div>
        )}

        {isBusy && (
          <div
            className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="w-6 h-6 text-white animate-spin" />
            <span className="text-xs text-white">Generating…</span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-col flex-1 p-3 gap-1">
        <h4
          className="text-sm font-semibold text-[var(--color-text)] truncate"
          title={element.name}
        >
          {element.name}
        </h4>
        <p className="text-xs text-[var(--color-text-muted)] line-clamp-2">
          {element.description}
        </p>

        {error && (
          <p className="flex items-start gap-1 text-xs text-red-500 mt-1">
            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
            <span>{error}</span>
          </p>
        )}

        <div className="mt-auto pt-2">
          <Button
            size="sm"
            variant={hasImage ? "outline" : "default"}
            className="w-full nodrag"
            disabled={isBusy}
            onClick={handleGenerate}
            aria-label={`${hasImage ? "Regenerate" : "Generate"} thumbnail for ${element.name}`}
          >
            {isBusy ? (
              <>
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                Working…
              </>
            ) : hasImage ? (
              <>
                <RefreshCw className="w-3 h-3 mr-1" />
                Regenerate
              </>
            ) : (
              <>
                <Sparkles className="w-3 h-3 mr-1" />
                Generate
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
