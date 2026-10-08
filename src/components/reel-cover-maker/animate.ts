/**
 * Animated covers (the owner's ask, 7 Oct): the cover's own scene laid down
 * over a few seconds in a way that suits its style, then held. Each
 * animation is a function of time on the scene the style made, so nothing
 * is set again: the last frame is the cover exactly as it stands, and a
 * still at any moment is the same still every time.
 *
 * - Stickery: Type and draw (its plain words typed and its funky ones
 *   written, a script word traced stroke by stroke as a pen would,
 *   write-on.ts, paste piped bead by bead; the paper laid under each letter
 *   as it comes, step by step on the grid its steps were cut on), Slap (each
 *   sticker brought down from in front of the screen, big and blurred as if
 *   near the eye, its shadow closing in, slapped flat where it lands, the
 *   ones already down knocked back), Pop (each springs on), and Reveal (each
 *   comes into focus out of nothing). The owner, 8 Oct: the paper "already
 *   there", Slap "coming from the bottom", Rise not wanted, Pop kept.
 * - Pasty and Pasty Flat: Written live (letter after letter, each stroke
 *   piped as if by hand). All at once and Pop were cut (the owner, 7 Oct:
 *   "so bad").
 * - Editorial: Word by word, Typewriter, Line by line.
 * - Echo: Ripple (the words, then each echo out from them in turn), Spread
 *   (the echoes slide out from the words to their places), Cascade (every
 *   line drops in, top to bottom).
 * - Mono: Typewriter (its cursor typing), Word by word.
 *
 * An effect is worked out where it is seen (a sticker lands about its own
 * middle on the cover) and carried into each op's own frame, through the
 * turns and the owner's placement it is drawn inside; paste is moved bead
 * by bead, since its layer is made for where it lies. A sticker on its way
 * in is drawn over everything laid, its paste with it, as a thing nearer
 * the eye is. Any animation runs at a speed of its own (half to twice as
 * fast), its times scaled.
 *
 * Pure: the tests run it.
 */

import type { FaceId, Measurer } from "@/components/reel-cover-maker/faces";
import type { Bead, Chain } from "@/components/reel-cover-maker/liquid";
import { apply, invert, multiply, type Matrix, type Point } from "@/components/reel-cover-maker/place";
import { isBackdrop, pasteKey, type LiquidOp, type Op, type Scene, type StyleId } from "@/components/reel-cover-maker/scene";
import { fillHoles, insidePolygon, polygonBounds, traceCells, type Polygon } from "@/components/reel-cover-maker/stepped";
import { graphemes } from "@/components/reel-cover-maker/title";

export type AnimationId = "type-draw" | "slap" | "pop" | "reveal" | "written" | "words" | "typewriter" | "lines" | "ripple" | "spread" | "cascade";

export interface Animation {
  id: AnimationId;
  name: string;
}

/** Each style's animations, the one it starts on first. */
export const ANIMATIONS: Record<StyleId, readonly Animation[]> = {
  stickery: [
    { id: "type-draw", name: "Type and draw" },
    { id: "slap", name: "Slap" },
    { id: "pop", name: "Pop" },
    { id: "reveal", name: "Reveal" },
  ],
  pasty: [{ id: "written", name: "Written live" }],
  "pasty-flat": [{ id: "written", name: "Written live" }],
  editorial: [
    { id: "words", name: "Word by word" },
    { id: "typewriter", name: "Typewriter" },
    { id: "lines", name: "Line by line" },
  ],
  echo: [
    { id: "ripple", name: "Ripple" },
    { id: "spread", name: "Spread" },
    { id: "cascade", name: "Cascade" },
  ],
  mono: [
    { id: "typewriter", name: "Typewriter" },
    { id: "words", name: "Word by word" },
  ],
};

export function animationsFor(style: StyleId): readonly Animation[] {
  return ANIMATIONS[style];
}

/** Whether `id` is one of `style`'s animations. */
export function offers(style: StyleId, id: unknown): id is AnimationId {
  return ANIMATIONS[style].some((a) => a.id === id);
}

/** How long the cover stands, finished, at the end of a video: long enough to read before an editor's next cut. */
export const HOLD = 1.5;

/** The longest the motion may run at its own speed: anything set out longer is quickened to fit. */
export const LONGEST = 5;

/** How fast an animation may be run, its own speed times this: half as fast to twice. */
export const SLOWEST = 0.5;
export const FASTEST = 2;

/** A speed asked for, held to what an animation may run at. */
export function speedOf(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(FASTEST, Math.max(SLOWEST, value)) : 1;
}

/**
 * Where a speed sits on the speed slider, -1 to 1: half as fast at the
 * left, its own speed in the middle, twice at the right, each doubling the
 * same distance along (the owner, 8 Oct: 1 was not in the middle).
 */
export function speedPlace(speed: number): number {
  return Math.log2(speedOf(speed));
}

/** How near the middle the slider is held at the animation's own speed, as a place on it. */
const SPEED_CATCH = 0.04;

/** The speed at a place on the slider, to the hundredth: its own speed caught a little either side of the middle. */
export function speedAtPlace(place: number): number {
  const v = Math.min(1, Math.max(-1, Number.isFinite(place) ? place : 0));
  if (Math.abs(v) < SPEED_CATCH) return 1;
  return speedOf(Math.round(2 ** v * 100) / 100);
}

export interface Plan {
  /** How long the motion runs, in seconds; from then on the cover stands as it is. */
  duration: number;
  /** The scene at `t` seconds: nothing yet at 0, the cover itself from `duration` on. */
  frame(t: number): Scene;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** How far through the stretch from `start`, `length` long, the time `t` is. */
const span = (t: number, start: number, length: number) => (length <= 0 ? (t >= start ? 1 : 0) : clamp01((t - start) / length));
const easeOut = (u: number) => 1 - (1 - clamp01(u)) ** 3;
/** Past the mark and back, as a thing thrown on settles. */
const springy = (u: number) => {
  const x = clamp01(u) - 1;
  return 1 + 2.4 * x ** 3 + 1.4 * x ** 2;
};
/** Slow off, quick through the middle, slow to stop: a hand writing a word. */
const easeInOut = (u: number) => {
  const x = clamp01(u);
  return x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2;
};
/** How many of `count` characters are typed at `t`, typed evenly from `start` over `length`: each shows as its key goes down. */
function typedAt(t: number, start: number, length: number, count: number): number {
  if (t < start) return 0;
  return Math.min(count, Math.floor(span(t, start, length) * count) + 1);
}


const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** Scaled by `s` about (cx, cy), then moved by (dx, dy). */
function about(cx: number, cy: number, s: number, dx = 0, dy = 0): Matrix {
  return [s, 0, 0, s, cx - s * cx + dx, cy - s * cy + dy];
}

/** Scaled by `s` and turned by `angle` about `centre`, then moved by (dx, dy): a sticker in the air. */
function thrown(centre: Point, s: number, angle: number, dx: number, dy: number): Matrix {
  const a = s * Math.cos(angle);
  const b = s * Math.sin(angle);
  return [a, b, -b, a, centre.x + dx - (a * centre.x - b * centre.y), centre.y + dy - (b * centre.x + a * centre.y)];
}


/** A canvas's rotation by `angle` about (cx, cy), as a matrix. */
function turnMatrix(cx: number, cy: number, angle: number): Matrix {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy];
}

