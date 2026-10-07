/**
 * The cover's clock: easings and the moments each beat begins and ends, in
 * seconds. Pure, so a still at any time is the same still.
 */

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** How far through [a, b] the time t is, 0 to 1. */
export const span = (t: number, a: number, b: number) => (b <= a ? (t >= b ? 1 : 0) : clamp01((t - a) / (b - a)));

export const sine = (u: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(u));
export const easeOut = (u: number) => 1 - (1 - clamp01(u)) ** 3;
export const easeIn = (u: number) => clamp01(u) ** 3;

/** CSS's cubic-bezier(x1, y1, x2, y2), solved for y at x. */
export function bezier(x1: number, y1: number, x2: number, y2: number): (u: number) => number {
  const at = (a: number, b: number, s: number) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
  return (u: number) => {
    const x = clamp01(u);
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 40; i += 1) {
      const mid = (lo + hi) / 2;
      if (at(x1, x2, mid) < x) lo = mid;
      else hi = mid;
    }
    return at(y1, y2, (lo + hi) / 2);
  };
}

/** The camera's moves: slow away, slow in, as one breath. */
export const glide = bezier(0.65, 0, 0.35, 1);

/** A small seeded random stream, for the typist's rhythm. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** When each character of `text` is typed, from `start`: a person's pace, a beat longer after a space. */
export function keystrokes(text: string, start: number, seed: number): number[] {
  const next = seeded(seed);
  const times: number[] = [];
  let t = start;
  for (let i = 0; i < text.length; i += 1) {
    times.push(t);
    t += 0.075 + next() * 0.05 + (text[i] === " " ? 0.07 : 0);
  }
  return times;
}

/** How many characters are showing at time t. */
export function typedCount(times: number[], t: number): number {
  let n = 0;
  while (n < times.length && times[n] <= t) n += 1;
  return n;
}
