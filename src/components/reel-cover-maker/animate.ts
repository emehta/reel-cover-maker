/**
 * Animated covers (the owner's ask, 7 Oct): the cover's own scene laid down
 * over a few seconds in a way that suits its style, then held. Each
 * animation is a function of time on the scene the style made, so nothing
 * is set again: the last frame is the cover exactly as it stands, and a
 * still at any moment is the same still every time.
 *
 * - Stickery: Type and draw (each sticker laid, its plain words typed and
 *   its funky ones drawn: a script word written on along its slant, paste
 *   piped bead by bead), Pop (each sticker springs on), Rise (each floats
 *   up into place).
 * - Pasty and Pasty Flat: Written live (letter after letter, each stroke
 *   piped as if by hand), All at once (every letter piped together), Pop
 *   (letter by letter, each swelling into place).
 * - Editorial: Word by word, Typewriter, Line by line.
 * - Echo: Ripple (the words, then each echo out from them in turn), Spread
 *   (the echoes slide out from the words to their places), Cascade (every
 *   line drops in, top to bottom).
 * - Mono: Typewriter (its cursor typing), Word by word.
 *
 * An effect is worked out where it is seen (a sticker springs about its own
 * middle on the cover) and carried into each op's own frame, through the
 * turns and the owner's placement it is drawn inside; paste is moved bead
 * by bead, since its layer is made for where it lies.
 *
 * Pure: the tests run it.
 */

import type { FaceId, Measurer } from "@/components/reel-cover-maker/faces";
import type { Bead, Chain } from "@/components/reel-cover-maker/liquid";
import { apply, invert, multiply, type Matrix, type Point } from "@/components/reel-cover-maker/place";
import { isBackdrop, pasteKey, type LiquidOp, type Op, type Scene, type StyleId } from "@/components/reel-cover-maker/scene";
import { insidePolygon, polygonBounds, type Polygon } from "@/components/reel-cover-maker/stepped";
import { graphemes } from "@/components/reel-cover-maker/title";

export type AnimationId = "type-draw" | "pop" | "rise" | "written" | "together" | "swell" | "words" | "typewriter" | "lines" | "ripple" | "spread" | "cascade";

export interface Animation {
  id: AnimationId;
  name: string;
}

