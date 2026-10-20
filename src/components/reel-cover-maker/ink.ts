/**
 * Inkblot's letters: a script printed in ink that has bled into the cloth
 * (the owner's ask, 19 Oct, after Onehart's "Inkblot Script": screen
 * printing on denim, rough at every edge, each letter its own weight).
 *
 * A typeface keeps clean outlines, so the print is made from them. The
 * word's outline (traced from the face's own ink by the page, so its
 * joins, kerning and accents are the face's) is turned into a field of how
 * far each point is inside the ink, on a fine grid; the ink then spreads
 * by a bleed that swells and thins along the word, as pressure does from
 * letter to letter, and its edge is roughened by noise at three scales,
 * with a bite taken out here and there where the ink missed the weave. The
 * printed edge is where that field crosses nought, traced again as closed
 * loops (marching squares), so strokes that bleed into each other merge as
 * ink does and nothing can cross itself.
 *
 * Every number here is in em of the word, from its start on the baseline,
 * so a word prints the same at any size and wherever it goes; its print is
 * seeded by its text and the shuffle. Pure: the tests run it.
 */

import { hashString, mixSeed, noise2 } from "@/components/reel-cover-maker/noise";

/** A closed outline as x, y pairs; the ink is on its left as it goes (y down), so holes run the other way and fill by the nonzero rule. */
export type Loop = number[];

/**
 * Closed contours of a grid of values where they cross `level`, at points
 * found between the grid's own by straight interpolation. Values at or above
 * the level are inside; beyond the grid everything is outside, so every
 * contour closes, half a step out past ink at the grid's edge. Each runs with the inside on its left as seen on a
 * screen (y down): an outline round ink one way, round a hole the other.
 */
export function contours(values: ArrayLike<number>, w: number, h: number, level: number): Loop[] {
  const at = (i: number, j: number) => (i < 0 || j < 0 || i >= w || j >= h ? -Infinity : values[j * w + i]);
  // Every crossing is on an edge between two grid points, across (from (i, j)
  // to (i + 1, j)) or down; only the edges crossed are kept, each once.
  const stride = w + 2;
  const across = (i: number, j: number) => ((j + 1) * stride + (i + 1)) * 2;
  const down = (i: number, j: number) => ((j + 1) * stride + (i + 1)) * 2 + 1;
  const slot = new Map<number, number>();
  const xs: number[] = [];
  const ys: number[] = [];
  const to: number[] = [];
  const cross = (id: number, x0: number, y0: number, v0: number, x1: number, y1: number, v1: number): number => {
    let s = slot.get(id);
    if (s === undefined) {
      // Past the grid's edge there is no value to meet: the edge is put halfway out to it.
      const t = v0 === -Infinity || v1 === -Infinity ? 0.5 : (level - v0) / (v1 - v0);
      const u = Math.min(1, Math.max(0, t));
      s = xs.length;
      slot.set(id, s);
      xs.push(x0 + (x1 - x0) * u);
      ys.push(y0 + (y1 - y0) * u);
      to.push(-1);
    }
    return s;
  };
  const ids = [0, 0, 0, 0];
  const kinds = [0, 0, 0, 0];
  for (let j = -1; j < h; j += 1) {
    for (let i = -1; i < w; i += 1) {
      const a = at(i, j);
      const b = at(i + 1, j);
      const c = at(i + 1, j + 1);
      const d = at(i, j + 1);
      const ia = a >= level;
      const ib = b >= level;
      const ic = c >= level;
      const id = d >= level;
      if (ia === ib && ib === ic && ic === id) continue;
      // The cell's edges clockwise on the screen, from its top left corner:
      // each crossing either enters the ink (1) or leaves it (-1) that way round.
      let n = 0;
      if (ia !== ib) {
        ids[n] = cross(across(i, j), i, j, a, i + 1, j, b);
        kinds[n++] = ia ? -1 : 1;
      }
      if (ib !== ic) {
        ids[n] = cross(down(i + 1, j), i + 1, j, b, i + 1, j + 1, c);
        kinds[n++] = ib ? -1 : 1;
      }
      if (ic !== id) {
        ids[n] = cross(across(i, j + 1), i, j + 1, d, i + 1, j + 1, c);
        kinds[n++] = ic ? -1 : 1;
      }
      if (id !== ia) {
        ids[n] = cross(down(i, j), i, j, a, i, j + 1, d);
        kinds[n++] = id ? -1 : 1;
      }
      if (n === 2) {
        const from = kinds[0] === 1 ? 0 : 1;
        to[ids[from]] = ids[1 - from];
        continue;
      }
      // A saddle: the two inside corners joined through the middle if the
      // middle is ink, each entering crossing then running back to the
      // leaving one before it; apart if not, on to the one after.
      const middle = a !== -Infinity && b !== -Infinity && c !== -Infinity && d !== -Infinity && (a + b + c + d) / 4 >= level;
      for (let k = 0; k < 4; k += 1) {
        if (kinds[k] === 1) to[ids[k]] = ids[middle ? (k + 3) % 4 : (k + 1) % 4];
      }
    }
  }
  const loops: Loop[] = [];
  for (let start = 0; start < xs.length; start += 1) {
    if (to[start] < 0) continue;
    const loop: Loop = [];
    let e = start;
    while (e >= 0 && to[e] >= 0) {
      loop.push(xs[e], ys[e]);
      const after = to[e];
      to[e] = -1;
      e = after;
    }
    if (loop.length >= 6) loops.push(loop);
  }
  return loops;
}

