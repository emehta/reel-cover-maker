/**
 * The typefaces a cover is set in, by the name the layout knows them by.
 *
 * Pure: nothing here loads a font. `fonts.ts` binds each face to the file
 * next/font serves, and a test binds it to a measurer of its own.
 */

export type FaceId =
  | "serif"
  | "serif-italic"
  | "condensed"
  | "sans"
  | "sans-heavy"
  | "wide"
  | "mono"
  | "mono-bold";

export const FACE_IDS: readonly FaceId[] = [
  "serif",
  "serif-italic",
  "condensed",
  "sans",
  "sans-heavy",
  "wide",
  "mono",
  "mono-bold",
];

/** A face's vertical extent, in em. All positive: ascent and cap above the baseline, descent below it. */
export interface FaceMetrics {
  /** The height of a capital H. */
  cap: number;
  /** The tallest mark above the baseline, accented capitals included. */
  ascent: number;
  /** The deepest mark below it. */
  descent: number;
}

/** How wide and tall text is, in em, so layout needs no canvas of its own. */
export interface Measurer {
  /** The advance width of `text` set in `face`, in em. */
  width(face: FaceId, text: string): number;
  /** The face's extent, for lines set to a common leading. */
  metrics(face: FaceId): FaceMetrics;
  /** The ink of `text` itself, for lines stacked by what they hold. */
  bounds(face: FaceId, text: string): { ascent: number; descent: number };
}
