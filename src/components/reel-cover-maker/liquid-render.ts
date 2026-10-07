/**
 * Letters made of paste: from beads to a field, and from a field to light.
 *
 * Each chain of beads is a shape: the union of tapered capsules between its
 * beads, measured exactly as a signed distance (positive inside). Chains
 * join by a smooth union, so where two strokes come close the paste bridges
 * into a fillet, as liquid does, while each stroke on its own stays as
 * drawn. From that distance comes how high the paste stands at each pixel:
 *
 * - "gloss": a rounded tube of gel, as sauce from a bottle sits on a plate;
 * - "flat": the shape alone, one colour edge to edge, with no light,
 *   shadow or texture (Pasty Flat).
 *
 * The field (distance, height, colour, tone) is what the worker makes, once
 * per title; light is laid on it afterwards (liquid-gl.ts on the GPU, or
 * `shadeField` here where there is none), so a change of colour is light
 * again, never paste again.
 *
 * Pure: plain typed arrays in and out, so it runs in a worker, and in the
 * tests.
 */

import type { Bead, Chain } from "@/components/reel-cover-maker/liquid";
import { rgb } from "@/components/reel-cover-maker/palettes";

export type Finish = "gloss" | "flat";

export interface LiquidPaint {
  chains: Chain[];
  /** Each chain's colour, as an index into the colours it is lit with, and how much lighter or darker (1 is as is). */
  colourOf: number[];
  tone: number[];
  finish: Finish;
  /** How far apart two strokes may be and still bridge, in pixels of the picture. */
  pool: number;
  seed: number;
}

export interface LiquidTarget {
  /** The canvas, in its own pixels. */
  width: number;
  height: number;
  /** Canvas pixels per pixel of the picture, and the picture's point at the canvas's top left. */
  scale: number;
  origin: { x: number; y: number };
}

/**
 * Four 16-bit numbers a pixel: the signed distance into the paste
 * ((d + 128) * 256), how high it stands (h * 256), the colour's index, and
 * its tone (* 1000). Integers, so a GPU reads them exactly.
 */
export interface LiquidField {
  x: number;
  y: number;
  w: number;
  h: number;
  data: Uint16Array<ArrayBuffer>;
  /** A typical stroke's radius, in canvas pixels: how far light and shadow reach. */
  radius: number;
  finish: Finish;
}

export interface LiquidImage {
  /** Where the pixels go on the canvas, and RGBA for them, not premultiplied, as ImageData wants. */
  x: number;
  y: number;
  w: number;
  h: number;
  data: Uint8ClampedArray<ArrayBuffer>;
}

const NONE = -1e6;
export const DEPTH_OFFSET = 128;

/** The signed distance (positive inside) from (px, py) to the tapered capsule between two beads. */
export function capsuleDepth(px: number, py: number, a: Bead, b: Bead): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const h = Math.hypot(dx, dy);
  if (h < 1e-6 || Math.abs(a.r - b.r) >= h) {
    return Math.max(a.r - Math.hypot(px - a.x, py - a.y), b.r - Math.hypot(px - b.x, py - b.y));
  }
  // Into the capsule's frame: y along it from a, x across.
  const ux = dx / h;
  const uy = dy / h;
  const ly = (px - a.x) * ux + (py - a.y) * uy;
  const lx = Math.abs((px - a.x) * -uy + (py - a.y) * ux);
  const s = (a.r - b.r) / h;
  const c = Math.sqrt(1 - s * s);
  const k = -s * lx + c * ly;
  if (k < 0) return a.r - Math.hypot(lx, ly);
  if (k > c * h) return b.r - Math.hypot(lx, ly - h);
  return a.r - (c * lx + s * ly);
}

