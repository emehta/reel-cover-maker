/**
 * Stickery's sticker: a shape of straight steps around its words.
 *
 * Every letter's box, padded, is snapped out to a coarse grid; the cells it
 * touches are the sticker. Holes are filled, gaps a cell wide are closed so
 * the sticker is one piece, and the outline of the cells is traced as a
 * polygon of horizontal and vertical edges, which steps around ascenders,
 * descenders and the ends of lines as a cut paper sticker does.
 *
 * Cut by hand, a sticker's sides are never ruled: where the words leave a
 * side straight for long, the scissors stepped out somewhere along it. So
 * every straight run of the outline longer than `rough.run` cells, every
 * outermost side (its top, bottom, left and right) of four cells or more,
 * and now and then another run, has a step a cell out cut into it, a block
 * of a few cells, placed and sized by the seed. A step only ever adds paper, so
 * every letter stays covered.
 */

import type { Rect } from "@/components/reel-cover-maker/formats";
import { random } from "@/components/reel-cover-maker/noise";

export interface StepSpec {
  /** The grid's cell, and how far the sticker reaches past each letter, in pixels of the picture. */
  cell: number;
  pad: number;
  /** Steps cut into long straight sides: the longest run left straight, in cells, and the seed that places them. */
  rough?: { run: number; seed: number };
}

/** Each polygon a flat [x0, y0, x1, y1, ...] list, clockwise, in pixels of the picture. */
export type Polygon = number[];