/** The area a loop encloses, positive for ink and negative for a hole (its left on a screen, as `contours` runs them). */
export function loopArea(loop: Loop): number {
  let sum = 0;
  const n = loop.length;
  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n;
    sum += loop[i] * loop[j + 1] - loop[j] * loop[i + 1];
  }
  return -sum / 2;
}

/** Points along a loop dropped where it runs within `tolerance` of a straight line between those kept (Douglas and Peucker's way). */
export function simplify(loop: Loop, tolerance: number): Loop {
  const n = loop.length / 2;
  if (n <= 4) return loop;
  const keep = new Uint8Array(n);
  // Cut at the point furthest from the first, then each half straightened on its own.
  let far = 0;
  let best = -1;
  for (let i = 1; i < n; i += 1) {
    const d = (loop[i * 2] - loop[0]) ** 2 + (loop[i * 2 + 1] - loop[1]) ** 2;
    if (d > best) {
      best = d;
      far = i;
    }
  }
  keep[0] = 1;
  keep[far] = 1;
  const t2 = tolerance * tolerance;
  const stack: [number, number][] = [
    [0, far],
    [far, n],
  ];
  while (stack.length) {
    const [s, e] = stack.pop() as [number, number];
    if (e - s < 2) continue;
    const ax = loop[s * 2];
    const ay = loop[s * 2 + 1];
    const bx = loop[(e % n) * 2];
    const by = loop[(e % n) * 2 + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let worst = -1;
    let at = -1;
    for (let i = s + 1; i < e; i += 1) {
      const x = loop[i * 2] - ax;
      const y = loop[i * 2 + 1] - ay;
      const d = len2 > 0 ? (x * dy - y * dx) ** 2 / len2 : x * x + y * y;
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (worst > t2) {
      keep[at] = 1;
      stack.push([s, at], [at, e]);
    }
  }
  const out: Loop = [];
  for (let i = 0; i < n; i += 1) if (keep[i]) out.push(loop[i * 2], loop[i * 2 + 1]);
  return out.length >= 6 ? out : loop;
}

/** The smallest box holding every loop, or null with nothing in them. */
export function loopBounds(loops: readonly Loop[]): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const loop of loops) {
    for (let i = 0; i < loop.length; i += 2) {
      if (loop[i] < x0) x0 = loop[i];
      if (loop[i] > x1) x1 = loop[i];
      if (loop[i + 1] < y0) y0 = loop[i + 1];
      if (loop[i + 1] > y1) y1 = loop[i + 1];
    }
  }
  return x0 <= x1 ? { x0, y0, x1, y1 } : null;
}

