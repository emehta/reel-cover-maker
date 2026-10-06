/**
 * Setting a title in liquid letters: which hand draws each letter, how it
 * leans and swells, and how the lines pack into the box.
 *
 * The letters are a dynamic font. Each word is seeded by its own text, and
 * the seed picks the hand it is drawn in; each letter is seeded by its word
 * and its place in it, which picks its size, lean, rise and squash, and (in
 * liquid.ts) its pressure, its drips and its spatter. So the same letter
 * differs from word to word, and a title typed again is drawn exactly as
 * before. Letters are spaced by their ink, never closer than `inkGap`, so
 * paste never fills the gap between two of them.
 *
 * The lines pack the box as a poster's do: each sized to run the full
 * width, then stretched together to fill the height, so the letters crowd
 * and lean into each other, as paste in a tray does.
 */

import type { Rect } from "@/components/reel-cover-maker/formats";
import type { PlacedGlyph } from "@/components/reel-cover-maker/liquid";
import { hashString, mixSeed, random } from "@/components/reel-cover-maker/noise";
import { glyphBox, strokeGlyphs, strokeMetrics, type StrokeFontId } from "@/components/reel-cover-maker/strokes";
import { graphemes, type Paragraph } from "@/components/reel-cover-maker/title";

export interface LiquidSpec {
  box: Rect;
  /**
   * The hands a word may be drawn in, and how often each. A hand marked
   * `capitals` draws only a word's capitals; its other letters are drawn in
   * the first hand.
   */
  fonts: readonly { id: StrokeFontId; share: number; capitals?: boolean }[];
  /** Pixels per em. */
  maxSize: number;
  minSize: number;
  /** Space between lines, in em of the smaller. */
  gap: number;
  maxLines: number;
  /** The most the lines may be stretched taller to fill the box. */
  stretch: number;
  /** Extra space between letters, in em; below zero they touch. */
  tracking: number;
  /** The least space between one letter's centre lines and the next one's, in em: the paste's thickness and a gap. */
  inkGap: number;
  /** How far each letter may differ from the next: size, turn (radians), rise (em) and squash. */
  jitter: { scale: number; angle: number; rise: number; squash: number };
  upper: boolean;
  /**
   * The chance a letter is drawn in its other case, as a sign painter's
   * hand mixes them ("SRirACHA"): never a dotless capital I for an i, which
   * would read as an l.
   */
  swapCase?: number;
  /** Lines centred in the box, or set from its left edge. */
  align?: "center" | "left";
  /** Mixed into every seed, so two styles draw the same word differently. */
  salt: string;
}

export interface LiquidGlyph extends PlacedGlyph {
  line: number;
  /** Which word of its line it is in: letters of a word may tuck together, words keep their space. */
  word: number;
  emphasis: boolean;
}

/** A character no font here can draw (an emoji): set as plain text instead, so it is never lost. */
export interface LiquidMissing {
  text: string;
  x: number;
  y: number;
  size: number;
  line: number;
  emphasis: boolean;
}

export interface LiquidLayout {
  glyphs: LiquidGlyph[];
  missing: LiquidMissing[];
  /** How low each line's drips may run: to the top of the line below, or the box's foot for the last. */
  floors: number[];
  /** Each line's size, in pixels per em. */
  sizes: number[];
  /** The smallest line's size. */
  size: number;
}

interface Letter {
  glyph: LiquidGlyph["glyph"] | null;
  text: string;
  seed: number;
  sx: number;
  sy: number;
  angle: number;
  rise: number;
  /** Where it starts, in em from its word's start, and where its ink starts and ends, in em of the glyph. */
  at: number;
  inkX0: number;
  inkX1: number;
  hasInk: boolean;
  emphasis: boolean;
}

interface Word {
  letters: Letter[];
  width: number;
}

const MISSING_ADVANCE = 1.05;

/** A letter in its other case, now and then, where the hand draws both. */
function swapped(character: string, spec: LiquidSpec, font: StrokeFontId, seed: number): string {
  if (!spec.swapCase || random(seed)() >= spec.swapCase) return character;
  const lower = character.toLocaleLowerCase();
  const upper = character.toLocaleUpperCase();
  if (lower === upper || [...lower].length !== 1 || [...upper].length !== 1) return character;
  const other = character === lower ? upper : lower;
  if (lower === "i" && other === upper) return character;
  return strokeGlyphs(font, other).length ? other : character;
}

