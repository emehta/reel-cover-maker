/**
 * Setting a title inside a box, as large as it will go.
 *
 * `flow` sets every line at one size, wrapped at spaces and balanced, so a
 * title never ends on a lone word. The size is the largest at which the
 * lines fit both across and down the box. (The liquid styles pack their
 * lines differently, in liquid-layout.ts.)
 *
 * Every measurement is in em, from the `Measurer`, and scaled by the size
 * last, so a size can be tried without measuring anything again.
 */

import type { FaceId, Measurer } from "@/components/reel-cover-maker/faces";
import type { Rect } from "@/components/reel-cover-maker/formats";
import { graphemes, type Paragraph, type Word } from "@/components/reel-cover-maker/title";

/** A run of one face and one emphasis, placed. `x` is its left edge. */
export interface PlacedSegment {
  text: string;
  emphasis: boolean;
  face: FaceId;
  x: number;
  /** Its own size: an emphasised segment may be set larger than its line. */
  size: number;
  width: number;
  /** Whether it begins or ends its word, so a mark drawn behind it may reach into the space. */
  startsWord: boolean;
  endsWord: boolean;
}

export interface PlacedLine {
  segments: PlacedSegment[];
  /** The left edge of the first segment. */
  x: number;
  width: number;
  baseline: number;
  /** The line's own size. */
  size: number;
  /** How far the line's ink may reach above and below its baseline, in pixels. */
  ascent: number;
  descent: number;
  /** How far its ink reaches left of `x` and right of `x + width`, in pixels. */
  inkLeft: number;
  inkRight: number;
}

export interface Block {
  lines: PlacedLine[];
  /** The size of the lines. */
  size: number;
  /** Everything the lines may ink, padding included. */
  bounds: Rect;
  /** Whether the title was cut short to fit. */
  truncated: boolean;
}

export interface Faces {
  face: FaceId;
  /** The face an emphasised segment is set in. */
  emphasisFace: FaceId;
  /** An emphasised segment's size against its line's, for a face that runs small. */
  emphasisScale?: number;
}

export interface FlowSpec extends Faces {
  box: Rect;
  maxSize: number;
  /** The smallest size worth setting. Below it, words break and then lines go. */
  minSize: number;
  /** Baseline to baseline, in em. */
  leading: number;
  align: "left" | "center";
  /** Room on each side of every line, in em: a sticker's padding. */
  padX?: number;
  /** Room above the first line and below the last, in em. */
  padY?: number;
  /** Room after the last line, in em: the caret. */
  trailing?: number;
  /** Extra space either side of an emphasised word, in em, for a style that marks it with a box. */
  emphasisGap?: number;
  /** A further test of a placed block, for a style that turns it. */
  fits?: (block: Block) => boolean;
}

/** Text measured a hair narrow is still drawn whole: every width is checked against this much less. */
const WIDTH_SLACK = 0.995;

/** How many halvings a size search takes: under a hundredth of a pixel apart. */
const SEARCH_STEPS = 24;

/** The least share of its size a title gives up to be set on one line fewer. */
export const FEWER_LINES_COST = 0.9;

interface MeasuredSegment {
  text: string;
  emphasis: boolean;
  face: FaceId;
  scale: number;
  /** In em of the line. */
  width: number;
}

interface MeasuredWord {
  segments: MeasuredSegment[];
  /** The advance, in em of the line. */
  width: number;
  /** The space after it, in em of the line. */
  space: number;
  /** How far its ink reaches past its start and past its advance, in em: an italic, an accent, an emoji. */
  inkLeft: number;
  inkRight: number;
}

/**
 * The least an emoji is taken to reach past either end, in em: Chrome
 * measures an emoji's ink as starting where it is drawn, and its bitmap
 * starts a little before.
 */
const EMOJI_INK = 0.015;
const EMOJI_FIRST = /^[\p{Extended_Pictographic}\p{Regional_Indicator}]/u;
const EMOJI_LAST = /[\p{Extended_Pictographic}\p{Regional_Indicator}]\uFE0F?$/u;

/** A word's ink past its two ends, from its first and last segments. */
function inkEnds(segments: MeasuredSegment[], measurer: Measurer): { inkLeft: number; inkRight: number } {
  const first = segments[0];
  const last = segments[segments.length - 1];
  const head = measurer.bounds(first.face, first.text);
  const tail = measurer.bounds(last.face, last.text);
  const left = Math.max(0, head.left, EMOJI_FIRST.test(first.text) ? EMOJI_INK : 0);
  const right = Math.max(0, tail.right - measurer.width(last.face, last.text), EMOJI_LAST.test(last.text) ? EMOJI_INK : 0);
  return { inkLeft: left * first.scale, inkRight: right * last.scale };
}

