/**
 * Ripple (the owner's ask, 10 Nov, in Echo's place): the bold word seen
 * through fluted glass, as the owner picked it in the ripple studies of 9
 * Nov (B Contour, its horizontal trail ended sooner, I Tight). Everything
 * else in the title is set plainly.
 *
 * The rippled word stands on a line of its own, large, with room beside it
 * (Horizontal: upright flutes, a trail of crescents running out past its
 * first and last letters) or above and below it (Vertical: level slats,
 * every letter throwing arcs both ways). The plain words are the same face,
 * smaller, centred above and below it in the order they were typed. With no
 * word bold, the longest word ripples.
 *
 * The glass itself is a shader (glass-gl.ts) drawn at paint time: the word's
 * letters as an exact distance field (`glassField`), read through each
 * flute at 32 wavelengths, each bent by its own amount, so the light comes
 * apart into the poster's fringes. Here is everything about it that is not
 * the browser's: the flutes' settings, the layout, where the glass may ink,
 * the motion measured from the reference video, and the field.
 *
 * Pure: the tests run it.
 */

import type { FaceId, Measurer } from "@/components/reel-cover-maker/faces";
import type { Rect } from "@/components/reel-cover-maker/formats";
import { flow, narrowestAt, type Block } from "@/components/reel-cover-maker/layout";
import type { Palette } from "@/components/reel-cover-maker/palettes";
import type { Op, Scene } from "@/components/reel-cover-maker/scene";
import type { Paragraph, Word } from "@/components/reel-cover-maker/title";

/** Which way the flutes run: Horizontal bends the word across (upright flutes), Vertical up and down (level slats). */
export type GlassAxis = "h" | "v";

export const GLASS_AXES: readonly { id: GlassAxis; name: string }[] = [
  { id: "h", name: "Horizontal" },
  { id: "v", name: "Vertical" },
];

export const DEFAULT_GLASS_AXIS: GlassAxis = "h";

export function isGlassAxis(value: unknown): value is GlassAxis {
  return value === "h" || value === "v";
}

/** Inter Tight at its heaviest, the face the studies were made in. */
export const GLASS_FACE: FaceId = "heavy";

/**
 * Where the glass is in its motion: how strongly the flutes bend (`glass`),
 * how far the echoes reach out (`reach`), how much the light is split
 * (`colour`, which follows the glass a tenth of a second behind, so echoes
 * are born white), and how fast the glass is moving (`speed`, of its
 * fastest). Held open, all of it is at its fullest and still.
 */
export interface GlassMoment {
  glass: number;
  reach: number;
  colour: number;
  speed: number;
}

export const OPEN: GlassMoment = { glass: 1, reach: 1, colour: 1, speed: 0 };

/**
 * The rippled word: set as a text op is (from `x` on the baseline `y`), in
 * `color` and lit for `ground` (the cover's own, so its file is clear but
 * for the letters and their light), the flutes running as `axis` has them.
 * `at` is a moment of the motion; absent, the glass is held open (the
 * still cover).
 */
export interface GlassOp {
  kind: "glass";
  text: string;
  face: FaceId;
  size: number;
  x: number;
  y: number;
  color: string;
  ground: string;
  axis: GlassAxis;
  at?: GlassMoment;
}

/**
 * The flutes, as the owner picked them (the studies' B Contour; the
 * horizontal's trail fading out over 8 flutes, I Tight). Lengths were set
 * against the word "Ripple": here they are in em of the word's own size, so
 * any word has the same flutes for its size. `pitch` is a flute's width.
 * The rest are the studies' own numbers, word for word.
 */
export interface Flutes {
  pitch: number;
  /** The run each echo's depth and thinning are reckoned over, in flutes, and how many flutes out they still show. */
  echoes: number;
  fadeTo: number;
  /** Each column's own top and bottom (Vertical), or the word's two ends (Horizontal). */
  local: boolean;
  /** Columns with no ink, beside or between letters, show the glass as it is (Vertical). */
  sides: boolean;
  /**
   * How strongly the glass bends the letters themselves through each flute,
   * of the studies' (the echoes keep theirs): at a cover's size on a screen,
   * the studies' bend broke every curve into steps at the flute lines, which
   * read as pixels (the owner, 10 Nov: "make sure it doesn't look pixelated").
   */
  letterBend: number;
  fan: number;
  fanPow: number;
  echoAnchor: number;
  echoStep: number;
  bow: number;
  bowOut: number;
  squeeze: number;
  squeezeTip: number;
  squeezeEcho: number;
  curve: number;
  bendFloor: number;
  face: number;
  kappaOut: number;
  kappaFan: number;
  kappaB: number;
  fmax: number;
  echoFade: number;
  echoSoft: number;
}

/** "Ripple" in Inter Tight at 900: its ink's width and height, in em, as a canvas measures them. The studies' lengths were set against it. */
export const REFERENCE_INK = { w: 2.96484375, h: 0.98535156 };

/**
 * The blur and widest fringe of the page the owner approved, at a desktop's
 * width, were in pixels of a word "Ripple" this many pixels wide: here they
 * scale with the word's own size, so the glass is as crisp at any size (on
 * a thumbnail as on the download). (At 339, the smaller stage the studies
 * began on, a review found the letters softer than the approved page.)
 */
export const REFERENCE_WORD_PX = 624;

