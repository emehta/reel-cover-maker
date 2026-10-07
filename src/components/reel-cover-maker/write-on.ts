/**
 * A word written on as a pen would write it (the owner's ask, 7 Oct: Type
 * and draw's script word "not actually drawing", unlike Pasty's paste
 * written live). A typeface keeps no strokes, only outlines, so the strokes
 * are found from the letters' ink:
 *
 * 1. The ink is thinned to its middle line (Zhang and Suen's thinning), and
 *    the short spurs thinning leaves at a stroke's corners are cut back.
 * 2. Each piece of that line is followed as a pen goes: from its leftmost
 *    end, straight on through a crossing rather than round a corner, the
 *    other way at a fork begun a moment after (so a bowl fills in as the
 *    pen passes it), piece after piece left to right (an i's dot, an
 *    apostrophe, after the word they sit over has begun). How far the pen
 *    has come is the time each point of the line is written at.
 * 3. Every pixel of ink takes the time of the nearest point of the line,
 *    reached through the ink itself, so a stroke appears its whole width as
 *    the pen passes.
 *
 * Shown `at` of the way through, a pixel is drawn once the pen has passed
 * it, fading up over a short stretch behind the pen, so a stroke's end is
 * soft as wet ink is. All in plain arrays, worked out once a word.
 *
 * Pure: the tests run it.
 */

export interface RevealMap {
  w: number;
  h: number;
  /** When each pixel is written, 0 to 1 through the word; Infinity where it is not ink. */
  time: Float32Array;
}

/** How far behind the pen a pixel takes to come up to full, as a share of the word. */
export const SOFT = 0.03;

/** The ink a pixel must hold to be a stroke's (out of 255); fainter edge pixels follow the stroke beside them. */
const INK = 128;

/** The eight neighbours, clockwise from straight up, as (dx, dy). */
const AROUND: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];

/** Zhang and Suen's thinning: the ink worn away from both sides at once until one pixel is left across every stroke. */
function thin(ink: Uint8Array, w: number, h: number): Uint8Array {
  const img = ink.slice();
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : img[y * w + x]);
  // Only what is still ink is looked at again.
  let alive: number[] = [];
  for (let i = 0; i < img.length; i += 1) if (img[i]) alive.push(i);
  const gone: number[] = [];
  const p = new Uint8Array(8);
  let changed = true;
  while (changed) {
    changed = false;
    for (const pass of [0, 1]) {
      gone.length = 0;
      for (const i of alive) {
        if (!img[i]) continue;
        const x = i % w;
        const y = (i - x) / w;
        let count = 0;
        for (let k = 0; k < 8; k += 1) {
          p[k] = at(x + AROUND[k][0], y + AROUND[k][1]);
          count += p[k];
        }
        if (count < 2 || count > 6) continue;
        let turns = 0;
        for (let k = 0; k < 8; k += 1) if (!p[k] && p[(k + 1) % 8]) turns += 1;
        if (turns !== 1) continue;
        // p[0] up, p[2] right, p[4] down, p[6] left.
        if (pass === 0 ? p[0] * p[2] * p[4] || p[2] * p[4] * p[6] : p[0] * p[2] * p[6] || p[0] * p[4] * p[6]) continue;
        gone.push(i);
      }
      for (const i of gone) img[i] = 0;
      if (gone.length) changed = true;
    }
    alive = alive.filter((i) => img[i]);
  }
  return img;
}

function neighbours(line: Uint8Array, w: number, h: number, i: number): number[] {
  const x = i % w;
  const y = (i - x) / w;
  const out: number[] = [];
  for (const [dx, dy] of AROUND) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < w && ny < h && line[ny * w + nx]) out.push(ny * w + nx);
  }
  return out;
}

