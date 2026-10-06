/**
 * Letters made of paste: the geometry.
 *
 * A glyph from a single-line font is a set of centre lines. Paste squeezed
 * along them is a chain of beads, each a point with a radius, so a stroke
 * swells where the hand pressed harder, bulges where it stopped, and pools
 * where two strokes meet. Drips hang from a stroke's low points and droplets
 * scatter around. Everything is seeded from the glyph's own seed, which the
 * layout takes from its word and its place in it, so a K is drawn one way in
 * "kite" and another in "handkerchief", and the same way every time.
 *
 * Pure: `liquid-render.ts` draws what this makes.
 */

import { between, mixSeed, noise1, random } from "@/components/reel-cover-maker/noise";
import type { StrokeGlyph } from "@/components/reel-cover-maker/strokes";

export interface Bead {
  x: number;
  y: number;
  r: number;
}

/** A stroke of paste: consecutive beads joined smoothly. A single bead is a droplet. */
export type Chain = Bead[];

export interface PlacedGlyph {
  glyph: StrokeGlyph;
  /** The left end of its baseline, in pixels of the picture. */
  x: number;
  y: number;
  /** Pixels per em, across and down. */
  sx: number;
  sy: number;
  /** A turn about its middle, in radians, and a lean (x moves by `skew` times the height above the baseline). */
  angle: number;
  skew: number;
  /** The size the paste's thickness follows, in pixels per em, where it is neither `sx` nor `sy`. */
  em?: number;
  seed: number;
}

export interface PasteRecipe {
  /** The paste's radius, in em of the glyph's height. */
  weight: number;
  /** How much a stroke swells and pinches along its length, 0 to 1. */
  pressure: number;
  /** How much bigger a free end may swell into a blob, as a share of the radius: 0.8 is up to 1.8 times. */
  bulb: number;
  /** How far the centre line strays sideways, in em. */
  wobble: number;
  /** Passes of corner cutting: the plotter's sharp corners made liquid. */
  smooth: number;
  /**
   * The hand's own unsteadiness, in em: how far a stroke bows off its chord,
   * and how far a glyph's strokes waver side to side as they run down it,
   * so a stem is never ruled straight.
   */
  bow: number;
  wave: number;
  /** The chance a stem's foot runs on as a drip, and how far a drip runs, in em. */
  drip: number;
  dripLength: readonly [number, number];
  /** Droplets around each glyph, on average. */
  droplets: number;
}

/** Corner cutting (Chaikin): each pass rounds every corner, keeping both ends. */
export function chaikin(points: [number, number][], passes: number): [number, number][] {
  let out = points;
  for (let pass = 0; pass < passes && out.length > 2; pass += 1) {
    const next: [number, number][] = [out[0]];
    for (let i = 0; i < out.length - 1; i += 1) {
      const [ax, ay] = out[i];
      const [bx, by] = out[i + 1];
      next.push([0.75 * ax + 0.25 * bx, 0.75 * ay + 0.25 * by], [0.25 * ax + 0.75 * bx, 0.25 * ay + 0.75 * by]);
    }
    next.push(out[out.length - 1]);
    out = next;
  }
  return out;
}

