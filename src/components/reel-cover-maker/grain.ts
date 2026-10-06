/**
 * Film grain, the same every time.
 *
 * Instagram re-encodes every picture as JPEG, and grain one pixel fine is
 * exactly what that encoder smears into blotches. So each grain is a two by
 * two cell at the 1080-wide size: still fine on a phone, and coarse enough to
 * survive. Seeded, so the preview and the download are the same picture, and
 * a cover made again tomorrow is too.
 */

/** A seeded source of numbers in [0, 1): mulberry32. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const GRAIN_SEED = 0x5eed;
/** The tile's side, in pixels at the 1080-wide size. Large enough that its repeat never shows. */
export const GRAIN_TILE = 512;
/** One grain's side, in pixels at the 1080-wide size. */
export const GRAIN_CELL = 2;

/**
 * RGBA for a `size` square tile of grain: each cell a speck of white or of
 * black, its strength the distance of a soft random draw from the middle.
 */
export function grainPixels(size = GRAIN_TILE, cell = GRAIN_CELL, seed = GRAIN_SEED): Uint8ClampedArray<ArrayBuffer> {
  const random = seeded(seed);
  const pixels = new Uint8ClampedArray(size * size * 4);
  const cells = Math.ceil(size / cell);
  for (let cy = 0; cy < cells; cy += 1) {
    for (let cx = 0; cx < cells; cx += 1) {
      // The mean of two draws leans to the middle, so most grains are faint.
      const n = (random() + random()) / 2;
      const value = n < 0.5 ? 0 : 255;
      const alpha = Math.round(Math.abs(n - 0.5) * 2 * 255);
      for (let y = cy * cell; y < Math.min(size, (cy + 1) * cell); y += 1) {
        for (let x = cx * cell; x < Math.min(size, (cx + 1) * cell); x += 1) {
          const i = (y * size + x) * 4;
          pixels[i] = value;
          pixels[i + 1] = value;
          pixels[i + 2] = value;
          pixels[i + 3] = alpha;
        }
      }
    }
  }
  return pixels;
}