/** What an op looks like at one moment: where it is seen, how see-through, and what of it shows. */
interface Look {
  /** On the cover, as the op is seen: the effect's own map. */
  move?: Matrix;
  alpha?: number;
  /** How many of a text's characters show. */
  typed?: number;
  /** How far a wipe has drawn it, 0 to 1. */
  drawn?: number;
  /** A sticker's paper as far as it is laid: its outline, in its own frame. */
  polygons?: Polygon[];
}

/** An op, its place in the scene, and the map from its own frame to the cover's. */
interface Leaf {
  op: Op;
  /** From the op's frame to the cover's: every turn and placement it is drawn inside. */
  world: Matrix;
}

function leavesOf(ops: Op[], world: Matrix = IDENTITY, out: Leaf[] = []): Leaf[] {
  for (const op of ops) {
    if (op.kind === "turn") leavesOf(op.ops, multiply(world, turnMatrix(op.cx, op.cy, op.angle)), out);
    else if (op.kind === "matrix") leavesOf(op.ops, multiply(world, op.m), out);
    else if (op.kind === "fade" || op.kind === "write" || op.kind === "blur") leavesOf(op.ops, world, out);
    else if (!isBackdrop(op)) out.push({ op, world });
  }
  return out;
}

/** The ops again, each leaf as `at` has it (null to leave it out), every turn and placement kept round them. */
function mapLeaves(ops: Op[], at: (op: Op) => Op | null): Op[] {
  const out: Op[] = [];
  for (const op of ops) {
    if (op.kind === "turn" || op.kind === "matrix") {
      const inner = mapLeaves(op.ops, at);
      if (inner.length) out.push({ ...op, ops: inner });
    } else if (isBackdrop(op)) {
      out.push(op);
    } else {
      const made = at(op);
      if (made) out.push(made);
    }
  }
  return out;
}

/** A text op's ink box, in its own frame. */
function textBox(op: Extract<Op, { kind: "text" }>, measurer: Measurer) {
  const b = measurer.bounds(op.face, op.text);
  return { x: op.x - b.left * op.size, y: op.y - b.ascent * op.size, w: (b.left + b.right) * op.size, h: (b.ascent + b.descent) * op.size };
}

function centreOf(rect: { x: number; y: number; w: number; h: number }): Point {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

/** A leaf's middle, on the cover. */
function leafCentre(leaf: Leaf, measurer: Measurer): Point {
  const op = leaf.op;
  if (op.kind === "text") return apply(leaf.world, centreOf(textBox(op, measurer)));
  if (op.kind === "box") return apply(leaf.world, centreOf(op));
  if (op.kind === "shape") return apply(leaf.world, centreOf(polygonBounds(op.polygons)));
  return { x: 0, y: 0 };
}

/** A leaf as it looks: its text cut short, wiped, moved and faded, each in its own frame. */
function looked(leaf: Leaf, look: Look | null, measurer: Measurer): Op | null {
  if (!look) return leaf.op;
  let op: Op = leaf.op;
  if (look.typed !== undefined && op.kind === "text") {
    const shown = graphemes(op.text).slice(0, Math.max(0, look.typed)).join("");
    if (!shown) return null;
    op = { ...op, text: shown };
  }
  if (look.polygons && op.kind === "shape") {
    if (!look.polygons.length) return null;
    op = { ...op, polygons: look.polygons };
  }
  if (look.drawn !== undefined && leaf.op.kind === "text") {
    if (look.drawn <= 0) return null;
    if (look.drawn < 1) {
      const box = textBox(leaf.op, measurer);
      op = { kind: "write", ...box, at: look.drawn, ops: [op] };
    }
  }
  if (look.move) {
    // The map as seen on the cover, carried into the op's own frame.
    const local = multiply(invert(leaf.world), multiply(look.move, leaf.world));
    op = { kind: "matrix", m: local, ops: [op] };
  }
  if (look.alpha !== undefined && look.alpha < 1) {
    if (look.alpha <= 0) return null;
    op = { kind: "fade", alpha: look.alpha, ops: [op] };
  }
  return op;
}

// Paste.

/** A chain's length along its beads. */
function chainLength(chain: Chain): number {
  let length = 0;
  for (let i = 1; i < chain.length; i += 1) length += Math.hypot(chain[i].x - chain[i - 1].x, chain[i].y - chain[i - 1].y);
  return length;
}

/** The first `part` of a chain, by length, its last bead where the nozzle is; empty before it starts. */
export function chainPart(chain: Chain, part: number): Chain {
  if (part <= 0 || !chain.length) return [];
  if (part >= 1 || chain.length === 1) return chain;
  const goal = chainLength(chain) * part;
  const out: Bead[] = [chain[0]];
  let gone = 0;
  for (let i = 1; i < chain.length; i += 1) {
    const a = chain[i - 1];
    const b = chain[i];
    const step = Math.hypot(b.x - a.x, b.y - a.y);
    if (gone + step >= goal) {
      const f = step > 0 ? (goal - gone) / step : 1;
      out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, r: a.r + (b.r - a.r) * f });
      return out;
    }
    out.push(b);
    gone += step;
  }
  return out;
}

/** The finished paste's typical radius, as its layer would find it: the median bead's. */
function typicalRadius(op: LiquidOp): number {
  const radii = op.chains.flatMap((c) => c.map((b) => b.r)).sort((p, q) => p - q);
  return radii.length ? radii[Math.floor(radii.length / 2)] : 1;
}

/**
 * The paste with each chain as `shown` has it (how much of it, and any map
 * to move it by), keyed again for what it now is; the finished paste's
 * radius pinned, so what is laid keeps its light; null with nothing laid.
 * The seed stays the paste's own, so its gloss does not flicker.
 */
function pasteAt(op: LiquidOp, radius: number, shown: (index: number) => { part: number; move?: Matrix } | null): LiquidOp | null {
  const chains: Chain[] = [];
  const colourOf: number[] = [];
  const tone: number[] = [];
  let letters = 0;
  let whole = true;
  op.chains.forEach((chain, i) => {
    const s = shown(i);
    if (!s || s.part <= 0) {
      whole = false;
      return;
    }
    let made = chainPart(chain, s.part);
    if (s.part < 1) whole = false;
    if (s.move) {
      const m = s.move;
      const k = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
      made = made.map((b) => ({ ...apply(m, b), r: b.r * k }));
      whole = false;
    }
    if (!made.length) return;
    chains.push(made);
    colourOf.push(op.colourOf[i] ?? 0);
    tone.push(op.tone[i] ?? 1);
    if (i < op.letters) letters += 1;
  });
  if (whole) return op;
  if (!chains.length) return null;
  const key = `${pasteKey(chains, colourOf, tone, op.finish, op.pool)}|r${radius.toFixed(2)}`;
  return { ...op, chains, colourOf, tone, letters, glyphOf: [], lineOf: [], key, radius };
}

