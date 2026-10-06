/**
 * Setting a title inside a box, as large as it will go.
 *
 * Two ways, after the two ways covers are set by hand:
 *
 * - `flow`: every line one size, wrapped at spaces and balanced, so a title
 *   never ends on a lone word. The size is the largest at which the lines
 *   fit both across and down the box.
 * - `stack`: a poster. Each line is sized on its own to run the full width
 *   of the box, and the words are shared between the lines in whichever way
 *   puts the most ink on the cover.
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
}

export interface Block {
  lines: PlacedLine[];
  /** The size of the lines; for a stack, the size of the smallest. */
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

export interface StackSpec extends Faces {
  box: Rect;
  maxSize: number;
  minSize: number;
  /** The space between two lines, in em of the smaller. */
  gap: number;
  align: "left" | "center";
  maxLines: number;
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
  width: number;
  /** The space after it, in em of the line. */
  space: number;
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
  };
}

/** The width of words set on one line, in em. */
function lineWidth(words: MeasuredWord[]): number {
  let width = 0;
  words.forEach((word, i) => {
    width += word.width + (i < words.length - 1 ? word.space : 0);
  });
  return width;
}

/** Greedy wrapping at `max` em, or null if a word on its own is wider. */
function wrap(words: MeasuredWord[], max: number): MeasuredWord[][] | null {
  const lines: MeasuredWord[][] = [];
  let line: MeasuredWord[] = [];
  let width = 0;
  for (const word of words) {
    if (word.width > max) return null;
    if (line.length === 0) {
      line = [word];
      width = word.width;
    } else if (width + line[line.length - 1].space + word.width <= max) {
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
  let lo = Math.max(...words.map((w) => w.width));
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
    pieces.push({ segments, width, space: measurer.width(last.face, " ") * last.scale });
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
    const x = spec.align === "center" ? box.x + (box.w - width) / 2 : box.x + padX * size;
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
    };
  });

  const last = placed[placed.length - 1];
  const left = Math.min(...placed.map((l) => l.x)) - padX * size;
  const right = Math.max(...placed.map((l) => l.x + l.width)) + padX * size;
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
  if (trailing && lastParagraph.length) lastParagraph[lastParagraph.length - 1].width += trailing;
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
  const max = (spec.box.w * WIDTH_SLACK) / size - 2 * padX;
  const lines: MeasuredWord[][] = [];
  for (const p of words) {
    const pieces = p.flatMap((w) => (w.width > max ? breakWord(w, max, measurer) : [w]));
    lines.push(...(wrap(pieces, max) ?? pieces.map((w) => [w])));
  }
  const room = Math.max(1, Math.floor((spec.box.h / size - extent.ascent - extent.descent - 2 * padY) / spec.leading) + 1);
  let truncated = false;
  while (lines.length > room) {
    lines.pop();
    truncated = true;
  }
  if (truncated) {
    const line = lines[lines.length - 1];
    const lastWord = line[line.length - 1];
    const lastSegment = lastWord.segments[lastWord.segments.length - 1];
    const ellipsis = measurer.width(lastSegment.face, "…") * lastSegment.scale;
    // Take graphemes off the end until the ellipsis fits.
    while (lineWidth(line) + ellipsis > max && line.length) {
      const word = line[line.length - 1];
      const seg = word.segments[word.segments.length - 1];
      const gs = graphemes(seg.text);
      if (gs.length <= 1) {
        word.segments.pop();
        if (!word.segments.length) line.pop();
      } else {
        seg.text = gs.slice(0, -1).join("");
      }
      for (const w of line) {
        for (const s of w.segments) s.width = measurer.width(s.face, s.text) * s.scale;
        w.width = w.segments.reduce((sum, s) => sum + s.width, 0);
      }
    }
    const end = line[line.length - 1] ?? lastWord;
    if (!line.length) line.push(end);
    const tail = end.segments[end.segments.length - 1] ?? lastSegment;
    if (!end.segments.length) end.segments.push(tail);
    tail.text += "…";
    tail.width += ellipsis;
    end.width += ellipsis;
  }
  return place(lines, size, spec, extent, truncated);
}

/** The words shared between `n` lines in order, the widest line as narrow as it can be. */
function partition(words: MeasuredWord[], n: number): MeasuredWord[][] {
  const count = words.length;
  const before = [0];
  for (const word of words) before.push(before[before.length - 1] + word.width + word.space);
  const span = (from: number, to: number) => before[to] - before[from] - words[to - 1].space;
  // best[k][i]: the narrowest widest line for the first i words on k lines.
  const best: number[][] = Array.from({ length: n + 1 }, () => Array(count + 1).fill(Infinity));
  const cut: number[][] = Array.from({ length: n + 1 }, () => Array(count + 1).fill(0));
  best[0][0] = 0;
  for (let k = 1; k <= n; k += 1) {
    for (let i = k; i <= count; i += 1) {
      for (let j = k - 1; j < i; j += 1) {
        const widest = Math.max(best[k - 1][j], span(j, i));
        if (widest < best[k][i]) {
          best[k][i] = widest;
          cut[k][i] = j;
        }
      }
    }
  }
  const lines: MeasuredWord[][] = [];
  let i = count;
  for (let k = n; k > 0; k -= 1) {
    const j = cut[k][i];
    lines.unshift(words.slice(j, i));
    i = j;
  }
  return lines;
}

