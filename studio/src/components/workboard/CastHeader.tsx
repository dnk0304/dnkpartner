// ============================================================
// DNK AI Studio - Cast Header (Workboard)
// ------------------------------------------------------------
// A horizontal "cast row" pinned to the top of a project's
// Workboard (Buzzy.now-style): every character in the StoryBase
// shown as a compact portrait + name. Read-only glance layer —
// character editing still lives in the Casting Board.
//
// Data: GET /api/casting/characters?storyBaseId=... -> CastingElement[]
// (same endpoint/shape the Casting Board reads).
// ============================================================

import { useEffect, useState } from "react"
import { ImageIcon, Users, AlertTriangle } from "lucide-react"
import type { CastingElement } from "../CastingCard"

interface CastHeaderProps {
  storyBaseId: string
}

type LoadState = "loading" | "ready" | "error"

// A single portrait tile. Compact, fixed width, graceful placeholder.
function CastCard({ character }: { character: CastingElement }) {
  const hasImage = Boolean(character.image)
  return (
    <li className="shrink-0 w-[76px]">
      <div className="flex flex-col items-center gap-1.5">
        <div className="relative w-[68px] h-[68px] rounded-full overflow-hidden bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center">
          {hasImage ? (
            <img
              src={character.image}
              alt={character.name}
              title={character.name}
              className="w-full h-full object-cover"
              loading="lazy"
              draggable={false}
            />
          ) : (
            <ImageIcon className="w-6 h-6 text-[var(--color-text-dim)]" aria-hidden="true" />
          )}
        </div>
        <span
          className="w-full text-[11px] leading-tight text-center text-[var(--color-text-muted)] truncate"
          title={character.name}
        >
          {character.name}
        </span>
      </div>
    </li>
  )
}

function SkeletonCard() {
  return (
    <li className="shrink-0 w-[76px]" aria-hidden="true">
      <div className="flex flex-col items-center gap-1.5">
        <div className="w-[68px] h-[68px] rounded-full bg-[var(--color-surface)] animate-pulse" />
        <div className="w-12 h-2.5 rounded bg-[var(--color-surface)] animate-pulse" />
      </div>
    </li>
  )
}

export function CastHeader({ storyBaseId }: CastHeaderProps) {
  const [state, setState] = useState<LoadState>("loading")
  const [characters, setCharacters] = useState<CastingElement[]>([])

  useEffect(() => {
    let cancelled = false
    setState("loading")

    fetch(`/api/casting/characters?storyBaseId=${encodeURIComponent(storyBaseId)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return (await res.json()) as CastingElement[]
      })
      .then((data) => {
        if (cancelled) return
        setCharacters(Array.isArray(data) ? data : [])
        setState("ready")
      })
      .catch(() => {
        if (cancelled) return
        setState("error")
      })

    return () => {
      cancelled = true
    }
  }, [storyBaseId])

  const count = characters.length

  return (
    <section
      aria-label="Project cast"
      className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-background)] px-6 py-3"
    >
      <div className="flex items-center gap-2 mb-2">
        <Users className="w-3.5 h-3.5 text-[var(--color-text-dim)]" aria-hidden="true" />
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-dim)]">
          Cast{state === "ready" && count > 0 ? ` (${count})` : ""}
        </h2>
      </div>

      {state === "loading" && (
        <ul className="flex items-start gap-3" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </ul>
      )}

      {state === "error" && (
        <p className="flex items-center gap-1.5 text-xs text-red-500">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          Couldn&apos;t load the cast. Try reloading the workboard.
        </p>
      )}

      {state === "ready" && count === 0 && (
        <p className="text-xs text-[var(--color-text-muted)]">
          No cast yet — add characters in the Casting Board.
        </p>
      )}

      {state === "ready" && count > 0 && (
        <ul
          role="list"
          tabIndex={0}
          aria-label="Character portraits, horizontally scrollable"
          className="flex items-start gap-3 overflow-x-auto pb-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
        >
          {characters.map((character) => (
            <CastCard key={character.id} character={character} />
          ))}
        </ul>
      )}
    </section>
  )
}
