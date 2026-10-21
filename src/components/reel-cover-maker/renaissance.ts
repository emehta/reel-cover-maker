/**
 * Renaissance (the owner's ask, 20 Oct, after three posters: "THE ART of
 * SUMMERTIME", "FIND Your NICHE", "TRAVEL The WORLD"): plain words set in
 * tall capitals, stacked tight and centred, and a word made bold set in a
 * script laid across the join between two lines of them, overlapping both
 * and cutting into them, so the whole reads as one lockup, as a logo does.
 *
 * Each look is one poster's pairing, capitals and script matched in weight
 * (the owner, 20 Oct: matched looks, never two free lists, after a thin
 * script on heavy capitals looked wrong). What the posters share, measured
 * on them:
 *
 * - Capitals' lines a tenth of a cap height apart; where a script sits
 *   between two, as far apart as keeps the capitals reading: a narrow
 *   script (the first poster's of, a fifth of the lines' width) reaching
 *   about three fifths of a cap height into each, a wide one (the third's
 *   The, nine tenths) about a fifth.
 * - The script centred on the lines and on the join, its baseline rising a
 *   few degrees; about one and a third cap heights tall at most, its small
 *   letters never past half a cap height, never wider than nine tenths of
 *   the lines beside it.
 * - In the capitals' own colour (the first and third) it cuts a thin gap
 *   round its strokes, a twentieth of a cap height; in another colour (the
 *   second, black over red) its whole shape is taken out of them, its loops
 *   and the space its swashes sweep round closed, with that margin round it.
 * - At either end of the lockup (no join to lie across) it tucks lightly
 *   under the last line, or over the first (the owner's pick, 20 Oct).
 *
 * With no word bold, the linking word nearest the title's middle (of, the,
 * your, and...) is the script, never its first or last word, so "the art of
 * summertime" is set as the first poster was without a star typed.
 *
 * Pure: the tests run it.
 */

import type { CapsFaceId, FaceId, Measurer, ScriptFaceId } from "@/components/reel-cover-maker/faces";
import type { Rect } from "@/components/reel-cover-maker/formats";
import { silhouetteOf, type Loop } from "@/components/reel-cover-maker/ink";
import { between, hashString, mixSeed, random } from "@/components/reel-cover-maker/noise";
import type { Op, Wrap, WrapRef } from "@/components/reel-cover-maker/scene";
import { graphemes, type Paragraph } from "@/components/reel-cover-maker/title";

export type RenaissanceLookId = "summertime" | "niche" | "travel";

export interface RenaissanceLook {
  id: RenaissanceLookId;
  name: string;
  caps: CapsFaceId;
  /** The capitals drawn this share of their face's width: the posters' are narrower than any open face. */
  squeeze: number;
  script: ScriptFaceId;
  /** Ink added round the script's strokes, in em of its size. */
  weight: number;
  /** A broad pen's weight added to the script, in em of its size: its downstrokes thickened, its hairlines kept. */
  nib: number;
  /** The script's colour a look starts on: the capitals' own, or black, as the second poster's is. */
  scriptMode: "auto" | "black";
}

/**
 * The looks, one a poster, the owner's picks of 20 Oct from previews of each
 * against its poster: Playfair Display SC with Luxurious Script for "THE
 * ART of SUMMERTIME", Anton with Pinyon Script for "FIND Your NICHE", Big
 * Shoulders with Luxurious Script for "TRAVEL The WORLD" (chosen from every
 * script Google Fonts has, set as of, Your and The beside the posters).
 * Each face is squeezed so the poster's own word is its width (SUMMERTIME
 * 5.84 cap heights, FIND 1.9, TRAVEL 2.56); each script given a broad pen's
 * weight, so its downstrokes come up to its capitals' and its hairlines
 * stay hairlines.
 */
