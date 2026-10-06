/**
 * A photo behind the cover: how it is framed, and how its colour is
 * adjusted.
 *
 * Framing: the photo always covers the whole cover, as a phone's camera
 * fills its screen. At zoom 1 its shorter side just fits; zooming in takes
 * a smaller window of it. Where the window sits is its centre, as a share
 * of the photo's width and height, held so the window never runs off the
 * photo, whatever size the cover is. So the same framing survives a change
 * from a reel cover to a post.
 *
 * Colour: exposure in stops and the white balance (temperature and tint)
 * are worked in linear light, as a camera would; brightness and contrast
 * on the values as seen; then saturation and hue turn the colour about
 * its luminance, and dim darkens all of it, for letters that must read
 * over a busy photo. Each channel's part is a curve (a look-up table
 * here, the same arithmetic on the GPU in photo-gl.ts), the rest a 3x3
 * matrix, so a slider dragged lights the photo again at once.
 *
 * Pure: the tests run it.
 */

export interface PhotoFrame {
  /** 1 fits the photo's shorter side to the cover; up to 5. */
  zoom: number;
  /** The window's centre, as a share of the photo's width and height. */
  cx: number;
  cy: number;
  /** Mirrored left to right, as a front camera sees. */
  flip: boolean;
}

export interface PhotoAdjust {
  /** In stops, -2 to 2. */
  exposure: number;
  /** -1 to 1 each. */
  brightness: number;
  contrast: number;
  saturation: number;
  /** Cooler (blue) to warmer (amber), -1 to 1. */
  temperature: number;
  /** Greener to more magenta, -1 to 1. */
  tint: number;
  /** In degrees, -180 to 180. */
  hue: number;
  /** 0 to 1: how much the photo is darkened under the letters. */
  dim: number;
}

export const MAX_ZOOM = 5;

export const DEFAULT_FRAME: PhotoFrame = { zoom: 1, cx: 0.5, cy: 0.5, flip: false };

export const DEFAULT_ADJUST: PhotoAdjust = { exposure: 0, brightness: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, hue: 0, dim: 0 };

/** The adjustments a slider sets, in the order the panel shows them, with their ranges and how each reads. */
export const ADJUSTMENTS: readonly { key: keyof PhotoAdjust; name: string; min: number; max: number; step: number; unit: "stops" | "percent" | "degrees" }[] = [
  { key: "exposure", name: "Exposure", min: -2, max: 2, step: 0.01, unit: "stops" },
  { key: "brightness", name: "Brightness", min: -1, max: 1, step: 0.01, unit: "percent" },
  { key: "contrast", name: "Contrast", min: -1, max: 1, step: 0.01, unit: "percent" },
  { key: "saturation", name: "Saturation", min: -1, max: 1, step: 0.01, unit: "percent" },
  { key: "temperature", name: "Temperature", min: -1, max: 1, step: 0.01, unit: "percent" },
  { key: "tint", name: "Tint", min: -1, max: 1, step: 0.01, unit: "percent" },
  { key: "hue", name: "Hue", min: -180, max: 180, step: 1, unit: "degrees" },
  { key: "dim", name: "Dim", min: 0, max: 1, step: 0.01, unit: "percent" },
];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A stored framing read defensively: anything not understood is the default. */
export function readFrame(value: unknown): PhotoFrame {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const num = (x: unknown, lo: number, hi: number, fallback: number) => (typeof x === "number" && Number.isFinite(x) ? clamp(x, lo, hi) : fallback);
  return {
    zoom: num(v.zoom, 1, MAX_ZOOM, DEFAULT_FRAME.zoom),
    cx: num(v.cx, 0, 1, DEFAULT_FRAME.cx),
    cy: num(v.cy, 0, 1, DEFAULT_FRAME.cy),
    flip: v.flip === true,
  };
}

/** Stored adjustments read defensively, each held to its range. */
export function readAdjust(value: unknown): PhotoAdjust {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_ADJUST };
  for (const a of ADJUSTMENTS) {
    const x = v[a.key];
    if (typeof x === "number" && Number.isFinite(x)) out[a.key] = clamp(x, a.min, a.max);
  }
  return out;
}

