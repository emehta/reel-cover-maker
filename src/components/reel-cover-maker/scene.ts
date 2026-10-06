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

import { DEFAULT_PLAIN_FACE, type FaceId, type Measurer, type PlainFaceId } from "@/components/reel-cover-maker/faces";
import { formatById, type FormatId, type Rect } from "@/components/reel-cover-maker/formats";
import { flow, type Block } from "@/components/reel-cover-maker/layout";
import { collageLayout } from "@/components/reel-cover-maker/collage";
import { boundsOf, pasteGlyph, type Chain, type PasteRecipe } from "@/components/reel-cover-maker/liquid";
import { liquidLayout, shrink, type LiquidLayout, type LiquidSpec } from "@/components/reel-cover-maker/liquid-layout";
import type { Finish } from "@/components/reel-cover-maker/liquid-render";
import { mixSeed, random, between, hashString } from "@/components/reel-cover-maker/noise";
import { paletteFor, readableOn, type Ground, type Palette } from "@/components/reel-cover-maker/palettes";
import { polygonBounds, steppedOutline, type Polygon } from "@/components/reel-cover-maker/stepped";
import { parseTitle, type Paragraph } from "@/components/reel-cover-maker/title";

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

/** Stickery's funky lettering: the hand its liquid words are written in. */
export type LetteringId = "brush" | "nib" | "bubble" | "marker" | "caps";

/** In the order a picker would show them. */
export const LETTERINGS: readonly { id: LetteringId; name: string }[] = [
  { id: "brush", name: "Brush pen" },
  { id: "nib", name: "Broad nib" },
  { id: "bubble", name: "Bubble" },
  { id: "marker", name: "Marker" },
  { id: "caps", name: "Brush caps" },
];

export const DEFAULT_LETTERING: LetteringId = "brush";