interface StackLine {
  words: MeasuredWord[];
  width: number;
  ascent: number;
  descent: number;
}

/**
 * A poster: each line sized to run the box's width, the words shared between
 * the lines in whichever way inks the most of it. A line break typed is
 * kept. If even the best way leaves a line below the smallest size, the
 * title flows instead.
 */
export function stack(paragraphs: Paragraph[], spec: StackSpec, measurer: Measurer): Block {
  if (!paragraphs.some((p) => p.length)) return empty(spec.box);
  const words = paragraphs.map((p) => p.map((w) => measureWord(w, spec, measurer)));
  const inkOf = (line: MeasuredWord[]) => {
    let ascent = 0;
    let descent = 0;
    for (const word of line) {
      for (const s of word.segments) {
        const b = measurer.bounds(s.face, s.text);
        ascent = Math.max(ascent, b.ascent * s.scale);
        descent = Math.max(descent, b.descent * s.scale);
      }
    }
    return { ascent, descent };
  };
  const asLines = (lines: MeasuredWord[][]): StackLine[] =>
    lines.map((line) => ({ words: line, width: lineWidth(line), ...inkOf(line) }));

  const across = spec.box.w * WIDTH_SLACK;
  type Fitted = { lines: StackLine[]; sizes: number[]; height: number; score: number };
  /** The lines sized to the width, shrunk together if too tall; null if one falls below the smallest size. */
  const fit = (lines: StackLine[]): Fitted | null => {
    let sizes = lines.map((l) => Math.min(spec.maxSize, across / l.width));
    const heightAt = (s: number[]) =>
      lines.reduce((sum, l, i) => sum + (l.ascent + l.descent) * s[i] + (i ? spec.gap * Math.min(s[i - 1], s[i]) : 0), 0);
    let height = heightAt(sizes);
    if (height > spec.box.h) {
      const k = spec.box.h / height;
      sizes = sizes.map((s) => s * k);
      height = heightAt(sizes);
    }
    if (Math.min(...sizes) < spec.minSize) return null;
    const score = lines.reduce((sum, l, i) => sum + l.width * sizes[i] * (l.ascent + l.descent) * sizes[i], 0);
    return { lines, sizes, height, score };
  };

  // Typed lines are kept as typed while they fit. Otherwise every way of
  // giving each typed line one or more lines of the poster is tried, up to
  // the most it may have, and the one that inks the most wins; a tie goes to
  // fewer lines, the earlier tried.
  let best: Fitted | null = words.length > 1 ? fit(asLines(words)) : null;
  if (!best) {
    const most = Math.max(spec.maxLines, words.length);
    const share = (index: number, used: number, chosen: MeasuredWord[][]) => {
      if (index === words.length) {
        const fitted = fit(asLines(chosen));
        if (fitted && (!best || fitted.score > best.score * 1.0001)) best = fitted;
        return;
      }
      const left = words.length - index - 1;
      for (let n = 1; n <= Math.min(words[index].length, most - used - left); n += 1) {
        share(index + 1, used + n, [...chosen, ...partition(words[index], n)]);
      }
    };
    share(0, 0, []);
  }

  if (!best) {
    // Lines far enough apart that no two can touch, whatever they hold.
    const m = measurer.metrics(spec.face);
    return flow(paragraphs, { ...spec, leading: m.ascent + m.descent + spec.gap }, measurer);
  }

  const { lines, sizes, height } = best;
  const { box } = spec;
  let y = box.y + (box.h - height) / 2;
  const placed: PlacedLine[] = lines.map((line, i) => {
    const size = sizes[i];
    if (i) y += spec.gap * Math.min(sizes[i - 1], size);
    const baseline = y + line.ascent * size;
    y = baseline + line.descent * size;
    const width = line.width * size;
    const x = spec.align === "center" ? box.x + (box.w - width) / 2 : box.x;
    const segments: PlacedSegment[] = [];
    let cursor = x;
    line.words.forEach((word, j) => {
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
      if (j < line.words.length - 1) cursor += word.space * size;
    });
    return { segments, x, width, baseline, size, ascent: line.ascent * size, descent: line.descent * size };
  });

  const top = placed[0].baseline - placed[0].ascent;
  const last = placed[placed.length - 1];
  const left = Math.min(...placed.map((l) => l.x));
  const right = Math.max(...placed.map((l) => l.x + l.width));
  return {
    lines: placed,
    size: Math.min(...sizes),
    bounds: { x: left, y: top, w: right - left, h: last.baseline + last.descent - top },
    truncated: false,
  };
}
