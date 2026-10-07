/**
 * A cover as a list of things to draw.
 *
 * Each style turns a title into the same small vocabulary (a fill, grain,
 * boxes, stepped sticker shapes, lines of text, a layer of liquid letters,
 * a turned group of them), and `paint.ts` draws that list on any canvas at
 * any scale. So the preview, the style thumbnails and the downloaded file
 * are drawn from one list and cannot disagree, and a test can check where
 * every word lands without a browser.
 */

import { DEFAULT_PLAIN_FACE, type FaceId, type FunkyFaceId, type Measurer, type PlainFaceId } from "@/components/reel-cover-maker/faces";
import { formatById, type FormatId, type Rect } from "@/components/reel-cover-maker/formats";
import { flow, type Block } from "@/components/reel-cover-maker/layout";
import { boundsOf, pasteGlyph, type Chain, type PasteRecipe } from "@/components/reel-cover-maker/liquid";
import { strokeMetrics } from "@/components/reel-cover-maker/strokes";
import { liquidLayout, shrink, type LiquidSpec } from "@/components/reel-cover-maker/liquid-layout";
import type { Finish } from "@/components/reel-cover-maker/liquid-render";
import { mixSeed, random, between, hashString } from "@/components/reel-cover-maker/noise";
import { paletteFor, readableOn, type Ground, type Palette } from "@/components/reel-cover-maker/palettes";
import { polygonBounds, steppedOutline, type Polygon } from "@/components/reel-cover-maker/stepped";
import { apply, isHome, mappedBounds, placeMatrix, strokeScale, type Matrix, type Place } from "@/components/reel-cover-maker/place";
import { graphemes, parseTitle, type Paragraph } from "@/components/reel-cover-maker/title";

export type StyleId = "stickery" | "pasty" | "pasty-flat" | "editorial" | "echo" | "mono";

export interface Style {
  id: StyleId;
  name: string;
}

/** In the order the style picker shows them, the owner's of 7 Oct. Spread was taken out that day. */
export const STYLES: readonly Style[] = [
  { id: "stickery", name: "Stickery" },
  { id: "pasty", name: "Pasty" },
  { id: "pasty-flat", name: "Pasty Flat" },
  { id: "editorial", name: "Editorial" },
  { id: "echo", name: "Echo" },
  { id: "mono", name: "Mono" },
];

export const DEFAULT_STYLE: StyleId = "stickery";

export function isStyleId(value: unknown): value is StyleId {
  return STYLES.some((s) => s.id === value);
}

/** A layer of liquid letters, drawn by liquid-render.ts (in a worker) rather than by the canvas. */
export interface LiquidOp {
  kind: "liquid";
  /** The letters' chains first, then any loose droplets. */
  chains: Chain[];
  /** How many of `chains` are letters: the rest are droplets, ornament free to leave the safe area. */
  letters: number;
  /** Which letter and which line each of the letters' chains belongs to, so a test can hold them apart. */
  glyphOf: number[];
  lineOf: number[];
  /** Each chain's colour, as an index into `colours`, and how much lighter or darker than it (1 is as is). */
  colours: string[];
  colourOf: number[];
  tone: number[];
  finish: Finish;
  /**
   * The ground the paste lies on, which the layer draws under it with the
   * shadows the paste casts; null for paste alone, over whatever is drawn
   * before it (Stickery's stickers, a photo) or over nothing.
   */
  ground: string | null;
  /**
   * With no ground drawn, on a cover with no photo (whose file is clear
   * but for its letters): the ground the paste is lit as lying on, and
   * whose shadow it casts, as a stain of its own rather than a darkening
   * of what is under it. Null over a photo, or Stickery's stickers.
   */
  under: string | null;
  /** How far apart two strokes may be and still pool together, in pixels of the picture. */
  pool: number;
  /**
   * With no ground of its own, the paste still casts its shadow: a second
   * layer, laid before the paste. Over a photo, multiplied onto it; over
   * nothing (`under`), a clear stain, as dark as it would make the ground.
   */
  shadow: boolean;
  seed: number;
  /** What the paste is, its colours aside, for a cache of made layers: a new colour is only light again. */
  key: string;
}

export type Op =
  | { kind: "fill"; color: string }
  | { kind: "grain"; alpha: number }
  | { kind: "box"; x: number; y: number; w: number; h: number; radius: number; color: string }
  | { kind: "shape"; polygons: Polygon[]; color: string; stroke: string; strokeWidth: number }
  | {
      kind: "text";
      text: string;
      face: FaceId;
      size: number;
      x: number;
      /** The baseline. */
      y: number;
      color: string;
      alpha?: number;
      /** Drawn as an outline of this width rather than filled. */
      outline?: number;
    }
  | LiquidOp
  | { kind: "turn"; cx: number; cy: number; angle: number; ops: Op[] }
  /** The owner's photo, framed to cover the whole picture: drawn by the page, which holds it. */
  | { kind: "photo" }
  /** Ops drawn through an affine map, as a canvas's `transform` takes it: letters the owner has moved. */
  | { kind: "matrix"; m: Matrix; ops: Op[] };

export interface Scene {
  width: number;
  height: number;
  ops: Op[];
  /** Everything that must be read, wherever it is drawn: inside the format's safe area. */
  readable: Rect;
  /** The title was too long for the cover and was cut short. */
  truncated: boolean;
}

export interface CoverInput {
  title: string;
  style: StyleId;
  /** Stickery's funky lettering, and the face of its plain words. */
  lettering?: LetteringId;
  plainFace?: PlainFaceId;
  /** The colour Stickery's letters are set in on every sticker; absent or null, black or white, whichever reads on each. */
  textColour?: string | null;
  /** Pasty's and Pasty Flat's lettering: Drip, or Goo as a teardrop or evened out. */
  pastyLettering?: PastyLetteringId;
  /** A photo behind the letters, in place of the plain ground. */
  photo?: boolean;
  hue: number;
  shade: number;
  ground: Ground;
  format: FormatId;
  /** The shuffle: mixed into every random choice the style makes. */
  seed: number;
}

function upper(paragraphs: Paragraph[]): Paragraph[] {
  return paragraphs.map((p) => p.map((w) => w.map((s) => ({ ...s, text: s.text.toLocaleUpperCase() }))));
}

/** The text of a block as ops, each segment in the colour `colour` gives it. */
function textOps(block: Block, colour: (emphasis: boolean) => string): Op[] {
  return block.lines.flatMap((line) =>
    line.segments.map(
      (s): Op => ({ kind: "text", text: s.text, face: s.face, size: s.size, x: s.x, y: line.baseline, color: colour(s.emphasis) }),
    ),
  );
}

/** Every op moved across by `dx`. */
function shift(ops: Op[], dx: number): Op[] {
  return ops.map((op) => {
    if (op.kind === "text" || op.kind === "box") return { ...op, x: op.x + dx };
    if (op.kind === "turn") return { ...op, cx: op.cx + dx, ops: shift(op.ops, dx) };
    return op;
  });
}

function shiftRect(rect: Rect, dx: number): Rect {
  return { ...rect, x: rect.x + dx };
}

/** The smallest upright rectangle holding `rect` turned by `angle` about (cx, cy). */
export function turnedBounds(rect: Rect, cx: number, cy: number, angle: number): Rect {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const corners = [
    [rect.x, rect.y],
    [rect.x + rect.w, rect.y],
    [rect.x, rect.y + rect.h],
    [rect.x + rect.w, rect.y + rect.h],
  ].map(([x, y]) => [cx + (x - cx) * cos - (y - cy) * sin, cy + (x - cx) * sin + (y - cy) * cos]);
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

function union(rects: Rect[]): Rect {
  const left = Math.min(...rects.map((r) => r.x));
  const top = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.w));
  const bottom = Math.max(...rects.map((r) => r.y + r.h));
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/** A big serif on paper grain. */
function editorial(paragraphs: Paragraph[], safe: Rect, palette: Palette, measurer: Measurer) {
  const block = flow(paragraphs, { box: safe, face: "serif", emphasisFace: "serif", maxSize: 230, minSize: 40, leading: 0.98, align: "center" }, measurer);
  return {
    block,
    ops: [{ kind: "grain", alpha: 0.075 } as Op, ...textOps(block, () => palette.ink)],
    readable: block.bounds,
  };
}

/** Heavy wide capitals, repeated in outline above and below to the cover's edges. */
function echo(paragraphs: Paragraph[], safe: Rect, palette: Palette, measurer: Measurer, height: number) {
  const band = Math.min(safe.h, Math.max(safe.h * 0.36, 260));
  const box = { x: safe.x, y: safe.y + (safe.h - band) / 2, w: safe.w, h: band };
  const block = flow(
    upper(paragraphs),
    { box, face: "wide", emphasisFace: "wide", maxSize: 210, minSize: 40, leading: 0.94, align: "center" },
    measurer,
  );
  const main = textOps(block, () => palette.ink);
  const first = block.lines[0];
  const last = block.lines[block.lines.length - 1];
  const echoes: Op[] = [];
  if (first) {
    const step = last.baseline - first.baseline + first.size * (measurer.metrics("wide").cap + 0.3);
    const outline = Math.max(1.5, block.size * 0.022);
    for (let k = 1; k < 40; k += 1) {
      const alpha = Math.max(0.07, 0.5 * 0.64 ** (k - 1));
      let drawn = false;
      for (const dir of [-1, 1]) {
        const dy = dir * k * step;
        // A copy wholly off the cover is not drawn.
        if (block.bounds.y + block.bounds.h + dy < 0 || block.bounds.y + dy > height) continue;
        drawn = true;
        for (const op of main) {
          if (op.kind === "text") echoes.push({ ...op, y: op.y + dy, color: palette.ink, alpha, outline });
        }
      }
      if (!drawn) break;
    }
  }
  return { block, ops: [...echoes, ...main], readable: block.bounds };
}