function letters(word: Paragraph[number], spec: LiquidSpec): Word {
  const text = word.map((s) => s.text).join("");
  const seed = hashString(`${spec.salt}\u0000${text}`);
  // One hand for the whole word, so its letters share an x-height.
  const pickNext = random(mixSeed(seed, 0x4a4d));
  let pick = pickNext() * spec.fonts.reduce((sum, f) => sum + f.share, 0);
  let hand = spec.fonts[0];
  for (const f of spec.fonts) {
    pick -= f.share;
    if (pick <= 0) {
      hand = f;
      break;
    }
  }
  const out: Letter[] = [];
  let index = 0;
  /** Where the last letter's ink ended, in em from the word's start, and where the next letter starts. */
  let inkEnd = -Infinity;
  let cursor = 0;
  for (const segment of word) {
    const characters = graphemes(spec.upper ? segment.text.toLocaleUpperCase() : segment.text);
    for (const typed of characters) {
      const letterSeed = mixSeed(seed, index);
      index += 1;
      const next = random(letterSeed);
      const character = swapped(typed, spec, hand.id, mixSeed(letterSeed, 0xca5e));
      const capital = character !== character.toLocaleLowerCase();
      const font = hand.capitals && !capital ? spec.fonts[0].id : hand.id;
      const glyphs = strokeGlyphs(font, character);
      const scale = 1 + spec.jitter.scale * (next() * 2 - 1);
      const squash = 1 + spec.jitter.squash * (next() * 2 - 1);
      const angle = spec.jitter.angle * (next() * 2 - 1);
      const rise = spec.jitter.rise * (next() * 2 - 1);
      if (!glyphs.length) {
        out.push({ glyph: null, text: character, seed: letterSeed, sx: 1, sy: 1, angle: 0, rise: 0, at: cursor, inkX0: 0, inkX1: MISSING_ADVANCE, hasInk: true, emphasis: segment.emphasis });
        cursor += MISSING_ADVANCE;
        inkEnd = cursor;
        continue;
      }
      glyphs.forEach((glyph, part) => {
        const sx = scale * squash;
        const ink = glyphBox(glyph);
        const hasInk = ink.x1 > ink.x0 || ink.y1 > ink.y0;
        // As the font spaces it, but never so close that its ink nears the last letter's.
        const at = hasInk ? Math.max(cursor, inkEnd + spec.inkGap - ink.x0 * sx) : cursor;
        out.push({ glyph, text: character, seed: mixSeed(letterSeed, part), sx, sy: scale, angle, rise, at, inkX0: ink.x0, inkX1: ink.x1, hasInk, emphasis: segment.emphasis });
        if (hasInk) inkEnd = at + ink.x1 * sx;
        cursor = at + glyph.advance * sx + spec.tracking;
      });
    }
  }
  const last = out[out.length - 1];
  const width = last ? Math.max(cursor - spec.tracking, inkEnd) : 0;
  return { letters: out, width };
}

/** A word in pieces no wider than `most` em, each piece's letters starting from its own left. */
function breakWord(word: Word, most: number, tracking: number): Word[] {
  if (word.width <= most || word.letters.length < 2) return [word];
  const { letters: all } = word;
  // Where the letters from `from` up to (not including) `to` end, from where the first starts.
  const endOf = (from: number, to: number) => (to < all.length ? all[to].at - tracking : word.width) - all[from].at;
  const pieces: Word[] = [];
  let from = 0;
  while (from < all.length) {
    let to = from + 1;
    while (to < all.length && endOf(from, to + 1) <= most) to += 1;
    const origin = all[from].at;
    pieces.push({ letters: all.slice(from, to).map((l) => ({ ...l, at: l.at - origin })), width: endOf(from, to) });
    from = to;
  }
  return pieces;
}

/** The words shared between `n` lines in order, the widest line as narrow as it can be. */
function partition(widths: number[], space: number, n: number): number[][] {
  const count = widths.length;
  const before = [0];
  for (const w of widths) before.push(before[before.length - 1] + w + space);
  const span = (from: number, to: number) => before[to] - before[from] - space;
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
  const lines: number[][] = [];
  let i = count;
  for (let k = n; k > 0; k -= 1) {
    const j = cut[k][i];
    lines.unshift(Array.from({ length: i - j }, (_, t) => j + t));
    i = j;
  }
  return lines;
}

