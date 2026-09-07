// ============================================================
// DNK AI Studio - Casting Board (Phase 1 MVP · grid view)
// ------------------------------------------------------------
// Turns Studio Mode's text-only casting into a VISUAL board:
// a responsive card grid of every casting element. Each card is
// the shared <CastingCard> (see CastingCard.tsx) — the same card
// the Phase-2 Workboard mounts inside a canvas node, so the
// generate/persist pipeline lives in exactly one place.
// ============================================================

import { useMemo } from "react"
import { Users, Box, MapPin, Cloud, Sparkles, ImageIcon } from "lucide-react"
import type { ImageryStyle } from "@/types/StudioMode"
import { CastingCard, type CastingElement, type CastingType } from "./CastingCard"

interface StoryBaseLike {
  id: string
  name: string
  characters: CastingElement[]
  objects: CastingElement[]
  environments: CastingElement[]
  atmospheres: CastingElement[]
  imageryStyleId: string | null
}

interface CastingBoardProps {
  storyBase: StoryBaseLike
  availableStyles: ImageryStyle[]
  /** Called after an element image is generated + persisted, with the fresh story base. */
  onStoryBaseUpdated: (storyBase: StoryBaseLike) => void
  /** Model used for still generation — mirrors the app default. */
  model?: string
}

const SECTIONS: {
  type: CastingType
  label: string
  singular: string
  Icon: typeof Users
}[] = [
  { type: "characters", label: "Cast", singular: "character", Icon: Users },
  { type: "objects", label: "Objects", singular: "object", Icon: Box },
  { type: "environments", label: "Scenery", singular: "environment", Icon: MapPin },
  { type: "atmospheres", label: "Atmospheres", singular: "atmosphere", Icon: Cloud },
]

export function CastingBoard({
  storyBase,
  availableStyles,
  onStoryBaseUpdated,
  model,
}: CastingBoardProps) {
  const activeStyle = useMemo(
    () =>
      storyBase.imageryStyleId
        ? availableStyles.find((s) => s.id === storyBase.imageryStyleId) || null
        : null,
    [storyBase.imageryStyleId, availableStyles]
  )

  const totalElements =
    storyBase.characters.length +
    storyBase.objects.length +
    storyBase.environments.length +
    storyBase.atmospheres.length

  const handleGenerated = (type: CastingType, updated: CastingElement) => {
    onStoryBaseUpdated({
      ...storyBase,
      [type]: storyBase[type].map((e) => (e.id === updated.id ? updated : e)),
    })
  }

  if (totalElements === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-10">
        <ImageIcon className="w-12 h-12 text-[var(--color-text-dim)] mb-3" />
        <h3 className="text-lg font-semibold text-[var(--color-text)]">
          No casting elements yet
        </h3>
        <p className="text-sm text-[var(--color-text-muted)] max-w-sm mt-1">
          Switch to the List view and add characters, objects, scenery or
          atmospheres. They'll appear here as a visual board you can generate
          thumbnails for.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-8">
      {/* Style banner */}
      <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
        <Sparkles className="w-4 h-4 text-orange-400" />
        {activeStyle ? (
          <span>
            Generating in style:{" "}
            <span className="font-semibold text-[var(--color-text)]">
              {activeStyle.name}
            </span>
          </span>
        ) : (
          <span>
            No imagery style set — pick one in the Style tab so thumbnails match
            your story's look.
          </span>
        )}
      </div>

      {SECTIONS.map(({ type, label, singular, Icon }) => {
        const elements = storyBase[type]
        if (elements.length === 0) return null

        return (
          <section key={type} aria-labelledby={`casting-${type}`}>
            <h3
              id={`casting-${type}`}
              className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-3"
            >
              <Icon className="w-4 h-4 text-orange-400" />
              {label}
              <span className="text-[var(--color-text-dim)] font-normal normal-case">
                ({elements.length})
              </span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {elements.map((el) => (
                <CastingCard
                  key={el.id}
                  type={type}
                  singular={singular}
                  element={el}
                  storyBaseId={storyBase.id}
                  activeStyle={activeStyle}
                  model={model}
                  onGenerated={(updated) => handleGenerated(type, updated)}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