const COMMON = {
  letterBend: 0.5,
  fan: 0.12,
  fanPow: 1.4,
  echoAnchor: 0.98,
  echoStep: 0.18,
  bow: 1.6,
  bowOut: 0.7,
  squeeze: 0.5,
  squeezeTip: -0.2,
  squeezeEcho: -3,
  curve: 0.25,
  bendFloor: 0.7,
  face: 0.35,
  kappaOut: 0.3,
  kappaFan: -0.28,
  fmax: 16,
  echoFade: 0.85,
  echoSoft: 0.3,
};

export const FLUTES: Record<GlassAxis, Flutes> = {
  // Upright flutes 0.06 of the word's half width (in the studies), 12 echoes' run, gone 8 out.
  h: { ...COMMON, pitch: (0.06 * REFERENCE_INK.w) / 2, echoes: 12, fadeTo: 8, local: false, sides: false, kappaB: 0.12 },
  // Level slats 0.18 of its half height, 6 echoes up and down.
  v: { ...COMMON, pitch: (0.18 * REFERENCE_INK.h) / 2, echoes: 6, fadeTo: 6, local: true, sides: true, kappaB: 0.04 },
};

/**
 * How far past the word's ink, along the bend, its letters themselves are
 * drawn, as a share of the ink's extent that way: the end flutes show the
 * word moved out (`fan`, 0.06 a side) and its edge's fringe a little beyond.
 */
export const GLASS_PUSH = 0.08;

/** How far its fringe reaches across the bend, as a share of the ink's extent that way. */
export const GLASS_ACROSS = 0.04;

/** The word's ink, in pixels of the picture. */
export function glassInk(op: Pick<GlassOp, "face" | "text" | "size" | "x" | "y">, measurer: Pick<Measurer, "bounds">): Rect {
  const b = measurer.bounds(op.face, op.text);
  return { x: op.x - b.left * op.size, y: op.y - b.ascent * op.size, w: (b.left + b.right) * op.size, h: (b.ascent + b.descent) * op.size };
}

/** Where the letters of the rippled word are drawn, pushed out and fringed: what must be read, and stay in the safe area. */
export function glassReadable(op: Pick<GlassOp, "face" | "text" | "size" | "x" | "y" | "axis">, measurer: Pick<Measurer, "bounds">): Rect {
  const ink = glassInk(op, measurer);
  return op.axis === "h" ? grow(ink, GLASS_PUSH * ink.w, GLASS_ACROSS * ink.h) : grow(ink, GLASS_ACROSS * ink.w, GLASS_PUSH * ink.h);
}

/**
 * Everything the glass may ink, its echoes too: the trail out to where it
 * fades to nothing (and a flute more), its fringes. Ornament: free to leave
 * the safe area, but kept inside what every window shows, so no trail is
 * cut by the grid's edge.
 */
export function glassReach(op: Pick<GlassOp, "face" | "text" | "size" | "x" | "y" | "axis">, measurer: Pick<Measurer, "bounds">): Rect {
  const read = glassReadable(op, measurer);
  const f = FLUTES[op.axis];
  const trail = (f.fadeTo + 1) * f.pitch * op.size;
  return op.axis === "h" ? grow(read, trail, 0) : grow(read, 0, trail);
}

function grow(r: Rect, x: number, y: number): Rect {
  return { x: r.x - x, y: r.y - y, w: r.w + 2 * x, h: r.h + 2 * y };
}

/* ------------------------------------------------------------------ layout */

/**
 * The plain words' size against the rippled word's: `PLAIN_SHARE`, or less,
 * down to `PLAIN_LEAST`, where a plain word would otherwise be wider than
 * the widest rippled line (a review: "SUMMERTIME" round a rippled "OF"
 * outgrew it and held it small).
 */
export const PLAIN_SHARE = 0.4;
export const PLAIN_LEAST = 0.25;

/** The plain lines' baseline to baseline, in em. */
const PLAIN_LEADING = 1.04;

/**
 * A run of bold words wider than this, in em, is broken at its spaces into
 * even lines through the glass, each a rippled line of its own (a review:
 * "the *ripple effect*" on one line came out a thin band): by its own words
 * alone, so a text box sets it the same at any width.
 */
export const GLASS_LINE_EM = 5;

/** The rippled word at its largest, in pixels of the picture: a short word on its own. */
export const MAX_GLASS_SIZE = 420;

/** Horizontal: the rippled word's letters this share of its size clear of the plain lines' ink; and of another rippled line. */
const GAP_H = 0.16;
const GAP_HH = 0.14;

/** Vertical: past its arcs, this much more of its size clear of a plain line. */
const GAP_V = 0.06;

/** What the cover is made of: lines of plain words, or a rippled line. */
type Piece = { kind: "plain"; paragraphs: Paragraph[] } | { kind: "glass"; text: string };

const wordText = (w: Word) => w.map((s) => s.text).join("");

/**
 * The title as pieces in the order it reads: each run of bold words a
 * rippled line of its own (a line typed between two runs keeps them apart),
 * and the plain words around them as blocks of lines, a typed line break
 * kept. With nothing bold, the longest word ripples (the first, if two are
 * as long).
 */
