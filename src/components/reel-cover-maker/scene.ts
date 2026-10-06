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
  /** Which letter and which line each of the letters' chains belongs to, so a test can hold them apart. */
  glyphOf: number[];
  lineOf: number[];
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
  /** The least gap between two letters' paste, in em of the letter's height; 0 leaves a joined script joined. */
  kern: number;
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
  kern: 0.035,
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
  kern: 0.03,
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
  kern: 0,
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
 * How far right glyph `b`'s beads must move so none comes within `gap` of
 * any of glyph `a`'s: kerning by the paste itself, swelling and lean
 * included, so paste never fills the space between two letters.
 */
export function kernBy(a: Chain[], b: Chain[], gap: number): number {
  let need = 0;
  for (const ca of a) {
    for (const p of ca) {
      for (const cb of b) {
        for (const q of cb) {
          const reach = p.r + q.r + gap;
          const dy = q.y - p.y;
          if (Math.abs(dy) >= reach) continue;
          // b moves right until the two beads are `reach` apart.
          const dx = Math.sqrt(reach * reach - dy * dy) - (q.x - p.x);
          if (dx > need) need = dx;
        }
      }
    }
  }
  return need;
}

/** The same, downward: how far `b` must drop so none of its beads comes within `gap` of `a`'s. */
export function dropBy(a: Chain[], b: Chain[], gap: number): number {
  let need = 0;
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
  return need;
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
    // Each letter's whole paste, drips and all.
    const pastes = layout.glyphs.map((g) => pasteGlyph(g, recipe, Math.min(box.y + box.h, floorOf(g.line)), canvas));
    // Kerning, line by line, by that paste: each letter moves right of the
    // last two on its line until no bead of it comes near theirs.
    const shift = new Array(layout.glyphs.length).fill(0);
    if (style.kern) {
      let lineShift = 0;
      layout.glyphs.forEach((g, i) => {
        if (i === 0 || layout.glyphs[i - 1].line !== g.line) lineShift = 0;
        let need = 0;
        for (let j = Math.max(0, i - 2); j < i; j += 1) {
          if (layout.glyphs[j].line !== g.line) continue;
          need = Math.max(need, kernBy(shiftChains(pastes[j].chains, shift[j]), shiftChains(pastes[i].chains, lineShift), style.kern * g.sy));
        }
        lineShift += need;
        shift[i] = lineShift;
      });
    }

    // Then down: each line drops as far as it must to clear the line above,
    // a descender above meeting an ascender below as much as a drip.
    const drop = new Map<number, number>();
    if (style.kern) {
      let total = 0;
      lines.forEach((line, li) => {
        if (li > 0) {
          const previous = lines[li - 1];
          const above = layout.glyphs.flatMap((g, i) => (g.line === previous ? shiftChains(pastes[i].chains, shift[i], drop.get(g.line) ?? 0) : []));
          const here = layout.glyphs.flatMap((g, i) => (g.line === line ? shiftChains(pastes[i].chains, shift[i], total) : []));
          total += dropBy(above, here, style.kern * (layout.sizes[line] ?? 0));
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
 * What a layer of paste is, from the paste itself: every bead, colour and
 * tone, to a hundredth of a pixel. A drawn layer is kept under this, so it
 * is never drawn where paste that has since moved used to be.
 */
export function pasteKey(chains: Chain[], colours: string[], colourOf: number[], tone: number[], finish: Finish, pool: number): string {
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
  return `${finish}|${colours.join(",")}|${chains.length}|${a.toString(36)}${b.toString(36)}`;
}

/** A layer of paste from its parts, keyed by what it is. */
function pasteOp(
  chains: Chain[],
  letters: number,
  colours: string[],
  colourOf: number[],
  tone: number[],
  finish: Finish,
  pool: number,
  glyphOf: number[] = [],
  lineOf: number[] = [],
): LiquidOp {
  const key = pasteKey(chains, colours, colourOf, tone, finish, pool);
  return { kind: "liquid", chains, letters, glyphOf, lineOf, colours, colourOf, tone, finish, pool, seed: hashString(key), key };
}

function liquidOp(set: Set, style: LiquidStyle, colours: string[], withDroplets: boolean): LiquidOp {
  const chains = withDroplets ? [...set.chains, ...set.droplets] : set.chains;
  const typical = set.chains.length ? set.chains.reduce((sum, c) => sum + c[0].r, 0) / set.chains.length : 10;
  return pasteOp(
    chains,
    set.chains.length,
    colours,
    [...set.colourOf, ...(withDroplets ? set.droplets.map(() => 0) : [])],
    [...set.tone, ...(withDroplets ? set.droplets.map(() => 1) : [])],
    style.finish,
    typical * style.pool,
    set.glyphOf,
    set.lineOf,
  );
}

/** Paste squeezed into letters: wet and glossy, or flat as a print. */
function pasty(paragraphs: Paragraph[], safe: Rect, canvas: Rect, palette: Palette, measurer: Measurer, flat: boolean) {
  const style = flat ? { ...PASTY, finish: "flat" as const } : PASTY;
  const set = setLiquid(paragraphs, safe, style, canvas, (e) => (e ? palette.accent : palette.ink), measurer);
  return {
    ops: [liquidOp(set, style, [palette.ink, palette.accent], true), ...set.missing] as Op[],
    readable: set.readable,
  };
}

/** Thick, matte paste spread in blocky capitals, packed into a square. */
function spread(paragraphs: Paragraph[], safe: Rect, canvas: Rect, palette: Palette, measurer: Measurer) {
  const side = Math.min(safe.w, safe.h);
  const box = { x: safe.x + (safe.w - side) / 2, y: safe.y + (safe.h - side) / 2, w: side, h: side };
  const set = setLiquid(paragraphs, box, SPREAD, canvas, (e) => (e ? palette.accent : palette.ink), measurer);
  return {
    ops: [{ kind: "grain", alpha: 0.06 } as Op, liquidOp(set, SPREAD, [palette.ink, palette.accent], true), ...set.missing],
    readable: set.readable,
  };
}

/**
 * Each typed line a sticker of straight steps, in turn the palette's bright
 * and pale sticker colours, its liquid words (starred, or the longest when
 * nothing is) over its plain ones. Everything, the steps and their padding
 * included, scales with one size, the largest at which it all fits; a long
 * line wraps inside its sticker.
 */
function stickery(paragraphs: Paragraph[], safe: Rect, palette: Palette, measurer: Measurer) {
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

  const plainScale = 0.36;
  const anywhere = { x: -1e5, y: -1e5, w: 2e5, h: 2e5 };
  const boxOf = (face: FaceId, text: string, x: number, baseline: number, size: number): Rect => {
    const b = measurer.bounds(face, text);
    return { x: x - b.left * size, y: baseline - b.ascent * size, w: (b.left + b.right) * size, h: (b.ascent + b.descent) * size };
  };

  const build = (size: number) => {
    const cell = Math.max(5, size * STEP);
    const pad = cell * 0.9;
    const wrapAt = size * 4.4;
    const texts: Op[] = [];
    const shapes: Op[] = [];
    const chains: Chain[] = [];
    const colourOf: number[] = [];
    const colours: string[] = [];
    const boxes: Rect[] = [];
    let y = 0;
    groups.forEach((runs, gi) => {
      const fill = palette.sticker[gi % 2];
      const ink = readableOn(fill);
      if (!colours.includes(ink)) colours.push(ink);
      const groupBoxes: Rect[] = [];
      const indent = gi % 2 === 0 ? 0 : size * 0.35;
      for (const run of runs) {
        if (run.goo) {
          const set = setLiquid(
            [run.words],
            { x: indent, y, w: wrapAt, h: size * 3.6 },
            { ...GOO, spec: { ...GOO.spec, maxSize: size, minSize: size * 0.45 } },
            anywhere,
            () => ink,
            measurer,
          );
          // One box per stroke of paste, so the steps follow the letters.
          for (const c of set.chains) {
            chains.push(c);
            colourOf.push(colours.indexOf(ink));
            groupBoxes.push(rectOf(boundsOf([c])));
          }
          for (const t of set.missing) {
            if (t.kind !== "text") continue;
            texts.push(t);
            groupBoxes.push(boxOf(t.face, t.text, t.x, t.y, t.size));
          }
          y = set.readable.y + set.readable.h + size * 0.04;
        } else {
          const plain = flow(
            [run.words],
            { box: { x: indent, y, w: wrapAt, h: size * plainScale * 12 }, face: "sans", emphasisFace: "sans", maxSize: size * plainScale, minSize: size * plainScale, leading: 1.1, align: "left" },
            measurer,
          );
          // Set from the top of its slot, not the middle.
          const lift = y - plain.bounds.y;
          for (const line of plain.lines) {
            for (const s of line.segments) {
              texts.push({ kind: "text", text: s.text, face: s.face, size: s.size, x: s.x, y: line.baseline + lift, color: ink });
              groupBoxes.push(boxOf(s.face, s.text, s.x, line.baseline + lift, s.size));
            }
          }
          y = plain.bounds.y + lift + plain.bounds.h + size * 0.06;
        }
      }
      const polygons = steppedOutline(groupBoxes, { cell, pad });
      const bounds = polygonBounds(polygons);
      shapes.push({ kind: "shape", polygons, color: fill, stroke: "#141414", strokeWidth: Math.max(1, cell * 0.13) });
      boxes.push(bounds);
      // The next sticker's steps reach its padding and up to a cell beyond
      // its words: start them far enough down that the two never meet.
      y = bounds.y + bounds.h + pad + cell * 2.2;
    });
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
  const move = (op: Op): Op => {
    if (op.kind === "text" || op.kind === "box") return { ...op, x: op.x + dx, y: op.y + dy };
    if (op.kind === "shape") return { ...op, polygons: op.polygons.map((p) => p.map((v, i) => v + (i % 2 ? dy : dx))) };
    return op;
  };
  const chains = shiftChains(made.chains, dx, dy);
  const typical = chains.length ? chains.reduce((sum, c) => sum + c[0].r, 0) / chains.length : 10;
  // Every liquid word on the cover is one layer, keyed by where it now is.
  const paste = chains.length
    ? [pasteOp(chains, chains.length, made.colours, made.colourOf, chains.map(() => 1), GOO.finish, typical * GOO.pool)]
    : [];
  return {
    ops: [...made.shapes.map(move), ...made.texts.map(move), ...paste],
    readable: { ...made.bounds, x: made.bounds.x + dx, y: made.bounds.y + dy },
  };
}

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
  const palette = paletteById(input.palette);
  const { width, height, safe } = format;
  const paragraphs = parseTitle(input.title);
  const canvas = { x: width * 0.03, y: height * 0.03, w: width * 0.94, h: height * 0.94 };

  const made: { ops: Op[]; readable: Rect; block?: Block } = (() => {
    switch (input.style) {
      case "pasty":
        return pasty(paragraphs, safe, canvas, palette, measurer, false);
      case "pasty-flat":
        return pasty(paragraphs, safe, canvas, palette, measurer, true);
      case "spread":
        return spread(paragraphs, safe, canvas, palette, measurer);
      case "stickery":
        return stickery(paragraphs, safe, palette, measurer);
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