/** Each style's animations, the one it starts on first. */
export const ANIMATIONS: Record<StyleId, readonly Animation[]> = {
  stickery: [
    { id: "type-draw", name: "Type and draw" },
    { id: "pop", name: "Pop" },
    { id: "rise", name: "Rise" },
  ],
  pasty: [
    { id: "written", name: "Written live" },
    { id: "together", name: "All at once" },
    { id: "swell", name: "Pop" },
  ],
  "pasty-flat": [
    { id: "written", name: "Written live" },
    { id: "together", name: "All at once" },
    { id: "swell", name: "Pop" },
  ],
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

/** The longest the motion may run: anything set out longer is quickened to fit. */
export const LONGEST = 5;

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

/** Past the mark and back, as a thing thrown on settles. */
const springy = (u: number) => {
  const x = clamp01(u) - 1;
  return 1 + 2.4 * x ** 3 + 1.4 * x ** 2;
};

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** Scaled by `s` about (cx, cy), then moved by (dx, dy). */
function about(cx: number, cy: number, s: number, dx = 0, dy = 0): Matrix {
  return [s, 0, 0, s, cx - s * cx + dx, cy - s * cy + dy];
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
    else if (op.kind === "fade" || op.kind === "wipe") leavesOf(op.ops, world, out);
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
  if (look.drawn !== undefined && leaf.op.kind === "text") {
    if (look.drawn <= 0) return null;
    if (look.drawn < 1) {
      const box = textBox(leaf.op, measurer);
      op = { kind: "wipe", ...box, at: look.drawn, ops: [op] };
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
}

/** Times worked out at length `natural`, quickened to fit the longest a motion may run. */
function fitted(natural: number): number {
  return natural > LONGEST ? LONGEST / natural : 1;
}

/** A thing faded and sprung or floated in, `start` on, over `length`: its look at `t`. */
function arrive(kind: "pop" | "rise" | "drop" | "fade" | "settle", centre: Point, start: number, length: number, t: number, size: number): Look | null {
  const u = span(t, start, length);
  if (u >= 1) return null;
  const alpha = clamp01(u / 0.45);
  if (kind === "pop") return { alpha, move: about(centre.x, centre.y, 0.35 + 0.65 * springy(u)) };
  if (kind === "settle") return { alpha, move: about(centre.x, centre.y, 0.9 + 0.1 * easeOut(u)) };
  if (kind === "rise") return { alpha, move: about(centre.x, centre.y, 1, 0, size * (1 - easeOut(u))) };
  if (kind === "drop") return { alpha, move: about(centre.x, centre.y, 1, 0, -size * (1 - easeOut(u))) };
  return { alpha: easeOut(u) };
}

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
      return { leaf: l, polygons, centre: centreOf(box), height: box.h };
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
  const paste = scene.ops.find((op): op is LiquidOp => op.kind === "liquid") ?? null;
  const chainOwner = paste ? paste.chains.map((c) => (stickers.length ? owner(c[Math.floor(c.length / 2)] ?? c[0]) : 0)) : [];
  const radius = paste ? typicalRadius(paste) : 1;

  const sheet = new Map<Op, (t: number) => Look | null>();
  const chainTimes: { start: number; length: number; move?: (t: number) => Matrix | undefined }[] = [];
  let natural = 0;
  /** How much every time is quickened by to fit: read when a time is asked, once it is known. */
  let k = 1;

  if (id === "type-draw") {
    // Each sticker laid, then its words in reading order: plain ones typed, funky ones drawn.
    const plan: { at: number; run: (k: number) => void }[] = [];
    let t = 0;
    stickers.forEach((s, si) => {
      const paperAt = t;
      sheet.set(s.leaf.op, (now) => arrive("settle", s.centre, paperAt * k, 0.32 * k, now, 0));
      t += 0.2;
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
        if (unit.kind === "paste") {
          const at = t;
          const length = 0.5 + 0.09 * unit.chains.length;
          plan.push({
            at,
            run: (k) => {
              const { piping } = pipeInTurn(paste!.chains, unit.chains, at * k, length * k);
              for (const i of unit.chains) chainTimes[i] = { start: piping.start[i], length: piping.length[i] };
            },
          });
          t += length + 0.06;
          continue;
        }
        const op = unit.leaf.op as Extract<Op, { kind: "text" }>;
        const count = graphemes(op.text).length;
        const funky = op.face.startsWith("funky-");
        const at = t;
        if (funky) {
          const length = 0.28 + 0.07 * count;
          sheet.set(op, (now) => (now >= (at + length) * k ? null : { drawn: easeInOut(span(now, at * k, length * k)) }));
          t += length + 0.05;
        } else {
          const each = 0.045;
          sheet.set(op, (now) => (now >= (at + each * count) * k ? null : { typed: typedAt(now, at * k, each * count * k, count) }));
          t += each * count + 0.07;
        }
      }
      t += 0.1;
    });
    // Droplets, if any, last.
    if (paste) {
      const drops = paste.chains.map((_, i) => i).filter((i) => i >= paste.letters);
      const at = t;
      plan.push({ at, run: (k) => drops.forEach((i, n) => (chainTimes[i] = { start: (at + n * 0.03) * k, length: 0.2 * k })) });
      if (drops.length) t += 0.3;
    }
    natural = t;
    k = fitted(natural);
    for (const p of plan) p.run(k);
  } else {
    // Each sticker whole, one after another: sprung on, or floated up.
    const each = id === "pop" ? 0.5 : 0.62;
    const gap = id === "pop" ? 0.17 : 0.2;
    natural = stickers.length ? (stickers.length - 1) * gap + each : 0;
    k = fitted(natural);
    stickers.forEach((s, si) => {
      const at = si * gap * k;
      const look = (now: number) => arrive(id === "pop" ? "pop" : "rise", s.centre, at, each * k, now, s.height * 0.18);
      sheet.set(s.leaf.op, look);
      for (const w of words) if (w.on === si) sheet.set(w.leaf.op, look);
      paste?.chains.forEach((_, i) => {
        if (chainOwner[i] === si) chainTimes[i] = { start: at, length: 0, move: (now) => look(now)?.move };
      });
    });
  }
  return {
    duration: natural * k,
    look: (leaf, t) => {
      const at = sheet.get(leaf.op);
      return at ? at(t) : null;
    },
    paste: (op, t) =>
      pasteAt(op, radius, (i) => {
        const c = chainTimes[i];
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

/** Pasty and Pasty Flat: the paste piped, or swelling, letter by letter; any letter without strokes faded in at the end. */
function pasty(scene: Scene, id: AnimationId): Built {
  const paste = scene.ops.find((op): op is LiquidOp => op.kind === "liquid") ?? null;
  if (!paste) return { duration: 0, look: () => null };
  const radius = typicalRadius(paste);
  const letters = paste.chains.slice(0, paste.letters).map((_, i) => i);
  const glyphs = [...new Set(letters.map((i) => paste.glyphOf[i] ?? i))];
  const byGlyph = new Map<number, number[]>();
  for (const i of letters) {
    const g = paste.glyphOf[i] ?? i;
    byGlyph.set(g, [...(byGlyph.get(g) ?? []), i]);
  }
  const drops = paste.chains.map((_, i) => i).filter((i) => i >= paste.letters);
  const times: { start: number; length: number; move?: (t: number) => Matrix | undefined }[] = [];
  let natural: number;
  if (id === "written") {
    natural = Math.min(4.2, Math.max(1.4, 0.7 + 0.16 * glyphs.length)) + (drops.length ? 0.35 : 0);
  } else if (id === "together") {
    natural = 1.7 + (drops.length ? 0.35 : 0);
  } else {
    natural = (glyphs.length - 1) * 0.07 + 0.5 + (drops.length ? 0.3 : 0);
  }
  const k = fitted(natural);
  let writtenEnd: number;
  if (id === "written") {
    const length = natural - (drops.length ? 0.35 : 0);
    const { piping, end } = pipeInTurn(paste.chains, letters, 0, length * k, paste.glyphOf);
    for (const i of letters) times[i] = { start: piping.start[i], length: piping.length[i] };
    writtenEnd = end;
  } else if (id === "together") {
    for (const indices of byGlyph.values()) {
      const { piping } = pipeInTurn(paste.chains, indices, 0, 1.7 * k);
      for (const i of indices) times[i] = { start: piping.start[i], length: piping.length[i] };
    }
    writtenEnd = 1.7 * k;
  } else {
    glyphs.forEach((g, n) => {
      const indices = byGlyph.get(g) ?? [];
      const beads = indices.flatMap((i) => paste.chains[i]);
      const xs = beads.map((b) => b.x);
      const ys = beads.map((b) => b.y);
      const centre = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
      const at = n * 0.07 * k;
      for (const i of indices) {
        times[i] = { start: at, length: 0, move: (t) => (t >= at + 0.5 * k ? undefined : about(centre.x, centre.y, 0.2 + 0.8 * springy(span(t, at, 0.5 * k)))) };
      }
    });
    writtenEnd = ((glyphs.length - 1) * 0.07 + 0.5) * k;
  }
  drops.forEach((i, n) => {
    const at = writtenEnd + n * 0.025 * k;
    const bead = paste.chains[i][0];
    times[i] = { start: at, length: 0, move: (t) => (t >= at + 0.25 * k || !bead ? undefined : about(bead.x, bead.y, Math.max(0.05, easeOut(span(t, at, 0.25 * k))))) };
  });
  const missingAt = writtenEnd;
  return {
    duration: natural * k,
    look: (leaf, t) => (leaf.op.kind === "text" ? (t >= missingAt + 0.3 ? null : { alpha: easeOut(span(t, missingAt, 0.3)) }) : null),
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

/** The animation `id` of a cover's scene. The style is read from what the scene holds, as each style's ops are its own. */
export function plan(scene: Scene, style: StyleId, id: AnimationId, measurer: Measurer): Plan {
  const built: Built =
    style === "stickery"
      ? stickery(scene, id, measurer)
      : style === "pasty" || style === "pasty-flat"
        ? pasty(scene, id)
        : style === "echo"
          ? echo(scene, id, measurer)
          : typeset(scene, id, measurer);
  const leafWorld = new Map<Op, Matrix>();
  for (const leaf of leavesOf(scene.ops)) leafWorld.set(leaf.op, leaf.world);
  return {
    duration: built.duration,
    frame(t: number): Scene {
      if (t >= built.duration) return scene;
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