/** When each chain is piped: its start and how long it takes, in seconds. */
interface Piping {
  start: number[];
  length: number[];
}

/**
 * Chains piped one after another, `from` on, over `total` seconds: each
 * given time for its length (a dot a little), a pen's lift between letters.
 */
function pipeInTurn(chains: Chain[], indices: number[], from: number, total: number, glyphOf: number[] = []): { piping: Piping; end: number } {
  const start: number[] = [];
  const length: number[] = [];
  const lengths = indices.map((i) => chainLength(chains[i]) + (chains[i][0]?.r ?? 0) * 2);
  const all = lengths.reduce((a, b) => a + b, 0) || 1;
  const lift = Math.min(0.06, total * 0.02);
  const lifts = indices.filter((i, k) => k > 0 && glyphOf[i] !== glyphOf[indices[k - 1]]).length;
  const writing = Math.max(0.1, total - lift * lifts);
  let t = from;
  indices.forEach((i, k) => {
    if (k > 0 && glyphOf[i] !== glyphOf[indices[k - 1]]) t += lift;
    start[i] = t;
    length[i] = (writing * lengths[k]) / all;
    t += length[i];
  });
  return { piping: { start, length }, end: t };
}

// The animations.

interface Built {
  duration: number;
  /** What each leaf looks like at a time; leaves it does not name stand as they are. */
  look: (leaf: Leaf, t: number) => Look | null;
  /** The paste at a time, for each liquid op. */
  paste?: (op: LiquidOp, t: number) => LiquidOp | null;
  /** Ops put in place of a leaf at a time (a line set word by word); null to look it up as usual. */
  replace?: (leaf: Leaf, t: number) => Op[] | null;
  /** The whole frame's ops at a time, where an animation sets them out itself: a sticker on its way drawn over all that is laid. */
  ops?: (t: number) => Op[];
}

/** Times worked out at length `natural`, quickened to fit the longest a motion may run. */
function fitted(natural: number): number {
  return natural > LONGEST ? LONGEST / natural : 1;
}

/** A thing faded and sprung or floated in, `start` on, over `length`: its look at `t`. */
function arrive(kind: "rise" | "drop" | "fade" | "settle", centre: Point, start: number, length: number, t: number, size: number): Look | null {
  const u = span(t, start, length);
  if (u >= 1) return null;
  const alpha = clamp01(u / 0.45);
  if (kind === "settle") return { alpha, move: about(centre.x, centre.y, 0.9 + 0.1 * easeOut(u)) };
  if (kind === "rise") return { alpha, move: about(centre.x, centre.y, 1, 0, size * (1 - easeOut(u))) };
  if (kind === "drop") return { alpha, move: about(centre.x, centre.y, 1, 0, -size * (1 - easeOut(u))) };
  return { alpha: easeOut(u) };
}

// Paper laid under its words.

/** A sticker's paper as the cells of the grid its steps were cut on: the finished sticker's, and the grid's place. */
interface Paper {
  cols: number;
  rows: number;
  ox: number;
  oy: number;
  cell: number;
  cellY: number;
  inside: Uint8Array;
}

/** The cells a sticker's outline holds, on the grid it was cut on (whose lines pass through its every corner); null with no outline. */
export function paperCells(polygons: Polygon[], cell: number, cellY: number): Paper | null {
  const first = polygons.find((p) => p.length >= 8);
  if (!first || !(cell > 0) || !(cellY > 0)) return null;
  const [x0, y0] = first;
  let c0 = Infinity;
  let c1 = -Infinity;
  let r0 = Infinity;
  let r1 = -Infinity;
  for (const p of polygons) {
    for (let i = 0; i + 1 < p.length; i += 2) {
      const c = Math.round((p[i] - x0) / cell);
      const r = Math.round((p[i + 1] - y0) / cellY);
      c0 = Math.min(c0, c);
      c1 = Math.max(c1, c);
      r0 = Math.min(r0, r);
      r1 = Math.max(r1, r);
    }
  }
  // A clear cell all round, so every outline traced in it closes.
  const ox = x0 + (c0 - 1) * cell;
  const oy = y0 + (r0 - 1) * cellY;
  const cols = c1 - c0 + 2;
  const rows = r1 - r0 + 2;
  const inside = new Uint8Array(cols * rows);
  // Each row's middle crosses the outline at its upright edges: inside between each pair, as the even-odd rule has it.
  for (let r = 0; r < rows; r += 1) {
    const y = oy + (r + 0.5) * cellY;
    const xs: number[] = [];
    for (const p of polygons) {
      for (let i = 0; i + 1 < p.length; i += 2) {
        const j = (i + 2) % p.length;
        const ya = p[i + 1];
        const yb = p[j + 1];
        if (ya > y !== yb > y) xs.push(p[i] + ((y - ya) / (yb - ya)) * (p[j] - p[i]));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.round((xs[k] - ox) / cell));
      const to = Math.min(cols, Math.round((xs[k + 1] - ox) / cell));
      for (let c = from; c < to; c += 1) inside[r * cols + c] = 1;
    }
  }
  return { cols, rows, ox, oy, cell, cellY, inside };
}

/** Something laid on a sticker: its box in the paper's own frame, and when. */
export interface PaperSeed {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  at: number;
}

/**
 * When each cell of a sticker's paper is laid: a cell under a letter when
 * the letter comes, and every other cell when the letter nearest it does
 * (nearest through the paper itself, the earlier where two are as near),
 * so the paper reaches out round each word as it is set and the bridges
 * between words meet halfway. Cells nothing reaches come with the last.
 */
