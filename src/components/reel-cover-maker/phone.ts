/**
 * The profile grid as a phone shows it, in the phone's own points: an
 * iPhone 15 or 16, 393 by 852 points (three pixels to a point), its status
 * bar 54 high, its content from 59 down and up to 34 from the foot (its
 * safe area). On Instagram's profile, scrolled to the grid, the name's bar
 * and the tabs stay at the top, the tab bar at the foot, and the grid runs
 * from edge to edge between them: three posts across a point apart (three
 * of the screen's pixels), each its 3:4 window (formats.ts) since January
 * 2025. The phone view draws all of it to scale, the whole phone in sight.
 *
 * Pure: the tests run it.
 */

/** An iPhone 15 or 16's screen, in points. */
export const PHONE_WIDTH = 393;
export const PHONE_HEIGHT = 852;

/** Where its content may go: below the status bar and the Dynamic Island, above the home indicator. */
export const SAFE_TOP = 59;
export const SAFE_BOTTOM = 34;

/** The bars of Instagram's profile, in points: the name's, the tabs', and the tab bar above the home indicator. */
export const NAV_BAR = 44;
export const TABS_BAR = 44;
export const TAB_BAR = 49;

/** The space between two posts in the grid, in points: three of the screen's pixels. */
export const GRID_GAP = 1;

export const GRID_COLUMNS = 3;

/** The rows drawn, the cover's in the middle of them, in the middle column: enough to fill the grid's height and run past it. */
export const GRID_ROWS = 5;

/** The black glass round the screen, in points, and the screen's corners. */
export const BEZEL = 12;
export const SCREEN_RADIUS = 55;

/** One post in the grid, in points: a third of the width less the gaps, 3:4. */
export function gridTile(width = PHONE_WIDTH): { w: number; h: number } {
  const w = (width - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
  return { w, h: (w * 4) / 3 };
}

/** The tile's canvas width, in its own pixels: three to a point, as the phone draws it. */
export function tilePixels(width = PHONE_WIDTH): number {
  return Math.round(gridTile(width).w * 3);
}

/** Where the grid shows, in points from the screen's top: under the tabs, down to the tab bar. */
export function gridArea(): { top: number; bottom: number } {
  return { top: SAFE_TOP + NAV_BAR + TABS_BAR, bottom: PHONE_HEIGHT - SAFE_BOTTOM - TAB_BAR };
}

/** The cover's post, in points from the screen's top left: the middle column, its middle in the middle of the grid's height. */
export function coverTile(): { x: number; y: number; w: number; h: number } {
  const { w, h } = gridTile();
  const { top, bottom } = gridArea();
  return { x: w + GRID_GAP, y: (top + bottom) / 2 - h / 2, w, h };
}

/** The whole phone, its glass round the screen, in points. */
export function phoneSize(): { w: number; h: number } {
  return { w: PHONE_WIDTH + BEZEL * 2, h: PHONE_HEIGHT + BEZEL * 2 };
}