function measureWord(word: Word, faces: Faces, measurer: Measurer): MeasuredWord {
  const segments = word.map((segment) => {
    const face = segment.emphasis ? faces.emphasisFace : faces.face;
    const scale = segment.emphasis ? (faces.emphasisScale ?? 1) : 1;
    return { text: segment.text, emphasis: segment.emphasis, face, scale, width: measurer.width(face, segment.text) * scale };
  });
  const last = segments[segments.length - 1];
  return {
    segments,
    width: segments.reduce((sum, s) => sum + s.width, 0),
    space: measurer.width(last.face, " ") * last.scale,
    ...inkEnds(segments, measurer),
  };
}

/** The advance of words set on one line, in em. */
function lineWidth(words: MeasuredWord[]): number {
  let width = 0;
  words.forEach((word, i) => {
    width += word.width + (i < words.length - 1 ? word.space : 0);
  });
  return width;
}

/** The width words take on one line, in em, their ink past the line's two ends included. */
function lineExtent(words: MeasuredWord[]): number {
  return words.length ? words[0].inkLeft + lineWidth(words) + words[words.length - 1].inkRight : 0;
}

/** Greedy wrapping at `max` em, or null if a word on its own is wider. */
function wrap(words: MeasuredWord[], max: number): MeasuredWord[][] | null {
  const lines: MeasuredWord[][] = [];
  let line: MeasuredWord[] = [];
  let width = 0;
  for (const word of words) {
    if (word.inkLeft + word.width + word.inkRight > max) return null;
    if (line.length === 0) {
      line = [word];
      width = word.width;
    } else if (line[0].inkLeft + width + line[line.length - 1].space + word.width + word.inkRight <= max) {
      width += line[line.length - 1].space + word.width;
      line.push(word);
    } else {
      lines.push(line);
      line = [word];
      width = word.width;
    }
  }
  if (line.length) lines.push(line);
  return lines;
}

/**
 * The same number of lines as greedy wrapping at `max`, as even as they will
 * go: the narrowest width that still wraps into that many.
 */
function balance(words: MeasuredWord[], max: number): MeasuredWord[][] | null {
  const greedy = wrap(words, max);
  if (!greedy || greedy.length < 2) return greedy;
  let lo = Math.max(...words.map((w) => w.inkLeft + w.width + w.inkRight));
  let hi = max;
  for (let i = 0; i < SEARCH_STEPS; i += 1) {
    const mid = (lo + hi) / 2;
    const lines = wrap(words, mid);
    if (lines && lines.length <= greedy.length) hi = mid;
    else lo = mid;
  }
  return wrap(words, hi) ?? greedy;
}

/** A word too wide for any line, cut between graphemes into pieces of at most `max` em. */
function breakWord(word: MeasuredWord, max: number, measurer: Measurer): MeasuredWord[] {
  const pieces: MeasuredWord[] = [];
  let segments: MeasuredSegment[] = [];
  let width = 0;
  const close = () => {
    if (!segments.length) return;
    const last = segments[segments.length - 1];
    pieces.push({ segments, width, space: measurer.width(last.face, " ") * last.scale, ...inkEnds(segments, measurer) });
    segments = [];
    width = 0;
  };
  for (const segment of word.segments) {
    for (const g of graphemes(segment.text)) {
      const w = measurer.width(segment.face, g) * segment.scale;
      if (width + w > max && width > 0) close();
      const last = segments[segments.length - 1];
      if (last && last.face === segment.face && last.emphasis === segment.emphasis) {
        last.text += g;
        last.width += w;
      } else {
        segments.push({ ...segment, text: g, width: w });
      }
      width += w;
    }
  }
  close();
  return pieces;
}

function faceExtent(spec: Faces, measurer: Measurer, used: { emphasis: boolean }) {
  const base = measurer.metrics(spec.face);
  if (!used.emphasis) return base;
  const emph = measurer.metrics(spec.emphasisFace);
  const scale = spec.emphasisScale ?? 1;
  return {
    cap: base.cap,
    ascent: Math.max(base.ascent, emph.ascent * scale),
    descent: Math.max(base.descent, emph.descent * scale),
  };
}

