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

import type { FaceId, Measurer } from "@/components/reel-cover-maker/faces";
import { formatById, type FormatId, type Rect } from "@/components/reel-cover-maker/formats";
import { flow, type Block } from "@/components/reel-cover-maker/layout";
import { boundsOf, pasteGlyph, type Chain, type PasteRecipe } from "@/components/reel-cover-maker/liquid";
import { liquidLayout, shrink, type LiquidSpec } from "@/components/reel-cover-maker/liquid-layout";
import type { Finish } from "@/components/reel-cover-maker/liquid-render";
import { mixSeed, random, between, hashString } from "@/components/reel-cover-maker/noise";
import { paletteById, readableOn, type Palette, type PaletteId } from "@/components/reel-cover-maker/palettes";
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
  /** Each chain's colour, as an index into `colours`, and how much lighter or darker than it (1 is as is). */
  colours: string[];
  colourOf: number[];
  tone: number[];
  finish: Finish;
  /** How far apart two strokes may be and still pool together, in pixels of the picture. */
  pool: number;
  seed: number;
  /** What the layer is of, for a cache of drawn layers. */
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
  palette: PaletteId;
  format: FormatId;
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

/** What a liquid style needs to set its letters. */
interface LiquidStyle {
  spec: Omit<LiquidSpec, "box">;
  recipe: (letters: number) => PasteRecipe;
  finish: Finish;
  /** Pooling, as a share of the paste's radius. */
  pool: number;
}

/** Hand-lettered paste: mostly a brush hand, now and then a rounder one, so no two words are drawn alike. */
const PASTY: LiquidStyle = {
  spec: {
    // Elfin's letters, and for some words Felix's brush capitals: Felix's
    // own lowercase is too tight to read as paste.
    fonts: [
      { id: "elfin", share: 0.55 },
      { id: "felix", share: 0.45, capitals: true },
    ],
    maxSize: 620,
    minSize: 64,
    gap: -0.03,
    maxLines: 7,
    stretch: 1.9,
    tracking: 0.02,
    inkGap: 0.035,
    jitter: { scale: 0.11, angle: 0.08, rise: 0.045, squash: 0.08 },
    upper: false,
    salt: "pasty",
  },
  // A short title is set fat, as balloons and blots are; a long one thinner, as paste from a bottle.
  recipe: (letters) => ({
    weight: letters <= 6 ? 0.078 : letters <= 14 ? 0.066 : 0.057,
    pressure: 0.85,
    bulb: 0.9,
    wobble: 0.03,
    smooth: 2,
    drip: 0.32,
    dripLength: [0.22, 0.62],
    droplets: 0.7,
  }),
  finish: "gloss",
  pool: 0.6,
};

/** Thick paste spread with a knife: blocky capitals packed into a square. */
const SPREAD: LiquidStyle = {
  spec: {
    fonts: [{ id: "sans", share: 1 }],
    maxSize: 380,
    minSize: 60,
    gap: 0.02,
    maxLines: 6,
    stretch: 1.55,
    tracking: 0.035,
    inkGap: 0.05,
    jitter: { scale: 0.05, angle: 0.035, rise: 0.02, squash: 0.06 },
    upper: true,
    salt: "spread",
  },
  recipe: () => ({
    weight: 0.088,
    pressure: 0.35,
    bulb: 0,
    wobble: 0.014,
    smooth: 1,
    drip: 0,
    dripLength: [0, 0],
    droplets: 0.12,
  }),
  finish: "matte",
  pool: 0.3,
};

/** Stickery's liquid words: a joined script, thick and bulbous, flat, with no drips. */
const GOO: LiquidStyle = {
  spec: {
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
  },
  recipe: () => ({
    weight: 0.058,
    pressure: 0.7,
    bulb: 1,
    wobble: 0.018,
    smooth: 2,
    drip: 0,
    dripLength: [0, 0],
    droplets: 0,
  }),
  finish: "flat",
  pool: 0.5,
};

function letterCount(paragraphs: Paragraph[]): number {
  return paragraphs.reduce((sum, p) => sum + p.reduce((s, w) => s + w.reduce((t, seg) => t + [...seg.text].length, 0), 0), 0);
}

