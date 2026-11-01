/**
 * Ink running through cloth from a drop, for Inkblot's Wick (animate.ts):
 * how far the ink must run from where a drop lands to every point of a
 * printed word, along the print and only dearly across bare cloth, so a
 * word wets as one piece, along its strokes, and never jumps a gap.
 *
 * Worked out once a word, on a grid about a hundredth of its em apart
 * (`runStep`); a frame then only traces how far the ink has run by then
 * (`runTo`), and the word's own print is shown inside it. Pure: the tests
 * run it.
 */

import { contours, gridOver, insideOf, loopBounds, simplify, type Loop } from "@/components/reel-cover-maker/ink";

/** How much dearer a step across bare cloth is than a step along the ink: a drop's run stays in the word. */
export const BARE_COST = 12;

/** The most points a word's grid has: a long word on a big cover is worked out a little coarser, never slower. */
const MOST_POINTS = 40000;

/**
 * How far apart a word's grid points are, in its own pixels: about a
 * hundredth of its em (a pixel or two on the cover, as fine as the front
 * of its ink is seen), coarser where that would be more than MOST_POINTS.
 */
export function runStep(polygons: readonly Loop[], em: number): number {
  const box = loopBounds(polygons);
  const area = box ? (box.x1 - box.x0) * (box.y1 - box.y0) : 0;
  return Math.max(1.5, em / 100, Math.sqrt(area / MOST_POINTS));
}

/** How a word's ink runs: the grid it is worked out on, and the run to each point of it. */
export interface InkRun {
  /** The grid's first point and how far apart its points are, in the word's own frame, and how many there are across and down. */
  ox: number;
  oy: number;
  step: number;
  W: number;
  H: number;
  /** How far the ink runs to reach each point, in the word's own pixels, less the cloth's grain where it runs ahead. */
  run: Float32Array;
  /** Where the drop lands, in the word's own frame. */
  drop: { x: number; y: number };
  /** The farthest any of the print is from the drop, as `run` has it. */
  far: number;
  /** Room to trace a front in, reused frame after frame. */
  scratch: Float32Array;
}

/** Each inside point's distance to the nearest point outside, in grid steps (a chamfer's 3 and 4, near enough to find the deepest stroke). */
function depthOf(inside: Uint8Array, W: number, H: number): Float32Array {
  const d = new Float32Array(W * H);
  for (let i = 0; i < d.length; i += 1) d[i] = inside[i] ? 1e9 : 0;
  const pass = (x: number, y: number, dx: number, dy: number, cost: number, p: number) => {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) return;
    const v = d[ny * W + nx] + cost;
    if (v < d[p]) d[p] = v;
  };
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const p = y * W + x;
      if (!d[p]) continue;
      pass(x, y, -1, 0, 3, p);
      pass(x, y, 0, -1, 3, p);
      pass(x, y, -1, -1, 4, p);
      pass(x, y, 1, -1, 4, p);
    }
  }
  for (let y = H - 1; y >= 0; y -= 1) {
    for (let x = W - 1; x >= 0; x -= 1) {
      const p = y * W + x;
      if (!d[p]) continue;
      pass(x, y, 1, 0, 3, p);
      pass(x, y, 0, 1, 3, p);
      pass(x, y, 1, 1, 4, p);
      pass(x, y, -1, 1, 4, p);
    }
  }
  for (let i = 0; i < d.length; i += 1) d[i] /= 3;
  return d;
}