export function paperTimes(paper: Paper, seeds: readonly PaperSeed[]): Float64Array {
  const { cols, rows, ox, oy, cell, cellY, inside } = paper;
  const n = cols * rows;
  const time = new Float64Array(n).fill(Infinity);
  const distance = new Float64Array(n).fill(Infinity);
  // A small heap of [distance, time, cell], nearest first, then earliest.
  const heap: [number, number, number][] = [];
  const before = (a: [number, number, number], b: [number, number, number]) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
  const push = (item: [number, number, number]) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!before(heap[i], heap[parent])) break;
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
        if (l < heap.length && before(heap[l], heap[least])) least = l;
        if (r < heap.length && before(heap[r], heap[least])) least = r;
        if (least === i) break;
        [heap[least], heap[i]] = [heap[i], heap[least]];
        i = least;
      }
    }
    return top;
  };
  let last = -Infinity;
  for (const seed of seeds) {
    last = Math.max(last, seed.at);
    const c0 = Math.max(0, Math.floor((seed.x0 - ox) / cell));
    const c1 = Math.min(cols - 1, Math.ceil((seed.x1 - ox) / cell) - 1);
    const r0 = Math.max(0, Math.floor((seed.y0 - oy) / cellY));
    const r1 = Math.min(rows - 1, Math.ceil((seed.y1 - oy) / cellY) - 1);
    for (let r = r0; r <= r1; r += 1) {
      for (let c = c0; c <= c1; c += 1) {
        const i = r * cols + c;
        if (inside[i] && seed.at < time[i]) {
          time[i] = seed.at;
          distance[i] = 0;
          push([0, seed.at, i]);
        }
      }
    }
  }
  const done = new Uint8Array(n);
  while (heap.length) {
    const [d, t, i] = pop();
    if (done[i]) continue;
    done[i] = 1;
    const r = Math.floor(i / cols);
    const c = i % cols;
    const step = (j: number, by: number) => {
      if (!inside[j] || done[j]) return;
      const e = d + by;
      if (e < distance[j] || (e === distance[j] && t < time[j])) {
        distance[j] = e;
        time[j] = t;
        push([e, t, j]);
      }
    };
    if (c > 0) step(i - 1, cell);
    if (c < cols - 1) step(i + 1, cell);
    if (r > 0) step(i - cols, cellY);
    if (r < rows - 1) step(i + cols, cellY);
  }
  const fallback = Number.isFinite(last) ? last : 0;
  for (let i = 0; i < n; i += 1) if (inside[i] && !Number.isFinite(time[i])) time[i] = fallback;
  return time;
}

/**
 * A sticker's paper at a time, as `paperTimes` lays it: the outline of the
 * cells laid by then (none before the first, null once all are, for the
 * sticker as it is). Each outline is worked out once.
 */
export function paperGrowing(paper: Paper, time: Float64Array): (t: number) => Polygon[] | null {
  const { cols, rows, ox, oy, cell, cellY, inside } = paper;
  const moments = [...new Set(Array.from(time).filter((v, i) => inside[i] && Number.isFinite(v)))].sort((a, b) => a - b);
  const made = new Map<number, Polygon[]>();
  return (t) => {
    let lo = 0;
    let hi = moments.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (moments[mid] <= t) lo = mid + 1;
      else hi = mid;
    }
    if (lo >= moments.length) return null;
    if (lo === 0) return [];
    let outline = made.get(lo);
    if (!outline) {
      const limit = moments[lo - 1];
      const grid = new Uint8Array(cols * rows);
      for (let i = 0; i < grid.length; i += 1) if (inside[i] && time[i] <= limit) grid[i] = 1;
      outline = traceCells(fillHoles(grid, cols, rows), cols, rows, ox, oy, cell, cellY);
      made.set(lo, outline);
    }
    return outline;
  };
}

/** Each letter of a text op that inks, its place in the text and its ink box, in the op's own frame. */
function letterBoxes(op: Extract<Op, { kind: "text" }>, measurer: Measurer): { index: number; box: { x: number; y: number; w: number; h: number } }[] {
  const out: { index: number; box: { x: number; y: number; w: number; h: number } }[] = [];
  let before = "";
  graphemes(op.text).forEach((g, index) => {
    if (g.trim()) {
      const b = measurer.bounds(op.face, g);
      const x = op.x + measurer.width(op.face, before) * op.size;
      out.push({ index, box: { x: x - b.left * op.size, y: op.y - b.ascent * op.size, w: (b.left + b.right) * op.size, h: (b.ascent + b.descent) * op.size } });
    }
    before += g;
  });
  return out;
}

/** How far a written word is drawn, `u` of the way through its time: at a hand's even pace, slowing only to start and stop. */
const drawnAt = (u: number) => 0.15 * easeInOut(u) + 0.85 * clamp01(u);

