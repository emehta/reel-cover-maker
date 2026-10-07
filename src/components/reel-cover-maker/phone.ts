/**
 * The profile grid as a phone shows it, in the phone's own points: an
 * iPhone 15 or 16 is 393 points wide, and the grid runs from edge to edge,
 * three posts across with a hairline between them, each post its 3:4
 * window (formats.ts) since January 2025. The phone view draws the cover at
 * exactly this size wherever it has the room, so it is seen as it will be.
 *
 * Pure: the tests run it.
 */

/** An iPhone 15 or 16's width, in points. */
export const PHONE_WIDTH = 393;

/** The space between two posts in the grid, in points. */
export const GRID_GAP = 2;

export const GRID_COLUMNS = 3;

/** One post in the grid, in points: a third of the width less the gaps, 3:4. */
export function gridTile(width = PHONE_WIDTH): { w: number; h: number } {
  const w = (width - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
  return { w, h: (w * 4) / 3 };
}

/** The tile's canvas width, in its own pixels: three to a point, as sharp as the sharpest phone draws it. */
export function tilePixels(width = PHONE_WIDTH): number {
  return Math.round(gridTile(width).w * 3);
}