interface Set {
  chains: Chain[];
  colourOf: number[];
  tone: number[];
  droplets: Chain[];
  missing: Op[];
  readable: Rect;
}

/**
 * Liquid letters set in `box`, everything they ink inside it. The paste
 * reaches past the centre lines by its radius, its swelling and its lean,
 * so the box is shrunk until what was drawn fits: twice at most, as the
 * first guess is close.
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
  let inner = box;
  let made: Set | null = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    // Letters kept apart by the paste's thickness and a gap, so it never fills the space between them.
    const inkGap = style.spec.inkGap + 2 * recipe.weight;
    const layout = liquidLayout(paragraphs, { ...style.spec, inkGap, box: inner });
    const chains: Chain[] = [];
    const colourOf: number[] = [];
    const tone: number[] = [];
    const droplets: Chain[] = [];
    for (const g of layout.glyphs) {
      const paste = pasteGlyph(g, recipe, Math.min(box.y + box.h, layout.floors[g.line] ?? Infinity), canvas);
      const next = random(mixSeed(g.seed, 0x70e));
      const t = between(next, 0.9, 1.1);
      for (const c of paste.chains) {
        chains.push(c);
        colourOf.push(g.emphasis ? 1 : 0);
        tone.push(t);
      }
      droplets.push(...paste.droplets);
    }
    // What no hand could draw is set as text, and counts as ink like the paste.
    const texts = layout.missing.map((m) => {
      const b = measurer.bounds("sans", m.text);
      return { m, rect: { x: m.x - b.left * m.size, y: m.y - b.ascent * m.size, w: (b.left + b.right) * m.size, h: (b.ascent + b.descent) * m.size } };
    });
    const parts = [...(chains.length ? [rectOf(boundsOf(chains))] : []), ...texts.map((t) => t.rect)];
    if (!parts.length) return { chains, colourOf, tone, droplets, missing: [], readable: { x: box.x + box.w / 2, y: box.y + box.h / 2, w: 0, h: 0 } };
    const ink = union(parts);

    // The ink, not the advances, centred in the box (or set to its left
    // edge, for a style set from the left): a lean or a swelling on one
    // side would otherwise push it out of that side alone.
    const dx = style.spec.align === "left" ? box.x - ink.x : box.x + (box.w - ink.w) / 2 - ink.x;
    const dy = box.y + (box.h - ink.h) / 2 - ink.y;
    const move = (c: Chain) => c.map((b) => ({ x: b.x + dx, y: b.y + dy, r: b.r }));
    made = {
      chains: chains.map(move),
      colourOf,
      tone,
      droplets: droplets.map(move),
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
  const set = made as Set;
  // A smaller box can choose other lines, so the tries may end a pixel
  // over: then the paste itself is scaled down about the box's middle,
  // which always fits.
  const k = Math.min(1, box.w / Math.max(1e-6, set.readable.w), box.h / Math.max(1e-6, set.readable.h));
  if (k < 1) {
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const scale = (c: Chain) => c.map((b) => ({ x: cx + (b.x - cx) * k, y: cy + (b.y - cy) * k, r: b.r * k }));
    const r = set.readable;
    return {
      ...set,
      chains: set.chains.map(scale),
      droplets: set.droplets.map(scale),
      missing: set.missing.map((op) => (op.kind === "text" ? { ...op, x: cx + (op.x - cx) * k, y: cy + (op.y - cy) * k, size: op.size * k } : op)),
      readable: { x: cx + (r.x - cx) * k, y: cy + (r.y - cy) * k, w: r.w * k, h: r.h * k },
    };
  }
  return set;
}

function liquidOp(set: Set, style: LiquidStyle, colours: string[], key: string, withDroplets: boolean): LiquidOp {
  const chains = withDroplets ? [...set.chains, ...set.droplets] : set.chains;
  const typical = set.chains.length ? set.chains.reduce((s, c) => s + c[0].r, 0) / set.chains.length : 10;
  return {
    kind: "liquid",
    chains,
    letters: set.chains.length,
    colours,
    colourOf: [...set.colourOf, ...(withDroplets ? set.droplets.map(() => 0) : [])],
    tone: [...set.tone, ...(withDroplets ? set.droplets.map(() => 1) : [])],
    finish: style.finish,
    pool: typical * style.pool,
    seed: hashString(key),
    key,
  };
}

/** Paste squeezed into letters: wet and glossy, or flat as a print. */
function pasty(paragraphs: Paragraph[], safe: Rect, canvas: Rect, palette: Palette, measurer: Measurer, flat: boolean, key: string) {
  const style = flat ? { ...PASTY, finish: "flat" as const } : PASTY;
  const set = setLiquid(paragraphs, safe, style, canvas, (e) => (e ? palette.accent : palette.ink), measurer);
  return {
    ops: [liquidOp(set, style, [palette.ink, palette.accent], key, true), ...set.missing] as Op[],
    readable: set.readable,
  };
}

