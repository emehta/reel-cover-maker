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
  seed: number;
}

export interface PasteRecipe {
  /** The paste's radius, in em of the glyph's height. */
  weight: number;
  /** How much a stroke swells and pinches along its length, 0 to 1. */
  pressure: number;
  /** How much bigger a stroke is where it starts and stops, 0 to 1. */
  bulb: number;
  /** How far the centre line strays sideways, in em. */
  wobble: number;
  /** Passes of corner cutting: the plotter's sharp corners made liquid. */
  smooth: number;
  /** The chance a glyph drips, and how far a drip runs, in em. */
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
 * The paste for one glyph. `floor` is the lowest a drip may run to, and
 * `area` where droplets may land, both in pixels of the picture.
 */
export function pasteGlyph(
  g: PlacedGlyph,
  recipe: PasteRecipe,
  floor: number,
  area: { x: number; y: number; w: number; h: number },
): GlyphPaste {
  const place = placer(g);
  const size = g.sy;
  const r0 = recipe.weight * size;
  const next = random(g.seed);
  const strength = between(next, 0.85, 1.18);
  const chains: Chain[] = [];
  const lows: { x: number; y: number; r: number; dx: number }[] = [];

  // Every stroke in the picture's pixels, so an end can be checked against the others.
  const others: [number, number][][] = g.glyph.strokes.map((flat) => {
    const pts: [number, number][] = [];
    for (let i = 0; i < flat.length; i += 2) pts.push(place(flat[i], flat[i + 1]));
    return pts;
  });

  g.glyph.strokes.forEach((_, index) => {
    const seed = mixSeed(g.seed, index + 1);
    const raw = others[index];
    // A dot (the i's, a full stop): one round bead.
    if (raw.length === 1 || (raw.length === 2 && Math.hypot(raw[1][0] - raw[0][0], raw[1][1] - raw[0][1]) < r0 * 0.6)) {
      chains.push([{ x: raw[0][0], y: raw[0][1], r: r0 * strength * between(next, 1.15, 1.45) }]);
      return;
    }
    const closed = Math.hypot(raw[0][0] - raw[raw.length - 1][0], raw[0][1] - raw[raw.length - 1][1]) < r0 * 0.5;
    const { pts, at } = resample(chaikin(raw, recipe.smooth), Math.max(0.8, r0 * 0.7));
    const total = at[at.length - 1] || 1;
    // Only an end that stands free swells: one that runs into another
    // stroke is a joint, and a joint pools by itself. Not every free end
    // swells either, or the letter reads as a string of beads.
    const free = (x: number, y: number) =>
      !others.some((o, j) => j !== index && o.some(([ox, oy]) => Math.hypot(ox - x, oy - y) < r0 * 1.6));
    const swell = () => (next() < 0.55 ? recipe.bulb * between(next, 0.3, 1) : 0);
    const bulbStart = closed || !free(raw[0][0], raw[0][1]) ? 0 : swell();
    const bulbEnd = closed || !free(raw[raw.length - 1][0], raw[raw.length - 1][1]) ? 0 : swell();
    const reach = r0 * 2.4;
    const wave = r0 * 7;
    const chain: Chain = pts.map(([x, y], i) => {
      // The normal to the stroke here, for the wobble.
      const [ax, ay] = pts[Math.max(0, i - 1)];
      const [bx, by] = pts[Math.min(pts.length - 1, i + 1)];
      const tx = bx - ax;
      const ty = by - ay;
      const tl = Math.hypot(tx, ty) || 1;
      const sway = recipe.wobble * size * noise1(seed ^ 0x51ed, at[i] / wave);
      const s = at[i];
      let r = r0 * strength * (1 + recipe.pressure * 0.42 * noise1(seed, s / (wave * 0.8)));
      r *= 1 + bulbStart * 0.55 * (1 - smoothstep(0, reach, s)) ** 2;
      r *= 1 + bulbEnd * 0.55 * (1 - smoothstep(0, reach, total - s)) ** 2;
      return { x: x - (ty / tl) * sway, y: y + (tx / tl) * sway, r: Math.max(r0 * 0.35, r) };
    });
    chains.push(chain);

    // Where a drip could fall from: the stroke's low points that lie
    // nearly level (a drip leaves the underside of a curve or a bar), and a
    // stroke's end that points downward.
    for (let i = 1; i < chain.length - 1; i += 1) {
      const b = chain[i];
      if (b.y >= chain[i - 1].y && b.y >= chain[i + 1].y && Math.abs(chain[i + 1].y - chain[i - 1].y) < b.r * 0.5) {
        lows.push({ x: b.x, y: b.y, r: b.r, dx: 0 });
      }
    }
    if (!closed) {
      for (const [end, before] of [
        [chain[chain.length - 1], chain[Math.max(0, chain.length - 4)]],
        [chain[0], chain[Math.min(chain.length - 1, 3)]],
      ] as const) {
        if (end.y - before.y > Math.abs(end.x - before.x) * 1.2) lows.push({ x: end.x, y: end.y, r: end.r, dx: end.x - before.x });
      }
    }
  });

  const strokes = chains.length;
  // Drips, most often one, from the lowest candidates first.
  if (lows.length && next() < recipe.drip) {
    lows.sort((a, b) => b.y - a.y);
    const count = next() < 0.25 ? 2 : 1;
    for (let d = 0; d < Math.min(count, lows.length); d += 1) {
      const from = lows[Math.floor(next() * Math.min(lows.length, 3))];
      const room = floor - (from.y + from.r);
      const length = Math.min(room, between(next, recipe.dripLength[0], recipe.dripLength[1]) * size);
      if (length < from.r * 1.2) continue;
      const seed = mixSeed(g.seed, 0xd41f + d);
      const drip: Chain = [];
      const steps = Math.max(2, Math.ceil(length / (from.r * 0.4)));
      for (let k = 0; k <= steps; k += 1) {
        const t = k / steps;
        const neck = 1 - 0.45 * smoothstep(0, 0.75, t);
        const bead = t > 0.82 ? 0.55 + 0.5 * smoothstep(0.82, 1, t) : neck;
        drip.push({
          x: from.x + from.dx * 0.15 * t + noise1(seed, t * 2.2) * from.r * 0.25,
          y: from.y + t * length,
          r: from.r * bead * 0.95,
        });
      }
      chains.push(drip);
    }
  }

  // Droplets: a few spatters around the glyph, some with a tail toward it.
  const droplets: Chain[] = [];
  const box = boundsOf(chains);
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const count = Math.floor(recipe.droplets * between(next, 0, 2) + next() * 0.5);
  for (let k = 0; k < count; k += 1) {
    const angle = next() * Math.PI * 2;
    const reachX = (box.x1 - box.x0) / 2 + between(next, 0.12, 0.55) * size;
    const reachY = (box.y1 - box.y0) / 2 + between(next, 0.12, 0.55) * size;
    const x = cx + Math.cos(angle) * reachX;
    const y = cy + Math.sin(angle) * reachY;
    const r = r0 * between(next, 0.18, 0.62);
    if (x - r < area.x || x + r > area.x + area.w || y - r < area.y || y + r > area.y + area.h) continue;
    const drop: Chain = [{ x, y, r }];
    if (next() < 0.4) {
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
