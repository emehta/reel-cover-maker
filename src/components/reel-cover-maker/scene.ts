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
import { collageLayout } from "@/components/reel-cover-maker/collage";
import { boundsOf, pasteGlyph, type Chain, type PasteRecipe } from "@/components/reel-cover-maker/liquid";
import { liquidLayout, shrink, type LiquidLayout, type LiquidSpec } from "@/components/reel-cover-maker/liquid-layout";
import type { Finish } from "@/components/reel-cover-maker/liquid-render";
import { mixSeed, random, between, hashString } from "@/components/reel-cover-maker/noise";
import { paletteFor, readableOn, type Ground, type Palette } from "@/components/reel-cover-maker/palettes";
import { polygonBounds, steppedOutline, type Polygon } from "@/components/reel-cover-maker/stepped";
import { graphemes, parseTitle, type Paragraph } from "@/components/reel-cover-maker/title";

export type StyleId = "pasty" | "pasty-flat" | "spread" | "stickery" | "editorial" | "echo" | "mono";

export interface Style {
  id: StyleId;
  name: string;
}

/** In the order the style picker shows them. */
export const STYLES: readonly Style[] = [
  { id: "pasty", name: "Pasty" },
  { id: "pasty-flat", name: "Pasty Flat" },
  { id: "spread", name: "Spread" },
  { id: "stickery", name: "Stickery" },
  { id: "editorial", name: "Editorial" },
  { id: "echo", name: "Echo" },
  { id: "mono", name: "Mono" },
];

