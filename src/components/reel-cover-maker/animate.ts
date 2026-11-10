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
 *   piped as if by hand), and Jelly (a loop: a tap runs across the title
 *   and each letter squashes onto its line and wobbles to rest, lit again
 *   as it moves). All at once and Pop were cut (the owner, 7 Oct: "so bad").
 * - Renaissance: Written (the capitals rise in line by line, then the
 *   script is written across them as a pen writes it, its gap in them
 *   following the pen), Word by word and Line by line (each rises in, in
 *   the order the lockup is read, the script where it falls), Engraved
 *   (each letter's contour cut, then two passes of fine lines across the
 *   lockup that deepen until the letters are solid), Ribbon (a loop: a
 *   wave runs along the script as along a ribbon flicked at one end, its
 *   gap in the capitals moving with it, the capitals still) and Drop (a
 *   drop falls on the script and the lockup comes up as its rings run
 *   out, each capital rising whole through the water as the ring reaches
 *   it). Ribbon and Drop are the owner's picks of 3 Nov from a lab of
 *   ripples (ripple.ts).
 * - Inkblot: Written (each printed word traced as a pen writes it, word
 *   after word in reading order), Word by word and Line by line (each comes
 *   into focus out of nothing, as ink soaks into the cloth), and Wick (a
 *   drop of ink on each word that runs along its letters, its wet edge
 *   darker, drying behind it).
 * - Engraved, Wick and Jelly are the owner's picks of twenty tried (31
 *   Oct); the other seventeen, and all five for Stickery, were turned down
 *   ("too weird").
 * - Ripple: Pulse (the owner's ask, 10 Nov: the whole ripple pulse), a
 *   loop of the reference video's motion measured frame by frame (glass.ts):
 *   from the cover, the glass held open, it lets go, the word goes clean
 *   for a moment, swells a second time and is drawn in, rests, and swells
 *   out to open again.
 * - Mono: Typewriter (its cursor typing), Word by word.
 * - Wave: Crossing, Cascade, Loose, Ripple and One wave (the owner's five
 *   of 9 Nov), each a loop of the block waving inside its own rectangle
 *   (wave.ts): from the still cover, stopped mid-wave, on through its pass,
 *   a rest on the plain lockup, and round to the still again.
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
import { loopArea, loopBounds } from "@/components/reel-cover-maker/ink";
import { inkRun, runStep, runTo, type InkRun } from "@/components/reel-cover-maker/ink-run";
import type { Bead, Chain } from "@/components/reel-cover-maker/liquid";
import { mixSeed, noise1, noise2, random } from "@/components/reel-cover-maker/noise";
import { luminance, rgb } from "@/components/reel-cover-maker/palettes";
import { apply, invert, multiply, type Matrix, type Point } from "@/components/reel-cover-maker/place";
import { isBackdrop, pasteKey, type LiquidOp, type Op, type Scene, type StyleId } from "@/components/reel-cover-maker/scene";
import { fillHoles, insidePolygon, polygonBounds, traceCells, type Polygon } from "@/components/reel-cover-maker/stepped";
import { isStill, STILL_BELOW, type Drop as WaterDrop, type Surface } from "@/components/reel-cover-maker/ripple";
import { pulsePlay } from "@/components/reel-cover-maker/glass";
import { graphemes } from "@/components/reel-cover-maker/title";
import { WAVE_VARIANTS, wavePlay, type WaveVariantId } from "@/components/reel-cover-maker/wave";

export type AnimationId = "type-draw" | "slap" | "pop" | "reveal" | "jitter" | "written" | "words" | "typewriter" | "lines" | "pulse" | "engraved" | "wick" | "jelly" | "ribbon" | "drop" | WaveVariantId;

export interface Animation {
  id: AnimationId;
  name: string;
}

/** Each style's animations, the one it starts on first. */
export const ANIMATIONS: Record<StyleId, readonly Animation[]> = {
  // Type and draw is Spell (the owner, 24 Oct); its id is kept, so a cover saved on it opens on it.
  stickery: [
    { id: "type-draw", name: "Spell" },
    { id: "slap", name: "Slap" },
    { id: "pop", name: "Pop" },
    { id: "reveal", name: "Reveal" },
    { id: "jitter", name: "Jitter" },
  ],
  // Engraved, Wick and Jelly: the owner's picks of twenty tried, 31 Oct.
  pasty: [
    { id: "written", name: "Written live" },
    { id: "jelly", name: "Jelly" },
    { id: "jitter", name: "Jitter" },
  ],
  "pasty-flat": [
    { id: "written", name: "Written live" },
    { id: "jelly", name: "Jelly" },
    { id: "jitter", name: "Jitter" },
  ],
  renaissance: [
    { id: "written", name: "Written" },
    { id: "words", name: "Word by word" },
    { id: "lines", name: "Line by line" },
    { id: "engraved", name: "Engraved" },
    // Ribbon and Drop: the owner's picks of 3 Nov.
    { id: "ribbon", name: "Ribbon" },
    { id: "drop", name: "Drop" },
  ],
  inkblot: [
    { id: "written", name: "Written" },
    { id: "words", name: "Word by word" },
    { id: "lines", name: "Line by line" },
    { id: "wick", name: "Wick" },
    { id: "jitter", name: "Jitter" },
  ],
  // The owner's ask of 10 Nov: the whole pulse, from the cover held open.
  ripple: [{ id: "pulse", name: "Pulse" }],
  mono: [
    { id: "typewriter", name: "Typewriter" },
    { id: "words", name: "Word by word" },
  ],
  // The owner's five of 9 Nov, Crossing first (the preview opened on it).
  wave: WAVE_VARIANTS.map((v) => ({ id: v.id, name: v.name })),
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
  /**
   * Its frames run round with no end (Jitter): played, it starts again at
   * once, with no finished cover stood after it; made a video, it has no
   * held end, and its last frame leads back into its first.
   */
  loops?: boolean;
}

/**
 * Jitter (the owner's ask, 24 Oct): the cover as Shuffle makes it, again
 * and again, a new one each beat, round a loop of this many. Its own pace
 * is four a second: the speed slider takes it from two to eight.
 */
export const JITTER_COUNT = 12;
export const JITTER_RATE = 4;

/**
 * The shuffles a Jitter goes round: the cover's own first, so it starts as
 * the cover is, then the rest worked out from it, the same every time it is
 * played or saved, none of them twice.
 */
export function jitterSeeds(seed: number): number[] {
  const out = [seed];
  let h = (Math.floor(Math.abs(seed)) ^ 0x9e3779b9) >>> 0;
  for (let k = 1; out.length < JITTER_COUNT; k += 1) {
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
    h = Math.imul(h ^ (h >>> 13) ^ k, 0xc2b2ae35) >>> 0;
    const next = (h % 2 ** 30) + 1;
    if (!out.includes(next)) out.push(next);
  }
  return out;
}

/**
 * A Jitter: the scenes of `seeds`, a beat each, made only as each first
 * comes round (a cover set again costs Inkblot about a twenty-fifth of a
 * second), the cover itself once the loop is round.
 */
function jitter(scene: Scene, seeds: readonly number[], shuffled: (seed: number) => Scene, pace: number): Plan {
  const made = new Map<number, Scene>([[0, scene]]);
  const at = (step: number) => {
    let hit = made.get(step);
    if (!hit) {
      hit = shuffled(seeds[step]);
      made.set(step, hit);
    }
    return hit;
  };
  return {
    duration: seeds.length / JITTER_RATE / pace,
    loops: true,
    frame(t: number): Scene {
      const step = Math.floor(Math.max(0, t) * pace * JITTER_RATE + 1e-9) % seeds.length;
      return at(step);
    },
  };
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
    else if (op.kind === "fade" || op.kind === "write" || op.kind === "blur" || op.kind === "knockout") leavesOf(op.ops, world, out);
    else if (!isBackdrop(op)) out.push({ op, world });
  }
  return out;
}