/** A typewriter's lines, set left in a block at the centre, with the cursor after them. */
function mono(paragraphs: Paragraph[], safe: Rect, palette: Palette, measurer: Measurer) {
  const pad = 0.14;
  const block = flow(
    paragraphs,
    {
      box: safe,
      face: "mono",
      emphasisFace: "mono",
      maxSize: 118,
      minSize: 30,
      leading: 1.34,
      align: "left",
      padX: pad,
      padY: 0.1,
      trailing: 0.78,
    },
    measurer,
  );
  const ops: Op[] = [];
  const cap = measurer.metrics("mono").cap;
  ops.push(...textOps(block, () => palette.ink));
  const last = block.lines[block.lines.length - 1];
  const end = last?.segments[last.segments.length - 1];
  if (last && end) {
    ops.push({
      kind: "box",
      x: end.x + end.width + 0.12 * last.size,
      y: last.baseline - (cap + 0.06) * last.size,
      w: 0.58 * last.size,
      h: (cap + 0.12) * last.size,
      radius: 0,
      color: palette.accent,
    });
  }
  // The lines stay set left; the block they make is centred.
  const dx = safe.x + (safe.w - block.bounds.w) / 2 - block.bounds.x;
  const boxes = ops.flatMap((op) => (op.kind === "box" ? [{ x: op.x, y: op.y, w: op.w, h: op.h }] : []));
  return { block, ops: shift(ops, dx), readable: shiftRect(union([block.bounds, ...boxes]), dx) };
}


function rectOf(b: { x0: number; y0: number; x1: number; y1: number }): Rect {
  return { x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 };
}