function place(
  lines: MeasuredWord[][],
  size: number,
  spec: FlowSpec,
  extent: { cap: number; ascent: number; descent: number },
  truncated: boolean,
): Block {
  const padX = spec.padX ?? 0;
  const padY = spec.padY ?? 0;
  const { box } = spec;
  const n = lines.length;

  // Centred by what the eye reads as the block, cap height to last baseline,
  // then held inside the box by what it may actually ink.
  const visual = (extent.cap + (n - 1) * spec.leading) * size;
  let first = box.y + (box.h - visual) / 2 + extent.cap * size;
  first = Math.max(first, box.y + (extent.ascent + padY) * size);
  first = Math.min(first, box.y + box.h - (extent.descent + padY + (n - 1) * spec.leading) * size);

  const placed = lines.map((words, i): PlacedLine => {
    const width = lineWidth(words) * size;
    const inkLeft = words[0].inkLeft * size;
    const inkRight = words[words.length - 1].inkRight * size;
    // Placed by its ink, so a leaning italic or a wide accent stays in the box.
    const x =
      spec.align === "center" ? box.x + (box.w - (inkLeft + width + inkRight)) / 2 + inkLeft : box.x + padX * size + inkLeft;
    const segments: PlacedSegment[] = [];
    let cursor = x;
    words.forEach((word, j) => {
      word.segments.forEach((s, k) => {
        segments.push({
          text: s.text,
          emphasis: s.emphasis,
          face: s.face,
          x: cursor,
          size: size * s.scale,
          width: s.width * size,
          startsWord: k === 0,
          endsWord: k === word.segments.length - 1,
        });
        cursor += s.width * size;
      });
      if (j < words.length - 1) cursor += word.space * size;
    });
    return {
      segments,
      x,
      width,
      baseline: first + i * spec.leading * size,
      size,
      ascent: extent.ascent * size,
      descent: extent.descent * size,
      inkLeft,
      inkRight,
    };
  });

  const last = placed[placed.length - 1];
  const left = Math.min(...placed.map((l) => l.x - l.inkLeft)) - padX * size;
  const right = Math.max(...placed.map((l) => l.x + l.width + l.inkRight)) + padX * size;
  const top = placed[0].baseline - (extent.ascent + padY) * size;
  const bottom = last.baseline + (extent.descent + padY) * size;
  return { lines: placed, size, bounds: { x: left, y: top, w: right - left, h: bottom - top }, truncated };
}

/** Nothing to set: no lines, and bounds of nothing at the box's centre. */
function empty(box: Rect): Block {
  return { lines: [], size: 0, bounds: { x: box.x + box.w / 2, y: box.y + box.h / 2, w: 0, h: 0 }, truncated: false };
}

interface Prepared {
  words: MeasuredWord[][];
  extent: { cap: number; ascent: number; descent: number };
  linesAt: (size: number, balanced: boolean) => MeasuredWord[][] | null;
  fits: (size: number) => boolean;
}

function prepare(paragraphs: Paragraph[], spec: FlowSpec, measurer: Measurer): Prepared {
  const words = paragraphs.map((p) => p.map((w) => measureWord(w, spec, measurer)));
  const gap = spec.emphasisGap ?? 0;
  if (gap) {
    for (const p of words) {
      for (let i = 0; i < p.length - 1; i += 1) {
        const ends = p[i].segments[p[i].segments.length - 1].emphasis;
        const starts = p[i + 1].segments[0].emphasis;
        p[i].space += (ends ? gap : 0) + (starts ? gap : 0);
      }
    }
  }
  // The caret travels with the last word, so wrapping and balancing leave it room.
  const trailing = spec.trailing ?? 0;
  const lastParagraph = words[words.length - 1];
  if (trailing && lastParagraph.length) {
    const end = lastParagraph[lastParagraph.length - 1];
    end.width += trailing;
    end.inkRight = Math.max(0, end.inkRight - trailing);
  }
  const extent = faceExtent(spec, measurer, {
    emphasis: paragraphs.some((p) => p.some((w) => w.some((s) => s.emphasis))),
  });
  const padX = spec.padX ?? 0;
  const padY = spec.padY ?? 0;
  const across = (size: number) => (spec.box.w * WIDTH_SLACK) / size - 2 * padX;
  const tall = (n: number) => extent.ascent + extent.descent + (n - 1) * spec.leading + 2 * padY;

  const linesAt = (size: number, balanced: boolean): MeasuredWord[][] | null => {
    const max = across(size);
    const out: MeasuredWord[][] = [];
    for (const p of words) {
      const lines = balanced ? balance(p, max) : wrap(p, max);
      if (!lines) return null;
      out.push(...lines);
    }
    return out;
  };

  const fits = (size: number): boolean => {
    const lines = linesAt(size, false);
    if (!lines || tall(lines.length) * size > spec.box.h) return false;
    return spec.fits ? spec.fits(place(lines, size, spec, extent, false)) : true;
  };

  return { words, extent, linesAt, fits };
}

/** Whether a title fits its box at `size` as `flow` sets it: for a test that no larger size was missed. */
export function flowFitsAt(paragraphs: Paragraph[], spec: FlowSpec, measurer: Measurer, size: number): boolean {
  if (!paragraphs.some((p) => p.length)) return true;
  return prepare(paragraphs, spec, measurer).fits(size);
}