/** The shortest run from `source` to every grid point, eight ways round, a step costing its length times the cost of the two points it joins. Dijkstra's way. */
function runsFrom(source: number, cost: Float32Array, W: number, H: number, step: number): Float32Array {
  const dist = new Float32Array(W * H).fill(Infinity);
  const done = new Uint8Array(W * H);
  // A binary heap of [distance, point], in two arrays grown as needed.
  let keys = new Float64Array(1024);
  let nodes = new Int32Array(1024);
  let size = 0;
  const push = (key: number, node: number) => {
    if (size === keys.length) {
      const k2 = new Float64Array(size * 2);
      k2.set(keys);
      keys = k2;
      const n2 = new Int32Array(size * 2);
      n2.set(nodes);
      nodes = n2;
    }
    let i = size;
    size += 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (keys[parent] <= key) break;
      keys[i] = keys[parent];
      nodes[i] = nodes[parent];
      i = parent;
    }
    keys[i] = key;
    nodes[i] = node;
  };
  const pop = () => {
    const top = nodes[0];
    size -= 1;
    const key = keys[size];
    const node = nodes[size];
    let i = 0;
    for (;;) {
      const l = i * 2 + 1;
      if (l >= size) break;
      const r = l + 1;
      const c = r < size && keys[r] < keys[l] ? r : l;
      if (keys[c] >= key) break;
      keys[i] = keys[c];
      nodes[i] = nodes[c];
      i = c;
    }
    keys[i] = key;
    nodes[i] = node;
    return top;
  };
  dist[source] = 0;
  push(0, source);
  const diagonal = step * Math.SQRT2;
  while (size) {
    const p = pop();
    if (done[p]) continue;
    done[p] = 1;
    const px = p % W;
    const py = (p - px) / W;
    for (let dy = -1; dy <= 1; dy += 1) {
      const y = py + dy;
      if (y < 0 || y >= H) continue;
      for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue;
        const x = px + dx;
        if (x < 0 || x >= W) continue;
        const q = y * W + x;
        if (done[q]) continue;
        const d = dist[p] + (dx && dy ? diagonal : step) * (cost[p] + cost[q]) * 0.5;
        if (d < dist[q]) {
          dist[q] = d;
          push(d, q);
        }
      }
    }
  }
  return dist;
}

/**
 * How a printed word's ink runs from a drop: its polygons (in its own
 * frame, filled by the nonzero rule) on a grid `step` apart, the drop on
 * its heaviest stroke near its middle, and `grain` (how far ahead the ink
 * runs at a point, along the cloth's threads) taken off each point's run.
 * Null with no ink.
 */
export function inkRun(polygons: readonly Loop[], step: number, grain: (x: number, y: number) => number = () => 0): InkRun | null {
  if (!(step > 0)) return null;
  // Two clear points all round, so every front traced in it closes inside the grid.
  const grid = gridOver(polygons, 0, 1 / step);
  if (!grid) return null;
  const { ox, oy, W, H } = grid;
  const inside = insideOf(polygons, grid);
  const depth = depthOf(inside, W, H);
  // The drop falls on the heaviest stroke, favouring the word's middle.
  let lo = Infinity;
  let hi = -Infinity;
  for (let p = 0; p < inside.length; p += 1) {
    if (!inside[p]) continue;
    const x = p % W;
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  if (!Number.isFinite(lo)) return null;
  const mid = (lo + hi) / 2;
  const half = Math.max(1, (hi - lo) / 2);
  let source = -1;
  let best = -Infinity;
  for (let p = 0; p < inside.length; p += 1) {
    if (!inside[p]) continue;
    const score = depth[p] * (1 - (0.45 * Math.abs((p % W) - mid)) / half);
    if (score > best) {
      best = score;
      source = p;
    }
  }
  const cost = new Float32Array(W * H);
  for (let p = 0; p < cost.length; p += 1) cost[p] = inside[p] ? 1 : BARE_COST;
  const run = runsFrom(source, cost, W, H, step);
  let far = 0;
  for (let p = 0; p < run.length; p += 1) {
    const x = ox + (p % W) * step;
    const y = oy + Math.floor(p / W) * step;
    run[p] -= grain(x, y);
    if (inside[p] && run[p] > far) far = run[p];
  }
  const sx = source % W;
  return { ox, oy, step, W, H, run, drop: { x: ox + sx * step, y: oy + ((source - sx) / W) * step }, far, scratch: new Float32Array(W * H) };
}

/** Where the ink has run to once it has run `reach`: closed loops in the word's own frame, holes the other way round (for a clip). */
export function runTo(ink: InkRun, reach: number): Loop[] {
  const { ox, oy, step, W, H, run, scratch: values } = ink;
  for (let p = 0; p < values.length; p += 1) values[p] = reach - run[p];
  return contours(values, W, H, 0).map((loop) => simplify(loop.map((v, i) => (i % 2 ? oy + v * step : ox + v * step)), step * 0.2));
}
