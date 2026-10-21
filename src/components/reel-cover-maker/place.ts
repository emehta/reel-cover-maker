/**
 * Where the letters sit on the cover, once the owner has moved them: moved,
 * turned and scaled about the middle of the box round them, as a
 * selection is in an illustration program.
 *
 * A placement is an offset of the box's middle, an angle, and a scale
 * across and a scale down (the same, unless a side was dragged). From it,
 * an affine matrix in the picture's own pixels, which scene.ts applies to
 * every letter, sticker and bead of paste, so they are drawn again sharp
 * where they now are, not stretched as a picture.
 *
 * A placement may also hold a width for the words to wrap to, as a text
 * box's (the owner's ask, 21 Oct): the scene is set again to it, at the
 * same size, rather than stretched.
 *
 * Here too: what each handle does when dragged, and where a point lands on
 * the box, for the page to tell which handle it is on. A corner scales and
 * keeps the box's shape, the opposite corner staying put, and with Shift
 * scales each way freely. A side re-wraps the words: the left and right
 * to a width, the top and bottom to a height (narrower lines for a taller
 * box), at the same size; with Shift it scales, keeping the shape; with
 * Cmd or Ctrl it stretches one way. Alt works from the middle; Shift on
 * the turning handle steps it by fifteen degrees.
 *
 * Pure: the tests run it.
 */

import type { Rect } from "@/components/reel-cover-maker/formats";

export interface Place {
  /** The box's middle moved by, in the picture's pixels. */
  x: number;
  y: number;
  /** Turned by, in radians, clockwise on screen. */
  angle: number;
  /** Scaled across and down. */
  sx: number;
  sy: number;
  /**
   * The width the words wrap to, in the scene's own pixels before the
   * placement scales them, as a text box's: absent, the style sets its
   * lines as it would.
   */
  wrap?: number;
  /**
   * The size the box's words were set at when it was made, and what they
   * were set in (`of`: the style and its type): a text box keeps its
   * letters' size as more is typed into it. Set in other type, the type's
   * own size is used.
   */
  wrapSize?: WrapSize;
}

/** What a text box's words were set at: the style's own measure of their size, and of its layout (scene.ts's `WrapRef`, less what is the title's own). */
export interface WrapSize {
  of: string;
  size: number;
  width: number;
  stretch?: number;
  most?: number;
  tail?: number;
  /** Stickery's plain lines' sizes as the box was made with them, by run and line. */
  fits?: Record<string, number[]>;
}

export const HOME: Place = { x: 0, y: 0, angle: 0, sx: 1, sy: 1 };

/** The narrowest and widest a text box may be set to, in the scene's pixels. */
export const MIN_WRAP = 1;
export const MAX_WRAP = 20000;

/** The least and most a box may be scaled each way. */
export const MIN_SCALE = 0.1;
export const MAX_SCALE = 8;

/** A 2D affine map, as a canvas takes it: x' = a x + c y + e, y' = b x + d y + f. */
export type Matrix = [number, number, number, number, number, number];