/** The ops again, each leaf as `at` has it (null to leave it out), every turn and placement kept round them. */
function mapLeaves(ops: Op[], at: (op: Op) => Op | null): Op[] {
  const out: Op[] = [];
  for (const op of ops) {
    if (op.kind === "turn" || op.kind === "matrix" || op.kind === "knockout") {
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
  const sx = op.sx ?? 1;
  const pad = (op.bold ?? 0) / 2;
  return { x: op.x - b.left * op.size * sx - pad, y: op.y - b.ascent * op.size - pad, w: (b.left + b.right) * op.size * sx + 2 * pad + (op.nib ?? 0), h: (b.ascent + b.descent) * op.size + 2 * pad };
}

/** Printed ink's box, in its own frame. */
function inkRect(op: Extract<Op, { kind: "ink" }>) {
  const b = loopBounds(op.polygons);
  return b ? { x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 } : { x: 0, y: 0, w: 0, h: 0 };
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
  if (op.kind === "ink") return apply(leaf.world, centreOf(inkRect(op)));
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
  if (look.drawn !== undefined && (leaf.op.kind === "text" || leaf.op.kind === "ink")) {
    if (look.drawn <= 0) return null;
    if (look.drawn < 1) {
      const box = leaf.op.kind === "text" ? textBox(leaf.op, measurer) : inkRect(leaf.op);
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
  const radii = op.chains.flatMap((c) => c.map((b) => b.r));
  return radii.length ? median(radii) : 1;
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

// Jelly.

/**
 * Jelly (the owner's pick, 31 Oct): the finished letters set like jelly,
 * round a loop that starts and ends on the cover standing still. A tap
 * runs across the title, a letter every twentieth of a second, and each
 * is squashed down onto its line, springs up and wobbles three times to
 * rest, a tall letter a little slower than a short one, its top swaying.
 * Its own pace is the loop's length; the speed slider quickens it.
 */
export const JELLY_LOOP = 2.3;

/** How long a letter shakes from the moment it is tapped: at rest, exactly, well before the loop comes round. */
const JELLY_SHAKE = 0.95;

/** How hard a letter is squashed at first, as a share of its height, and how far its top sways across. */
const JELLY_SQUASH = 0.205;
const JELLY_SWAY = 0.05;

/** The middle value of some numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/**
 * How the paste's letters wobble, worked out in the letters' own frame
 * (as the style set them, before the owner's placement moved, turned or
 * flipped them), where the lines run across and up is up: each letter's
 * chains (a droplet goes with the letter nearest it), its middle across,
 * the foot of its line under it and the line's height, how slowly it
 * rings, and its place in the tap's run across the title.
 */
interface Jellied {
  letters: { chains: number[]; across: number; base: number; height: number; tall: number; rank: number }[];
  /** From the cover to the letters' own frame, and back. */
  toLetters: Matrix;
  toCover: Matrix;
}

function jellied(op: LiquidOp, placed: Matrix): Jellied {
  const toLetters = invert(placed);
  const own = op.chains.map((c) => c.map((b) => apply(toLetters, b)));
  const byGlyph = new Map<number, number[]>();
  for (let i = 0; i < op.letters; i += 1) {
    const g = op.glyphOf[i] ?? i;
    byGlyph.set(g, [...(byGlyph.get(g) ?? []), i]);
  }
  const letters = [...byGlyph.values()];
  const lineOf = (g: number[]) => op.lineOf[g[0]] ?? 0;
  // How much the placement scales a bead's reach, so a box round the beads is round their ink.
  const reach = Math.sqrt(Math.abs(toLetters[0] * toLetters[3] - toLetters[1] * toLetters[2]));
  const boxes = letters.map((chains) => {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const c of chains) {
      own[c].forEach((p, j) => {
        const r = op.chains[c][j].r * reach;
        x0 = Math.min(x0, p.x - r);
        x1 = Math.max(x1, p.x + r);
        y0 = Math.min(y0, p.y - r);
        y1 = Math.max(y1, p.y + r);
      });
    }
    return { x0, x1, y0, y1 };
  });
  const across = boxes.map((b) => (b.x0 + b.x1) / 2);
  const R = typicalRadius(op) * reach;
  // Each line's foot under each letter: a line through its letters' feet, a descender's foot never pulling it (the middle of the slopes between every two, and of where they put it), and its height the middle of its letters'.
  const feet = new Map<number, { at: (x: number) => number; height: number }>();
  for (const line of new Set(letters.map(lineOf))) {
    const on = letters.map((_, g) => g).filter((g) => lineOf(letters[g]) === line);
    const slopes: number[] = [];
    if (on.length >= 3) {
      for (let i = 0; i < on.length; i += 1) {
        for (let j = i + 1; j < on.length; j += 1) {
          const dx = across[on[j]] - across[on[i]];
          if (Math.abs(dx) > 1e-6) slopes.push((boxes[on[j]].y1 - boxes[on[i]].y1) / dx);
        }
      }
    }
    const slope = slopes.length ? median(slopes) : 0;
    const level = median(on.map((g) => boxes[g].y1 - slope * across[g]));
    const at = (x: number) => level + slope * x;
    feet.set(line, { at, height: Math.max(R * 4, median(on.map((g) => at(across[g]) - boxes[g].y0))) });
  }
  // Each droplet goes with the letter nearest it, and wobbles with it.
  const groups = letters.map((g) => [...g]);
  if (groups.length) {
    const centres = boxes.map((b) => ({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }));
    for (let i = op.letters; i < op.chains.length; i += 1) {
      const bead = own[i]?.[0];
      if (!bead) continue;
      let best = 0;
      centres.forEach((c, g) => {
        if (Math.hypot(c.x - bead.x, c.y - bead.y) < Math.hypot(centres[best].x - bead.x, centres[best].y - bead.y)) best = g;
      });
      groups[best].push(i);
    }
  }
  const order = across.map((_, g) => g).sort((a, b) => across[a] - across[b] || a - b);
  const rank = new Array<number>(letters.length);
  order.forEach((g, n) => (rank[g] = n));
  return {
    toLetters,
    toCover: placed,
    letters: groups.map((chains, g) => {
      const foot = feet.get(lineOf(letters[g])) ?? { at: () => boxes[g].y1, height: boxes[g].y1 - boxes[g].y0 };
      // A taller letter rings slower, as a taller jelly does.
      const tall = Math.min(1.15, Math.max(0.85, Math.sqrt(foot.height / Math.max(R, boxes[g].y1 - boxes[g].y0))));
      return { chains, across: across[g], base: foot.at(across[g]), height: foot.height, tall, rank: rank[g] };
    }),
  };
}

/** The paste with its letters as they are `at` seconds into Jelly's loop; the paste itself where none is moving. */
function jellyAt(op: LiquidOp, made: Jellied, at: number): LiquidOp {
  const stagger = Math.min(0.05, 0.6 / Math.max(1, made.letters.length));
  const { toLetters, toCover } = made;
  const chains: Chain[] = [...op.chains];
  let moved = false;
  for (const letter of made.letters) {
    const s = at - (0.03 + stagger * letter.rank);
    if (s <= 0 || s >= JELLY_SHAKE) continue;
    moved = true;
    const ring = 4 * letter.tall;
    // Brought to rest exactly before the loop's stillness.
    const rest = 1 - easeInOut((s - JELLY_SHAKE * 0.7) / (JELLY_SHAKE * 0.3));
    const fade = Math.exp(-4 * s) * rest;
    const squash = -JELLY_SQUASH * fade * Math.sin(2 * Math.PI * ring * s);
    const sway = JELLY_SWAY * fade * Math.sin(2 * Math.PI * ring * 0.9 * s);
    const { base, height, across } = letter;
    for (const c of letter.chains) {
      chains[c] = op.chains[c].map((b) => {
        // In the letters' own frame: squashed onto its foot and swayed, its top lagging most; then back onto the cover.
        const p = apply(toLetters, b);
        const h = (base - p.y) / height;
        const lean = -sway * height * h * (1 + 0.5 * Math.abs(h));
        const q = apply(toCover, { x: across + (p.x - across) * (1 - 0.55 * squash) + lean, y: base - (base - p.y) * (1 + squash) });
        return { x: q.x, y: q.y, r: b.r * (1 - 0.3 * squash) };
      });
    }
  }
  if (!moved) return op;
  // Lit as the finished paste is, its gloss kept, so its shine squashes and slides with it.
  const radius = typicalRadius(op);
  return { ...op, chains, key: `${pasteKey(chains, op.colourOf, op.tone, op.finish, op.pool)}|r${radius.toFixed(2)}`, radius };
}

/** Jelly, at `pace`: a loop, the cover itself whenever no letter is moving. */
function jelly(scene: Scene, pace: number): Plan {
  const pastes = new Map<LiquidOp, Jellied>();
  for (const leaf of leavesOf(scene.ops)) if (leaf.op.kind === "liquid") pastes.set(leaf.op, jellied(leaf.op, scene.placed ?? IDENTITY));
  return {
    duration: JELLY_LOOP / pace,
    loops: true,
    frame(t: number): Scene {
      const at = (((Math.max(0, t) * pace) % JELLY_LOOP) + JELLY_LOOP) % JELLY_LOOP;
      let moved = false;
      const ops = mapLeaves(scene.ops, (op) => {
        const made = op.kind === "liquid" ? pastes.get(op) : undefined;
        if (!made || op.kind !== "liquid") return op;
        const now = jellyAt(op, made, at);
        if (now !== op) moved = true;
        return now;
      });
      return moved ? { ...scene, ops } : scene;
    },
  };
}

/** A line of text as its words, each where it falls in the line. */
function wordsOf(op: Extract<Op, { kind: "text" }>, measurer: Measurer): Extract<Op, { kind: "text" }>[] {
  const out: Extract<Op, { kind: "text" }>[] = [];
  const parts = op.text.split(/( +)/u);
  let before = "";
  for (const part of parts) {
    if (part.trim()) out.push({ ...op, text: part, x: op.x + measurer.width(op.face as FaceId, before) * op.size * (op.sx ?? 1) });
    before += part;
  }
  return out.length ? out : [op];
}

/** Mono: the lines' words or characters, in reading order, its cursor following its typing. */
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

/** Something coming into focus out of nothing, `start` on, over `length`: how see-through, how soft and how large at `t`. */
function soak(centre: Point, start: number, length: number, t: number, size: number): { alpha: number; blur: number; move: Matrix } | null {
  const u = span(t, start, length);
  if (u >= 1) return null;
  const haze = (1 - u) ** 2;
  return { alpha: easeInOut(clamp01(u / 0.8)), blur: size * 0.09 * haze, move: about(centre.x, centre.y, 1 + 0.035 * haze) };
}

// Wick.

/**
 * Wick's timing, in seconds: a drop a word this far apart, each word wet
 * through in FILL, its wet edge drying LAG behind; and how soon after it
 * lands a drop's run is first shown, so its first frame is not already a
 * stroke long.
 */
const WICK_GAP = 0.18;
const WICK_FILL = 0.74;
const WICK_LAG = 0.12;
const WICK_SOON = 0.015;

/** How long an emoji, which no drop prints, takes to come in at its turn. */
const WICK_EMOJI = 0.35;

/** The blot a drop makes as it lands, then soaks into the word: its radius, in em, `tau` seconds after it lands. */
const blotAt = (tau: number) => (tau < 0.045 ? 0.13 * easeOut(tau / 0.045) : 0.13 * (1 - easeInOut((tau - 0.045) / 0.32)));

/**
 * Ink as it is wet, or pooled where a drop fell (`k` the more), in #rrggbb:
 * deeper, taken `k` of the way to black; ink already nearly black, which
 * can go no deeper, catches the light instead, taken a little toward white.
 * Anything not written as #rrggbb as it is.
 */
function wet(colour: string, k: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(colour)) return colour;
  const dark = luminance(colour) < 0.03;
  const [r, g, b] = rgb(colour).map((v) => Math.round(dark ? v + (255 - v) * k * 0.55 : v * (1 - k)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** A loop run the other way round: a hole in what it is drawn with. */
function backwards(loop: Polygon): Polygon {
  const out: number[] = [];
  for (let i = loop.length - 2; i >= 0; i -= 2) out.push(loop[i], loop[i + 1]);
  return out;
}

/**
 * A loop run the one way round every shape of a clip runs: a clip fills by
 * the nonzero rule, so two shapes that overlap run opposite ways would cut
 * a hole where they cross. Only a hole is run backwards.
 */
function forwards(loop: Polygon): Polygon {
  return loopArea(loop) >= 0 ? loop : backwards(loop);
}

/**
 * Wick (the owner's pick, 31 Oct): a drop of ink on each printed word's
 * heaviest stroke, word after word in reading order, a dark round blot as
 * it lands that soaks away, running out both ways along the letters as
 * ink runs through cotton (as far as the square root of the time, quick
 * at first and slowing), never across a gap (ink-run.ts), its wet edge
 * darker and drying behind it. What shows inside the ink's run is the
 * cover's own print, so it ends on it edge for edge. An emoji, which no
 * drop prints, comes in at its turn.
 */
function wick(scene: Scene): Built {
  const items = leavesOf(scene.ops).filter((l) => l.op.kind === "ink" || l.op.kind === "text");
  const drops = items.map((_, i) => i * WICK_GAP);
  const ends = drops.map((d, i) => d + (items[i].op.kind === "ink" ? WICK_FILL + WICK_LAG : WICK_EMOJI));
  const natural = items.length ? Math.max(...ends) : 0;
  const k = fitted(natural);
  const index = new Map<Op, number>(items.map((l, i) => [l.op, i]));
  // Each word's run, worked out once, when its drop first lands.
  const runs = new Map<Op, { ink: InkRun; speed: number } | null>();
  const runOf = (leaf: Leaf, op: Extract<Op, { kind: "ink" }>, i: number) => {
    if (!runs.has(op)) {
      const em = op.size;
      const m = leaf.world;
      // The cloth's twill, on the cover whatever turns the words: the ink runs a little ahead along its threads.
      const grain = (x: number, y: number) => {
        const cx = m[0] * x + m[2] * y + m[4];
        const cy = m[1] * x + m[3] * y + m[5];
        return 0.007 * em * noise2(0xf1b + i, (cx * 0.447 - cy * 0.894) / (em * 0.08), (cx * 0.894 + cy * 0.447) / (em * 0.012));
      };
      const ink = inkRun(op.polygons, runStep(op.polygons, em), grain);
      // As fast as it must run to wet the whole word, and a little past, in its time.
      runs.set(op, ink ? { ink, speed: (ink.far + 0.05 * em) / (Math.sqrt(WICK_FILL + WICK_SOON) - Math.sqrt(WICK_SOON)) } : null);
    }
    return runs.get(op) ?? null;
  };
  return {
    duration: natural * k,
    look: (leaf, t) => {
      const i = index.get(leaf.op);
      if (i === undefined || leaf.op.kind !== "text" || t / k >= ends[i]) return null;
      return { alpha: easeOut(span(t / k, drops[i], WICK_EMOJI)) };
    },
    replace: (leaf, t) => {
      const i = index.get(leaf.op);
      const op = leaf.op;
      if (i === undefined || op.kind !== "ink") return null;
      const tn = t / k;
      const tau = tn - drops[i];
      if (tau <= 0) return [];
      if (tn >= ends[i]) return null;
      const made = runOf(leaf, op, i);
      if (!made) return null;
      const { ink, speed } = made;
      const reach = speed * (Math.sqrt(tau + WICK_SOON) - Math.sqrt(WICK_SOON));
      const dried = tau > WICK_LAG ? speed * (Math.sqrt(tau - WICK_LAG + WICK_SOON) - Math.sqrt(WICK_SOON)) : -Infinity;
      const out: Op[] = [];
      // The print as far as the ink has run, and over it its wet edge, where it has not yet dried: one print under, so the dry
      // ink meets the wet with no seam, and once it is all dry it is the cover's print exactly.
      const run = runTo(ink, reach);
      if (run.length) {
        out.push({ kind: "clip", polygons: run, ops: [op] });
        const dry = Number.isFinite(dried) ? runTo(ink, dried).map(backwards) : [];
        out.push({ kind: "clip", polygons: [...run, ...dry], ops: [{ ...op, color: wet(op.color, 0.3) }] });
      }
      // The drop itself, pooled dark where it fell, soaking away.
      const r = blotAt(tau) * op.size;
      if (r > 0.5) {
        const blot: number[] = [];
        for (let a = 0; a < 40; a += 1) {
          const angle = (a / 40) * Math.PI * 2;
          const wobble = 1 + 0.08 * noise1(11 + i, Math.cos(angle) * 1.7 + 3) + 0.05 * noise1(13 + i, Math.sin(angle) * 2.3 + 5);
          blot.push(ink.drop.x + Math.cos(angle) * r * wobble, ink.drop.y + Math.sin(angle) * r * wobble);
        }
        out.push({ ...op, polygons: [blot], color: wet(op.color, 0.5), key: `${op.key}|blot` });
      }
      return out;
    },
  };
}

/**
 * Inkblot: its printed words in reading order. Written traces each as a pen
 * writes it, word after word, a pen's lift between them and a longer one
 * between lines (an emoji, which is no pen's, fades in at its turn); Word by
 * word and Line by line bring each word, or each line, into focus out of
 * nothing, as ink soaks into the cloth.
 */
function inkblot(scene: Scene, id: AnimationId, measurer: Measurer): Built {
  if (id === "wick") return wick(scene);
  const words = leavesOf(scene.ops).filter((l): l is Leaf & { op: Extract<Op, { kind: "ink" | "text" }> } => l.op.kind === "ink" || l.op.kind === "text");
  // An emoji, set as text, carries its line as a printed word does.
  const lines = words.map((w) => w.op.line ?? 0);

  if (id === "written") {
    const times = new Map<Op, { at: number; length: number }>();
    let t = 0;
    words.forEach((w, i) => {
      if (i) t += lines[i] !== lines[i - 1] ? 0.16 : 0.07;
      const length = 0.3 + 0.08 * graphemes(w.op.text).length;
      times.set(w.op, { at: t, length });
      t += length;
    });
    const k = fitted(t);
    return {
      duration: t * k,
      look: (leaf, now) => {
        const c = times.get(leaf.op);
        if (!c || now >= (c.at + c.length) * k) return null;
        const u = span(now, c.at * k, c.length * k);
        return leaf.op.kind === "ink" ? { drawn: drawnAt(u) } : { alpha: easeOut(u) };
      },
    };
  }

  // Each word, or each line, its own moment.
  const groups = id === "lines" ? [...new Set(lines)].map((line) => words.filter((_, i) => lines[i] === line)) : words.map((w) => [w]);
  const gap = id === "lines" ? 0.3 : Math.min(0.14, 2.6 / Math.max(1, groups.length));
  const each = id === "lines" ? 0.85 : 0.7;
  const natural = groups.length ? (groups.length - 1) * gap + each : 0;
  const k = fitted(natural);
  const when = new Map<Op, { start: number; centre: Point; size: number }>();
  groups.forEach((group, g) => {
    const centres = group.map((w) => leafCentre(w, measurer));
    const centre = { x: centres.reduce((a, c) => a + c.x, 0) / centres.length, y: centres.reduce((a, c) => a + c.y, 0) / centres.length };
    for (const w of group) when.set(w.op, { start: g * gap * k, centre, size: w.op.size });
  });
  return {
    duration: natural * k,
    look: () => null,
    replace: (leaf, t) => {
      const c = when.get(leaf.op);
      if (!c) return null;
      const s = soak(c.centre, c.start, each * k, t, c.size);
      if (!s) return null;
      const made = looked(leaf, { alpha: s.alpha, move: s.move }, measurer);
      if (!made) return [];
      // An emoji only fades: out of focus it would be cast in one colour, as a shadow is.
      return s.blur > 0.25 && leaf.op.kind === "ink" ? [{ kind: "blur", radius: s.blur, ops: [made] }] : [made];
    },
  };
}

// Engraved.

/**
 * Engraved's passes of the burin: the angle its lines lie at across the
 * lockup, in radians, and the stretch of seconds they are begun in, in no
 * order, many at once. The second crosses the first at a narrow angle, as
 * a line engraver lays tone: lozenges, not a mesh.
 */
const ENGRAVE_PASSES = [
  { angle: -0.75, from: 0.28, to: 0.6 },
  { angle: -0.22, from: 0.72, to: 0.9 },
] as const;

/** When the letters' contours are begun (in turn across the lockup over CONTOUR_SWEEP) and how long each takes to go round, in seconds. */
const CONTOUR_AT = 0.04;
const CONTOUR_SWEEP = 0.12;
const CONTOUR_ROUND = 0.26;

/** How long a line takes to cut along its length; when the lines deepen (in turn across the lockup over DEEPEN_SWEEP) and how long each takes; in seconds. */
const LINE_CUT = 0.24;
const DEEPEN_AT = 1.05;
const DEEPEN_SWEEP = 0.28;
const DEEPEN = 0.3;

/** A loop's points moved `by` out to its left as it runs, each along the line square to the way it runs there; `closed`, round its end to its start. */
function offset(points: Point[], by: number, closed: boolean): number[] {
  const out: number[] = [];
  const n = points.length;
  points.forEach((p, i) => {
    const before = closed ? points[(i - 1 + n) % n] : points[Math.max(0, i - 1)];
    const after = closed ? points[(i + 1) % n] : points[Math.min(n - 1, i + 1)];
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    const length = Math.hypot(dx, dy) || 1;
    out.push(p.x - (dy / length) * by, p.y + (dx / length) * by);
  });
  return out;
}

/**
 * The first `part` of a closed loop, by its length, as a band `width` wide
 * along it: what the burin has cut round it so far. Cut all round, it is a
 * ring, its edge on either side a loop of its own, so it has no seam.
 */
function cutRound(loop: Polygon, part: number, width: number): Polygon[] {
  const n = loop.length / 2;
  if (n < 2 || part <= 0) return [];
  const points: Point[] = [];
  for (let i = 0; i < n; i += 1) points.push({ x: loop[i * 2], y: loop[i * 2 + 1] });
  if (part >= 1) {
    const a = offset(points, width / 2, true);
    const b = offset(points, -width / 2, true);
    const [outer, inner] = Math.abs(loopArea(a)) >= Math.abs(loopArea(b)) ? [a, b] : [b, a];
    return [forwards(outer), backwards(forwards(inner))];
  }
  // Round the loop from its first point back to it, as far as it is cut: the first part of it by length, as paste is piped.
  const run: Point[] = chainPart([...points, points[0]].map((p) => ({ ...p, r: 0 })), part);
  if (run.length < 2) return [];
  return [forwards([...offset(run, width / 2, false), ...backwards(offset(run, -width / 2, false))])];
}

/**
 * Engraved (the owner's pick, 31 Oct): the lockup cut as an engraver cuts
 * a plate. Each letter's contour is cut first, all round, in full ink, so
 * the title reads at once; then a pass of fine lines across the letters,
 * each drawn along its length from one end or the other, many at once, a
 * second pass crossing them; and the lines deepen in turn across the
 * lockup until they meet and the letters are solid. Only the letters take
 * the lines, each shown through them as the cover draws it, the script
 * among them, its gap cut through the capitals' lines as they are. The
 * lines lie across the lockup as it is set, so they turn with it.
 */
function engraved(scene: Scene, measurer: Measurer): Built {
  type TextLeaf = Leaf & { op: Extract<Op, { kind: "text" }> };
  const texts = leavesOf(scene.ops).filter((l): l is TextLeaf => l.op.kind === "text");
  if (!texts.length) return { duration: 0, look: () => null };
  // The lockup's own frame, under any turn or placement round it: its first letters'.
  const frame = texts[0].world;
  const intoFrame = new Map<Op, Matrix>(texts.map((l) => [l.op, multiply(invert(frame), l.world)]));
  const caps = texts.find((l) => l.op.face.startsWith("caps-"));
  const cap = caps ? measurer.metrics(caps.op.face).cap * caps.op.size : texts[0].op.size * 0.7;
  // Every letter's box, its gap round it, in the lockup's frame.
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const l of texts) {
    const b = textBox(l.op, measurer);
    const gap = l.op.knock ?? 0;
    const m = intoFrame.get(l.op) ?? IDENTITY;
    for (const [x, y] of [
      [b.x - gap, b.y - gap],
      [b.x + b.w + gap, b.y - gap],
      [b.x - gap, b.y + b.h + gap],
      [b.x + b.w + gap, b.y + b.h + gap],
    ]) {
      const p = apply(m, { x, y });
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  }
  const letters = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  const pad = 0.2 * cap;
  const box = { x: x0 - pad, y: y0 - pad, w: letters.w + 2 * pad, h: letters.h + 2 * pad };
  const centre = centreOf(box);
  // Lines two of the cover's pixels wide at least, so they hold at its own size; deepened past the gap between them, so they meet.
  const spacing = Math.max(8, 0.062 * cap);
  const fine = Math.max(2.2, 0.22 * spacing);
  const solid = spacing * 1.1;
  // The contour's band: half of it falls inside the letter, and that is the line seen.
  const contour = Math.max(5, 0.032 * cap);
  /** How far across the lockup a point of its frame is, 0 at its left to 1 at its right. */
  const acrossOf = (x: number) => Math.min(1, Math.max(0, (x - letters.x) / Math.max(1, letters.w)));

  // Each letter's contour, as the cover letters it, in its own frame, begun in turn across the lockup.
  const contours = new Map<Op, { loop: Polygon; at: number }[]>();
  for (const l of texts) {
    const { op } = l;
    const loops = measurer.outline?.(op.face, op.text, { sx: op.sx, nib: (op.nib ?? 0) / op.size, bold: (op.bold ?? 0) / op.size }) ?? [];
    const m = intoFrame.get(op) ?? IDENTITY;
    contours.set(
      op,
      loops.map((loop) => {
        const own = loop.map((v, i) => (i % 2 ? op.y + v * op.size : op.x + v * op.size));
        let left = Infinity;
        for (let i = 0; i < own.length; i += 2) left = Math.min(left, apply(m, { x: own[i], y: own[i + 1] }).x);
        return { loop: own, at: CONTOUR_AT + CONTOUR_SWEEP * acrossOf(left) };
      }),
    );
  }

  // The lines of each pass across the box: each one's place across, when it is begun and from which end, and when it deepens.
  const passes = ENGRAVE_PASSES.map((pass, pi) => {
    const u = { x: Math.cos(pass.angle), y: Math.sin(pass.angle) };
    const n = { x: -u.y, y: u.x };
    const corners = [
      { x: box.x, y: box.y },
      { x: box.x + box.w, y: box.y },
      { x: box.x, y: box.y + box.h },
      { x: box.x + box.w, y: box.y + box.h },
    ];
    const along = corners.map((c) => c.x * u.x + c.y * u.y);
    const across = corners.map((c) => c.x * n.x + c.y * n.y);
    const n0 = Math.min(...across);
    const n1 = Math.max(...across);
    const count = Math.ceil((n1 - n0) / spacing) + 1;
    const middle = centre.x * n.x + centre.y * n.y;
    // Begun in no order, the same every time.
    const next = random(mixSeed(0xe9a7, pi));
    const lines = Array.from({ length: count }, (_, i) => {
      const o = n0 + (i + 0.5) * spacing - (count * spacing - (n1 - n0)) / 2;
      return {
        o,
        start: pass.from + (pass.to - pass.from) * next(),
        deepen: DEEPEN_AT + DEEPEN_SWEEP * acrossOf(centre.x + (o - middle) * n.x),
        back: next() < 0.5,
      };
    });
    return { u, n, u0: Math.min(...along), u1: Math.max(...along), lines };
  });
  const natural = DEEPEN_AT + DEEPEN_SWEEP + DEEPEN;
  const k = fitted(natural);

  /** Every line cut by `t`, in the lockup's frame: worked out once a frame, for every letter. */
  let made: { t: number; polygons: Polygon[] } | null = null;
  const cutBy = (t: number): Polygon[] => {
    if (made && made.t === t) return made.polygons;
    const polygons: Polygon[] = [];
    for (const p of passes) {
      const at = (s: number, o: number) => [s * p.u.x + o * p.n.x, s * p.u.y + o * p.n.y];
      for (const line of p.lines) {
        const g = easeOut(span(t, line.start, LINE_CUT));
        if (g <= 0) continue;
        const width = fine + (solid - fine) * easeInOut(span(t, line.deepen, DEEPEN));
        // Drawn along its length, from one end or the other.
        const s0 = line.back ? p.u1 - (p.u1 - p.u0) * g : p.u0;
        const s1 = line.back ? p.u1 : p.u0 + (p.u1 - p.u0) * g;
        const a = line.o - width / 2;
        const b = line.o + width / 2;
        polygons.push(forwards([...at(s0, a), ...at(s1, a), ...at(s1, b), ...at(s0, b)]));
      }
    }
    made = { t, polygons };
    return polygons;
  };

  return {
    duration: natural * k,
    look: () => null,
    replace: (leaf, now) => {
      if (leaf.op.kind !== "text") return null;
      const t = now / k;
      const round = (contours.get(leaf.op) ?? []).flatMap((c) => cutRound(c.loop, easeInOut(span(t, c.at, CONTOUR_ROUND)), contour));
      // The lines, carried from the lockup's frame into the letter's own.
      const toOwn = invert(intoFrame.get(leaf.op) ?? IDENTITY);
      const lines = cutBy(t).map((p) => {
        const out: number[] = [];
        for (let i = 0; i < p.length; i += 2) {
          const q = apply(toOwn, { x: p[i], y: p[i + 1] });
          out.push(q.x, q.y);
        }
        return out;
      });
      const polygons = [...round, ...lines];
      return polygons.length ? [{ kind: "clip", polygons, ops: [leaf.op] }] : [];
    },
  };
}

/**
 * Renaissance: its lines of capitals and its scripts, in the order the
 * lockup is read (top to bottom, a script where it falls between two
 * lines). Written brings the capitals in line by line and then writes each
 * script across them as a pen would; Word by word and Line by line bring
 * each word, or each line, in as it is read.
 */
function renaissanceIn(scene: Scene, id: AnimationId, measurer: Measurer): Built {
  if (id === "engraved") return engraved(scene, measurer);
  if (id === "drop") return drop(scene, measurer);
  const texts = leavesOf(scene.ops).filter((l): l is Leaf & { op: Extract<Op, { kind: "text" }> } => l.op.kind === "text");
  const isCaps = (l: { op: Extract<Op, { kind: "text" }> }) => l.op.face.startsWith("caps-");
  const read = <T extends Leaf>(leaves: T[]) => [...leaves].sort((a, b) => {
    const ca = leafCentre(a, measurer);
    const cb = leafCentre(b, measurer);
    return Math.abs(ca.y - cb.y) > 1 ? ca.y - cb.y : ca.x - cb.x;
  });
  const caps = read(texts.filter(isCaps));
  const scripts = read(texts.filter((l) => !isCaps(l)));
  const sheet = new Map<Op, (t: number) => Look | null>();

  if (id === "written") {
    const each = 0.55;
    const gap = Math.min(0.16, 1.6 / Math.max(1, caps.length));
    let t = caps.length ? (caps.length - 1) * gap + each * 0.8 : 0;
    const starts = scripts.map((l) => {
      const at = t;
      t += 0.35 + 0.085 * graphemes(l.op.text).length + 0.08;
      return at;
    });
    const natural = Math.max(t, caps.length ? (caps.length - 1) * gap + each : 0);
    const k = fitted(natural);
    caps.forEach((l, i) => {
      const centre = leafCentre(l, measurer);
      sheet.set(l.op, (now) => arrive("rise", centre, i * gap * k, each * k, now, l.op.size * 0.12));
    });
    scripts.forEach((l, i) => {
      const length = 0.35 + 0.085 * graphemes(l.op.text).length;
      sheet.set(l.op, (now) => (now >= (starts[i] + length) * k ? null : { drawn: drawnAt(span(now, starts[i] * k, length * k)) }));
    });
    return { duration: natural * k, look: (leaf, now) => sheet.get(leaf.op)?.(now) ?? null };
  }

  if (id === "lines") {
    const order = read([...caps, ...scripts]);
    const gap = Math.min(0.22, 2.4 / Math.max(1, order.length));
    const natural = order.length ? (order.length - 1) * gap + 0.7 : 0;
    const k = fitted(natural);
    order.forEach((l, i) => {
      const centre = leafCentre(l, measurer);
      sheet.set(l.op, (now) => arrive("rise", centre, i * gap * k, 0.7 * k, now, l.op.size * 0.14));
    });
    return { duration: natural * k, look: (leaf, now) => sheet.get(leaf.op)?.(now) ?? null };
  }

  // Word by word: each line of capitals as its words while any is still coming, a script as one.
  const split = caps.map((l) => ({ leaf: l as Leaf, words: wordsOf(l.op, measurer).map((w): Leaf => ({ op: w, world: l.world })) }));
  const items = read([...split.flatMap((s) => s.words), ...scripts]);
  const gap = Math.min(0.13, 2.6 / Math.max(1, items.length));
  const natural = items.length ? (items.length - 1) * gap + 0.6 : 0;
  const k = fitted(natural);
  const startOf = new Map<Op, number>();
  items.forEach((item, i) => startOf.set(item.op, i * gap * k));
  const look = (leaf: Leaf, now: number) => {
    const start = startOf.get(leaf.op);
    if (start === undefined || leaf.op.kind !== "text") return null;
    return arrive("rise", leafCentre(leaf, measurer), start, 0.6 * k, now, leaf.op.size * (isCaps(leaf as Leaf & { op: Extract<Op, { kind: "text" }> }) ? 0.18 : 0.12));
  };
  const lastOf = new Map(split.map((s) => [s.leaf.op, Math.max(...s.words.map((w) => startOf.get(w.op) ?? 0)) + 0.6 * k]));
  return {
    duration: natural * k,
    look: (leaf, now) => (startOf.has(leaf.op) ? look(leaf, now) : null),
    replace: (leaf, now) => {
      const s = split.find((x) => x.leaf.op === leaf.op);
      if (!s || now >= (lastOf.get(leaf.op) ?? 0)) return null;
      return s.words.flatMap((w) => {
        const made = looked(w, look(w, now), measurer);
        return made ? [made] : [];
      });
    },
  };
}

// Ripples: Renaissance's Ribbon and Drop (ripple.ts).

type TextLeaf = Leaf & { op: Extract<Op, { kind: "text" }> };

/** Smooth from 0 to 1 as `u` runs from 0 to 1, starting and stopping at no speed. */
const smooth = (u: number) => {
  const x = clamp01(u);
  return x * x * (3 - 2 * x);
};

/** 1, falling to nought over the last `tail` seconds of `length`: water stilled by the end, so the cover follows with no step. */
const stilledBy = (t: number, length: number, tail: number) => 1 - smooth((t - (length - tail)) / tail);

/** A rect in a leaf's frame, as the box round it on the cover. */
function coverBox(world: Matrix, r: { x: number; y: number; w: number; h: number }) {
  const corners = [apply(world, { x: r.x, y: r.y }), apply(world, { x: r.x + r.w, y: r.y }), apply(world, { x: r.x, y: r.y + r.h }), apply(world, { x: r.x + r.w, y: r.y + r.h })];
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

const grownBy = (r: { x: number; y: number; w: number; h: number }, by: number) => ({ x: r.x - by, y: r.y - by, w: r.w + 2 * by, h: r.h + 2 * by });

/** How many of the picture's pixels a leaf's frame draws for one of its own: the owner's scaling of the text box. */
const frameScale = (world: Matrix) => Math.sqrt(Math.abs(world[0] * world[3] - world[1] * world[2])) || 1;

/**
 * A text's letters, each where the face puts it in the line, its kerning
 * with the letter before taken in (the text up to it, less the letter):
 * drawn one by one, they fall exactly where the line draws them.
 */
function kernedLetters(op: Extract<Op, { kind: "text" }>, measurer: Measurer): Extract<Op, { kind: "text" }>[] {
  const out: Extract<Op, { kind: "text" }>[] = [];
  const sx = op.sx ?? 1;
  let before = "";
  for (const g of graphemes(op.text)) {
    if (g.trim()) out.push({ ...op, text: g, x: op.x + (measurer.width(op.face, before + g) - measurer.width(op.face, g)) * op.size * sx });
    before += g;
  }
  return out;
}

/** The gap a script cuts in its capitals, as an op to cut with: its own shape, or its letters that gap wider all round. */
function gapOf(op: Extract<Op, { kind: "text" }>): Op | null {
  if (op.knockShape) return { kind: "ink", text: op.text, polygons: op.knockShape, color: "#000", size: op.size, line: op.line ?? 0, key: `gap|${op.text}` };
  if (!op.knock) return null;
  return { ...op, color: "#000", alpha: 1, knock: undefined, knockShape: undefined, bold: op.knock * 2 + (op.bold ?? 0) };
}

/** A text seen through `surface` in `area` (moved by `m` in its frame first, if given), any gap it cuts in its capitals rippled with it. */
function throughWater(op: Extract<Op, { kind: "text" }>, surface: Surface, area: { x: number; y: number; w: number; h: number }, m?: Matrix): Op {
  const moved = (o: Op): Op => (m ? { kind: "matrix", m, ops: [o] } : o);
  const gap = gapOf(op);
  return { kind: "ripple", surface, ops: [moved({ ...op, knock: undefined, knockShape: undefined })], cut: gap ? [moved(gap)] : undefined, area };
}

/**
 * A drop for letters whose capitals are `unit` pixels of the picture tall:
 * its strength, pace and spacing as shares of the unit, its crests running
 * at seven tenths of its rings' pace, and its rings wavering a little.
 */
function water(unit: number, x: number, y: number, age: number, strength: number, seed: number, fade: number, over: Partial<WaterDrop>): WaterDrop {
  return { x, y, age, strength: unit * strength, speed: unit * 1.5, wavelength: unit * 0.24, width: 2.6, spread: unit * 0.27, life: 0.9, phase: 0.68, wobble: unit * 0.015, seed, fade, ...over };
}

/** Renaissance's lockup: its capitals and its scripts, and how tall a capital is on the cover. */
function lockupOf(scene: Scene, measurer: Measurer) {
  const texts = leavesOf(scene.ops).filter((l): l is TextLeaf => l.op.kind === "text");
  const isCaps = (l: TextLeaf) => l.op.face.startsWith("caps-");
  const caps = texts.filter(isCaps);
  const scripts = texts.filter((l) => !isCaps(l));
  const first = caps[0] ?? texts[0];
  const capH = first ? measurer.metrics(first.op.face).cap * first.op.size * frameScale(first.world) : 100;
  return { texts, caps, scripts, capH };
}

/** How long Ribbon's loop is at its own speed: the wave runs the word in under two seconds, and the script rests a moment. */
export const RIBBON_LOOP = 2.2;

/** When the wave comes onto the word, and how long it takes to reach its full height. */
const RIBBON_START = 0.05;
const RIBBON_RISE = 0.45;
/** How long before the loop's end the script is still again. */
const RIBBON_STILL = 0.35;

/**
 * Ribbon, at `pace`: a loop. A wave runs along each script from its first
 * letter to its last, as along a ribbon flicked at one end, lifting and
 * lowering its strokes across its own line in turn and dying as it runs;
 * its gap in the capitals moves with it, and the capitals stand. The
 * script is the cover's own, seen through the wave, so where the wave is
 * not it is the cover exactly.
 */
function ribbon(scene: Scene, measurer: Measurer, pace: number): Plan {
  const { scripts } = lockupOf(scene, measurer);
  const made = new Map(
    scripts.map((l) => {
      const box = textBox(l.op, measurer);
      const area = coverBox(l.world, grownBy(box, (l.op.knock ?? 0) + box.h * 0.15));
      const lambda = Math.max(box.h * 1.4, box.w * 0.6);
      return [l.op, { leaf: l, box, area, lambda, speed: (box.w + lambda * 1.5) / 1.7, toFrame: invert(l.world), down: { x: l.world[2], y: l.world[3] } }] as const;
    }),
  );
  return {
    duration: RIBBON_LOOP / pace,
    loops: true,
    frame(t: number): Scene {
      const at = (((Math.max(0, t) * pace) % RIBBON_LOOP) + RIBBON_LOOP) % RIBBON_LOOP;
      const strength = smooth((at - RIBBON_START) / RIBBON_RISE) * stilledBy(at, RIBBON_LOOP, RIBBON_STILL);
      if (at < RIBBON_START || strength <= 0 || !made.size) return scene;
      let moved = false;
      const ops = mapLeaves(scene.ops, (op) => {
        const p = op.kind === "text" ? made.get(op) : undefined;
        if (!p || op.kind !== "text") return op;
        const surface: Surface = {
          drops: [],
          bends: [{ toFrame: p.toFrame, down: p.down, front: p.box.x - p.lambda * 0.6 + p.speed * (at - RIBBON_START), wavelength: p.lambda, reach: p.lambda * 0.7, height: p.box.h * 0.06 * strength, start: p.box.x, length: p.box.w }],
          crisp: true,
        };
        // Lifting by less than the water can show, or only past the word's ends, it is the cover's own script.
        const front = surface.bends?.[0].front ?? 0;
        const off = Math.max(0, p.box.x - front, front - (p.box.x + p.box.w)) / (p.lambda * 0.7);
        if (isStill(surface) || p.box.h * 0.06 * strength * Math.exp(-off * off) * frameScale(p.leaf.world) < STILL_BELOW) return op;
        moved = true;
        return throughWater(op, surface, p.area);
      });
      return moved ? { ...scene, ops } : scene;
    },
  };
}

/** How fast Drop's ring runs, in capitals a second, and so when each capital comes up. */
const DROP_SPEED = 2.1;
/** How long a capital takes to come up, and from how far below its place, as a share of a capital. */
const DROP_OPENING = 0.2;
const DROP_RISE = 0.06;
/** How long the water takes to still after the last capital starts up. */
const DROP_SETTLE = 1.15;

/**
 * Drop: a drop falls on the script and the lockup comes up as its rings
 * run out: the script first, then each capital, whole, rising a little
 * through the water as the ring reaches its middle (never cut by an edge
 * sweeping the cover), bent by the crests as they pass and settling
 * behind them; a smaller drop follows half a second on. Once all of a
 * line's letters are up it is drawn as the line again, so nothing shifts
 * at the end, and the water is stilled, light and all, before the cover
 * stands.
 */
function drop(scene: Scene, measurer: Measurer): Built {
  const { texts, scripts, capH } = lockupOf(scene, measurer);
  if (!texts.length) return { duration: 0, look: () => null };
  const boxOn = (l: TextLeaf, op: Extract<Op, { kind: "text" }> = l.op) => coverBox(l.world, textBox(op, measurer));
  const boxes = texts.map((l) => boxOn(l));
  const all = {
    x: Math.min(...boxes.map((b) => b.x)),
    y: Math.min(...boxes.map((b) => b.y)),
    w: Math.max(...boxes.map((b) => b.x + b.w)) - Math.min(...boxes.map((b) => b.x)),
    h: Math.max(...boxes.map((b) => b.y + b.h)) - Math.min(...boxes.map((b) => b.y)),
  };
  const at = centreOf(scripts.length ? boxOn(scripts[0]) : all);
  const speed = capH * DROP_SPEED;
  type Piece = { op: Extract<Op, { kind: "text" }>; box: { x: number; y: number; w: number; h: number }; start: number };
  const pieces = new Map<Op, { leaf: TextLeaf; parts: Piece[]; area: { x: number; y: number; w: number; h: number } }>();
  for (const l of texts) {
    const caps = l.op.face.startsWith("caps-");
    const parts = (caps ? kernedLetters(l.op, measurer) : [l.op]).map((op): Piece => {
      const box = boxOn(l, op);
      const c = centreOf(box);
      return { op, box, start: 0.05 + (caps ? Math.max(0, Math.hypot(c.x - at.x, c.y - at.y) - capH * 0.35) / speed : 0) };
    });
    if (parts.length) pieces.set(l.op, { leaf: l, parts, area: grownBy(boxOn(l), capH * 0.3) });
  }
  const last = Math.max(0, ...[...pieces.values()].flatMap((p) => p.parts.map((q) => q.start)));
  const duration = last + DROP_SETTLE;
  let memo: { t: number; surface: Surface } | null = null;
  const waterAt = (t: number): Surface => {
    if (memo?.t === t) return memo.surface;
    const fade = stilledBy(t, duration, 0.5);
    const surface: Surface = {
      drops: [
        water(capH, at.x, at.y, t - 0.02, 0.065, 5, fade, { speed, wavelength: capH * 0.28, width: 1.3, spread: capH * 0.1, life: 0.95 }),
        water(capH, at.x + capH * 0.15, at.y - capH * 0.08, t - 0.5, 0.02, 9, fade, { speed: speed * 0.85, wavelength: capH * 0.22, width: 1.2, spread: speed * 0.85 * 0.18, life: 0.6 }),
      ],
      glint: 0.4,
      caustic: 0.14,
      crisp: true,
    };
    memo = { t, surface };
    return surface;
  };
  const rise = capH * DROP_RISE;
  // Every line of capitals is seen through the water as one layer, drawn where the first of them is (each other line carried into its frame), so the water is read once for them all; each script is a layer of its own, after them, so its gap is cut in them.
  const capsLeaves = [...pieces.values()].filter((p) => p.leaf.op.face.startsWith("caps-"));
  const firstCaps = capsLeaves[0]?.leaf;
  const capsArea = capsLeaves.length
    ? grownBy(
        {
          x: Math.min(...capsLeaves.map((p) => p.area.x)),
          y: Math.min(...capsLeaves.map((p) => p.area.y)),
          w: Math.max(...capsLeaves.map((p) => p.area.x + p.area.w)) - Math.min(...capsLeaves.map((p) => p.area.x)),
          h: Math.max(...capsLeaves.map((p) => p.area.y + p.area.h)) - Math.min(...capsLeaves.map((p) => p.area.y)),
        },
        rise,
      )
    : null;
  /** A leaf's letters up at `t`, each rising and coming clear, in the frame of `into`; its gaps, if it cuts any, the same. */
  const lettersUp = (mine: { leaf: TextLeaf; parts: Piece[] }, t: number, into: TextLeaf) => {
    const ops: Op[] = [];
    const gaps: Op[] = [];
    const carry = mine.leaf === into ? null : multiply(invert(into.world), mine.leaf.world);
    const whole = mine.parts.every((p) => t >= p.start + DROP_OPENING);
    for (const p of whole ? [{ op: mine.leaf.op, start: -Infinity }] : mine.parts) {
      if (t <= p.start) continue;
      const u = whole ? 1 : smooth((t - p.start) / DROP_OPENING);
      const lift = rise * (1 - u) ** 2;
      // A move down the cover, carried into the leaf's frame.
      const down = lift > 0.01 ? multiply(invert(mine.leaf.world), multiply([1, 0, 0, 1, 0, lift], mine.leaf.world)) : null;
      const m = carry && down ? multiply(carry, down) : (carry ?? down);
      const as = (o: Op): Op => {
        const moved: Op = m ? { kind: "matrix", m, ops: [o] } : o;
        return u >= 1 ? moved : { kind: "fade", alpha: u, ops: [moved] };
      };
      ops.push(as({ ...p.op, knock: undefined, knockShape: undefined }));
      const gap = gapOf(p.op);
      if (gap) gaps.push(as(gap));
    }
    return { ops, gaps };
  };
  return {
    duration,
    look: () => null,
    replace: (leaf, t) => {
      const mine = pieces.get(leaf.op);
      if (!mine || leaf.op.kind !== "text") return null;
      const surface = waterAt(t);
      if (mine.leaf.op.face.startsWith("caps-")) {
        if (mine.leaf !== firstCaps || !capsArea) return [];
        const ops = capsLeaves.flatMap((c) => lettersUp(c, t, mine.leaf).ops);
        return ops.length ? [{ kind: "ripple", surface, ops, area: capsArea }] : [];
      }
      const { ops, gaps } = lettersUp(mine, t, mine.leaf);
      return ops.length ? [{ kind: "ripple", surface, ops, cut: gaps.length ? gaps : undefined, area: grownBy(mine.area, rise) }] : [];
    },
  };
}

/**
 * The animation `id` of a cover's scene in `style`, at `speed` (1 its own,
 * 2 twice as fast, 0.5 half): every time in it divided by the speed.
 */
export function plan(scene: Scene, style: StyleId, id: AnimationId, measurer: Measurer, speed = 1, shuffle?: { seed: number; cover: (seed: number) => Scene }): Plan {
  const pace = speedOf(speed);
  // Without a way to make the cover shuffled (a test of another animation), Jitter stands still on the cover.
  if (id === "jitter") return jitter(scene, shuffle ? jitterSeeds(shuffle.seed) : [0], shuffle ? shuffle.cover : () => scene, pace);
  if (id === "jelly") return jelly(scene, pace);
  if (id === "ribbon") return ribbon(scene, measurer, pace);
  if (style === "wave") return wavePlay(scene, offers("wave", id) ? (id as WaveVariantId) : WAVE_VARIANTS[0].id, pace);
  if (style === "ripple") return pulsePlay(scene, pace);
  const built: Built =
    style === "stickery"
      ? stickery(scene, id, measurer)
      : style === "pasty" || style === "pasty-flat"
        ? pasty(scene)
        : style === "inkblot"
            ? inkblot(scene, id, measurer)
            : style === "renaissance"
              ? renaissanceIn(scene, id, measurer)
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

/** How long a video of a plan runs: the motion, then the cover held; a loop, its round alone. */
export function videoLength(p: Plan): number {
  return p.duration + (p.loops ? 0 : HOLD);
}

/**
 * The moments a motion of `duration` is drawn at, `fps` a second: from
 * nothing at 0 to the cover itself, last. A loop's stop a frame short of
 * its end, which is its start again.
 */
export function frameTimes(duration: number, fps: number, loops = false): number[] {
  if (loops) return Array.from({ length: Math.max(1, Math.round(duration * fps)) }, (_, i) => i / fps);
  const count = Math.max(1, Math.ceil(duration * fps - 1e-9));
  return Array.from({ length: count + 1 }, (_, i) => Math.min(duration, i / fps));
}

/** How many frames a video holds the finished cover for, after the motion's last: none for a loop. */
export function holdFrames(fps: number, loops = false): number {
  return loops ? 0 : Math.round(HOLD * fps);
}