export function steppedOutline(boxes: Rect[], spec: StepSpec): Polygon[] {
  const live = boxes.filter((b) => b.w > 0 && b.h > 0);
  if (!live.length) return [];
  const { cell, pad } = spec;
  const minX = Math.min(...live.map((b) => b.x)) - pad - 2 * cell;
  const minY = Math.min(...live.map((b) => b.y)) - pad - 2 * cell;
  const maxX = Math.max(...live.map((b) => b.x + b.w)) + pad + 2 * cell;
  const maxY = Math.max(...live.map((b) => b.y + b.h)) + pad + 2 * cell;
  const ox = Math.floor(minX / cell) * cell;
  const oy = Math.floor(minY / cell) * cell;
  const cols = Math.ceil((maxX - ox) / cell);
  const rows = Math.ceil((maxY - oy) / cell);
  let grid = new Uint8Array(cols * rows);

  // Every cell a padded box reaches.
  for (const b of live) {
    const c0 = Math.max(0, Math.floor((b.x - pad - ox) / cell));
    const c1 = Math.min(cols - 1, Math.ceil((b.x + b.w + pad - ox) / cell) - 1);
    const r0 = Math.max(0, Math.floor((b.y - pad - oy) / cell));
    const r1 = Math.min(rows - 1, Math.ceil((b.y + b.h + pad - oy) / cell) - 1);
    for (let r = r0; r <= r1; r += 1) for (let c = c0; c <= c1; c += 1) grid[r * cols + c] = 1;
  }

  // Closing by one cell: gaps a cell wide between words and lines are
  // bridged, so the sticker is one piece rather than a scatter of tags.
  const around = (g: Uint8Array, test: (v: number) => boolean) => {
    const out = new Uint8Array(cols * rows);
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        let any = false;
        for (let dr = -1; dr <= 1 && !any; dr += 1) {
          for (let dc = -1; dc <= 1 && !any; dc += 1) {
            const rr = r + dr;
            const cc = c + dc;
            const v = rr < 0 || cc < 0 || rr >= rows || cc >= cols ? 0 : g[rr * cols + cc];
            if (test(v)) any = true;
          }
        }
        out[r * cols + c] = any ? 1 : 0;
      }
    }
    return out;
  };
  const dilated = around(grid, (v) => v === 1);
  const touchesEmpty = around(dilated, (v) => v === 0);
  for (let i = 0; i < grid.length; i += 1) if (dilated[i] && !touchesEmpty[i]) grid[i] = 1;

  // Holes filled: any empty cell the outside cannot reach.
  const fillHoles = (g: Uint8Array) => {
    const outside = new Uint8Array(cols * rows);
    const queue: number[] = [];
    for (let c = 0; c < cols; c += 1) queue.push(c, (rows - 1) * cols + c);
    for (let r = 0; r < rows; r += 1) queue.push(r * cols, r * cols + cols - 1);
    while (queue.length) {
      const i = queue.pop() as number;
      if (outside[i] || g[i]) continue;
      outside[i] = 1;
      const r = Math.floor(i / cols);
      const c = i % cols;
      if (r > 0) queue.push(i - cols);
      if (r < rows - 1) queue.push(i + cols);
      if (c > 0) queue.push(i - 1);
      if (c < cols - 1) queue.push(i + 1);
    }
    return g.map((v, i) => (v || !outside[i] ? 1 : 0));
  };
  grid = fillHoles(grid);
  if (spec.rough) {
    grid = roughen(grid, cols, rows, spec.rough);
    grid = fillHoles(grid);
  }

  // The cells' outline: an edge wherever a filled cell meets an empty one,
  // directed so the filled side is on the right (clockwise on screen).
  const on = (r: number, c: number) => r >= 0 && c >= 0 && r < rows && c < cols && grid[r * cols + c] === 1;
  const key = (x: number, y: number) => y * (cols + 1) + x;
  const edges = new Map<number, number[]>();
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    const k = key(x0, y0);
    const list = edges.get(k) ?? [];
    list.push(key(x1, y1));
    edges.set(k, list);
  };
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (!on(r, c)) continue;
      if (!on(r - 1, c)) add(c, r, c + 1, r);
      if (!on(r, c + 1)) add(c + 1, r, c + 1, r + 1);
      if (!on(r + 1, c)) add(c + 1, r + 1, c, r + 1);
      if (!on(r, c - 1)) add(c, r + 1, c, r);
    }
  }

  const polygons: Polygon[] = [];
  const xOf = (k: number) => k % (cols + 1);
  const yOf = (k: number) => Math.floor(k / (cols + 1));
  while (edges.size) {
    const start = edges.keys().next().value as number;
    const loop: number[] = [start];
    let current = start;
    let previous = -1;
    for (let guard = 0; guard < cols * rows * 4; guard += 1) {
      const outs = edges.get(current);
      if (!outs || !outs.length) break;
      // Where two corners touch, turn right first, which keeps each loop simple.
      let pick = 0;
      if (outs.length > 1 && previous >= 0) {
        const dx = xOf(current) - xOf(previous);
        const dy = yOf(current) - yOf(previous);
        const right = outs.findIndex((o) => xOf(o) - xOf(current) === -dy && yOf(o) - yOf(current) === dx);
        if (right >= 0) pick = right;
      }
      const to = outs.splice(pick, 1)[0];
      if (!outs.length) edges.delete(current);
      previous = current;
      current = to;
      if (current === start) break;
      loop.push(current);
    }
    // Corners only: points in the middle of a straight run are dropped.
    const corners: number[] = [];
    for (let i = 0; i < loop.length; i += 1) {
      const a = loop[(i - 1 + loop.length) % loop.length];
      const b = loop[i];
      const c = loop[(i + 1) % loop.length];
      const straight = (xOf(a) === xOf(b) && xOf(b) === xOf(c)) || (yOf(a) === yOf(b) && yOf(b) === yOf(c));
      if (!straight) corners.push(ox + xOf(b) * cell, oy + yOf(b) * cell);
    }
    if (corners.length >= 8) polygons.push(corners);
  }
  return polygons;
}

/** The four ways a side can face: the step of a cell out of it, and the step along it. */
const SIDES = [
  { out: [-1, 0], along: [0, 1] },
  { out: [1, 0], along: [0, 1] },
  { out: [0, -1], along: [1, 0] },
  { out: [0, 1], along: [1, 0] },
] as const;