/** When a written word is `part` drawn, as a share of its time. */
function whenDrawn(part: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 32; i += 1) {
    const mid = (lo + hi) / 2;
    if (drawnAt(mid) < part) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** How far ahead of the pen a written word's paper is laid, as a share of the word: paper under the ink before the ink. */
const PAPER_LEAD = 0.04;

// Stickers coming on whole.

/** A sticker coming on: where it is seen (a map of the cover), how solid, how out of focus, and the shadow it casts on the page. */
interface Pose {
  move?: Matrix;
  alpha?: number;
  blur?: number;
  shadow?: { move: Matrix; alpha: number; blur: number };
}

/** A sticker at a moment: not yet come, on its way (drawn over the rest), or laid (knocked by another landing, perhaps). */
type StickerAt = { kind: "hidden" } | { kind: "coming"; pose: Pose } | { kind: "laid"; move?: Matrix };

/** Stickery: each sticker and what is on it, in reading order. */
function stickery(scene: Scene, id: AnimationId, measurer: Measurer): Built {
  const leaves = leavesOf(scene.ops);
  const stickers = leaves
    .filter((l): l is Leaf & { op: Extract<Op, { kind: "shape" }> } => l.op.kind === "shape")
    .map((l) => {
      const polygons: Polygon[] = l.op.polygons.map((p) => {
        const out: number[] = [];
        for (let i = 0; i < p.length; i += 2) {
          const q = apply(l.world, { x: p[i], y: p[i + 1] });
          out.push(q.x, q.y);
        }
        return out;
      });
      const box = polygonBounds(polygons);
      return { leaf: l, polygons, box, centre: centreOf(box), height: box.h };
    });
  const owner = (p: Point): number => {
    const inside = stickers.findIndex((s) => s.polygons.some((poly) => insidePolygon(poly, p.x, p.y)));
    if (inside >= 0) return inside;
    let best = 0;
    stickers.forEach((s, i) => {
      if (Math.hypot(s.centre.x - p.x, s.centre.y - p.y) < Math.hypot(stickers[best].centre.x - p.x, stickers[best].centre.y - p.y)) best = i;
    });
    return best;
  };
  const words = leaves.filter((l) => l.op.kind === "text").map((l) => ({ leaf: l, centre: leafCentre(l, measurer), on: stickers.length ? owner(leafCentre(l, measurer)) : 0 }));
  const pasteLeaf = leaves.find((l): l is Leaf & { op: LiquidOp } => l.op.kind === "liquid") ?? null;
  const paste = pasteLeaf?.op ?? null;
  // Paste is drawn where its beads say, whatever map it sits in: its beads are on the cover as they are.
  const chainOwner = paste ? paste.chains.map((c) => (stickers.length ? owner(c[Math.floor(c.length / 2)] ?? c[0]) : 0)) : [];
  const radius = paste ? typicalRadius(paste) : 1;

  const sheet = new Map<Op, (t: number) => Look | null>();
  const chainTimes: { start: number; length: number; move?: (t: number) => Matrix | undefined }[] = [];
  let natural = 0;
  /** How much every time is quickened by to fit: read when a time is asked, once it is known. */
  let k = 1;

  if (id === "type-draw") {
    // Each sticker's words in reading order, plain ones typed and funky ones
    // drawn, the paper laid under each letter as it comes.
    const plan: { run: (k: number) => void }[] = [];
    const seeds: PaperSeed[][] = stickers.map(() => []);
    /** When each sticker's first word begins, at its own speed. */
    const begins: number[] = [];
    // A moment of nothing first, so a video opens clear.
    let t = 0.1;
    stickers.forEach((s, si) => {
      begins[si] = t;
      const toPaper = invert(s.leaf.world);
      /** A box in its own frame (`world` maps it onto the cover), laid on this sticker's paper at `at`. */
      const lay = (world: Matrix, box: { x: number; y: number; w: number; h: number }, at: number) => {
        const m = multiply(toPaper, world);
        const corners = [apply(m, { x: box.x, y: box.y }), apply(m, { x: box.x + box.w, y: box.y }), apply(m, { x: box.x, y: box.y + box.h }), apply(m, { x: box.x + box.w, y: box.y + box.h })];
        const xs = corners.map((p) => p.x);
        const ys = corners.map((p) => p.y);
        seeds[si].push({ x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys), at });
      };
      type Unit = { kind: "word"; leaf: Leaf; centre: Point; height: number } | { kind: "paste"; chains: number[]; centre: Point; height: number };
      const units: Unit[] = words
        .filter((w) => w.on === si)
        .map((w) => ({ kind: "word" as const, leaf: w.leaf, centre: w.centre, height: w.leaf.op.kind === "text" ? w.leaf.op.size : 40 }));
      const mine = chainOwner.map((o, i) => (o === si ? i : -1)).filter((i) => i >= 0 && paste && i < paste.letters);
      if (paste && mine.length) {
        const beads = mine.flatMap((i) => paste.chains[i]);
        const ys = beads.map((b) => b.y);
        const xs = beads.map((b) => b.x);
        units.push({ kind: "paste", chains: mine, centre: { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }, height: Math.max(...ys) - Math.min(...ys) });
      }
      units.sort((a, b) => (Math.abs(a.centre.y - b.centre.y) > Math.min(a.height, b.height) * 0.45 ? a.centre.y - b.centre.y : a.centre.x - b.centre.x));
      for (const unit of units) {
        if (unit.kind === "paste" && paste && pasteLeaf) {
          const at = t;
          const length = 0.5 + 0.09 * unit.chains.length;
          // The paper under each bead as the nozzle reaches it.
          const { piping } = pipeInTurn(paste.chains, unit.chains, at, length);
          for (const i of unit.chains) {
            const chain = paste.chains[i];
            const whole = chainLength(chain) || 1;
            let gone = 0;
            chain.forEach((b, j) => {
              if (j) gone += Math.hypot(b.x - chain[j - 1].x, b.y - chain[j - 1].y);
              lay(pasteLeaf.world, { x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2 }, piping.start[i] + (piping.length[i] * gone) / whole);
            });
          }
          plan.push({
            run: (k) => {
              const scaled = pipeInTurn(paste.chains, unit.chains, at * k, length * k).piping;
              for (const i of unit.chains) chainTimes[i] = { start: scaled.start[i], length: scaled.length[i] };
            },
          });
          t += length + 0.06;
          continue;
        }
        if (unit.kind !== "word") continue;
        const op = unit.leaf.op as Extract<Op, { kind: "text" }>;
        const count = graphemes(op.text).length;
        const funky = op.face.startsWith("funky-");
        const at = t;
        const letters = letterBoxes(op, measurer);
        if (funky) {
          const length = 0.34 + 0.085 * count;
          sheet.set(op, (now) => (now >= (at + length) * k ? null : { drawn: drawnAt(span(now, at * k, length * k)) }));
          // Each letter's paper as the pen comes to it, a little ahead: a script word is written left to right.
          const word = textBox(op, measurer);
          for (const { box } of letters) lay(unit.leaf.world, box, at + length * whenDrawn(clamp01((box.x - word.x) / Math.max(1e-6, word.w) - PAPER_LEAD)));
          t += length + 0.05;
        } else {
          const each = 0.045;
          sheet.set(op, (now) => (now >= (at + each * count) * k ? null : { typed: typedAt(now, at * k, each * count * k, count) }));
          // Each letter's paper as its key goes down.
          for (const { index, box } of letters) lay(unit.leaf.world, box, at + each * index);
          t += each * count + 0.07;
        }
      }
      t += 0.12;
    });
    // Droplets, if any, last.
    if (paste) {
      const drops = paste.chains.map((_, i) => i).filter((i) => i >= paste.letters);
      const at = t;
      plan.push({ run: (k) => drops.forEach((i, n) => (chainTimes[i] = { start: (at + n * 0.03) * k, length: 0.2 * k })) });
      if (drops.length) t += 0.3;
    }
    natural = t;
    k = fitted(natural);
    for (const p of plan) p.run(k);
    // The paper grown under its words, a step at a time; laid whole with its first word where its grid is not known.
    stickers.forEach((s, si) => {
      const grid = s.leaf.op.grid;
      const paper = grid ? paperCells(s.leaf.op.polygons, grid.cell, grid.cellY) : null;
      if (!paper || !seeds[si].length) {
        const from = (begins[si] ?? 0) * k;
        sheet.set(s.leaf.op, (now) => (now >= from ? null : { alpha: 0 }));
        return;
      }
      const grown = paperGrowing(paper, paperTimes(paper, seeds[si].map((seed) => ({ ...seed, at: seed.at * k }))));
      sheet.set(s.leaf.op, (now) => {
        const polygons = grown(now);
        return polygons ? { polygons } : null;
      });
    });
    return {
      duration: natural * k,
      look: (leaf, now) => sheet.get(leaf.op)?.(now) ?? null,
      paste: (op, now) =>
        pasteAt(op, radius, (i) => {
          const c = chainTimes[i];
          return c ? { part: span(now, c.start, c.length) } : { part: 1 };
        }),
    };
  }

  // Each sticker whole, in turn: worked out as where it is seen at each moment.
  const W = scene.width;
  const H = scene.height;
  const n = stickers.length;
  let at: (si: number, t: number) => StickerAt;
  /** When each sticker starts coming on. */
  let starts: number[];

  if (id === "slap") {
    // Brought down from in front of the screen (the owner, 8 Oct: "coming
    // from ahead of the screen", not from below it): first seen big and
    // soft as a thing near the eye, bigger than the cover, as a hand holds
    // it up to the lens; then down onto the page faster and faster, its
    // shadow closing in under it and darkening, turning flat as it comes;
    // slapped flat where it lands, and everything already down knocked
    // back into the page a moment.
    const fly = 0.4;
    const press = 0.3;
    const gap = 0.4;
    natural = n ? (n - 1) * gap + fly + press : 0;
    k = fitted(natural);
    starts = stickers.map((_, si) => si * gap * k);
    const landings = starts.map((s) => s + fly * k);
    const eye = { x: W / 2, y: H / 2 };
    const flights = stickers.map((s, si) => {
      const side = si % 2 ? 1 : -1;
      // As big as it must be to pass the cover's sides, as near the eye as that, and no nearer than seven times.
      const near = Math.min(7, Math.max(3, (W * 1.1) / Math.max(1, s.box.w), (H * 0.85) / Math.max(1, s.box.h)));
      // First seen a little to the side its hand comes from, below the middle; its offset from the eye's line shrinks as it nears.
      const first = { x: eye.x + side * W * 0.1, y: eye.y + H * 0.06 };
      return { near, from: { x: (first.x - eye.x) / near, y: (first.y - eye.y) / near }, to: { x: s.centre.x - eye.x, y: s.centre.y - eye.y }, angle: side * 0.42 };
    });
    at = (si, t) => {
      const s = stickers[si];
      const f = flights[si];
      if (t < starts[si]) return { kind: "hidden" };
      const u = span(t, starts[si], fly * k);
      if (u < 1) {
        // How far from the eye to the page it has come, quicker and quicker; how big that makes it, as perspective has it.
        const z = u ** 1.3;
        const scale = 1 / (1 / f.near + (1 - 1 / f.near) * z);
        const seen = { x: eye.x + (f.from.x + (f.to.x - f.from.x) * z) * scale, y: eye.y + (f.from.y + (f.to.y - f.from.y) * z) * scale };
        const angle = f.angle * (1 - z);
        const alpha = clamp01(u / 0.12);
        const dx = seen.x - s.centre.x;
        const dy = seen.y - s.centre.y;
        return {
          kind: "coming",
          pose: {
            move: thrown(s.centre, scale, angle, dx, dy),
            alpha,
            // Out of focus as near the eye, sharp on the page.
            blur: Math.min(36, W * 0.012 * (scale - 1)),
            // On the page where it will land, cast away from a light above left: the further off the sticker, the further out, larger, softer and fainter.
            shadow: {
              move: thrown(s.centre, 1 + 0.3 * (1 - z), angle, W * 0.045 * (1 - z), H * 0.06 * (1 - z)),
              alpha: 0.42 * z * alpha,
              blur: 4 + 28 * (1 - z),
            },
          },
        };
      }
      const v = span(t, landings[si], press * k);
      if (v < 1) {
        // Slapped flat, then a little proud of the page, then still; its shadow gone under it.
        const squash = 1 - 0.07 * (1 - v) ** 2 * Math.cos(3 * Math.PI * v);
        const move = about(s.centre.x, s.centre.y, squash);
        return { kind: "coming", pose: { move, shadow: v < 0.35 ? { move, alpha: 0.42 * (1 - v / 0.35), blur: 4 } : undefined } };
      }
      // Laid: knocked back into the page by each landing after it, toward where that one lands.
      let move: Matrix | undefined;
      for (let j = si + 1; j < n; j += 1) {
        const w = span(t, landings[j], 0.24 * k);
        if (w <= 0 || w >= 1) continue;
        const give = 1 - 0.022 * (1 - w) ** 2 * Math.sin(3 * Math.PI * w);
        const knock = about(stickers[j].centre.x, stickers[j].centre.y, give);
        move = move ? multiply(knock, move) : knock;
      }
      return { kind: "laid", move };
    };
  } else if (id === "pop") {
    // Each sprung on, one after another.
    const each = 0.5;
    const gap = 0.17;
    natural = n ? (n - 1) * gap + each : 0;
    k = fitted(natural);
    starts = stickers.map((_, si) => si * gap * k);
    at = (si, t) => {
      if (t < starts[si]) return { kind: "hidden" };
      const u = span(t, starts[si], each * k);
      if (u >= 1) return { kind: "laid" };
      const c = stickers[si].centre;
      return { kind: "coming", pose: { alpha: clamp01(u / 0.45), move: about(c.x, c.y, 0.35 + 0.65 * springy(u)) } };
    };
  } else {
    // Reveal: each comes into being out of nothing (the owner's ask, 8
    // Oct), slowly: out of focus and see-through, a little larger, then
    // drawn together, solid and sharp, where it is.
    const each = 1.1;
    const gap = 0.5;
    natural = n ? (n - 1) * gap + each : 0;
    k = fitted(natural);
    starts = stickers.map((_, si) => si * gap * k);
    at = (si, t) => {
      if (t < starts[si]) return { kind: "hidden" };
      const u = span(t, starts[si], each * k);
      if (u >= 1) return { kind: "laid" };
      const s = stickers[si];
      const haze = (1 - u) ** 2;
      return { kind: "coming", pose: { alpha: easeInOut(clamp01(u / 0.75)), blur: Math.min(40, s.height * 0.16) * haze, move: about(s.centre.x, s.centre.y, 1 + 0.06 * haze) } };
    };
  }

  /** Which sticker each leaf is on, and the map from its frame to the cover's. */
  const worldOf = new Map<Op, Matrix>(leaves.map((l) => [l.op, l.world]));
  const onSticker = new Map<Op, number>();
  stickers.forEach((s, si) => onSticker.set(s.leaf.op, si));
  for (const w of words) onSticker.set(w.leaf.op, w.on);

  return {
    duration: natural * k,
    look: () => null,
    ops: (t) => {
      const states = stickers.map((_, si) => at(si, t));
      // What is laid, in the cover's own order, each knocked as it is.
      const laid = mapLeaves(scene.ops, (op) => {
        if (op.kind === "liquid") {
          return pasteAt(op, radius, (i) => {
            const state = states[chainOwner[i]];
            if (!state || state.kind !== "laid") return null;
            return state.move ? { part: 1, move: state.move } : { part: 1 };
          });
        }
        const si = onSticker.get(op);
        if (si === undefined) return op;
        const state = states[si];
        if (state.kind !== "laid") return null;
        return looked({ op, world: worldOf.get(op) ?? IDENTITY }, state.move ? { move: state.move } : null, measurer);
      });
      // Then each sticker on its way, the last to start nearest: its shadow on the page, then the sticker, its words and its paste, out of focus and faded as one.
      const coming = states
        .map((state, si) => ({ state, si }))
        .filter((c): c is { state: Extract<StickerAt, { kind: "coming" }>; si: number } => c.state.kind === "coming")
        .sort((a, b) => starts[a.si] - starts[b.si]);
      const over: Op[] = [];
      for (const { state, si } of coming) {
        const { pose } = state;
        const s = stickers[si];
        const through = (leaf: Leaf): Op => ({ kind: "matrix", m: pose.move ? multiply(pose.move, leaf.world) : leaf.world, ops: [leaf.op] });
        if (pose.shadow && pose.shadow.alpha > 0.004) {
          over.push({ kind: "fade", alpha: pose.shadow.alpha, ops: [{ kind: "blur", radius: pose.shadow.blur, tint: "#000000", ops: [{ kind: "matrix", m: multiply(pose.shadow.move, s.leaf.world), ops: [s.leaf.op] }] }] });
        }
        const group: Op[] = [through(s.leaf), ...words.filter((w) => w.on === si).map((w) => through(w.leaf))];
        if (paste) {
          const own = pasteAt(paste, radius, (i) => (chainOwner[i] === si ? (pose.move ? { part: 1, move: pose.move } : { part: 1 }) : null));
          if (own) group.push(own);
        }
        let made: Op[] = group;
        if (pose.blur !== undefined && pose.blur > 0.25) made = [{ kind: "blur", radius: pose.blur, ops: made }];
        if (pose.alpha !== undefined && pose.alpha < 1) {
          if (pose.alpha <= 0) continue;
          made = [{ kind: "fade", alpha: pose.alpha, ops: made }];
        }
        over.push(...made);
      }
      return [...laid, ...over];
    },
  };
}