/** The larger of two depths, rounded where they are within `k` of each other: a smooth union. */
export function smoothMax(a: number, b: number, k: number): number {
  if (k <= 0) return Math.max(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
}

/**
 * Three box blurs of `radius`, across then down: close to a Gaussian, in
 * place. Each row or column is blurred three times between two lines of
 * its own and written back once: going back to `values` between blurs, a
 * column at a time, cost more than the blurring.
 */
export function boxBlur(values: Float32Array, w: number, h: number, radius: number): void {
  if (radius < 1) return;
  let line = new Float32Array(Math.max(w, h));
  let next = new Float32Array(Math.max(w, h));
  const span = radius * 2 + 1;
  const pass = (count: number, length: number, stride: number, step: number) => {
    const last = length - 1;
    for (let c = 0; c < count; c += 1) {
      const start = c * stride;
      for (let k = 0; k < length; k += 1) line[k] = values[start + k * step];
      for (let repeat = 0; repeat < 3; repeat += 1) {
        let sum = 0;
        for (let k = -radius; k <= radius; k += 1) sum += line[Math.min(last, Math.max(0, k))];
        for (let k = 0; k < length; k += 1) {
          next[k] = sum / span;
          sum += line[Math.min(last, k + radius + 1)] - line[Math.max(0, k - radius)];
        }
        [line, next] = [next, line];
      }
      for (let k = 0; k < length; k += 1) values[start + k * step] = line[k];
    }
  };
  pass(h, w, w, 1);
  pass(w, h, 1, w);
}

/** The paste as a field for one canvas: where it is, how deep and how high, in what colour. */
export function liquidField(paint: LiquidPaint, target: LiquidTarget): LiquidField | null {
  const { scale, origin } = target;
  const k = paint.pool * scale;
  const chains: Chain[] = paint.chains
    .filter((c) => c.length > 0)
    .map((c) => c.map((b) => ({ x: (b.x - origin.x) * scale, y: (b.y - origin.y) * scale, r: b.r * scale })));
  if (!chains.length) return null;
  const radii = chains.flatMap((c) => c.map((b) => b.r)).sort((p, q) => p - q);
  const typical = Math.max(0.5, radii[Math.floor(radii.length / 2)]);

  // Room round the paste for the light and shadow it throws on the ground,
  // and, for the capsules, as far out as the bridging and the shadow look.
  const margin = Math.ceil(k + typical * 2.6 + 4);
  const reachOut = Math.ceil(Math.max(k, typical * 2.4) + 2);

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
  const rx = Math.max(0, Math.floor(x0 - margin));
  const ry = Math.max(0, Math.floor(y0 - margin));
  const rw = Math.min(target.width, Math.ceil(x1 + margin)) - rx;
  const rh = Math.min(target.height, Math.ceil(y1 + margin)) - ry;
  if (rw <= 0 || rh <= 0) return null;
  const n = rw * rh;

  // Distance into the paste, the radius of the stroke it came from, and which chain it is.
  const depth = new Float32Array(n).fill(NONE);
  const radius = new Float32Array(n);
  const owner = new Int32Array(n);
  const tileDepth = new Float32Array(n);
  const tileRadius = new Float32Array(n);

  chains.forEach((chain, chainIndex) => {
    // This chain alone, hard union of its capsules, in a tile of its own.
    let cx0 = Infinity;
    let cy0 = Infinity;
    let cx1 = -Infinity;
    let cy1 = -Infinity;
    for (const b of chain) {
      cx0 = Math.min(cx0, b.x - b.r);
      cy0 = Math.min(cy0, b.y - b.r);
      cx1 = Math.max(cx1, b.x + b.r);
      cy1 = Math.max(cy1, b.y + b.r);
    }
    const tx0 = Math.max(rx, Math.floor(cx0 - reachOut));
    const ty0 = Math.max(ry, Math.floor(cy0 - reachOut));
    const tx1 = Math.min(rx + rw, Math.ceil(cx1 + reachOut));
    const ty1 = Math.min(ry + rh, Math.ceil(cy1 + reachOut));
    for (let y = ty0; y < ty1; y += 1) tileDepth.fill(NONE, (y - ry) * rw + (tx0 - rx), (y - ry) * rw + (tx1 - rx));
    const segments = chain.length === 1 ? [[chain[0], chain[0]]] : chain.slice(1).map((b, i) => [chain[i], b]);
    for (const [a, b] of segments) {
      const reach = Math.max(a.r, b.r) + reachOut;
      const sx0 = Math.max(tx0, Math.floor(Math.min(a.x, b.x) - reach));
      const sy0 = Math.max(ty0, Math.floor(Math.min(a.y, b.y) - reach));
      const sx1 = Math.min(tx1, Math.ceil(Math.max(a.x, b.x) + reach));
      const sy1 = Math.min(ty1, Math.ceil(Math.max(a.y, b.y) + reach));
      const ux = b.x - a.x;
      const uy = b.y - a.y;
      const span = ux * ux + uy * uy || 1;
      const big = Math.max(a.r, b.r);
      for (let y = sy0; y < sy1; y += 1) {
        const row = (y - ry) * rw - rx;
        const py = y + 0.5;
        const oy = py - a.y;
        for (let x = sx0; x < sx1; x += 1) {
          const i = row + x;
          const ox = x + 0.5 - a.x;
          const t = Math.min(1, Math.max(0, (ox * ux + oy * uy) / span));
          // The capsule lies inside a round one of its larger radius, so it
          // is no deeper here than that radius less the distance to its
          // spine: where even that is no deeper than what is here already
          // (from the beads before it, at most of the pixels it reaches),
          // it changes nothing, and its exact depth is not worked out.
          const room = big - tileDepth[i] + 1e-3;
          if (room <= 0) continue;
          const ex = ox - ux * t;
          const ey = oy - uy * t;
          if (ex * ex + ey * ey >= room * room) continue;
          const d = capsuleDepth(x + 0.5, py, a, b);
          if (d > tileDepth[i]) {
            tileDepth[i] = d;
            // The radius where this point lies along the capsule: the same
            // at a bead from either side, so the height has no seam there,
            // and a blob stands as tall as it is wide.
            tileRadius[i] = a.r + (b.r - a.r) * t;
          }
        }
      }
    }
    // Into the whole, smoothly.
    for (let y = ty0; y < ty1; y += 1) {
      const row = (y - ry) * rw - rx;
      for (let x = tx0; x < tx1; x += 1) {
        const i = row + x;
        const t = tileDepth[i];
        if (t <= NONE) continue;
        const d = depth[i];
        if (t >= d) {
          radius[i] = tileRadius[i];
          owner[i] = chainIndex;
        }
        depth[i] = d <= NONE ? t : smoothMax(d, t, k);
      }
    }
  });

  // A gel's radius smoothed across the paste before it is stood up: which
  // capsule is deepest flips from one to the next where a stroke swells
  // into a ball, and the radius read off each would put a crease across
  // the neck. Weighted by the paste alone, so the ground's nothing never
  // thins an edge.
  {
    const weight = new Float32Array(n);
    const sum = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      if (depth[i] <= 0) continue;
      weight[i] = 1;
      sum[i] = radius[i];
    }
    const reach = Math.max(1, Math.round(typical * 0.3));
    boxBlur(sum, rw, rh, reach);
    boxBlur(weight, rw, rh, reach);
    for (let i = 0; i < n; i += 1) if (depth[i] > 0 && weight[i] > 1e-3) radius[i] = sum[i] / weight[i];
  }

  // How high the paste stands.
  const height = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const d = depth[i];
    if (d <= 0) continue;
    const r = Math.max(0.5, radius[i]);
    // A tube of gel: round, a little squashed, as sauce sits. (Flat paste is not lit, so stands no height.)
    const f = Math.min(d, r);
    height[i] = paint.finish === "flat" ? 0 : 0.88 * Math.sqrt(Math.max(0, 2 * r * f - f * f));
  }
  // A light blur takes out the creases where strokes cross.
  boxBlur(height, rw, rh, Math.max(1, Math.round(typical * 0.12)));

  const data = new Uint16Array(n * 4);
  for (let i = 0; i < n; i += 1) {
    const d = Math.max(-DEPTH_OFFSET, Math.min(DEPTH_OFFSET - 1, depth[i]));
    data[i * 4] = Math.round((d + DEPTH_OFFSET) * 256);
    data[i * 4 + 1] = Math.round(Math.min(255, Math.max(0, depth[i] > 0 ? height[i] : 0)) * 256);
    data[i * 4 + 2] = paint.colourOf[owner[i]] ?? 0;
    data[i * 4 + 3] = Math.round(Math.min(2, Math.max(0, paint.tone[owner[i]] ?? 1)) * 1000);
  }
  return { x: rx, y: ry, w: rw, h: rh, data, radius: typical, finish: paint.finish };
}