/** How the ink is printed, in em. */
export interface Print {
  /** Grid points to the em the field is worked out on. */
  grid: number;
  /** How far the ink spreads past the face's outline, on average. */
  bleed: number;
  /** How much the bleed swells and thins along the word, as a share of it: each letter's own weight. */
  weight: number;
  /** How long a stretch of the word one swell of weight takes. */
  weightSpan: number;
  /**
   * The edge's roughness at three scales, each an amplitude and its
   * wavelength; a chipped one is cut in sharp notches, as a print's edge
   * breaks where a thread of the cloth took no ink, rather than wandering.
   */
  rough: readonly { amount: number; span: number; chipped?: boolean }[];
  /** Bites where the ink missed: how deep at most, how far apart, and how rare (the share of the noise's range left without one). */
  bite: { amount: number; span: number; rare: number };
  /** A speck or a pinhole smaller than this, in square em, is not printed. */
  speck: number;
}

/**
 * Onehart's print, matched on its specimen at the size of its title (an em
 * of about 340 pixels) against Pinyon Script: the edge wanders slowly a
 * hundred-and-fiftieth of an em, is chipped in notches a fortieth of an em
 * apart and grit finer than that, now and then bitten; hairlines well
 * thickened and the heavy strokes a little, the weight varying letter to
 * letter by about a third. As heavy as Onehart's title can be made before
 * Pinyon's narrow loops (an h's, an l's) close, which Onehart's never do;
 * its alphabet is a little lighter, and reads less well on the grid.
 */
export const PRINT: Print = {
  grid: 240,
  bleed: 0.016,
  weight: 0.32,
  weightSpan: 0.55,
  rough: [
    { amount: 0.006, span: 0.1 },
    { amount: 0.004, span: 0.026, chipped: true },
    { amount: 0.003, span: 0.008, chipped: true },
  ],
  bite: { amount: 0.009, span: 0.045, rare: 0.55 },
  speck: 0.00004,
};

/** How far the printed edge can reach past the face's outline, in em: the room a line of print needs round it. */
export function printReach(print: Print = PRINT): number {
  return print.bleed * (1 + print.weight) + print.rough.reduce((sum, r) => sum + r.amount, 0);
}

/**
 * The word whose clean outline is `outline` (em, from its start on the
 * baseline) as printed: bled, its weight varying along it, its edge rough,
 * seeded by `seed`, worked out on a grid of `grid` points to the em (about
 * a pixel apart where it is shown: finer only costs time). Loops as
 * `contours` gives them, ink on their left.
 */