/** Pasty and Pasty Flat: the paste piped letter by letter, as written; its droplets fall in after, and any letter without strokes fades in at the end. */
function pasty(scene: Scene): Built {
  const paste = scene.ops.find((op): op is LiquidOp => op.kind === "liquid") ?? null;
  if (!paste) return { duration: 0, look: () => null };
  const radius = typicalRadius(paste);
  const letters = paste.chains.slice(0, paste.letters).map((_, i) => i);
  const glyphs = new Set(letters.map((i) => paste.glyphOf[i] ?? i)).size;
  const drops = paste.chains.map((_, i) => i).filter((i) => i >= paste.letters);
  const times: { start: number; length: number; move?: (t: number) => Matrix | undefined }[] = [];
  const writing = Math.min(4.2, Math.max(1.4, 0.7 + 0.16 * glyphs));
  const natural = writing + (drops.length ? 0.35 : 0);
  const k = fitted(natural);
  const { piping, end: writtenEnd } = pipeInTurn(paste.chains, letters, 0, writing * k, paste.glyphOf);
  for (const i of letters) times[i] = { start: piping.start[i], length: piping.length[i] };
  drops.forEach((i, n) => {
    const at = writtenEnd + n * 0.025 * k;
    const bead = paste.chains[i][0];
    times[i] = { start: at, length: 0, move: (t) => (t >= at + 0.25 * k || !bead ? undefined : about(bead.x, bead.y, Math.max(0.05, easeOut(span(t, at, 0.25 * k))))) };
  });
  return {
    duration: natural * k,
    look: (leaf, t) => (leaf.op.kind === "text" ? (t >= writtenEnd + 0.3 ? null : { alpha: easeOut(span(t, writtenEnd, 0.3)) }) : null),
    paste: (op, t) =>
      pasteAt(op, radius, (i) => {
        const c = times[i];
        if (!c) return { part: 1 };
        if (c.move) {
          if (t < c.start) return null;
          const move = c.move(t);
          return move ? { part: 1, move } : { part: 1 };
        }
        return { part: span(t, c.start, c.length) };
      }),
  };
}