export function isNeutral(adjust: PhotoAdjust): boolean {
  return ADJUSTMENTS.every((a) => Math.abs(adjust[a.key] - DEFAULT_ADJUST[a.key]) < 1e-9);
}

/** How an adjustment reads beside its slider: "+0.5 EV", "-12%", "30°". */
export function adjustLabel(key: keyof PhotoAdjust, value: number): string {
  const a = ADJUSTMENTS.find((x) => x.key === key);
  if (!a) return String(value);
  const sign = (n: number) => (n > 0 ? "+" : n < 0 ? "-" : "");
  if (a.unit === "stops") return `${sign(value)}${Math.abs(value).toFixed(1)} EV`;
  if (a.unit === "degrees") return `${Math.round(value)}°`;
  const p = Math.round(value * 100);
  return a.key === "dim" ? `${p}%` : `${sign(p)}${Math.abs(p)}%`;
}

/** The window of the photo drawn over the whole cover, in the photo's pixels (before any mirroring). */
export function sourceRect(photoW: number, photoH: number, coverW: number, coverH: number, frame: PhotoFrame): { sx: number; sy: number; sw: number; sh: number } {
  const fit = Math.max(coverW / photoW, coverH / photoH);
  const scale = fit * clamp(frame.zoom, 1, MAX_ZOOM);
  const sw = Math.min(photoW, coverW / scale);
  const sh = Math.min(photoH, coverH / scale);
  const sx = clamp(frame.cx * photoW - sw / 2, 0, photoW - sw);
  const sy = clamp(frame.cy * photoH - sh / 2, 0, photoH - sh);
  return { sx, sy, sw, sh };
}

/** A framing held so its window never runs off the photo: the centre it can really have at this zoom. */
export function clampFrame(frame: PhotoFrame, photoW: number, photoH: number, coverW: number, coverH: number): PhotoFrame {
  const zoom = clamp(frame.zoom, 1, MAX_ZOOM);
  const { sx, sy, sw, sh } = sourceRect(photoW, photoH, coverW, coverH, { ...frame, zoom });
  return { ...frame, zoom, cx: (sx + sw / 2) / photoW, cy: (sy + sh / 2) / photoH };
}

/**
 * The photo dragged by (dx, dy) of the cover's own pixels: it follows the
 * pointer, so the window moves the other way, mirrored with the photo.
 */
export function panFrame(frame: PhotoFrame, dx: number, dy: number, photoW: number, photoH: number, coverW: number, coverH: number): PhotoFrame {
  const { sw, sh } = sourceRect(photoW, photoH, coverW, coverH, frame);
  const perPixelX = sw / coverW / photoW;
  const perPixelY = sh / coverH / photoH;
  const moved = { ...frame, cx: frame.cx - (frame.flip ? -dx : dx) * perPixelX, cy: frame.cy - dy * perPixelY };
  return clampFrame(moved, photoW, photoH, coverW, coverH);
}

/** Zoomed by `factor` about a point of the cover (its own pixels), which stays where it is. */
export function zoomFrame(frame: PhotoFrame, factor: number, at: { x: number; y: number }, photoW: number, photoH: number, coverW: number, coverH: number): PhotoFrame {
  const before = sourceRect(photoW, photoH, coverW, coverH, frame);
  const zoom = clamp(frame.zoom * factor, 1, MAX_ZOOM);
  // The photo's point under `at`, which should stay under it.
  const ux = frame.flip ? 1 - at.x / coverW : at.x / coverW;
  const px = before.sx + ux * before.sw;
  const py = before.sy + (at.y / coverH) * before.sh;
  const after = sourceRect(photoW, photoH, coverW, coverH, { ...frame, zoom });
  const sx = px - ux * after.sw;
  const sy = py - (at.y / coverH) * after.sh;
  return clampFrame({ ...frame, zoom, cx: (sx + after.sw / 2) / photoW, cy: (sy + after.sh / 2) / photoH }, photoW, photoH, coverW, coverH);
}

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toSrgb = (v: number) => {
  const c = clamp(v, 0, 1);
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
};

