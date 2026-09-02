/**
 * Font loader for dynamic OG images (next/og `ImageResponse`).
 *
 * Satori (the engine behind `ImageResponse`) ships NO default font — every
 * glyph must come from a font we hand it, and it only accepts ttf/otf/woff
 * (NOT woff2). We bundle static Inter + Inter Tight instances (the same family
 * the site renders with — see globals.css: "Inter Tight for display, Inter for
 * body") covering the full Latin set so Spanish accents and ñ render correctly.
 *
 * The TTFs are located via `new URL('./fonts/x.ttf', import.meta.url)` — the
 * pattern the Next/webpack asset relocator recognises to TRACE each ttf as a
 * static asset of the importing route (so they ARE emitted into the standalone
 * build, unlike a raw `fs.readFileSync('src/...')`). We then read the bytes
 * from the filesystem with `fs.readFile` rather than `fetch`: `fetch` of a
 * `file:`/asset URL is NOT implemented in Next 16's build-time prerender
 * sandbox and fails the static export ("fetch failed / not implemented"),
 * whereas an fs read works at both build and request time. Loaded once,
 * memoised for the life of the server process.
 */
import { readFile } from 'node:fs/promises';
// Next 16 dropped the `ImageResponseOptions` named export from `next/og`.
// Derive the options type from the `ImageResponse` constructor's 2nd param
// instead — robust across versions since it tracks the actual runtime API.
type ImageResponseOptions = NonNullable<
  ConstructorParameters<typeof import('next/og').ImageResponse>[1]
>;

type Fonts = NonNullable<ImageResponseOptions['fonts']>;

let cached: Fonts | null = null;

async function read(file: string): Promise<Buffer> {
  // `new URL(..., import.meta.url)` keeps the asset traced into the standalone
  // build; `readFile` accepts the file: URL directly and works at build time.
  return readFile(new URL(`./fonts/${file}`, import.meta.url));
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