/** Letters with a dot or a mark of their own, which the kerning keeps clear of their neighbours. */
const DOTTED = /^[ij'\u2019".,:;!?]$/u;

/** The least space between two words' paste, in em: a word space, measured ink to ink. */
const WORD_GAP = 0.2;

/** What a liquid style needs to set its letters. */
interface LiquidStyle {
  spec: Omit<LiquidSpec, "box">;
  recipe: (letters: number) => PasteRecipe;
  finish: Finish;
  /** Pooling, as a share of the paste's radius. */
  pool: number;
  /** The least gap between two letters' paste, in em of the letter's height; 0 leaves a joined script joined. */
  kern: number;
  /** The chance two neighbouring letters are let touch, so their paste bridges, as it does now and then from a bottle. */
  merge?: number;
  /** How far two letters let touch run into each other, in em: none, they only meet. */
  overlap?: number;
  /** Dots and marks kept a clear gap from their neighbours, never welded on, where letters mostly touch. */
  clearMarks?: boolean;
  /** The least space between two words' paste, in em, where WORD_GAP is too little for letters that run together. */
  wordGap?: number;
}

/**
 * Drippy hand lettering in gel: Drip's tall letters, their case mixed, each
 * stroke thin through its run and swelling into a blob at a free end, stems
 * bowed and swaying, feet running on as drips.
 */
const PASTY: LiquidStyle = {
  spec: {
    fonts: [{ id: "drip", share: 1 }],
    maxSize: 640,
    minSize: 64,
    gap: -0.04,
    maxLines: 7,
    stretch: 1.25,
    tracking: 0.01,
    inkGap: 0.02,
    jitter: { scale: 0.15, angle: 0.075, rise: 0.05, squash: 0.1 },
    upper: false,
    swapCase: 0.3,
    salt: "pasty",
  },
  // A short title is set fat, as balloons and blots are; a long one thinner, as sauce from a bottle.
  recipe: (letters) => ({
    weight: letters <= 6 ? 0.058 : letters <= 14 ? 0.05 : 0.045,
    pressure: 0.8,
    bulb: 0.7,
    wobble: 0.01,
    smooth: 1,
    bow: 0.05,
    wave: 0.028,
    drip: 0.5,
    dripLength: [0.16, 0.7],
    droplets: 0.3,
  }),
  finish: "gloss",
  pool: 0.6,
  kern: 0.022,
  merge: 0.2,
};

/**
 * Pasty's lettering in flat paste: one colour, edge to edge, with no light,
 * shadow or texture at all (the owner's ask, 7 Oct: "extremely just flat").
 * Thicker, as paste laid flat reads heavier than gel.
 */
const PASTY_FLAT: LiquidStyle = {
  ...PASTY,
  recipe: (letters) => ({ ...PASTY.recipe(letters), weight: PASTY.recipe(letters).weight * 1.4, droplets: 0.15 }),
  finish: "flat",
  pool: 0.35,
};

/**
 * Stickery's funky lettering: a brush script typeface, as the owner's
 * reference stickers set "Want" and "What it is", or drawn paste: gooey,
 * melted letters, as they set "aren't" and "what".
 */
export type LetteringId = "yesteryear" | "leckerli" | "damion" | PasteLetteringId;

/** The letterings drawn in paste rather than set in a typeface. */
type PasteLetteringId = "goo" | "goo-even";

export interface Lettering {
  id: LetteringId;
  name: string;
  /** The typeface it is set in; none for drawn paste. */
  face: FunkyFaceId | null;
  /** The owner's choice, offered in the picker; a suggestion is not, until they choose it. */
  chosen: boolean;
  /**
   * The plain words' x-height against the lettering's, a short line's (a
   * longer one is made smaller to stay within the funky word): Main Sticker
   * 1's serif is about half its script's, Main Sticker 2's sans more than
   * half its goo's. A script with a small x-height for its size
   * (Yesteryear's is 0.29 of its em, Leckerli One's 0.49) takes a larger
   * share, or its plain words look small beside it.
   */
  plain: number;
  /** The sticker's grid (a step's run, and its rise) and the paper it leaves round the ink, in plain x-heights. */
  steps: { cell: number; cellY: number; pad: number };
}

/**
 * Main Sticker 1's steps: runs of about 0.4 of the serif's x-height, rises
 * about half that, and a quarter of it of paper round the ink (measured on
 * the reference: margins 0.1 to 0.25 at their closest, about half an
 * x-height on the whole, once the steps are cut).
 */
const SCRIPT_STEPS = { cell: 0.4, cellY: 0.22, pad: 0.25 };

/** Main Sticker 2's steps: a fine staircase under the goo. */
const GOO_STEPS = { cell: 0.3, cellY: 0.17, pad: 0.22 };

/**
 * In the order the picker shows them: the owner's picks of 7 Oct, the three
 * scripts (Yesteryear, Leckerli One, and Damion, suggested for being like
 * Yesteryear) and the drawn Goo, as a teardrop and evened out. Yellowtail
 * was suggested with Damion and not picked.
 */
export const LETTERINGS: readonly Lettering[] = [
  { id: "yesteryear", name: "Yesteryear", face: "funky-yesteryear", chosen: true, plain: 0.6, steps: SCRIPT_STEPS },
  { id: "leckerli", name: "Leckerli One", face: "funky-leckerli", chosen: true, plain: 0.47, steps: SCRIPT_STEPS },
  { id: "damion", name: "Damion", face: "funky-damion", chosen: true, plain: 0.55, steps: SCRIPT_STEPS },
  { id: "goo", name: "Goo Teardrop", face: null, chosen: true, plain: 0.58, steps: GOO_STEPS },
  { id: "goo-even", name: "Goo Even", face: null, chosen: true, plain: 0.58, steps: GOO_STEPS },
];

export const DEFAULT_LETTERING: LetteringId = "yesteryear";

export function isLetteringId(value: unknown): value is LetteringId {
  return LETTERINGS.some((l) => l.id === value);
}

/** The typeface a lettering is set in, or null for one drawn in paste. */
export function letteringFace(id: LetteringId): FunkyFaceId | null {
  return LETTERINGS.find((l) => l.id === id)?.face ?? null;
}

const still = { bulb: 0, bow: 0, wave: 0, drip: 0, dripLength: [0, 0] as const, droplets: 0 };

/**
 * The drawn lettering. Its strokes are curves through the font's points,
 * never the straight runs between them, and each swells and thins slowly
 * along its length (liquid.ts), so it is never choppy or blobbed at random.
 */
/**
 * Wacky brush strokes, as Main Sticker 2's "aren't" and "what": light
 * through the stroke and heavier at its ends, which swell slowly into long
 * teardrops; downstrokes swelling toward their feet, letters run a good
 * way into each other, ascenders a little over half again the x-height,
 * and a word's last t swinging its high, rising crossbar out into an oval
 * drop that grows out of the bar as paste does. Measured against the
 * reference on 6 Oct by a critic, stroke by stroke; the teardrop picked
 * by the owner on 7 Oct over a ball, a melt, a brush and drips.
 */
const GOO: LiquidStyle = {
  spec: {
    fonts: [{ id: "goo", share: 1 }],
    maxSize: 400,
    minSize: 40,
    gap: -0.04,
    maxLines: 4,
    stretch: 1,
    tracking: -0.01,
    inkGap: -0.01,
    jitter: { scale: 0.05, angle: 0.12, rise: 0.05, squash: 0.06 },
    upper: false,
    slant: 0.27,
    align: "left",
    salt: "stickery",
  },
  recipe: () => ({
    ...still,
    weight: 0.064,
    pressure: 0,
    bulb: 0.4,
    balls: 0.75,
    bulbReach: 6,
    wobble: 0,
    smooth: 1,
    spline: true,
    bow: 0.02,
    wave: 0,
    pen: { kind: "pressure", thin: 0.62 },
    xHeight: { at: 0.48, boost: 0, ascend: 1.55 },
    swell: { neck: 0.75, amount: [0.45, 0.85], reach: 0.1 },
    drip: 0.35,
    dripLength: [0.06, 0.12],
    dripShape: { neck: 0.8, drop: 1.5 },
    crossbar: { length: 0.3, ball: 2, end: "teardrop" },
  }),
  finish: "flat",
  // Joins filleted lightly, so a join is never a knot.
  pool: 0.25,
  // Nine pairs of letters in ten run into each other; words a full space apart, dots and marks kept clear.
  kern: 0.006,
  merge: 0.9,
  overlap: 0.045,
  clearMarks: true,
  // Words further apart than WORD_GAP, or letters that run together read as one word ("whatitis").
  wordGap: 0.32,
};

/** The drawn letterings: Goo's teardrop, and the same hand evened out. */
const PASTE_LETTERINGS: Record<PasteLetteringId, LiquidStyle> = {
  goo: GOO,
  // Teardrop with nothing swelling where it should not: a foot always ends
  // round, never in a ball; a stroke swells little toward its foot and
  // never past about a third more than its weight, eased into, so no
  // swellings stack into a lump; no drips; the joins filleted less.
  "goo-even": {
    ...GOO,
    recipe: (letters) => ({
      ...GOO.recipe(letters),
      footBalls: 0,
      maxWeight: 1.35,
      swell: { neck: 0.8, amount: [0.15, 0.35], reach: 0.1 },
      drip: 0,
    }),
    pool: 0.2,
  },
};

function letterCount(paragraphs: Paragraph[]): number {
  return paragraphs.reduce((sum, p) => sum + p.reduce((s, w) => s + w.reduce((t, seg) => t + [...seg.text].length, 0), 0), 0);
}

interface Set {
  chains: Chain[];
  glyphOf: number[];
  lineOf: number[];
  colourOf: number[];
  tone: number[];
  droplets: Chain[];
  missing: Op[];
  readable: Rect;
  /** The letters' x-height as set, in pixels of the picture. */
  xHeight: number;
}

/**
 * How far right glyph `b`'s beads must move (left, below zero) for the
 * nearest of them to come exactly `gap` from `a`'s: kerning by the paste
 * itself, swelling and lean included, so a letter tucks under its
 * neighbour's arm as far as the paste lets it, and no further. Zero where
 * no bead of `b` is level with one of `a`'s, and so nothing can meet.
 */
export function kernBy(a: Chain[], b: Chain[], gap: number): number {
  let need = -Infinity;
  for (const ca of a) {
    for (const p of ca) {
      for (const cb of b) {
        for (const q of cb) {
          const reach = p.r + q.r + gap;
          const dy = q.y - p.y;
          if (Math.abs(dy) >= reach) continue;
          // b moves until the two beads are `reach` apart.
          const dx = Math.sqrt(reach * reach - dy * dy) - (q.x - p.x);
          if (dx > need) need = dx;
        }
      }
    }
  }
  return Number.isFinite(need) ? need : 0;
}

/** The same, downward: how far `b` must drop (rise, below zero) for its nearest bead to come exactly `gap` from `a`'s. */
export function dropBy(a: Chain[], b: Chain[], gap: number): number {
  let need = -Infinity;
  for (const ca of a) {
    for (const p of ca) {
      for (const cb of b) {
        for (const q of cb) {
          const reach = p.r + q.r + gap;
          const dx = q.x - p.x;
          if (Math.abs(dx) >= reach) continue;
          const dy = Math.sqrt(reach * reach - dx * dx) - (q.y - p.y);
          if (dy > need) need = dy;
        }
      }
    }
  }
  return Number.isFinite(need) ? need : 0;
}

function shiftChains(chains: Chain[], dx: number, dy = 0): Chain[] {
  return dx === 0 && dy === 0 ? chains : chains.map((c) => c.map((b) => ({ x: b.x + dx, y: b.y + dy, r: b.r })));
}

/**
 * Liquid letters set in `box`, everything they ink inside it.
 *
 * Every letter's strokes are drawn first, which says where each line's ink
 * really starts. Each letter is then kerned against the last ones on its
 * line by its own beads, so no two touch; then the drips, each stopping a
 * gap above the ink of the line below. The paste reaches past the centre
 * lines by its radius, its swelling and its lean, so the ink is centred in
 * the box and the box shrunk until what was drawn fits, and as a last resort
 * the paste is scaled down about the box's middle. Droplets are kept only
 * where they land on the cover, after all of that.
 */
function setLiquid(
  paragraphs: Paragraph[],
  box: Rect,
  style: LiquidStyle,
  canvas: Rect,
  textColour: (emphasis: boolean) => string,
  measurer: Measurer,
): Set {
  const recipe = style.recipe(letterCount(paragraphs));
  const empty = { chains: [], glyphOf: [], lineOf: [], colourOf: [], tone: [], droplets: [], missing: [], readable: { x: box.x + box.w / 2, y: box.y + box.h / 2, w: 0, h: 0 }, xHeight: 0 };
  const xHeightEm = strokeMetrics(style.spec.fonts[0]?.id ?? "drip").xHeight * (1 + (recipe.xHeight?.boost ?? 0));
  let inner = box;
  let made: Set | null = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    // Letters kept apart by the paste's thickness and a gap, as a first guess the kerning then makes exact.
    const inkGap = style.spec.inkGap + 2 * recipe.weight;
    const layout = liquidLayout(paragraphs, { ...style.spec, inkGap, box: inner });
    if (!layout.glyphs.length && !layout.missing.length) return empty;

    // The strokes alone, to find where each line's ink starts, and so how
    // low the line above may drip.
    const strokesOf = layout.glyphs.map((g) => pasteGlyph(g, { ...recipe, drip: 0 }, -Infinity, canvas).chains);
    const lineTop = new Map<number, number>();
    layout.glyphs.forEach((g, i) => {
      for (const c of strokesOf[i]) for (const b of c) lineTop.set(g.line, Math.min(lineTop.get(g.line) ?? Infinity, b.y - b.r));
    });
    const lines = [...new Set(layout.glyphs.map((g) => g.line))].sort((p, q) => p - q);
    const floorOf = (line: number) => {
      const below = lines.find((l) => l > line);
      const gap = recipe.weight * (layout.sizes[line] ?? 0) * 0.8;
      return below === undefined ? box.y + box.h : (lineTop.get(below) ?? box.y + box.h) - gap;
    };
    // Each letter's whole paste, drips and all; the run's very last letter told so, for a hand's one swash.
    const final = layout.glyphs.reduce((best, g, i) => (g.line > layout.glyphs[best].line || (g.line === layout.glyphs[best].line && g.x > layout.glyphs[best].x) ? i : best), 0);
    const pastes = layout.glyphs.map((g, i) => pasteGlyph({ ...g, final: i === final }, recipe, Math.min(box.y + box.h, floorOf(g.line)), canvas));
    // Kerning, line by line, by that paste. Inside a word each letter moves
    // to exactly its gap from the last two, tucking under an arm or over a
    // tail as the paste allows; between words a letter only ever moves
    // right, so a word's space is kept.
    const shift = new Array(layout.glyphs.length).fill(0);
    if (style.kern) {
      let lineShift = 0;
      layout.glyphs.forEach((g, i) => {
        if (i === 0 || layout.glyphs[i - 1].line !== g.line) lineShift = 0;
        let need = -Infinity;
        // Mostly a thin gap, wider than the pooling reaches; now and then
        // none, and the smooth union bridges the two letters' paste. A dot
        // or a mark never touches: it keeps a clear gap, so an i's dot is
        // never welded to the t beside it.
        const dotted = (k: number) => DOTTED.test(layout.glyphs[k].char) || layout.glyphs[k].glyph.strokes.some((st) => st.length <= 4);
        const marked = style.clearMarks === true && (dotted(i) || (i > 0 && dotted(i - 1)));
        const touch = !marked && random(mixSeed(g.seed, 0x70c4))() < (style.merge ?? 0);
        const gap = touch ? -(style.overlap ?? 0) * g.sy : marked ? Math.max(style.kern, 0.07) * g.sy : style.kern * g.sy * between(random(mixSeed(g.seed, 0x9a9)), 0.75, 1.35);
        let within = false;
        for (let j = Math.max(0, i - 2); j < i; j += 1) {
          const h = layout.glyphs[j];
          if (h.line !== g.line) continue;
          const same = h.word === g.word;
          within ||= same;
          need = Math.max(need, kernBy(shiftChains(pastes[j].chains, shift[j]), shiftChains(pastes[i].chains, lineShift), same ? gap : (style.wordGap ?? WORD_GAP) * g.sx));
        }
        // Never further left than a third of an em: a letter tucks, it does not pass its neighbour.
        lineShift += !Number.isFinite(need) ? 0 : within ? Math.max(need, -0.33 * g.sy) : Math.max(0, need);
        shift[i] = lineShift;
      });
    }

    // Then down: each line comes to exactly its gap from the line above,
    // rising into the room between its letters' tops or dropping clear of
    // a descender or a drip, by up to a third of its height.
    const drop = new Map<number, number>();
    if (style.kern) {
      let total = 0;
      lines.forEach((line, li) => {
        if (li > 0) {
          const previous = lines[li - 1];
          const above = layout.glyphs.flatMap((g, i) => (g.line === previous ? shiftChains(pastes[i].chains, shift[i], drop.get(g.line) ?? 0) : []));
          const here = layout.glyphs.flatMap((g, i) => (g.line === line ? shiftChains(pastes[i].chains, shift[i], total) : []));
          const size = layout.sizes[line] ?? 0;
          total += Math.max(dropBy(above, here, style.kern * size), -0.33 * size);
        }
        drop.set(line, total);
      });
    }

    const chains: Chain[] = [];
    const glyphOf: number[] = [];
    const lineOf: number[] = [];
    const colourOf: number[] = [];
    const tone: number[] = [];
    const droplets: Chain[] = [];
    layout.glyphs.forEach((g, i) => {
      const t = between(random(mixSeed(g.seed, 0x70e)), 0.9, 1.1);
      const down = drop.get(g.line) ?? 0;
      for (const c of shiftChains(pastes[i].chains, shift[i], down)) {
        chains.push(c);
        glyphOf.push(i);
        lineOf.push(g.line);
        colourOf.push(g.emphasis ? 1 : 0);
        tone.push(t);
      }
      droplets.push(...shiftChains(pastes[i].droplets, shift[i], down));
    });
    // What no hand could draw is set as text, and counts as ink like the paste.
    const lineShiftAt = (x: number, line: number) => {
      let last = 0;
      layout.glyphs.forEach((g, i) => {
        if (g.line === line && g.x <= x) last = shift[i];
      });
      return last;
    };
    const texts = layout.missing.map((m) => {
      const b = measurer.bounds("sans", m.text);
      const x = m.x + lineShiftAt(m.x, m.line);
      const y = m.y + (drop.get(m.line) ?? 0);
      return { m: { ...m, x, y }, rect: { x: x - b.left * m.size, y: y - b.ascent * m.size, w: (b.left + b.right) * m.size, h: (b.ascent + b.descent) * m.size } };
    });
    const parts = [...(chains.length ? [rectOf(boundsOf(chains))] : []), ...texts.map((t) => t.rect)];
    if (!parts.length) return empty;
    const ink = union(parts);

    // The ink, not the advances, centred in the box (or set to its top
    // left, for a style set from the left): a lean or a swelling on one
    // side would otherwise push it out of that side alone.
    const left = style.spec.align === "left";
    const dx = left ? box.x - ink.x : box.x + (box.w - ink.w) / 2 - ink.x;
    const dy = left ? box.y - ink.y : box.y + (box.h - ink.h) / 2 - ink.y;
    made = {
      chains: shiftChains(chains, dx, dy),
      glyphOf,
      lineOf,
      colourOf,
      tone,
      droplets: shiftChains(droplets, dx, dy),
      missing: texts.map(
        ({ m }): Op => ({ kind: "text", text: m.text, face: "sans", size: m.size, x: m.x + dx, y: m.y + dy, color: textColour(m.emphasis) }),
      ),
      readable: { x: ink.x + dx, y: ink.y + dy, w: ink.w, h: ink.h },
      xHeight: (layout.sizes.reduce((sum, v) => sum + v, 0) / Math.max(1, layout.sizes.length)) * xHeightEm,
    };
    const overX = Math.max(0, ink.w - box.w) / 2;
    const overY = Math.max(0, ink.h - box.h) / 2;
    if (overX <= 0.25 && overY <= 0.25) break;
    // Too big for the box even centred: set again in a smaller one, by a little more than the excess.
    inner = shrink(inner, { x: overX * 1.15 + 1, top: overY * 1.15 + 1, bottom: overY * 1.15 + 1 });
  }
  let set = made as Set;
  // A smaller box can choose other lines, so the tries may end a pixel
  // over: then the paste itself is scaled down about the box's middle,
  // which always fits.
  const k = Math.min(1, box.w / Math.max(1e-6, set.readable.w), box.h / Math.max(1e-6, set.readable.h));
  if (k < 1) {
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const scale = (c: Chain) => c.map((b) => ({ x: cx + (b.x - cx) * k, y: cy + (b.y - cy) * k, r: b.r * k }));
    const r = set.readable;
    set = {
      ...set,
      chains: set.chains.map(scale),
      droplets: set.droplets.map(scale),
      missing: set.missing.map((op) => (op.kind === "text" ? { ...op, x: cx + (op.x - cx) * k, y: cy + (op.y - cy) * k, size: op.size * k } : op)),
      readable: { x: cx + (r.x - cx) * k, y: cy + (r.y - cy) * k, w: r.w * k, h: r.h * k },
      xHeight: set.xHeight * k,
    };
  }
  // A droplet is ornament, but it must land whole on the cover.
  const onCover = (c: Chain) => c.every((b) => b.x - b.r >= canvas.x && b.x + b.r <= canvas.x + canvas.w && b.y - b.r >= canvas.y && b.y + b.r <= canvas.y + canvas.h);
  return { ...set, droplets: set.droplets.filter(onCover) };
}

