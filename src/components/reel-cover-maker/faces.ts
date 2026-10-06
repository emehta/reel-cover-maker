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
 * The faces Stickery may set its plain words in, thin or light, four sans
 * and four serif. Only the chosen one is loaded.
 */
export type PlainFaceId =
  | "plain-inter"
  | "plain-manrope"
  | "plain-outfit"
  | "plain-jost"
  | "plain-instrument"
  | "plain-cormorant"
  | "plain-fraunces"
  | "plain-newsreader";

export interface PlainFace {
  id: PlainFaceId;
  name: string;
  kind: "sans" | "serif";
}

/** In the order the picker shows them: the sans, then the serifs. */
export const PLAIN_FACES: readonly PlainFace[] = [
  { id: "plain-inter", name: "Inter", kind: "sans" },
  { id: "plain-manrope", name: "Manrope", kind: "sans" },
  { id: "plain-outfit", name: "Outfit", kind: "sans" },
  { id: "plain-jost", name: "Jost", kind: "sans" },
  { id: "plain-instrument", name: "Instrument", kind: "serif" },
  { id: "plain-cormorant", name: "Cormorant", kind: "serif" },
  { id: "plain-fraunces", name: "Fraunces", kind: "serif" },
  { id: "plain-newsreader", name: "Newsreader", kind: "serif" },
];

export const DEFAULT_PLAIN_FACE: PlainFaceId = "plain-inter";

export function isPlainFaceId(value: unknown): value is PlainFaceId {
  return PLAIN_FACES.some((f) => f.id === value);
}

export type FaceId = CoreFaceId | PlainFaceId;

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