export function printLoops(outline: readonly Loop[], seed: number, print: Print = PRINT, grid = print.grid): Loop[] {
  const box = loopBounds(outline);
  if (!box) return [];
  const G = grid;
  const reach = printReach(print);
  // The distance is worked out exactly only this near the outline: beyond it nothing the print does can reach.
  const band = reach + 3 / G;
  const ox = box.x0 - band - 2 / G;
  const oy = box.y0 - band - 2 / G;
  const W = Math.ceil((box.x1 - box.x0 + 2 * band) * G) + 5;
  const H = Math.ceil((box.y1 - box.y0 + 2 * band) * G) + 5;

  // The distance from each grid point near the outline to the outline, squared, in grid steps.
  const reachCells = band * G;
  const dist2 = new Float32Array(W * H).fill(reachCells * reachCells);
  for (const loop of outline) {
    const n = loop.length;
    for (let s = 0; s < n; s += 2) {
      const ax = (loop[s] - ox) * G;
      const ay = (loop[s + 1] - oy) * G;
      const bx = (loop[(s + 2) % n] - ox) * G;
      const by = (loop[(s + 3) % n] - oy) * G;
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const inv = len2 > 0 ? 1 / len2 : 0;
      const i0 = Math.max(0, Math.floor(Math.min(ax, bx) - reachCells));
      const i1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + reachCells));
      const j0 = Math.max(0, Math.floor(Math.min(ay, by) - reachCells));
      const j1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + reachCells));
      for (let j = j0; j <= j1; j += 1) {
        const row = j * W;
        const py = j - ay;
        for (let i = i0; i <= i1; i += 1) {
          const qx = i - ax;
          let t = (qx * dx + py * dy) * inv;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ex = qx - dx * t;
          const ey = py - dy * t;
          const d2 = ex * ex + ey * ey;
          if (d2 < dist2[row + i]) dist2[row + i] = d2;
        }
      }
    }
  }

  // Which grid points are ink: a row's crossings of the outline, taken in pairs.
  const crossings: number[][] = Array.from({ length: H }, () => []);
  for (const loop of outline) {
    const n = loop.length;
    for (let s = 0; s < n; s += 2) {
      const ax = loop[s];
      const ay = loop[s + 1];
      const bx = loop[(s + 2) % n];
      const by = loop[(s + 3) % n];
      if (ay === by) continue;
      const lo = Math.min(ay, by);
      const hi = Math.max(ay, by);
      const j0 = Math.max(0, Math.ceil((lo - oy) * G));
      const j1 = Math.min(H - 1, Math.ceil((hi - oy) * G) - 1);
      for (let j = j0; j <= j1; j += 1) {
        const y = oy + j / G;
        if (y < lo || y >= hi) continue;
        crossings[j].push(ax + ((y - ay) / (by - ay)) * (bx - ax));
      }
    }
  }
  const field = new Float32Array(W * H);
  // Seeds held to small integers, which the engine keeps unboxed in the loop below.
  const small = (v: number) => v & 0x3fffffff;
  const wSeed = small(mixSeed(seed, 0x77e1));
  const bSeed = small(mixSeed(seed, 0xb17e));
  const octaves = print.rough.map((r, k) => ({ seed: small(mixSeed(seed, 0x2a0 + k)), amount: r.amount, per: 1 / r.span, chipped: r.chipped === true }));
  const perWeight = 1 / print.weightSpan;
  const perBite = 1 / print.bite.span;
  const { bleed, weight } = print;
  const { amount: biteAmount, rare } = print.bite;
  for (let j = 0; j < H; j += 1) {
    const xs = crossings[j].sort((p, q) => p - q);
    const row = j * W;
    const y = oy + j / G;
    let k = 0;
    let inside = false;
    for (let i = 0; i < W; i += 1) {
      const x = ox + i / G;
      while (k < xs.length && xs[k] <= x) {
        inside = !inside;
        k += 1;
      }
      const d = Math.sqrt(dist2[row + i]) / G;
      if (d >= band) {
        field[row + i] = inside ? band : -band;
        continue;
      }
      // The ink's spread here: its weight swells and thins along the word, a little across it.
      let edge = bleed * (1 + weight * noise2(wSeed, x * perWeight, y * perWeight * (1 / 3)));
      for (const o of octaves) {
        const v = noise2(o.seed, x * o.per, y * o.per);
        edge += o.amount * (o.chipped ? 2 * Math.abs(v) - 1 : v);
      }
      const b = noise2(bSeed, x * perBite, y * perBite);
      if (b > rare) edge -= biteAmount * ((b - rare) / (1 - rare)) ** 1.5;
      field[row + i] = (inside ? d : -d) + edge;
    }
  }

  const loops: Loop[] = [];
  for (const loop of contours(field, W, H, 0)) {
    const em = loop.map((v, i) => (i % 2 ? oy + v / G : ox + v / G));
    if (Math.abs(loopArea(em)) < print.speck) continue;
    loops.push(simplify(em, 0.1 / G));
  }
  return loops;
}