export function glassPieces(paragraphs: Paragraph[], measurer: Pick<Measurer, "width">): Piece[] {
  const bold = paragraphs.some((p) => p.some((w) => w.some((s) => s.emphasis)));
  let longest = [-1, -1];
  if (!bold) {
    let most = -1;
    paragraphs.forEach((p, pi) =>
      p.forEach((w, wi) => {
        const text = wordText(w);
        // A word of no letter or figure (an emoji) is no word to see through the glass: as a shape alone, it loses its colours.
        if (!/[\p{L}\p{N}]/u.test(text)) return;
        const width = measurer.width(GLASS_FACE, text);
        if (width > most + 1e-9) {
          most = width;
          longest = [pi, wi];
        }
      }),
    );
  }
  const rippled = (pi: number, wi: number) => (bold ? paragraphs[pi][wi].some((s) => s.emphasis) : pi === longest[0] && wi === longest[1]);
  const out: Piece[] = [];
  let plain: Paragraph[] = [];
  const closePlain = () => {
    if (plain.some((p) => p.length)) out.push({ kind: "plain", paragraphs: plain.filter((p) => p.length) });
    plain = [];
  };
  paragraphs.forEach((p, pi) => {
    let line: Word[] = [];
    let run: string[] = [];
    const closeRun = () => {
      if (!run.length) return;
      if (line.length) plain.push(line);
      line = [];
      closePlain();
      for (const text of evenLines(run, measurer)) out.push({ kind: "glass", text });
      run = [];
    };
    p.forEach((w, wi) => {
      if (rippled(pi, wi)) run.push(wordText(w));
      else {
        closeRun();
        line.push(w.map((s) => ({ text: s.text, emphasis: false })));
      }
    });
    closeRun();
    if (line.length) plain.push(line);
  });
  closePlain();
  return out;
}

/** A run of bold words as lines through the glass: one, or if wider than `GLASS_LINE_EM`, as few as come under it, broken where the longest line is shortest. */
function evenLines(words: string[], measurer: Pick<Measurer, "width">): string[] {
  const n = words.length;
  const span: number[][] = Array.from({ length: n }, () => new Array<number>(n + 1).fill(0));
  for (let a = 0; a < n; a += 1) for (let b = a + 1; b <= n; b += 1) span[a][b] = measurer.width(GLASS_FACE, words.slice(a, b).join(" "));
  if (n < 2 || span[0][n] <= GLASS_LINE_EM) return [words.join(" ")];
  const lines = Math.min(n, Math.ceil(span[0][n] / GLASS_LINE_EM));
  // The narrowest widest line for the first b words in l lines, and where its last line starts.
  const best: number[][] = Array.from({ length: lines + 1 }, () => new Array<number>(n + 1).fill(Infinity));
  const from: number[][] = Array.from({ length: lines + 1 }, () => new Array<number>(n + 1).fill(0));
  best[0][0] = 0;
  for (let l = 1; l <= lines; l += 1) {
    for (let b = l; b <= n; b += 1) {
      for (let a = l - 1; a < b; a += 1) {
        const widest = Math.max(best[l - 1][a], span[a][b]);
        if (widest < best[l][b] - 1e-9) {
          best[l][b] = widest;
          from[l][b] = a;
        }
      }
    }
  }
  const out: string[] = [];
  for (let l = lines, b = n; l > 0; l -= 1) {
    const a = from[l][b];
    out.unshift(words.slice(a, b).join(" "));
    b = a;
  }
  return out;
}

/** The plain words' share of the rippled lines' size, by the title's own words (`PLAIN_SHARE`). */
export function plainShare(pieces: Piece[], measurer: Pick<Measurer, "width" | "bounds">): number {
  let rippled = 0;
  let plain = 0;
  for (const piece of pieces) {
    if (piece.kind === "glass") {
      const b = measurer.bounds(GLASS_FACE, piece.text);
      rippled = Math.max(rippled, b.left + b.right);
    } else {
      for (const p of piece.paragraphs) for (const w of p) plain = Math.max(plain, measurer.width(GLASS_FACE, wordText(w)));
    }
  }
  if (!(rippled > 0) || !(plain > 0)) return PLAIN_SHARE;
  return Math.min(PLAIN_SHARE, Math.max(PLAIN_LEAST, rippled / plain));
}

/** A piece set at a size: its lines (plain) or its word (rippled), where it inks and what must be read of it. */
type SetPiece =
  | { kind: "plain"; block: Block }
  | { kind: "glass"; op: GlassOp; readable: Rect; reach: Rect };

interface Stack {
  pieces: SetPiece[];
  /** What must be read, all of it, and what the glass may ink beyond it. */
  readable: Rect;
  reach: Rect;
}

/** How far apart two pieces stand, ink to ink, in pixels of the picture. */
function gapBetween(a: SetPiece, b: SetPiece, axis: GlassAxis, size: number): number {
  if (a.kind === "plain" && b.kind === "plain") return 0;
  if (axis === "h") return (a.kind === "glass" && b.kind === "glass" ? GAP_HH : GAP_H) * size;
  // Vertical: a rippled line's arcs run up and down; a plain line stands clear of them, and two rippled lines' arcs never meet.
  const arcs = (FLUTES.v.fadeTo + 0.5) * FLUTES.v.pitch * size;
  return a.kind === "glass" && b.kind === "glass" ? 2 * arcs : arcs + GAP_V * size;
}

const union = (rects: Rect[]): Rect => {
  const x0 = Math.min(...rects.map((r) => r.x));
  const y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.w));
  const y1 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};

/** Room flow keeps a line short of its box, so a line exactly `width` wide fits a box this wide. */
const boxFor = (width: number) => width / 0.995 + 1e-6;

