/**
 * Locked source of truth for the /dashboard project tiles.
 *
 * Lives in its own module (not page.tsx) because Next.js 16 page files
 * may only export `default` + a small fixed set of route-segment exports
 * — any other named export fails type-gen with "Property X is not
 * assignable to type 'never'". Keeping the data here also gives Pixel a
 * stable import surface for the restyle pass without touching the gate.
 *
 * Order = display order. `href: null` => "Coming soon" tile, rendered
 * muted and non-interactive.
 */

export interface DashboardProject {
  /** Stable id for React keys + analytics. */
  id: string;
  /** Display name on the card. */
  name: string;
  /** One-line description rendered under the name. */
  description: string;
  /** Destination URL. `null` means the project is not yet built/deployed. */
  href: string | null;
  /** True for cross-origin links (open in new tab with rel=noopener). */
  external: boolean;
  /** Lifecycle state — drives the badge ("Live" vs "Coming soon"). */
  state: 'live' | 'coming-soon';
}

/**
 * Locked card set, approved by Dennis (2026-06-01).
 */
export const DASHBOARD_PROJECTS: readonly DashboardProject[] = [
  {
    id: 'subastas',
    name: 'SubastasActivas',
    description: 'Spanish public auction tracker — BOE feed, filters, favourites.',
    href: 'https://subastasactivas.com',
    external: true,
    state: 'live',
  },
  {
    id: 'studio',
    name: 'DNK Studio',
    description: 'Content editor and publishing surface.',
    href: '/studio',
    external: false,
    state: 'live',
  },
  {
    id: 'trends',
    name: 'DNK Trends',
    description: 'AI-driven trend signals and reports.',
    href: '/studio/ai-trends',
    external: false,
    state: 'live',
  },
  {
    id: 'computercaller',
    name: 'ComputerCaller',
    description: 'Voice-agent platform — separate product surface.',
    href: 'https://computercaller.com',
    external: true,
    state: 'live',
  },
  {
    id: 'room-designer',
    name: 'Room Designer',
    description: 'Interior visualisation tool.',
    href: null,
    external: false,
    state: 'coming-soon',
  },
  {
    id: 'panini-pano',
    name: 'Panini Pano',
    description: 'Sticker-album collection manager.',
    href: null,
    external: false,
    state: 'coming-soon',
  },
] as const;