/** A grid of points `1 / G` em apart over loops' box, `pad` em round it. */
interface Grid {
  ox: number;
  oy: number;
  W: number;
  H: number;
  G: number;
}

function gridOver(loops: readonly Loop[], pad: number, G: number): Grid | null {
  const box = loopBounds(loops);
  if (!box) return null;
  const ox = box.x0 - pad - 2 / G;
  const oy = box.y0 - pad - 2 / G;
  return { ox, oy, G, W: Math.ceil((box.x1 - box.x0 + 2 * pad) * G) + 5, H: Math.ceil((box.y1 - box.y0 + 2 * pad) * G) + 5 };
}

/** Each grid point's distance to the nearest edge of `loops`, in em, held to at most `band`. */
function edgeDistances(loops: readonly Loop[], g: Grid, band: number): Float32Array {
  const { ox, oy, W, H, G } = g;
  const reach = band * G;
  const dist2 = new Float32Array(W * H).fill(reach * reach);
  for (const loop of loops) {
    const n = loop.length;
    for (let s = 0; s < n; s += 2) {
      const ax = (loop[s] - ox) * G;
      const ay = (loop[s + 1] - oy) * G;
      const dx = (loop[(s + 2) % n] - ox) * G - ax;
      const dy = (loop[(s + 3) % n] - oy) * G - ay;
      const len2 = dx * dx + dy * dy;
      const inv = len2 > 0 ? 1 / len2 : 0;
      const i0 = Math.max(0, Math.floor(Math.min(ax, ax + dx) - reach));
      const i1 = Math.min(W - 1, Math.ceil(Math.max(ax, ax + dx) + reach));
      const j0 = Math.max(0, Math.floor(Math.min(ay, ay + dy) - reach));
      const j1 = Math.min(H - 1, Math.ceil(Math.max(ay, ay + dy) + reach));
      for (let j = j0; j <= j1; j += 1) {
        const row = j * W;
        const py = j - ay;
        for (let i = i0; i <= i1; i += 1) {
          const qx = i - ax;
          let t = (qx * dx + py * dy) * inv;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ex = qx - dx * t;
          const ey = py - dy * t;
          const d2 = ex * ex + ey * ey;
          if (d2 < dist2[row + i]) dist2[row + i] = d2;
        }
      }
    }
  }
  const out = new Float32Array(W * H);
  for (let i = 0; i < out.length; i += 1) out[i] = Math.sqrt(dist2[i]) / G;
  return out;
}

/** 1 where a grid point is inside `loops` by the nonzero rule, as a canvas fills them, else 0. */
function insideOf(loops: readonly Loop[], g: Grid): Uint8Array {
  const { ox, oy, W, H, G } = g;
  const crossings: { x: number; dir: number }[][] = Array.from({ length: H }, () => []);
  for (const loop of loops) {
    const n = loop.length;
    for (let s = 0; s < n; s += 2) {
      const ax = loop[s];
      const ay = loop[s + 1];
      const bx = loop[(s + 2) % n];
      const by = loop[(s + 3) % n];
      if (ay === by) continue;
      const lo = Math.min(ay, by);
      const hi = Math.max(ay, by);
      const j0 = Math.max(0, Math.ceil((lo - oy) * G));
      const j1 = Math.min(H - 1, Math.ceil((hi - oy) * G) - 1);
      for (let j = j0; j <= j1; j += 1) {
        const y = oy + j / G;
        if (y < lo || y >= hi) continue;
        crossings[j].push({ x: ax + ((y - ay) / (by - ay)) * (bx - ax), dir: by > ay ? 1 : -1 });
      }
    }
  }
  const out = new Uint8Array(W * H);
  for (let j = 0; j < H; j += 1) {
    const xs = crossings[j].sort((p, q) => p.x - q.x);
    let k = 0;
    let winding = 0;
    for (let i = 0; i < W; i += 1) {
      const x = ox + i / G;
      while (k < xs.length && xs[k].x <= x) winding += xs[k++].dir;
      if (winding !== 0) out[j * W + i] = 1;
    }
  }
  return out;
}