/**
 * What a layer of paste is, from the paste itself: every bead, which colour
 * and tone it takes, to a hundredth of a pixel. A made layer is kept under
 * this, so it is never drawn where paste that has since moved used to be;
 * the colours themselves are left out, since they are only light.
 */
export function pasteKey(chains: Chain[], colourOf: number[], tone: number[], finish: Finish, pool: number): string {
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  const mix = (v: number) => {
    const n = Math.round(v * 100) | 0;
    a = Math.imul(a ^ n, 0x01000193) >>> 0;
    b = Math.imul(b ^ n, 0x85ebca6b) >>> 0;
    b ^= b >>> 13;
  };
  chains.forEach((chain, i) => {
    mix(chain.length);
    for (const bead of chain) {
      mix(bead.x);
      mix(bead.y);
      mix(bead.r);
    }
    mix(colourOf[i] ?? 0);
    mix((tone[i] ?? 1) * 1000);
  });
  mix(pool);
  return `${finish}|${chains.length}|${a.toString(36)}${b.toString(36)}`;
}

/** A layer of paste from its parts, keyed by what it is. */
function pasteOp(
  chains: Chain[],
  letters: number,
  colours: string[],
  colourOf: number[],
  tone: number[],
  finish: Finish,
  ground: string | null,
  pool: number,
  glyphOf: number[] = [],
  lineOf: number[] = [],
  shadow = false,
  under: string | null = null,
): LiquidOp {
  const key = pasteKey(chains, colourOf, tone, finish, pool);
  return { kind: "liquid", chains, letters, glyphOf, lineOf, colours, colourOf, tone, finish, ground, under, pool, shadow, seed: hashString(key), key };
}

function liquidOp(set: Set, style: LiquidStyle, colours: string[], ground: string | null, withDroplets: boolean, shadow = false, under: string | null = null): LiquidOp {
  const chains = withDroplets ? [...set.chains, ...set.droplets] : set.chains;
  const typical = set.chains.length ? set.chains.reduce((sum, c) => sum + c[0].r, 0) / set.chains.length : 10;
  return pasteOp(
    chains,
    set.chains.length,
    colours,
    [...set.colourOf, ...(withDroplets ? set.droplets.map(() => 0) : [])],
    // Flat paste is one colour throughout: no letter lighter or darker than the next.
    style.finish === "flat" ? chains.map(() => 1) : [...set.tone, ...(withDroplets ? set.droplets.map(() => 1) : [])],
    style.finish,
    ground,
    typical * style.pool,
    set.glyphOf,
    set.lineOf,
    shadow,
    under,
  );
}

/** Pasty's and Pasty Flat's letterings: their own Drip, or Stickery's Goo in their gel or paste. */
export type PastyLetteringId = "drip" | PasteLetteringId;

/** In the owner's order (7 Oct): Goo Teardrop first, and the default, then Goo Even, then Drip. */
export const PASTY_LETTERINGS: readonly { id: PastyLetteringId; name: string }[] = [
  { id: "goo", name: "Goo Teardrop" },
  { id: "goo-even", name: "Goo Even" },
  { id: "drip", name: "Drip" },
];

export const DEFAULT_PASTY_LETTERING: PastyLetteringId = "goo";

export function isPastyLetteringId(value: unknown): value is PastyLetteringId {
  return PASTY_LETTERINGS.some((l) => l.id === value);
}

/**
 * Goo, as a teardrop or evened out, set as Pasty sets its words (centred,
 * lines packed to fill the cover) in Pasty's glossy gel or Pasty Flat's
 * flat paste, laid on thicker. Its own hand otherwise: its kerning, its
 * joins, its teardrops, no spatter.
 */
function pastyGoo(goo: LiquidStyle, flat: boolean): LiquidStyle {
  return {
    ...goo,
    spec: { ...goo.spec, maxSize: PASTY.spec.maxSize, minSize: PASTY.spec.minSize, maxLines: PASTY.spec.maxLines, align: undefined, salt: "pasty-goo" },
    recipe: (letters) => {
      const r = goo.recipe(letters);
      return flat ? { ...r, weight: r.weight * 1.3 } : r;
    },
    finish: flat ? "flat" : "gloss",
    pool: flat ? 0.35 : goo.pool,
  };
}

/** A style with the shuffle mixed into its seeds: the same title, drawn another way. */
function shuffled(style: LiquidStyle, seed: number): LiquidStyle {
  return seed ? { ...style, spec: { ...style.spec, salt: `${style.spec.salt}#${seed}` } } : style;
}

/** Paste squeezed into letters: wet, glossy gel, or flat paste of one colour. */
function pasty(paragraphs: Paragraph[], safe: Rect, canvas: Rect, palette: Palette, measurer: Measurer, flat: boolean, seed: number, lettering: PastyLetteringId, photo: boolean) {
  const base = lettering === "drip" ? (flat ? PASTY_FLAT : PASTY) : pastyGoo(PASTE_LETTERINGS[lettering], flat);
  const style = shuffled(base, seed);
  const set = setLiquid(paragraphs, safe, style, canvas, (e) => (e ? palette.accent : palette.ink), measurer);
  return {
    // The paste draws no ground of its own: on a photo its shadow falls on
    // the photo; with none, the cover is clear but for the paste and its
    // shadow, a stain as it would fall on the ground chosen, which the
    // paste is still lit as lying on. Flat paste casts no shadow at all.
    ops: [liquidOp(set, style, [palette.ink, palette.accent], null, true, !flat, photo ? null : palette.bg), ...set.missing] as Op[],
    readable: set.readable,
  };
}