/** Lines set at one size, wrapped and balanced at spaces, as large as the box allows. */
export function flow(paragraphs: Paragraph[], spec: FlowSpec, measurer: Measurer): Block {
  if (!paragraphs.some((p) => p.length)) return empty(spec.box);
  const { words, extent, linesAt, fits } = prepare(paragraphs, spec, measurer);

  if (fits(spec.minSize)) {
    let lo = spec.minSize;
    let hi = spec.maxSize;
    if (fits(hi)) lo = hi;
    else {
      for (let i = 0; i < SEARCH_STEPS; i += 1) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) lo = mid;
        else hi = mid;
      }
    }
    // Fewer lines read better than a short last line, if together they cost
    // the title less than a tenth of the largest size it fits at.
    const floor = lo * FEWER_LINES_COST;
    for (;;) {
      const n = linesAt(lo, false)?.length ?? 0;
      if (n < 2) break;
      const fewer = (size: number) => (linesAt(size, false)?.length ?? Infinity) < n;
      if (!fewer(floor)) break;
      let a = floor;
      let b = lo;
      for (let i = 0; i < SEARCH_STEPS; i += 1) {
        const mid = (a + b) / 2;
        if (fewer(mid)) a = mid;
        else b = mid;
      }
      if (!fits(a)) break;
      lo = a;
    }
    const lines = linesAt(lo, true) ?? linesAt(lo, false);
    if (lines) {
      const balanced = place(lines, lo, spec, extent, false);
      // Balancing never adds a line, but a turned block is tested again.
      if (!spec.fits || spec.fits(balanced)) return balanced;
      return place(linesAt(lo, false) ?? lines, lo, spec, extent, false);
    }
  }

  return overflow(words, spec, measurer, extent);
}

/**
 * At the smallest size and still too much: words too wide for a line are cut
 * between graphemes, and lines that still do not fit are dropped, the last
 * one kept ending in an ellipsis. The field's length limit makes this rare.
 */
function overflow(
  words: MeasuredWord[][],
  spec: FlowSpec,
  measurer: Measurer,
  extent: { cap: number; ascent: number; descent: number },
): Block {
  const size = spec.minSize;
  const padX = spec.padX ?? 0;
  const padY = spec.padY ?? 0;
  const trailing = spec.trailing ?? 0;
  const max = (spec.box.w * WIDTH_SLACK) / size - 2 * padX;
  const fit = (w: MeasuredWord) => w.inkLeft + w.width + w.inkRight <= max;
  // A little under the line, so a piece's own overhang still fits it.
  const pieceMax = max * 0.92;

  const lines: MeasuredWord[][] = [];
  words.forEach((p, pi) => {
    const pieces = p.flatMap((w, wi) => {
      const isEnd = trailing > 0 && pi === words.length - 1 && wi === p.length - 1;
      if (fit(w)) return [w];
      // The caret's room was added to the title's last word; broken, it goes on the last piece.
      const broken = breakWord(w, isEnd ? pieceMax - trailing : pieceMax, measurer);
      if (isEnd) {
        const end = broken[broken.length - 1];
        end.width += trailing;
        end.inkRight = Math.max(0, end.inkRight - trailing);
      }
      return broken;
    });
    lines.push(...(wrap(pieces, max) ?? pieces.map((w) => [w])));
  });

  const room = Math.max(1, Math.floor((spec.box.h / size - extent.ascent - extent.descent - 2 * padY) / spec.leading) + 1);
  const truncated = lines.length > room;
  if (truncated) {
    lines.length = room;
    const line = lines[room - 1];
    const remeasure = (w: MeasuredWord) => {
      for (const s of w.segments) s.width = measurer.width(s.face, s.text) * s.scale;
      w.width = w.segments.reduce((sum, s) => sum + s.width, 0);
      Object.assign(w, inkEnds(w.segments, measurer));
    };
    const tail = () => {
      const w = line[line.length - 1];
      return w.segments[w.segments.length - 1];
    };
    const ellipsis = () => measurer.width(tail().face, "\u2026") * tail().scale;
    // Graphemes come off the end until the ellipsis, and the caret after it, fit.
    while (lineExtent(line) + ellipsis() + trailing > max) {
      const w = line[line.length - 1];
      const seg = w.segments[w.segments.length - 1];
      const gs = graphemes(seg.text);
      if (gs.length > 1) seg.text = gs.slice(0, -1).join("");
      else if (w.segments.length > 1) w.segments.pop();
      else if (line.length > 1) line.pop();
      else break;
      remeasure(line[line.length - 1]);
    }
    const end = line[line.length - 1];
    tail().text += "\u2026";
    remeasure(end);
    end.width += trailing;
  }
  return place(lines, size, spec, extent, truncated);
}
