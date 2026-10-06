/**
 * The colours a cover is made in, from three choices: a hue and a shade for
 * the letters (the paste, the ink, the sticker), and a light or dark ground.
 * Every style reads the same roles, so a colour picked once carries across
 * styles, and a grid of covers made in one colour reads as a set.
 *
 * Instagram stores every picture as sRGB JPEG with the colour at half
 * resolution (4:2:0), so letters that differ from their ground only in hue
 * smear at the edges; the shade slider is what keeps them apart.
 */

import { shiftedColour, sliderColour, tintColour } from "@/components/reel-cover-maker/colour";

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
  /** Stickery's two sticker colours, the chosen one and a pale tint, taken in turn. */
  sticker: readonly [string, string];
  /** A sticker's border: dark on a light ground, light on a dark one, so it always shows. */
  outline: string;
}

export const GROUNDS: Record<Ground, string> = { light: "#F2EEE6", dark: "#161616" };

/** A deep sauce red on a light ground: Sriracha's. */
export const DEFAULT_COLOUR: ColourChoice = { hue: 24, shade: 0.5, ground: "light" };

export function paletteFor(choice: ColourChoice): Palette {
  const { hue, shade, ground } = choice;
  const away = ground === "light" ? -0.22 : 0.22;
  return {
    bg: GROUNDS[ground],
    ink: sliderColour(hue, shade),
    accent: shiftedColour(hue, shade, away),
    sticker: [sliderColour(hue, shade), tintColour(hue, shade)],
    outline: ground === "light" ? "#141414" : "#F2EEE6",
  };
}

/**
 * Whether the letters stand clear of the ground by lightness (3:1, WCAG's
 * bar for large text). Instagram keeps colour at half the resolution of
 * lightness, so letters apart from their ground only by hue blur at their
 * edges once posted; the page says so, and leaves the choice to the eye.
 */
export function standsOut(palette: Palette): boolean {
  return contrast(palette.ink, palette.bg) >= 3;
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

/**
 * Near-black or near-white, whichever reads better on `fill`; on the few
 * vivid mid-tones where neither reaches 4.5:1, black or white itself,
 * one of which always does.
 */
export function readableOn(fill: string): string {
  const soft = contrast("#141414", fill) >= contrast("#F7F4EE", fill) ? "#141414" : "#F7F4EE";
  if (contrast(soft, fill) >= 4.5) return soft;
  return contrast("#000000", fill) >= contrast("#FFFFFF", fill) ? "#000000" : "#FFFFFF";
}

/** `#RRGGBB` with an alpha, for canvas colours. */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}
