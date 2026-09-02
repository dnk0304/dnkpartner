/**
 * Font loader for dynamic OG images (next/og `ImageResponse`).
 *
 * Satori (the engine behind `ImageResponse`) ships NO default font — every
 * glyph must come from a font we hand it, and it only accepts ttf/otf/woff
 * (NOT woff2). We bundle static Inter + Inter Tight instances (the same family
 * the site renders with — see globals.css: "Inter Tight for display, Inter for
 * body") covering the full Latin set so Spanish accents and ñ render correctly.
 *
 * The TTFs are loaded via `fetch(new URL('./fonts/x.ttf', import.meta.url))` —
 * the Next-documented pattern that makes the bundler trace each ttf as a
 * static asset of the importing route (so they ARE present in the standalone
 * build, unlike a raw `fs.readFileSync('src/...')`). Loaded once, memoised for
 * the life of the server process.
 */
import type { ImageResponseOptions } from 'next/og';

type Fonts = NonNullable<ImageResponseOptions['fonts']>;

let cached: Fonts | null = null;

async function read(file: string): Promise<ArrayBuffer> {
  return fetch(new URL(`./fonts/${file}`, import.meta.url)).then((r) => r.arrayBuffer());
}

/**
 * The four weights the templates use:
 *   - Inter 400 / 600  → body + labels
 *   - Inter Tight 700 / 800 → display headlines
 * Loaded in parallel, memoised.
 */
export async function ogFonts(): Promise<Fonts> {
  if (cached) return cached;
  const [i400, i600, t700, t800] = await Promise.all([
    read('Inter-400.ttf'),
    read('Inter-600.ttf'),
    read('InterTight-700.ttf'),
    read('InterTight-800.ttf'),
  ]);
  cached = [
    { name: 'Inter', data: i400, weight: 400, style: 'normal' },
    { name: 'Inter', data: i600, weight: 600, style: 'normal' },
    { name: 'Inter Tight', data: t700, weight: 700, style: 'normal' },
    { name: 'Inter Tight', data: t800, weight: 800, style: 'normal' },
  ];
  return cached;
}
