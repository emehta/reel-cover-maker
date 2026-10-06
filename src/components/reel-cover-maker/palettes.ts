/**
 * The colours a cover is made in, named for the colour of the letters: the
 * paste, the ink, the sticker. Each sits on a plain ground, off-white, or
 * near-black where a light colour needs it to read (white, yellow, orange).
 * Every style reads the same roles, so a colour picked once carries across
 * styles, and a grid of covers made in one colour reads as a set.
 *
 * Instagram stores every picture as sRGB JPEG with the colour at half
 * resolution (4:2:0), so letters that differ from their ground only in hue
 * smear at the edges. Each pairing differs in lightness as well, and the
 * tests hold every one to a contrast ratio.
 */

export type PaletteId = "green" | "yellow" | "blue" | "orange" | "purple" | "black" | "white" | "brown" | "red";

export interface Palette {
  id: PaletteId;
  name: string;
  /** The plain ground. */
  bg: string;
  /** The named colour: the letters, the paste. */
  ink: string;
  /** A deeper or lighter shade of it, for an emphasised word. */
  accent: string;
  /** Stickery's two sticker colours, a bright one and a pale one, taken in turn. */
  sticker: readonly [string, string];
}

const PAPER = "#F2EEE6";
const NIGHT = "#161616";

/** In the order the colour picker shows them. */
export const PALETTES: readonly Palette[] = [
  { id: "green", name: "Green", bg: PAPER, ink: "#17783A", accent: "#0C4A22", sticker: ["#3CCB6A", "#B8EDC4"] },
  { id: "yellow", name: "Yellow", bg: NIGHT, ink: "#FFCC1A", accent: "#FFE68A", sticker: ["#FFD42A", "#FFF0A8"] },
  { id: "blue", name: "Blue", bg: PAPER, ink: "#1F4FD8", accent: "#0E2C86", sticker: ["#5B7CFA", "#C3D2FF"] },
  { id: "orange", name: "Orange", bg: NIGHT, ink: "#FF7A1A", accent: "#FFB27A", sticker: ["#FF8A3D", "#FFD3B0"] },
  { id: "purple", name: "Purple", bg: PAPER, ink: "#6B2BD9", accent: "#3E1185", sticker: ["#A974FF", "#DECCFF"] },
  { id: "black", name: "Black", bg: PAPER, ink: "#141414", accent: "#5A5650", sticker: ["#141414", "#D9D4CA"] },
  { id: "white", name: "White", bg: NIGHT, ink: "#F5F2EA", accent: "#BDB8AE", sticker: ["#F5F2EA", "#9C978D"] },
  { id: "brown", name: "Brown", bg: PAPER, ink: "#7A3E1D", accent: "#4A230E", sticker: ["#C8814A", "#EBCBA8"] },
  { id: "red", name: "Red", bg: PAPER, ink: "#9E1B1B", accent: "#5E0C0C", sticker: ["#E85A5A", "#F7C1C1"] },
];

export const DEFAULT_PALETTE: PaletteId = "red";

export function paletteById(id: PaletteId): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

export function isPaletteId(value: unknown): value is PaletteId {
  return PALETTES.some((p) => p.id === value);
}

/** `#RRGGBB` as 0 to 255 channels. */
export function rgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** WCAG 2's relative luminance of an sRGB colour. */
export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2's contrast ratio, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Near-black or near-white, whichever reads better on `fill`. */
export function readableOn(fill: string): string {
  return contrast("#141414", fill) >= contrast("#F7F4EE", fill) ? "#141414" : "#F7F4EE";
}

/** `#RRGGBB` with an alpha, for canvas colours. */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

/** `#RRGGBB` lightened (amount above 0) or darkened (below), 0 to 1. */
export function shade(hex: string, amount: number): string {
  const target = amount >= 0 ? 255 : 0;
  const t = Math.min(1, Math.abs(amount));
  return `#${rgb(hex)
    .map((c) => Math.round(c + (target - c) * t).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}
