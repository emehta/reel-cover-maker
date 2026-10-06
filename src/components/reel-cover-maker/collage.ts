/**
 * Spread's layout: a title packed into a square, as paste letters cut and
 * laid on a board are ("ART / is / DIFFE / RENT").
 *
 * Every line runs the square's full width, so a line of few letters is set
 * big and a line of many small; the lines are chosen so that, stacked, they
 * come to the square's height. To get there a long word may be broken
 * across two lines with no hyphen, and a short word ("is", "of", "a") may be
 * set small on a line of its own, centred, between the big ones. Many ways
 * of doing that are tried and scored on how square they come out, how few
 * words they break and how even the letters' sizes stay; the shuffle's seed
 * picks among the best few, so Shuffle lays the same title out another way.
 *
 * Letters are spaced by their paste, not their advances: a letter's ink is
 * its centre lines widened by the paste's radius on every side, and the gap
 * between two letters' ink is fixed, so a justified line is justified in
 * paste. Pure, like the rest of the layout.
 */

import type { LiquidGlyph, LiquidLayout, LiquidMissing, LiquidSpec } from "@/components/reel-cover-maker/liquid-layout";
import { between, hashString, mixSeed, random } from "@/components/reel-cover-maker/noise";
import { glyphBox, strokeGlyphs, strokeMetrics, type StrokeGlyph } from "@/components/reel-cover-maker/strokes";
import { graphemes, type Paragraph } from "@/components/reel-cover-maker/title";

export interface CollageSpec extends Omit<LiquidSpec, "fonts" | "gap" | "maxLines" | "stretch" | "tracking" | "inkGap" | "align"> {
  font: LiquidSpec["fonts"][number]["id"];
  /** The paste's radius, in em, as the recipe has it: letters are spaced by their paste. */
  weight: number;
  /** The gap between two letters' paste, and between two lines', in em of the line's letters. */
  letterGap: number;
  lineGap: number;
  /** A word space, in em, ink to ink. */
  wordGap: number;
  /**
   * How much narrower than the font the letters are drawn: paste this thick
   * needs letters taller than they are wide, or an S has no room for its
   * two counters.
   */
  condense: number;
}

interface Letter {
  glyph: StrokeGlyph | null;
  text: string;
  /** Its ink's left and right, in em, the paste included. */
  inkX0: number;
  inkX1: number;
  seed: number;
  emphasis: boolean;
}

/** A run of letters set on one line: a word, or a piece of one. */
interface Run {
  letters: Letter[];
  /** The word it is (or is part of), in the title's order. */
  word: number;
}

interface Line {
  runs: Run[];
  /** A short word set small and centred, not run the full width. */
  small: boolean;
}

const MISSING_WIDTH = 0.9;

/** The width of a run in em of its letters' cap height, paste and gaps included. */
function runWidth(run: Run, spec: CollageSpec): number {
  return run.letters.reduce((sum, l, i) => sum + (l.inkX1 - l.inkX0) + (i ? spec.letterGap : 0), 0);
}

function lineWidth(line: Line, spec: CollageSpec): number {
  return line.runs.reduce((sum, run, i) => sum + runWidth(run, spec) + (i ? spec.wordGap : 0), 0);
}

/** How small a small line is set, against the lines either side of it. */
const SMALL = 0.42;

/** The height of each line, in pixels, to run `width` wide: small lines from their neighbours. */
function heights(lines: Line[], spec: CollageSpec, width: number, tall: number): number[] {
  const full = lines.map((line) => (line.small ? 0 : (width / Math.max(0.2, lineWidth(line, spec))) * tall));
  return lines.map((line, i) => {
    if (!line.small) return full[i];
    const near = [full[i - 1], full[i + 1]].filter((h) => h > 0);
    const base = near.length ? Math.min(...near) : (width / 4) * tall;
    // Never wider than the square, however short its neighbours.
    return Math.min(base * SMALL, (width / Math.max(0.2, lineWidth(line, spec))) * tall);
  });
}

interface Plan {
  lines: Line[];
  sizes: number[];
  score: number;
}