/**
 * Every piece at `size` (the rippled lines' size; the plain lines' is
 * `PLAIN_SHARE` of it), the plain lines wrapped to `width`, stacked down
 * from the top in order, each line centred on `cx`; then the whole moved so
 * its readable part is centred on `cy`.
 */
function stack(pieces: Piece[], size: number, share: number, width: number, cx: number, cy: number, axis: GlassAxis, palette: Palette, measurer: Measurer): Stack {
  const plainSize = share * size;
  const set: SetPiece[] = pieces.map((piece) => {
    if (piece.kind === "plain") {
      const block = flow(
        piece.paragraphs,
        { face: GLASS_FACE, emphasisFace: GLASS_FACE, leading: PLAIN_LEADING, align: "center", box: { x: cx - boxFor(width) / 2, y: 0, w: boxFor(width), h: 1e6 }, maxSize: plainSize, minSize: plainSize, fixedSize: true },
        measurer,
      );
      return { kind: "plain", block };
    }
    const b = measurer.bounds(GLASS_FACE, piece.text);
    // Centred by its ink: the glass is centred on it, and its trail runs out evenly both ways.
    const op: GlassOp = { kind: "glass", text: piece.text, face: GLASS_FACE, size, x: cx - ((b.right - b.left) / 2) * size, y: 0, color: palette.ink, ground: palette.bg, axis };
    return { kind: "glass", op, readable: glassReadable(op, measurer), reach: glassReach(op, measurer) };
  });
  // Down the page, each piece's ink its gap below the one before's: a plain line's own letters, not its face's whole height (a review:
  // a plain "my" stood nearer the arcs under it than over it, its x-height letters short of the face's ascent).
  const inkOf = (line: Block["lines"][number], down: boolean) =>
    Math.max(0, ...line.segments.map((sg) => (down ? measurer.bounds(sg.face, sg.text).descent : measurer.bounds(sg.face, sg.text).ascent) * sg.size));
  const top = (p: SetPiece) => (p.kind === "plain" ? (p.block.lines.length ? p.block.lines[0].baseline - inkOf(p.block.lines[0], false) : p.block.bounds.y) : p.readable.y);
  const bottom = (p: SetPiece) => {
    if (p.kind !== "plain") return p.readable.y + p.readable.h;
    const last = p.block.lines[p.block.lines.length - 1];
    return last ? last.baseline + inkOf(last, true) : p.block.bounds.y + p.block.bounds.h;
  };
  const moved: SetPiece[] = [];
  let y = 0;
  set.forEach((p, i) => {
    const want = i === 0 ? 0 : y + gapBetween(set[i - 1], p, axis, size);
    const dy = want - top(p);
    const shifted = shiftPiece(p, dy);
    moved.push(shifted);
    y = bottom(shifted);
  });
  const readable = union(moved.map((p) => (p.kind === "plain" ? p.block.bounds : p.readable)));
  const dy = cy - (readable.y + readable.h / 2);
  const placed = moved.map((p) => shiftPiece(p, dy));
  const glassReaches = placed.flatMap((p) => (p.kind === "glass" ? [p.reach] : []));
  return { pieces: placed, readable: { ...readable, y: readable.y + dy }, reach: union([{ ...readable, y: readable.y + dy }, ...glassReaches]) };
}

function shiftPiece(p: SetPiece, dy: number): SetPiece {
  if (!dy) return p;
  if (p.kind === "plain") {
    const block = p.block;
    return { kind: "plain", block: { ...block, lines: block.lines.map((l) => ({ ...l, baseline: l.baseline + dy })), bounds: { ...block.bounds, y: block.bounds.y + dy } } };
  }
  return { kind: "glass", op: { ...p.op, y: p.op.y + dy }, readable: { ...p.readable, y: p.readable.y + dy }, reach: { ...p.reach, y: p.reach.y + dy } };
}

/** The narrowest the plain lines can be wrapped at `size` (the rippled lines' size), and the rippled lines' own width: no box is narrower. */
function narrowest(pieces: Piece[], size: number, share: number, measurer: Measurer, axis: GlassAxis): number {
  let most = 0;
  for (const piece of pieces) {
    if (piece.kind === "plain") most = Math.max(most, narrowestAt(piece.paragraphs, { face: GLASS_FACE, emphasisFace: GLASS_FACE, leading: PLAIN_LEADING, align: "center" }, measurer, share * size) * 0.995);
    else {
      const op = { face: GLASS_FACE, text: piece.text, size, x: 0, y: 0, axis };
      most = Math.max(most, glassReadable(op, measurer).w);
    }
  }
  return most;
}

/** What `ripple` gives buildScene: its ops, what must be read, and what a text box sets it again from. */
export interface GlassMade {
  ops: (GlassOp | { kind: "text"; text: string; face: FaceId; size: number; x: number; y: number; color: string })[];
  readable: Rect;
  ref?: { size: number; width: number };
  wrapped?: { width: number; min: number };
}

/**
 * The title set as Ripple sets it, in `safe` (the text) and `seen` (what
 * every window shows: the glass's trail must not be cut by the grid's
 * edge). Unwrapped, as large as fits; as a text box, at the size it was set
 * at, its plain lines wrapped to the box's width (never under its widest
 * word or its rippled lines, which are never broken).
 */
