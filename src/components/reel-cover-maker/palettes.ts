/**
 * The colours a cover is made in, from three choices: a hue and a shade for
 * the letters (the paste, the ink, the sticker), and a light or dark ground.
 * Every style reads the same roles, so a colour picked once carries across
 * styles, and a grid of covers made in one colour reads as a set. Stickery
 * has a fourth, the colour of the letters on its stickers (`TextMode`).
 *
 * Instagram stores every picture as sRGB JPEG with the colour at half
 * resolution (4:2:0), so letters that differ from their ground only in hue
 * smear at the edges; the shade slider is what keeps them apart.
 */

import { shiftedColour, sliderColour } from "@/components/reel-cover-maker/colour";

export type Ground = "light" | "dark";

export interface ColourChoice {
  /** 0 to 360. */
  hue: number;
  /** 0 (near-black) to 1 (near-white). */
  shade: number;
  ground: Ground;
}

export interface Palette {
  /** The plain ground. */
  bg: string;
  /** The chosen colour: the letters, the paste. */
  ink: string;
  /** A shade of it further from the ground, for an emphasised word. */
  accent: string;
  /**
   * Stickery's two sticker colours, taken in turn: the chosen one, and the
   * same shade a long way round the colour wheel, as Main Sticker 2 sets a
   * blue sticker under a pink one.
   */
  sticker: readonly [string, string];
  /** A sticker's border: dark on a light ground, light on a dark one, so it always shows. */
  outline: string;
}

export const GROUNDS: Record<Ground, string> = { light: "#F2EEE6", dark: "#161616" };

/** How far round the colour wheel the second sticker is from the first, in degrees: pink to blue. */
const STICKER_TURN = 100;

/** A deep sauce red on a light ground: Sriracha's. */
export const DEFAULT_COLOUR: ColourChoice = { hue: 24, shade: 0.5, ground: "light" };

export function paletteFor(choice: ColourChoice): Palette {
  const { hue, shade, ground } = choice;
  const away = ground === "light" ? -0.22 : 0.22;
  return {
    bg: GROUNDS[ground],
    ink: sliderColour(hue, shade),
    accent: shiftedColour(hue, shade, away),
    sticker: [sliderColour(hue, shade), sliderColour(hue - STICKER_TURN, Math.min(0.8, Math.max(0.45, shade)))],
    outline: ground === "light" ? "#141414" : "#F2EEE6",
  };
}

export function isGround(value: unknown): value is Ground {
  return value === "light" || value === "dark";
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

/** The black and the white letters are set in on a colour: a sticker's border's black, and a warm white. */
export const SOFT_BLACK = "#141414";
export const SOFT_WHITE = "#F7F4EE";

/**
 * Near-black or near-white, whichever reads better on `fill`; on the few
 * vivid mid-tones where neither reaches 4.5:1, black or white itself,
 * one of which always does.
 */
export function readableOn(fill: string): string {
  const soft = contrast(SOFT_BLACK, fill) >= contrast(SOFT_WHITE, fill) ? SOFT_BLACK : SOFT_WHITE;
  if (contrast(soft, fill) >= 4.5) return soft;
  return contrast("#000000", fill) >= contrast("#FFFFFF", fill) ? "#000000" : "#FFFFFF";
}

/**
 * The colour of Stickery's letters, on its stickers: black or white,
 * whichever reads on each sticker (auto, as it always was); black or white
 * on every sticker; or a colour of the owner's own from two sliders, as
 * the stickers' is. Every other style's letters are the chosen colour.
 */
export type TextMode = "auto" | "black" | "white" | "colour";

export const TEXT_MODES: readonly { id: TextMode; name: string }[] = [
  { id: "auto", name: "Auto" },
  { id: "black", name: "Black" },
  { id: "white", name: "White" },
  { id: "colour", name: "Colour" },
];

export function isTextMode(value: unknown): value is TextMode {
  return TEXT_MODES.some((m) => m.id === value);
}

/** The text colour picked, as a colour; null for auto, which is each sticker's own. */
export function textColour(mode: TextMode, hue: number, shade: number): string | null {
  if (mode === "black") return SOFT_BLACK;
  if (mode === "white") return SOFT_WHITE;
  if (mode === "colour") return sliderColour(hue, shade);
  return null;
}

/** `#RRGGBB` with an alpha, for canvas colours. */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}
