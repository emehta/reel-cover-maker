/**
 * The typefaces a cover is set in, by the name the layout knows them by.
 *
 * Pure: nothing here loads a font. `fonts.ts` binds each face to the file
 * next/font serves, and a test binds it to a measurer of its own.
 */

/** The faces every cover may need: loaded up front. */
export type CoreFaceId = "serif" | "serif-italic" | "sans" | "wide" | "mono" | "mono-bold";

export const CORE_FACE_IDS: readonly CoreFaceId[] = ["serif", "serif-italic", "sans", "wide", "mono", "mono-bold"];

/**
 * The faces Stickery may set its plain words in: the owner's four (Outfit
 * and Jost, Fraunces and Newsreader), and four suggested to pair with the
 * funky words, offered only once the owner says so. Only the chosen face is
 * loaded.
 */
export type PlainFaceId =
  | "plain-outfit"
  | "plain-jost"
  | "plain-fraunces"
  | "plain-newsreader"
  | "plain-sofia"
  | "plain-archivo"
  | "plain-crimson"
  | "plain-caslon";

export interface PlainFace {
  id: PlainFaceId;
  name: string;
  kind: "sans" | "serif";
  /** Shown in the picker; a suggestion is not, until it is chosen. */
  offered: boolean;
}

/** In the order the picker shows them: the sans, then the serifs. */
export const PLAIN_FACES: readonly PlainFace[] = [
  { id: "plain-outfit", name: "Outfit", kind: "sans", offered: true },
  { id: "plain-jost", name: "Jost", kind: "sans", offered: true },
  { id: "plain-sofia", name: "Sofia Sans Condensed", kind: "sans", offered: false },
  { id: "plain-archivo", name: "Archivo Narrow", kind: "sans", offered: false },
  { id: "plain-fraunces", name: "Fraunces", kind: "serif", offered: true },
  { id: "plain-newsreader", name: "Newsreader", kind: "serif", offered: true },
  { id: "plain-crimson", name: "Crimson Pro", kind: "serif", offered: false },
  { id: "plain-caslon", name: "Libre Caslon", kind: "serif", offered: false },
];

export const DEFAULT_PLAIN_FACE: PlainFaceId = "plain-outfit";

export function isPlainFaceId(value: unknown): value is PlainFaceId {
  return PLAIN_FACES.some((f) => f.id === value);
}

/** The typefaces Stickery's funky words may be set in, where they are a face rather than drawn paste. */
export type FunkyFaceId = "funky-yesteryear" | "funky-leckerli" | "funky-damion" | "funky-yellowtail";

export type FaceId = CoreFaceId | PlainFaceId | FunkyFaceId;

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
  /**
   * The ink of `text` drawn from a start point on the baseline, as columns
   * left to right: each a slice `w` em wide from `x`, with the top and bottom
   * of the ink in it, in em from the baseline (up negative). A slice with no
   * ink is left out. So a word can be fitted to the real shape of another,
   * into the dips between its tall letters, rather than to its box.
   */
  columns?(face: FaceId, text: string): readonly InkColumn[];
}

export interface InkColumn {
  x: number;
  w: number;
  top: number;
  bottom: number;
}