export const RENAISSANCE_LOOKS: readonly RenaissanceLook[] = [
  { id: "summertime", name: "Summertime", caps: "caps-playfairsc", squeeze: 0.59, script: "script-luxurious", weight: 0.006, nib: 0.035, scriptMode: "auto" },
  { id: "niche", name: "Niche", caps: "caps-anton", squeeze: 1.05, script: "script", weight: 0.004, nib: 0.006, scriptMode: "black" },
  { id: "travel", name: "Travel", caps: "caps-bigshoulders", squeeze: 0.8, script: "script-luxurious", weight: 0.006, nib: 0.03, scriptMode: "auto" },
];

export const DEFAULT_RENAISSANCE_LOOK: RenaissanceLookId = "summertime";

export function isRenaissanceLookId(value: unknown): value is RenaissanceLookId {
  return RENAISSANCE_LOOKS.some((l) => l.id === value);
}

export function lookOf(id: RenaissanceLookId): RenaissanceLook {
  return RENAISSANCE_LOOKS.find((l) => l.id === id) ?? RENAISSANCE_LOOKS[0];
}

/** The faces a Renaissance cover is set in, to load: its capitals and its script. */
export function renaissanceFaces(look: RenaissanceLookId): FaceId[] {
  const { caps, script } = lookOf(look);
  return script === "script" ? [caps] : [caps, script];
}

/** The little words a script is set in when none is made bold: articles, prepositions, possessives, a joining and. */
const LINKING = new Set(["of", "the", "your", "my", "our", "his", "her", "their", "its", "and", "&", "in", "on", "to", "for", "a", "an", "with", "at", "by", "from", "into", "or", "is", "vs", "x", "de", "la", "le", "el", "du", "des", "et", "y", "und", "von", "van"]);

/** The plain text of a word, its segments joined. */
const wordText = (word: Paragraph[number]) => word.map((s) => s.text).join("");

/**
 * Which of a title's words are set in script: every word made bold (any part
 * of it), or with none bold, the linking word nearest the title's middle,
 * never its first word or its last.
 */
export function scriptWords(paragraphs: Paragraph[]): boolean[][] {
  const marked = paragraphs.map((p) => p.map((w) => w.some((s) => s.emphasis)));
  if (marked.some((p) => p.some(Boolean))) return marked;
  const all = paragraphs.flatMap((p, pi) => p.map((w, wi) => ({ pi, wi, text: wordText(w).toLocaleLowerCase().replace(/[.,!?:;]+$/u, "") })));
  const middle = (all.length - 1) / 2;
  let best = -1;
  all.forEach((w, i) => {
    if (i === 0 || i === all.length - 1 || !LINKING.has(w.text)) return;
    if (best < 0 || Math.abs(i - middle) < Math.abs(best - middle)) best = i;
  });
  if (best >= 0) marked[all[best].pi][all[best].wi] = true;
  return marked;
}

/** A run of capitals (its words, to be wrapped into lines) or a script phrase, in the order they are read. */
export type Unit = { kind: "caps"; words: string[] } | { kind: "script"; text: string };

/**
 * The title as runs of capitals and script phrases: script words next to
 * each other in a line are one phrase; a typed line break ends a run of
 * capitals, as it ends a line.
 */
export function unitsOf(paragraphs: Paragraph[], script: boolean[][]): Unit[] {
  const out: Unit[] = [];
  paragraphs.forEach((p, pi) => {
    let caps: string[] = [];
    let phrase: string[] = [];
    const closeCaps = () => {
      if (caps.length) out.push({ kind: "caps", words: caps });
      caps = [];
    };
    const closePhrase = () => {
      if (phrase.length) out.push({ kind: "script", text: phrase.join(" ") });
      phrase = [];
    };
    p.forEach((w, wi) => {
      if (script[pi][wi]) {
        closeCaps();
        phrase.push(wordText(w));
      } else {
        closePhrase();
        caps.push(wordText(w).toLocaleUpperCase());
      }
    });
    closeCaps();
    closePhrase();
  });
  return out;
}

/** The largest and smallest capitals, in pixels to the em. */
const CAPS_MAX = 480;
const CAPS_MIN = 22;

