/**
 * Wave (the owner's ask, 9 Nov 2026, after their lockup THE / RIPPLE /
 * EFFECT): the title in capitals, stacked, every line exactly as wide as
 * the others, so the whole reads as one rectangle, "one piece"; and that
 * block waving inside its own rectangle, as the rows of the owner's
 * "waves" poster wave and conform to one another.
 *
 * The letters are each face's own outlines (wave-faces, read from the
 * font files), so every line can be set at the width that makes it meet
 * the others, which a canvas cannot do with a variable font. What the
 * owner settled on, in previews of THE RIPPLE EFFECT:
 *
 * - Widths by ink. A line's width is its ink, less what an end T hangs
 *   past the edge: a T at either end of a line hangs out by 0.35 of its
 *   bar's reach past its stem (`HANG`, "Medium"), so its stem, not the tip
 *   of its bar, lines up with the letters under it. EFFECT's end T hangs
 *   on the right the same.
 * - Classic (Mona Sans, Anton): lines within a few percent of the widest
 *   share its cap height, the narrower of them widened to meet it (Mona
 *   Sans by its width axis, from its narrowest; Anton by its spacing, as it
 *   has no axis), and a line much narrower (THE) is scaled up to the width.
 * - Brick (Archivo): every line one cap height, each set at the width that
 *   makes it as wide as the shortest is at its widest (THE at 125); if a
 *   line is still too long at its narrowest, the short lines open their
 *   spacing a step at a time until they reach it (THE's 0.014 cap).
 * - Lines a tenth of the smallest line's cap height apart; an accent over
 *   a capital or a tail under one is given its own room on top of that.
 *
 * Any title is broken into lines as near one another in width as its
 * words allow, as many as fill the cover best: THE RIPPLE EFFECT is a word
 * a line; a longer title takes a few words a line.
 *
 * The wave is a vertical warp of the block, and nothing else: its top and
 * its bottom never move and nothing moves sideways, so the rectangle holds
 * on every frame. Each line swells by a raised-cosine hump as a crest
 * runs across it, the other lines giving up that height in proportion to
 * their own, so the column's total never changes; each point of a letter
 * keeps its share of its line's height, and a gap between two lines keeps
 * its thickness measured across its slope. Round letters' overshoot, and
 * any accent or tail, ride with their line at its own size. Every crest
 * starts and ends wholly off the block, so each pass starts and ends on
 * the plain lockup. The five animations (the owner's of 9 Nov) differ in
 * how the lines' crests move against one another; where crests overlap
 * the swells are eased toward one and a quarter of one (`soften`), so no
 * line is crushed by two at once.
 *
 * The still cover is its animation stopped mid-wave (the owner: when first
 * written out, and not animated, "it should just have a wave"); played,
 * the wave runs on from there, passes, rests on the plain lockup a moment,
 * and comes round to the still again, so the loop starts and ends on the
 * cover.
 *
 * Pure: the tests run it.
 */

import type { FaceId, Measurer } from "@/components/reel-cover-maker/faces";
import type { Rect } from "@/components/reel-cover-maker/formats";
import type { Op, Scene, Wrap, WrapRef } from "@/components/reel-cover-maker/scene";
import { graphemes, type Paragraph } from "@/components/reel-cover-maker/title";
import { waveFaceData, waveFaceOf, type WaveFace, type WaveFaceData, type WaveFaceId } from "@/components/reel-cover-maker/wave-faces";

/* The faces' letters, read at any width. */

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A glyph at one width, in em, y up from the baseline. */
interface Glyph {
  advance: number;
  cmds: string;
  pts: Float64Array;
  box: Box | null;
}

/** Where a width falls among a face's samples: the sample below it, and how far towards the next. */
function sampleAt(face: WaveFaceData, width: number | null): { k: number; t: number } {
  const ws = face.widths;
  if (!ws || ws.length < 2 || width === null) return { k: 0, t: 0 };
  const w = Math.min(ws[ws.length - 1], Math.max(ws[0], width));
  let k = 0;
  while (k + 2 < ws.length && w > ws[k + 1]) k += 1;
  return { k, t: (w - ws[k]) / (ws[k + 1] - ws[k]) };
}

/** The face's narrowest and widest, or null for a face with one width. */
function rangeOf(face: WaveFaceData): [number, number] | null {
  const ws = face.widths;
  return ws && ws.length > 1 ? [ws[0], ws[ws.length - 1]] : null;
}

/** How many numbers each command of an outline takes. */
const ARITY: Record<string, number> = { M: 2, L: 2, Q: 4, C: 6, Z: 0 };

/** An outline's box, its curves' extremes included, as the ink of its letters has it. */
function outlineBox(cmds: string, pts: ArrayLike<number>): Box | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const add = (x: number, y: number) => {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  };
  const quad = (a: number, b: number, c: number) => {
    const den = a - 2 * b + c;
    if (Math.abs(den) < 1e-12) return [];
    const t = (a - b) / den;
    return t > 0 && t < 1 ? [t] : [];
  };
  const cubic = (a: number, b: number, c: number, d: number) => {
    const A = -a + 3 * b - 3 * c + d;
    const B = 2 * (a - 2 * b + c);
    const C = b - a;
    const ts: number[] = [];
    if (Math.abs(A) < 1e-12) {
      if (Math.abs(B) > 1e-12) ts.push(-C / B);
    } else {
      const disc = B * B - 4 * A * C;
      if (disc >= 0) {
        const s = Math.sqrt(disc);
        ts.push((-B + s) / (2 * A), (-B - s) / (2 * A));
      }
    }
    return ts.filter((t) => t > 0 && t < 1);
  };
  let i = 0;
  let px = 0;
  let py = 0;
  for (const c of cmds) {
    if (c === "M" || c === "L") {
      px = pts[i];
      py = pts[i + 1];
      add(px, py);
    } else if (c === "Q") {
      const [cx, cy, x, y] = [pts[i], pts[i + 1], pts[i + 2], pts[i + 3]];
      add(x, y);
      for (const t of [...quad(px, cx, x), ...quad(py, cy, y)]) {
        const u = 1 - t;
        add(u * u * px + 2 * u * t * cx + t * t * x, u * u * py + 2 * u * t * cy + t * t * y);
      }
      px = x;
      py = y;
    } else if (c === "C") {
      const [ax, ay, bx, by, x, y] = [pts[i], pts[i + 1], pts[i + 2], pts[i + 3], pts[i + 4], pts[i + 5]];
      add(x, y);
      for (const t of [...cubic(px, ax, bx, x), ...cubic(py, ay, by, y)]) {
        const u = 1 - t;
        add(u * u * u * px + 3 * u * u * t * ax + 3 * u * t * t * bx + t * t * t * x, u * u * u * py + 3 * u * u * t * ay + 3 * u * t * t * by + t * t * t * y);
      }
      px = x;
      py = y;
    }
    i += ARITY[c] ?? 0;
  }
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null;
}

/** Glyphs read at a width, by face: a line is set again and again while its width is solved, and the same glyph read once. */
const glyphCache = new WeakMap<WaveFaceData, Map<string, Glyph>>();

