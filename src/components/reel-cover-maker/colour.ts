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

/**
 * A hex code as it may be typed: with or without its #, three digits or
 * six, in either case, with space round it. The six digits in capitals
 * after a #, or null for anything that is not a colour.
 */
export function parseHex(text: string): string | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text.trim());
  if (!match) return null;
  const digits = match[1].length === 3 ? [...match[1]].map((c) => c + c).join("") : match[1];
  return `#${digits.toUpperCase()}`;
}

const decode = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

/** `#RRGGBB` in OKLab, Björn Ottosson's matrices: lightness 0 to 1, then the two axes of colour. */
export function hexToOklab(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => decode(c / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

/** Below this richness a colour is a grey, whose hue is noise. */
const GREY = 0.012;

/**
 * Where the two sliders come nearest a colour typed as a hex code: its hue,
 * and the shade of its lightness. A grey has no hue to speak of, so the one
 * the slider is on (`hue`) is kept.
 */
export function slidersFor(hex: string, hue: number): { hue: number; shade: number } {
  const [L, a, b] = hexToOklab(hex);
  const chroma = Math.hypot(a, b);
  const h = chroma < GREY ? hue : (((Math.atan2(b, a) * 180) / Math.PI) % 360 + 360) % 360;
  const shade = Math.min(1, Math.max(0, (L - 0.14) / 0.83));
  return { hue: Math.round(h) % 360, shade: Math.round(shade * 100) / 100 };
}