/** The short spurs thinning leaves at a stroke's corners, cut back to the stroke they hang from: any end within `reach` of a fork. */
function prune(line: Uint8Array, w: number, h: number, reach: number): void {
  const ends: number[] = [];
  for (let i = 0; i < line.length; i += 1) if (line[i] && neighbours(line, w, h, i).length === 1) ends.push(i);
  for (const end of ends) {
    const path = [end];
    let previous = -1;
    let here = end;
    while (path.length <= reach) {
      const next = neighbours(line, w, h, here).filter((n) => n !== previous && !path.includes(n));
      if (next.length !== 1) break;
      previous = here;
      here = next[0];
      if (neighbours(line, w, h, here).length >= 3) {
        // A fork reached within reach: the way here was a spur.
        for (const i of path) line[i] = 0;
        break;
      }
      path.push(here);
    }
  }
}

/**
 * When each pixel of a word's ink is written, from its ink (`alpha`, 0 to
 * 255 a pixel, `w` by `h`, with a clear pixel at least round its edge).
 */
export function revealMap(alpha: ArrayLike<number>, w: number, h: number): RevealMap {
  const n = w * h;
  const ink = new Uint8Array(n);
  let inkCount = 0;
  for (let i = 0; i < n; i += 1) {
    if (alpha[i] >= INK) {
      ink[i] = 1;
      inkCount += 1;
    }
  }
  const line = thin(ink, w, h);
  let lineCount = 0;
  for (let i = 0; i < n; i += 1) lineCount += line[i];
  // A stroke's width, from the ink against its middle line's length: spurs shorter than about that are corners, not strokes.
  const width = lineCount ? inkCount / lineCount : 1;
  prune(line, w, h, Math.max(2, Math.round(width * 0.8)));

  // The line's pieces, leftmost first.
  const piece = new Int32Array(n).fill(-1);
  const pieces: { left: number; top: number; pixels: number[] }[] = [];
  for (let i = 0; i < n; i += 1) {
    if (!line[i] || piece[i] >= 0) continue;
    const id = pieces.length;
    const pixels: number[] = [];
    const stack = [i];
    piece[i] = id;
    let left = Infinity;
    let top = Infinity;
    while (stack.length) {
      const p = stack.pop() as number;
      pixels.push(p);
      left = Math.min(left, p % w);
      top = Math.min(top, Math.floor(p / w));
      for (const q of neighbours(line, w, h, p)) {
        if (piece[q] < 0) {
          piece[q] = id;
          stack.push(q);
        }
      }
    }
    pieces.push({ left, top, pixels });
  }
  pieces.sort((a, b) => a.left - b.left || a.top - b.top);

  // Each piece followed as a pen goes, from its leftmost end: the time a
  // point is written is how far the pen has come to it along the line. At
  // a fork the stroke goes straight on; the other way starts a moment
  // after (a pen's few strokes' worth), so a letter's bowl or loop fills in
  // as the pen passes it rather than once the whole word is done, while a
  // loop is still traced mostly one way round.
  const time = new Float32Array(n).fill(Infinity);
  const seen = new Uint8Array(n);
  const from = new Int32Array(n).fill(-1);
  let pen = 0;
  /** A pen lifted between pieces costs a little time: as a hand's pause. */
  const lift = Math.max(2, width);
  /** How much later the way a stroke does not go on is begun. */
  const aside = Math.max(6, width * 2.5);
  const xy = (i: number) => [i % w, Math.floor(i / w)] as const;
  // A small heap of [time, pixel, came from], earliest first.
  const heap: [number, number, number][] = [];
  const push = (item: [number, number, number]) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent][0] <= heap[i][0]) break;
      [heap[parent], heap[i]] = [heap[i], heap[parent]];
      i = parent;
    }
  };
  const pop = (): [number, number, number] => {
    const top = heap[0];
    const end = heap.pop() as [number, number, number];
    if (heap.length) {
      heap[0] = end;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let least = i;
        if (l < heap.length && heap[l][0] < heap[least][0]) least = l;
        if (r < heap.length && heap[r][0] < heap[least][0]) least = r;
        if (least === i) break;
        [heap[least], heap[i]] = [heap[i], heap[least]];
        i = least;
      }
    }
    return top;
  };
  pieces.forEach((p, k) => {
    if (k) pen += lift;
    const ends = p.pixels.filter((i) => neighbours(line, w, h, i).length === 1);
    const start = (ends.length ? ends : p.pixels).reduce((best, i) => (xy(i)[0] < xy(best)[0] || (xy(i)[0] === xy(best)[0] && xy(i)[1] > xy(best)[1]) ? i : best));
    let latest = pen;
    push([pen, start, -1]);
    while (heap.length) {
      const [t, here, came] = pop();
      if (seen[here]) continue;
      seen[here] = 1;
      time[here] = t;
      from[here] = came;
      latest = Math.max(latest, t);
      const next = neighbours(line, w, h, here).filter((q) => !seen[q]);
      if (!next.length) continue;
      // Straight on, where the stroke was going: the heading over the last few pixels it came by.
      let back = here;
      for (let s = 0; s < 4 && from[back] >= 0; s += 1) back = from[back];
      const [hx, hy] = xy(here);
      const [bx, by] = xy(back);
      let dx = hx - bx;
      let dy = hy - by;
      if (!dx && !dy) {
        // Starting: rightward, as writing goes.
        dx = 1;
        dy = 0;
      }
      const length = Math.hypot(dx, dy);
      let best = next[0];
      let bestScore = -Infinity;
      for (const q of next) {
        const [qx, qy] = xy(q);
        const score = ((qx - hx) * dx + (qy - hy) * dy) / (length * Math.hypot(qx - hx, qy - hy));
        if (score > bestScore) {
          bestScore = score;
          best = q;
        }
      }
      for (const q of next) {
        const [qx, qy] = xy(q);
        push([t + Math.hypot(qx - hx, qy - hy) + (q === best ? 0 : aside), q, here]);
      }
    }
    pen = latest;
  });

  // Every pixel of ink, faint edges included, from the nearest point of the line through the ink:
  // straight across the stroke first (four ways, so an edge takes the time of the middle beside it,
  // not of one a little behind), then any corner only a diagonal reaches.
  const total = pen || 1;
  const queue = new Int32Array(n);
  let tail = 0;
  for (let i = 0; i < n; i += 1) {
    if (line[i] && Number.isFinite(time[i])) {
      time[i] /= total;
      queue[tail] = i;
      tail += 1;
    }
  }
  const spread = (ways: readonly (readonly [number, number])[], from: number) => {
    let head = 0;
    let end = from;
    while (head < end) {
      const i = queue[head];
      head += 1;
      const x = i % w;
      const y = (i - x) / w;
      for (const [dx, dy] of ways) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (alpha[j] <= 0 || Number.isFinite(time[j])) continue;
        time[j] = time[i];
        queue[end] = j;
        end += 1;
      }
    }
    return end;
  };
  const straight = AROUND.filter(([dx, dy]) => dx === 0 || dy === 0);
  const reached = spread(straight, tail);
  // The diagonals, from everything reached so far.
  let more = 0;
  for (let i = 0; i < n; i += 1) if (Number.isFinite(time[i])) queue[more++] = i;
  if (more < n && reached > 0) spread(AROUND, more);
  // Ink the line never reached (a speck thinning wore away): written last.
  for (let i = 0; i < n; i += 1) if (alpha[i] > 0 && !Number.isFinite(time[i])) time[i] = 1;
  return { w, h, time };
}

/** How much of a pixel written at `time` shows, `at` of the way through: none until the pen reaches it, all a short stretch after. */
export function revealAt(time: number, at: number): number {
  if (!Number.isFinite(time)) return 0;
  const pen = at * (1 + SOFT);
  return Math.min(1, Math.max(0, (pen - time) / SOFT));
}