function glyphOf(face: WaveFaceData, ch: string, width: number | null): Glyph | null {
  const entry = face.glyphs[ch];
  if (!entry) return null;
  const { k, t } = sampleAt(face, width);
  let cache = glyphCache.get(face);
  if (!cache) {
    cache = new Map();
    glyphCache.set(face, cache);
  }
  const key = `${ch}\u0000${k}\u0000${t}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const advs = entry[0];
  const cmds = entry[1];
  const p0 = entry[2];
  const deltas = entry.slice(3) as number[][];
  const below = k > 0 ? deltas[k - 1] : null;
  const above = face.widths && face.widths.length > 1 ? deltas[k] : null;
  const unit = 1 / face.upem;
  const pts = new Float64Array(p0.length);
  for (let i = 0; i < p0.length; i += 1) {
    const a = p0[i] + (below ? below[i] : 0);
    const b = above ? p0[i] + above[i] : a;
    pts[i] = (a + (b - a) * t) * unit;
  }
  const a0 = advs[k];
  const a1 = advs[Math.min(advs.length - 1, k + 1)];
  const glyph: Glyph = { advance: (a0 + (a1 - a0) * t) * unit, cmds, pts, box: outlineBox(cmds, pts) };
  if (cache.size > 6000) cache.clear();
  cache.set(key, glyph);
  return glyph;
}

/** How much closer (negative) or further a pair is set than its advance, in em, at a width. */
function kernOf(face: WaveFaceData, a: string, b: string, width: number | null): number {
  const l = face.kern.left[a];
  const r = face.kern.right[b];
  if (!l || !r) return 0;
  const cell = face.kern.cells[`${l},${r}`];
  if (!cell) return 0;
  const { k, t } = sampleAt(face, width);
  const k0 = cell[k];
  const k1 = cell[Math.min(cell.length - 1, k + 1)];
  return (k0 + (k1 - k0) * t) / face.upem;
}

/** A face's cap height at a width: the top of its H. */
function capOf(face: WaveFaceData, width: number | null): number {
  return glyphOf(face, "H", width)?.box?.y1 ?? 0.7;
}

/* Lines. */

/** Characters a phone types that the faces know by another code point. */
const SUBSTITUTES: Record<string, string> = {
  " ": " ",
  "‐": "-",
  "‑": "-",
  "‒": "-",
  "−": "-",
  "′": "'",
  "″": '"',
  "ʼ": "’",
  "‛": "‘",
  "‟": "“",
};

/** The face set in for a character none of Wave's faces draws (an emoji): set as text, its cap height the line's. */
export const WAVE_FALLBACK_FACE: FaceId = "sans";

/** The letters a face draws a grapheme as: itself, a stand-in, or its letters without their marks; null where it has none of these. */
function lettersFor(face: WaveFaceData, g: string): string[] | null {
  if (face.glyphs[g]) return [g];
  // Asked for as an emoji (a keycap, a heart in colour): an emoji, never the face's own figure or sign.
  if (/[\uFE0F\u20E3]/u.test(g)) return null;
  const sub = SUBSTITUTES[g];
  if (sub && [...sub].every((c) => face.glyphs[c])) return [...sub];
  const base = g.normalize("NFD").replace(/\p{M}/gu, "");
  if (base && base !== g && [...base].every((c) => face.glyphs[c])) return [...base];
  return null;
}

/** A capital T, its bar wider than its stem: hung past a line's end by a share of its reach (the owner's "Medium", 9 Nov). */
const T_LETTERS = new Set(["T", "Ţ", "Ť", "Ŧ", "Ț"]);
export const HANG = 0.35;

/** How far a T's bar reaches past its stem on each side, in em: from the stem's straight sides, found as the long upright edges standing on the baseline. */
function tReach(g: Glyph, cap: number): { left: number; right: number } | null {
  if (!g.box) return null;
  let lo = Infinity;
  let hi = -Infinity;
  let i = 0;
  let px = 0;
  let py = 0;
  for (const c of g.cmds) {
    const n = ARITY[c] ?? 0;
    if (c === "M") {
      px = g.pts[i];
      py = g.pts[i + 1];
    } else if (n) {
      const x = g.pts[i + n - 2];
      const y = g.pts[i + n - 1];
      if (c === "L" && Math.abs(x - px) < 1e-6 && Math.min(y, py) < 0.05 * cap && Math.abs(y - py) > 0.5 * cap) {
        lo = Math.min(lo, x);
        hi = Math.max(hi, x);
      }
      px = x;
      py = y;
    }
    i += n;
  }
  if (!Number.isFinite(lo) || hi - lo < 0.05 * cap) return null;
  return { left: lo - g.box.x0, right: g.box.x1 - hi };
}

type Piece = { kind: "glyph"; ch: string; x: number; g: Glyph } | { kind: "text"; text: string; x: number; size: number; w: number; ink: Box };

/** One line set at a width and spacing: its letters, its ink (em, y up), its cap height, what hangs past each end, and its width less that, in cap heights. */
interface SetLine {
  text: string;
  pieces: Piece[];
  ink: Box;
  cap: number;
  hangL: number;
  hangR: number;
  w: number;
  width: number | null;
  track: number;
}

type Item = { ch: string } | { run: string };

/** A line's characters as the face draws them: its glyphs, and runs of what it has none of. */
const itemsCache = new WeakMap<WaveFaceData, Map<string, Item[]>>();

function itemsOf(face: WaveFaceData, text: string): Item[] {
  let cache = itemsCache.get(face);
  if (!cache) {
    cache = new Map();
    itemsCache.set(face, cache);
  }
  let items = cache.get(text);
  if (!items) {
    items = [];
    for (const g of graphemes(text)) {
      const letters = lettersFor(face, g);
      if (letters) for (const ch of letters) items.push({ ch });
      else {
        const last = items[items.length - 1];
        if (last && "run" in last) last.run += g;
        else items.push({ run: g });
      }
    }
    if (cache.size > 4000) cache.clear();
    cache.set(text, items);
  }
  return items;
}

/** Lines set, by face, text and setting: the same line is set again for every layout tried, and as the title is typed. Only lines all in the face's own letters are kept, as a run set as text is measured by the page's own measurer. */
const lineCache = new WeakMap<WaveFaceData, Map<string, SetLine>>();

/** A line of `text` set in `face` at `width`, `track` cap heights between every two characters. */
function setLine(face: WaveFaceData, text: string, width: number | null, track: number, measurer: Measurer): SetLine {
  const items = itemsOf(face, text);
  const keep = items.every((it) => "ch" in it);
  const key = `${text}\u0000${width}\u0000${track}`;
  let cache = lineCache.get(face);
  if (!cache) {
    cache = new Map();
    lineCache.set(face, cache);
  }
  if (keep) {
    const hit = cache.get(key);
    if (hit) return hit;
  }
  const line = setItems(face, text, items, width, track, measurer);
  if (keep) {
    if (cache.size > 4000) cache.clear();
    cache.set(key, line);
  }
  return line;
}

function setItems(face: WaveFaceData, text: string, items: Item[], width: number | null, track: number, measurer: Measurer): SetLine {
  const cap = capOf(face, width);
  const pieces: Piece[] = [];
  let pen = 0;
  const fallbackCap = Math.max(0.2, measurer.metrics(WAVE_FALLBACK_FACE).cap);
  items.forEach((item, i) => {
    if ("ch" in item) {
      const g = glyphOf(face, item.ch, width);
      if (g) {
        pieces.push({ kind: "glyph", ch: item.ch, x: pen, g });
        pen += g.advance;
        const next = items[i + 1];
        if (next && "ch" in next) pen += kernOf(face, item.ch, next.ch, width);
      }
    } else {
      const size = cap / fallbackCap;
      const b = measurer.bounds(WAVE_FALLBACK_FACE, item.run);
      const w = measurer.width(WAVE_FALLBACK_FACE, item.run) * size;
      pieces.push({ kind: "text", text: item.run, x: pen, size, w, ink: { x0: -b.left * size, x1: b.right * size, y0: -b.descent * size, y1: b.ascent * size } });
      pen += w;
    }
    if (i < items.length - 1) pen += track * cap;
  });
  let ink: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const p of pieces) {
    const b = p.kind === "glyph" ? p.g.box : p.ink;
    if (!b) continue;
    ink = { x0: Math.min(ink.x0, p.x + b.x0), y0: Math.min(ink.y0, b.y0), x1: Math.max(ink.x1, p.x + b.x1), y1: Math.max(ink.y1, b.y1) };
  }
  if (!Number.isFinite(ink.x0)) ink = { x0: 0, y0: 0, x1: Math.max(1e-3, pen), y1: cap };
  let hangL = 0;
  let hangR = 0;
  const inked = pieces.filter((p) => (p.kind === "glyph" ? p.g.box : p.ink));
  const first = inked[0];
  const last = inked[inked.length - 1];
  if (first?.kind === "glyph" && T_LETTERS.has(first.ch) && Math.abs(first.x + (first.g.box?.x0 ?? 0) - ink.x0) < 1e-9) hangL = HANG * (tReach(first.g, cap)?.left ?? 0);
  if (last?.kind === "glyph" && T_LETTERS.has(last.ch) && Math.abs(last.x + (last.g.box?.x1 ?? 0) - ink.x1) < 1e-9) hangR = HANG * (tReach(last.g, cap)?.right ?? 0);
  return { text, pieces, ink, cap, hangL, hangR, w: (ink.x1 - ink.x0 - hangL - hangR) / cap, width, track };
}

/**
 * Each glyph's box sides, cap height and T reach at each of the face's
 * widths, worked out exactly once: in between they are read in a straight
 * line, near enough to find where a line meets a width, which is then
 * found exactly (`solve`).
 */
interface Sides {
  x0: number[];
  x1: number[];
  left: number[];
  right: number[];
}

const sidesCache = new WeakMap<WaveFaceData, Map<string, Sides | null>>();

function sidesOf(face: WaveFaceData, ch: string): Sides | null {
  let cache = sidesCache.get(face);
  if (!cache) {
    cache = new Map();
    sidesCache.set(face, cache);
  }
  if (cache.has(ch)) return cache.get(ch) ?? null;
  const ws = face.widths ?? [null];
  const at = ws.map((w) => glyphOf(face, ch, w));
  let sides: Sides | null = null;
  if (at.every((g) => g?.box)) {
    const caps = ws.map((w) => capOf(face, w));
    const reach = at.map((g, k) => (T_LETTERS.has(ch) && g ? tReach(g, caps[k]) : null));
    sides = {
      x0: at.map((g) => g?.box?.x0 ?? 0),
      x1: at.map((g) => g?.box?.x1 ?? 0),
      left: reach.map((r) => r?.left ?? 0),
      right: reach.map((r) => r?.right ?? 0),
    };
  }
  cache.set(ch, sides);
  return sides;
}

/** A line's width less its hanging T's, in cap heights, read quickly: advances and kerning exactly, box sides in a straight line between the face's widths. */
function quickWidth(face: WaveFaceData, text: string, width: number | null, track: number, measurer: Measurer): number {
  const items = itemsOf(face, text);
  const { k, t } = sampleAt(face, width);
  const lerp = (v: number[]) => v[k] + (v[Math.min(v.length - 1, k + 1)] - v[k]) * t;
  const unit = 1 / face.upem;
  const caps = (face.widths && face.widths.length > 1 ? face.widths : [null]).map((w) => capOf(face, w));
  const cap = lerp(caps);
  const fallbackCap = Math.max(0.2, measurer.metrics(WAVE_FALLBACK_FACE).cap);
  let pen = 0;
  let x0 = Infinity;
  let x1 = -Infinity;
  // What hangs at each end: a T's reach, if the ink at that end is a T's.
  let hangL = 0;
  let hangR = 0;
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if ("ch" in item) {
      const entry = face.glyphs[item.ch];
      if (!entry) continue;
      const sides = sidesOf(face, item.ch);
      if (sides) {
        const a = pen + lerp(sides.x0);
        const b = pen + lerp(sides.x1);
        if (a < x0) {
          x0 = a;
          hangL = T_LETTERS.has(item.ch) ? HANG * lerp(sides.left) : 0;
        }
        if (b > x1) {
          x1 = b;
          hangR = T_LETTERS.has(item.ch) ? HANG * lerp(sides.right) : 0;
        }
      }
      pen += lerp(entry[0]) * unit;
      const next = items[i + 1];
      if (next && "ch" in next) pen += kernOf(face, item.ch, next.ch, width);
    } else {
      const size = cap / fallbackCap;
      const b = measurer.bounds(WAVE_FALLBACK_FACE, item.run);
      if (pen - b.left * size < x0) {
        x0 = pen - b.left * size;
        hangL = 0;
      }
      if (pen + b.right * size > x1) {
        x1 = pen + b.right * size;
        hangR = 0;
      }
      pen += measurer.width(WAVE_FALLBACK_FACE, item.run) * size;
    }
    if (i < items.length - 1) pen += track * cap;
  }
  if (!Number.isFinite(x0)) return Math.max(1e-3, pen) / cap;
  return (x1 - x0 - hangL - hangR) / cap;
}

/**
 * The setting in [lo, hi] at which a line, widening as it rises, is
 * `target` wide; null where it is not in that range. Found on the quick
 * width first, then exactly: within a stretch between two of the face's
 * widths a line's width moves in a straight line, so a step or two along
 * the secant lands on it.
 */
function solve(quick: (v: number) => number, exact: (v: number) => number, lo: number, hi: number, target: number): number | null {
  if (exact(lo) > target + 1e-12 || exact(hi) < target - 1e-12) return null;
  let a = lo;
  let b = hi;
  for (let i = 0; i < 48; i += 1) {
    const mid = (a + b) / 2;
    if (quick(mid) < target) a = mid;
    else b = mid;
  }
  let v1 = (a + b) / 2;
  let e1 = exact(v1) - target;
  let v0 = Math.min(hi, Math.max(lo, v1 - Math.sign(e1 || 1) * (hi - lo) * 1e-4));
  let e0 = exact(v0) - target;
  for (let i = 0; i < 6 && Math.abs(e1) > 1e-12 * Math.max(1, target); i += 1) {
    if (Math.abs(e1 - e0) < 1e-15) break;
    const v2 = Math.min(hi, Math.max(lo, v1 - (e1 * (v1 - v0)) / (e1 - e0)));
    v0 = v1;
    e0 = e1;
    v1 = v2;
    e1 = exact(v1) - target;
  }
  return v1;
}

/** How near the widest a classic line must be to be widened to meet it rather than scaled up: by Mona Sans's width axis, by Anton's spacing (which shows sooner). */
const NEAR_BY_WIDTH = 0.08;
const NEAR_BY_SPACING = 0.05;

/** How much a brick's short line may open its spacing to reach the others, in cap heights between two letters, and by how much at a time (the lockup's step). */
const BRICK_TRACK_MOST = 0.1;
const BRICK_TRACK_STEP = 0.002;

/** Classic: lines near the widest share its cap height, widened to it; the rest each scaled up to the width. */
function classicLines(face: WaveFaceData, spec: WaveFace, texts: string[], measurer: Measurer): SetLine[] {
  const base = texts.map((t) => setLine(face, t, spec.width, 0, measurer));
  const out = [...base];
  const order = base.map((_, i) => i).sort((a, b) => base[b].w - base[a].w || a - b);
  const taken = new Array<boolean>(base.length).fill(false);
  const range = rangeOf(face);
  for (const head of order) {
    if (taken[head]) continue;
    taken[head] = true;
    const target = base[head].w;
    for (const j of order) {
      if (taken[j]) continue;
      // As wide as the widest already (a tie): its cap height, as it is.
      if (base[j].w >= target - 1e-12) {
        taken[j] = true;
        continue;
      }
      if (range && spec.width !== null) {
        if (base[j].w < target * (1 - NEAR_BY_WIDTH)) continue;
        const w = solve((v) => quickWidth(face, texts[j], v, 0, measurer), (v) => setLine(face, texts[j], v, 0, measurer).w, spec.width, range[1], target);
        if (w === null) continue;
        out[j] = setLine(face, texts[j], w, 0, measurer);
      } else {
        if (base[j].w < target * (1 - NEAR_BY_SPACING)) continue;
        const track = solve((v) => quickWidth(face, texts[j], spec.width, v, measurer), (v) => setLine(face, texts[j], spec.width, v, measurer).w, 0, 1, target);
        if (track === null) continue;
        out[j] = setLine(face, texts[j], spec.width, track, measurer);
      }
      taken[j] = true;
    }
  }
  return out;
}

/**
 * Brick: every line one cap height. The width they meet at is the
 * narrowest any line reaches at its widest; where a line is longer than
 * that even at its narrowest, the short lines first open their spacing a
 * step at a time until they reach the long one. A line that cannot (one
 * letter, which has no spacing to open) is set at its widest and scaled up
 * on its own.
 */
function brickLines(face: WaveFaceData, spec: WaveFace, texts: string[], measurer: Measurer): SetLine[] {
  const range = rangeOf(face);
  if (!range) return classicLines(face, spec, texts, measurer);
  const [lo, hi] = range;
  const longest = Math.max(...texts.map((t) => setLine(face, t, lo, 0, measurer).w));
  const reach = texts.map((t) => {
    let line = setLine(face, t, hi, 0, measurer);
    for (let track = BRICK_TRACK_STEP; line.w < longest && track <= BRICK_TRACK_MOST + 1e-9; track += BRICK_TRACK_STEP) {
      line = setLine(face, t, hi, Math.round(track / BRICK_TRACK_STEP) * BRICK_TRACK_STEP, measurer);
    }
    return line;
  });
  const meets = reach.filter((l) => l.w >= longest - 1e-12);
  if (!meets.length) return reach;
  const target = Math.min(...meets.map((l) => l.w));
  return texts.map((t, i) => {
    const own = reach[i];
    if (own.w < longest - 1e-12) return own;
    if (Math.abs(own.w - target) < 1e-12) return own;
    const w = solve((v) => quickWidth(face, t, v, own.track, measurer), (v) => setLine(face, t, v, own.track, measurer).w, lo, hi, target);
    return w === null ? own : setLine(face, t, w, own.track, measurer);
  });
}

function linesFor(face: WaveFaceData, spec: WaveFace, texts: string[], measurer: Measurer): SetLine[] {
  return spec.mode === "brick" ? brickLines(face, spec, texts, measurer) : classicLines(face, spec, texts, measurer);
}

/* The block. */

/** Lines a tenth of the smallest line's cap height apart (the lockup's gap). */
export const WAVE_GAP = 0.1;

/** How far past its cap line or baseline a line's ink may reach and still be a round letter's overshoot, as a share of its cap height: past it (an accent, a tail) is given room of its own. */
const OVERSHOOT = 0.03;

/** A line placed in a block of optical width 1 from x = 0, y = 0 at the first line's cap line, y down: scaled `f` from its em. */
interface Row {
  line: SetLine;
  f: number;
  top: number;
  base: number;
}

interface Stack {
  rows: Row[];
  /** The block's ink at width 1, hanging T's, accents and tails included. */
  ink: Box;
  /** The largest cap height over the smallest. */
  spread: number;
}

function stackOf(lines: SetLine[]): Stack {
  const scaled = lines.map((line) => {
    const f = 1 / Math.max(1e-9, line.ink.x1 - line.ink.x0 - line.hangL - line.hangR);
    return { line, f, capOut: line.cap * f };
  });
  const small = Math.min(...scaled.map((s) => s.capOut));
  const above = scaled.map((s) => Math.max(0, (s.line.ink.y1 - s.line.cap) * s.f - OVERSHOOT * s.capOut));
  const below = scaled.map((s) => Math.max(0, -s.line.ink.y0 * s.f - OVERSHOOT * s.capOut));
  const rows: Row[] = [];
  let y = 0;
  scaled.forEach((s, i) => {
    if (i > 0) y += WAVE_GAP * small + below[i - 1] + above[i];
    rows.push({ line: s.line, f: s.f, top: y, base: y + s.capOut });
    y += s.capOut;
  });
  let ink: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const r of rows) {
    const { line, f } = r;
    ink = {
      x0: Math.min(ink.x0, -line.hangL * f),
      x1: Math.max(ink.x1, 1 + line.hangR * f),
      y0: Math.min(ink.y0, r.base - line.ink.y1 * f),
      y1: Math.max(ink.y1, r.base - line.ink.y0 * f),
    };
  }
  return { rows, ink, spread: Math.max(...scaled.map((s) => s.capOut)) / Math.max(1e-9, small) };
}

/* Breaking a title into lines. */

/** A word wider than this many cap heights is broken between its letters (a web address), so it is never a sliver across the cover; a long word (PRODUCTIVITY) is a line of its own. */
const LONGEST_WORD = 22;

/**
 * Above this many times the smallest line's cap height, a layout's tallest
 * line costs it, steeply: THE, at 1.96, was the owner's in the classic
 * lockup; in the brick every line is one height, so a line that could not
 * meet the others (TO on its own, huge) costs it sooner.
 */
const SPREAD_OK = { classic: 2.2, brick: 1.25 };

/** The most lines a typed line is broken into: past this a title is set smaller rather than taller. */
const MOST_LINES = 12;

/** A typed line narrower than this many cap heights (a lone "I", a full stop) joins the line before it: as a line of its own it would be scaled to the block's width, a letter several widths tall. */
const LEAST_TYPED_LINE = 1;

/** How much wider than the average a line may be tried as, when a paragraph is split: wider costs more than any split there is. */
const WIDEST_TRIED = 4;

interface Para {
  /** Its words, a word too long broken into pieces; `glued[i]` where piece i runs on into the next with no space, being parts of one word. */
  words: string[];
  glued: boolean[];
  /** Words i to j as they are set on one line, and that line's natural width, in cap heights. */
  text: (i: number, j: number) => string;
  width: (i: number, j: number) => number;
  /** A space's width, in cap heights. */
  space: number;
  /** Its splits, by line count, worked out once. */
  splits: Map<number, string[]>;
}

/** A paragraph's words, a word too long broken into pieces of at most LONGEST_WORD. */
function paraOf(face: WaveFaceData, spec: WaveFace, words: string[], measurer: Measurer): Para {
  const memo = new Map<string, number>();
  const natural = (text: string) => {
    let w = memo.get(text);
    if (w === undefined) {
      w = setLine(face, text, spec.width, 0, measurer).w;
      memo.set(text, w);
    }
    return w;
  };
  const pieces: string[] = [];
  const glued: boolean[] = [];
  for (const word of words) {
    if (natural(word) <= LONGEST_WORD) {
      pieces.push(word);
      glued.push(false);
      continue;
    }
    const gs = graphemes(word);
    const count = Math.ceil(natural(word) / LONGEST_WORD);
    const per = Math.ceil(gs.length / count);
    for (let i = 0; i < gs.length; i += per) {
      pieces.push(gs.slice(i, i + per).join(""));
      glued.push(i + per < gs.length);
    }
  }
  const text = (i: number, j: number) => {
    let out = pieces[i];
    for (let k = i + 1; k <= j; k += 1) out += (glued[k - 1] ? "" : " ") + pieces[k];
    return out;
  };
  return { words: pieces, glued, text, width: (i, j) => natural(text(i, j)), space: Math.max(0, natural("H H") - natural("HH")), splits: new Map() };
}

/** The average width of a paragraph's lines in `k` lines, in cap heights: its width as one line, less the spaces the breaks take out. */
function meanOf(p: Para, k: number): number {
  const n = p.words.length;
  const lines = Math.max(1, Math.min(k, n));
  return Math.max(1e-6, (p.width(0, n - 1) - (lines - 1) * p.space) / lines);
}

/** A paragraph in `k` lines as even as its words allow: the split whose line furthest from the average, in ratio, is least far, then the one nearest it overall. */
function splitInto(p: Para, k: number): string[] {
  const n = p.words.length;
  if (k >= n) return p.words.map((_, i) => p.text(i, i));
  if (k <= 1) return [p.text(0, n - 1)];
  const hit = p.splits.get(k);
  if (hit) return hit;
  const mean = meanOf(p, k);
  const cost = (i: number, j: number) => Math.abs(Math.log(p.width(i, j) / mean));
  // best[m][j]: the least [worst, sum of squares] for words 0..j-1 in m lines, and where its last line starts.
  const best: { worst: number; sq: number; from: number }[][] = Array.from({ length: k + 1 }, () => Array.from({ length: n + 1 }, () => ({ worst: Infinity, sq: Infinity, from: -1 })));
  best[0][0] = { worst: 0, sq: 0, from: -1 };
  for (let m = 1; m <= k; m += 1) {
    for (let j = m; j <= n - (k - m); j += 1) {
      // The last line from word i, longer as i goes back: once it is far wider than the average, no longer one can do better.
      for (let i = j - 1; i >= m - 1; i -= 1) {
        if (i < j - 1 && p.width(i, j - 1) > mean * WIDEST_TRIED) break;
        const prev = best[m - 1][i];
        if (!Number.isFinite(prev.worst)) continue;
        const c = cost(i, j - 1);
        const worst = Math.max(prev.worst, c);
        const sq = prev.sq + c * c;
        const cur = best[m][j];
        if (worst < cur.worst - 1e-12 || (Math.abs(worst - cur.worst) <= 1e-12 && (sq < cur.sq - 1e-12 || (Math.abs(sq - cur.sq) <= 1e-12 && i < cur.from)))) best[m][j] = { worst, sq, from: i };
      }
    }
  }
  const lines: string[] = [];
  let j = n;
  for (let m = k; m >= 1; m -= 1) {
    const i = best[m][j].from;
    lines.unshift(p.text(i, j - 1));
    j = i;
  }
  p.splits.set(k, lines);
  return lines;
}

/** The most lines a paragraph is tried in. */
const linesMost = (p: Para) => Math.min(p.words.length, MOST_LINES);

/** How many lines a paragraph takes for lines about `measure` cap heights wide: the count whose average is nearest it. Fewer as the measure grows. */
function linesAt(p: Para, measure: number): number {
  let best = 1;
  let gap = Infinity;
  for (let k = 1; k <= linesMost(p); k += 1) {
    const d = Math.abs(Math.log(meanOf(p, k) / measure));
    if (d < gap - 1e-12) {
      gap = d;
      best = k;
    }
  }
  return best;
}

/** Every measure at which some paragraph takes one line more or fewer. */
function switchPoints(paras: Para[]): number[] {
  const out: number[] = [];
  for (const p of paras) for (let k = 1; k < linesMost(p); k += 1) out.push(Math.sqrt(meanOf(p, k) * meanOf(p, k + 1)));
  return [...new Set(out.map((v) => Math.round(v * 1e9) / 1e9))].sort((a, b) => a - b);
}

/** Marks alone (a full stop, an exclamation mark): joined to the word before with no space. */
const MARKS_ONLY = /^[\p{P}\p{S}]+$/u;

/**
 * Typed lines as Wave sets them: a typed line too narrow to stand as a
 * line of its own joins the one before it (the first, the one after), its
 * marks alone run on from the last word with no space.
 */
function joinNarrow(lines: string[][], narrow: (words: string[]) => boolean): string[][] {
  if (lines.length < 2) return lines;
  const out: string[][] = [];
  for (const words of lines) {
    const last = out[out.length - 1];
    if (last && narrow(words)) {
      if (words.every((w) => MARKS_ONLY.test(w))) last[last.length - 1] += words.join("");
      else last.push(...words);
    } else out.push([...words]);
  }
  // The first, if narrow, joins the one after it.
  if (out.length > 1 && narrow(out[0])) {
    const [first, next] = out;
    out.splice(0, 2, [...first, ...next]);
  }
  return out;
}

/* The style. */

/** A line of the cover: its text, where its cap line and baseline are, and its letters as closed outlines in pixels of the picture. */
export interface WaveRow {
  text: string;
  top: number;
  base: number;
  polygons: number[][];
  /** Characters none of the faces draws, set as text where they fall, the line's cap height. */
  texts?: { text: string; face: FaceId; size: number; x: number; y: number; w: number }[];
}

/** A moment of a wave animation: which, and how far through its pass, 0 to 1. */
export interface WaveMoment {
  variant: WaveVariantId;
  s: number;
}

export interface WaveOp {
  kind: "wave";
  color: string;
  /** The block's left (its lines' edge, a T hanging past it) and its width, in pixels of the picture. */
  x: number;
  w: number;
  rows: WaveRow[];
  /** Where the wave is: null for the plain lockup. */
  at: WaveMoment | null;
}

export interface WaveSpec {
  face: WaveFaceId;
  ink: string;
  /** The animation the still cover is stopped in. */
  animation: WaveVariantId;
  wrap?: Wrap | null;
}

/** How finely a letter's curves and long edges are cut, as a share of the block's width: fine enough that an edge bends with the wave without corners. */
const FLATTEN = 0.0025;

/** A glyph's outline as closed polylines in the picture, at most `step` pixels a piece, mapped by (X, Y). */
function flattened(g: Glyph, map: (x: number, y: number) => [number, number], step: number): number[][] {
  const out: number[][] = [];
  let cur: number[] | null = null;
  let i = 0;
  let x = 0;
  let y = 0;
  const push = (px: number, py: number) => {
    const [X, Y] = map(px, py);
    cur?.push(X, Y);
  };
  for (const c of g.cmds) {
    const p = g.pts;
    if (c === "M") {
      x = p[i];
      y = p[i + 1];
      cur = [];
      out.push(cur);
      push(x, y);
    } else if (c === "L") {
      const [nx, ny] = [p[i], p[i + 1]];
      const [ax, ay] = map(x, y);
      const [bx, by] = map(nx, ny);
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
      for (let j = 1; j <= n; j += 1) push(x + ((nx - x) * j) / n, y + ((ny - y) * j) / n);
      x = nx;
      y = ny;
    } else if (c === "Q") {
      const [cx, cy, nx, ny] = [p[i], p[i + 1], p[i + 2], p[i + 3]];
      const [ax, ay] = map(x, y);
      const [kx, ky] = map(cx, cy);
      const [bx, by] = map(nx, ny);
      const n = Math.max(2, Math.ceil((Math.hypot(kx - ax, ky - ay) + Math.hypot(bx - kx, by - ky)) / step));
      for (let j = 1; j <= n; j += 1) {
        const t = j / n;
        const u = 1 - t;
        push(u * u * x + 2 * u * t * cx + t * t * nx, u * u * y + 2 * u * t * cy + t * t * ny);
      }
      x = nx;
      y = ny;
    } else if (c === "C") {
      const [ax0, ay0, bx0, by0, nx, ny] = [p[i], p[i + 1], p[i + 2], p[i + 3], p[i + 4], p[i + 5]];
      const pts = [map(x, y), map(ax0, ay0), map(bx0, by0), map(nx, ny)];
      const len = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) + Math.hypot(pts[2][0] - pts[1][0], pts[2][1] - pts[1][1]) + Math.hypot(pts[3][0] - pts[2][0], pts[3][1] - pts[2][1]);
      const n = Math.max(3, Math.ceil(len / step));
      for (let j = 1; j <= n; j += 1) {
        const t = j / n;
        const u = 1 - t;
        push(u * u * u * x + 3 * u * u * t * ax0 + 3 * u * t * t * bx0 + t * t * t * nx, u * u * u * y + 3 * u * u * t * ay0 + 3 * u * t * t * by0 + t * t * t * ny);
      }
      x = nx;
      y = ny;
    }
    i += ARITY[c] ?? 0;
  }
  return out.filter((loop) => loop.length >= 6);
}

/** The words of a paragraph, uppercased. */
const wordsOf = (p: Paragraph) => p.map((w) => w.map((s) => s.text).join("").toLocaleUpperCase()).filter((w) => w.length > 0);

/** Lines for a layout: each paragraph in the count the measure gives it. */
function textsAt(paras: Para[], measure: number): string[] {
  return paras.flatMap((p) => splitInto(p, linesAt(p, measure)));
}

/** A Wave cover's lettering, laid out in the safe area: one wave op, the box its ink fills, and what a text box is set again from. */
export function wave(paragraphs: Paragraph[], safe: Rect, measurer: Measurer, spec: WaveSpec): { ops: Op[]; readable: Rect; ref?: WrapRef; wrapped?: { width: number; min: number } } {
  const centre = { x: safe.x + safe.w / 2, y: safe.y + safe.h / 2 };
  const none = { ops: [] as Op[], readable: { x: centre.x, y: centre.y, w: 0, h: 0 } };
  const face = waveFaceData(spec.face);
  if (!face) return none;
  const faceSpec = waveFaceOf(spec.face);
  const typed = paragraphs.map((p) => wordsOf(p)).filter((ws) => ws.length);
  const narrow = (words: string[]) => setLine(face, words.join(" "), faceSpec.width, 0, measurer).w < LEAST_TYPED_LINE;
  const paras = joinNarrow(typed, narrow).map((ws) => paraOf(face, faceSpec, ws, measurer));
  if (!paras.length) return none;

  const made = new Map<string, Stack>();
  const stackAt = (measure: number) => {
    const texts = textsAt(paras, measure);
    const key = texts.join("\n");
    let s = made.get(key);
    if (!s) {
      s = stackOf(linesFor(face, faceSpec, texts, measurer));
      made.set(key, s);
    }
    return s;
  };
  const inkW = (s: Stack) => s.ink.x1 - s.ink.x0;
  const inkH = (s: Stack) => s.ink.y1 - s.ink.y0;

  // Every way of breaking it a measure gives, the first a word a line.
  const points = switchPoints(paras);
  const measures = points.length
    ? [points[0] / 1.5, ...points.slice(1).map((v, i) => Math.sqrt(v * points[i])), points[points.length - 1] * 1.5]
    : [paras[0].width(0, paras[0].words.length - 1)];

  const wrap = spec.wrap ?? null;
  let stack: Stack;
  let W: number;
  let ref: WrapRef | undefined;
  let wrapped: { width: number; min: number } | undefined;
  if (wrap) {
    // As a text box: the box's width over the size it was set at is the measure, so at its own width the lines are those it set, fewer as it widens; never narrower than a word a line.
    const size = Math.max(1e-6, wrap.ref.size);
    const min = Math.max(1, size * measures[0]);
    const width = Math.max(wrap.width, min);
    stack = stackAt(width / size);
    W = width / inkW(stack);
    wrapped = { width, min };
  } else {
    // Its own layout: each way of breaking it as large as the safe area holds, the one that fills it best (a tallest line far past the smallest costing it).
    let best: { score: number; measure: number; stack: Stack; W: number } | null = null;
    for (const measure of measures) {
      const s = stackAt(measure);
      const fit = Math.min(safe.w / inkW(s), safe.h / inkH(s));
      const fill = (inkW(s) * fit * inkH(s) * fit) / (safe.w * safe.h);
      const ok = SPREAD_OK[faceSpec.mode];
      const score = fill * (s.spread > ok ? (ok / s.spread) ** 2 : 1);
      if (!best || score > best.score * (1 + 1e-9)) best = { score, measure, stack: s, W: fit };
    }
    // There is always a measure; one word alone has one.
    const chosen = best ?? { measure: measures[0], stack: stackAt(measures[0]), W: safe.w };
    stack = chosen.stack;
    W = chosen.W;
    ref = { size: (inkW(stack) * W) / chosen.measure, width: inkW(stack) * W };
  }

  // Centred in the safe area by its ink.
  const ox = centre.x - ((stack.ink.x0 + stack.ink.x1) / 2) * W;
  const oy = centre.y - ((stack.ink.y0 + stack.ink.y1) / 2) * W;
  const step = Math.max(0.5, FLATTEN * W);
  const rows: WaveRow[] = stack.rows.map((r) => {
    const f = r.f * W;
    const left = ox - r.line.hangL * f;
    const base = oy + r.base * W;
    const map = (x: number, y: number): [number, number] => [left + (x - r.line.ink.x0) * f, base - y * f];
    const polygons: number[][] = [];
    const texts: NonNullable<WaveRow["texts"]> = [];
    for (const p of r.line.pieces) {
      if (p.kind === "glyph") {
        if (p.g.box) polygons.push(...flattened(p.g, (x, y) => map(p.x + x, y), step));
      } else texts.push({ text: p.text, face: WAVE_FALLBACK_FACE, size: p.size * f, x: left + (p.x - r.line.ink.x0) * f, y: base, w: p.w * f });
    }
    return { text: r.line.text, top: oy + r.top * W, base, polygons, ...(texts.length ? { texts } : {}) };
  });
  const op: WaveOp = { kind: "wave", color: spec.ink, x: ox, w: W, rows, at: stillOf(spec.animation) };
  const readable = { x: ox + stack.ink.x0 * W, y: oy + stack.ink.y0 * W, w: inkW(stack) * W, h: inkH(stack) * W };
  return { ops: [op as Op], readable, ...(ref ? { ref } : {}), ...(wrapped ? { wrapped } : {}) };
}

/* The wave. */

export type WaveVariantId = "crossing" | "wave-cascade" | "loose" | "wave-ripple" | "one-wave";

/** A line's crest as it crosses the block: the stretch of the pass it takes (0 to 1), which way (1 left to right), its half width, and its share of the strength. */
interface Travel {
  a: number;
  b: number;
  dir: 1 | -1;
  reach: number;
  k: number;
}

export interface WaveVariant {
  id: WaveVariantId;
  name: string;
  /** How long a pass takes at its own speed, and how long the plain lockup rests before the next, in seconds. */
  pass: number;
  hold: number;
  /** How much a line swells at a crest, in the smallest line's heights. */
  strength: number;
  /** Where crests overlap, their total eased toward one and a quarter swells. */
  cap: boolean;
  /** Where in its pass the still cover stops it. */
  still: number;
  /** Each of `n` lines' crest, as it crosses; or a ring out from the middle. */
  travel?: (n: number) => Travel[];
  ring?: { reach: number };
}

/** Line i of n's place down the block, 0 at the top and 1 at the bottom. */
const down = (i: number, n: number) => (n > 1 ? i / (n - 1) : 0);

/**
 * The five, the owner's of 9 Nov, in units of the block's width over a
 * thousand, set out for any number of lines (each the owner's for three):
 * Crossing (alternate lines run the other way: the preview opened on it),
 * Cascade (each line's crest in turn), Loose (each line its own width and
 * speed), Ripple (a ring out from the middle), and One wave (a crest
 * running down the block on a slant, as one wave).
 */
export const WAVE_VARIANTS: readonly WaveVariant[] = [
  {
    id: "crossing",
    name: "Crossing",
    pass: 3.2,
    hold: 0.8,
    strength: 1.15,
    cap: true,
    still: 0.5,
    travel: (n) => Array.from({ length: n }, (_, i) => ({ a: 0.3 * down(i, n), b: 0.3 * down(i, n) + 0.7, dir: i % 2 ? -1 : 1, reach: 400, k: 1 })),
  },
  {
    id: "wave-cascade",
    name: "Cascade",
    pass: 3.6,
    hold: 0.8,
    strength: 1.15,
    cap: false,
    // Past the middle, where two lines' crests are up at once: in the middle only one is.
    still: 0.62,
    travel: (n) => Array.from({ length: n }, (_, i) => ({ a: 0.5 * down(i, n), b: 0.5 * down(i, n) + 0.5, dir: 1, reach: 400, k: 1 })),
  },
  {
    id: "loose",
    name: "Loose",
    pass: 3.2,
    hold: 0.8,
    strength: 1.15,
    cap: true,
    still: 0.5,
    travel: (n) =>
      Array.from({ length: n }, (_, i) => {
        const length = [0.82, 0.5, 0.7][i % 3];
        const a = Math.min(1 - length, 0.3 * down(i, n) + [0, 0.01, 0][i % 3]);
        return { a, b: a + length, dir: 1, reach: [520, 320, 430][i % 3], k: 1 };
      }),
  },
  // Stopped as its ring crosses the top two lines, an arc through the block.
  { id: "wave-ripple", name: "Ripple", pass: 3.0, hold: 0.8, strength: 1.15, cap: true, still: 0.45, ring: { reach: 360 } },
  {
    id: "one-wave",
    name: "One wave",
    pass: 2.8,
    hold: 0.8,
    strength: 1.15,
    cap: false,
    still: 0.5,
    travel: (n) => Array.from({ length: n }, (_, i) => ({ a: 0.246 * down(i, n), b: 0.246 * down(i, n) + 0.754, dir: 1, reach: 420, k: 1 })),
  },
];

export const DEFAULT_WAVE_VARIANT: WaveVariantId = "crossing";

export function waveVariant(id: WaveVariantId): WaveVariant {
  return WAVE_VARIANTS.find((v) => v.id === id) ?? WAVE_VARIANTS[0];
}

export function isWaveVariantId(value: unknown): value is WaveVariantId {
  return WAVE_VARIANTS.some((v) => v.id === value);
}

/** The still cover's moment in an animation. */
export function stillOf(id: WaveVariantId): WaveMoment {
  return { variant: id, s: waveVariant(id).still };
}

/** Where every crest starts and ends, in thousandths of the block's width from its left: wholly off it, a hanging T included (further out where a short line's T hangs further); and how much of the pass is eased. */
const EDGES = { left: -60, right: 1060, clear: 10, ease: 0.35 };

/** Overlapping swells eased toward one and a quarter of one: unchanged up to 0.85 of one, then bending smoothly toward the cap. */
const CAP = { knee: 0.85, top: 1.25 };

/** How strongly a title of one line waves within itself, against a line among others. */
const SPLIT_STRENGTH = 0.65;

/** Never thinner than this share of itself, however the swells fall: the strength is lowered for a block where they would crush a line (a tall narrow one). */
const LINE_FLOOR = 0.4;

export function soften(u: number): [number, number] {
  if (u <= CAP.knee) return [u, 1];
  const span = CAP.top - CAP.knee;
  const e = Math.exp(-(u - CAP.knee) / span);
  return [CAP.top - span * e, e];
}

const hump = (z: number, reach: number) => (Math.abs(z) < reach ? 0.5 * (1 + Math.cos((Math.PI * z) / reach)) : 0);
const humpSlope = (z: number, reach: number) => (Math.abs(z) < reach ? ((-0.5 * Math.PI) / reach) * Math.sin((Math.PI * z) / reach) : 0);
const eased = (s: number) => (1 - EDGES.ease) * s + EDGES.ease * (0.5 - 0.5 * Math.cos(Math.PI * s));

/** The rows the wave moves: the lines', or for a single line its two halves, meeting with no gap, so it waves within itself. */
interface Field {
  rows: [number, number][];
  /** Each row's height at rest, and its share of the column. */
  h: number[];
  w: number[];
  x0: number;
  W: number;
  split: boolean;
  /** How far across the letters run, hanging T's included. */
  lo: number;
  hi: number;
}

function fieldOf(op: Pick<WaveOp, "rows" | "x" | "w">): Field {
  const split = op.rows.length === 1;
  const rows: [number, number][] = split ? [[op.rows[0].top, (op.rows[0].top + op.rows[0].base) / 2], [(op.rows[0].top + op.rows[0].base) / 2, op.rows[0].base]] : op.rows.map((r) => [r.top, r.base]);
  const h = rows.map(([a, b]) => b - a);
  const sum = h.reduce((s, v) => s + v, 0);
  const [lo, hi] = spanOf(op.rows);
  return { rows, h, w: h.map((v) => v / Math.max(1e-9, sum)), x0: op.x, W: op.w, split, lo, hi };
}

type Crest = { c: number; R: number; k: number } | null;
/** Where every crest is at a moment, in pixels of the picture: null for the plain lockup. */
type State = { lines: Crest[] } | { ring: { x0: number; dy: number[]; R: number; r: number } };

function stateOf(field: Field, moment: WaveMoment): State | null {
  const v = waveVariant(moment.variant);
  const s = Math.min(1, Math.max(0, moment.s));
  if (s <= 0 || s >= 1) return null;
  const e = eased(s);
  const unit = field.W / 1000;
  const left = Math.min(field.x0 + EDGES.left * unit, field.lo - EDGES.clear * unit);
  const right = Math.max(field.x0 + EDGES.right * unit, field.hi + EDGES.clear * unit);
  if (v.ring) {
    const R = v.ring.reach * unit;
    const x0 = (left + right) / 2;
    const mid = field.rows.map(([a, b]) => (a + b) / 2);
    const n = mid.length;
    const y0 = (mid[Math.floor((n - 1) / 2)] + mid[Math.ceil((n - 1) / 2)]) / 2;
    const dy = mid.map((m) => m - y0);
    const far = Math.max(...dy.map((d) => Math.hypot(right - x0, d)));
    return { ring: { x0, dy, R, r: -R + (far + 2 * R) * e } };
  }
  const travel = v.travel?.(field.rows.length) ?? [];
  return {
    lines: travel.map((l) => {
      const u = (e - l.a) / (l.b - l.a);
      if (u <= 0 || u >= 1) return null;
      const R = l.reach * unit;
      const from = left - R;
      const to = right + R;
      return { c: l.dir > 0 ? from + (to - from) * u : to - (to - from) * u, R, k: l.k };
    }),
  };
}

/** Row i's swell at x, and its slope: [G, dG/dx]. */
function swell(i: number, x: number, st: State, A: number): [number, number] {
  if ("ring" in st) {
    const g = st.ring;
    const dx = x - g.x0;
    const rho = Math.hypot(dx, g.dy[i]);
    const z = rho - g.r;
    return [A * hump(z, g.R), rho > 1e-9 ? A * humpSlope(z, g.R) * (dx / rho) : 0];
  }
  const l = st.lines[i];
  if (!l) return [0, 0];
  return [A * l.k * hump(x - l.c, l.R), A * l.k * humpSlope(x - l.c, l.R)];
}

/** Each gap at x: how far its middle has moved, and its slope there. */
function gapsAt(field: Field, x: number, st: State, A: number, cap: boolean): { d: number[]; s: number[] } {
  const n = field.rows.length;
  const G = new Array<number>(n);
  const Q = new Array<number>(n);
  let S = 0;
  let SQ = 0;
  for (let i = 0; i < n; i += 1) {
    const [g, q] = swell(i, x, st, A);
    G[i] = g;
    Q[i] = q;
    S += g;
    SQ += q;
  }
  const dl = G.map((g, i) => g - field.w[i] * S);
  const sl = Q.map((q, i) => q - field.w[i] * SQ);
  if (cap && A > 0 && S > CAP.knee * A) {
    // Every swell here scaled by f = soften(S/A) / (S/A); its slope by the product rule.
    const u = S / A;
    const [sv, sd] = soften(u);
    const f = sv / u;
    const df = ((sd * u - sv) / (u * u)) * (SQ / A);
    for (let i = 0; i < n; i += 1) {
      sl[i] = df * dl[i] + f * sl[i];
      dl[i] *= f;
    }
  }
  const d: number[] = [];
  const s: number[] = [];
  let D = 0;
  let SL = 0;
  for (let k = 0; k + 1 < n; k += 1) {
    D += dl[k];
    SL += sl[k];
    d.push(D);
    s.push(SL);
  }
  return { d, s };
}

/** Every row's top and baseline at x, from where the gaps are: a gap keeps its thickness across its slope, the rows either side giving up the room. */
function bandsAt(field: Field, g: { d: number[]; s: number[] }): number[] {
  const { rows } = field;
  const n = rows.length;
  const out = new Array<number>(2 * n);
  out[0] = rows[0][0];
  out[2 * n - 1] = rows[n - 1][1];
  for (let k = 0; k + 1 < n; k += 1) {
    const gap = rows[k + 1][0] - rows[k][1];
    const m = (rows[k][1] + rows[k + 1][0]) / 2 + g.d[k];
    const half = (gap / 2) * Math.sqrt(1 + g.s[k] * g.s[k]);
    out[2 * k + 1] = m - half;
    out[2 * k + 2] = m + half;
  }
  return out;
}

/** A point of row i at its share u of the row's height (0 at the top, 1 at the baseline), in bands b: past either end (overshoot, an accent, a tail) it rides with the row at its own size. */
function warpY(field: Field, i: number, u: number, b: number[]): number {
  const top = b[2 * i];
  const base = b[2 * i + 1];
  if (u < 0) return top + u * field.h[i];
  if (u > 1) return base + (u - 1) * field.h[i];
  return top + u * (base - top);
}

/** The strength a variant swells a field's lines by: its own, lowered where that would make any line thinner than LINE_FLOOR of itself. */
const strengths = new WeakMap<WaveRow[], Map<WaveVariantId, number>>();

function strengthOf(op: Pick<WaveOp, "rows" | "x" | "w">, field: Field, id: WaveVariantId): number {
  let byId = strengths.get(op.rows);
  if (!byId) {
    byId = new Map();
    strengths.set(op.rows, byId);
  }
  const hit = byId.get(id);
  if (hit !== undefined) return hit;
  const v = waveVariant(id);
  // A line alone waves within itself, its middle moving between its fixed top and baseline: at full strength a crossbar tilts till an H reads as an N.
  let A = v.strength * Math.min(...field.h) * (field.split ? SPLIT_STRENGTH : 1);
  for (let round = 0; round < 3; round += 1) {
    let least = 1;
    for (let si = 1; si < 48; si += 1) {
      const st = stateOf(field, { variant: id, s: si / 48 });
      if (!st) continue;
      for (let xi = 0; xi <= 64; xi += 1) {
        const x = field.x0 + (field.W * xi) / 64;
        const b = bandsAt(field, gapsAt(field, x, st, A, v.cap));
        for (let i = 0; i < field.rows.length; i += 1) least = Math.min(least, (b[2 * i + 1] - b[2 * i]) / field.h[i]);
      }
    }
    if (least >= LINE_FLOOR) break;
    A *= (1 - LINE_FLOOR) / Math.max(1e-6, 1 - least) * 0.98;
  }
  byId.set(id, A);
  return A;
}

/** Where the wave holds a column at x: every row's top and baseline, for the op as it is now; null for the plain lockup. */
export function waveBands(op: WaveOp, x: number): number[] | null {
  if (!op.at) return null;
  const field = fieldOf(op);
  const st = stateOf(field, op.at);
  if (!st) return null;
  const v = waveVariant(op.at.variant);
  return bandsAt(field, gapsAt(field, x, st, strengthOf(op, field, op.at.variant), v.cap));
}

/** How far across the letters run, hanging T's included: kept for the rows, which every frame of an animation shares. */
const spans = new WeakMap<WaveRow[], [number, number]>();

function spanOf(rows: WaveRow[]): [number, number] {
  let hit = spans.get(rows);
  if (!hit) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const r of rows) {
      for (const p of r.polygons) {
        for (let j = 0; j < p.length; j += 2) {
          if (p[j] < lo) lo = p[j];
          if (p[j] > hi) hi = p[j];
        }
      }
    }
    hit = Number.isFinite(lo) ? [lo, hi] : [0, 1];
    spans.set(rows, hit);
  }
  return hit;
}

/** Each line's letters as the wave holds them now, in pixels of the picture: the op's own outlines where it is still. */
const warped = new WeakMap<WaveOp, number[][]>();

export function wavePolygons(op: WaveOp): number[][] {
  const hit = warped.get(op);
  if (hit) return hit;
  const field = fieldOf(op);
  const st = op.at ? stateOf(field, op.at) : null;
  let out: number[][];
  if (!st || !op.at) out = op.rows.flatMap((r) => r.polygons);
  else {
    const v = waveVariant(op.at.variant);
    const A = strengthOf(op, field, op.at.variant);
    // The bands worked out every half pixel across the letters and read in a straight line between: the wave bends over hundreds of pixels, so this is the wave to a twentieth of a pixel (at most, where Ripple's ring crosses its own middle), at a fraction of the cost of every point's own.
    const [lo, hi] = spanOf(op.rows);
    const step = 0.5;
    const columns = Math.max(2, Math.ceil((hi - lo) / step) + 1);
    const n = field.rows.length;
    const grid = new Float64Array(columns * 2 * n);
    for (let c = 0; c < columns; c += 1) {
      const b = bandsAt(field, gapsAt(field, lo + c * step, st, A, v.cap));
      grid.set(b, c * 2 * n);
    }
    const band = new Array<number>(2 * n);
    const bandsFor = (x: number) => {
      const f = Math.min(columns - 1, Math.max(0, (x - lo) / step));
      const c = Math.min(columns - 2, Math.floor(f));
      const t = f - c;
      const a = c * 2 * n;
      const b = a + 2 * n;
      for (let k = 0; k < 2 * n; k += 1) band[k] = grid[a + k] + (grid[b + k] - grid[a + k]) * t;
      return band;
    };
    out = [];
    op.rows.forEach((r, ri) => {
      const h = r.base - r.top;
      for (const poly of r.polygons) {
        const next = new Array<number>(poly.length);
        for (let j = 0; j < poly.length; j += 2) {
          const x = poly[j];
          const u = (poly[j + 1] - r.top) / h;
          const b = bandsFor(x);
          next[j] = x;
          if (field.split) next[j + 1] = u <= 0.5 ? warpY(field, 0, u * 2, b) : warpY(field, 1, u * 2 - 1, b);
          else next[j + 1] = warpY(field, ri, u, b);
        }
        out.push(next);
      }
    });
  }
  warped.set(op, out);
  return out;
}

/** Where a line's set-as-text piece is drawn now: moved and stretched up and down as its line is at its middle. */
export function waveTextMap(op: WaveOp, row: number, x: number): { ty: number; sy: number } {
  const r = op.rows[row];
  const b = waveBands(op, x);
  if (!b) return { ty: 0, sy: 1 };
  const field = fieldOf(op);
  const h = r.base - r.top;
  const yAt = (u: number) => (field.split ? (u <= 0.5 ? warpY(field, 0, u * 2, b) : warpY(field, 1, u * 2 - 1, b)) : warpY(field, row, u, b));
  const top = yAt(0);
  const base = yAt(1);
  const sy = (base - top) / h;
  return { ty: top - r.top * sy, sy };
}

/* Played. */

/** The wave ops of a scene, wherever they are drawn (a placement wraps them in a matrix). */
function replaceWaves(ops: Op[], at: (op: WaveOp) => Op): Op[] {
  return ops.map((op) => {
    if (op.kind === "wave") return at(op);
    if (op.kind === "matrix") return { ...op, ops: replaceWaves(op.ops, at) };
    return op;
  });
}

/** A played wave: how long its loop runs, and the scene at a moment of it. */
export interface WavePlay {
  duration: number;
  loops: true;
  frame(t: number): Scene;
}

/**
 * Wave's animation `id`, at `pace` times its own speed: a loop that starts
 * on the still cover, runs the wave on from there to the end of its pass,
 * rests on the plain lockup, and runs the next pass round to the still
 * again. On a cover stopped in another animation it starts from this one's
 * still instead.
 */
export function wavePlay(scene: Scene, id: WaveVariantId, pace: number): WavePlay {
  const v = waveVariant(id);
  const loop = v.pass + v.hold;
  const start = v.still * v.pass;
  const mine = (op: WaveOp) => op.at?.variant === id && Math.abs(op.at.s - v.still) < 1e-12;
  return {
    duration: loop / pace,
    loops: true,
    frame(t: number): Scene {
      const tau = (((Math.max(0, t) * pace + start) % loop) + loop) % loop;
      const onStill = Math.abs(tau - start) < 1e-9 || Math.abs(tau - start - loop) < 1e-9;
      const at: WaveMoment | null = tau < v.pass ? { variant: id, s: tau / v.pass } : null;
      let same = true;
      const ops = replaceWaves(scene.ops, (op) => {
        if (onStill && mine(op)) return op;
        same = false;
        return { ...op, at: onStill ? stillOf(id) : at };
      });
      return same ? scene : { ...scene, ops };
    },
  };
}