export function ripple(paragraphs: Paragraph[], safe: Rect, seen: Rect, palette: Palette, measurer: Measurer, axis: GlassAxis, wrap: { width: number; ref: { size: number } } | null): GlassMade {
  const pieces = glassPieces(paragraphs, measurer);
  const share = plainShare(pieces, measurer);
  const cx = safe.x + safe.w / 2;
  const cy = safe.y + safe.h / 2;
  if (!pieces.length) return { ops: [], readable: { x: cx, y: cy, w: 0, h: 0 } };
  const room = { x: seen.x + seen.w * 0.02, y: seen.y + seen.w * 0.02, w: seen.w * 0.96, h: seen.h - seen.w * 0.04 };
  const opsOf = (st: Stack): GlassMade["ops"] =>
    st.pieces.flatMap((p): GlassMade["ops"] =>
      p.kind === "glass"
        ? [p.op]
        : p.block.lines.flatMap((line) => line.segments.map((s) => ({ kind: "text" as const, text: s.text, face: s.face, size: s.size, x: s.x, y: line.baseline, color: palette.ink }))),
    );

  if (wrap) {
    const size = wrap.ref.size;
    const min = narrowest(pieces, size, share, measurer, axis);
    const width = Math.max(wrap.width, min);
    const st = stack(pieces, size, share, width, cx, cy, axis, palette, measurer);
    return { ops: opsOf(st), readable: st.readable, wrapped: { width, min } };
  }

  // As large as fits: every word inside the safe area (no plain word broken, no rippled line wider than it), and the glass's trail inside every window.
  // Every width grows with the size, so how large the widths allow is worked out at once; only the height (how the plain lines break) is searched for.
  const perEm = narrowest(pieces, 1, share, measurer, axis);
  let most = Math.min(MAX_GLASS_SIZE, safe.w / Math.max(1e-9, perEm));
  for (const piece of pieces) {
    if (piece.kind !== "glass") continue;
    const reach = glassReach({ face: GLASS_FACE, text: piece.text, size: 1, x: 0, y: 0, axis }, measurer);
    most = Math.min(most, room.w / Math.max(1e-9, reach.w));
  }
  const fits = (size: number): boolean => {
    const st = stack(pieces, size, share, safe.w, cx, cy, axis, palette, measurer);
    if (st.readable.h > safe.h || st.readable.w > safe.w + 1e-6) return false;
    return st.reach.x >= room.x - 1e-6 && st.reach.x + st.reach.w <= room.x + room.w + 1e-6 && st.reach.y >= room.y - 1e-6 && st.reach.y + st.reach.h <= room.y + room.h + 1e-6;
  };
  let lo = Math.min(0.5, most);
  let hi = most * 0.9999;
  if (fits(hi)) lo = hi;
  else {
    // To a hundredth of a pixel of the picture.
    while (hi - lo > 0.01) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) lo = mid;
      else hi = mid;
    }
  }
  const size = lo;
  // Set again at the width its words came to, as a text box at that width sets them: so the box starts exactly where the words are.
  const first = stack(pieces, size, share, safe.w, cx, cy, axis, palette, measurer);
  const width = first.readable.w;
  const st = stack(pieces, size, share, width, cx, cy, axis, palette, measurer);
  return { ops: opsOf(st), readable: st.readable, ref: { size, width: st.readable.w } };
}

/* ------------------------------------------------------------------ motion */

/**
 * The motion, copied from the owner's reference (the Cavalry "S", 241
 * frames at 60 fps), measured on every frame of it: how strongly the glass
 * over the letters bends, and how far the echoes reach out. The glass
 * starts first and lets go last; after its big swell it lets go entirely
 * for a moment (frames 128 to 130), comes back in steps, and both make a
 * second, smaller swell, drawn in by frame 202 and settled by 240. (Frame
 * 80's glass and 81's reach are 1, from 0.999: so frame 81 is the glass
 * held open exactly, the cover's own still, and the loop starts on it.)
 */
const FPS = 60;

// prettier-ignore
const GLASS_CURVE: readonly number[] = [
  0, 0, 0, 0.005, 0.008, 0.012, 0.016, 0.021, 0.026, 0.033, 0.04, 0.049, 0.058, 0.068, 0.079, 0.09, 0.103, 0.116, 0.131, 0.146,
  0.162, 0.178, 0.196, 0.214, 0.232, 0.251, 0.27, 0.289, 0.308, 0.328, 0.347, 0.366, 0.385, 0.404, 0.422, 0.44, 0.457, 0.474, 0.492, 0.509,
  0.527, 0.545, 0.562, 0.58, 0.598, 0.615, 0.632, 0.649, 0.665, 0.68, 0.694, 0.708, 0.722, 0.735, 0.748, 0.761, 0.773, 0.787, 0.8, 0.813,
  0.826, 0.839, 0.851, 0.863, 0.875, 0.886, 0.897, 0.907, 0.918, 0.928, 0.938, 0.947, 0.956, 0.965, 0.972, 0.979, 0.985, 0.99, 0.994, 0.997,
  1, 1, 1, 0.999, 0.997, 0.995, 0.991, 0.987, 0.982, 0.975, 0.968, 0.96, 0.951, 0.941, 0.93, 0.918, 0.904, 0.889, 0.874, 0.858,
  0.84, 0.818, 0.792, 0.763, 0.732, 0.697, 0.661, 0.623, 0.583, 0.542, 0.5, 0.458, 0.415, 0.373, 0.331, 0.291, 0.251, 0.213, 0.178, 0.144,
  0.113, 0.085, 0.061, 0.04, 0.023, 0.01, 0.003, 0, 0, 0, 0.012, 0.047, 0.101, 0.167, 0.236, 0.302, 0.356, 0.391, 0.403, 0.413,
  0.423, 0.431, 0.438, 0.445, 0.452, 0.458, 0.464, 0.469, 0.475, 0.48, 0.484, 0.488, 0.491, 0.494, 0.497, 0.499, 0.5, 0.502, 0.502, 0.503,
  0.503, 0.503, 0.502, 0.502, 0.501, 0.5, 0.499, 0.498, 0.497, 0.495, 0.494, 0.492, 0.49, 0.488, 0.485, 0.483, 0.48, 0.478, 0.474, 0.471,
  0.467, 0.462, 0.457, 0.45, 0.444, 0.436, 0.429, 0.421, 0.413, 0.405, 0.397, 0.39, 0.383, 0.377, 0.37, 0.363, 0.355, 0.347, 0.339, 0.33,
  0.32, 0.311, 0.301, 0.29, 0.28, 0.268, 0.257, 0.244, 0.231, 0.217, 0.203, 0.189, 0.175, 0.161, 0.148, 0.136, 0.124, 0.113, 0.102, 0.092,
  0.083, 0.075, 0.067, 0.059, 0.052, 0.045, 0.039, 0.034, 0.029, 0.024, 0.02, 0.016, 0.013, 0.01, 0.007, 0.005, 0.003, 0.002, 0.001, 0,
  0,
];

