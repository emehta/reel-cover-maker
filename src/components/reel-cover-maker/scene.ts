/**
 * A cover as a list of things to draw.
 *
 * Each style turns a title into the same small vocabulary (a fill, soft
 * lights, grain, boxes, lines of text, a turned group of them), and
 * `paint.ts` draws that list on any canvas at any scale. So the preview, the
 * style thumbnails and the downloaded file are drawn from one list and
 * cannot disagree, and a test can check where every word lands without a
 * browser.
 */

import type { FaceId, Measurer } from "@/components/reel-cover-maker/faces";
import { formatById, type FormatId, type Rect } from "@/components/reel-cover-maker/formats";
import { flow, stack, type Block, type PlacedLine } from "@/components/reel-cover-maker/layout";
import { paletteById, readableOn, type Palette, type PaletteId } from "@/components/reel-cover-maker/palettes";
import { parseTitle, type Paragraph } from "@/components/reel-cover-maker/title";

export type StyleId = "editorial" | "poster" | "glow" | "echo" | "mono" | "sticker";

export interface Style {
  id: StyleId;
  name: string;
}

/** In the order the style picker shows them. */
export const STYLES: readonly Style[] = [
  { id: "editorial", name: "Editorial" },
  { id: "poster", name: "Poster" },
  { id: "glow", name: "Glow" },
  { id: "echo", name: "Echo" },
  { id: "mono", name: "Mono" },
  { id: "sticker", name: "Sticker" },
];

export const DEFAULT_STYLE: StyleId = "editorial";

export function isStyleId(value: unknown): value is StyleId {
  return STYLES.some((s) => s.id === value);
}

export type Op =
  | { kind: "fill"; color: string }
  | { kind: "light"; x: number; y: number; r: number; color: string; alpha: number }
  | { kind: "grain"; alpha: number }
  | { kind: "box"; x: number; y: number; w: number; h: number; radius: number; color: string }
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
    if (op.kind === "text" || op.kind === "box" || op.kind === "light") return { ...op, x: op.x + dx };
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