export function isLetteringId(value: unknown): value is LetteringId {
  return LETTERINGS.some((l) => l.id === value);
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

/** Drip's hand, its letters apart and their case mixed, set from the left of its line. */
const HAND: LiquidStyle["spec"] = {
  fonts: [{ id: "drip", share: 1 }],
  maxSize: 400,
  minSize: 40,
  gap: -0.04,
  maxLines: 4,
  stretch: 1,
  tracking: 0.01,
  inkGap: 0.02,
  jitter: { scale: 0.12, angle: 0.07, rise: 0.045, squash: 0.08 },
  upper: false,
  swapCase: 0.3,
  align: "left",
  salt: "stickery",
};

const still = { bulb: 0, bow: 0, wave: 0, drip: 0, dripLength: [0, 0] as const, droplets: 0 };

/**
 * Each of Stickery's hands. The thick and thin of each is the pen's, worked
 * out from where the stroke is going and smoothed along it (liquid.ts), so
 * a stroke swells and thins where a pen's would, never in a random blob.
 */
const LETTERING_STYLES: Record<LetteringId, LiquidStyle> = {
  // A brush pen: heavy on every downstroke, a hairline up, ends drawn off to a point.
  brush: {
    spec: SCRIPT,
    recipe: () => ({ ...still, weight: 0.052, pressure: 0.1, wobble: 0.006, smooth: 2, pen: { kind: "pressure", thin: 0.24 }, taper: 0.55 }),
    finish: "flat",
    pool: 0.12,
    kern: 0,
  },
  // A broad nib held at 35 degrees: thick across its edge, thin along it, as calligraphy is.
  nib: {
    spec: SCRIPT,
    recipe: () => ({ ...still, weight: 0.05, pressure: 0.04, wobble: 0.004, smooth: 2, pen: { kind: "nib", thin: 0.16, angle: 0.62 } }),
    finish: "flat",
    pool: 0.1,
    kern: 0,
  },
  // One even, puffy weight, round at every end: a bubble script.
  bubble: {
    spec: SCRIPT,
    recipe: () => ({ ...still, weight: 0.056, pressure: 0.05, wobble: 0.005, smooth: 2 }),
    finish: "flat",
    pool: 0.2,
    kern: 0,
  },
  // A fat marker in Drip's bouncy hand: a little heavier going down, its case mixed.
  marker: {
    spec: HAND,
    recipe: () => ({ ...still, weight: 0.056, pressure: 0.12, wobble: 0.008, smooth: 1, bow: 0.035, wave: 0.018, pen: { kind: "pressure", thin: 0.62 }, taper: 0.2 }),
    finish: "flat",
    pool: 0.3,
    kern: 0.022,
    merge: 0.12,
  },
  // Bouncing capitals in a brush: heavy down, thin across, drawn off to points.
  caps: {
    spec: { ...HAND, upper: true, swapCase: 0, jitter: { scale: 0.14, angle: 0.09, rise: 0.06, squash: 0.1 } },
    recipe: () => ({ ...still, weight: 0.07, pressure: 0.1, wobble: 0.008, smooth: 1, bow: 0.04, wave: 0.02, pen: { kind: "pressure", thin: 0.34 }, taper: 0.45 }),
    finish: "flat",
    pool: 0.25,
    kern: 0.022,
    merge: 0.1,
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

/**
 * Each typed line a sticker of straight steps, in turn the chosen colour
 * and its pale tint, its liquid words (starred, or the longest when nothing
 * is) over its plain ones. Everything, the steps and their padding
 * included, scales with one size, the largest at which it all fits; a long
 * line wraps inside its sticker.
 *
 * Nothing lines up on purpose, but nothing touches: inside a sticker each
 * line sits somewhere along its width, a random distance under the last,
 * the liquid words tilted a few degrees either way and the plain words
 * each a little off their line; each sticker sits somewhere along the
 * cover's width, its sides stepped wherever they would run straight. All
 * drawn from the title and the shuffle, so two titles never stack alike,
 * and Shuffle moves them about.
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
  // Which words are liquid: the starred ones, else each sticker's longest.
  const groups = paragraphs.map((p) => {
    const length = (w: Paragraph[number]) => w.map((s) => s.text).join("").length;
    const longest = p.reduce((best, w, i) => (length(w) > length(p[best]) ? i : best), 0);
    const words = p.map((w, i) => ({ word: w, goo: starred ? w.some((s) => s.emphasis) : i === longest }));
    // Runs of one kind make a line each, as in a sticker that reads "things / aren't".
    const runs: { goo: boolean; words: Paragraph }[] = [];
    for (const w of words) {
      const last = runs[runs.length - 1];
      if (last && last.goo === w.goo) last.words.push(w.word);
      else runs.push({ goo: w.goo, words: [w.word] });
    }
    return runs;
  });
  const hand = LETTERING_STYLES[lettering];
  const goo = shuffled(hand, seed);
  const salt = hashString(`stickery#${seed}#${paragraphs.map((p) => p.map((w) => w.map((s) => s.text).join("")).join(" ")).join("\n")}`);

  // The plain words a little over a third of the liquid ones, their capitals as tall in every face.
  const plainScale = 0.36 * (0.72 / Math.max(0.5, measurer.metrics(plainFace).cap));
  const anywhere = { x: -1e5, y: -1e5, w: 2e5, h: 2e5 };
  const boxOf = (face: FaceId, text: string, x: number, baseline: number, size: number): Rect => {
    const b = measurer.bounds(face, text);
    return { x: x - b.left * size, y: baseline - b.ascent * size, w: (b.left + b.right) * size, h: (b.ascent + b.descent) * size };
  };

  /** One line of a sticker, its top at y: its ops, its paste, and the boxes its steps go round. */
  const line = (run: (typeof groups)[number][number], y: number, size: number, ink: string, colours: string[], next: () => number) => {
    let texts: Op[] = [];
    let chains: Chain[] = [];
    const colourOf: number[] = [];
    let boxes: Rect[] = [];
    if (run.goo) {
      const set = setLiquid(
        [run.words],
        { x: 0, y, w: size * 4.4, h: size * 3.6 },
        { ...goo, spec: { ...goo.spec, maxSize: size, minSize: size * 0.45 } },
        anywhere,
        () => ink,
        measurer,
      );
      // Tilted a few degrees one way or the other, about its own middle.
      const tilt = (next() < 0.5 ? -1 : 1) * between(next, 0.035, 0.12);
      const r = set.readable;
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      // One box per stroke of paste, so the steps follow the letters.
      for (const c of turnChains(set.chains, cx, cy, tilt)) {
        chains.push(c);
        colourOf.push(colours.indexOf(ink));
        boxes.push(rectOf(boundsOf([c])));
      }
      for (const t of set.missing) {
        if (t.kind !== "text") continue;
        texts.push({ kind: "turn", cx, cy, angle: tilt, ops: [t] });
        boxes.push(turnedBounds(boxOf(t.face, t.text, t.x, t.y, t.size), cx, cy, tilt));
      }
    } else {
      const plain = flow(
        [run.words],
        { box: { x: 0, y, w: size * 4.4, h: size * plainScale * 12 }, face: plainFace, emphasisFace: plainFace, maxSize: size * plainScale, minSize: size * plainScale, leading: 1.08, align: "left" },
        measurer,
      );
      for (const l of plain.lines) {
        // Now and then the whole line a little aslant; always each word a little off it.
        const lineTilt = next() < 0.5 ? between(next, -0.035, 0.035) : 0;
        const centre = l.segments.reduce((sum, seg) => sum + seg.x + seg.width / 2, 0) / Math.max(1, l.segments.length);
        for (const seg of l.segments) {
          const mid = seg.x + seg.width / 2;
          const rise = between(next, -0.055, 0.055) * seg.size + (mid - centre) * Math.tan(lineTilt);
          const angle = lineTilt + between(next, -0.025, 0.025);
          const baseline = l.baseline + rise;
          const box = boxOf(seg.face, seg.text, seg.x, baseline, seg.size);
          const cx = box.x + box.w / 2;
          const cy = box.y + box.h / 2;
          texts.push({ kind: "turn", cx, cy, angle, ops: [{ kind: "text", text: seg.text, face: seg.face, size: seg.size, x: seg.x, y: baseline, color: ink }] });
          boxes.push(turnedBounds(box, cx, cy, angle));
        }
      }
    }
    // Its top exactly at y, however it turned, so it never reaches the line above.
    const raw = boxes.length ? union(boxes) : { x: 0, y, w: 0, h: 0 };
    const dy = y - raw.y;
    texts = texts.map((t) => moveOp(t, 0, dy));
    chains = shiftChains(chains, 0, dy);
    boxes = boxes.map((b) => ({ ...b, y: b.y + dy }));
    const bounds = { ...raw, y };
    return { texts, chains, colourOf, boxes, bounds, bottom: bounds.y + bounds.h };
  };

  const build = (size: number) => {
    const cell = Math.max(5, size * STEP);
    const pad = cell * 0.9;
    const colours: string[] = [];
    // Each sticker on its own first, from (0, 0).
    const stickers = groups.map((runs, gi) => {
      const next = random(mixSeed(salt, gi + 1));
      const fill = palette.sticker[gi % 2];
      const ink = readableOn(fill);
      if (!colours.includes(ink)) colours.push(ink);
      let y = 0;
      const lines = runs.map((run, ri) => {
        const made = line(run, y, size, ink, colours, random(mixSeed(salt, (gi + 1) * 1009 + ri)));
        // The next line a random distance under this one, never touching it.
        y = made.bottom + between(next, 0.05, run.goo ? 0.2 : 0.16) * size;
        return made;
      });
      // Each line somewhere along the sticker's width.
      const width = Math.max(...lines.map((l) => l.bounds.w));
      const texts: Op[] = [];
      const chains: Chain[] = [];
      const colourOf: number[] = [];
      const boxes: Rect[] = [];
      for (const l of lines) {
        const dx = next() * (width - l.bounds.w) - l.bounds.x;
        texts.push(...l.texts.map((t) => moveOp(t, dx, 0)));
        chains.push(...shiftChains(l.chains, dx));
        colourOf.push(...l.colourOf);
        boxes.push(...l.boxes.map((b) => ({ ...b, x: b.x + dx })));
      }
      const polygons = steppedOutline(boxes, { cell, pad, rough: { run: ROUGH_RUN, seed: mixSeed(salt, 0x5e7 + gi) } });
      return { fill, texts, chains, colourOf, polygons, bounds: polygonBounds(polygons), next };
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
  // Every liquid word on the cover is one layer, keyed by where it now is.
  const paste = chains.length
    ? [pasteOp(chains, chains.length, made.colours, made.colourOf, chains.map(() => 1), hand.finish, null, typical * hand.pool, false)]
    : [];
  return {
    ops: [...made.shapes.map((op) => moveOp(op, dx, dy)), ...made.texts.map((op) => moveOp(op, dx, dy)), ...paste],
    readable: { ...made.bounds, x: made.bounds.x + dx, y: made.bounds.y + dy },
  };
}

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