/** The white balance's gain on each channel, in linear light: warmer lifts red and lowers blue; more tint lowers green. */
export function balanceGains(adjust: PhotoAdjust): [number, number, number] {
  const t = adjust.temperature;
  const g = adjust.tint;
  return [1 + 0.28 * t, 1 - 0.22 * g, 1 - 0.28 * t];
}

/**
 * One channel's curve, a value from 0 to 1 to a value from 0 to 1, before
 * the colour is turned: exposure and white balance in linear light, then
 * brightness and contrast on the value as seen.
 */
export function channelCurve(v: number, channel: 0 | 1 | 2, adjust: PhotoAdjust): number {
  let x = toLinear(clamp(v, 0, 1)) * 2 ** adjust.exposure * balanceGains(adjust)[channel];
  x = toSrgb(x);
  const b = adjust.brightness;
  x = b >= 0 ? x + (1 - x) * b * 0.6 : x * (1 + b * 0.6);
  x = (x - 0.5) * (1 + adjust.contrast) + 0.5;
  return clamp(x, 0, 1);
}

/** The 3x3 that turns the colour after its curves: saturation and hue about the luminance, then dim. Row by row. */
export function colourMatrix(adjust: PhotoAdjust): number[] {
  const [lr, lg, lb] = [0.2126, 0.7152, 0.0722];
  const s = 1 + adjust.saturation;
  // Saturation: towards or away from the grey of the same luminance.
  const sat = [lr * (1 - s) + s, lg * (1 - s), lb * (1 - s), lr * (1 - s), lg * (1 - s) + s, lb * (1 - s), lr * (1 - s), lg * (1 - s), lb * (1 - s) + s];
  // Hue: turned about the grey axis, keeping luminance (the usual rotation, in the luminance weights).
  const a = (adjust.hue * Math.PI) / 180;
  const c = Math.cos(a);
  const n = Math.sin(a);
  const hue = [
    lr + c * (1 - lr) - n * lr,
    lg - c * lg - n * lg,
    lb - c * lb + n * (1 - lb),
    lr - c * lr + n * 0.143,
    lg + c * (1 - lg) + n * 0.14,
    lb - c * lb - n * 0.283,
    lr - c * lr - n * (1 - lr),
    lg - c * lg + n * lg,
    lb + c * (1 - lb) + n * lb,
  ];
  const k = 1 - 0.65 * clamp(adjust.dim, 0, 1);
  const out: number[] = [];
  for (let r = 0; r < 3; r += 1) {
    for (let col = 0; col < 3; col += 1) {
      let sum = 0;
      for (let m = 0; m < 3; m += 1) sum += hue[r * 3 + m] * sat[m * 3 + col];
      out.push(sum * k);
    }
  }
  return out;
}

/** Each channel's curve as a table of 256, for the page to apply. */
export function channelTables(adjust: PhotoAdjust): [Uint8Array, Uint8Array, Uint8Array] {
  const make = (channel: 0 | 1 | 2) => {
    const table = new Uint8Array(256);
    for (let i = 0; i < 256; i += 1) table[i] = Math.round(channelCurve(i / 255, channel, adjust) * 255);
    return table;
  };
  return [make(0), make(1), make(2)];
}

/** RGBA pixels adjusted in place: each channel through its curve, then the colour through the matrix. Alpha kept. */
export function adjustPixels(data: Uint8ClampedArray, adjust: PhotoAdjust): void {
  if (isNeutral(adjust)) return;
  const [tr, tg, tb] = channelTables(adjust);
  const m = colourMatrix(adjust);
  for (let i = 0; i < data.length; i += 4) {
    const r = tr[data[i]];
    const g = tg[data[i + 1]];
    const b = tb[data[i + 2]];
    data[i] = m[0] * r + m[1] * g + m[2] * b;
    data[i + 1] = m[3] * r + m[4] * g + m[5] * b;
    data[i + 2] = m[6] * r + m[7] * g + m[8] * b;
  }
}

/** The size a photo is kept at: its longer side at most `most` pixels, the shape kept. */
export function keptSize(w: number, h: number, most: number): { w: number; h: number } {
  const k = Math.min(1, most / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}