function contains(outer: Rect, inner: Rect): boolean {
  const e = 1e-6;
  return (
    inner.x >= outer.x - e &&
    inner.y >= outer.y - e &&
    inner.x + inner.w <= outer.x + outer.w + e &&
    inner.y + inner.h <= outer.y + outer.h + e
  );
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

/** Condensed capitals, each line as wide as the cover. */
function poster(paragraphs: Paragraph[], safe: Rect, palette: Palette, measurer: Measurer) {
  const block = stack(
    upper(paragraphs),
    { box: safe, face: "condensed", emphasisFace: "condensed", maxSize: 520, minSize: 56, gap: 0.085, align: "left", maxLines: 6 },
    measurer,
  );
  return { block, ops: textOps(block, (e) => (e ? palette.accent : palette.ink)), readable: block.bounds };
}

/** Soft light behind a tight sans, the emphasis in the serif's italic. */
function glow(paragraphs: Paragraph[], safe: Rect, palette: Palette, measurer: Measurer, width: number, height: number) {
  const block = flow(
    paragraphs,
    {
      box: safe,
      face: "sans",
      emphasisFace: "serif-italic",
      emphasisScale: 1.16,
      maxSize: 184,
      minSize: 36,
      leading: 1.06,
      align: "center",
    },
    measurer,
  );
  const [a, b, c] = palette.glow;
  const lights: Op[] = [
    { kind: "light", x: width * 0.12, y: height * 0.2, r: width * 0.9, color: a, alpha: 0.9 },
    { kind: "light", x: width * 0.95, y: height * 0.6, r: width * 0.85, color: b, alpha: 0.75 },
    { kind: "light", x: width * 0.3, y: height * 1.0, r: width * 0.8, color: c, alpha: 0.8 },
  ];
  return {
    block,
    ops: [...lights, { kind: "grain", alpha: 0.1 } as Op, ...textOps(block, () => palette.ink)],
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
  const marked = readableOn(palette.accent, palette);
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

/**
 * The label under one line, in pixels: a set height around the capitals,
 * taller where the line's own ink reaches further (an accent, a descender).
 */
function stickerBox(line: PlacedLine, cap: number, measurer: Measurer) {
  const size = line.size;
  let ascent = 0;
  let descent = 0;
  for (const s of line.segments) {
    const ink = measurer.bounds(s.face, s.text);
    ascent = Math.max(ascent, ink.ascent);
    descent = Math.max(descent, ink.descent);
  }
  const above = Math.max(cap + STICKER.above, ascent + STICKER.clear);
  const below = Math.max(STICKER.below, descent + STICKER.clear);
  return {
    x: line.x - STICKER.padX * size,
    y: line.baseline - above * size,
    w: line.width + 2 * STICKER.padX * size,
    h: (above + below) * size,
  };
}

/** In em: room beside the text, above the capitals, below the baseline, and the least past any ink. */
const STICKER = {
  padX: 0.3,
  above: 0.2,
  below: 0.25,
  clear: 0.08,
  /** Added to the space either side of an emphasised word, and how far its mark reaches into that space. */
  markGap: 0.16,
  markReach: 0.12,
  angle: (-2.5 * Math.PI) / 180,
} as const;

/** Each line on a label of the accent, the lot turned a little, as text is set in a story. */
function sticker(paragraphs: Paragraph[], safe: Rect, palette: Palette, measurer: Measurer) {
  const cap = measurer.metrics("sans-heavy").cap;
  const centre = (block: Block) => ({ cx: block.bounds.x + block.bounds.w / 2, cy: block.bounds.y + block.bounds.h / 2 });
  const outline = (block: Block) => {
    const { cx, cy } = centre(block);
    return union(block.lines.map((line) => turnedBounds(stickerBox(line, cap, measurer), cx, cy, STICKER.angle)));
  };
  const block = flow(
    paragraphs,
    {
      box: safe,
      face: "sans-heavy",
      emphasisFace: "sans-heavy",
      maxSize: 132,
      minSize: 34,
      leading: cap + STICKER.above + STICKER.below - 0.04,
      align: "center",
      padX: STICKER.padX,
      padY: 0.06,
      emphasisGap: STICKER.markGap,
      fits: (b) => contains(safe, outline(b)),
    },
    measurer,
  );
  // An emphasised word is the label turned inside out: the text's colour as
  // its ground, the accent as its text.
  const textColour = readableOn(palette.accent, palette);
  const markColour = textColour;
  const markText = palette.accent;
  const ops: Op[] = [];
  for (const line of block.lines) {
    ops.push({ kind: "box", ...stickerBox(line, cap, measurer), radius: 0.14 * line.size, color: palette.accent });
  }
  for (const line of block.lines) {
    const box = stickerBox(line, cap, measurer);
    for (const s of line.segments) {
      if (!s.emphasis) continue;
      // Into the widened space either side of the word, never into a letter
      // of the same word or past the label's own edge.
      const reach = STICKER.markReach * line.size;
      const left = Math.max(box.x + 0.08 * line.size, s.x - (s.startsWord ? reach : 0));
      const right = Math.min(box.x + box.w - 0.08 * line.size, s.x + s.width + (s.endsWord ? reach : 0));
      ops.push({
        kind: "box",
        x: left,
        y: box.y + 0.08 * line.size,
        w: right - left,
        h: box.h - 0.16 * line.size,
        radius: 0.1 * line.size,
        color: markColour,
      });
    }
  }
  ops.push(...textOps(block, (e) => (e ? markText : textColour)));
  if (!block.lines.length) return { block, ops: [], readable: block.bounds };
  const { cx, cy } = centre(block);
  return { block, ops: [{ kind: "turn", cx, cy, angle: STICKER.angle, ops } as Op], readable: outline(block) };
}

/** The cover for a title, as ops to draw on a canvas the format's size. */
export function buildScene(input: CoverInput, measurer: Measurer): Scene {
  const format = formatById(input.format);
  const palette = paletteById(input.palette);
  const { width, height, safe } = format;
  const paragraphs = parseTitle(input.title);

  const made = (() => {
    switch (input.style) {
      case "poster":
        return poster(paragraphs, safe, palette, measurer);
      case "glow":
        return glow(paragraphs, safe, palette, measurer, width, height);
      case "echo":
        return echo(paragraphs, safe, palette, measurer, height);
      case "mono":
        return mono(paragraphs, safe, palette, measurer);
      case "sticker":
        return sticker(paragraphs, safe, palette, measurer);
      default:
        return editorial(paragraphs, safe, palette, measurer);
    }
  })();

  return {
    width,
    height,
    ops: [{ kind: "fill", color: palette.bg }, ...made.ops],
    readable: made.readable,
    truncated: made.block.truncated,
  };
}