// prettier-ignore
const REACH_CURVE: readonly number[] = [
  0, 0, 0, 0, 0, 0, 0, 0.003, 0.005, 0.009, 0.014, 0.021, 0.03, 0.041, 0.054, 0.068, 0.083, 0.1, 0.117, 0.134,
  0.152, 0.17, 0.189, 0.207, 0.226, 0.245, 0.264, 0.284, 0.306, 0.329, 0.354, 0.38, 0.407, 0.435, 0.463, 0.49, 0.518, 0.546, 0.574, 0.603,
  0.632, 0.661, 0.69, 0.717, 0.742, 0.766, 0.788, 0.807, 0.826, 0.843, 0.858, 0.873, 0.886, 0.898, 0.909, 0.92, 0.929, 0.937, 0.945, 0.951,
  0.957, 0.962, 0.967, 0.971, 0.975, 0.979, 0.982, 0.985, 0.988, 0.991, 0.993, 0.994, 0.996, 0.997, 0.997, 0.998, 0.999, 0.999, 1, 1,
  1, 1, 0.999, 0.997, 0.996, 0.994, 0.991, 0.987, 0.983, 0.978, 0.972, 0.965, 0.958, 0.949, 0.94, 0.931, 0.92, 0.908, 0.895, 0.88,
  0.864, 0.846, 0.826, 0.805, 0.783, 0.759, 0.733, 0.706, 0.677, 0.647, 0.615, 0.58, 0.545, 0.508, 0.47, 0.432, 0.393, 0.353, 0.312, 0.271,
  0.231, 0.192, 0.155, 0.121, 0.09, 0.064, 0.045, 0.034, 0.001, 0.003, 0.005, 0.008, 0.011, 0.013, 0.016, 0.021, 0.033, 0.056, 0.091, 0.136,
  0.185, 0.233, 0.277, 0.314, 0.345, 0.371, 0.393, 0.411, 0.427, 0.441, 0.452, 0.462, 0.47, 0.477, 0.483, 0.488, 0.493, 0.496, 0.498, 0.499,
  0.5, 0.5, 0.5, 0.499, 0.499, 0.497, 0.496, 0.494, 0.492, 0.489, 0.486, 0.483, 0.479, 0.475, 0.471, 0.466, 0.46, 0.454, 0.448, 0.442,
  0.434, 0.426, 0.417, 0.407, 0.396, 0.384, 0.371, 0.356, 0.34, 0.323, 0.303, 0.282, 0.258, 0.231, 0.203, 0.172, 0.14, 0.109, 0.082, 0.06,
  0.043, 0.031, 0.021, 0.013, 0.006, 0.002, 0.001, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0,
];

/** Frame 81: the glass held open, where the loop starts and ends. */
export const PULSE_START = 81 / FPS;

/** One pass of the motion, from the resting word through both swells back to rest: the reference's 240 frames. */
export const PULSE_LOOP = (GLASS_CURVE.length - 1) / FPS;

/** A curve at `t` seconds into the loop, between its frames, round the loop's end (it starts and ends at rest). */
function curveAt(curve: readonly number[], t: number): number {
  const n = curve.length - 1;
  const f = ((((t * FPS) % n) + n) % n);
  const i = Math.floor(f);
  return curve[i] + (curve[Math.min(n, i + 1)] - curve[i]) * (f - i);
}

/** The glass's quickest change, in a second: what `speed` is a share of. */
const FASTEST = (() => {
  let top = 0;
  for (let i = 1; i < GLASS_CURVE.length; i += 1) top = Math.max(top, Math.abs(GLASS_CURVE[i] - GLASS_CURVE[i - 1]));
  return top * FPS;
})();