/** Points every `spacing` along a polyline, both ends kept, and how far along each one is. */
export function resample(points: [number, number][], spacing: number): { pts: [number, number][]; at: number[] } {
  if (points.length < 2) return { pts: points.slice(), at: points.map(() => 0) };
  const lengths = [0];
  for (let i = 1; i < points.length; i += 1) {
    lengths.push(lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  }
  const total = lengths[lengths.length - 1];
  if (total === 0) return { pts: [points[0]], at: [0] };
  const count = Math.max(1, Math.ceil(total / spacing));
  const pts: [number, number][] = [];
  const at: number[] = [];
  let seg = 0;
  for (let k = 0; k <= count; k += 1) {
    const s = (k / count) * total;
    while (seg < points.length - 2 && lengths[seg + 1] < s) seg += 1;
    const span = lengths[seg + 1] - lengths[seg] || 1;
    const t = (s - lengths[seg]) / span;
    pts.push([
      points[seg][0] + (points[seg + 1][0] - points[seg][0]) * t,
      points[seg][1] + (points[seg + 1][1] - points[seg][1]) * t,
    ]);
    at.push(s);
  }
  return { pts, at };
}

/** A glyph's point in em to the picture's pixels. */
function placer(g: PlacedGlyph) {
  // Turned about the middle of its advance, half a cap above the baseline.
  const cx = (g.glyph.advance * g.sx) / 2;
  const cy = -0.35 * g.sy;
  const cos = Math.cos(g.angle);
  const sin = Math.sin(g.angle);
  return (u: number, v: number): [number, number] => {
    const px = (u - v * g.skew) * g.sx - cx;
    const py = v * g.sy - cy;
    return [g.x + cx + px * cos - py * sin, g.y + cy + px * sin + py * cos];
  };
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export interface GlyphPaste {
  /** The glyph's own strokes, then its drips. */
  chains: Chain[];
  /** How many of `chains` are strokes: the rest are drips. */
  strokes: number;
  /** Loose droplets: ornament, not letter. */
  droplets: Chain[];
}

/**
 * A stroke as the hand drew it, in em: bowed off its chord one way or the
 * other, and wavering side to side as it runs down the glyph, the same wave
 * through every stroke of the glyph, so its stems sway together.
 */
function unsteady(points: [number, number][], seed: number, recipe: PasteRecipe, wave: { amp: number; length: number; phase: number }): [number, number][] {
  if (points.length < 2) return points;
  const [ax, ay] = points[0];
  const [bx, by] = points[points.length - 1];
  const chord = Math.hypot(bx - ax, by - ay);
  const closed = chord < 0.05;
  const next = random(mixSeed(seed, 0xb0));
  const bow = closed ? 0 : recipe.bow * between(next, -1, 1) * Math.min(1, chord / 0.5);
  const nx = chord ? -(by - ay) / chord : 0;
  const ny = chord ? (bx - ax) / chord : 0;
  let run = 0;
  const along = points.map((p, i) => (i ? (run += Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1])) : 0));
  const total = run || 1;
  return points.map(([x, y], i) => {
    const f = along[i] / total;
    const bend = bow * Math.sin(Math.PI * f);
    const sway = wave.amp * Math.sin((y / wave.length) * Math.PI * 2 + wave.phase);
    return [x + nx * bend + sway, y + ny * bend];
  });
}

/**
 * The paste for one glyph. `floor` is the lowest a drip may run to, and
 * `area` where droplets may land, both in pixels of the picture.
 *
 * Each choice is drawn from its own seeded stream (the hand's wave, each
 * stroke's swelling, each end's blob or drip, the spatter), so a recipe
 * with no drips draws the same strokes as one with them.
 */