/** Thick, matte paste spread in blocky capitals, packed into a square. */
function spread(paragraphs: Paragraph[], safe: Rect, canvas: Rect, palette: Palette, measurer: Measurer, key: string) {
  const side = Math.min(safe.w, safe.h);
  const box = { x: safe.x + (safe.w - side) / 2, y: safe.y + (safe.h - side) / 2, w: side, h: side };
  const set = setLiquid(paragraphs, box, SPREAD, canvas, (e) => (e ? palette.accent : palette.ink), measurer);
  return {
    ops: [{ kind: "grain", alpha: 0.06 } as Op, liquidOp(set, SPREAD, [palette.ink, palette.accent], key, true), ...set.missing],
    readable: set.readable,
  };
}

/** Stickery's sticker: steps of a grid cell this share of the cover's width. */
const STEP = 0.0235;

/**
 * Each typed line a sticker of straight steps, in turn the palette's bright
 * and pale sticker colours, its liquid words (starred, or the longest when
 * nothing is) over its plain ones.
 */
function stickery(paragraphs: Paragraph[], safe: Rect, canvas: Rect, palette: Palette, measurer: Measurer, key: string) {
  const starred = paragraphs.some((p) => p.some((w) => w.some((s) => s.emphasis)));
  // Which words are liquid: the starred ones, else each sticker's longest.
  const groups = paragraphs.map((p) => {
    const longest = p.reduce((best, w, i) => (w.map((s) => s.text).join("").length > p[best].map((s) => s.text).join("").length ? i : best), 0);
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

  const cell = canvas.w * STEP;
  const pad = cell * 0.9;
  const plainScale = 0.36;
  // Every sticker set at one liquid size, the largest at which they all fit.
  const build = (size: number) => {
    const ops: Op[] = [];
    const liquids: LiquidOp[] = [];
    const shapes: Op[] = [];
    const missingAll: Op[] = [];
    const boxes: Rect[][] = [];
    let y = 0;
    let widest = 0;
    groups.forEach((runs, gi) => {
      const fill = palette.sticker[gi % 2];
      const ink = readableOn(fill);
      const groupBoxes: Rect[] = [];
      const indent = gi % 2 === 0 ? 0 : size * 0.35;
      for (const run of runs) {
        if (run.goo) {
          const set = setLiquid([run.words], { x: indent, y, w: 40000, h: size * 1.2 }, { ...GOO, spec: { ...GOO.spec, maxSize: size, minSize: size * 0.5 } }, { x: -1e5, y: -1e5, w: 2e5, h: 2e5 }, () => ink, measurer);
          const ink2 = set.readable;
          liquids.push(liquidOp(set, GOO, [ink], `${key}:${gi}:${y}`, false));
          missingAll.push(...set.missing);
          // One box per glyph's paste, so the steps follow the letters.
          for (const c of set.chains) groupBoxes.push(rectOf(boundsOf([c])));
          for (const t of set.missing) {
            if (t.kind !== "text") continue;
            const b = measurer.bounds(t.face, t.text);
            groupBoxes.push({ x: t.x - b.left * t.size, y: t.y - b.ascent * t.size, w: (b.left + b.right) * t.size, h: (b.ascent + b.descent) * t.size });
          }
          y = ink2.y + ink2.h + size * 0.02;
        } else {
          const plain = flow([run.words], { box: { x: indent, y, w: 40000, h: size * plainScale * 1.5 }, face: "sans", emphasisFace: "sans", maxSize: size * plainScale, minSize: size * plainScale, leading: 1.1, align: "left" }, measurer);
          for (const line of plain.lines) {
            for (const s of line.segments) {
              ops.push({ kind: "text", text: s.text, face: s.face, size: s.size, x: s.x, y: line.baseline, color: ink });
              const b = measurer.bounds(s.face, s.text);
              groupBoxes.push({ x: s.x - b.left * s.size, y: line.baseline - b.ascent * s.size, w: (b.left + b.right) * s.size, h: (b.ascent + b.descent) * s.size });
            }
          }
          y = plain.bounds.y + plain.bounds.h + size * 0.04;
        }
      }
      const polygons = steppedOutline(groupBoxes, { cell, pad });
      shapes.push({ kind: "shape", polygons, color: fill, stroke: "#141414", strokeWidth: canvas.w * 0.003 });
      boxes.push([polygonBounds(polygons)]);
      widest = Math.max(widest, polygonBounds(polygons).x + polygonBounds(polygons).w);
      y = polygonBounds(polygons).y + polygonBounds(polygons).h + cell * 1.4;
    });
    const all = boxes.flat();
    const bounds = all.length ? all.reduce((u, r) => union([u, r])) : { x: 0, y: 0, w: 0, h: 0 };
    return { ops, liquids, shapes, missing: missingAll, bounds };
  };

  // The size: scaled to fit the measured block into the safe area, a few
  // times over, as the grid's cells do not scale with the letters. Then,
  // to be certain, made smaller until the block fits.
  let size = Math.min(380, safe.w * 0.4);
  let made = build(size);
  const fits = () => made.bounds.w <= safe.w && made.bounds.h <= safe.h;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const k = Math.min(safe.w / Math.max(1, made.bounds.w), safe.h / Math.max(1, made.bounds.h));
    if (fits() && k < 1.03) break;
    size *= Math.min(1.6, k * 0.985);
    made = build(size);
  }
  for (let attempt = 0; attempt < 12 && !fits(); attempt += 1) {
    size *= 0.95;
    made = build(size);
  }
  // Centred in the safe area.
  const dx = safe.x + (safe.w - made.bounds.w) / 2 - made.bounds.x;
  const dy = safe.y + (safe.h - made.bounds.h) / 2 - made.bounds.y;
  const move = (op: Op): Op => {
    if (op.kind === "text" || op.kind === "box") return { ...op, x: op.x + dx, y: op.y + dy };
    if (op.kind === "shape") return { ...op, polygons: op.polygons.map((p) => p.map((v, i) => v + (i % 2 ? dy : dx))) };
    if (op.kind === "liquid") return { ...op, chains: op.chains.map((c) => c.map((b) => ({ ...b, x: b.x + dx, y: b.y + dy }))) };
    return op;
  };
  return {
    ops: [...made.shapes, ...made.ops, ...made.liquids, ...made.missing].map(move),
    readable: { ...made.bounds, x: made.bounds.x + dx, y: made.bounds.y + dy },
  };
}

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
  const palette = paletteById(input.palette);
  const { width, height, safe } = format;
  const paragraphs = parseTitle(input.title);
  const canvas = { x: width * 0.03, y: height * 0.03, w: width * 0.94, h: height * 0.94 };
  const key = JSON.stringify([input.title, input.style, input.palette, input.format]);

  const made: { ops: Op[]; readable: Rect; block?: Block } = (() => {
    switch (input.style) {
      case "pasty":
        return pasty(paragraphs, safe, canvas, palette, measurer, false, key);
      case "pasty-flat":
        return pasty(paragraphs, safe, canvas, palette, measurer, true, key);
      case "spread":
        return spread(paragraphs, safe, canvas, palette, measurer, key);
      case "stickery":
        return stickery(paragraphs, safe, { x: 0, y: 0, w: width, h: height }, palette, measurer, key);
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
