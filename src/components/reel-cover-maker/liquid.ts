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
  /** The first or last letter of its word. */
  first?: boolean;
  last?: boolean;
  /** The character it draws, where a hand treats one its own way. */
  char?: string;
  /** The last letter of its whole run of words, where one swash goes. */
  final?: boolean;
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
  /**
   * A pen's thick and thin, where the hand has one: a brush pen's
   * ("pressure"), heavy on a downstroke and a hairline on an upstroke, or a
   * broad nib's ("nib"), heavy across its edge and thin along it, the edge
   * held `angle` radians above the horizontal. `thin` is a hairline's share
   * of the full weight. Worked out from the stroke's direction and smoothed
   * along it, so thick swells into thin with no step between.
   */
  pen?: { kind: "pressure" | "nib"; thin: number; angle?: number };
  /** How far a free end tapers to a point rather than ending round, 0 to 1. */
  taper?: number;
  /**
   * Curves drawn through a stroke's points (a centripetal Catmull and Rom
   * spline, sharp only where the stroke really turns back), rather than
   * corner cutting between them: for a font whose curves are coarse runs of
   * straight lines, which paste would otherwise follow corner by corner.
   */
  spline?: boolean;
  /**
   * Lowercase made taller, as a brush script's is: the x-height (in em) and
   * how much taller, ascenders drawn up to keep their tops; or, with
   * `ascend`, ascenders drawn that many times taller above it instead.
   */
  xHeight?: { at: number; boost: number; ascend?: number };
  /**
   * One slow swell a stroke, as a brush laid on and lifted: thinnest at
   * `neck` of the weight, as much as `amount` more at the swell, which sits
   * where a downstroke bottoms out (weight pools there) and anywhere along
   * any other stroke, spread over at least `reach` em. In place of the
   * pressure's quicker swelling and pinching.
   */
  swell?: { neck: number; amount: readonly [number, number]; reach: number };
  /** A drip's neck and drop, as shares of the stroke it falls from, where the hand fixes them. */
  dripShape?: { neck: number; drop: number };
  /**
   * A run's last letter, if a t: its crossbar swung on to the right by
   * `length` (in em), and how it ends: in a ball or a teardrop `ball` times
   * the bar's stroke, running off its end into a hanging drop that size,
   * or drawn off to a point as a brush flicks.
   */
  crossbar?: { length: number; ball: number; end?: "ball" | "teardrop" | "drip" | "taper" };
  /** The chance a free end swells into a ball, where not every one should: 0.45 to 0.7 when unset. */
  balls?: number;
  /** How far along a stroke an end's ball swells out of it, in radii: 2.6 when unset. */
  bulbReach?: number;
  /** The chance a stem's foot (an end pointing down) swells into a ball, where it differs from `balls`. */
  footBalls?: number;
  /**
   * The thickest a stroke may swell, as a share of the paste's radius, its
   * end balls included, approached softly so a swelling rounds off rather
   * than flattening: no stroke lumps where its swellings stack.
   */
  maxWeight?: number;
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