export function collageLayout(paragraphs: Paragraph[], spec: CollageSpec): LiquidLayout {
  const metrics = strokeMetrics(spec.font);
  // A capital's height in em, its paste above and below included.
  const tall = metrics.cap + 2 * spec.weight;
  // Words, as letters measured in that unit.
  const words: { letters: Letter[]; paragraph: number }[] = [];
  paragraphs.forEach((p, pi) => {
    for (const word of p) {
      const text = word.map((s) => s.text).join("");
      const seed = hashString(`${spec.salt}\u0000${text}`);
      const letters: Letter[] = [];
      let index = 0;
      for (const segment of word) {
        for (const character of graphemes(spec.upper ? segment.text.toLocaleUpperCase() : segment.text)) {
          const letterSeed = mixSeed(seed, index);
          index += 1;
          const glyphs = strokeGlyphs(spec.font, character);
          if (!glyphs.length) {
            letters.push({ glyph: null, text: character, inkX0: 0, inkX1: MISSING_WIDTH / tall, seed: letterSeed, emphasis: segment.emphasis });
            continue;
          }
          glyphs.forEach((glyph, part) => {
            const box = glyphBox(glyph);
            const hasInk = box.x1 > box.x0 || box.y1 > box.y0;
            const x0 = hasInk ? box.x0 * spec.condense - spec.weight : 0;
            const x1 = hasInk ? box.x1 * spec.condense + spec.weight : glyph.advance * spec.condense;
            letters.push({ glyph, text: character, inkX0: x0 / tall, inkX1: x1 / tall, seed: mixSeed(letterSeed, part), emphasis: segment.emphasis });
          });
        }
      }
      if (letters.length) words.push({ letters, paragraph: pi });
    }
  });
  if (!words.length) return { glyphs: [], missing: [], floors: [], sizes: [], size: 0 };

  const side = Math.min(spec.box.w, spec.box.h);
  const unit = { ...spec, letterGap: spec.letterGap / tall, wordGap: spec.wordGap / tall, lineGap: spec.lineGap / tall };
  const totalHeight = (lines: Line[], sizes: number[]) =>
    sizes.reduce((sum, h, i) => sum + h + (i ? unit.lineGap * Math.min(h, sizes[i - 1]) : 0), 0);

  /** A plan scored: how far from square, how many breaks, how uneven its sizes. */
  const score = (lines: Line[], breaks: number, smalls: number): Plan => {
    const sizes = heights(lines, unit, side, 1);
    const height = totalHeight(lines, sizes);
    const off = Math.log(height / side);
    const big = sizes.filter((_, i) => !lines[i].small);
    const spreadOut = big.length > 1 ? Math.log(Math.max(...big) / Math.min(...big)) : 0;
    // Too many letters on a line sets them too small to read.
    const tiny = sizes.reduce((sum, h) => sum + Math.max(0, spec.minSize - h) / spec.minSize, 0);
    const result = off * off * 6 + breaks * 0.12 + smalls * 0.03 + Math.max(0, spreadOut - 1.3) * 0.4 + tiny * 2 + (lines.length === 1 && words.length > 1 ? 0.2 : 0);
    return { lines, sizes, score: result };
  };

  // Plans tried: from each a seeded walk through the words, starting a line,
  // breaking a word, or setting a short word small, each with its own odds.
  const plans: Plan[] = [];
  const tries = 700;
  for (let t = 0; t < tries; t += 1) {
    const next = random(mixSeed(hashString(spec.salt), t));
    const pNew = between(next, 0.15, 0.9);
    const pBreak = between(next, 0, 0.7);
    const pSmall = between(next, 0, 0.8);
    const lines: Line[] = [];
    let breaks = 0;
    let smalls = 0;
    let line: Line = { runs: [], small: false };
    const flush = () => {
      if (line.runs.length) lines.push(line);
      line = { runs: [], small: false };
    };
    words.forEach((w, wi) => {
      const newParagraph = wi > 0 && words[wi - 1].paragraph !== w.paragraph;
      if (newParagraph || (line.runs.length && next() < pNew)) flush();
      // A short word alone and small, now and then, between two big lines.
      if (w.letters.length <= 3 && words.length > 2 && wi > 0 && wi < words.length - 1 && next() < pSmall) {
        flush();
        lines.push({ runs: [{ letters: w.letters, word: wi }], small: true });
        smalls += 1;
        return;
      }
      // A long word broken between two lines, two letters or more each side.
      if (w.letters.length >= 6 && next() < pBreak) {
        const at = 3 + Math.floor(next() * (w.letters.length - 5));
        line.runs.push({ letters: w.letters.slice(0, at), word: wi });
        flush();
        line.runs.push({ letters: w.letters.slice(at), word: wi });
        breaks += 1;
        return;
      }
      line.runs.push({ letters: w.letters, word: wi });
    });
    flush();
    // A small line never stands first or last, nor beside another.
    if (lines[0]?.small || lines[lines.length - 1]?.small || lines.some((l, i) => l.small && lines[i + 1]?.small)) continue;
    plans.push(score(lines, breaks, smalls));
  }
  // The words as typed, one paragraph a line, is always a candidate.
  const typed: Line[] = [];
  words.forEach((w, wi) => {
    if (!typed.length || words[wi - 1].paragraph !== w.paragraph) typed.push({ runs: [], small: false });
    typed[typed.length - 1].runs.push({ letters: w.letters, word: wi });
  });
  plans.push(score(typed, 0, 0));

  // The best few, distinct, and one of them by the seed.
  plans.sort((a, b) => a.score - b.score);
  const keyOf = (p: Plan) => p.lines.map((l) => `${l.small ? "s" : ""}${l.runs.map((r) => r.letters.length).join(",")}`).join("|");
  const best: Plan[] = [];
  for (const p of plans) {
    if (best.length >= 4 || p.score > plans[0].score + 0.18) break;
    if (!best.some((b) => keyOf(b) === keyOf(p))) best.push(p);
  }
  const pick = best[Math.floor(random(hashString(`${spec.salt}#pick`))() * best.length)] ?? plans[0];

  // Fit: the lines' heights, stretched or squeezed (by at most a fifth) to
  // come to the square's height, then scaled to fit it whole.
  let sizes = pick.sizes.map((h) => h);
  const height = totalHeight(pick.lines, sizes);
  const stretch = Math.min(1.2, Math.max(0.85, side / height));
  const fitted = height * stretch;
  const shrinkBy = Math.min(1, side / fitted);
  sizes = sizes.map((h) => h * shrinkBy);
  const width = side * shrinkBy;
  const top = spec.box.y + (spec.box.h - fitted * shrinkBy) / 2;
  const left = spec.box.x + (spec.box.w - width) / 2;

  const glyphs: LiquidGlyph[] = [];
  const missing: LiquidMissing[] = [];
  const lineSizes: number[] = [];
  let y = top;
  pick.lines.forEach((line, li) => {
    const h = sizes[li];
    const em = h / tall;
    if (li) y += unit.lineGap * Math.min(h, sizes[li - 1]) * stretch;
    const lineH = h * stretch;
    // Pixels per em across, and down (the stretch).
    const sx = em * spec.condense;
    const sy = em * stretch;
    const baseline = y + lineH - spec.weight * em;
    const natural = lineWidth(line, unit) * h;
    // A full line is justified to the width by its gaps alone; a small one is centred.
    const slack = line.small ? 0 : width - natural;
    const gaps = line.runs.reduce((sum, r) => sum + Math.max(0, r.letters.length - 1), 0) + Math.max(0, line.runs.length - 1) * 2;
    const extra = gaps ? slack / gaps : 0;
    let x = line.small ? left + (width - natural) / 2 : left;
    line.runs.forEach((run, ri) => {
      if (ri) x += unit.wordGap * h + extra * 2;
      run.letters.forEach((l, i) => {
        if (i) x += unit.letterGap * h + extra;
        const next = random(mixSeed(l.seed, 0xc011));
        if (l.glyph) {
          glyphs.push({
            glyph: l.glyph,
            // The ink's left edge at x: the glyph's own origin sits that far left of it.
            x: x - l.inkX0 * h,
            y: baseline,
            sx: sx * (1 + spec.jitter.squash * (next() * 2 - 1) * 0.3),
            sy: sy * (1 + spec.jitter.scale * (next() * 2 - 1) * 0.3),
            angle: spec.jitter.angle * (next() * 2 - 1),
            skew: 0,
            em,
            seed: l.seed,
            line: li,
            word: run.word,
            emphasis: l.emphasis,
          });
        } else {
          missing.push({ text: l.text, x, y: baseline, size: lineH * 0.8, line: li, emphasis: l.emphasis });
        }
        x += (l.inkX1 - l.inkX0) * h;
      });
    });
    lineSizes.push(em);
    y += lineH;
  });
  // The capital's height stood for every letter's; some reach above it
  // (an A's apex) or below the line (a Q's tail). So the block is measured
  // by its real ink, paste and all, and scaled and centred to sit wholly
  // in the square.
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const g of glyphs) {
    const box = glyphBox(g.glyph);
    const r = spec.weight * (g.em ?? g.sx);
    x0 = Math.min(x0, g.x + box.x0 * g.sx - r);
    x1 = Math.max(x1, g.x + box.x1 * g.sx + r);
    y0 = Math.min(y0, g.y + box.y0 * g.sy - r);
    y1 = Math.max(y1, g.y + box.y1 * g.sy + r);
  }
  for (const m of missing) {
    x0 = Math.min(x0, m.x);
    x1 = Math.max(x1, m.x + m.size * MISSING_WIDTH);
    y0 = Math.min(y0, m.y - m.size);
    y1 = Math.max(y1, m.y);
  }
  const k = Math.min(1, side / Math.max(1e-6, x1 - x0), side / Math.max(1e-6, y1 - y0));
  const cx = spec.box.x + spec.box.w / 2;
  const cy = spec.box.y + spec.box.h / 2;
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const fit = (x: number, y: number) => ({ x: cx + (x - mx) * k, y: cy + (y - my) * k });
  const placedGlyphs = glyphs.map((g) => ({ ...g, ...fit(g.x, g.y), sx: g.sx * k, sy: g.sy * k, em: (g.em ?? g.sx) * k }));
  const missed = missing.map((m) => ({ ...m, ...fit(m.x, m.y), size: m.size * k }));
  const floors = lineSizes.map(() => spec.box.y + spec.box.h);
  return { glyphs: placedGlyphs, missing: missed, floors, sizes: lineSizes.map((v) => v * k), size: Math.min(...lineSizes) * k };
}
