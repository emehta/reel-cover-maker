/**
 * Seeded randomness and smooth noise, the same in every browser and in the
 * tests, so a letter drawn from a seed is drawn the same way every time.
 */

/** A 32-bit hash of a string: the seed a word, a letter or a title gives. */
export function hashString(text: string, seed = 0x9e3779b9): number {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 0x85ebca6b);
    h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 16), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Two seeds made one. */
export function mixSeed(a: number, b: number): number {
  return hashString(String(b), a);
}

/** A hash of integer lattice coordinates to [0, 1). */
function lattice(seed: number, x: number, y: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const fade = (t: number) => t * t * (3 - 2 * t);

/** Smooth value noise in [-1, 1], one unit between lattice points. */
export function noise2(seed: number, x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = fade(x - xi);
  const fy = fade(y - yi);
  const a = lattice(seed, xi, yi);
  const b = lattice(seed, xi + 1, yi);
  const c = lattice(seed, xi, yi + 1);
  const d = lattice(seed, xi + 1, yi + 1);
  return (a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy) * 2 - 1;
}

/** Smooth noise along a line, in [-1, 1]. */
export function noise1(seed: number, t: number): number {
  return noise2(seed, t, 0.5);
}

/** Two octaves of noise, a little rougher, still in [-1, 1]. */
export function fbm2(seed: number, x: number, y: number): number {
  return (noise2(seed, x, y) * 2 + noise2(seed ^ 0x5bd1e995, x * 2.13, y * 2.13)) / 3;
}

/** A seeded source of numbers in [0, 1). */
export function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A number between `lo` and `hi` from a source. */
export function between(next: () => number, lo: number, hi: number): number {
  return lo + (hi - lo) * next();
}
