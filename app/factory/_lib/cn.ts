import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Factory-local `cn` — clsx + tailwind-merge. Ported from the studio AITrends
 * helper (which lives in studio/src/lib/utils, a separate package we cannot
 * import into the Next app). Same behaviour: merge conditional class lists and
 * de-dupe conflicting Tailwind utilities (last wins).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
