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
 * - "matte": thick paste spread with a knife, flat on top with a rounded
 *   shoulder, swept in broad swaths along each stroke with a ridge where
 *   the blade lifted, lumpy, its edge ragged;
 * - "flat": the shape alone.
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
import { fbm2, noise2 } from "@/components/reel-cover-maker/noise";
import { rgb } from "@/components/reel-cover-maker/palettes";

export type Finish = "gloss" | "flat" | "matte";

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

/** Three box blurs of `radius`, across then down: close to a Gaussian, in place. */
export function boxBlur(values: Float32Array, w: number, h: number, radius: number): void {
  if (radius < 1) return;
  const line = new Float32Array(Math.max(w, h));
  const pass = (count: number, length: number, stride: number, step: number) => {
    for (let c = 0; c < count; c += 1) {
      const start = c * stride;
      for (let k = 0; k < length; k += 1) line[k] = values[start + k * step];
      for (let repeat = 0; repeat < 3; repeat += 1) {
        let sum = 0;
        const span = radius * 2 + 1;
        for (let k = -radius; k <= radius; k += 1) sum += line[Math.min(length - 1, Math.max(0, k))];
        for (let k = 0; k < length; k += 1) {
          values[start + k * step] = sum / span;
          sum += line[Math.min(length - 1, k + radius + 1)] - line[Math.max(0, k - radius)];
        }
        for (let k = 0; k < length; k += 1) line[k] = values[start + k * step];
      }
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
      for (let y = sy0; y < sy1; y += 1) {
        const row = (y - ry) * rw - rx;
        const py = y + 0.5;
        for (let x = sx0; x < sx1; x += 1) {
          const d = capsuleDepth(x + 0.5, py, a, b);
          const i = row + x;
          if (d > tileDepth[i]) {
            tileDepth[i] = d;
            // The radius where this point lies along the capsule: the same
            // at a bead from either side, so the height has no seam there,
            // and a blob stands as tall as it is wide.
            const t = Math.min(1, Math.max(0, ((x + 0.5 - a.x) * ux + (py - a.y) * uy) / span));
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

  const matte = paint.finish === "matte";
  // A matte paste's edge is ragged where the knife left it: lumps and
  // nicks the size of the paste's own crumbs, never a fuzz finer than that.
  if (matte) {
    for (let i = 0; i < n; i += 1) {
      if (depth[i] <= -typical * 2) continue;
      const x = (i % rw) + rx;
      const y = ((i / rw) | 0) + ry;
      depth[i] +=
        typical * 0.13 * fbm2(paint.seed ^ 0x2f, x / (typical * 0.8), y / (typical * 0.8)) +
        typical * 0.012 * noise2(paint.seed ^ 0x51, x / (typical * 0.22), y / (typical * 0.22));
    }
  }

  // A gel's radius smoothed across the paste before it is stood up: which
  // capsule is deepest flips from one to the next where a stroke swells
  // into a ball, and the radius read off each would put a crease across
  // the neck. Weighted by the paste alone, so the ground's nothing never
  // thins an edge.
  if (!matte) {
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
    if (matte) {
      // Flat on top, a rounded shoulder; across it the knife's broad
      // swaths, a thin ridge here and there where the blade lifted, and
      // the paste's own soft lumps. All from where the point is, never
      // from which stroke it is on, so the surface runs on unbroken
      // across a curve and where strokes meet.
      const x = (i % rw) + rx;
      const y = ((i / rw) | 0) + ry;
      const t = typical;
      const wx = x / (t * 2.4) + 0.7 * noise2(paint.seed ^ 0x1d, x / (t * 3.4), y / (t * 3.4));
      const wy = y / (t * 2.4) + 0.7 * noise2(paint.seed ^ 0x2e, x / (t * 3.4), y / (t * 3.4));
      // A knife spreads paste to one thickness, whatever stroke it is on,
      // so where two strokes meet there is no step between them.
      const shoulder = Math.min(1, d / (t * 0.7));
      const top = t * 0.72 * Math.sqrt(shoulder * (2 - shoulder));
      const swath = noise2(paint.seed, wx, wy);
      const ridge = (1 - Math.abs(noise2(paint.seed ^ 0x33, wx * 0.8, wy * 0.8))) ** 12;
      const lumps = fbm2(paint.seed ^ 0x77, x / (t * 0.95), y / (t * 0.95));
      height[i] = top + shoulder * (t * 0.13 * swath + t * 0.05 * ridge + t * 0.035 * lumps);
    } else {
      // A tube of gel: round, a little squashed, as sauce sits.
      const f = Math.min(d, r);
      height[i] = 0.88 * Math.sqrt(Math.max(0, 2 * r * f - f * f));
    }
  }
  // A light blur takes out the creases where strokes cross.
  boxBlur(height, rw, rh, Math.max(1, Math.round(typical * (matte ? 0.05 : 0.12))));

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
  const table: Vec = groundColour ?? [0.8, 0.8, 0.8];
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
      const slope = Math.max(0.25, Math.hypot((depthAt(x + 1, y) - depthAt(x - 1, y)) / 2, (depthAt(x, y + 1) - depthAt(x, y - 1)) / 2));
      // A pixel and a half of smooth edge, so a curve never steps.
      const e = clamp01((d / slope + 0.75) / 1.5);
      const cover = e * e * (3 - 2 * e);
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
          if (finish === "gloss") {
            const wrap = clamp01((nl + 0.4) / 1.4);
            const glow = 0.22 * step(0.35, 1.2, thick) * wrap;
            const r: Vec = [2 * N[2] * N[0], 2 * N[2] * N[1], 2 * N[2] * N[2] - 1];
            const env = studio(r, table);
            const spec = ggx(nh, 0.04) * 0.06;
            paste = C.map((c, k) => (c ** (0.75 + 0.9 * thick) * (0.16 + 0.84 * wrap) + c * c * glow) * (1 - fresnel) + env[k] * fresnel + spec) as Vec;
          } else {
            const k = Math.max(2, Math.floor(radius * 0.12));
            const around = (heightAt(x + k, y) + heightAt(x - k, y) + heightAt(x, y + k) + heightAt(x, y - k)) * 0.25;
            const cavity = Math.min(1.06, Math.max(0.6, 1 - (around - height) / Math.max(0.5, radius * 0.09)));
            const self = shadowAt(x, y, height);
            const wrap = clamp01((nl + 0.25) / 1.25);
            const sheen = ggx(nh, 0.32) * 0.09 * (1 - self);
            paste = C.map((c) => c * (0.26 + 0.86 * wrap * (1 - 0.75 * self)) * cavity * (1 - fresnel * 0.5) + sheen + 0.06 * fresnel) as Vec;
          }
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
      // The ground, in the paste's shadow, as liquid-gl.ts has it.
      let ground: Vec = groundColour;
      let touched = cover > 0;
      if (finish !== "flat" && cover < 1) {
        const cut = shadowAt(x, y, 0);
        const contact = Math.exp(-Math.max(0, -d) / (radius * 0.26));
        if (finish === "gloss") {
          ground = ground.map((g, k) => {
            const tint = 1 + (Math.min(1, C[k] * 1.6) - 1) * 0.75;
            return g * (1 + (tint * 0.82 - 1) * cut * 0.7) * (1 - 0.22 * contact);
          }) as Vec;
        } else {
          ground = ground.map((g) => g * (1 - 0.45 * cut - 0.22 * contact)) as Vec;
        }
        touched ||= cut > 0.002 || contact > 0.002;
      }
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
