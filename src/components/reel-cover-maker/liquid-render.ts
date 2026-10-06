/**
 * Letters made of paste: the picture.
 *
 * Each chain of beads is a shape: the union of tapered capsules between its
 * beads, measured exactly as a signed distance (positive inside). Chains
 * then join by a smooth union, so where two strokes meet the paste pools
 * into a fillet, as liquid does, while each stroke on its own stays as drawn.
 * The distance inside a stroke, against its radius there, is how high the
 * paste stands, and that height is lit:
 *
 * - "gloss": a wet surface, lit from the top left, with sharp highlights and
 *   a soft shadow under it (ketchup, ink, honey, a balloon);
 * - "flat": the colour alone (a print);
 * - "matte": thick paste spread with a knife, ridged along each stroke,
 *   rough at the edge, lit softly.
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
  /** Each chain's colour, as an index into `colours`, and how much lighter or darker than it (1 is as is). */
  colours: string[];
  colourOf: number[];
  tone: number[];
  finish: Finish;
  /** How far apart two strokes may be and still pool together, in pixels of the picture. */
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

export interface LiquidImage {
  /** Where the pixels go on the canvas, and RGBA for them, not premultiplied, as ImageData wants. */
  x: number;
  y: number;
  w: number;
  h: number;
  data: Uint8ClampedArray<ArrayBuffer>;
}

const NONE = -1e6;

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

const toLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const toSrgb = (v: number) => {
  const c = Math.max(0, Math.min(1, v));
  return 255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
};