/** A line of text as its words, each where it falls in the line. */
function wordsOf(op: Extract<Op, { kind: "text" }>, measurer: Measurer): Extract<Op, { kind: "text" }>[] {
  const out: Extract<Op, { kind: "text" }>[] = [];
  const parts = op.text.split(/( +)/u);
  let before = "";
  for (const part of parts) {
    if (part.trim()) out.push({ ...op, text: part, x: op.x + measurer.width(op.face as FaceId, before) * op.size });
    before += part;
  }
  return out.length ? out : [op];
}

/** Editorial and Mono: the lines' words, characters or lines, in reading order; Mono's cursor following its typing. */
function typeset(scene: Scene, id: AnimationId, measurer: Measurer): Built {
  const leaves = leavesOf(scene.ops);
  const lines = leaves.filter((l): l is Leaf & { op: Extract<Op, { kind: "text" }> } => l.op.kind === "text");
  const cursor = leaves.find((l) => l.op.kind === "box") ?? null;
  const sheet = new Map<Op, (t: number) => Look | null>();
  const replaced = new Map<Op, (t: number) => Op[] | null>();
  let natural = 0;

  if (id === "typewriter") {
    const counts = lines.map((l) => graphemes(l.op.text).length);
    const all = counts.reduce((a, b) => a + b, 0) || 1;
    const lead = cursor ? 0.45 : 0;
    const each = Math.min(0.065, 3.2 / all);
    natural = lead + each * all + (lines.length - 1) * 0.12;
    const k = fitted(natural);
    let t = lead;
    const starts: number[] = [];
    lines.forEach((l, i) => {
      const at = t;
      starts.push(at);
      const count = counts[i];
      sheet.set(l.op, (now) => (now >= (at + each * count) * k ? null : { typed: typedAt(now, at * k, each * count * k, count) }));
      t += each * count + 0.12;
    });
    if (cursor && cursor.op.kind === "box") {
      const box = cursor.op;
      const cap = measurer.metrics("mono").cap;
      const end = natural * k;
      replaced.set(box, (now) => {
        if (now >= end) return null;
        // Before typing, it blinks where the first line begins; then it follows the letters.
        let line = lines.length - 1;
        for (let i = 0; i < lines.length; i += 1) if (now < (starts[i] + each * counts[i]) * k) {
          line = i;
          break;
        }
        const l = lines[Math.max(0, line)];
        if (!l) return [box];
        const text = graphemes(l.op.text).slice(0, typedAt(now, starts[line] * k, each * counts[line] * k, counts[line])).join("");
        const x = l.op.x + measurer.width(l.op.face, text) * l.op.size + (text ? 0.12 * l.op.size : 0);
        const y = l.op.y - (cap + 0.06) * l.op.size;
        const blinkOff = now < lead * k && Math.floor(now / 0.25) % 2 === 1;
        return blinkOff ? [] : [{ ...box, x, y, w: 0.58 * l.op.size, h: (cap + 0.12) * l.op.size }];
      });
    }
    return { duration: natural * k, look: (leaf, t) => sheet.get(leaf.op)?.(t) ?? null, replace: (leaf, t) => replaced.get(leaf.op)?.(t) ?? null };
  }

  if (id === "lines") {
    natural = (lines.length - 1) * 0.22 + 0.7;
    const k = fitted(natural);
    lines.forEach((l, i) => {
      const centre = leafCentre(l, measurer);
      sheet.set(l.op, (now) => arrive("rise", centre, i * 0.22 * k, 0.7 * k, now, l.op.size * 0.22));
    });
    if (cursor) sheet.set(cursor.op, (now) => arrive("fade", leafCentre(cursor, measurer), natural * k * 0.7, natural * k * 0.3, now, 0));
    return { duration: natural * k, look: (leaf, t) => sheet.get(leaf.op)?.(t) ?? null };
  }

  // Word by word: each line set as its words while any of them is still arriving, then as the line it is.
  const split = lines.map((l) => ({ leaf: l, words: wordsOf(l.op, measurer) }));
  const total = split.reduce((n, s) => n + s.words.length, 0);
  const gap = Math.min(0.12, 2.6 / Math.max(1, total));
  natural = (total - 1) * gap + 0.6 + (cursor ? 0.25 : 0);
  const k = fitted(natural);
  let n = 0;
  for (const s of split) {
    const first = n;
    n += s.words.length;
    const end = ((n - 1) * gap + 0.6) * k;
    replaced.set(s.leaf.op, (now) => {
      if (now >= end) return null;
      return s.words.flatMap((w, i) => {
        const wordLeaf: Leaf = { op: w, world: s.leaf.world };
        const made = looked(wordLeaf, arrive("rise", leafCentre(wordLeaf, measurer), (first + i) * gap * k, 0.6 * k, now, w.size * 0.25), measurer);
        return made ? [made] : [];
      });
    });
  }
  if (cursor) sheet.set(cursor.op, (now) => arrive("fade", leafCentre(cursor, measurer), (natural - 0.3) * k, 0.3 * k, now, 0));
  return {
    duration: natural * k,
    look: (leaf, t) => sheet.get(leaf.op)?.(t) ?? null,
    replace: (leaf, t) => {
      const made = replaced.get(leaf.op)?.(t);
      if (made === undefined || made === null) return null;
      // Ops already in the line's own frame: only the turns and placement round the line are wanted, and mapLeaves keeps those.
      return made;
    },
  };
}