/** The least share of their size the capitals give up to be set in a line fewer, measured once from the largest that fits. */
const FEWER_LINES = 0.8;

/** The gap between lines of capitals, in cap heights; and the least where a script sits between. */
const GAP_IN = 0.1;
const GAP_JOIN = 0.1;

/**
 * The script's size: its small letters a little over half a cap height
 * (the poster's of), its whole height at most one and a half, its width at
 * most nine tenths of the widest line beside it; and at least about a
 * quarter of that line's width (the poster's of covers a fifth to a
 * quarter), its small letters then up to three quarters of a cap height.
 */
const SCRIPT_TALL = 1.5;
const SCRIPT_X = 0.56;
const SCRIPT_X_MOST = 0.74;
const SCRIPT_WIDE = 0.9;
const SCRIPT_COVER = 0.28;

/**
 * How far a script at a join reaches into each line, in cap heights: deep
 * for a narrow one (the first poster's of), lightly for a wide one (the
 * third's The), between as it covers more of the lines.
 */
const REACH_NARROW = 0.86;
const REACH_WIDE = 0.22;
const COVER_NARROW = 0.25;
const COVER_WIDE = 0.65;

/** How far a script at either end of the lockup reaches into the line it hangs from, in cap heights: lightly. */
const END_REACH = 0.32;

/** The gap a script cuts round itself in the capitals, in cap heights; and how wide a gap in its shape is closed when it takes its whole shape out, in em of its size. */
export const KNOCK = 0.05;
const CLOSE = 0.14;

/** How far a script's baseline rises, in radians, at most and at least. */
const RISE = [-0.06, -0.02] as const;

interface CapsLine {
  text: string;
  unit: number;
  /** Its start on its baseline, in the frame the lockup is laid out in. */
  x: number;
  baseline: number;
  width: number;
  ink: Rect;
}

interface ScriptSet {
  text: string;
  size: number;
  x: number;
  baseline: number;
  angle: number;
  cx: number;
  cy: number;
  ink: Rect;
}