/** The glass `t` seconds into the loop (from the resting word); at `PULSE_START`, held open. */
export function glassMomentAt(t: number): GlassMoment {
  const glass = curveAt(GLASS_CURVE, t);
  return {
    glass,
    reach: curveAt(REACH_CURVE, t),
    // The light split a tenth of a second behind the glass, from a fifth of the way in to three fifths.
    colour: Math.min(1, Math.max(0, (curveAt(GLASS_CURVE, t - 0.1) - 0.2) / 0.4)),
    speed: (curveAt(GLASS_CURVE, t + 0.008) - curveAt(GLASS_CURVE, t - 0.008)) / 0.016 / FASTEST,
  };
}

/** Every glass op of some ops, wherever it is drawn, made over by `at`. */
function replaceGlass(ops: Op[], at: (op: GlassOp) => Op): { ops: Op[]; changed: boolean } {
  let changed = false;
  const walk = (list: Op[]): Op[] =>
    list.map((op) => {
      if (op.kind === "glass") {
        const next = at(op);
        if (next !== op) changed = true;
        return next;
      }
      if (op.kind === "matrix" || op.kind === "turn" || op.kind === "fade") {
        const inner = walk(op.ops);
        return inner.every((o, i) => o === op.ops[i]) ? op : { ...op, ops: inner };
      }
      return op;
    });
  const out = walk(ops);
  return { ops: out, changed };
}

/** Pulse, as animate.ts's Plan has it: a loop from the still cover. */
export interface GlassPlay {
  duration: number;
  loops: true;
  frame(t: number): Scene;
}

/**
 * Pulse (the owner's ask, 10 Nov: the animated version plays the whole
 * ripple pulse): the reference's motion as a loop that starts and ends on
 * the cover, the glass held open. From it the glass lets go, the word goes
 * clean for a moment, swells a second time and is drawn in, rests, and
 * swells out to open again. `pace` times as fast.
 */
export function pulsePlay(scene: Scene, pace: number): GlassPlay {
  return {
    duration: PULSE_LOOP / pace,
    loops: true,
    frame(t: number): Scene {
      const tau = ((((Math.max(0, t) * pace + PULSE_START) % PULSE_LOOP) + PULSE_LOOP) % PULSE_LOOP);
      // On the still exactly: the cover itself.
      if (Math.abs(tau - PULSE_START) < 1e-9) return scene;
      const at = glassMomentAt(tau);
      const { ops, changed } = replaceGlass(scene.ops, (op) => ({ ...op, at }));
      return changed ? { ...scene, ops } : scene;
    },
  };
}

/* ------------------------------------------------------------------ field */

/**
 * Exact squared Euclidean distance (Felzenszwalb and Huttenlocher) to the
 * nearest zero of `grid`, in place: every cell starts at 0 (on) or a large
 * number (off).
 */
export function squaredDistance(grid: Float64Array, w: number, h: number): void {
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const z = new Float64Array(n + 1);
  const v = new Int32Array(n);
  // One line of the grid, `len` long from `start` in steps of `stride`, made exact along itself (the lower envelope of its parabolas).
  const pass = (start: number, stride: number, len: number) => {
    for (let q = 0, i = start; q < len; q += 1, i += stride) f[q] = grid[i];
    let k = 0;
    v[0] = 0;
    z[0] = -Infinity;
    z[1] = Infinity;
    for (let q = 1; q < len; q += 1) {
      const fq = f[q] + q * q;
      let s = 0;
      for (;;) {
        const p = v[k];
        s = (fq - (f[p] + p * p)) / (2 * (q - p));
        if (s > z[k]) break;
        k -= 1;
        if (k < 0) {
          k = 0;
          break;
        }
      }
      k += 1;
      v[k] = q;
      z[k] = s;
      z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < len; q += 1) {
      while (z[k + 1] < q) k += 1;
      const p = v[k];
      d[q] = (q - p) * (q - p) + f[p];
    }
    for (let q = 0, i = start; q < len; q += 1, i += stride) grid[i] = d[q];
  };
  for (let x = 0; x < w; x += 1) pass(x, w, h);
  for (let y = 0; y < h; y += 1) pass(y * w, 1, w);
}

/**
 * A word's letters as the glass reads them, from its ink drawn `s` times
 * over (`alpha`, one value a pixel at `s` times the field's `w` by `h`, on
 * from half): the signed distance to its edge at every pixel of the field
 * (negative inside), each the mean of its `s` by `s` samples, so an edge
 * falls between pixels where it is; and each column's ink, from the
 * middle (`cy`, `cx`, in the field's pixels): how far up and down it
 * reaches, and the middle and half width of the run of inked columns
 * (the letter) it is in. The first and last letters' height too: their
 * middle (down from `cy`) and half height.
 */
export interface GlassField {
  sdf: Float32Array;
  /** Four a column: up, down, its letter's middle (from `cx`) and half width; all 0 for a column with no ink. */
  ends: Float32Array;
  first: [number, number];
  last: [number, number];
}

