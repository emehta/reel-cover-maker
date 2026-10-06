/**
 * The typefaces a cover is set in, by the name the layout knows them by.
 *
 * Pure: nothing here loads a font. `fonts.ts` binds each face to the file
 * next/font serves, and a test binds it to a measurer of its own.
 */

export type FaceId = "serif" | "serif-italic" | "sans" | "wide" | "mono" | "mono-bold";

export const FACE_IDS: readonly FaceId[] = ["serif", "serif-italic", "sans", "wide", "mono", "mono-bold"];

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
  /**
   * The ink of `text` itself, drawn from a start point on the baseline: how
   * far it reaches above and below the baseline, left of the start (an
   * italic's lean, a wide accent) and right of it (beyond the advance width
   * where the last glyph overhangs).
   */
  bounds(face: FaceId, text: string): { ascent: number; descent: number; left: number; right: number };
}
