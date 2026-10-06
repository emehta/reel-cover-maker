/** A single-line font: each glyph its advance and its strokes, in font units, y down from the baseline. */
export interface StrokeFontData {
  id: string;
  name: string;
  upm: number;
  /** Character to [advance, strokes]; a stroke is a flat [x0, y0, x1, y1, ...] list. */
  glyphs: Record<string, [number, number[][]]>;
}