export interface Shading {
  colours: string[];
  /** The ground the paste sits on, drawn into the picture with its shadows; null for paste alone on a transparent ground. */
  ground: string | null;
  /**
   * With no ground drawn: the ground the paste is lit as lying on all the
   * same (a clear cover's chosen one), for what its gel reflects and how
   * its shadow is coloured. Null or absent: a neutral table, as on a photo.
   */
  under?: string | null;
  /**
   * With no ground: the shadow the paste casts, instead of the paste. With
   * no `under`, what to multiply the picture under it by (white where it
   * falls on nothing), so it darkens a photo as it darkened the ground.
   * With `under`, a clear stain to lay over whatever the cover is put on:
   * as dark as the darkening, so on `under` itself it is exactly the
   * shadow drawn on the ground, and grey shadow anywhere is exact.
   */
  shadow?: boolean;
}

/**
 * A shadow as a clear stain, from the ground it is seen on and that ground
 * as the shadow leaves it (each channel 0 to 1, in the display's values):
 * its alpha the most it darkens a channel, its colour (premultiplied) the
 * rest of the tint, so laid over `under` it is `shadowed` exactly, and
 * over any other ground darkens it as much.
 */
export function stain(shadowed: [number, number, number], under: [number, number, number]): { rgb: [number, number, number]; alpha: number } {
  const kept = [0, 1, 2].map((k) => (under[k] > 1e-6 ? Math.min(1, shadowed[k] / under[k]) : 1));
  const lo = Math.min(kept[0], kept[1], kept[2]);
  return { rgb: [0, 1, 2].map((k) => Math.max(0, shadowed[k] - under[k] * lo)) as [number, number, number], alpha: 1 - lo };
}

const toLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const toSrgb = (v: number) => {
  const c = Math.max(0, Math.min(1, v));
  return 255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
};

type Vec = [number, number, number];

function unit(x: number, y: number, z: number): Vec {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const step = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** The light, from the top left and fairly high: x right, y down the page, z toward the viewer. */
export const LIGHT = unit(-0.35, -0.5, 0.794);
const HALF = unit(LIGHT[0], LIGHT[1], LIGHT[2] + 1);
const BOX = unit(-0.4, -0.56, 0.72);
const HOT = unit(-0.36, -0.52, 0.77);
const STRIP = unit(0.8, 0.1, 0.59);

function ggx(nh: number, a: number): number {
  const a2 = a * a;
  const d = nh * nh * (a2 - 1) + 1;
  return a2 / (Math.PI * d * d);
}

/** The studio a wet surface reflects: as liquid-gl.ts has it. */
function studio(r: Vec, table: Vec): Vec {
  const lit = step(0.8, 0.9, dot(r, BOX)) * 5 + step(0.955, 0.985, dot(r, HOT)) * 7 + step(0.93, 0.975, dot(r, STRIP)) * 1.6;
  const room = 0.05 + 0.08 * clamp01(r[2]);
  const horizon = 1 - step(0, 0.45, r[2]);
  return [room + lit + table[0] * 0.55 * horizon, room + lit + table[1] * 0.55 * horizon, room + lit + table[2] * 0.55 * horizon];
}

/**
 * The field lit, here rather than on the GPU: for a browser without WebGL 2,
 * and for the tests. The same light as liquid-gl.ts, line for line, so a
 * cover looks alike either way.
 */
export function shadeField(field: LiquidField, shading: Shading): LiquidImage {
  const { w, h, data } = field;
  const out = new Uint8ClampedArray(w * h * 4);
  const colours = shading.colours.map((c) => rgb(c).map(toLinear) as Vec);
  const groundColour = shading.ground ? (rgb(shading.ground).map(toLinear) as Vec) : null;
  const underLinear = !groundColour && shading.under ? (rgb(shading.under).map(toLinear) as Vec) : null;
  const underColour = underLinear ? (underLinear.map((v) => toSrgb(v) / 255) as Vec) : null;
  const table: Vec = groundColour ?? (shading.under ? (rgb(shading.under).map(toLinear) as Vec) : [0.8, 0.8, 0.8]);
  const heightAt = (x: number, y: number) => data[(Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * 4 + 1] / 256;
  const radius = Math.max(0.5, field.radius);
  const finish = field.finish;
  const planar = Math.hypot(LIGHT[0], LIGHT[1]);
  const rise = LIGHT[2] / planar;
  const tx = LIGHT[0] / planar;
  const ty = LIGHT[1] / planar;
  const shadowAt = (x: number, y: number, height: number) => {
    let cut = 0;
    for (let i = 1; i <= 22; i += 1) {
      const t = i * radius * 0.13;
      const q = heightAt(x + Math.round(tx * t), y + Math.round(ty * t));
      if (q <= 0) continue;
      const soft = radius * 0.06 + t * 0.32;
      cut = Math.max(cut, step(-soft, soft, q - (height + t * rise)));
    }
    return cut;
  };
  let noise = (field.x * 73856093) ^ (field.y * 19349663);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      const d = data[i * 4] / 256 - DEPTH_OFFSET;
      const height = data[i * 4 + 1] / 256;
      const tone = data[i * 4 + 3] / 1000;
      const base = colours[Math.min(3, data[i * 4 + 2])] ?? colours[0];
      const C = base.map((v) => Math.min(1, Math.max(0.0005, v * tone))) as Vec;
      // The edge by the depth's own slope, as liquid-gl.ts reads it.
      const depthAt = (xx: number, yy: number) => data[(Math.min(h - 1, Math.max(0, yy)) * w + Math.min(w - 1, Math.max(0, xx))) * 4] / 256;
      // Capped at a pixel a pixel, as there: a steeper climb is the edge of where the depth was worked out, not of the paste.
      const slope = Math.min(1, Math.max(0.25, Math.hypot((depthAt(x + 1, y) - depthAt(x - 1, y)) / 2, (depthAt(x, y + 1) - depthAt(x, y - 1)) / 2)));
      // A pixel and a half of smooth edge, so a curve never steps.
      const e = clamp01((d / slope + 0.75) / 1.5);
      const cover = e * e * (3 - 2 * e);
      // What the ground (or a photo, multiplied by it) is darkened by here: the paste's shadow, as liquid-gl.ts has it.
      const shade = (): Vec => {
        if (finish === "flat" || cover >= 1) return [1, 1, 1];
        const cut = shadowAt(x, y, 0);
        const contact = Math.exp(-Math.max(0, -d) / (radius * 0.26));
        return C.map((c) => {
          const tint = 1 + (Math.min(1, c * 1.6) - 1) * 0.75;
          return (1 + (tint * 0.82 - 1) * cut * 0.7) * (1 - 0.22 * contact);
        }) as Vec;
      };
      if (shading.shadow) {
        const f = shade();
        const o = i * 4;
        if (underColour) {
          // A clear stain, dithered as the ground's shadow is, against banding.
          // Worked out from the ground as the shadow leaves it, in linear light as the ground's own is.
          const s = stain(f.map((v, k) => toSrgb((underLinear as Vec)[k] * v) / 255) as Vec, underColour);
          if (s.alpha <= 0.002) continue;
          noise = (Math.imul(noise ^ (noise >>> 15), 0x2c1b3c6d) + 0x9e3779b9) | 0;
          const alpha = clamp01(s.alpha + (((noise >>> 8) & 255) / 255 - 0.5) * (0.9 / 255));
          out[o] = Math.round((Math.min(alpha, s.rgb[0]) / alpha) * 255);
          out[o + 1] = Math.round((Math.min(alpha, s.rgb[1]) / alpha) * 255);
          out[o + 2] = Math.round((Math.min(alpha, s.rgb[2]) / alpha) * 255);
          out[o + 3] = Math.round(alpha * 255);
          continue;
        }
        out[o] = Math.round(toSrgb(f[0]));
        out[o + 1] = Math.round(toSrgb(f[1]));
        out[o + 2] = Math.round(toSrgb(f[2]));
        out[o + 3] = 255;
        continue;
      }
      let paste: Vec = [0, 0, 0];
      if (cover > 0) {
        if (finish === "flat") {
          paste = C;
        } else {
          const hx = (heightAt(x + 1, y) - heightAt(x - 1, y)) * 0.5;
          const hy = (heightAt(x, y + 1) - heightAt(x, y - 1)) * 0.5;
          const N = unit(-hx, -hy, 1);
          const nl = dot(N, LIGHT);
          const nh = Math.max(0, dot(N, HALF));
          const nv = Math.max(0, N[2]);
          const thick = Math.min(1.6, Math.max(0, height / (radius * 0.9)));
          const fresnel = 0.04 + 0.96 * (1 - nv) ** 5;
          const wrap = clamp01((nl + 0.4) / 1.4);
          const glow = 0.22 * step(0.35, 1.2, thick) * wrap;
          const r: Vec = [2 * N[2] * N[0], 2 * N[2] * N[1], 2 * N[2] * N[2] - 1];
          const env = studio(r, table);
          const spec = ggx(nh, 0.04) * 0.06;
          paste = C.map((c, k) => (c ** (0.75 + 0.9 * thick) * (0.16 + 0.84 * wrap) + c * c * glow) * (1 - fresnel) + env[k] * fresnel + spec) as Vec;
        }
      }
      const o = i * 4;
      if (!groundColour) {
        if (cover <= 0) continue;
        out[o] = toSrgb(paste[0]);
        out[o + 1] = toSrgb(paste[1]);
        out[o + 2] = toSrgb(paste[2]);
        out[o + 3] = Math.round(cover * 255);
        continue;
      }
      // The ground, in the paste's shadow.
      const f = shade();
      const ground = groundColour.map((g, k) => g * f[k]) as Vec;
      // Flat paste has no soft shadow to band, so no dither: one colour, exactly.
      const touched = finish !== "flat" && (cover > 0 || f.some((v) => v < 0.9995));
      noise = (Math.imul(noise ^ (noise >>> 15), 0x2c1b3c6d) + 0x9e3779b9) | 0;
      const dither = touched ? (((noise >>> 8) & 255) / 255 - 0.5) * 0.9 : 0;
      // Blended in the display's own values, as liquid-gl.ts blends it.
      for (let k = 0; k < 3; k += 1) out[o + k] = Math.round(toSrgb(ground[k]) * (1 - cover) + toSrgb(paste[k]) * cover + dither);
      out[o + 3] = 255;
    }
  }
  return { x: field.x, y: field.y, w, h, data: out };
}

/** The paste lit in one go: field, then light, here. */
export function renderLiquid(paint: LiquidPaint, target: LiquidTarget, shading: Shading): LiquidImage | null {
  const field = liquidField(paint, target);
  return field ? shadeField(field, shading) : null;
}
