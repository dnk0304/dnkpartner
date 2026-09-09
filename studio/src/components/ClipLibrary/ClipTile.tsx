/**
 * One clip in the library grid.
 *
 * Interaction model (CP2c):
 *   poster     → a real frame from the clip, always visible, never autoplaying
 *   play button→ starts playback; pressing it again pauses
 *   Space      → toggle playback on the focused tile
 *   Enter      → add/remove the focused tile from the cart
 *
 * Hover does nothing. Playback is always something the user asked for, which is
 * also what keeps the DOM cheap: the steady state holds zero <video> elements —
 * one is created on first play and torn down on pause, on handover to another
 * clip, and on unmount (which the virtualiser does as rows leave the window).
 *
 * Accessibility note: the tile is a composite — two distinct actions live on
 * one focusable card, which is why the keyboard shortcuts sit on the card
 * rather than on a single <button> wrapper (a button can only have one
 * activation, and nesting buttons inside a button is invalid). Both actions are
 * also exposed as real <button>s inside the card so pointer and assistive-tech
 * users never depend on the shortcuts.
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Check, Film, Pause, Play, Plus } from 'lucide-react';
import { cn } from '../../lib/utils';
import { posterUrl, previewUrl } from '../../hooks/useClipLibrary';
import { claimPlayback, releasePlayback } from '../../lib/clipPlayback';
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
  /** Drives whether a <video> exists at all — not merely whether it is paused. */
  const [playing, setPlaying] = useState(false);
  /** A few clips are audio-only and have no frame to show. Not an error state. */
  const [posterFailed, setPosterFailed] = useState(false);

  // Held in a ref so the stop callback handed to the playback coordinator is
  // stable, and so the unmount cleanup below doesn't need `playing` as a dep
  // (which would tear the video down the moment playback started).
  const stopRef = useRef<() => void>(() => undefined);
  stopRef.current = () => setPlaying(false);

  const stop = useCallback(() => {
    setPlaying(false);
    releasePlayback(clip.id);
  }, [clip.id]);

  const start = useCallback(() => {
    // Stops whatever else was playing before this tile mounts its own video.
    claimPlayback(clip.id, () => stopRef.current());
    setPlaying(true);
  }, [clip.id]);

  const togglePlay = useCallback(() => {
    if (playing) stop();
    else start();
  }, [playing, start, stop]);

  // The virtualiser unmounts rows as they leave the window; releasing here is
  // what guarantees a scrolled-away clip stops rather than playing unseen.
  useEffect(() => {
    const id = clip.id;
    return () => releasePlayback(id);
  }, [clip.id]);

  /**
   * Ref callback rather than an effect: the element is played the moment React
   * attaches it, so there is no frame where a mounted video sits paused.
   */
  const attachVideo = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    if (!node) return;
    // Playback follows a click or a keypress, so sound is permitted here.
    void node.play().catch(() => {
      // Refused (autoplay policy, reduced data). Fall back to the poster
      // rather than leaving a dead black box in the grid.
      setPlaying(false);
    });
  }, []);

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

  const posterAlt = clip.tags.length
    ? `${clip.comedian} — ${clip.tags.slice(0, 3).join(', ')}`
    : `${clip.comedian} clip`;

  return (
    <article
      tabIndex={0}
      aria-label={`${clip.comedian}, ${formatDuration(clip.duration)}, quality ${clip.quality}`}
      onKeyDown={onKeyDown}
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-[var(--radius-lg)]',
        'bg-[var(--color-surface)] ring-1 transition-shadow',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary-hover)]',
        selected
          ? 'ring-2 ring-[var(--color-accent)]'
          : 'ring-[var(--color-border)] hover:ring-[var(--color-border-bright)]'
      )}
    >
      {/* Media box. Fixed 16:9 so the row height never depends on whether the
          poster has decoded yet — the grid must not reflow under the scroller. */}
      <div
        className="relative w-full overflow-hidden bg-[var(--color-surface-hover)]"
        style={{ aspectRatio: '16 / 9' }}
      >
        {posterFailed ? (
          // The poster 404'd. Deliberately does NOT name a cause: usually the
          // clip is audio-only and has no frame to take, but the same 404 is
          // what an unmounted posters volume looks like, and a whole grid
          // claiming "audio only" would be a lie that hides a deploy fault.
          // The clip itself still plays, so this is a missing image, not a
          // broken tile.
          // Caption sits bottom-left: the play button owns the centre and the
          // duration chip owns bottom-right, so nothing overlaps.
          <div className="h-full w-full">
            <span className="pointer-events-none absolute bottom-1.5 left-1.5 flex items-center gap-1 text-[10px] leading-tight text-[var(--color-text-dim)]">
              <Film className="h-3 w-3" aria-hidden="true" />
              No preview image
            </span>
          </div>
        ) : (
          <img
            src={posterUrl(clip.id)}
            alt={posterAlt}
            loading="lazy"
            decoding="async"
            width={480}
            height={270}
            onError={() => setPosterFailed(true)}
            className="h-full w-full object-cover"
          />
        )}

        {playing && (
          <video
            ref={attachVideo}
            src={previewUrl(clip.id)}
            preload="none"
            playsInline
            loop
            onPause={stop}
            className="absolute inset-0 h-full w-full bg-black object-cover"
          />
        )}

        {/* The one loud element on the tile. Always present — hover-only would
            hide it from touch entirely — but it sits on a scrim so it stays
            legible over a bright frame without dimming the whole poster. */}
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? `Pause ${clip.comedian} clip` : `Play ${clip.comedian} clip`}
          className={cn(
            'absolute inset-0 grid place-items-center',
            'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-primary-hover)]'
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              'grid h-11 w-11 place-items-center rounded-full',
              'bg-black/55 text-white ring-1 ring-white/25 backdrop-blur-[2px]',
              'transition-[background-color,transform] duration-150 ease-out',
              'group-hover:bg-black/70 group-focus-within:bg-black/70',
              'motion-reduce:transition-none',
              playing ? 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100' : 'opacity-100'
            )}
          >
            {playing ? (
              <Pause className="h-5 w-5" />
            ) : (
              // Nudged right so the triangle looks centred in the circle.
              <Play className="h-5 w-5 translate-x-[1px]" />
            )}
          </span>
        </button>

        <span className="pointer-events-none absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1.5 py-0.5 font-[var(--font-mono)] text-[11px] tabular-nums text-white">
          {formatDuration(clip.duration)}
        </span>
      </div>

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
          not revealed on hover only. Sits above the play button's hit area. */}
      <button
        type="button"
        onClick={() => onToggleSelect(clip)}
        aria-pressed={selected}
        aria-label={selected ? `Remove ${clip.id} from selection` : `Add ${clip.id} to selection`}
        className={cn(
          'absolute right-1.5 top-1.5 z-10 grid h-7 w-7 place-items-center rounded-full transition-colors',
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
// from re-rendering (and their posters from being re-requested).
export const ClipTile = memo(ClipTileImpl);