/** Every op moved by (dx, dy). */
function moveOp(op: Op, dx: number, dy: number): Op {
  if (op.kind === "text" || op.kind === "box") return { ...op, x: op.x + dx, y: op.y + dy };
  if (op.kind === "shape") return { ...op, polygons: op.polygons.map((p) => p.map((v, i) => v + (i % 2 ? dy : dx))) };
  if (op.kind === "turn") return { ...op, cx: op.cx + dx, cy: op.cy + dy, ops: op.ops.map((inner) => moveOp(inner, dx, dy)) };
  return op;
}

/** Beads turned by `angle` about (cx, cy). */
function turnChains(chains: Chain[], cx: number, cy: number, angle: number): Chain[] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return chains.map((c) => c.map((b) => ({ x: cx + (b.x - cx) * cos - (b.y - cy) * sin, y: cy + (b.x - cx) * sin + (b.y - cy) * cos, r: b.r })));
}

/** Something already on a sticker, which what is placed next must keep clear of. */
type Part = ({ kind: "circle"; x: number; y: number; r: number } | ({ kind: "box" } & Rect)) & { funky: boolean };

/**
 * How far `part` may move down (`dir` 1) or up (-1) before it comes within
 * `gap(other)` of one of `others`; Infinity if none is in its way. Only what
 * lies ahead of it counts, judged by centres.
 */
function travel(part: Part, dir: 1 | -1, others: readonly Part[], gap: (other: Part) => number): number {
  let best = Infinity;
  const pc = part.kind === "circle" ? part.y : part.y + part.h / 2;
  for (const o of others) {
    const oc = o.kind === "circle" ? o.y : o.y + o.h / 2;
    if ((oc - pc) * dir <= 0) continue;
    const g = gap(o);
    let t = Infinity;
    if (part.kind === "box" && o.kind === "box") {
      if (part.x >= o.x + o.w + g || part.x + part.w <= o.x - g) continue;
      t = dir > 0 ? o.y - g - (part.y + part.h) : part.y - (o.y + o.h + g);
    } else if (part.kind === "box" && o.kind === "circle") {
      const dx = Math.max(part.x - o.x, 0, o.x - (part.x + part.w));
      const reach = o.r + g;
      if (dx >= reach) continue;
      const h = Math.sqrt(reach * reach - dx * dx);
      t = dir > 0 ? o.y - h - (part.y + part.h) : part.y - (o.y + h);
    } else if (part.kind === "circle" && o.kind === "box") {
      const dx = Math.max(o.x - part.x, 0, part.x - (o.x + o.w));
      const reach = part.r + g;
      if (dx >= reach) continue;
      const h = Math.sqrt(reach * reach - dx * dx);
      t = dir > 0 ? o.y - (part.y + h) : part.y - h - (o.y + o.h);
    } else if (part.kind === "circle" && o.kind === "circle") {
      const dx = Math.abs(part.x - o.x);
      const reach = part.r + o.r + g;
      if (dx >= reach) continue;
      const h = Math.sqrt(reach * reach - dx * dx);
      t = dir > 0 ? o.y - h - part.y : part.y - (o.y + h);
    }
    if (t < best) best = t;
  }
  return best;
}

/** The least of each part's travel: how far a whole word may move. */
function travelAll(parts: readonly Part[], dir: 1 | -1, others: readonly Part[], gap: (other: Part) => number): number {
  let best = Infinity;
  for (const p of parts) best = Math.min(best, travel(p, dir, others, gap));
  return best;
}

/**
 * Where the funky word's strokes reach out toward a line being set below
 * it (`dir` -1: a drip, a descender, a t's foot) or above it (1: an
 * ascender), half an x-height or more past the rest of its edge on that
 * side: each a span across, [left, right], in pixels of the picture.
 */
function reaching(parts: readonly Part[], dir: 1 | -1, xh: number): [number, number][] {
  if (!parts.length) return [];
  const step = Math.max(1, xh * 0.25);
  const all = boundsOfParts(parts);
  const columns = Math.max(1, Math.ceil(all.w / step));
  // The ink's furthest reach on that side, column by column: up for a line above, down for one below.
  const edge = new Array<number>(columns).fill(NaN);
  for (const p of parts) {
    const [x0, x1, top, bottom] = p.kind === "circle" ? [p.x - p.r, p.x + p.r, p.y - p.r, p.y + p.r] : [p.x, p.x + p.w, p.y, p.y + p.h];
    for (let c = Math.max(0, Math.floor((x0 - all.x) / step)); c <= Math.min(columns - 1, Math.floor((x1 - all.x) / step)); c += 1) {
      const v = dir > 0 ? -top : bottom;
      if (!(edge[c] >= v)) edge[c] = v;
    }
  }
  const known = edge.filter((v) => Number.isFinite(v)).sort((p, q) => p - q);
  if (!known.length) return [];
  const typical = known[Math.floor(known.length / 2)];
  const spans: [number, number][] = [];
  edge.forEach((v, c) => {
    if (!(v > typical + 0.5 * xh)) return;
    const [a, b] = [all.x + c * step, all.x + (c + 1) * step];
    const last = spans[spans.length - 1];
    if (last && a - last[1] < 0.2 * xh) last[1] = b;
    else spans.push([a, b]);
  });
  return spans;
}

function moveParts(parts: readonly Part[], dx: number, dy: number): Part[] {
  return parts.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
}

function boundsOfParts(parts: readonly Part[]): Rect {
  return union(parts.map((p) => (p.kind === "circle" ? { x: p.x - p.r, y: p.y - p.r, w: 2 * p.r, h: 2 * p.r } : p)));
}

/**
 * Each typed line a sticker of straight steps, in turn the chosen colour
 * and one a hundred degrees round the wheel from it, its funky words
 * (starred, or the longest when nothing is) with its plain ones fitted
 * round them, as one unit. Everything, the
 * steps and their padding included, scales with one size, the largest at
 * which it all fits.
 *
 * The funky word is placed first and turned to an angle of its own; the
 * plain words before it are dropped onto it one by one, and those after it
 * lifted up under it, each until it comes a small, random distance from the
 * funky word's actual strokes. So "do what you" settles into the dips and
 * round the tall strokes of "want", each word at its own height, and the
 * sticker wraps the two as one, its steps tracing their ink, with no hole
 * between. Plain words are never turned; a long run of them wraps to about
 * the funky word's width. Each sticker sits somewhere along the cover's
 * width, its sides stepped wherever they would run straight. All from the
 * title and the shuffle. The letters are black or white, whichever reads on
 * their sticker, unless a text colour is picked, which every sticker's take.
 */