export type Point = { x: number; y: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Whether the letters are where the style set them: not moved, turned, scaled or re-wrapped. */
export function isHome(place: Place): boolean {
  return isUnmoved(place) && place.wrap === undefined;
}

/** Whether the placement moves nothing: the scene drawn as it is, however its words were wrapped. */
export function isUnmoved(place: Place): boolean {
  return Math.abs(place.x) < 1e-6 && Math.abs(place.y) < 1e-6 && Math.abs(place.angle) < 1e-9 && Math.abs(place.sx - 1) < 1e-9 && Math.abs(place.sy - 1) < 1e-9;
}

/** An angle brought into (-pi, pi]. */
export function wrapAngle(a: number): number {
  const t = Math.PI * 2;
  let v = a % t;
  if (v <= -Math.PI) v += t;
  if (v > Math.PI) v -= t;
  return v;
}

/** A stored placement read defensively: anything not understood is home. */
export function readPlace(value: unknown): Place {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const num = (x: unknown, fallback: number) => (typeof x === "number" && Number.isFinite(x) ? x : fallback);
  const placed: Place = {
    x: clamp(num(v.x, 0), -5000, 5000),
    y: clamp(num(v.y, 0), -5000, 5000),
    angle: wrapAngle(num(v.angle, 0)),
    sx: clamp(num(v.sx, 1), MIN_SCALE, MAX_SCALE),
    sy: clamp(num(v.sy, 1), MIN_SCALE, MAX_SCALE),
  };
  if (typeof v.wrap === "number" && Number.isFinite(v.wrap) && v.wrap > 0) {
    placed.wrap = clamp(v.wrap, MIN_WRAP, MAX_WRAP);
    const ws = readWrapSize(v.wrapSize);
    if (ws) placed.wrapSize = ws;
  }
  return placed;
}

/** A stored text box's size read defensively: null for anything not understood. */
function readWrapSize(value: unknown): WrapSize | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const positive = (x: unknown) => typeof x === "number" && Number.isFinite(x) && x > 0 && x < 1e6;
  if (typeof v.of !== "string" || !positive(v.size) || !positive(v.width)) return null;
  const out: WrapSize = { of: v.of, size: v.size as number, width: v.width as number };
  for (const k of ["stretch", "most", "tail"] as const) if (positive(v[k])) out[k] = v[k] as number;
  if (v.fits && typeof v.fits === "object" && !Array.isArray(v.fits)) {
    const fits: Record<string, number[]> = {};
    for (const [key, list] of Object.entries(v.fits as Record<string, unknown>)) {
      if (/^\d+\.\d+$/.test(key) && Array.isArray(list) && list.length && list.length < 64 && list.every((f) => typeof f === "number" && f > 0 && f < 4)) fits[key] = list as number[];
    }
    if (Object.keys(fits).length) out.fits = fits;
  }
  return out;
}