/** Contours of a field on a grid, at nought, back in em and smoothed, specks left out. */
function loopsOfField(field: Float32Array, g: Grid): Loop[] {
  const out: Loop[] = [];
  for (const loop of contours(field, g.W, g.H, 0)) {
    const em = loop.map((v, i) => (i % 2 ? g.oy + v / g.G : g.ox + v / g.G));
    if (Math.abs(loopArea(em)) < 4 / (g.G * g.G)) continue;
    out.push(simplify(em, 0.25 / g.G));
  }
  return out;
}

/**
 * The shape a word of script takes out of what is under it, as Find Your
 * Niche's black Your takes its whole shape out of the red capitals: its
 * ink with every gap narrower than twice `reach` closed (a loop, the space
 * a swash sweeps round), then `margin` round all of it, smooth. In em, as
 * the outline is; loops as `contours` gives them.
 */
export function silhouetteLoops(outline: readonly Loop[], reach: number, margin: number, grid = 64): Loop[] {
  const G = grid;
  const R = Math.max(reach, margin);
  const g = gridOver(outline, R + margin + 4 / G, G);
  if (!g) return [];
  // Dilated by the reach: every point within it of the ink.
  const near = edgeDistances(outline, g, R + 3 / G);
  const ink = insideOf(outline, g);
  const dilated = new Float32Array(g.W * g.H);
  for (let i = 0; i < dilated.length; i += 1) dilated[i] = ink[i] ? R : R - near[i];
  const edge = loopsOfField(dilated, g);
  if (!edge.length) return [];
  // Then worn back to the margin from the dilated shape's edge: gaps it closed stay closed.
  const fromEdge = edgeDistances(edge, g, R + 3 / G);
  const field = new Float32Array(g.W * g.H);
  for (let i = 0; i < field.length; i += 1) field[i] = dilated[i] >= 0 ? fromEdge[i] - (R - margin) : -(fromEdge[i] + (R - margin));
  return loopsOfField(field, g);
}

/** Silhouettes made, kept by the outline and what was asked of it. */
const silhouettes = new WeakMap<readonly Loop[], Map<string, Loop[]>>();

/** `silhouetteLoops`, kept for an outline the measurer hands out again for the same word. */
export function silhouetteOf(outline: readonly Loop[], reach: number, margin: number): Loop[] {
  let byAsk = silhouettes.get(outline);
  if (!byAsk) {
    byAsk = new Map();
    silhouettes.set(outline, byAsk);
  }
  const key = `${reach.toFixed(4)}:${margin.toFixed(4)}`;
  let made = byAsk.get(key);
  if (!made) {
    made = silhouetteLoops(outline, reach, margin);
    byAsk.set(key, made);
    while (byAsk.size > 6) byAsk.delete(byAsk.keys().next().value as string);
  }
  return made;
}

/** Printed words, kept by the outline they were printed from, their seed and grid: the same word is printed once. */
const printed = new WeakMap<readonly Loop[], Map<string, Loop[]>>();

/** `printLoops`, kept for an outline the measurer hands out again for the same word. */
export function printedWord(outline: readonly Loop[], seed: number, grid: number): Loop[] {
  let bySeed = printed.get(outline);
  if (!bySeed) {
    bySeed = new Map();
    printed.set(outline, bySeed);
  }
  const key = `${seed}:${grid}`;
  let made = bySeed.get(key);
  if (!made) {
    made = printLoops(outline, seed, PRINT, grid);
    bySeed.set(key, made);
    while (bySeed.size > 8) bySeed.delete(bySeed.keys().next().value as string);
  }
  return made;
}

/** The seed a word's print takes: its own text and the cover's shuffle, so it is the same word wherever it goes until Shuffle is pressed. */
export function printSeed(text: string, shuffle: number): number {
  return mixSeed(hashString(text, 0x1b0b), shuffle);
}