export const DEFAULT_STYLE: StyleId = "pasty";

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
   * before it (Stickery's stickers).
   */
  ground: string | null;
  /** How far apart two strokes may be and still pool together, in pixels of the picture. */
  pool: number;
  /** Strokes' free ends cut square, as a knife leaves paste. */
  square: boolean;
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
  | { kind: "turn"; cx: number; cy: number; angle: number; ops: Op[] };

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

/** A big serif, the emphasis in its italic and the accent, on paper grain. */
function editorial(paragraphs: Paragraph[], safe: Rect, palette: Palette, measurer: Measurer) {
  const block = flow(
    paragraphs,
    { box: safe, face: "serif", emphasisFace: "serif-italic", maxSize: 230, minSize: 40, leading: 0.98, align: "center" },
    measurer,
  );
  return {
    block,
    ops: [{ kind: "grain", alpha: 0.075 } as Op, ...textOps(block, (e) => (e ? palette.accent : palette.ink))],
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
  const main = textOps(block, (e) => (e ? palette.accent : palette.ink));
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
      emphasisFace: "mono-bold",
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
  const marked = readableOn(palette.accent);
  for (const line of block.lines) {
    for (const s of line.segments) {
      if (!s.emphasis) continue;
      // Tall enough for the word's own ink, an accented capital included.
      const ink = measurer.bounds(s.face, s.text);
      const above = Math.max(cap + 0.24, ink.ascent + 0.06);
      const below = Math.max(0.24, ink.descent + 0.06);
      ops.push({
        kind: "box",
        x: s.x - pad * line.size * 0.6,
        y: line.baseline - above * line.size,
        w: s.width + 2 * pad * line.size * 0.6,
        h: (above + below) * line.size,
        radius: 0,
        color: palette.accent,
      });
    }
  }
  ops.push(...textOps(block, (e) => (e ? marked : palette.ink)));
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
  /**
   * Whether kerning may also draw letters and lines together, tucking one
   * under another's arm; otherwise it only ever pushes apart, for a layout
   * that spaces its letters exactly itself.
   */
  tuck?: boolean;
  /** Ends cut square, as a knife leaves paste. */
  square?: boolean;
  /** A layout of its own in place of the poster's lines. */
  layout?: (paragraphs: Paragraph[], box: Rect, style: LiquidStyle, recipe: PasteRecipe) => LiquidLayout;
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

/** Pasty's lettering in Spread's paste: thick, matte, spread with a knife. */
const PASTY_MATTE: LiquidStyle = {
  ...PASTY,
  // Thicker: a knife lays paste down heavier than a nozzle squeezes it.
  recipe: (letters) => ({ ...PASTY.recipe(letters), weight: PASTY.recipe(letters).weight * 1.4, droplets: 0.15 }),
  finish: "matte",
  pool: 0.35,
};

/**
 * Thick paste spread with a knife: blocky capitals, their ends cut square,
 * packed into a square as a collage, every line run the full width.
 */
const SPREAD: LiquidStyle = {
  spec: {
    fonts: [{ id: "sans", share: 1 }],
    maxSize: 900,
    minSize: 56,
    gap: 0,
    maxLines: 8,
    stretch: 1,
    tracking: 0,
    inkGap: 0,
    jitter: { scale: 0.08, angle: 0.035, rise: 0.02, squash: 0.08 },
    upper: true,
    salt: "spread",
  },
  recipe: () => ({
    weight: 0.09,
    pressure: 0.25,
    bulb: 0,
    wobble: 0.01,
    smooth: 1,
    bow: 0.012,
    wave: 0.008,
    drip: 0,
    dripLength: [0, 0],
    droplets: 0.08,
  }),
  finish: "matte",
  pool: 0.3,
  kern: 0.03,
  tuck: false,
  square: true,
  layout: (paragraphs, box, style, recipe) =>
    collageLayout(paragraphs, {
      box,
      font: style.spec.fonts[0].id,
      weight: recipe.weight,
      letterGap: 0.045,
      lineGap: 0.05,
      wordGap: 0.22,
      condense: 0.8,
      maxSize: style.spec.maxSize,
      minSize: style.spec.minSize,
      jitter: style.spec.jitter,
      upper: true,
      salt: style.spec.salt,
    }),
};

/**
 * Stickery's funky lettering: a brush script typeface, as the owner's
 * reference stickers set "Want" and "What it is", or drawn paste: gooey,
 * melted letters (their "aren't" and "what"), or a brush pen.
 */
export type LetteringId = "yesteryear" | "pacifico" | "leckerli" | "kaushan" | "goo" | "brush";

export interface Lettering {
  id: LetteringId;
  name: string;
  /** The typeface it is set in; none for drawn paste. */
  face: FunkyFaceId | null;
}

/** In the order a picker would show them. */
export const LETTERINGS: readonly Lettering[] = [
  { id: "yesteryear", name: "Yesteryear", face: "funky-yesteryear" },
  { id: "pacifico", name: "Pacifico", face: "funky-pacifico" },
  { id: "leckerli", name: "Leckerli One", face: "funky-leckerli" },
  { id: "kaushan", name: "Kaushan Script", face: "funky-kaushan" },
  { id: "goo", name: "Goo", face: null },
  { id: "brush", name: "Brush pen", face: null },
];

export const DEFAULT_LETTERING: LetteringId = "yesteryear";

export function isLetteringId(value: unknown): value is LetteringId {
  return LETTERINGS.some((l) => l.id === value);
}

/** The typeface a lettering is set in, or null for one drawn in paste. */
export function letteringFace(id: LetteringId): FunkyFaceId | null {
  return LETTERINGS.find((l) => l.id === id)?.face ?? null;
}

/** A joined script, set from the left of its line. */
const SCRIPT: LiquidStyle["spec"] = {
  fonts: [{ id: "script", share: 1 }],
  maxSize: 400,
  minSize: 40,
  gap: 0,
  maxLines: 4,
  stretch: 1,
  tracking: 0.01,
  inkGap: -0.06,
  jitter: { scale: 0.06, angle: 0.05, rise: 0.03, squash: 0.05 },
  upper: false,
  align: "left",
  salt: "stickery",
};

const still = { bulb: 0, bow: 0, wave: 0, drip: 0, dripLength: [0, 0] as const, droplets: 0 };

/**
 * The two drawn letterings. Their strokes are curves through the font's
 * points, never the straight runs between them, and their thick and thin
 * swells and thins along a stroke (liquid.ts), so they are never choppy.
 */
const PASTE_LETTERINGS: Record<"goo" | "brush", LiquidStyle> = {
  // Melted, gooey letters run into each other: Drip's hand, heavy, swelling
  // and pinching, its free ends balled, neighbours pooling where they meet.
  goo: {
    spec: {
      fonts: [{ id: "drip", share: 1 }],
      maxSize: 400,
      minSize: 40,
      gap: -0.04,
      maxLines: 4,
      stretch: 1,
      tracking: 0,
      inkGap: 0.005,
      jitter: { scale: 0.16, angle: 0.08, rise: 0.05, squash: 0.1 },
      upper: false,
      align: "left",
      salt: "stickery",
    },
    recipe: () => ({ ...still, weight: 0.06, pressure: 0.55, bulb: 0.8, wobble: 0.008, smooth: 1, spline: true, bow: 0.03, wave: 0.018 }),
    finish: "flat",
    pool: 0.45,
    // Letters kerned to all but touch, a third of them meeting so their goo runs together; words a full space apart.
    kern: 0.012,
    merge: 0.3,
  },
  // A brush pen in a joined script, its lowercase drawn taller as a brush script's is.
  brush: {
    spec: SCRIPT,
    recipe: () => ({ ...still, weight: 0.064, pressure: 0.08, wobble: 0.004, smooth: 0, spline: true, xHeight: { at: 0.28, boost: 0.32 }, pen: { kind: "pressure", thin: 0.3 }, taper: 0.4 }),
    finish: "flat",
    pool: 0.12,
    kern: 0,
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
  const empty = { chains: [], glyphOf: [], lineOf: [], colourOf: [], tone: [], droplets: [], missing: [], readable: { x: box.x + box.w / 2, y: box.y + box.h / 2, w: 0, h: 0 } };
  let inner = box;
  let made: Set | null = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    // Letters kept apart by the paste's thickness and a gap, as a first guess the kerning then makes exact.
    const inkGap = style.spec.inkGap + 2 * recipe.weight;
    const layout = style.layout ? style.layout(paragraphs, inner, style, recipe) : liquidLayout(paragraphs, { ...style.spec, inkGap, box: inner });
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
    // Each letter's whole paste, drips and all.
    const pastes = layout.glyphs.map((g) => pasteGlyph(g, recipe, Math.min(box.y + box.h, floorOf(g.line)), canvas));
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
        // none, and the smooth union bridges the two letters' paste.
        const touch = random(mixSeed(g.seed, 0x70c4))() < (style.merge ?? 0);
        const gap = touch ? 0 : style.kern * g.sy * between(random(mixSeed(g.seed, 0x9a9)), 0.75, 1.35);
        let within = false;
        for (let j = Math.max(0, i - 2); j < i; j += 1) {
          const h = layout.glyphs[j];
          if (h.line !== g.line) continue;
          const same = h.word === g.word;
          within ||= same;
          need = Math.max(need, kernBy(shiftChains(pastes[j].chains, shift[j]), shiftChains(pastes[i].chains, lineShift), same ? gap : WORD_GAP * g.sx));
        }
        // Never further left than a third of an em: a letter tucks, it does not pass its neighbour.
        lineShift += !Number.isFinite(need) ? 0 : within && style.tuck !== false ? Math.max(need, -0.33 * g.sy) : Math.max(0, need);
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
          total += Math.max(dropBy(above, here, style.kern * size), style.tuck === false ? 0 : -0.33 * size);
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
export function pasteKey(chains: Chain[], colourOf: number[], tone: number[], finish: Finish, pool: number, square = false): string {
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
  return `${finish}${square ? "#" : ""}|${chains.length}|${a.toString(36)}${b.toString(36)}`;
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
  square: boolean,
  glyphOf: number[] = [],
  lineOf: number[] = [],
): LiquidOp {
  const key = pasteKey(chains, colourOf, tone, finish, pool, square);
  return { kind: "liquid", chains, letters, glyphOf, lineOf, colours, colourOf, tone, finish, ground, pool, square, seed: hashString(key), key };
}

function liquidOp(set: Set, style: LiquidStyle, colours: string[], ground: string | null, withDroplets: boolean): LiquidOp {
  const chains = withDroplets ? [...set.chains, ...set.droplets] : set.chains;
  const typical = set.chains.length ? set.chains.reduce((sum, c) => sum + c[0].r, 0) / set.chains.length : 10;
  return pasteOp(
    chains,
    set.chains.length,
    colours,
    [...set.colourOf, ...(withDroplets ? set.droplets.map(() => 0) : [])],
    [...set.tone, ...(withDroplets ? set.droplets.map(() => 1) : [])],
    style.finish,
    ground,
    typical * style.pool,
    style.square ?? false,
    set.glyphOf,
    set.lineOf,
  );
}

/** A style with the shuffle mixed into its seeds: the same title, drawn another way. */
function shuffled(style: LiquidStyle, seed: number): LiquidStyle {
  return seed ? { ...style, spec: { ...style.spec, salt: `${style.spec.salt}#${seed}` } } : style;
}

/** Paste squeezed into letters: wet, glossy gel, or thick matte paste spread with a knife. */
function pasty(paragraphs: Paragraph[], safe: Rect, canvas: Rect, palette: Palette, measurer: Measurer, matte: boolean, seed: number) {
  const style = shuffled(matte ? PASTY_MATTE : PASTY, seed);
  const set = setLiquid(paragraphs, safe, style, canvas, (e) => (e ? palette.accent : palette.ink), measurer);
  return {
    ops: [liquidOp(set, style, [palette.ink, palette.accent], palette.bg, true), ...set.missing] as Op[],
    readable: set.readable,
  };
}

/** Thick, matte paste spread in blocky capitals, packed into a square. */
function spread(paragraphs: Paragraph[], safe: Rect, canvas: Rect, palette: Palette, measurer: Measurer, seed: number) {
  const side = Math.min(safe.w, safe.h);
  const box = { x: safe.x + (safe.w - side) / 2, y: safe.y + (safe.h - side) / 2, w: side, h: side };
  const style = shuffled(SPREAD, seed);
  const set = setLiquid(paragraphs, box, style, canvas, (e) => (e ? palette.accent : palette.ink), measurer);
  return {
    ops: [liquidOp(set, style, [palette.ink, palette.accent], palette.bg, true), ...set.missing, { kind: "grain", alpha: 0.035 } as Op],
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

function moveParts(parts: readonly Part[], dx: number, dy: number): Part[] {
  return parts.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
}

function boundsOfParts(parts: readonly Part[]): Rect {
  return union(parts.map((p) => (p.kind === "circle" ? { x: p.x - p.r, y: p.y - p.r, w: 2 * p.r, h: 2 * p.r } : p)));
}

/**
 * Each typed line a sticker of straight steps, in turn the chosen colour
 * and its pale tint, its funky words (starred, or the longest when nothing
 * is) with its plain ones fitted round them, as one unit. Everything, the
 * steps and their padding included, scales with one size, the largest at
 * which it all fits.
 *
 * The funky word is placed first and turned to an angle of its own; the
 * plain words before it are dropped onto it one by one, and those after it
 * lifted up under it, each until it comes a small, random distance from the
 * funky word's actual strokes. So "do what you" settles into the dips and
 * round the tall strokes of "want", each word at its own height, and the
 * sticker wraps the two as one, with no hole between. Plain words are never
 * turned; a long run of them wraps to about the funky word's width. Each
 * sticker sits somewhere along the cover's width, its sides stepped
 * wherever they would run straight. All from the title and the shuffle.
 */
function stickery(
  paragraphs: Paragraph[],
  safe: Rect,
  palette: Palette,
  measurer: Measurer,
  seed: number,
  lettering: LetteringId,
  plainFace: PlainFaceId,
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
  const paste = funkyFace ? null : shuffled(PASTE_LETTERINGS[lettering as "goo" | "brush"], seed);
  const salt = hashString(`stickery#${lettering}#${seed}#${paragraphs.map((p) => p.map((w) => w.map((s) => s.text).join("")).join(" ")).join("\n")}`);

  // The plain words a little under half the funky ones' size, their capitals as tall in every face.
  const plainScale = 0.42 * (0.72 / Math.max(0.5, measurer.metrics(plainFace).cap));
  const anywhere = { x: -1e5, y: -1e5, w: 2e5, h: 2e5 };
  const inkBox = (face: FaceId, text: string, x: number, baseline: number, size: number): Rect => {
    const b = measurer.bounds(face, text);
    return { x: x - b.left * size, y: baseline - b.ascent * size, w: (b.left + b.right) * size, h: (b.ascent + b.descent) * size };
  };

  /** A run of funky words, set from (0, 0) and turned: its ops, its paste, the parts to keep clear of, the boxes its steps go round. */
  const funkyRun = (run: (typeof groups)[number][number], size: number, ink: string, next: () => number) => {
    const texts: Op[] = [];
    let chains: Chain[] = [];
    let parts: Part[] = [];
    let boxes: Rect[] = [];
    /** Each turned word's whole box: more than its letters' ink, and what the sticker must be fitted by, to be sure of it. */
    const extent: Rect[] = [];
    const tilt = (next() < 0.5 ? -1 : 1) * between(next, 0.04, 0.17);
    if (paste) {
      const set = setLiquid([run.words], { x: 0, y: 0, w: size * 5.2, h: size * 3.6 }, { ...paste, spec: { ...paste.spec, maxSize: size, minSize: size * 0.45 } }, anywhere, () => ink, measurer);
      const r = set.readable;
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      chains = turnChains(set.chains, cx, cy, tilt);
      parts = chains.flatMap((c) => c.map((b): Part => ({ kind: "circle", x: b.x, y: b.y, r: b.r, funky: true })));
      boxes = chains.map((c) => rectOf(boundsOf([c])));
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
      const letters: Rect[] = [];
      for (const l of set.lines) {
        for (const seg of l.segments) {
          words.push({ kind: "text", text: seg.text, face: seg.face, size: seg.size, x: seg.x, y: l.baseline, color: ink });
          // Each letter's own ink, so the plain words can settle among them.
          let before = "";
          for (const g of graphemes(seg.text)) {
            if (g.trim()) letters.push(inkBox(seg.face, g, seg.x + measurer.width(seg.face, before) * seg.size, l.baseline, seg.size));
            before += g;
          }
        }
      }
      const r = letters.length ? union(letters) : { x: 0, y: 0, w: 0, h: 0 };
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      texts.push({ kind: "turn", cx, cy, angle: tilt, ops: words });
      for (const op of words) if (op.kind === "text") extent.push(turnedBounds(inkBox(op.face, op.text, op.x, op.y, op.size), cx, cy, tilt));
      boxes = letters.map((b) => turnedBounds(b, cx, cy, tilt));
      parts = boxes.map((b): Part => ({ kind: "box", ...b, funky: true }));
    }
    return { texts, chains, parts, boxes, extent };
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

  const build = (size: number) => {
    const cell = Math.max(5, size * STEP);
    const pad = cell * 0.9;
    const plainSize = size * plainScale;
    const colours: string[] = [];
    const stickers = groups.map((runs, gi) => {
      const next = random(mixSeed(salt, gi + 1));
      const fill = palette.sticker[gi % 2];
      const ink = readableOn(fill);
      if (!colours.includes(ink)) colours.push(ink);
      const inkIndex = colours.indexOf(ink);
      const texts: Op[] = [];
      const chains: Chain[] = [];
      const colourOf: number[] = [];
      const boxes: Rect[] = [];
      const extent: Rect[] = [];
      let placed: Part[] = [];
      let funky: Rect | null = null;
      // A plain word keeps a small, random distance from the funky words, and its own leading from plain ones.
      const plainGap = (word: number) => (o: Part) => (o.funky ? between(random(mixSeed(salt, gi * 7919 + word)), 0.1, 0.24) * plainSize : 0.04 * plainSize);

      /** Plain lines put on the sticker, below what is there (rising to it) or above it (dropping onto it). */
      const setPlain = (run: (typeof groups)[number][number], ri: number, dir: 1 | -1) => {
        // A run of plain words keeps to a line about as wide as the funky word, a little wider at most.
        const wrapAt = Math.max((funky?.w ?? 0) * 1.4, plainSize * (funky ? 7 : 14));
        const lines = plainLines(run, plainSize, wrapAt);
        const ordered = dir < 0 ? lines : [...lines].reverse();
        const reach = (funky?.h ?? plainSize * 2) * 0.6;
        const lineNext = random(mixSeed(salt, (gi + 1) * 1009 + ri));
        ordered.forEach((line, li) => {
          const ref = funky ?? (placed.length ? boundsOfParts(placed) : { x: 0, y: 0, w: line.width, h: 0 });
          const x0 = line.width <= ref.w ? ref.x + lineNext() * (ref.w - line.width) : ref.x - lineNext() * (line.width - ref.w);
          const all = placed.length ? boundsOfParts(placed) : { x: 0, y: 0, w: 0, h: 0 };
          // Each word of the line settles toward the funky word on its own first.
          const settled = line.words.map((w, wi) => {
            const id = ri * 101 + li * 13 + wi;
            const start = inkBox(plainFace, w.text, x0 + w.x, 0, plainSize);
            // From just clear of everything, toward it.
            const from = dir < 0 ? all.y + all.h + plainSize * 0.3 - start.y : all.y - plainSize * 0.3 - (start.y + start.h);
            const box = { ...start, y: start.y + from };
            const part: Part = { kind: "box", ...box, funky: false };
            // A word over the funky word settles right down into it; one past its ends only a little,
            // so a line never curls down round its side.
            const over = funky ? box.x < funky.x + funky.w && box.x + box.w > funky.x : true;
            // A line further from the funky word only settles onto the line before it, never past it.
            const most = li === 0 ? (over ? reach : reach * 0.15) + plainSize * 0.3 : plainSize * 0.32;
            const t = placed.length ? Math.min(travel(part, dir < 0 ? -1 : 1, placed, plainGap(id)), most) : 0;
            return { w, start, from, shift: Number.isFinite(t) ? t : most };
          });
          // Then the line as a whole: no word further toward the funky word
          // than half a word's height past the one that stopped soonest, so
          // the words bob but the line still reads in order. Only ever held
          // back, never pushed on, so none comes nearer anything than it could.
          // Compared by baseline: where each word's base would sit, and the one furthest from the funky word.
          const base = settled.map((p) => p.from + (dir < 0 ? -p.shift : p.shift));
          const soonest = dir > 0 ? Math.min(...base) : Math.max(...base);
          for (const [i, p] of settled.entries()) {
            const held = dir > 0 ? Math.min(base[i], soonest + plainSize * 0.42) : Math.max(base[i], soonest - plainSize * 0.42);
            const dy = held + between(lineNext, -0.03, 0.03) * plainSize;
            texts.push({ kind: "text", text: p.w.text, face: plainFace, size: plainSize, x: x0 + p.w.x, y: dy, color: ink });
            const final = { ...p.start, y: p.start.y + dy };
            boxes.push(final);
            placed = [...placed, { kind: "box", ...final, funky: false }];
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
          const gap = between(next, 0.1, 0.24) * plainSize;
          const t = travelAll(parts, -1, placed, (o) => (o.funky ? gap * 1.5 : gap));
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
        // What came before the first funky word drops onto it, the line nearest it first.
        for (const a of above.splice(0).reverse()) setPlain(a.run, a.ri, 1);
      });
      // A sticker with no funky word at all: its plain words in lines.
      for (const a of above.splice(0)) setPlain(a.run, a.ri, -1);

      const polygons = steppedOutline(boxes, { cell, pad, rough: { run: ROUGH_RUN, seed: mixSeed(salt, 0x5e7 + gi) } });
      // Fitted by the paper and every turned funky word's whole box, so nothing it draws can pass the safe area.
      return { fill, texts, chains, colourOf, polygons, bounds: union([polygonBounds(polygons), ...extent]), next };
    });
    // Then stacked, a step or so apart, each somewhere along the widest's width and a little more.
    const widest = Math.max(...stickers.map((st) => st.bounds.w), 0);
    const span = widest * 1.16;
    const texts: Op[] = [];
    const shapes: Op[] = [];
    const chains: Chain[] = [];
    const colourOf: number[] = [];
    const boxes: Rect[] = [];
    let y = 0;
    for (const st of stickers) {
      const dx = st.next() * (span - st.bounds.w) - st.bounds.x;
      const dy = y - st.bounds.y;
      shapes.push({ kind: "shape", polygons: st.polygons.map((p) => p.map((v, i) => v + (i % 2 ? dy : dx))), color: st.fill, stroke: palette.outline, strokeWidth: Math.max(1, cell * 0.13) });
      texts.push(...st.texts.map((t) => moveOp(t, dx, dy)));
      chains.push(...shiftChains(st.chains, dx, dy));
      colourOf.push(...st.colourOf);
      boxes.push({ ...st.bounds, x: st.bounds.x + dx, y: st.bounds.y + dy });
      y += st.bounds.h + cell * between(st.next, 0.35, 1.1);
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
    ? [pasteOp(chains, chains.length, made.colours, made.colourOf, chains.map(() => 1), paste.finish, null, typical * paste.pool, false)]
    : [];
  return {
    ops: [...made.shapes.map((op) => moveOp(op, dx, dy)), ...made.texts.map((op) => moveOp(op, dx, dy)), ...layer],
    readable: { ...made.bounds, x: made.bounds.x + dx, y: made.bounds.y + dy },
  };
}

/** A funky typeface's size against the drawn paste's: its letters come out about as tall. */
const FUNKY_SCALE = 1.15;

/** The longest a sticker's side may run straight, in steps. */
const ROUGH_RUN = 12;

/** Stickery's steps: a grid cell this share of the liquid words' size. */
const STEP = 0.105;

/** Every liquid layer in a scene, in the order they are drawn. */
export function liquidOps(scene: Scene): LiquidOp[] {
  const out: LiquidOp[] = [];
  const walk = (ops: Op[]) => {
    for (const op of ops) {
      if (op.kind === "liquid") out.push(op);
      else if (op.kind === "turn") walk(op.ops);
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
  const paragraphs = parseTitle(input.title);
  const canvas = { x: width * 0.03, y: height * 0.03, w: width * 0.94, h: height * 0.94 };

  const made: { ops: Op[]; readable: Rect; block?: Block } = (() => {
    switch (input.style) {
      case "pasty":
        return pasty(paragraphs, safe, canvas, palette, measurer, false, seed);
      case "pasty-flat":
        return pasty(paragraphs, safe, canvas, palette, measurer, true, seed);
      case "spread":
        return spread(paragraphs, safe, canvas, palette, measurer, seed);
      case "stickery":
        return stickery(paragraphs, safe, palette, measurer, seed, input.lettering ?? DEFAULT_LETTERING, input.plainFace ?? DEFAULT_PLAIN_FACE);
      case "echo":
        return echo(paragraphs, safe, palette, measurer, height);
      case "mono":
        return mono(paragraphs, safe, palette, measurer);
      default:
        return editorial(paragraphs, safe, palette, measurer);
    }
  })();

  return {
    width,
    height,
    ops: [{ kind: "fill", color: palette.bg }, ...made.ops],
    readable: made.readable,
    truncated: made.block?.truncated ?? false,
  };
}