function stickery(
  paragraphs: Paragraph[],
  safe: Rect,
  palette: Palette,
  measurer: Measurer,
  seed: number,
  lettering: LetteringId,
  plainFace: PlainFaceId,
  textColour: string | null,
) {
  const starred = paragraphs.some((p) => p.some((w) => w.some((s) => s.emphasis)));
  // Which words are funky: the starred ones, else each sticker's longest.
  const groups = paragraphs.map((p) => {
    const length = (w: Paragraph[number]) => w.map((s) => s.text).join("").length;
    const longest = p.reduce((best, w, i) => (length(w) > length(p[best]) ? i : best), 0);
    const words = p.map((w, i) => ({ word: w, goo: starred ? w.some((s) => s.emphasis) : i === longest }));
    const runs: { goo: boolean; words: Paragraph }[] = [];
    for (const w of words) {
      const last = runs[runs.length - 1];
      if (last && last.goo === w.goo) last.words.push(w.word);
      else runs.push({ goo: w.goo, words: [w.word] });
    }
    return runs;
  });
  const funkyFace = letteringFace(lettering);
  const chosen = LETTERINGS.find((l) => l.id === lettering) ?? LETTERINGS[0];
  const plainShare = chosen.plain;
  const steps = chosen.steps;
  const paste = funkyFace ? null : shuffled(PASTE_LETTERINGS[lettering as PasteLetteringId], seed);
  const salt = hashString(`stickery#${lettering}#${seed}#${paragraphs.map((p) => p.map((w) => w.map((s) => s.text).join("")).join(" ")).join("\n")}`);

  // The plain words a little under half the funky ones' size, their capitals as tall in every face.
  const plainScale = 0.42 * (0.72 / Math.max(0.5, measurer.metrics(plainFace).cap));
  const anywhere = { x: -1e5, y: -1e5, w: 2e5, h: 2e5 };
  /**
   * A face's x-height, in em: the middle of what its round and flat
   * lowercase letters ink, since a script's x can be drawn short of them.
   */
  const xHeightOf = (face: FaceId): number => {
    const tops = [..."xanoue"].map((c) => measurer.bounds(face, c).ascent).sort((p, q) => p - q);
    return (tops[2] + tops[3]) / 2;
  };
  const inkBox = (face: FaceId, text: string, x: number, baseline: number, size: number): Rect => {
    const b = measurer.bounds(face, text);
    return { x: x - b.left * size, y: baseline - b.ascent * size, w: (b.left + b.right) * size, h: (b.ascent + b.descent) * size };
  };
  /**
   * A word's ink as thin upright strips, from the measurer's columns: what
   * other words settle against and the sticker's steps go round, so both
   * follow the letters' real shape, a dip between two tall letters
   * included. Its box, where the measurer cannot say.
   */
  /** Each letter's ink box, where it sits in the word. */
  const letterBoxes = (face: FaceId, text: string, x: number, baseline: number, size: number): Rect[] => {
    const out: Rect[] = [];
    let before = "";
    for (const g of graphemes(text)) {
      if (g.trim()) out.push(inkBox(face, g, x + measurer.width(face, before) * size, baseline, size));
      before += g;
    }
    return out;
  };
  const inkStrips = (face: FaceId, text: string, x: number, baseline: number, size: number): Rect[] => {
    const cols = measurer.columns?.(face, text);
    if (cols && cols.length) return cols.map((c) => ({ x: x + c.x * size, y: baseline + c.top * size, w: c.w * size, h: (c.bottom - c.top) * size }));
    // Letter by letter, where the measurer cannot see the ink.
    return letterBoxes(face, text, x, baseline, size);
  };

  /** A run of funky words, set from (0, 0) and turned: its ops, its paste, the parts to keep clear of, the boxes its steps go round. */
  const funkyRun = (run: (typeof groups)[number][number], size: number, ink: string, next: () => number) => {
    const texts: Op[] = [];
    let chains: Chain[] = [];
    let parts: Part[] = [];
    let boxes: Rect[] = [];
    /** Each turned word's whole box: more than its letters' ink, and what the sticker must be fitted by, to be sure of it. */
    const extent: Rect[] = [];
    // Turned a few degrees either way: enough to read as thrown on, not so much the steps under it climb a staircase.
    const tilt = (next() < 0.5 ? -1 : 1) * between(next, 0.035, 0.1);
    /** The run's ink height before it is turned, and its x-height, which the plain words beside it are sized against. */
    let inkHeight = size;
    let xHeight = size * 0.45;
    if (paste) {
      const set = setLiquid([run.words], { x: 0, y: 0, w: size * 5.2, h: size * 3.6 }, { ...paste, spec: { ...paste.spec, maxSize: size, minSize: size * 0.45 } }, anywhere, () => ink, measurer);
      const r = set.readable;
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      inkHeight = r.h;
      xHeight = set.xHeight;
      chains = turnChains(set.chains, cx, cy, tilt);
      parts = chains.flatMap((c) => c.map((b): Part => ({ kind: "circle", x: b.x, y: b.y, r: b.r, funky: true })));
      // The steps go round the paste itself, bead by bead, so they climb a leaning stroke and round a swash's ball.
      boxes = chains.flatMap((c) => c.map((b) => ({ x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2 })));
      for (const t of set.missing) {
        if (t.kind !== "text") continue;
        texts.push({ kind: "turn", cx, cy, angle: tilt, ops: [t] });
        const box = turnedBounds(inkBox(t.face, t.text, t.x, t.y, t.size), cx, cy, tilt);
        boxes.push(box);
        parts.push({ kind: "box", ...box, funky: true });
      }
    } else if (funkyFace) {
      const set = flow(
        [run.words],
        { box: { x: 0, y: 0, w: size * 6, h: size * 6 }, face: funkyFace, emphasisFace: funkyFace, maxSize: size * FUNKY_SCALE, minSize: size * FUNKY_SCALE, leading: 0.92, align: "left" },
        measurer,
      );
      const words: Op[] = [];
      /** The words' ink, strip by strip: what the plain words settle against and the steps go round. */
      const letters: Rect[] = [];
      /** Paper behind the gaps between a line's words, so the sticker runs on under the whole line. */
      const spine: Rect[] = [];
      for (const l of set.lines) {
        /** How far the words still to come on this line move left, by what closing up apostrophes saved. */
        let pull = 0;
        const spans: { x: number; w: number }[] = [];
        for (const seg of l.segments) {
          // A script's apostrophe sits wide of its letters ("aren 't"), so a
          // word is set in pieces at its apostrophes, each a twentieth of an
          // em of clear paper from the ink beside it.
          const pieces = seg.text.split(/(['\u2019])/u).filter(Boolean);
          let x = seg.x - pull;
          const start = x;
          let end = x;
          pieces.forEach((piece, k) => {
            if (k > 0) {
              // Kerned by the ink at the same height (an apostrophe floats
              // high over an n's low exit), or by the two boxes where the
              // measurer cannot see the ink.
              const gap = seg.size * 0.05;
              const before = inkStrips(seg.face, pieces[k - 1], x, l.baseline, seg.size);
              const here = inkStrips(seg.face, piece, 0, l.baseline, seg.size);
              let at = -Infinity;
              for (const b of before) for (const h of here) if (h.y < b.y + b.h && b.y < h.y + h.h) at = Math.max(at, b.x + b.w + gap - h.x);
              if (!Number.isFinite(at)) {
                const box = inkBox(seg.face, pieces[k - 1], x, l.baseline, seg.size);
                at = box.x + box.w + gap + measurer.bounds(seg.face, piece).left * seg.size;
              }
              x = at;
            }
            words.push({ kind: "text", text: piece, face: seg.face, size: seg.size, x, y: l.baseline, color: ink });
            // The word's own ink, strip by strip, so the plain words can settle among its letters.
            letters.push(...inkStrips(seg.face, piece, x, l.baseline, seg.size));
            end = x + measurer.width(seg.face, piece) * seg.size;
          });
          if (pieces.length > 1) pull += seg.x - pull + seg.width - end;
          spans.push({ x: start, w: end - start });
        }
        const first = l.segments[0];
        const [head, tail] = [spans[0], spans[spans.length - 1]];
        if (first && head && tail && spans.length > 1) {
          const step = first.size * 0.12;
          for (let x = head.x + head.w; x < tail.x; x += step) spine.push({ x, y: l.baseline - first.size * 0.38, w: step, h: first.size * 0.36 });
        }
      }
      const r = letters.length ? union(letters) : { x: 0, y: 0, w: 0, h: 0 };
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      inkHeight = r.h;
      xHeight = xHeightOf(funkyFace) * size * FUNKY_SCALE;
      texts.push({ kind: "turn", cx, cy, angle: tilt, ops: words });
      for (const op of words) if (op.kind === "text") extent.push(turnedBounds(inkBox(op.face, op.text, op.x, op.y, op.size), cx, cy, tilt));
      parts = letters.map((b): Part => ({ kind: "box", ...turnedBounds(b, cx, cy, tilt), funky: true }));
      boxes = [...letters, ...spine].map((b) => turnedBounds(b, cx, cy, tilt));
    }
    return { texts, chains, parts, boxes, extent, inkHeight, xHeight };
  };

  /** A run of plain words, each measured, wrapped to lines no wider than `wrapAt`. */
  const plainLines = (run: (typeof groups)[number][number], size: number, wrapAt: number) => {
    const words = run.words.map((w) => {
      const text = w.map((s) => s.text).join("");
      return { text, width: measurer.width(plainFace, text) * size };
    });
    const space = measurer.width(plainFace, " ") * size;
    const lines: { text: string; width: number; x: number }[][] = [];
    let line: { text: string; width: number; x: number }[] = [];
    let used = 0;
    for (const w of words) {
      const add = (line.length ? space : 0) + w.width;
      if (line.length && used + add > wrapAt) {
        lines.push(line);
        line = [];
        used = 0;
      }
      line.push({ ...w, x: used + (line.length ? space : 0) });
      used += line.length > 1 ? space + w.width : w.width;
    }
    if (line.length) lines.push(line);
    return lines.map((l) => ({ words: l, width: l.length ? l[l.length - 1].x + l[l.length - 1].width : 0 }));
  };

  const plainXHeight = xHeightOf(plainFace);

  const build = (size: number) => {
    const plainSize = size * plainScale;
    const colours: string[] = [];
    const stickers = groups.map((runs, gi) => {
      const next = random(mixSeed(salt, gi + 1));
      const fill = palette.sticker[gi % 2];
      const ink = textColour ?? readableOn(fill);
      if (!colours.includes(ink)) colours.push(ink);
      const inkIndex = colours.indexOf(ink);
      const texts: Op[] = [];
      const chains: Chain[] = [];
      const colourOf: number[] = [];
      const boxes: Rect[] = [];
      const extent: Rect[] = [];
      let placed: Part[] = [];
      let funky: Rect | null = null;
      let funkyHeight = 0;
      let funkyX = 0;
      /** The plain x-heights this sticker is set in: what its steps and padding are measured in. */
      const xHeights: number[] = [];

      /**
       * Plain lines put on the sticker, below what is there (rising to it)
       * or above it (dropping onto it), as the references set them:
       *
       * - sized against the funky word, the plain x-height the lettering's
       *   share of its x-height, a longer line run near its width;
       * - a short line centred on it, a line above flush with its left (the
       *   funky word starting a little further in), a line below flush with
       *   its right; then slid along, a little either way, to wherever the
       *   words settle closest into its dips;
       * - settled as one, every word on one baseline, but for one word of a
       *   longer line that sits up on a tall letter the others drop past;
       *   never turned, its word spaces the face's own.
       */
      const setPlain = (run: (typeof groups)[number][number], ri: number, dir: 1 | -1) => {
        // Beside a funky word, the lettering's share of its x-height; on a
        // sticker with none, the size its words would have beside one of
        // this cover's, so it matches the stickers round it.
        const besideX = funky ? funkyX : paste ? strokeMetrics(paste.spec.fonts[0]?.id ?? "drip").xHeight * size : xHeightOf(funkyFace ?? plainFace) * size * FUNKY_SCALE;
        const base = Math.max(plainSize * 0.4, (plainShare * besideX) / plainXHeight);
        const wrapAt = funky ? Math.max(funky.w * 1.15, base * 7) : base * 14;
        const lines = plainLines(run, base, wrapAt);
        const ordered = dir < 0 ? lines : [...lines].reverse();
        const lineNext = random(mixSeed(salt, (gi + 1) * 1009 + ri));
        ordered.forEach((line, li) => {
          // A line of three words or more no wider than the funky word, near
          // enough; a shorter one under two fifths of its width grown toward
          // that, as Main Sticker 1's "it is" is; any other keeps its size.
          const fit = !funky
            ? 1
            : line.words.length >= 3
              ? Math.min(1, Math.max(0.7, (funky.w * 0.97) / Math.max(1, line.width)))
              : Math.min(1.25, Math.max(1, (funky.w * 0.4) / Math.max(1, line.width)));
          const size = base * fit;
          const xh = size * plainXHeight;
          xHeights.push(xh);
          const width = line.width * fit;
          const words = line.words.map((w) => ({ text: w.text, x: w.x * fit, w: measurer.width(plainFace, w.text) * size }));
          const space = measurer.width(plainFace, " ") * size;
          const ref = funky ?? (placed.length ? boundsOfParts(placed) : { x: 0, y: 0, w: width, h: 0 });
          const preferred =
            !funky
              ? ref.x
              : width > ref.w || width < ref.w * 0.4
                ? ref.x + (ref.w - width) / 2 + between(lineNext, -0.08, 0.08) * ref.w
                : dir > 0
                  ? ref.x - between(lineNext, 0.4, 0.8) * xh
                  : ref.x + ref.w - width + between(lineNext, 0, 0.3) * xh;
          const all = placed.length ? boundsOfParts(placed) : { x: 0, y: 0, w: 0, h: 0 };
          const gapFor = (wi: number) => {
            const g = between(random(mixSeed(salt, gi * 7919 + ri * 101 + li * 13 + wi)), 0.08, 0.17) * xh;
            return (o: Part) => (o.funky ? g : 0.12 * xh);
          };
          // Every word of the line starts from one baseline, just clear of what is there, so a word's
          // descender or ascender never sets it apart from the others before it has moved.
          const inks = words.map((w) => inkBox(plainFace, w.text, 0, 0, size));
          const lineFrom = dir < 0 ? all.y + all.h + size * 0.3 - Math.min(...inks.map((b) => b.y)) : all.y - size * 0.3 - Math.max(...inks.map((b) => b.y + b.h));
          /** Each word's settling at one place along the line (and each word's own shift along it): how far it may go toward what is there. */
          const trial = (x0: number, offsets: readonly number[]) =>
            words.map((w, wi) => {
              const x = x0 + w.x + offsets[wi];
              const start = inkBox(plainFace, w.text, x, 0, size);
              const strips = inkStrips(plainFace, w.text, x, 0, size);
              const from = lineFrom;
              const parts = strips.map((b): Part => ({ kind: "box", ...b, y: b.y + from, funky: false }));
              const over = funky ? start.x < funky.x + funky.w && start.x + start.w > funky.x : true;
              // A line further from the funky word only settles onto the line before it.
              const most = li === 0 ? (over ? funkyHeight * 0.6 : funkyHeight * 0.1) + size * 0.3 : size * 0.32;
              const t = placed.length ? Math.min(travelAll(parts, dir < 0 ? -1 : 1, placed, gapFor(wi)), most) : 0;
              return { w, x, start, strips, from, room: Number.isFinite(t) ? t : most };
            });
          /**
           * How far each word goes. Above the funky word, each settles onto
           * what is under it, as far as it may, but never more than 0.9 of
           * an x-height below the highest of them (0.35 in a line of two,
           * which Main Sticker 1 sets level: "it is"), so "do" and "what"
           * come down onto "wa" while "you" sits up by the t, as its words
           * do. Below it, the line settles as one, as Main Sticker 2's "they
           * seem" does, so no word comes apart from the rest.
           */
          const settle = (rooms: number[]) => {
            const least = rooms.length ? Math.min(...rooms) : 0;
            const spread = (rooms.length >= 3 ? 0.9 : 0.35) * xh;
            return rooms.map((r) => (dir > 0 ? Math.min(r, least + spread) : least));
          };
          /** Held over the funky word: starting no more than 0.7 of an x-height before it and ending no more than 0.3 past it. */
          const hold = (x0: number, w: number) => {
            if (!funky) return x0;
            const lo = funky.x - 0.7 * xh;
            const hi = funky.x + funky.w + 0.3 * xh - w;
            return lo <= hi ? Math.min(hi, Math.max(lo, x0)) : (lo + hi) / 2;
          };
          // Where to try: slid a little either way, and set so a word space
          // falls by each stroke of the funky word that reaches toward the
          // line (a drip, a descender, an ascender), the space widened to
          // let it through (to 1.5 of its own), as Main Sticker 2's t drops
          // between "they" and "seem".
          const unmoved = words.map(() => 0);
          const tries: { x0: number; offsets: readonly number[] }[] = [0, -0.3, 0.3, -0.6, 0.6].map((shift) => ({ x0: preferred + shift * xh, offsets: unmoved }));
          if (funky && li === 0 && words.length >= 2) {
            for (const [a, b] of reaching(placed.filter((o) => o.funky), dir, xh)) {
              for (let k = 0; k < words.length - 1; k += 1) {
                const extra = Math.max(0, Math.min(0.5 * space, b - a + 0.3 * xh - space));
                const offsets = words.map((_, i) => (i > k ? extra : 0));
                const gapMiddle = words[k].x + words[k].w + (space + extra) / 2;
                tries.push({ x0: (a + b) / 2 - gapMiddle, offsets });
              }
            }
          }
          // Wherever the line settles closest, not far from where it belongs, over the funky word.
          let best: { x0: number; offsets: readonly number[]; score: number; settled: ReturnType<typeof trial>; went: number[] } | null = null;
          for (const t of tries) {
            const spread = t.offsets[t.offsets.length - 1] ?? 0;
            const x0 = hold(t.x0, width + spread);
            const settled = trial(x0, t.offsets);
            const went = settle(settled.map((p) => p.room));
            // Closest is best: as little gap left under the words as can be,
            // as deep a settling, as little sliding, and every word over the funky one.
            const n = Math.max(1, settled.length);
            const left = settled.reduce((sum, p, i) => sum + (p.room - went[i]), 0) / n;
            const deep = went.reduce((sum, d) => sum + d, 0) / n;
            const off = funky ? settled.filter((p) => !(p.start.x < funky!.x + funky!.w && p.start.x + p.start.w > funky!.x)).length : 0;
            const score = left / xh - (deep / xh) * 0.5 + (Math.abs(x0 - preferred) / xh) * 0.12 + off * 0.5 + (spread / xh) * 0.4;
            if (!best || score < best.score - 1e-9) best = { x0, offsets: t.offsets, score, settled, went };
          }
          if (!best) return;
          // Then bobbed, as Main Sticker 1's "do what you" is: a line above
          // the funky word of three words or more has one lifted clear of the
          // rest and the others a little, a line of two a little; each only
          // ever away from what is there, so nothing comes nearer. A line
          // below sits as it settled, as Main Sticker 2's "they seem" does.
          const bobNext = random(mixSeed(salt, gi * 104729 + ri * 31 + li));
          const n = best.settled.length;
          const peaked = n >= 3 && new Set(best.went.map((w) => Math.round(w))).size > 1;
          const raised = Math.floor(bobNext() * n);
          const bob = best.settled.map((_, i) => (dir < 0 || n < 2 || peaked ? 0 : n >= 3 && i === raised ? between(bobNext, 0.28, 0.5) : between(bobNext, 0, n >= 3 ? 0.14 : 0.1)) * xh);
          let previous: { right: number; baseline: number } | null = null;
          for (const [i, p] of best.settled.entries()) {
            const dy = p.from + (dir < 0 ? -(best.went[i] - bob[i]) : best.went[i] - bob[i]);
            // Paper behind the space before this word, at the x-height of the two.
            if (previous) {
              const top = Math.max(previous.baseline, dy) - xh * 0.95;
              boxes.push({ x: previous.right, y: top, w: Math.max(0, p.start.x - previous.right), h: xh * 0.9 });
            }
            previous = { right: p.start.x + p.start.w, baseline: dy };
            texts.push({ kind: "text", text: p.w.text, face: plainFace, size, x: p.x, y: dy, color: ink });
            const strips = p.strips.map((b) => ({ ...b, y: b.y + dy }));
            boxes.push(...strips);
            extent.push({ ...p.start, y: p.start.y + dy });
            placed = [...placed, ...strips.map((b): Part => ({ kind: "box", ...b, funky: false }))];
          }
        });
      };

      const above: { run: (typeof groups)[number][number]; ri: number }[] = [];
      runs.forEach((run, ri) => {
        if (!run.goo) {
          if (!placed.length) above.push({ run, ri });
          else setPlain(run, ri, -1);
          return;
        }
        const made = funkyRun(run, size, ink, random(mixSeed(salt, (gi + 1) * 7 + ri)));
        let parts = made.parts;
        let dx = 0;
        let dy = 0;
        if (placed.length) {
          // Somewhere along what is there, then up from below until clear of it.
          const all = boundsOfParts(placed);
          const own = boundsOfParts(parts);
          dx = (own.w <= all.w ? all.x + next() * (all.w - own.w) : all.x - next() * (own.w - all.w)) - own.x;
          dy = all.y + all.h + plainSize * 0.4 - own.y;
          parts = moveParts(parts, dx, dy);
          const xh = xHeights.length ? xHeights[xHeights.length - 1] : plainSize * plainXHeight;
          const gap = between(next, 0.1, 0.2) * xh;
          const t = travelAll(parts, -1, placed, () => gap);
          const rise = Number.isFinite(t) ? Math.max(0, t) : 0;
          dy -= rise;
          parts = moveParts(parts, 0, -rise);
        }
        texts.push(...made.texts.map((op) => moveOp(op, dx, dy)));
        for (const c of shiftChains(made.chains, dx, dy)) {
          chains.push(c);
          colourOf.push(inkIndex);
        }
        boxes.push(...made.boxes.map((b) => ({ ...b, x: b.x + dx, y: b.y + dy })));
        extent.push(...made.extent.map((b) => ({ ...b, x: b.x + dx, y: b.y + dy })));
        placed = [...placed, ...parts];
        funky = boundsOfParts(parts);
        funkyHeight = made.inkHeight;
        funkyX = made.xHeight;
        // What came before the first funky word drops onto it, the line nearest it first.
        for (const a of above.splice(0).reverse()) setPlain(a.run, a.ri, 1);
      });
      // A sticker with no funky word at all: its plain words in lines.
      for (const a of above.splice(0)) setPlain(a.run, a.ri, -1);

      // Measured in the plain words' x-height, as the references' steps are:
      // the grid and the paper round the ink the lettering's own (coarse
      // under a script, as Main Sticker 1's; a fine staircase under goo, as
      // Main Sticker 2's), a border a twenty-fifth of it.
      const unit = xHeights.length ? xHeights.reduce((a, b) => a + b, 0) / xHeights.length : plainSize * plainXHeight;
      const cell = Math.max(2, unit * steps.cell);
      const polygons = steppedOutline(boxes, { cell, cellY: Math.max(2, unit * steps.cellY), pad: unit * steps.pad, rough: { run: Math.max(6, Math.round(ROUGH_RUN / steps.cell)), seed: mixSeed(salt, 0x5e7 + gi) }, onePiece: true });
      // Fitted by the paper and every turned funky word's whole box, so nothing it draws can pass the safe area.
      return { fill, texts, chains, colourOf, polygons, bounds: union([polygonBounds(polygons), ...extent]), next, unit };
    });
    // Then stacked, well apart, each set a little to the left or right of
    // the one before (Main Sticker 2's lower sticker sits an eighth of its
    // width left), so a stack zigzags rather than lining up.
    const texts: Op[] = [];
    const shapes: Op[] = [];
    const chains: Chain[] = [];
    const colourOf: number[] = [];
    const boxes: Rect[] = [];
    let y = 0;
    let x = 0;
    for (const [i, st] of stickers.entries()) {
      if (i) x += (i % 2 ? -1 : 1) * between(st.next, 0.08, 0.16) * st.bounds.w;
      const dx = x - st.bounds.x;
      const dy = y - st.bounds.y;
      shapes.push({ kind: "shape", polygons: st.polygons.map((p) => p.map((v, k) => v + (k % 2 ? dy : dx))), color: st.fill, stroke: palette.outline, strokeWidth: Math.max(1.2, st.unit * 0.045) });
      texts.push(...st.texts.map((t) => moveOp(t, dx, dy)));
      chains.push(...shiftChains(st.chains, dx, dy));
      colourOf.push(...st.colourOf);
      boxes.push({ ...st.bounds, x: st.bounds.x + dx, y: st.bounds.y + dy });
      y += st.bounds.h + between(st.next, 1.2, 1.6) * st.unit;
    }
    const bounds = boxes.length ? union(boxes) : { x: 0, y: 0, w: 0, h: 0 };
    return { texts, shapes, chains, colourOf, colours, bounds };
  };

  // The size: scaled to fit the measured block into the safe area a few
  // times over, then, to be certain, made smaller until it fits.
  let size = Math.min(380, safe.w * 0.4);
  let made = build(size);
  const fits = () => made.bounds.w <= safe.w && made.bounds.h <= safe.h;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const k = Math.min(safe.w / Math.max(1, made.bounds.w), safe.h / Math.max(1, made.bounds.h));
    if (fits() && k < 1.03) break;
    size *= Math.min(1.6, k * 0.985);
    made = build(size);
  }
  for (let attempt = 0; attempt < 16 && !fits(); attempt += 1) {
    size *= 0.94;
    made = build(size);
  }
  // Centred in the safe area.
  const dx = safe.x + (safe.w - made.bounds.w) / 2 - made.bounds.x;
  const dy = safe.y + (safe.h - made.bounds.h) / 2 - made.bounds.y;
  const chains = shiftChains(made.chains, dx, dy);
  // Pooling by the paste's middling radius: a tapered end's hairline is not the paste.
  const radii = chains.flatMap((c) => c.map((b) => b.r)).sort((p, q) => p - q);
  const typical = radii.length ? radii[Math.floor(radii.length / 2)] : 10;
  // Every drawn funky word on the cover is one layer, keyed by where it now is.
  const layer = chains.length && paste
    ? [pasteOp(chains, chains.length, made.colours, made.colourOf, chains.map(() => 1), paste.finish, null, typical * paste.pool)]
    : [];
  return {
    ops: [...made.shapes.map((op) => moveOp(op, dx, dy)), ...made.texts.map((op) => moveOp(op, dx, dy)), ...layer],
    readable: { ...made.bounds, x: made.bounds.x + dx, y: made.bounds.y + dy },
  };
}

/** A funky typeface's size against the drawn paste's: its letters come out about as tall. */
const FUNKY_SCALE = 1.15;

/** The longest a sticker's side may run straight, in plain x-heights: Main Sticker 1 keeps one of 5 beside its W. */
const ROUGH_RUN = 5;

/** What lies under the letters and stays put when they move: the ground, the photo, a paper's grain. */
export function isBackdrop(op: Op): boolean {
  return op.kind === "fill" || op.kind === "photo" || op.kind === "grain";
}

/**
 * The letters moved, turned and scaled where the owner has placed them,
 * about the middle of the box round them (`scene.readable`): every bead of
 * paste mapped and thickened by the placement's scale, so its field is
 * made again sharp where it now is and lit from the same light; the
 * letters, stickers and the rest drawn through the same map. The ground,
 * the photo and grain stay put. Home leaves the scene as it is.
 */
export function placeScene(scene: Scene, place: Place): Scene {
  if (isHome(place)) return scene;
  const m = placeMatrix(scene.readable, place);
  const thicker = strokeScale(place);
  const ops: Op[] = [];
  let run: Op[] = [];
  const flush = () => {
    if (run.length) ops.push({ kind: "matrix", m, ops: run });
    run = [];
  };
  for (const op of scene.ops) {
    if (isBackdrop(op)) {
      flush();
      ops.push(op);
    } else if (op.kind === "liquid") {
      // Paste is made from its beads: mapped here rather than drawn through the map, so it is never a stretched picture.
      flush();
      const chains = op.chains.map((c) => c.map((b) => ({ ...apply(m, b), r: b.r * thicker })));
      const key = pasteKey(chains, op.colourOf, op.tone, op.finish, op.pool * thicker);
      ops.push({ ...op, chains, pool: op.pool * thicker, key, seed: hashString(key) });
    } else {
      run.push(op);
    }
  }
  flush();
  return { ...scene, ops, readable: mappedBounds(m, scene.readable) };
}

/** Every liquid layer in a scene, in the order they are drawn. */
export function liquidOps(scene: Scene): LiquidOp[] {
  const out: LiquidOp[] = [];
  const walk = (ops: Op[]) => {
    for (const op of ops) {
      if (op.kind === "liquid") out.push(op);
      else if (op.kind === "turn" || op.kind === "matrix") walk(op.ops);
    }
  };
  walk(scene.ops);
  return out;
}

/** The cover for a title, as ops to draw on a canvas the format's size. */
export function buildScene(input: CoverInput, measurer: Measurer): Scene {
  const format = formatById(input.format);
  const palette = paletteFor({ hue: input.hue, shade: input.shade, ground: input.ground });
  const seed = input.seed | 0;
  const { width, height, safe } = format;
  // Stars mean something only to Stickery, where they pick the funky
  // words; every other style sets a starred word as it sets the rest, in
  // the same colour and face (the owner's ask of 7 Oct).
  const typed = parseTitle(input.title);
  const paragraphs = input.style === "stickery" ? typed : typed.map((p) => p.map((w) => w.map((seg) => ({ ...seg, emphasis: false }))));
  const canvas = { x: width * 0.03, y: height * 0.03, w: width * 0.94, h: height * 0.94 };

  const made: { ops: Op[]; readable: Rect; block?: Block } = (() => {
    switch (input.style) {
      case "pasty":
        return pasty(paragraphs, safe, canvas, palette, measurer, false, seed, input.pastyLettering ?? DEFAULT_PASTY_LETTERING, input.photo === true);
      case "pasty-flat":
        return pasty(paragraphs, safe, canvas, palette, measurer, true, seed, input.pastyLettering ?? DEFAULT_PASTY_LETTERING, input.photo === true);
      case "stickery":
        return stickery(paragraphs, safe, palette, measurer, seed, input.lettering ?? DEFAULT_LETTERING, input.plainFace ?? DEFAULT_PLAIN_FACE, input.textColour ?? null);
      case "echo":
        return echo(paragraphs, safe, palette, measurer, height);
      case "mono":
        return mono(paragraphs, safe, palette, measurer);
      default:
        return editorial(paragraphs, safe, palette, measurer);
    }
  })();

  // With no photo the cover is a clear picture of its letters alone (the
  // owner's ask, 7 Oct), to lay over whatever they choose: no ground, and
  // no paper grain, which is a ground's. The light or dark chosen is still
  // what the letters are coloured, outlined and lit for.
  return {
    width,
    height,
    ops: input.photo ? [{ kind: "fill", color: palette.bg }, { kind: "photo" } as Op, ...made.ops] : made.ops.filter((op) => op.kind !== "grain"),
    readable: made.readable,
    truncated: made.block?.truncated ?? false,
  };
}
