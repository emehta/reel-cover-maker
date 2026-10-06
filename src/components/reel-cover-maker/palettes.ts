/**
 * The colours a cover is made in. Every style reads the same four roles, so a
 * palette picked once carries across styles, and a grid of covers made in one
 * palette reads as a set.
 *
 * Instagram stores every picture as sRGB JPEG with the colour at half
 * resolution (4:2:0), so text that differs from its ground only in hue
 * smears at the edges. Each pairing below differs in lightness as well, and
 * the tests hold every one to a contrast ratio, Glow's lights included: on a
 * dark ground they are deep colours, so the light text over them still reads.
 */

export type PaletteId = "ink" | "paper" | "cobalt" | "moss" | "blush" | "acid" | "plum" | "sky";

export interface Palette {
  id: PaletteId;
  name: string;
  /** The ground. */
  bg: string;
  /** The text. */
  ink: string;
  /** Emphasis, stickers and the caret. */
  accent: string;
  /** The three lights behind the Glow style, brightest first. */
  glow: readonly [string, string, string];
}

export const PALETTES: readonly Palette[] = [
  { id: "ink", name: "Ink", bg: "#111111", ink: "#F3EFE6", accent: "#FF5B2E", glow: ["#C2410C", "#5B21B6", "#1D4ED8"] },
  { id: "paper", name: "Paper", bg: "#F1ECE2", ink: "#1A1714", accent: "#C2381E", glow: ["#FFB38A", "#F7D7A8", "#E9A6B8"] },
  { id: "cobalt", name: "Cobalt", bg: "#1D36C9", ink: "#F4F2EC", accent: "#FFD23F", glow: ["#2F5BEA", "#006BB8", "#7C3AED"] },
  { id: "moss", name: "Moss", bg: "#1B2A1E", ink: "#ECE6D6", accent: "#C9E265", glow: ["#477229", "#55701A", "#245E4E"] },
  { id: "blush", name: "Blush", bg: "#F4D5CD", ink: "#2B1213", accent: "#A8122B", glow: ["#FF9C8A", "#FFD6A5", "#F58FB5"] },
  { id: "acid", name: "Acid", bg: "#D8F24A", ink: "#121212", accent: "#4626F0", glow: ["#F7FF8A", "#6BF2B0", "#B8F23A"] },
  { id: "plum", name: "Plum", bg: "#2A0F2E", ink: "#F6E7F1", accent: "#FF7AC6", glow: ["#B5179E", "#B8307A", "#4B1D8F"] },
  { id: "sky", name: "Sky", bg: "#CFE3F2", ink: "#0E2233", accent: "#0050C8", glow: ["#FFFFFF", "#8FC3F0", "#BFD8FF"] },
];

export const DEFAULT_PALETTE: PaletteId = "ink";

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

/** Of the ground and the text, whichever reads better on `fill`. */
export function readableOn(fill: string, palette: Palette): string {
  return contrast(palette.ink, fill) >= contrast(palette.bg, fill) ? palette.ink : palette.bg;
}

/** `#RRGGBB` with an alpha, for canvas gradients. */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}