function union(rects: Rect[]): Rect {
  const left = Math.min(...rects.map((r) => r.x));
  const top = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.w));
  const bottom = Math.max(...rects.map((r) => r.y + r.h));
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/** The smallest upright box holding `rect` turned by `angle` about (cx, cy). */
function turned(rect: Rect, cx: number, cy: number, angle: number): Rect {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const pts = [
    [rect.x, rect.y],
    [rect.x + rect.w, rect.y],
    [rect.x, rect.y + rect.h],
    [rect.x + rect.w, rect.y + rect.h],
  ].map(([x, y]) => [cx + (x - cx) * cos - (y - cy) * sin, cy + (x - cx) * sin + (y - cy) * cos]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

/** Words wrapped at `max`, as many lines as greedy wrapping makes and as even as they go; null if a word alone is wider. */
function wrapEven(widths: number[], space: number, max: number): number[][] | null {
  const greedy = (limit: number): number[][] | null => {
    const lines: number[][] = [];
    let line: number[] = [];
    let width = 0;
    for (let i = 0; i < widths.length; i += 1) {
      if (widths[i] > limit) return null;
      if (line.length && width + space + widths[i] <= limit) {
        line.push(i);
        width += space + widths[i];
      } else {
        if (line.length) lines.push(line);
        line = [i];
        width = widths[i];
      }
    }
    if (line.length) lines.push(line);
    return lines;
  };
  const first = greedy(max);
  if (!first || first.length < 2) return first;
  let lo = Math.max(...widths);
  let hi = max;
  for (let k = 0; k < 20; k += 1) {
    const mid = (lo + hi) / 2;
    const lines = greedy(mid);
    if (lines && lines.length <= first.length) hi = mid;
    else lo = mid;
  }
  return greedy(hi) ?? first;
}

/** A word too wide for any line, cut between letters into pieces at most `max` wide at `size`, squeezed by `sx`. */
function breakWide(word: string, face: FaceId, size: number, sx: number, max: number, measurer: Measurer): string[] {
  const out: string[] = [];
  let piece = "";
  for (const g of graphemes(word)) {
    if (piece && measurer.width(face, piece + g) * size * sx > max) {
      out.push(piece);
      piece = "";
    }
    piece += g;
  }
  if (piece) out.push(piece);
  return out;
}

/** An outline with copies of itself across to `nib` em right, as a broad pen sweeps it: the same object for the same outline and nib. */
const nibbedOutlines = new WeakMap<readonly Loop[], Map<number, Loop[]>>();
function nibbed(outline: readonly Loop[], nib: number): readonly Loop[] {
  if (nib <= 0) return outline;
  let byNib = nibbedOutlines.get(outline);
  if (!byNib) {
    byNib = new Map();
    nibbedOutlines.set(outline, byNib);
  }
  let made = byNib.get(nib);
  if (!made) {
    const copies = 4;
    made = [];
    for (let i = 0; i <= copies; i += 1) {
      const dx = (nib * i) / copies;
      for (const loop of outline) made.push(loop.map((v, k) => (k % 2 ? v : v + dx)));
    }
    byNib.set(nib, made);
  }
  return made;
}

export interface RenaissanceSpec {
  look: RenaissanceLookId;
  /** The capitals' colour, and the script's: null for the same, when it cuts a thin gap round its strokes. */
  ink: string;
  script: string | null;
  seed: number;
  /** Set as a text box: its lines wrapped to a width at the size it chose (the owner's ask, 21 Oct). */
  wrap?: Wrap | null;
}

/** A Renaissance cover's lettering, laid out in the safe area: the ops (one knockout group) and the box they ink. */
export function renaissance(paragraphs: Paragraph[], safe: Rect, measurer: Measurer, spec: RenaissanceSpec): { ops: Op[]; readable: Rect; ref?: WrapRef; wrapped?: { width: number; min: number } } {
  const look = lookOf(spec.look);
  const face = look.caps;
  const scriptFace = look.script;
  const sx = look.squeeze;
  let units = unitsOf(paragraphs, scriptWords(paragraphs));
  if (!units.length) return { ops: [], readable: { x: safe.x + safe.w / 2, y: safe.y + safe.h / 2, w: 0, h: 0 } };
  // A title in script alone has no lines to wrap: no text box, its sides scale it.
  const allScriptTitle = units.every((u) => u.kind === "script");
  const wrap = allScriptTitle ? null : (spec.wrap ?? null);
  // As a text box, its capitals' lines wrapped to the box at the size they
  // were and its scripts at theirs, whatever that comes to (the owner, 21
  // Oct: as in Illustrator, the letters never change size and the box runs
  // as far as it is pulled, past the cover's edge too); never narrower than
  // a word a line. Its lines are measured by their advance, wider than the
  // ink the box is round: by as much as they were.
  const widestWord = wrap ? Math.max(1, ...units.flatMap((u) => (u.kind === "caps" ? u.words.map((w) => measurer.width(face, w) * wrap.ref.size * sx + 0.5) : []))) : 0;
  const slack = wrap ? (wrap.ref.slack ?? 0) : 0;
  let lineMax = safe.w;
  const cap = measurer.metrics(face).cap;
  const xHeight = Math.max(0.2, measurer.bounds(scriptFace, "x").ascent);
  const space = measurer.width(face, " ") * sx;
  const sameColour = spec.script === null;
  const allScript = allScriptTitle;

  /** The lockup at capitals `size`, laid out about x = 0 from y = 0; null if a word of its capitals will not fit a line. */
  const lay = (size: number, us: Unit[] = units) => {
    const C = cap * size;
    // The capitals' lines first, as text and width, so each script can be sized by the lines beside it before anything is stacked.
    const wrapped: { text: string; width: number }[][] = [];
    for (const unit of us) {
      if (unit.kind === "script") {
        wrapped.push([]);
        continue;
      }
      const widths = unit.words.map((w) => measurer.width(face, w) * size * sx);
      const lines = wrapEven(widths, space * size, lineMax);
      if (!lines) return null;
      wrapped.push(
        lines.map((indices) => {
          const text = indices.map((i) => unit.words[i]).join(" ");
          return { text, width: measurer.width(face, text) * size * sx };
        }),
      );
    }
    const widest = (ui: number) => Math.max(0, ...(wrapped[ui] ?? []).map((l) => l.width));
    // Each script's size and the room it asks of its join.
    // As a text box, each script the size it was, as long as the lines beside it still hold it.
    const held = wrap?.ref.scripts && wrap.ref.scripts.length === us.filter((u) => u.kind === "script").length ? wrap.ref.scripts : null;
    const scriptIndex = us.map((_, ui) => us.slice(0, ui).filter((u) => u.kind === "script").length);
    const sized = us.map((unit, ui) => {
      if (unit.kind !== "script") return null;
      const runAbove = ui > 0 && us[ui - 1].kind === "caps" ? wrapped[ui - 1] : [];
      const runBelow = ui + 1 < us.length && us[ui + 1].kind === "caps" ? wrapped[ui + 1] : [];
      const b = measurer.bounds(scriptFace, unit.text);
      const wide = Math.max(1e-6, b.left + b.right + look.weight + look.nib);
      const tall = Math.max(1e-6, b.ascent + b.descent + look.weight);
      if (allScript) {
        const s = Math.min(lineMax / wide, (SCRIPT_TALL * 2.4 * C) / tall);
        return { b, s, h: tall * s, beside: lineMax, joins: false };
      }
      const joins = runAbove.length > 0 && runBelow.length > 0;
      const beside = (joins ? Math.max(runAbove[runAbove.length - 1].width, runBelow[0].width) : Math.max(widest(ui - 1), widest(ui + 1))) || lineMax * 0.86;
      // By its small letters, as the poster's of; a short word with no tall letters (to, in, art) made up to cover a little more of its lines, its small letters never past three quarters of a cap height.
      const byX = (SCRIPT_X * C) / xHeight;
      const own = Math.min((SCRIPT_TALL * C) / tall, (SCRIPT_WIDE * beside) / wide, Math.max(byX, Math.min((SCRIPT_COVER * beside) / wide, (SCRIPT_X_MOST * C) / xHeight)));
      const s = held ? held[scriptIndex[ui]] : own;
      return { b, s, h: tall * s, beside, joins };
    });

    // Then stacked: a join opens as far as keeps the script's reach into each line to what its width allows.
    const lines: CapsLine[] = [];
    const linesOf: CapsLine[][] = us.map(() => []);
    let y = 0;
    let started = false;
    let join = 0;
    /** The foot of the last line's ink, accents and tails included. */
    let foot = -Infinity;
    for (const [ui, unit] of us.entries()) {
      if (unit.kind === "script") {
        const z = sized[ui];
        if (z && z.joins) {
          const cover = Math.min(1, (z.s * (z.b.left + z.b.right)) / Math.max(1, z.beside));
          const t = Math.min(1, Math.max(0, (cover - COVER_NARROW) / (COVER_WIDE - COVER_NARROW)));
          const reach = (REACH_NARROW + (REACH_WIDE - REACH_NARROW) * t) * C;
          join = Math.max(join, GAP_JOIN * C, z.h - 2 * reach);
        }
        continue;
      }
      for (const { text, width } of wrapped[ui]) {
        if (started) y += join || GAP_IN * C;
        join = 0;
        started = true;
        const b = measurer.bounds(face, text);
        // Centred by its ink.
        const inkW = (b.left + b.right) * size * sx;
        const left = -inkW / 2;
        // Its capitals a set gap under the line above, and its ink (an accent over it, a tail under the line above) never nearer than that.
        const baseline = Math.max(y + C, foot + GAP_IN * C + b.ascent * size);
        foot = baseline + b.descent * size;
        const line: CapsLine = { text, unit: ui, x: left + b.left * size * sx, baseline, width, ink: { x: left, y: baseline - b.ascent * size, w: inkW, h: (b.ascent + b.descent) * size } };
        lines.push(line);
        linesOf[ui].push(line);
        y = baseline;
      }
    }

    // Each script centred across the join it falls at, tucked over the first line or under the last, or stacked under the script before it.
    const sets: ScriptSet[] = [];
    let previous: ScriptSet | null = null;
    for (const [ui, unit] of us.entries()) {
      const z = sized[ui];
      if (unit.kind !== "script" || !z) {
        previous = null;
        continue;
      }
      const runAbove = ui > 0 && us[ui - 1].kind === "caps" ? linesOf[ui - 1] : [];
      const runBelow = ui + 1 < us.length && us[ui + 1].kind === "caps" ? linesOf[ui + 1] : [];
      const above = runAbove[runAbove.length - 1] ?? null;
      const below = runBelow[0] ?? null;
      const { b, s, h } = z;
      const next = random(mixSeed(spec.seed, hashString(unit.text, 0x7e7a)));
      const angle = between(next, RISE[0], RISE[1]);
      const middle = above && below ? (above.baseline + below.baseline - C) / 2 : below ? below.baseline - C + END_REACH * C - h / 2 : above ? above.baseline - END_REACH * C + h / 2 : previous ? previous.ink.y + previous.ink.h + h * 0.4 : h / 2;
      const baseline = middle + ((b.ascent - b.descent) * s) / 2;
      const w = (b.left + b.right + look.nib) * s;
      const x = -w / 2 + b.left * s;
      const pad = (look.weight * s) / 2;
      const ink: Rect = { x: x - b.left * s - pad, y: baseline - b.ascent * s - pad, w: w + 2 * pad, h: (b.ascent + b.descent) * s + 2 * pad };
      const set: ScriptSet = { text: unit.text, size: s, x, baseline, angle, cx: ink.x + ink.w / 2, cy: ink.y + ink.h / 2, ink };
      sets.push(set);
      previous = set;
    }
    const knock = KNOCK * C;
    const rects = [...lines.map((l) => l.ink), ...sets.map((st) => turned({ x: st.ink.x - knock, y: st.ink.y - knock, w: st.ink.w + 2 * knock, h: st.ink.h + 2 * knock }, st.cx, st.cy, st.angle))];
    return { lines, sets, bounds: union(rects), C };
  };

  // As a text box: the narrowest it goes is its words a line, each script as it was; then its lines run as wide as the box.
  let narrowest = 0;
  let wrapWidth = 0;
  if (wrap) {
    lineMax = widestWord;
    narrowest = Math.max(1, lay(wrap.ref.size)?.bounds.w ?? widestWord - slack);
    wrapWidth = Math.max(wrap.width, narrowest);
    lineMax = Math.max(widestWord, wrapWidth + slack);
  }

  const fits = (size: number, us: Unit[] = units) => {
    const made = lay(size, us);
    return !!made && made.bounds.w <= safe.w + 1e-6 && made.bounds.h <= safe.h + 1e-6;
  };

  // A word too wide for a line even at the smallest capitals is cut into pieces, at the largest capitals whose pieces fit.
  if (!wrap && !lay(CAPS_MIN)) {
    const brokenAt = (size: number): Unit[] => units.map((u) => (u.kind === "caps" ? { kind: "caps", words: u.words.flatMap((w) => breakWide(w, face, size, sx, safe.w, measurer)) } : u));
    let lo = CAPS_MIN;
    let hi = CAPS_MAX;
    for (let i = 0; i < 24; i += 1) {
      const mid = (lo + hi) / 2;
      if (fits(mid, brokenAt(mid))) lo = mid;
      else hi = mid;
    }
    units = brokenAt(lo);
  }
  /** The largest capitals at or under `top` at which the lockup fits and `ok` holds of it. */
  const largest = (top: number, ok: (size: number) => boolean) => {
    let lo = CAPS_MIN;
    let hi = top;
    if (fits(hi) && ok(hi)) return hi;
    for (let i = 0; i < 26; i += 1) {
      const mid = (lo + hi) / 2;
      if (fits(mid) && ok(mid)) lo = mid;
      else hi = mid;
    }
    return lo;
  };
  const lineCount = (size: number) => lay(size)?.lines.length ?? Infinity;
  let lo = wrap ? wrap.ref.size : largest(CAPS_MAX, () => true);
  // Fewer lines read better than one more word broken off by itself ("GOLDEN / HOUR / IN"), if together they cost the capitals less than a fifth of their size; as a text box, the size is held.
  const floor = lo * FEWER_LINES;
  for (; !wrap; ) {
    const n = lineCount(lo);
    if (n < 2) break;
    const fewer = largest(lo, (size) => lineCount(size) < n);
    if (lineCount(fewer) >= n || fewer < floor) break;
    lo = fewer;
  }
  const made = lay(lo) ?? lay(CAPS_MIN);
  if (!made) return { ops: [], readable: { x: safe.x + safe.w / 2, y: safe.y + safe.h / 2, w: 0, h: 0 } };

  // Centred in the safe area by its ink, and made smaller if, at the smallest capitals, it is still too much; as a text box, as it is.
  const k = wrap ? 1 : Math.min(1, safe.w / Math.max(1, made.bounds.w), safe.h / Math.max(1, made.bounds.h));
  const ox = made.bounds.x + made.bounds.w / 2;
  const oy = made.bounds.y + made.bounds.h / 2;
  const tx = safe.x + safe.w / 2;
  const ty = safe.y + safe.h / 2;
  const X = (x: number) => tx + (x - ox) * k;
  const Y = (y: number) => ty + (y - oy) * k;
  const size = lo * k;
  const knock = KNOCK * made.C * k;
  const scriptInk = spec.script ?? spec.ink;
  const ops: Op[] = [
    ...made.lines.map((l): Op => ({ kind: "text", text: l.text, face, size, x: X(l.x), y: Y(l.baseline), color: spec.ink, ...(sx !== 1 ? { sx } : {}) })),
    ...made.sets.map((st): Op => {
      const s = st.size * k;
      const bold = look.weight * s;
      const nib = look.nib * s;
      // In another colour, its whole shape taken out of the capitals, with the gap round it; traced from the face's own ink where the page can, the pen's sweep across included.
      const outline = !sameColour && measurer.outline ? measurer.outline(scriptFace, st.text) : null;
      const shape = outline && outline.length ? silhouetteOf(nibbed(outline, look.nib), CLOSE, (knock + bold / 2) / s) : null;
      const knockShape = shape?.map((loop) => loop.map((v, i) => (i % 2 ? Y(st.baseline) + v * s : X(st.x) + v * s)));
      return {
        kind: "turn",
        cx: X(st.cx),
        cy: Y(st.cy),
        angle: st.angle,
        ops: [{ kind: "text", text: st.text, face: scriptFace, size: s, x: X(st.x), y: Y(st.baseline), color: scriptInk, knock, ...(bold > 0 ? { bold } : {}), ...(nib > 0 ? { nib } : {}), ...(knockShape && knockShape.length ? { knockShape } : {}) }],
      };
    }),
  ];
  const b = made.bounds;
  const readable = { x: X(b.x), y: Y(b.y), w: b.w * k, h: b.h * k };
  const advance = Math.max(0, ...made.lines.map((l) => l.width)) * k;
  const scripts = made.sets.map((st) => st.size * k);
  const result = wrap ? { wrapped: { width: wrapWidth, min: narrowest } } : allScriptTitle ? {} : { ref: { size, width: readable.w, slack: Math.max(0, advance - readable.w) + 1, scripts } };
  return { ops: [{ kind: "knockout", ops }], readable, ...result };
}
