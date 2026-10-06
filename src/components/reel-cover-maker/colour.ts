/**
 * A colour from two sliders, hue and shade, in OKLCH: a space where equal
 * steps of the slider look like equal steps of colour, and a shade is as
 * light at every hue. Shade runs from near-black to near-white; richness
 * peaks in the middle and falls away toward both ends, so the darkest and
 * lightest shades come out as the near-neutral black and white they look
 * like, and a hue at its middle shade is as vivid as a screen can show it.
 * Whatever falls outside sRGB is brought in by lowering the richness, never
 * by clipping a channel, so the hue holds.
 */

export type Rgb = [number, number, number];

/** OKLab to linear sRGB, Björn Ottosson's matrices. */
function oklabToLinear(L: number, a: number, b: number): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const encode = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

/** OKLCH (lightness 0 to 1, chroma, hue in degrees) to sRGB, 0 to 1 per channel, or null if outside sRGB. */
export function oklch(L: number, C: number, h: number): Rgb | null {
  const rad = (h * Math.PI) / 180;
  const lin = oklabToLinear(L, C * Math.cos(rad), C * Math.sin(rad));
  const out = lin.map(encode) as Rgb;
  return out.every((v) => v >= -1e-4 && v <= 1 + 1e-4) ? (out.map((v) => Math.min(1, Math.max(0, v))) as Rgb) : null;
}

/** The richest colour of this lightness and hue that sRGB holds, found by halving the chroma's range. */
export function inGamut(L: number, C: number, h: number): Rgb {
  const direct = oklch(L, C, h);
  if (direct) return direct;
  let lo = 0;
  let hi = C;
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    if (oklch(L, mid, h)) lo = mid;
    else hi = mid;
  }
  return oklch(L, lo, h) ?? [L, L, L];
}

export function toHex(rgb: Rgb): string {
  return `#${rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/** The shade slider, 0 to 1, as OKLCH lightness: near-black to near-white. */
export function lightnessOf(shade: number): number {
  return 0.14 + Math.min(1, Math.max(0, shade)) * 0.83;
}

/** How rich a colour may be at a lightness: most in the middle, little at the ends. */
export function chromaAt(L: number): number {
  const t = 1 - Math.abs(L - 0.6) / 0.48;
  return 0.3 * Math.max(0, Math.min(1, t)) ** 0.75;
}

/** The colour the two sliders name. */
export function sliderColour(hue: number, shade: number): string {
  const L = lightnessOf(shade);
  return toHex(inGamut(L, chromaAt(L), ((hue % 360) + 360) % 360));
}

/** The same hue, the shade moved by `by` (above zero lighter), its richness following. */
export function shiftedColour(hue: number, shade: number, by: number): string {
  return sliderColour(hue, Math.min(1, Math.max(0, shade + by)));
}

/** A pale tint of the hue, for a second sticker: light, and half as rich. */
export function tintColour(hue: number, shade: number): string {
  const L = Math.min(0.94, lightnessOf(shade) + 0.3);
  return toHex(inGamut(L, chromaAt(L) * 0.45, ((hue % 360) + 360) % 360));
}

/** A CSS gradient through every hue at a shade, for the hue slider's track. */
export function hueTrack(shade: number, steps = 12): string {
  const stops = Array.from({ length: steps + 1 }, (_, i) => sliderColour((i / steps) * 360, shade));
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

/** A CSS gradient through every shade of a hue, for the shade slider's track. */
export function shadeTrack(hue: number, steps = 10): string {
  const stops = Array.from({ length: steps + 1 }, (_, i) => sliderColour(hue, i / steps));
  return `linear-gradient(to right, ${stops.join(", ")})`;
}