export function liquidLayout(paragraphs: Paragraph[], spec: LiquidSpec): LiquidLayout {
  const metrics = spec.fonts.map((f) => strokeMetrics(f.id));
  const ascent = Math.max(...metrics.map((m) => (spec.upper ? m.cap * 1.12 : m.ascent)));
  const descent = Math.max(...metrics.map((m) => (spec.upper ? 0.05 : m.descent)));
  const space = Math.max(...metrics.map((m) => m.space)) * 0.62;
  // A word wider than the box at the smallest size is broken between
  // letters, as a word too long for a line is anywhere else.
  const most = spec.box.w / spec.minSize;
  const typed = paragraphs.map((p) => p.flatMap((w) => breakWord(letters(w, spec), most, spec.tracking)));
  if (!typed.some((p) => p.length)) return { glyphs: [], missing: [], floors: [], sizes: [], size: 0 };

  type Line = Word[];
  const lineWidth = (line: Line) => line.reduce((sum, w, i) => sum + w.width + (i ? space : 0), 0);
  const tall = ascent + descent;
  const fit = (lines: Line[]) => {
    let sizes = lines.map((line) => Math.min(spec.maxSize, spec.box.w / Math.max(0.1, lineWidth(line))));
    const heightOf = (s: number[]) => s.reduce((sum, size, i) => sum + size * tall + (i ? spec.gap * Math.min(s[i - 1], size) : 0), 0);
    let height = heightOf(sizes);
    if (height > spec.box.h) {
      sizes = sizes.map((s) => (s * spec.box.h) / height);
      height = heightOf(sizes);
    }
    const score = lines.reduce((sum, line, i) => sum + lineWidth(line) * sizes[i] * sizes[i] * tall, 0);
    return { lines, sizes, height, score, ok: Math.min(...sizes) >= spec.minSize };
  };

  // Typed lines are kept as typed while they fit; otherwise each typed line
  // may be broken further, and the way that inks the most wins.
  let best = typed.length > 1 ? fit(typed) : null;
  if (!best || !best.ok) {
    let found: ReturnType<typeof fit> | null = null;
    const most = Math.max(spec.maxLines, typed.length);
    const share = (index: number, used: number, chosen: Line[]) => {
      if (index === typed.length) {
        const f = fit(chosen);
        if (!found || (f.ok && !found.ok) || (f.ok === found.ok && f.score > found.score * 1.0001)) found = f;
        return;
      }
      const words = typed[index];
      const left = typed.length - index - 1;
      for (let n = 1; n <= Math.min(words.length, most - used - left); n += 1) {
        const parts = partition(words.map((w) => w.width), space, n).map((ids) => ids.map((i) => words[i]));
        share(index + 1, used + n, [...chosen, ...parts]);
      }
    };
    share(0, 0, []);
    best = found ?? best;
  }
  if (!best) return { glyphs: [], missing: [], floors: [], sizes: [], size: 0 };

  // Stretched taller together to fill the box, as far as the style allows.
  const stretch = Math.min(spec.stretch, Math.max(1, spec.box.h / best.height));
  const glyphs: LiquidGlyph[] = [];
  const missing: LiquidMissing[] = [];
  const tops: number[] = [];
  let y = spec.box.y + (spec.box.h - best.height * stretch) / 2;
  best.lines.forEach((line, li) => {
    const size = best.sizes[li];
    if (li) y += spec.gap * Math.min(best.sizes[li - 1], size) * stretch;
    const baseline = y + ascent * size * stretch;
    tops.push(baseline - Math.max(...metrics.map((m) => m.xHeight)) * size * stretch);
    let x = spec.align === "left" ? spec.box.x : spec.box.x + (spec.box.w - lineWidth(line) * size) / 2;
    // The ink gap holds between words too: a word starts after its
    // neighbour's ink, never inside the space a swelling filled.
    let lineInk = -Infinity;
    line.forEach((word, wi) => {
      if (wi) x += space * size;
      let start = x;
      const first = word.letters.find((l) => l.hasInk);
      if (first) {
        const firstInk = start + (first.at + first.inkX0 * first.sx) * size;
        if (firstInk < lineInk + spec.inkGap * size) start += lineInk + spec.inkGap * size - firstInk;
      }
      for (const l of word.letters) {
        const lx = start + l.at * size;
        if (l.glyph) {
          glyphs.push({
            glyph: l.glyph,
            x: lx,
            y: baseline + l.rise * size,
            sx: l.sx * size,
            sy: l.sy * size * stretch,
            angle: l.angle,
            skew: 0,
            seed: l.seed,
            line: li,
            word: wi,
            emphasis: l.emphasis,
          });
        } else {
          missing.push({ text: l.text, x: lx, y: baseline, size: size * 0.8, line: li, emphasis: l.emphasis });
        }
        if (l.hasInk) lineInk = Math.max(lineInk, lx + l.inkX1 * l.sx * size);
      }
      x = start + word.width * size;
    });
    y = baseline + descent * size * stretch;
  });
  const floors = tops.map((_, i) => (i + 1 < tops.length ? tops[i + 1] : spec.box.y + spec.box.h));
  return { glyphs, missing, floors, sizes: best.sizes, size: Math.min(...best.sizes) };
}

/** A box made smaller by `by` on every side. */
export function shrink(box: Rect, by: { x: number; top: number; bottom: number }): Rect {
  return { x: box.x + by.x, y: box.y + by.top, w: Math.max(1, box.w - 2 * by.x), h: Math.max(1, box.h - by.top - by.bottom) };
}