/** Echo: the words and their echoes, rings out from the middle. */
function echo(scene: Scene, id: AnimationId, measurer: Measurer): Built {
  const leaves = leavesOf(scene.ops).filter((l): l is Leaf & { op: Extract<Op, { kind: "text" }> } => l.op.kind === "text");
  const main = leaves.filter((l) => !l.op.outline);
  const echoes = leaves.filter((l) => !!l.op.outline);
  const mid = main.length ? main.reduce((sum, l) => sum + l.op.y, 0) / main.length : 0;
  const distances = [...new Set(echoes.map((l) => Math.round(Math.abs(l.op.y - mid))))].sort((a, b) => a - b);
  const ring = (l: Leaf & { op: Extract<Op, { kind: "text" }> }) => distances.indexOf(Math.round(Math.abs(l.op.y - mid))) + 1;
  const sheet = new Map<Op, (t: number) => Look | null>();
  let natural: number;
  if (id === "cascade") {
    const order = [...leaves].sort((a, b) => a.op.y - b.op.y);
    const gap = Math.min(0.06, 2.4 / Math.max(1, order.length));
    natural = (order.length - 1) * gap + 0.55;
    const k = fitted(natural);
    order.forEach((l, i) => {
      const centre = leafCentre(l, measurer);
      sheet.set(l.op, (now) => arrive("drop", centre, i * gap * k, 0.55 * k, now, l.op.size * 0.4));
    });
    return { duration: natural * k, look: (leaf, t) => sheet.get(leaf.op)?.(t) ?? null };
  }
  const rings = distances.length;
  const gap = Math.min(0.13, 2.2 / Math.max(1, rings));
  natural = 0.35 + rings * gap + (id === "spread" ? 0.75 : 0.4);
  const k = fitted(natural);
  for (const l of main) {
    const centre = leafCentre(l, measurer);
    sheet.set(l.op, (now) => arrive(id === "ripple" ? "settle" : "fade", centre, 0, 0.5 * k, now, 0));
  }
  for (const l of echoes) {
    const r = ring(l);
    const at = (0.35 + (r - 1) * gap) * k;
    if (id === "ripple") {
      sheet.set(l.op, (now) => arrive("fade", leafCentre(l, measurer), at, 0.4 * k, now, 0));
    } else {
      // From the words' own place out to its own.
      const dy = mid - l.op.y;
      sheet.set(l.op, (now) => {
        const u = span(now, at, 0.75 * k);
        if (u >= 1) return null;
        return { alpha: clamp01(u / 0.3), move: [1, 0, 0, 1, 0, dy * (1 - easeOut(u))] };
      });
    }
  }
  return { duration: natural * k, look: (leaf, t) => sheet.get(leaf.op)?.(t) ?? null };
}

/**
 * The animation `id` of a cover's scene in `style`, at `speed` (1 its own,
 * 2 twice as fast, 0.5 half): every time in it divided by the speed.
 */
export function plan(scene: Scene, style: StyleId, id: AnimationId, measurer: Measurer, speed = 1): Plan {
  const pace = speedOf(speed);
  const built: Built =
    style === "stickery"
      ? stickery(scene, id, measurer)
      : style === "pasty" || style === "pasty-flat"
        ? pasty(scene)
        : style === "echo"
          ? echo(scene, id, measurer)
          : typeset(scene, id, measurer);
  const leafWorld = new Map<Op, Matrix>();
  for (const leaf of leavesOf(scene.ops)) leafWorld.set(leaf.op, leaf.world);
  return {
    duration: built.duration / pace,
    frame(at: number): Scene {
      const t = at * pace;
      if (t >= built.duration) return scene;
      if (built.ops) return { ...scene, ops: built.ops(t) };
      const ops = mapLeaves(scene.ops, (op) => {
        const leaf: Leaf = { op, world: leafWorld.get(op) ?? IDENTITY };
        if (op.kind === "liquid") return built.paste ? built.paste(op, t) : op;
        const instead = built.replace?.(leaf, t);
        if (instead) return instead.length === 1 ? instead[0] : instead.length ? { kind: "fade", alpha: 1, ops: instead } : null;
        return looked(leaf, built.look(leaf, t), measurer);
      });
      return { ...scene, ops };
    },
  };
}

/** How long a video of a plan runs: the motion, then the cover held. */
export function videoLength(p: Plan): number {
  return p.duration + HOLD;
}

/** The moments a motion of `duration` is drawn at, `fps` a second: from nothing at 0 to the cover itself, last. */
export function frameTimes(duration: number, fps: number): number[] {
  const count = Math.max(1, Math.ceil(duration * fps - 1e-9));
  return Array.from({ length: count + 1 }, (_, i) => Math.min(duration, i / fps));
}

/** How many frames a video holds the finished cover for, after the motion's last. */
export function holdFrames(fps: number): number {
  return Math.round(HOLD * fps);
}
