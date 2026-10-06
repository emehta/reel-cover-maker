/**
 * The single-line fonts the liquid styles are drawn from, and the glyph for
 * a character, with the fallbacks a typed title needs.
 *
 * Each font covers ASCII and Latin-1. A phone types the curly apostrophe and
 * quotes, which are mapped to the straight ones; a letter beyond Latin-1
 * ("Ł", "ő") is drawn as its base letter. Anything still missing (an emoji)
 * has no strokes, and the style draws it as plain text instead, so nothing
 * typed is ever lost.
 */

import { DRIP } from "@/components/reel-cover-maker/strokes/drip";
import { GOO } from "@/components/reel-cover-maker/strokes/goo";
import type { StrokeFontData } from "@/components/reel-cover-maker/strokes/types";

export type StrokeFontId = "drip" | "goo";

export const STROKE_FONTS: Record<StrokeFontId, StrokeFontData> = {
  drip: DRIP,
  goo: GOO,
};

export interface StrokeGlyph {
  /** In em. */
  advance: number;
  /** Polylines in em, y down from the baseline. */
  strokes: number[][];
}

/** Characters a phone types that the fonts know by another code point. */
const SUBSTITUTES: Record<string, string> = {
  "\u2018": "'",
  "\u2019": "'",
  "\u201a": ",",
  "\u2032": "'",
  "\u2033": '"',
  "\u02bc": "'",
  "\u2010": "-",
  "\u2011": "-",
  "\u2012": "-",
  "\u2013": "-",
  "\u2014": "-",
  "\u2212": "-",
  "\u2026": "...",
  "\u00a0": " ",
  // Letters with no decomposition to a base letter.
  "\u0141": "L",
  "\u0142": "l",
  "\u0110": "D",
  "\u0111": "d",
  "\u0131": "i",
  "\u0152": "OE",
  "\u0153": "oe",
  "\u00c6": "AE",
  "\u00e6": "ae",
  "\u1e9e": "SS",
};

const cache = new Map<string, StrokeGlyph | null>();

function lookup(font: StrokeFontData, character: string): StrokeGlyph | null {
  const entry = font.glyphs[character];
  if (!entry) return null;
  const [advance, strokes] = entry;
  return {
    advance: advance / font.upm,
    strokes: strokes.map((s) => s.map((v) => v / font.upm)),
  };
}

/**
 * The glyphs that draw `character` in `font`: usually one, several for a
 * substitute like "..." or "Æ", none if nothing in the font can draw it.
 */
export function strokeGlyphs(fontId: StrokeFontId, character: string): StrokeGlyph[] {
  const font = STROKE_FONTS[fontId];
  const direct = glyphOf(font, character);
  if (direct) return [direct];
  const substitute = SUBSTITUTES[character];
  if (substitute) {
    const parts = [...substitute].map((c) => glyphOf(font, c));
    return parts.every(Boolean) ? (parts as StrokeGlyph[]) : [];
  }
  // A letter with an accent this font lacks: the letter itself.
  const base = character.normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (base && base !== character) {
    const parts = [...base].map((c) => glyphOf(font, c));
    if (parts.every(Boolean)) return parts as StrokeGlyph[];
  }
  return [];
}

function glyphOf(font: StrokeFontData, character: string): StrokeGlyph | null {
  const key = `${font.id}\u0000${character}`;
  if (!cache.has(key)) cache.set(key, lookup(font, character));
  return cache.get(key) ?? null;
}

export interface StrokeMetrics {
  /** Height of a capital, of a lowercase x, of the tallest ascender or accent, and the deepest descender, in em. */
  cap: number;
  xHeight: number;
  ascent: number;
  descent: number;
  /** The space's advance, in em. */
  space: number;
}

const metricsCache = new Map<StrokeFontId, StrokeMetrics>();

function extent(glyph: StrokeGlyph | null, pick: (ys: number[]) => number): number {
  if (!glyph) return 0;
  const ys = glyph.strokes.flatMap((s) => s.filter((_, i) => i % 2 === 1));
  return ys.length ? pick(ys) : 0;
}

/** Measured from the glyphs themselves: the fonts' own metadata gives the same numbers for every font. */
export function strokeMetrics(fontId: StrokeFontId): StrokeMetrics {
  let m = metricsCache.get(fontId);
  if (!m) {
    const font = STROKE_FONTS[fontId];
    m = {
      cap: -extent(glyphOf(font, "H"), (ys) => Math.min(...ys)),
      xHeight: -extent(glyphOf(font, "x"), (ys) => Math.min(...ys)),
      ascent: Math.max(...[..."bdhklfÁÉÍÓÚÅ"].map((c) => -extent(glyphOf(font, c), (ys) => Math.min(...ys)))),
      descent: Math.max(...[..."gjpqy"].map((c) => extent(glyphOf(font, c), (ys) => Math.max(...ys)))),
      space: glyphOf(font, " ")?.advance ?? 0.3,
    };
    metricsCache.set(fontId, m);
  }
  return m;
}

/** The ink box of a glyph's centre lines, in em. */
export function glyphBox(glyph: StrokeGlyph): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const stroke of glyph.strokes) {
    for (let i = 0; i < stroke.length; i += 2) {
      x0 = Math.min(x0, stroke[i]);
      x1 = Math.max(x1, stroke[i]);
      y0 = Math.min(y0, stroke[i + 1]);
      y1 = Math.max(y1, stroke[i + 1]);
    }
  }
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : { x0: 0, y0: 0, x1: 0, y1: 0 };
}
