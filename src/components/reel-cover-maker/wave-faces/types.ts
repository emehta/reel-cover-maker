/** The faces Wave draws its letters from (wave-faces/*.ts, written by scripts/wave-faces.mjs). */
export type WaveFaceId = "mona" | "anton" | "archivo";

/**
 * A face's letters as outlines, in its own units (`upem` to the em, y up
 * from the baseline): for each character, its advance at each of `widths`,
 * its outline's commands (M, L, Q, C, Z), its points at the first width,
 * and for each other width how far each point is from there. Between two
 * widths every point and advance moves in a straight line. `widths` is
 * null for a face with one width (Anton).
 *
 * Kerning is kept by class, as fonts keep it: a pair's offset, at each
 * width, is the cell of its first character's class on the left and its
 * second's on the right; a pair in no cell is not kerned.
 */
export interface WaveFaceData {
  id: WaveFaceId;
  name: string;
  upem: number;
  wght: number | null;
  widths: number[] | null;
  glyphs: Record<string, [number[], string, number[], ...number[][]]>;
  kern: { left: Record<string, number>; right: Record<string, number>; cells: Record<string, number[]> };
}
