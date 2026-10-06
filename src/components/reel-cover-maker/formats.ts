/**
 * The three pictures Instagram is given, and what each of its screens shows
 * of them.
 *
 * Instagram serves every picture 1080 pixels wide, so that is the width made:
 * anything wider is only shrunk again by Instagram's own resampler. A reel's
 * cover is the reel's own shape, 9:16. Since January 2025 the profile grid
 * shows a centred 3:4 window of every post (it was a square before), and the
 * feed shows a reel's cover through a centred 4:5 one. A 3:4 post is the
 * tallest Instagram takes and the only one the grid shows whole.
 *
 * Text goes where every one of those windows agrees, inset by a margin, so a
 * cover reads the same on the grid, in the feed and full screen.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type FormatId = "reel" | "post-3x4" | "post-4x5";

export interface Format {
  id: FormatId;
  /** What the size control says. */
  label: string;
  width: number;
  height: number;
  /** What the profile grid shows of it, or null when it shows all of it. */
  grid: Rect | null;
  /** Every window Instagram shows it through, the grid's included. */
  crops: Rect[];
  /** Where text may be set: inside every crop, less the margin. */
  safe: Rect;
  /** The end of the downloaded file's name. */
  fileSuffix: string;
}

/** Instagram's width for every picture it serves. */
export const INSTAGRAM_WIDTH = 1080;

/** The margin inside the agreed window, as a share of the width. */
export const MARGIN = 0.08;

/** The largest window of `ratioW:ratioH` centred on a `width` by `height` picture. */
export function centredCrop(width: number, height: number, ratioW: number, ratioH: number): Rect {
  if (width / height < ratioW / ratioH) {
    const h = (width * ratioH) / ratioW;
    return { x: 0, y: (height - h) / 2, w: width, h };
  }
  const w = (height * ratioW) / ratioH;
  return { x: (width - w) / 2, y: 0, w, h: height };
}

/** Where every one of `rects` overlaps. */
export function intersect(rects: Rect[]): Rect {
  const left = Math.max(...rects.map((r) => r.x));
  const top = Math.max(...rects.map((r) => r.y));
  const right = Math.min(...rects.map((r) => r.x + r.w));
  const bottom = Math.min(...rects.map((r) => r.y + r.h));
  return { x: left, y: top, w: Math.max(0, right - left), h: Math.max(0, bottom - top) };
}

export function inset(rect: Rect, by: number): Rect {
  return { x: rect.x + by, y: rect.y + by, w: rect.w - 2 * by, h: rect.h - 2 * by };
}

function format(
  id: FormatId,
  label: string,
  height: number,
  crops: Array<[number, number]>,
  fileSuffix: string,
): Format {
  const width = INSTAGRAM_WIDTH;
  const whole: Rect = { x: 0, y: 0, w: width, h: height };
  const windows = crops.map(([w, h]) => centredCrop(width, height, w, h));
  const grid = windows[0];
  const showsWhole = grid.w === width && grid.h === height;
  return {
    id,
    label,
    width,
    height,
    grid: showsWhole ? null : grid,
    crops: windows,
    safe: inset(intersect([whole, ...windows]), Math.round(width * MARGIN)),
    fileSuffix,
  };
}

/** In the order the size control lists them. The first window of each is the grid's. */
export const FORMATS: readonly Format[] = [
  format("reel", "Reel cover", 1920, [[3, 4], [4, 5]], "reel-cover"),
  format("post-3x4", "Post 3:4", 1440, [[3, 4]], "post"),
  format("post-4x5", "Post 4:5", 1350, [[3, 4], [4, 5]], "post"),
];

export const DEFAULT_FORMAT: FormatId = "reel";

export function formatById(id: FormatId): Format {
  return FORMATS.find((f) => f.id === id) ?? FORMATS[0];
}

export function isFormatId(value: unknown): value is FormatId {
  return FORMATS.some((f) => f.id === value);
}
