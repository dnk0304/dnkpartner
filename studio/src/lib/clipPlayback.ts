/**
 * Single-playback coordinator for the clip grid.
 *
 * Two comedians talking over each other is not a feature, so starting a clip
 * stops whatever was playing. This lives in a module rather than in React
 * context on purpose: a context value that changed on every play would
 * re-render every mounted tile and defeat the `memo` that keeps the virtualised
 * grid cheap. Tiles register a stop callback, and only the two tiles actually
 * involved in a handover do any work.
 */

type StopFn = () => void;

let current: { id: string; stop: StopFn } | null = null;

/**
 * Claim playback for `id`, stopping any other clip first.
 * Safe to call when `id` is already the active clip — it is then a no-op.
 */
export function claimPlayback(id: string, stop: StopFn): void {
  if (current && current.id !== id) {
    const previous = current;
    // Clear first so the outgoing tile's own release() can't null out the
    // claim we are about to make.
    current = null;
    previous.stop();
  }
  current = { id, stop };
}

/**
 * Give up playback for `id`. Ignored if another clip has since claimed it, so
 * a late unmount cannot stop the clip the user just started.
 */
export function releasePlayback(id: string): void {
  if (current?.id === id) current = null;
}