export function centre(rect: Rect): Point {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

/** The map a placement makes: about the box's middle, scaled, then turned, then moved. */
export function placeMatrix(rect: Rect, place: Place): Matrix {
  const c = centre(rect);
  const cos = Math.cos(place.angle);
  const sin = Math.sin(place.angle);
  const a = cos * place.sx;
  const b = sin * place.sx;
  const cc = -sin * place.sy;
  const d = cos * place.sy;
  return [a, b, cc, d, c.x + place.x - (a * c.x + cc * c.y), c.y + place.y - (b * c.x + d * c.y)];
}

export function apply(m: Matrix, p: Point): Point {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

/** `m` after `n`: the map that does `n`, then `m`. */
export function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function invert(m: Matrix): Matrix {
  const det = m[0] * m[3] - m[1] * m[2] || 1e-12;
  const a = m[3] / det;
  const b = -m[1] / det;
  const c = -m[2] / det;
  const d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}

/** How much a placement thickens a stroke: the scale of areas, as a length. */
export function strokeScale(place: Place): number {
  return Math.sqrt(Math.abs(place.sx * place.sy));
}

/** The smallest upright box round a rectangle once mapped. */
export function mappedBounds(m: Matrix, rect: Rect): Rect {
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.w, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.h },
    { x: rect.x, y: rect.y + rect.h },
  ].map((p) => apply(m, p));
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** The eight handles round a box, by where they sit on it: -1, 0 or 1 across and down from its middle. */
export const HANDLES: readonly { id: string; u: -1 | 0 | 1; v: -1 | 0 | 1 }[] = [
  { id: "nw", u: -1, v: -1 },
  { id: "n", u: 0, v: -1 },
  { id: "ne", u: 1, v: -1 },
  { id: "e", u: 1, v: 0 },
  { id: "se", u: 1, v: 1 },
  { id: "s", u: 0, v: 1 },
  { id: "sw", u: -1, v: 1 },
  { id: "w", u: -1, v: 0 },
];

/** A point of the box, -1 to 1 across and down from its middle, where it now is on the cover. */
export function boxPoint(rect: Rect, place: Place, u: number, v: number): Point {
  const c = centre(rect);
  return apply(placeMatrix(rect, place), { x: c.x + (u * rect.w) / 2, y: c.y + (v * rect.h) / 2 });
}

/**
 * A placement for a box that has grown or shrunk from `before` to `after`
 * (more typed into a text box): moved so the middle of its top edge stays
 * where it was on the cover, however it is scaled or turned, so the box
 * grows down from its top, as a text box does.
 */
export function keepTop(before: Rect, after: Rect, place: Place): Place {
  const held = boxPoint(before, place, 0, -1);
  const moved = boxPoint(after, { ...place, x: 0, y: 0 }, 0, -1);
  return { ...place, x: held.x - moved.x, y: held.y - moved.y };
}

/** The box's four corners on the cover, clockwise from the top left. */
export function boxCorners(rect: Rect, place: Place): Point[] {
  return [boxPoint(rect, place, -1, -1), boxPoint(rect, place, 1, -1), boxPoint(rect, place, 1, 1), boxPoint(rect, place, -1, 1)];
}

/**
 * Where the turning handle sits: `reach` pixels of the picture out from the
 * middle of the box's top, or of its bottom with `side` 1 (where the top's
 * would be off the cover, out of reach).
 */
export function turnHandle(rect: Rect, place: Place, reach: number, side: -1 | 1 = -1): Point {
  const edge = boxPoint(rect, place, 0, side);
  // Outward from that side, turned with the box (a box flipped by a negative scale still faces the same way on screen).
  const out = { x: -Math.sin(place.angle) * side, y: Math.cos(place.angle) * side };
  const facing = place.sy < 0 ? -1 : 1;
  return { x: edge.x + out.x * reach * facing, y: edge.y + out.y * reach * facing };
}

/** Which side of the box the turning handle goes on: above it, unless that would be off the cover. */
export function turnSide(rect: Rect, place: Place, reach: number, cover: { w: number; h: number }): -1 | 1 {
  const up = turnHandle(rect, place, reach, -1);
  return up.x >= 0 && up.x <= cover.w && up.y >= 0 && up.y <= cover.h ? -1 : 1;
}

/** A point given in the cover's pixels, in the box's own frame before its placement: what `rect` is drawn in. */
export function toBox(rect: Rect, place: Place, p: Point): Point {
  return apply(invert(placeMatrix(rect, place)), p);
}

export function insideBox(rect: Rect, place: Place, p: Point, pad = 0): boolean {
  const q = toBox(rect, place, p);
  // The pad is in the cover's pixels: in the box's frame it shrinks with the scale.
  const px = pad / Math.max(1e-6, Math.abs(place.sx));
  const py = pad / Math.max(1e-6, Math.abs(place.sy));
  return q.x >= rect.x - px && q.x <= rect.x + rect.w + px && q.y >= rect.y - py && q.y <= rect.y + rect.h + py;
}

/** The placement moved by a drag of (dx, dy). */
export function moveBy(place: Place, dx: number, dy: number): Place {
  return { ...place, x: place.x + dx, y: place.y + dy };
}

/**
 * The placement a handle dragged to `p` makes, from the placement `from`
 * when the drag began. A corner scales both ways by one factor (the box
 * keeps its shape), or each its own way with `free`; a side scales one
 * way only. The opposite corner or side stays where it was, or, with
 * `fromMiddle`, the box's middle does. Never scaled below MIN_SCALE, never
 * turned inside out.
 */
export function dragHandle(rect: Rect, from: Place, handle: { u: number; v: number }, p: Point, options: { free?: boolean; fromMiddle?: boolean; keep?: boolean } = {}): Place {
  const c = centre(rect);
  const cos = Math.cos(from.angle);
  const sin = Math.sin(from.angle);
  const middle = { x: c.x + from.x, y: c.y + from.y };
  // The pointer in the box's turned frame (not yet scaled), from its middle.
  const rx = (p.x - middle.x) * cos + (p.y - middle.y) * sin;
  const ry = -(p.x - middle.x) * sin + (p.y - middle.y) * cos;
  const half = { x: rect.w / 2, y: rect.h / 2 };
  // The point that stays: the opposite handle, or the middle.
  const anchor = options.fromMiddle ? { u: 0, v: 0 } : { u: -handle.u, v: -handle.v };
  const ax = anchor.u * half.x * from.sx;
  const ay = anchor.v * half.y * from.sy;
  // How far the handle should now be from the anchor, each way, against how far it was.
  const span = (pointer: number, anchorAt: number, u: number, size: number, scale: number) => {
    if (u === 0) return scale;
    const reach = options.fromMiddle ? Math.abs(pointer) : (pointer - anchorAt) * u * 0.5;
    return clamp(reach / size, MIN_SCALE, MAX_SCALE) * Math.sign(scale || 1);
  };
  let sx = span(rx, ax, handle.u, half.x, from.sx);
  let sy = span(ry, ay, handle.v, half.y, from.sy);
  // A side with `keep`: the other way scaled by as much, so the box keeps its shape about the side that stays.
  if (options.keep && (handle.u === 0) !== (handle.v === 0)) {
    const k = handle.u !== 0 ? sx / from.sx : sy / from.sy;
    const lo = MIN_SCALE / Math.min(Math.abs(from.sx), Math.abs(from.sy));
    const hi = MAX_SCALE / Math.max(Math.abs(from.sx), Math.abs(from.sy));
    const f = clamp(k, lo, hi);
    sx = from.sx * f;
    sy = from.sy * f;
  }
  if (handle.u !== 0 && handle.v !== 0 && !options.free) {
    // A corner keeps the box's shape: one factor, from the pointer projected on the diagonal.
    const dx = handle.u * half.x * from.sx * (options.fromMiddle ? 1 : 2);
    const dy = handle.v * half.y * from.sy * (options.fromMiddle ? 1 : 2);
    const vx = options.fromMiddle ? rx : rx - ax;
    const vy = options.fromMiddle ? ry : ry - ay;
    const k = clamp((vx * dx + vy * dy) / Math.max(1e-9, dx * dx + dy * dy), MIN_SCALE / Math.min(Math.abs(from.sx), Math.abs(from.sy)), MAX_SCALE / Math.max(Math.abs(from.sx), Math.abs(from.sy)));
    sx = from.sx * k;
    sy = from.sy * k;
  }
  if (options.fromMiddle) return { ...from, sx, sy };
  // The anchor stays put: the middle moves to keep it where it was.
  const anchorBefore = { x: ax, y: ay };
  const anchorAfter = { x: anchor.u * half.x * sx, y: anchor.v * half.y * sy };
  const shiftX = anchorBefore.x - anchorAfter.x;
  const shiftY = anchorBefore.y - anchorAfter.y;
  return { ...from, sx, sy, x: from.x + shiftX * cos - shiftY * sin, y: from.y + shiftX * sin + shiftY * cos };
}

/**
 * The text box re-wrapped by a side handle dragged to `p`, from `from` when
 * the drag began on `rect` (the box then): the left or right handle sets
 * the width the words wrap to, the top or bottom one the height they
 * should come to, which a narrower or wider wrap gives. `boxAt` is the box
 * the scene makes for a wrap width, in its own pixels (the scene is set
 * again for it, its letters the same size); it may keep the width from
 * going narrower than its longest word. The side opposite the one dragged
 * stays where it was: for the left or right handle its top too, as a text
 * box grows downward; for the top or bottom, its middle. With
 * `fromMiddle`, the middle stays (the top, for the left or right).
 */
export function wrapTo(
  rect: Rect,
  from: Place,
  handle: { u: number; v: number },
  p: Point,
  boxAt: (wrap: number) => Rect,
  options: { fromMiddle?: boolean; least?: number; most?: number; hug?: (wrap: number) => number } = {},
): Place {
  const c = centre(rect);
  const m = placeMatrix(rect, from);
  // The pointer in the box's own frame, where the scene is set.
  const q = apply(invert(m), p);
  const width = rect.w;
  const height = rect.h;
  // Moved by as far as the pointer has come from the side grabbed: the drawn box can be wider than its wrap (paste swelling past it), and the wrap must not jump to the drawn edge.
  const start = from.wrap ?? width;
  const twice = options.fromMiddle ? 2 : 1;
  let wrap: number;
  if (handle.u !== 0) {
    const grabbed = c.x + handle.u * (width / 2);
    wrap = start + (q.x - grabbed) * handle.u * twice;
  } else {
    const grabbed = c.y + handle.v * (height / 2);
    const target = Math.max(1, height + (q.y - grabbed) * handle.v * twice);
    // The words keep their size, so their area does too: the width that comes to the height asked, then once more from where that landed.
    const lo = Math.max(MIN_WRAP, options.least ?? MIN_WRAP);
    const hi = Math.min(MAX_WRAP, options.most ?? MAX_WRAP);
    const first = clamp((start * height) / target, lo, hi);
    const got = boxAt(first);
    const second = clamp((first * got.h) / target, lo, hi);
    const again = boxAt(second);
    // Whichever of the lines there are now and the two tried comes nearest
    // the height asked; the lines there are now on a tie, so a pixel's pull
    // that changes no line changes nothing. Then as narrow as those lines
    // let it be, so the frame hugs the words rather than running wide of
    // them (a style whose lines cannot get fewer would otherwise be pulled
    // wider with nothing in the room).
    const tried = [
      { w: start, h: height },
      { w: first, h: got.h },
      { w: second, h: again.h },
    ];
    let best = tried[0];
    for (const t of tried.slice(1)) if (Math.abs(t.h - target) < Math.abs(best.h - target) - 0.5) best = t;
    wrap = best.w;
    if (best !== tried[0] && options.hug) {
      const hugged = clamp(options.hug(best.w), lo, hi);
      if (hugged < best.w && Math.abs(boxAt(hugged).h - best.h) < 0.5) wrap = hugged;
    }
  }
  // Never narrower than its widest word, never wider than the box may go.
  wrap = clamp(wrap, Math.max(MIN_WRAP, options.least ?? MIN_WRAP), Math.min(MAX_WRAP, options.most ?? MAX_WRAP));
  const next = boxAt(wrap);
  const nc = centre(next);
  // The point that stays, before and after: for the left or right handle,
  // the top of the opposite side (or of the middle); for the top or bottom,
  // the middle of the opposite edge (or the box's middle).
  const u = options.fromMiddle ? 0 : -handle.u;
  const v = options.fromMiddle ? 0 : -handle.v;
  const pin = (box: Rect, bc: Point): Point => (handle.u !== 0 ? { x: bc.x + (u * box.w) / 2, y: bc.y - box.h / 2 } : { x: bc.x, y: bc.y + (v * box.h) / 2 });
  const before = pin(rect, c);
  const after = pin(next, nc);
  const held = apply(m, before);
  const moved = apply(placeMatrix(next, { ...from, x: 0, y: 0 }), after);
  return { ...from, wrap, x: held.x - moved.x, y: held.y - moved.y };
}

/**
 * The placement the turning handle dragged to `p` makes, from `from` when
 * the drag began at `start`: turned by as much as the pointer has gone
 * round the box's middle. With `step`, in steps of fifteen degrees; and
 * otherwise drawn to an upright or a quarter turn within three degrees.
 */
export function turnTo(rect: Rect, from: Place, start: Point, p: Point, step = false): Place {
  const c = centre(rect);
  const middle = { x: c.x + from.x, y: c.y + from.y };
  const turn = Math.atan2(p.y - middle.y, p.x - middle.x) - Math.atan2(start.y - middle.y, start.x - middle.x);
  let angle = wrapAngle(from.angle + turn);
  const deg = (angle * 180) / Math.PI;
  if (step) angle = (Math.round(deg / 15) * 15 * Math.PI) / 180;
  else {
    const nearest = Math.round(deg / 90) * 90;
    if (Math.abs(deg - nearest) < 3) angle = (nearest * Math.PI) / 180;
  }
  return { ...from, angle: wrapAngle(angle) };
}

/**
 * Two fingers on the box: moved with their middle, scaled by how far they
 * spread, turned by how far they turn, about where they began.
 */
export function pinchTo(rect: Rect, from: Place, a0: Point, b0: Point, a: Point, b: Point): Place {
  const c = centre(rect);
  const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y) || 1;
  const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const k = clamp(d / d0, MIN_SCALE / Math.min(Math.abs(from.sx), Math.abs(from.sy)), MAX_SCALE / Math.max(Math.abs(from.sx), Math.abs(from.sy)));
  const turn = Math.atan2(b.y - a.y, b.x - a.x) - Math.atan2(b0.y - a0.y, b0.x - a0.x);
  const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  // The box's middle, carried with the fingers: turned and scaled about where they began, then moved with them.
  const middle = { x: c.x + from.x - m0.x, y: c.y + from.y - m0.y };
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const moved = { x: m.x + k * (middle.x * cos - middle.y * sin), y: m.y + k * (middle.x * sin + middle.y * cos) };
  return { ...from, x: moved.x - c.x, y: moved.y - c.y, angle: wrapAngle(from.angle + turn), sx: from.sx * k, sy: from.sy * k };
}