export function pasteGlyph(
  g: PlacedGlyph,
  recipe: PasteRecipe,
  floor: number,
  area: { x: number; y: number; w: number; h: number },
): GlyphPaste {
  const place = placer(g);
  const size = g.sy;
  // The nozzle's width follows the letter's size, never its stretch: a
  // letter drawn taller is drawn with the same paste, so its counters stay open.
  const r0 = recipe.weight * (g.em ?? Math.min(g.sx, g.sy));
  const hand = random(mixSeed(g.seed, 0x4a));
  const strength = between(hand, 0.88, 1.14);
  const wave = { amp: recipe.wave * between(hand, 0.4, 1), length: between(hand, 0.45, 0.9), phase: hand() * Math.PI * 2 };
  const chains: Chain[] = [];
  const drips: { from: Bead; dx: number; dy: number; seed: number }[] = [];

  // Every stroke as drawn, in the picture's pixels, so an end can be checked against the others.
  const placed: [number, number][][] = g.glyph.strokes.map((flat, index) => {
    const pts: [number, number][] = [];
    for (let i = 0; i < flat.length; i += 2) pts.push([flat[i], flat[i + 1]]);
    return unsteady(pts, mixSeed(g.seed, index + 1), recipe, wave).map(([u, v]) => place(u, v));
  });

  placed.forEach((raw, index) => {
    const seed = mixSeed(g.seed, index + 1);
    const next = random(seed);
    // A dot (the i's, a full stop): one round ball, bigger than the stroke.
    if (raw.length === 1 || (raw.length === 2 && Math.hypot(raw[1][0] - raw[0][0], raw[1][1] - raw[0][1]) < r0 * 0.6)) {
      chains.push([{ x: raw[0][0], y: raw[0][1], r: r0 * strength * between(next, 1.35, 1.8) }]);
      return;
    }
    const closed = Math.hypot(raw[0][0] - raw[raw.length - 1][0], raw[0][1] - raw[raw.length - 1][1]) < r0 * 0.5;
    const { pts, at } = resample(chaikin(raw, recipe.smooth), Math.max(0.8, r0 * 0.6));
    const total = at[at.length - 1] || 1;
    // Only an end that stands free swells or drips: one that runs into
    // another stroke is a joint, and a joint pools by itself.
    const free = (x: number, y: number) =>
      !placed.some((o, j) => j !== index && o.some(([ox, oy]) => Math.hypot(ox - x, oy - y) < r0 * 1.6));
    type End = { kind: "plain" | "blob" | "drip"; size: number };
    const endOf = (which: 0 | 1): End => {
      const i = which ? pts.length - 1 : 0;
      const [x, y] = pts[i];
      if (closed || !free(x, y)) return { kind: "plain", size: 0 };
      const choose = random(mixSeed(seed, 0xe0 + which));
      // Pointing down: the foot of a stem, which may run on as a drip.
      const [px, py] = pts[which ? Math.max(0, i - 4) : Math.min(pts.length - 1, 4)];
      const down = y - py > Math.abs(x - px) * 1.4;
      if (down && choose() < recipe.drip) return { kind: "drip", size: 0 };
      return choose() < (down ? 0.7 : 0.45) ? { kind: "blob", size: recipe.bulb * between(choose, 0.4, 1) } : { kind: "plain", size: 0 };
    };
    const start = endOf(0);
    const end = endOf(1);
    const reach = r0 * 2.6;
    const swell = r0 * 6;
    const chain: Chain = pts.map(([x, y], i) => {
      // The normal to the stroke here, for the wobble.
      const [ax, ay] = pts[Math.max(0, i - 1)];
      const [bx, by] = pts[Math.min(pts.length - 1, i + 1)];
      const tx = bx - ax;
      const ty = by - ay;
      const tl = Math.hypot(tx, ty) || 1;
      const sway = recipe.wobble * size * noise1(seed ^ 0x51ed, at[i] / (r0 * 7));
      const s = at[i];
      // Thin through the middle of a long stroke, swelling and pinching as the hand pressed.
      let r = r0 * strength * (1 + recipe.pressure * 0.5 * noise1(seed, s / swell));
      r *= 1 - recipe.pressure * 0.18 * Math.sin(Math.PI * (s / total)) ** 2 * Math.min(1, total / (r0 * 10));
      r *= 1 + start.size * (1 - smoothstep(0, reach, s)) ** 2;
      r *= 1 + end.size * (1 - smoothstep(0, reach, total - s)) ** 2;
      return { x: x - (ty / tl) * sway, y: y + (tx / tl) * sway, r: Math.max(r0 * 0.4, r) };
    });
    chains.push(chain);
    for (const [which, kind] of [
      [0, start.kind],
      [1, end.kind],
    ] as const) {
      if (kind !== "drip") continue;
      const i = which ? chain.length - 1 : 0;
      const before = chain[which ? Math.max(0, i - 3) : Math.min(chain.length - 1, 3)];
      const from = chain[i];
      const l = Math.hypot(from.x - before.x, from.y - before.y) || 1;
      drips.push({ from, dx: (from.x - before.x) / l, dy: (from.y - before.y) / l, seed: mixSeed(seed, 0xd1 + which) });
    }
  });
  const strokes = chains.length;

  // Each drip runs on from its stem's foot in the stem's direction, falls
  // straight as gravity takes it, thins to a neck, and ends in a drop.
  for (const d of drips) {
    const next = random(d.seed);
    const room = floor - (d.from.y + d.from.r);
    const length = Math.min(room, between(next, recipe.dripLength[0], recipe.dripLength[1]) * size);
    if (length < d.from.r * 1.5) continue;
    const drop = between(next, 1.05, 1.4);
    const neck = between(next, 0.42, 0.62);
    const drip: Chain = [];
    const steps = Math.max(3, Math.ceil(length / (d.from.r * 0.35)));
    let x = d.from.x;
    for (let k = 1; k <= steps; k += 1) {
      const t = k / steps;
      // The stem's lean, fading as the drip falls.
      x += d.dx * (length / steps) * Math.max(0, 1 - t * 2.2) + noise1(d.seed, t * 3) * d.from.r * 0.04;
      const thin = 1 - (1 - neck) * smoothstep(0, 0.55, t);
      const end = t > 0.72 ? smoothstep(0.72, 0.97, t) : 0;
      drip.push({ x, y: d.from.y + t * length, r: Math.max(r0 * 0.4, d.from.r * (thin + (drop - thin) * end)) });
    }
    // The drop is round: its last bead sits a little above the tip, and
    // no bead, swollen as the drop is, reaches past the floor.
    const tip = drip[drip.length - 1];
    tip.y -= tip.r * 0.4;
    for (const b of drip) b.y = Math.min(b.y, floor - b.r);
    chains.push([d.from, ...drip]);
  }

  // Droplets: a few spatters around the glyph, some with a tail toward it.
  const spatter = random(mixSeed(g.seed, 0x5a));
  const droplets: Chain[] = [];
  const box = boundsOf(chains);
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const count = Math.floor(recipe.droplets * between(spatter, 0, 2) + spatter() * 0.5);
  for (let k = 0; k < count; k += 1) {
    const angle = spatter() * Math.PI * 2;
    const reachX = (box.x1 - box.x0) / 2 + between(spatter, 0.12, 0.55) * size;
    const reachY = (box.y1 - box.y0) / 2 + between(spatter, 0.12, 0.55) * size;
    const x = cx + Math.cos(angle) * reachX;
    const y = cy + Math.sin(angle) * reachY;
    const r = r0 * between(spatter, 0.18, 0.7);
    if (x - r < area.x || x + r > area.x + area.w || y - r < area.y || y + r > area.y + area.h) continue;
    const drop: Chain = [{ x, y, r }];
    if (spatter() < 0.4) {
      // A tail thinning toward the letter it flew from.
      const tx = cx - x;
      const ty = cy - y;
      const tl = Math.hypot(tx, ty) || 1;
      for (let s = 1; s <= 4; s += 1) drop.push({ x: x + (tx / tl) * r * s * 0.7, y: y + (ty / tl) * r * s * 0.7, r: r * (1 - s * 0.2) });
    }
    droplets.push(drop);
  }
  return { chains, strokes, droplets };
}

/** The box around beads, their radii included. */
export function boundsOf(chains: Chain[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const chain of chains) {
    for (const b of chain) {
      x0 = Math.min(x0, b.x - b.r);
      y0 = Math.min(y0, b.y - b.r);
      x1 = Math.max(x1, b.x + b.r);
      y1 = Math.max(y1, b.y + b.r);
    }
  }
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : { x0: 0, y0: 0, x1: 0, y1: 0 };
}