export function glassField(alpha: ArrayLike<number>, w: number, h: number, s: number, cx: number, cy: number): GlassField {
  const W = w * s;
  const H = h * s;
  const N = W * H;
  const outside = new Float64Array(N);
  const BIG = 1e12;
  let x0 = W;
  let x1 = -1;
  let y0 = H;
  let y1 = -1;
  for (let i = 0; i < N; i += 1) {
    const on = alpha[i] >= 128;
    outside[i] = on ? 0 : BIG;
    if (!on) continue;
    const x = i % W;
    const y = (i - x) / W;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  squaredDistance(outside, W, H);
  // How far inside the ink each sample is, worked out only over the ink's own box and a sample round it (all off), the nearest edge being in there.
  const bx0 = Math.max(0, x0 - 1);
  const by0 = Math.max(0, y0 - 1);
  const bw = Math.max(0, Math.min(W, x1 + 2) - bx0);
  const bh = Math.max(0, Math.min(H, y1 + 2) - by0);
  const inside = new Float64Array(bw * bh);
  for (let y = 0; y < bh; y += 1) for (let x = 0; x < bw; x += 1) inside[y * bw + x] = alpha[(y + by0) * W + x + bx0] >= 128 ? BIG : 0;
  if (bw && bh) squaredDistance(inside, bw, bh);
  const sdf = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let sum = 0;
      for (let dy = 0; dy < s; dy += 1) {
        for (let dx = 0; dx < s; dx += 1) {
          const sx = x * s + dx;
          const sy = y * s + dy;
          const o = outside[sy * W + sx];
          sum += o > 0 ? Math.sqrt(o) - 0.5 : 0.5 - Math.sqrt(inside[(sy - by0) * bw + sx - bx0]);
        }
      }
      sdf[y * w + x] = sum / (s * s) / s;
    }
  }
  const ends = new Float32Array(w * 4);
  for (let x = 0; x < w; x += 1) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let dx = 0; dx < s; dx += 1) {
      const col = x * s + dx;
      for (let y = 0; y < H; y += 1) {
        if (alpha[y * W + col] >= 128) {
          if (y < lo) lo = y;
          if (y > hi) hi = y;
        }
      }
    }
    if (hi < lo) continue;
    ends[x * 4] = cy - lo / s;
    ends[x * 4 + 1] = (hi + 1) / s - cy;
  }
  // Letters as runs of inked columns.
  const runs: { x0: number; x1: number; top: number; bottom: number }[] = [];
  for (let x = 0; x < w; x += 1) {
    if (ends[x * 4] === 0 && ends[x * 4 + 1] === 0) continue;
    const last = runs[runs.length - 1];
    if (last && last.x1 === x - 1) {
      last.x1 = x;
      last.top = Math.max(last.top, ends[x * 4]);
      last.bottom = Math.max(last.bottom, ends[x * 4 + 1]);
    } else runs.push({ x0: x, x1: x, top: ends[x * 4], bottom: ends[x * 4 + 1] });
  }
  for (const run of runs) {
    for (let x = run.x0; x <= run.x1; x += 1) {
      ends[x * 4 + 2] = (run.x0 + run.x1 + 1) / 2 - cx;
      ends[x * 4 + 3] = (run.x1 - run.x0 + 1) / 2;
    }
  }
  const span = (run: (typeof runs)[number] | undefined): [number, number] => (run ? [(run.bottom - run.top) / 2, (run.bottom + run.top) / 2] : [0, h / 2]);
  return { sdf, ends, first: span(runs[0]), last: span(runs[runs.length - 1]) };
}

/* ------------------------------------------------------------------ light */

/** How many wavelengths each pixel reads the letters at. */
export const WAVES = 32;

/** The light overexposed this much, then soft-clipped from 0.6: the poster's saturated fringes. */
export const EXPOSURE = 1.8;
export const TONE_NORM = ((x: number) => (x < 0.6 ? x : 0.6 + 0.4 * (1 - Math.exp(-(x - 0.6) / 0.4))))(EXPOSURE);

/**
 * The wavelengths, as the shader reads them: four numbers each, its weight
 * in linear red, green and blue, and how far it is bent. The CIE 1931
 * 2-degree observer (Wyman, Sloan and Shirley's fit) taken into linear
 * sRGB, signed, each channel normalised so the whole spectrum sums to
 * white; bent mostly in proportion to the wavelength, with a little
 * Cauchy, as fitted to the measured fringes of the 2024 poster.
 */
export function spectrum(n: number): Float32Array {
  const g = (x: number, mu: number, a: number, b: number) => Math.exp(-0.5 * ((x - mu) / (x < mu ? a : b)) ** 2);
  const rows: number[][] = [];
  const sum = [0, 0, 0];
  const cau = (l: number) => 1 / (l * l);
  const span = cau(400) - cau(700);
  for (let i = 0; i < n; i += 1) {
    const l = 400 + (300 * (i + 0.5)) / n;
    const X = 1.056 * g(l, 599.8, 37.9, 31.0) + 0.362 * g(l, 442.0, 16.0, 26.7) - 0.065 * g(l, 501.1, 20.4, 26.2);
    const Y = 0.821 * g(l, 568.8, 46.9, 40.5) + 0.286 * g(l, 530.9, 16.3, 31.1);
    const Z = 1.217 * g(l, 437.0, 11.8, 36.0) + 0.681 * g(l, 459.0, 26.0, 13.8);
    const rgb = [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.204 * Y + 1.057 * Z];
    rgb.forEach((v, k) => {
      sum[k] += v;
    });
    const bend = (0.9 * (550 - l)) / 300 + (0.1 * (cau(l) - cau(550))) / span;
    rows.push([...rgb, bend]);
  }
  const out = new Float32Array(n * 4);
  rows.forEach((r, i) => {
    out[i * 4] = r[0] / sum[0];
    out[i * 4 + 1] = r[1] / sum[1];
    out[i * 4 + 2] = r[2] / sum[2];
    out[i * 4 + 3] = r[3];
  });
  return out;
}