/** Steps cut into the straight runs of a grid's outline (see the note at the top). */
function roughen(start: Uint8Array<ArrayBuffer>, cols: number, rows: number, rough: { run: number; seed: number }): Uint8Array<ArrayBuffer> {
  const grid = start.slice();
  const next = random(rough.seed);
  const on = (r: number, c: number) => r >= 0 && c >= 0 && r < rows && c < cols && grid[r * cols + c] === 1;
  const inside = (r: number, c: number) => r >= 1 && c >= 1 && r < rows - 1 && c < cols - 1;
  // Each piece of paper's outermost row and column on each side, as it
  // stands before any step: words far apart can make two stickers.
  const piece = new Int32Array(cols * rows).fill(-1);
  const outermost: number[][] = [];
  for (let i = 0; i < grid.length; i += 1) {
    if (!grid[i] || piece[i] >= 0) continue;
    const id = outermost.length;
    const box = [rows, -1, cols, -1];
    const queue = [i];
    piece[i] = id;
    while (queue.length) {
      const at = queue.pop() as number;
      const r = Math.floor(at / cols);
      const c = at % cols;
      box[0] = Math.min(box[0], r);
      box[1] = Math.max(box[1], r);
      box[2] = Math.min(box[2], c);
      box[3] = Math.max(box[3], c);
      for (const [nr, nc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
        if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
        const n = nr * cols + nc;
        if (grid[n] && piece[n] < 0) {
          piece[n] = id;
          queue.push(n);
        }
      }
    }
    outermost.push(box);
  }
  for (let pass = 0; pass < 16; pass += 1) {
    let long = false;
    for (const [side, { out, along }] of SIDES.entries()) {
      const [dr, dc] = out;
      const [ar, ac] = along;
      // Every straight run on this side: filled cells in a line, each with nothing beyond it.
      const exposed = (r: number, c: number) => on(r, c) && !on(r + dr, c + dc);
      const lines = ar ? cols : rows;
      const length = ar ? rows : cols;
      for (let line = 0; line < lines; line += 1) {
        let k = 0;
        while (k < length) {
          const at = (j: number): [number, number] => (ar ? [j, line] : [line, j]);
          if (!exposed(...at(k))) {
            k += 1;
            continue;
          }
          let end = k;
          while (end + 1 < length && exposed(...at(end + 1))) end += 1;
          const run = end - k + 1;
          const over = run > rough.run;
          long ||= over;
          const [kr, kc] = at(k);
          const own = piece[kr * cols + kc];
          const edge = pass === 0 && own >= 0 && line === outermost[own][side] && run >= 4;
          if (over || edge || (pass === 0 && run >= 8 && next() < 0.15)) {
            // A step one cell out, a block two to eight cells wide (one on
            // a short side), clear of the run's ends.
            const most = Math.max(1, Math.min(8, Math.floor(run * 0.42)));
            const width = most <= 1 ? 1 : 2 + Math.floor(next() * (most - 1));
            const margin = run - width >= 4 ? 2 : 1;
            const offset = margin + Math.floor(next() * Math.max(1, run - width - 2 * margin + 1));
            const cells: [number, number][] = [];
            for (let j = 0; j < width; j += 1) {
              const [r, c] = at(k + offset + j);
              cells.push([r + dr, c + dc]);
            }
            // Only into open paper: nothing in it, nothing just beyond it, so the step never joins another.
            const clear = cells.every(([r, c]) => inside(r, c) && !on(r, c) && !on(r + dr, c + dc)) &&
              [cells[0], cells[cells.length - 1]].every(([r, c], e) => {
                const sr = r + (e ? ar : -ar);
                const sc = c + (e ? ac : -ac);
                return !on(sr + dr, sc + dc);
              });
            if (clear) for (const [r, c] of cells) grid[r * cols + c] = 1;
          }
          k = end + 1;
        }
      }
    }
    if (!long) break;
  }
  return grid;
}

/** The longest straight edge of a polygon, along either axis, in the polygon's units. */
export function longestEdge(polygon: Polygon): number {
  let best = 0;
  for (let i = 0; i < polygon.length; i += 2) {
    const j = (i + 2) % polygon.length;
    best = Math.max(best, Math.abs(polygon[j] - polygon[i]) + Math.abs(polygon[j + 1] - polygon[i + 1]));
  }
  return best;
}

/** Whether a point lies inside a polygon (even-odd). */
export function insidePolygon(polygon: Polygon, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 2; i < polygon.length; j = i, i += 2) {
    const xi = polygon[i];
    const yi = polygon[i + 1];
    const xj = polygon[j];
    const yj = polygon[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function polygonBounds(polygons: Polygon[]): Rect {
  const xs = polygons.flatMap((p) => p.filter((_, i) => i % 2 === 0));
  const ys = polygons.flatMap((p) => p.filter((_, i) => i % 2 === 1));
  if (!xs.length) return { x: 0, y: 0, w: 0, h: 0 };
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
