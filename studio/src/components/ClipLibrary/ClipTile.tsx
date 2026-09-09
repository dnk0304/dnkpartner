/**
 * One clip in the library grid.
 *
 * Interaction model:
 *   hover      → muted preview starts, so scanning the grid is a glance
 *   click media→ preview plays with sound (a deliberate act, never on hover)
 *   Space      → toggle playback on the focused tile
 *   Enter      → add/remove the focused tile from the cart
 *
 * Accessibility note: the tile is a composite — two distinct actions live on
 * one focusable card, which is why the keyboard shortcuts sit on the card
 * rather than on a single <button> wrapper (a button can only have one
 * activation, and nesting buttons inside a button is invalid). Both actions are
 * also exposed as real <button>s inside the card so pointer and assistive-tech
 * users never depend on the shortcuts.
 */
import { memo, useCallback, useRef, useState } from 'react';
import { Check, Plus, Volume2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { previewUrl } from '../../hooks/useClipLibrary';
import { formatDuration } from '../../hooks/useSelectionCart';
import type { Clip, ClipQuality } from '../../types/ClipLibrary';

/**
 * Quality reads as a rank, so it's encoded by weight rather than by hue alone —
 * "killer" is the only one that carries the accent, and the label is always
 * present as text for anyone who can't use the colour.
 */
const QUALITY_STYLES: Record<ClipQuality, string> = {
  killer: 'bg-[var(--color-accent)]/15 text-[var(--color-accent-hover)] ring-[var(--color-accent)]/40',
  good: 'bg-[var(--color-green)]/12 text-[var(--color-green)] ring-[var(--color-green)]/30',
  usable: 'bg-white/5 text-[var(--color-text-muted)] ring-white/10',
  skip: 'bg-transparent text-[var(--color-text-dim)] ring-white/5',
};

/** Read live rather than cached, so a mid-session OS change is respected. */
function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

interface LaughDotsProps {
  score: number | null;
}

/** Laugh score 1–5. Decorative dots with a text equivalent for screen readers. */
function LaughDots({ score }: LaughDotsProps) {
  if (score === null) return null;
  return (
    <span className="flex items-center gap-[3px]" title={`Laugh score ${score} of 5`}>
      <span className="sr-only">Laugh score {score} of 5</span>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          aria-hidden="true"
          className={cn(
            'h-[5px] w-[5px] rounded-full',
            n <= score ? 'bg-[var(--color-yellow)]' : 'bg-white/15'
          )}
        />
      ))}
    </span>
  );
}

export interface ClipTileProps {
  clip: Clip;
  selected: boolean;
  onToggleSelect: (clip: Clip) => void;
}

function ClipTileImpl({ clip, selected, onToggleSelect }: ClipTileProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playingWithSound, setPlayingWithSound] = useState(false);

  const play = useCallback((withSound: boolean) => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !withSound;
    setPlayingWithSound(withSound);
    // Autoplay can be refused (policy, reduced data). Nothing to recover — the
    // poster frame stays, so the tile is still readable.
    void video.play().catch(() => undefined);
  }, []);

  const stop = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = 0;
    video.muted = true;
    setPlayingWithSound(false);
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) play(playingWithSound);
    else video.pause();
  }, [play, playingWithSound]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      // Let the inner buttons handle their own activation.
      if (event.target !== event.currentTarget) return;
      if (event.key === ' ') {
        event.preventDefault(); // Space would scroll the grid.
        togglePlay();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        onToggleSelect(clip);
      }
    },
    [togglePlay, onToggleSelect, clip]
  );

  return (
    <article
      tabIndex={0}
      aria-label={`${clip.comedian}, ${formatDuration(clip.duration)}, quality ${clip.quality}`}
      onKeyDown={onKeyDown}
      onMouseEnter={() => {
        // Unrequested motion: honour reduced-motion by leaving the poster frame
        // in place. Click-to-play still works — the user asked for that one.
        if (!prefersReducedMotion()) play(false);
      }}
      onMouseLeave={stop}
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-[var(--radius-lg)]',
        'bg-[var(--color-surface)] ring-1 transition-shadow',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary-hover)]',
        selected
          ? 'ring-2 ring-[var(--color-accent)]'
          : 'ring-[var(--color-border)] hover:ring-[var(--color-border-bright)]'
      )}
    >
      {/* Media. The button is the click target for sound-on playback. */}
      <button
        type="button"
        onClick={() => (playingWithSound ? stop() : play(true))}
        aria-label={playingWithSound ? 'Stop preview' : 'Play preview with sound'}
        className="relative block w-full cursor-pointer bg-black focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-primary-hover)]"
        style={{ aspectRatio: '16 / 9' }}
      >
        <video
          ref={videoRef}
          // #t=0.1 makes the browser paint a real frame as the poster instead of
          // leaving the element black until playback starts.
          src={`${previewUrl(clip.id)}#t=0.1`}
          preload="metadata"
          muted
          playsInline
          loop
          className="h-full w-full object-cover"
        />

        <span className="pointer-events-none absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1.5 py-0.5 font-[var(--font-mono)] text-[11px] tabular-nums text-white">
          {formatDuration(clip.duration)}
        </span>

        {playingWithSound && (
          <span className="pointer-events-none absolute left-1.5 top-1.5 rounded bg-black/75 p-1 text-white">
            <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        )}
      </button>

      {/* Meta strip. Its height must match META_HEIGHT in ClipGrid, which is
          what the virtualiser uses to compute row height. */}
      <div className="flex flex-1 flex-col gap-1.5 px-2.5 py-2">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[13px] font-semibold text-[var(--color-text)]">
            {clip.comedian}
          </p>
          <LaughDots score={clip.laugh_score} />
        </div>

        <div className="flex items-center gap-1.5 overflow-hidden">
          <span
            className={cn(
              'shrink-0 rounded px-1.5 py-px text-[10px] font-semibold ring-1 ring-inset',
              QUALITY_STYLES[clip.quality]
            )}
          >
            {clip.quality}
          </span>
          <span className="truncate text-[11px] text-[var(--color-text-dim)]">
            {clip.tags.slice(0, 3).join(', ')}
          </span>
        </div>
      </div>

      {/* Add/remove. Always rendered so it is reachable by tab and by touch,
          not revealed on hover only. */}
      <button
        type="button"
        onClick={() => onToggleSelect(clip)}
        aria-pressed={selected}
        aria-label={selected ? `Remove ${clip.id} from selection` : `Add ${clip.id} to selection`}
        className={cn(
          'absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary-hover)]',
          selected
            ? 'bg-[var(--color-accent)] text-white'
            : 'bg-black/65 text-white hover:bg-[var(--color-accent)]'
        )}
      >
        {selected ? (
          <Check className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Plus className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </article>
  );
}

// The grid remounts rows constantly while scrolling; memo keeps untouched tiles
// from re-rendering (and their <video> elements from reloading).
export const ClipTile = memo(ClipTileImpl);
