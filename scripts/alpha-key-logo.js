/**
 * One-off: strip the white background from public/brand/dnk-partner-logo.png.
 *
 * Why a flood-fill instead of a global threshold?
 *   The DNK Partner wordmark has interior-white counters inside the P, A,
 *   and R glyphs, plus a white pocket inside the circular ring around the
 *   "DNK" monogram. A naive global "near-white -> alpha 0" pass would punch
 *   holes through those counters and leave the logo looking eaten.
 *
 *   So we flood-fill near-white starting from the image border. Only pixels
 *   reachable from the edge through a chain of near-white neighbours become
 *   transparent. Interior-white pixels trapped inside dark letterforms stay
 *   opaque, preserving the wordmark exactly as designed.
 *
 * Edge feathering:
 *   After the flood, we do a second pass on the immediate neighbourhood of
 *   transparent pixels. Any opaque pixel that sits on the soft band
 *   (SOFT_WHITE..HARD_WHITE) and touches a transparent pixel gets its alpha
 *   scaled proportionally. This kills JPEG-style fringing without losing
 *   the actual glyph edge.
 *
 * Run: `node scripts/alpha-key-logo.js`
 * Overwrites public/brand/dnk-partner-logo.png in place. Same dimensions,
 * same filename — Next.js `<Image>` callers don't need any change.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const sharp = require('sharp');
const path = require('path');

const SRC = path.join(__dirname, '..', 'public', 'brand', 'dnk-partner-logo.png');

// A pixel is "near-white enough to be background" when min(R,G,B) >= this.
// 240 catches the white background plus mild JPEG/PNG compression noise.
const HARD_WHITE = 240;
// Soft band for edge feathering — pixels in this range that border a
// transparent region get their alpha scaled to feather the edge.
const SOFT_WHITE = 215;

const isNearWhite = (r, g, b) => Math.min(r, g, b) >= HARD_WHITE;

(async () => {
  const img = sharp(SRC).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (channels !== 4) {
    throw new Error(`Expected RGBA (4 channels), got ${channels}`);
  }

  // Step 1: BFS flood-fill from every border pixel that is near-white.
  // `transparent` is a flat Uint8Array marking which pixels the flood reached.
  const transparent = new Uint8Array(width * height);
  const queue = [];

  const pushIfBg = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (transparent[idx]) return;
    const p = idx * channels;
    if (!isNearWhite(data[p], data[p + 1], data[p + 2])) return;
    transparent[idx] = 1;
    queue.push(x, y);
  };

  for (let x = 0; x < width; x++) {
    pushIfBg(x, 0);
    pushIfBg(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    pushIfBg(0, y);
    pushIfBg(width - 1, y);
  }

  // 4-connected flood. Fast enough at ~1M pixels for a one-off script.
  while (queue.length) {
    const y = queue.pop();
    const x = queue.pop();
    pushIfBg(x + 1, y);
    pushIfBg(x - 1, y);
    pushIfBg(x, y + 1);
    pushIfBg(x, y - 1);
  }

  // Step 2: zero out alpha on every flooded pixel.
  for (let i = 0; i < transparent.length; i++) {
    if (transparent[i]) data[i * channels + 3] = 0;
  }

  // Step 3: edge feather. For every opaque pixel that touches a transparent
  // pixel and sits in the soft band, scale alpha proportionally so the edge
  // anti-aliases cleanly instead of stair-stepping.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (transparent[idx]) continue;
      const p = idx * channels;
      const minB = Math.min(data[p], data[p + 1], data[p + 2]);
      if (minB < SOFT_WHITE || minB >= HARD_WHITE) continue;
      // Only feather if a neighbour is transparent (i.e., we're on the edge).
      const neighbourTransparent =
        (x + 1 < width && transparent[idx + 1]) ||
        (x - 1 >= 0 && transparent[idx - 1]) ||
        (y + 1 < height && transparent[idx + width]) ||
        (y - 1 >= 0 && transparent[idx - width]);
      if (!neighbourTransparent) continue;
      const t = (minB - SOFT_WHITE) / (HARD_WHITE - SOFT_WHITE);
      data[p + 3] = Math.round(255 * (1 - t));
    }
  }

  await sharp(data, { raw: { width, height, channels } })
    .png({ compressionLevel: 9 })
    .toFile(SRC);

  // Quick sanity stats so the console output is informative.
  let opaque = 0;
  let alphaZero = 0;
  let feathered = 0;
  for (let i = 0; i < transparent.length; i++) {
    const a = data[i * channels + 3];
    if (a === 0) alphaZero++;
    else if (a === 255) opaque++;
    else feathered++;
  }
  console.log(
    `Alpha-keyed ${SRC} (${width}x${height})\n` +
      `  fully transparent: ${alphaZero.toLocaleString()}\n` +
      `  feathered edge:    ${feathered.toLocaleString()}\n` +
      `  fully opaque:      ${opaque.toLocaleString()}`,
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