function unit(x: number, y: number, z: number): [number, number, number] {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

/** The light: from the top left, as the shadow falls to the bottom right. */
const LIGHT = unit(-0.42, -0.62, 0.66);
const HALF = unit(LIGHT[0], LIGHT[1], LIGHT[2] + 1);
const RIM = unit(0.55, -0.25, 0.8);
const RIM_HALF = unit(RIM[0], RIM[1], RIM[2] + 1);

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

export function renderLiquid(paint: LiquidPaint, target: LiquidTarget): LiquidImage | null {
  const { scale, origin } = target;
  const k = paint.pool * scale;
  const shadowOffset = paint.finish === "flat" ? 0 : 7 * scale;
  const shadowBlur = paint.finish === "flat" ? 0 : 12 * scale;
  // The region must hold the shadow, which falls beyond the paste; a
  // capsule's depth is needed only as far out as the pooling and the
  // shadow's blur reach.
  const margin = Math.ceil(k + shadowOffset + shadowBlur + 3);
  const reachOut = Math.ceil(Math.max(k, shadowBlur) + 2);

  // The chains in canvas pixels.
  const chains: Chain[] = paint.chains
    .filter((c) => c.length > 0)
    .map((c) => c.map((b) => ({ x: (b.x - origin.x) * scale, y: (b.y - origin.y) * scale, r: b.r * scale })));
  if (!chains.length) return null;

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

  // The field: depth inside the paste, the radius of the stroke it came
  // from, and that stroke's direction (for the knife's ridges).
  const depth = new Float32Array(rw * rh).fill(NONE);
  const radius = new Float32Array(rw * rh);
  const direction = new Float32Array(rw * rh);
  const owner = new Int32Array(rw * rh);
  const tileDepth = new Float32Array(rw * rh);
  const tileRadius = new Float32Array(rw * rh);
  const tileDirection = new Float32Array(rw * rh);

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
    const tx0 = Math.max(rx, Math.floor(cx0 - margin));
    const ty0 = Math.max(ry, Math.floor(cy0 - margin));
    const tx1 = Math.min(rx + rw, Math.ceil(cx1 + margin));
    const ty1 = Math.min(ry + rh, Math.ceil(cy1 + margin));
    for (let y = ty0; y < ty1; y += 1) {
      tileDepth.fill(NONE, (y - ry) * rw + (tx0 - rx), (y - ry) * rw + (tx1 - rx));
    }
    // The stroke's own radius, one for the whole of it, so the height has no
    // seam where one capsule's radius gives way to the next one's.
    const sorted = chain.map((b) => b.r).sort((p, q) => p - q);
    const base = sorted[Math.floor(sorted.length / 2)];
    const segments = chain.length === 1 ? [[chain[0], chain[0]]] : chain.slice(1).map((b, i) => [chain[i], b]);
    for (const [a, b] of segments) {
      const reach = Math.max(a.r, b.r) + reachOut;
      const sx0 = Math.max(tx0, Math.floor(Math.min(a.x, b.x) - reach));
      const sy0 = Math.max(ty0, Math.floor(Math.min(a.y, b.y) - reach));
      const sx1 = Math.min(tx1, Math.ceil(Math.max(a.x, b.x) + reach));
      const sy1 = Math.min(ty1, Math.ceil(Math.max(a.y, b.y) + reach));
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      for (let y = sy0; y < sy1; y += 1) {
        const row = (y - ry) * rw - rx;
        const py = y + 0.5;
        for (let x = sx0; x < sx1; x += 1) {
          const d = capsuleDepth(x + 0.5, py, a, b);
          const i = row + x;
          if (d > tileDepth[i]) {
            tileDepth[i] = d;
            tileRadius[i] = base;
            tileDirection[i] = angle;
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
          direction[i] = tileDirection[i];
          owner[i] = chainIndex;
        }
        depth[i] = d <= NONE ? t : smoothMax(d, t, k);
      }
    }
  });

  // Each chain's own colour, in linear light, toned.
  const linear = paint.colours.map((c) => rgb(c).map(toLinear));
  const chainColour = chains.map((_, i) => {
    const base = linear[paint.colourOf[i] ?? 0] ?? linear[0];
    const t = paint.tone[i] ?? 1;
    return base.map((v) => Math.min(1, v * t));
  });
  const data = new Uint8ClampedArray(rw * rh * 4);
  const rough = paint.finish === "matte";
  const grain = 5 * scale;
  const n = rw * rh;

  // How high the paste stands at a pixel: a squashed round profile, as a
  // bead of liquid sits on a plate, risen where strokes pool.
  const height = new Float32Array(n);
  let typical = 0;
  let counted = 0;
  for (let i = 0; i < n; i += 1) {
    const d = depth[i];
    if (d <= 0) continue;
    const r = Math.max(1, radius[i]);
    const f = Math.min(d, r);
    let h = 0.62 * Math.sqrt(Math.max(0, 2 * r * f - f * f));
    if (rough) {
      const x = (i % rw) + rx;
      const y = ((i / rw) | 0) + ry;
      // Ridges the knife leaves along the stroke, and the paste's own lumps.
      const a = direction[i];
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const u = (x * ca + y * sa) / (r * 2.6);
      const v = (-x * sa + y * ca) / (r * 0.42);
      h = Math.min(h, r * 0.55) + r * 0.09 * noise2(paint.seed, u, v) + r * 0.05 * fbm2(paint.seed ^ 0x77, x / grain, y / grain);
    }
    height[i] = h;
    if ((i & 63) === 0) {
      typical += r;
      counted += 1;
    }
  }
  // A light blur takes out the creases where strokes cross.
  boxBlur(height, rw, rh, Math.max(1, Math.round((counted ? typical / counted : 4) * 0.12)));

  const shadowDx = Math.round(shadowOffset * 0.45);
  const shadowDy = Math.round(shadowOffset);
  for (let y = 0; y < rh; y += 1) {
    for (let x = 0; x < rw; x += 1) {
      const i = y * rw + x;
      let d = depth[i];
      if (rough && d > -3) d += 1.6 * scale * fbm2(paint.seed ^ 0x2f, (x + rx) / (4 * scale), (y + ry) / (4 * scale));
      const cover = d >= 0.5 ? 1 : d <= -0.5 ? 0 : d + 0.5;
      let shadow = 0;
      if (shadowBlur > 0) {
        const sx = Math.min(rw - 1, Math.max(0, x - shadowDx));
        const sy = Math.min(rh - 1, Math.max(0, y - shadowDy));
        const sd = depth[sy * rw + sx];
        shadow = 0.3 * Math.min(1, Math.max(0, (sd + shadowBlur) / (2 * shadowBlur)));
      }
      const alpha = cover + shadow * (1 - cover);
      if (alpha <= 0) continue;
      let sr = 0;
      let sg = 0;
      let sb = 0;
      if (cover > 0) {
        const [cr, cg, cb] = chainColour[owner[i]] ?? chainColour[0];
        if (paint.finish === "flat") {
          sr = cr;
          sg = cg;
          sb = cb;
        } else {
          const hx = (height[x < rw - 1 ? i + 1 : i] - height[x > 0 ? i - 1 : i]) * 0.5;
          const hy = (height[y < rh - 1 ? i + rw : i] - height[y > 0 ? i - rw : i]) * 0.5;
          const nl = 1 / Math.sqrt(hx * hx + hy * hy + 1);
          const nx = -hx * nl;
          const ny = -hy * nl;
          const nz = nl;
          const diffuse = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
          const r = Math.max(1, radius[i]);
          const inside = Math.min(1, Math.max(0, d) / r);
          if (paint.finish === "gloss") {
            const nh = Math.max(0, nx * HALF[0] + ny * HALF[1] + nz * HALF[2]);
            const rim = Math.max(0, nx * RIM_HALF[0] + ny * RIM_HALF[1] + nz * RIM_HALF[2]);
            const spec = 1.05 * nh ** 110 + 0.05 * nh ** 12 + 0.3 * rim ** 180;
            // A deep body, a little lighter where it thins at the edge
            // (light through it), darker where it meets the plate.
            const edge = 1 - inside;
            const body = (0.4 + 0.5 * diffuse) * (1 + 0.25 * edge * edge) * (0.78 + 0.22 * Math.min(1, inside / 0.22));
            sr = cr * body + spec;
            sg = cg * body + spec;
            sb = cb * body + spec;
          } else {
            const nh = Math.max(0, nx * HALF[0] + ny * HALF[1] + nz * HALF[2]);
            const body = 0.62 + 0.48 * diffuse;
            const spec = 0.07 * nh ** 10;
            sr = cr * body + spec;
            sg = cg * body + spec;
            sb = cb * body + spec;
          }
        }
      }
      // The paste over its shadow, which is black: straight alpha out.
      const o = i * 4;
      data[o] = toSrgb((sr * cover) / alpha);
      data[o + 1] = toSrgb((sg * cover) / alpha);
      data[o + 2] = toSrgb((sb * cover) / alpha);
      data[o + 3] = Math.round(alpha * 255);
    }
  }
  return { x: rx, y: ry, w: rw, h: rh, data };
}