/** The placement scaled by `k` about a point of the cover, which stays where it is: a trackpad's pinch or a key, over the letters. */
export function scaleAbout(rect: Rect, from: Place, k: number, at: Point): Place {
  const c = centre(rect);
  const f = clamp(k, MIN_SCALE / Math.min(Math.abs(from.sx), Math.abs(from.sy)), MAX_SCALE / Math.max(Math.abs(from.sx), Math.abs(from.sy)));
  const middle = { x: c.x + from.x, y: c.y + from.y };
  return { ...from, sx: from.sx * f, sy: from.sy * f, x: at.x + (middle.x - at.x) * f - c.x, y: at.y + (middle.y - at.y) * f - c.y };
}

/** The placement turned by `by` radians about the box's middle. */
export function turnBy(from: Place, by: number): Place {
  return { ...from, angle: wrapAngle(from.angle + by) };
}

/**
 * A moved box drawn to the cover's middle, each way on its own, when its
 * middle comes within `reach` pixels of it: the guides the page then shows.
 */
export function snapToMiddle(rect: Rect, place: Place, cover: { w: number; h: number }, reach: number): { place: Place; across: boolean; down: boolean } {
  const c = centre(rect);
  const mx = c.x + place.x;
  const my = c.y + place.y;
  const across = Math.abs(mx - cover.w / 2) < reach;
  const down = Math.abs(my - cover.h / 2) < reach;
  return {
    place: { ...place, x: across ? cover.w / 2 - c.x : place.x, y: down ? cover.h / 2 - c.y : place.y },
    across,
    down,
  };
}

/** A placement whose box's middle is kept on the cover, so the letters can never be lost off its edge. */
export function keepOnCover(rect: Rect, place: Place, cover: { w: number; h: number }): Place {
  const c = centre(rect);
  return { ...place, x: clamp(c.x + place.x, 0, cover.w) - c.x, y: clamp(c.y + place.y, 0, cover.h) - c.y };
}