/** Points along a centripetal Catmull and Rom spline through `pts`, `steps` a span, both ends kept. */
function catmullRom(pts: [number, number][], steps: number): [number, number][] {
  if (pts.length < 3) return pts;
  const at = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  const out: [number, number][] = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const gap = (a: [number, number], b: [number, number]) => Math.max(1e-6, Math.hypot(b[0] - a[0], b[1] - a[1]) ** 0.5);
    const t1 = gap(p0, p1);
    const t2 = t1 + gap(p1, p2);
    const t3 = t2 + gap(p2, p3);
    for (let s = 0; s < steps; s += 1) {
      const t = t1 + ((t2 - t1) * s) / steps;
      const lerp = (a: [number, number], b: [number, number], ta: number, tb: number): [number, number] => [
        ((tb - t) / (tb - ta)) * a[0] + ((t - ta) / (tb - ta)) * b[0],
        ((tb - t) / (tb - ta)) * a[1] + ((t - ta) / (tb - ta)) * b[1],
      ];
      const a1 = lerp(p0, p1, 0, t1);
      const a2 = lerp(p1, p2, t1, t2);
      const a3 = lerp(p2, p3, t2, t3);
      out.push(lerp(lerp(a1, a2, 0, t2), lerp(a2, a3, t1, t3), t1, t2));
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/**
 * A stroke made smooth: split where it turns back on itself by more than
 * about 110 degrees (a cusp, which a spline would loop round), and a spline
 * drawn through each piece.
 */
export function smoothStroke(points: [number, number][]): [number, number][] {
  if (points.length < 3) return points;
  const pieces: [number, number][][] = [];
  let piece: [number, number][] = [points[0]];
  for (let i = 1; i < points.length; i += 1) {
    piece.push(points[i]);
    if (i < points.length - 1) {
      const [ax, ay] = points[i - 1];
      const [bx, by] = points[i];
      const [cx, cy] = points[i + 1];
      const u = Math.hypot(bx - ax, by - ay) || 1;
      const v = Math.hypot(cx - bx, cy - by) || 1;
      const turn = ((bx - ax) * (cx - bx) + (by - ay) * (cy - by)) / (u * v);
      if (turn < -0.34) {
        pieces.push(piece);
        piece = [points[i]];
      }
    }
  }
  pieces.push(piece);
  return pieces.flatMap((p, i) => catmullRom(p, 8).slice(i ? 1 : 0));
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

  // Lowercase drawn taller where the hand asks: the x-height zone stretched, ascenders drawn up to keep their tops.
  const tall = recipe.xHeight;
  const lift = (v: number) => {
    if (!tall || v >= 0) return v;
    const x = tall.at;
    const top = x * (1 + tall.boost);
    if (v >= -x) return v * (1 + tall.boost);
    if (tall.ascend) return -top - (-v - x) * tall.ascend;
    const cap = Math.max(top + 0.05, 0.7);
    return -top - ((-v - x) / Math.max(1e-6, cap - x)) * (cap - top);
  };
  // Every stroke as drawn, in the picture's pixels, so an end can be checked against the others.
  const placed: [number, number][][] = g.glyph.strokes.map((flat, index) => {
    let pts: [number, number][] = [];
    for (let i = 0; i < flat.length; i += 2) pts.push([flat[i], lift(flat[i + 1])]);
    if (recipe.spline) pts = smoothStroke(pts);
    return unsteady(pts, mixSeed(g.seed, index + 1), recipe, wave).map(([u, v]) => place(u, v));
  });

  placed.forEach((raw, index) => {
    const seed = mixSeed(g.seed, index + 1);
    const next = random(seed);
    // A dot (the i's, a full stop): one round ball, bigger than the stroke
    // (as big as a pen's full weight, where it has one).
    if (raw.length === 1 || (raw.length === 2 && Math.hypot(raw[1][0] - raw[0][0], raw[1][1] - raw[0][1]) < r0 * 0.6)) {
      chains.push([{ x: raw[0][0], y: raw[0][1], r: r0 * strength * (recipe.pen ? between(next, 0.85, 1.05) : recipe.swell ? between(next, 1.15, 1.4) : between(next, 1.35, 1.8)) }]);
      return;
    }
    const closed = Math.hypot(raw[0][0] - raw[raw.length - 1][0], raw[0][1] - raw[raw.length - 1][1]) < r0 * 0.5;
    // A pen's stroke is sampled closer, so its thick and thin change smoothly bead to bead.
    const { pts, at } = resample(chaikin(raw, recipe.smooth), Math.max(0.8, r0 * (recipe.pen ? 0.4 : 0.6)));
    const total = at[at.length - 1] || 1;
    // Only an end that stands free swells or drips: one that runs into
    // another stroke is a joint, and a joint pools by itself.
    const free = (x: number, y: number) =>
      !placed.some((o, j) => j !== index && o.some(([ox, oy]) => Math.hypot(ox - x, oy - y) < r0 * 1.6));
    type End = { kind: "plain" | "blob" | "drip"; size: number };
    // A mark's stroke (an apostrophe, a comma's tail) is too short to swell at both ends: it would read as a blob.
    const short = total < r0 * 3;
    // The swash's crossbar ends in the swash alone: a ball here as well would swell twice.
    const swashBar = !!recipe.crossbar && g.char === "t" && !!g.final && isBar(raw, r0);
    const endOf = (which: 0 | 1): End => {
      const i = which ? pts.length - 1 : 0;
      const [x, y] = pts[i];
      if (closed || short || swashBar || !free(x, y)) return { kind: "plain", size: 0 };
      const choose = random(mixSeed(seed, 0xe0 + which));
      // Pointing down: the foot of a stem, which may run on as a drip.
      const [px, py] = pts[which ? Math.max(0, i - 4) : Math.min(pts.length - 1, 4)];
      const down = y - py > Math.abs(x - px) * 1.4;
      if (down && choose() < recipe.drip) return { kind: "drip", size: 0 };
      const chance = down && recipe.footBalls !== undefined ? recipe.footBalls : (recipe.balls ?? (down ? 0.7 : 0.45));
      return choose() < chance ? { kind: "blob", size: recipe.bulb * between(choose, 0.4, 1) } : { kind: "plain", size: 0 };
    };
    const start = endOf(0);
    const end = endOf(1);
    const reach = r0 * (recipe.bulbReach ?? 2.6);
    const swell = r0 * 6;
    const weightAt = penWeights(pts, recipe.pen);
    // The stroke's one swell: where a downstroke bottoms out, else anywhere along it.
    const swellAt = (() => {
      const sw = recipe.swell;
      if (!sw) return null;
      const pick = random(mixSeed(seed, 0x5e1));
      let lowest = 0;
      for (let i = 1; i < pts.length; i += 1) if (pts[i][1] > pts[lowest][1]) lowest = i;
      const falls = pts[pts.length - 1][1] - pts[0][1] > Math.abs(pts[pts.length - 1][0] - pts[0][0]) * 0.5;
      const centre = falls ? at[lowest] : between(pick, 0.3, 0.8) * total;
      return { centre, amount: between(pick, sw.amount[0], sw.amount[1]), spread: Math.max(sw.reach * size, total * 0.22), neck: sw.neck };
    })();
    const taper = recipe.taper ?? 0;
    const freeStart = !closed && free(pts[0][0], pts[0][1]);
    const freeEnd = !closed && free(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    const floorR = r0 * (recipe.pen ? recipe.pen.thin * 0.6 : 0.4);
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
      let r = r0 * strength * weightAt[i] * (1 + recipe.pressure * 0.5 * noise1(seed, s / swell));
      if (swellAt) r *= swellAt.neck + swellAt.amount * Math.exp(-0.5 * ((s - swellAt.centre) / swellAt.spread) ** 2);
      if (!recipe.pen) r *= 1 - recipe.pressure * 0.18 * Math.sin(Math.PI * (s / total)) ** 2 * Math.min(1, total / (r0 * 10));
      r *= 1 + start.size * (1 - smoothstep(0, reach, s)) ** 2;
      r *= 1 + end.size * (1 - smoothstep(0, reach, total - s)) ** 2;
      // A free end drawn off to a point, as a brush leaves the paper.
      if (taper && freeStart) r *= 1 - taper * (1 - smoothstep(0, r0 * 4, s));
      if (taper && freeEnd) r *= 1 - taper * (1 - smoothstep(0, r0 * 4, total - s));
      if (recipe.maxWeight) r = softCap(r, r0 * recipe.maxWeight);
      return { x: x - (ty / tl) * sway, y: y + (tx / tl) * sway, r: Math.max(floorR, r) };
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
    const drop = recipe.dripShape?.drop ?? between(next, 1.05, 1.4);
    const neck = recipe.dripShape?.neck ?? between(next, 0.42, 0.62);
    const drip: Chain = [];
    // Closely sampled, so the drop swells out of the neck bead by bead rather than at a step.
    const steps = Math.max(8, Math.ceil(length / (d.from.r * 0.15)));
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

  // A run's last letter, if a t: its crossbar swung on to the right, a knob at its left end.
  if (recipe.crossbar && g.char === "t" && g.final) {
    const bar = chains.slice(0, strokes).findIndex((c) => c.length >= 2 && isBar(c.map((b) => [b.x, b.y]), r0));
    if (bar >= 0) {
      const c = chains[bar];
      const [a, b] = c[0].x < c[c.length - 1].x ? [c[0], c[c.length - 1]] : [c[c.length - 1], c[0]];
      // Sized by the bar's own stroke, its middle, never by an end.
      const stroke = [...c.map((q) => q.r)].sort((p, q) => p - q)[Math.floor(c.length / 2)];
      chains.push([b, ...swash(b, stroke, recipe.crossbar, size, r0)]);
      if (recipe.crossbar.end !== "taper") chains.push([{ x: a.x - a.r * 0.2, y: a.y, r: stroke * 1.3 }]);
    }
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

/** `r` held under `most`: unchanged to four fifths of it, then easing toward it, never past. */
function softCap(r: number, most: number): number {
  const knee = most * 0.8;
  if (r <= knee) return r;
  const over = r - knee;
  return knee + over / (1 + over / (most - knee));
}

/** Whether a stroke runs across more than it climbs, and far enough to be a t's crossbar. */
function isBar(points: readonly (readonly [number, number])[] | readonly number[][], r0: number): boolean {
  if (points.length < 2) return false;
  const [a, b] = [points[0], points[points.length - 1]];
  return Math.abs(b[1] - a[1]) < Math.abs(b[0] - a[0]) * 0.4 && Math.abs(b[0] - a[0]) > r0 * 2;
}

/**
 * A word's last t's crossbar swung on to the right from its end `b`, rising
 * as it goes, and ended as the hand ends it. A ball or a teardrop never
 * swells faster than about a quarter of the way along, so the drop grows out
 * of the bar as paste does rather than sitting on it like a ball on a stick.
 */
function swash(b: Bead, stroke: number, bar: NonNullable<PasteRecipe["crossbar"]>, size: number, r0: number): Chain {
  const end = bar.end ?? "ball";
  const out: Chain = [];
  const big = stroke * bar.ball;
  if (end === "taper") {
    // Off to a point, flicking up at the end as a brush lifts.
    const length = bar.length * size;
    const steps = Math.max(12, Math.ceil(length / (r0 * 0.15)));
    for (let k = 1; k <= steps; k += 1) {
      const t = k / steps;
      out.push({ x: b.x + length * t, y: b.y - length * (0.08 * t + 0.3 * t * t), r: Math.max(r0 * 0.12, stroke * (1 - 0.82 * smoothstep(0.15, 1, t))) });
    }
    return out;
  }
  if (end === "drip") {
    // Along the bar, over its end and down: the paste runs off and hangs in a drop.
    const across = bar.length * size;
    const fall = Math.max(big * 2.2, size * 0.2);
    const turn = Math.max(stroke * 1.2, across * 0.22);
    const path: [number, number][] = [];
    const n = Math.max(16, Math.ceil((across + fall) / (r0 * 0.15)));
    for (let k = 1; k <= n; k += 1) {
      const t = k / n;
      const s = t * (across + fall);
      if (s <= across - turn) path.push([b.x + s, b.y - s * 0.12]);
      else if (s <= across - turn + (Math.PI / 2) * turn) {
        const q = (s - (across - turn)) / turn;
        const cx = b.x + across - turn;
        const cy = b.y - (across - turn) * 0.12 + turn;
        path.push([cx + Math.sin(q) * turn, cy - Math.cos(q) * turn]);
      } else {
        const d = s - (across - turn) - (Math.PI / 2) * turn;
        path.push([b.x + across, b.y - (across - turn) * 0.12 + turn + d]);
      }
    }
    path.forEach(([x, y], k) => {
      const t = (k + 1) / path.length;
      // Thinning over the turn, then swelling slowly into the drop at the bottom.
      const neck = 1 - 0.3 * smoothstep(0.2, 0.6, t);
      out.push({ x, y, r: stroke * neck + (big - stroke * neck) * smoothstep(0.62, 1, t) });
    });
    const tip = out[out.length - 1];
    tip.y -= tip.r * 0.4;
    return out;
  }
  // A ball or a teardrop: along the bar, then swelling out of it. A ball
  // swells over a short way, a teardrop over as long as keeps its sides to
  // a quarter of a radius a radius along.
  const grow = end === "teardrop" ? ((big - stroke) * 1.5) / 0.26 : (big - stroke) * 2.2;
  const length = Math.max(bar.length * size, grow + big * 0.5);
  const steps = Math.max(12, Math.ceil(length / (r0 * 0.15)));
  for (let k = 1; k <= steps; k += 1) {
    const t = k / steps;
    const s = t * length;
    const r = stroke + (big - stroke) * smoothstep(length - big * 0.5 - grow, length - big * 0.5, s);
    out.push({ x: b.x + s, y: b.y - s * 0.18, r });
  }
  return out;
}

/**
 * Each point's share of the pen's full weight along a stroke: from the
 * stroke's direction there (over a few points either side, so a wobble is
 * not a swell), then smoothed along its length four times, so a downstroke
 * swells out of a hairline and back with no step. One throughout, with no pen.
 */
export function penWeights(pts: [number, number][], pen: PasteRecipe["pen"]): number[] {
  if (!pen || pts.length < 2) return pts.map(() => 1);
  const edge = pen.angle ?? 0.6;
  // The nib's edge, rising to the right: y runs down the page.
  const ex = Math.cos(edge);
  const ey = -Math.sin(edge);
  let f = pts.map((_, i) => {
    const [ax, ay] = pts[Math.max(0, i - 2)];
    const [bx, by] = pts[Math.min(pts.length - 1, i + 2)];
    const l = Math.hypot(bx - ax, by - ay) || 1;
    const tx = (bx - ax) / l;
    const ty = (by - ay) / l;
    // A brush is pressed going down the page, and eases off going up, a
    // steep upstroke keeping a fifth of its weight; a nib is widest moving
    // across its edge.
    if (pen.kind === "pressure") return Math.max(smoothstep(-0.35, 0.75, ty), 0.2 * smoothstep(0.6, 0.95, -ty));
    return Math.abs(tx * ey - ty * ex);
  });
  // Where the stroke turns back on itself (a loop's top, a hairpin): a pen lifts there, so it thins.
  const turns = pts.map((_, i) => {
    if (i < 2 || i > pts.length - 3) return false;
    const [ax, ay] = pts[i - 2];
    const [bx, by] = pts[i];
    const [cx, cy] = pts[i + 2];
    const u = Math.hypot(bx - ax, by - ay) || 1;
    const v = Math.hypot(cx - bx, cy - by) || 1;
    return ((bx - ax) * (cx - bx) + (by - ay) * (cy - by)) / (u * v) < -0.3;
  });
  const kernel = [1, 4, 6, 4, 1];
  for (let pass = 0; pass < 6; pass += 1) {
    f = f.map((_, i) => {
      let sum = 0;
      let weight = 0;
      kernel.forEach((k, j) => {
        const at = i + j - 2;
        if (at < 0 || at >= f.length) return;
        sum += f[at] * k;
        weight += k;
      });
      return sum / weight;
    });
  }
  // Thinnest at the turn itself, easing back to full over a few points either side, so the neck has no step.
  const turnAt = turns.flatMap((t, i) => (t ? [i] : []));
  f = f.map((v, i) => {
    if (!turnAt.length) return v;
    const d = Math.min(...turnAt.map((j) => Math.abs(i - j)));
    return Math.min(v, 0.2 + 0.8 * smoothstep(1, 7, d));
  });
  return f.map((v) => pen.thin + (1 - pen.thin) * v);
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
