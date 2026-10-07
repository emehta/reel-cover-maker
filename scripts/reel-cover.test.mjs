/**
 * Reel Cover Maker, checked with no browser. `npm test`.
 *
 * What is wrong here leaves no error on screen: a word that falls outside the
 * part of the cover the profile grid shows, a line that is quietly dropped, a
 * colour pairing Instagram's encoder smears, a file Instagram shrinks, a
 * liquid letter that runs into its neighbour. So every style is set over
 * hundreds of titles in every size, against a measurer that stands in for
 * the canvas, every word is held to the safe area and counted back, and the
 * paste is checked from its geometry to its pixels.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const F = await import("@/components/reel-cover-maker/formats");
const T = await import("@/components/reel-cover-maker/title");
const L = await import("@/components/reel-cover-maker/layout");
const S = await import("@/components/reel-cover-maker/scene");
const P = await import("@/components/reel-cover-maker/palettes");
const C = await import("@/components/reel-cover-maker/colour");
const FACES = await import("@/components/reel-cover-maker/faces");
const D = await import("@/components/reel-cover-maker/design");
const V = await import("@/components/reel-cover-maker/save");
const G = await import("@/components/reel-cover-maker/grain");
const { paint } = await import("@/components/reel-cover-maker/paint");
const ST = await import("@/components/reel-cover-maker/strokes");
const LQ = await import("@/components/reel-cover-maker/liquid");
const LR = await import("@/components/reel-cover-maker/liquid-render");
const LL = await import("@/components/reel-cover-maker/liquid-layout");
const SP = await import("@/components/reel-cover-maker/stepped");
const PH = await import("@/components/reel-cover-maker/photo");
const PHONE = await import("@/components/reel-cover-maker/phone");
const PL = await import("@/components/reel-cover-maker/place");
const H = await import("@/components/reel-cover-maker/history");
const N = await import("@/components/reel-cover-maker/noise");
const { createFontGate } = await import("@/components/reel-cover-maker/font-gate");
const { prepaintScript } = await import("@/components/reel-cover-maker/theme");

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
};

const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

/* A measurer that stands in for the canvas: every face has its own widths, wide letters are wide. */

const FACE_WIDTH = {
  serif: 0.44,
  "serif-italic": 0.41,
  condensed: 0.36,
  sans: 0.52,
  "sans-heavy": 0.58,
  wide: 0.8,
  mono: 0.6,
  "mono-bold": 0.6,
  // Stickery's plain faces, each its own width, and its funky scripts, wide and tall.
  "plain-outfit": 0.49,
  "plain-jost": 0.47,
  "plain-fraunces": 0.48,
  "plain-newsreader": 0.45,
  "plain-sofia": 0.38,
  "plain-archivo": 0.42,
  "plain-crimson": 0.43,
  "plain-caslon": 0.5,
  "funky-yesteryear": 0.46,
  "funky-damion": 0.48,
  "funky-leckerli": 0.62,
};
const FACE_METRICS = {
  serif: { cap: 0.66, ascent: 0.92, descent: 0.24 },
  "serif-italic": { cap: 0.66, ascent: 0.93, descent: 0.25 },
  condensed: { cap: 0.73, ascent: 0.98, descent: 0.18 },
  sans: { cap: 0.73, ascent: 0.97, descent: 0.22 },
  "sans-heavy": { cap: 0.73, ascent: 0.98, descent: 0.22 },
  wide: { cap: 0.72, ascent: 0.96, descent: 0.2 },
  mono: { cap: 0.68, ascent: 0.9, descent: 0.26 },
  "mono-bold": { cap: 0.68, ascent: 0.99, descent: 0.26 },
  "plain-outfit": { cap: 0.7, ascent: 0.95, descent: 0.2 },
  "plain-jost": { cap: 0.7, ascent: 0.98, descent: 0.25 },
  "plain-fraunces": { cap: 0.7, ascent: 0.96, descent: 0.25 },
  "plain-newsreader": { cap: 0.67, ascent: 0.94, descent: 0.25 },
  "plain-sofia": { cap: 0.72, ascent: 0.97, descent: 0.22 },
  "plain-archivo": { cap: 0.72, ascent: 0.97, descent: 0.21 },
  "plain-crimson": { cap: 0.62, ascent: 0.9, descent: 0.24 },
  "plain-caslon": { cap: 0.68, ascent: 0.95, descent: 0.26 },
  "funky-yesteryear": { cap: 0.72, ascent: 1.0, descent: 0.3 },
  "funky-damion": { cap: 0.72, ascent: 1.0, descent: 0.3 },
  "funky-leckerli": { cap: 0.7, ascent: 0.98, descent: 0.26 },
};

const liquidOf = (scene) => scene.ops.find((op) => op.kind === "liquid");

/** Every text op, those inside a turn too, in drawing order. */
function textOps(scene) {
  const out = [];
  const walk = (ops) => {
    for (const op of ops) {
      if (op.kind === "turn") walk(op.ops);
      else if (op.kind === "text") out.push(op);
    }
  };
  walk(scene.ops);
  return out;
}

function charWidth(face, ch) {
  const base = FACE_WIDTH[face];
  if (face.startsWith("mono")) return /\p{Extended_Pictographic}/u.test(ch) ? 1.2 : base;
  if (ch === " ") return base * 0.55;
  if (/[mwMW@]/.test(ch)) return base * 1.55;
  if (/[il.,'!|:;jt]/.test(ch)) return base * 0.5;
  if (/\p{Lu}/u.test(ch)) return base * 1.25;
  if (/\p{Extended_Pictographic}/u.test(ch)) return 1.2;
  return base;
}

const advance = (face, text) => T.graphemes(text).reduce((sum, g) => sum + charWidth(face, g), 0);

/*
 * Ink past the advance, as real faces have it: an italic leans out on both
 * sides, an accented first letter reaches left (Anton's wide accents do), and
 * an emoji overhangs its advance on the right.
 */
/** Each letter's ink as the stand-in sees it: its advance across, an ascender or a capital's height up, a descender down. */
function letterInk(face, ch) {
  const m = FACE_METRICS[face];
  const tall = /[bdfhklt\p{Lu}0-9\u0300-\u036f]/u.test(ch.normalize("NFD")) || /\p{Extended_Pictographic}/u.test(ch);
  const small = /[a-z]/.test(ch) && !tall;
  return { top: -(small ? m.cap * 0.68 : tall && /[a-z]/.test(ch) ? m.ascent : m.cap), bottom: /[gjpqyQ,;]/u.test(ch) ? m.descent : 0 };
}

const measurer = {
  width: advance,
  // Ink in slices a twenty-fifth of an em wide, letter by letter, as the page's own measurer cuts it.
  columns: (face, text) => {
    const out = [];
    let x = 0;
    for (const ch of T.graphemes(text)) {
      const w = charWidth(face, ch);
      if (ch.trim()) {
        const { top, bottom } = letterInk(face, ch);
        for (let at = x + w * 0.08; at < x + w * 0.92 - 1e-9; at += 0.04) out.push({ x: at, w: Math.min(0.04, x + w * 0.92 - at), top, bottom });
      }
      x += w;
    }
    return out;
  },
  metrics: (face) => FACE_METRICS[face],
  bounds: (face, text) => {
    const m = FACE_METRICS[face];
    const decomposed = text.normalize("NFD");
    const tall = /[a-z\u0300-\u036f\p{Extended_Pictographic}]/u.test(decomposed) && !/^[A-Z0-9\s]*$/.test(text);
    const italic = face === "serif-italic";
    const accentFirst = /^.[\u0300-\u036f]/u.test(decomposed) ? 0.05 : 0;
    const emojiLast = /\p{Extended_Pictographic}$/u.test(text) ? 0.1 : 0;
    // A word of x-height letters alone (no ascender, capital or accent) inks only to the x-height.
    const low = /^[acemnorsuvwxz]+$/.test(text);
    return {
      ascent: low ? m.cap * 0.68 : tall ? m.ascent : m.cap,
      descent: /[gjpqyQ,;\p{Extended_Pictographic}]/u.test(text) ? m.descent : 0,
      left: (italic ? 0.06 : 0) + accentFirst,
      right: advance(face, text) + (italic ? 0.08 : 0) + emojiLast,
    };
  },
};

/** Colours to set covers in: near-black letters on the light ground, and a few others. */
const INK = { hue: 0, shade: 0.02, ground: "light", seed: 0 };
const COLOURS = {
  green: { hue: 140, shade: 0.42 },
  blue: { hue: 255, shade: 0.45 },
  red: { hue: 25, shade: 0.42 },
  purple: { hue: 305, shade: 0.45 },
};
/** A cover for a title in a style and size, in near-black unless told otherwise. */
// Pasty's tests were written on Drip, its first lettering: they name it, as Goo's name Goo.
const cover = (title, style, format = "reel", colour = {}, m = measurer) => S.buildScene({ title, style, format, pastyLettering: "drip", ...INK, ...colour }, m);

/* Titles to set: words of every length, emphasis, line breaks, accents, emoji. */

const WORDS = [
  "how", "I", "plan", "my", "week", "the", "art", "of", "doing", "less", "morning", "routine", "Singapore",
  "consulting", "day", "in", "life", "what", "nobody", "tells", "you", "about", "money", "café", "Zürich",
  "Łódź", "naïve", "3", "things", "2026", "AI", "data", "&", "why", "I", "quit", "👍", "habits", "that",
  "changed", "everything", "a", "it", "is", "WWW", "mmm", "illuminating", "productivity", "unbelievable",
];

function randomTitle(random) {
  const words = [];
  const count = 1 + Math.floor(random() * 18);
  let length = 0;
  for (let i = 0; i < count; i += 1) {
    let word = WORDS[Math.floor(random() * WORDS.length)];
    if (random() < 0.12) word = `*${word}*`;
    const joiner = i === 0 ? "" : random() < 0.12 ? "\n" : " ";
    if (length + joiner.length + word.length > T.MAX_TITLE_LENGTH) break;
    words.push(joiner + word);
    length += joiner.length + word.length;
  }
  return words.join("");
}

const random = G.seeded(20261006);
const TITLES = [
  "Type your *title*",
  "How I *actually* save money",
  "a",
  "Hi",
  "the quick brown fox jumps over the lazy dog",
  "ONE\nTWO WORDS\nthree",
  "WWWWWWWWWWWWWWWWWWWW",
  "productivity",
  "5 * 3 = 15",
  "Week 12 👍",
  ...Array.from({ length: 400 }, () => randomTitle(random)),
];
const PATHOLOGICAL = [
  "W".repeat(T.MAX_TITLE_LENGTH),
  "m".repeat(70) + " " + "W".repeat(69),
  "https://example.com/very/long/url/path/that/goes",
  "x".repeat(49),
  "x".repeat(T.MAX_TITLE_LENGTH),
  "*" + "É".repeat(60) + "* ïñţëŗñåţîöñ 👍",
];
// Titles whose ink reaches past their advance at a line's end.
TITLES.push("*Łódź* Zürich", "Ïñţëŗñåţîöñåļ ţĥîñğš", "Week 12 👍", "*italic* to the *edge*");

/* Where ink lands. */

function applyTurn(rect, turn) {
  return turn ? S.turnedBounds(rect, turn.cx, turn.cy, turn.angle) : rect;
}

/** Every op that must be read, as the rectangle it can ink. Outlines (Echo's copies) are ornament. */
function readableInk(scene) {
  const out = [];
  const walk = (ops, turn) => {
    for (const op of ops) {
      if (op.kind === "turn") walk(op.ops, op);
      else if (op.kind === "text" && !op.outline) {
        const ink = measurer.bounds(op.face, op.text);
        const rect = {
          x: op.x - ink.left * op.size,
          y: op.y - ink.ascent * op.size,
          w: (ink.left + ink.right) * op.size,
          h: (ink.ascent + ink.descent) * op.size,
        };
        out.push({ op, rect: applyTurn(rect, turn) });
      } else if (op.kind === "box") {
        out.push({ op, rect: applyTurn({ x: op.x, y: op.y, w: op.w, h: op.h }, turn) });
      } else if (op.kind === "shape") {
        out.push({ op, rect: SP.polygonBounds(op.polygons) });
      } else if (op.kind === "liquid") {
        // The letters' paste, bead by bead; the droplets after them are ornament.
        for (const chain of op.chains.slice(0, op.letters)) {
          for (const b of chain) out.push({ op, rect: { x: b.x - b.r, y: b.y - b.r, w: 2 * b.r, h: 2 * b.r } });
        }
      }
    }
  };
  walk(scene.ops, null);
  return out;
}

const LIQUID_STYLES = new Set(["pasty", "pasty-flat", "stickery"]);
/** Liquid styles cost more to set, so they are checked over fewer titles. */
const titlesFor = (style) => (LIQUID_STYLES.has(style) ? TITLES.slice(0, 90) : TITLES);

function inside(outer, inner, e = 0.5) {
  return (
    inner.x >= outer.x - e &&
    inner.y >= outer.y - e &&
    inner.x + inner.w <= outer.x + outer.w + e &&
    inner.y + inner.h <= outer.y + outer.h + e
  );
}

function mainText(scene) {
  const out = [];
  const walk = (ops) => {
    for (const op of ops) {
      if (op.kind === "turn") walk(op.ops);
      else if (op.kind === "text" && !op.outline) out.push(op.text);
    }
  };
  walk(scene.ops);
  return out.join("");
}

const stripSpaces = (s) => s.replace(/\s+/g, "");

console.log("formats");

check("every picture is 1080 wide, Instagram's own width, at its shape", () => {
  const sizes = Object.fromEntries(F.FORMATS.map((f) => [f.id, [f.width, f.height]]));
  assert.deepEqual(sizes, { reel: [1080, 1920], "post-3x4": [1080, 1440], "post-4x5": [1080, 1350] });
});

check("a reel's cover is shown 3:4 on the grid and 4:5 in the feed, both from its middle", () => {
  const reel = F.formatById("reel");
  assert.deepEqual(reel.grid, { x: 0, y: 240, w: 1080, h: 1440 });
  assert.deepEqual(reel.crops[1], { x: 0, y: 285, w: 1080, h: 1350 });
});

check("the grid shows a 3:4 post whole, and a 4:5 one less a strip each side", () => {
  assert.equal(F.formatById("post-3x4").grid, null);
  const tall = F.formatById("post-4x5").grid;
  assert.ok(near(tall.w, 1012.5) && near(tall.x, 33.75) && tall.y === 0 && tall.h === 1350);
});

check("the safe area lies inside every window, a margin in from each", () => {
  for (const f of F.FORMATS) {
    const margin = Math.round(f.width * F.MARGIN);
    for (const crop of [{ x: 0, y: 0, w: f.width, h: f.height }, ...f.crops]) {
      assert.ok(inside(crop, f.safe, 0), `${f.id} safe area outside a crop`);
      assert.ok(f.safe.x - crop.x >= margin - 1e-9 || crop.x > 0, `${f.id} margin`);
    }
    assert.ok(f.safe.w > 600 && f.safe.h > 900, `${f.id} safe area too small: ${f.safe.w} by ${f.safe.h}`);
  }
});

check("a format id from storage is checked, and an unknown one falls back", () => {
  assert.equal(F.isFormatId("reel"), true);
  assert.equal(F.isFormatId("square"), false);
  assert.equal(F.formatById("nope").id, "reel");
});

console.log("titles");

const words = (raw) => T.parseTitle(raw).map((p) => p.map((w) => w.map((s) => (s.emphasis ? `*${s.text}*` : s.text)).join("")));

check("a pair of stars marks emphasis, and the stars are not drawn", () => {
  assert.deepEqual(words("How I *actually* save"), [["How", "I", "*actually*", "save"]]);
  assert.deepEqual(words("re*think* it"), [["re*think*", "it"]]);
  assert.deepEqual(words("*how I* save"), [["*how*", "*I*", "save"]]);
});

check("a star with no partner is only a star", () => {
  assert.deepEqual(words("5 * 3"), [["5", "*", "3"]]);
  assert.deepEqual(words("*a* b *c"), [["*a*", "b", "*c"]]);
  assert.equal(T.hasTitle("**"), false);
  assert.equal(T.hasTitle("*"), true);
});

check("typed line breaks are kept; blank lines, tabs and runs of spaces fold away", () => {
  assert.deepEqual(words("a\n\n  b \t c\r\nd\r"), [["a"], ["b", "c"], ["d"]]);
  assert.deepEqual(words("*how I\nsave*"), [["*how*", "*I*"], ["*save*"]]);
  assert.equal(T.hasTitle("  \n \t "), false);
  assert.equal(T.hasTitle(""), false);
});

check("the plain title has no stars and one space between words", () => {
  assert.equal(T.plainTitle("How I\n*actually*  save"), "How I actually save");
  assert.equal(T.plainTitle(T.PLACEHOLDER_TITLE), "Type your title");
});

check("graphemes keep an accent with its letter and a skin tone with its emoji", () => {
  assert.deepEqual(T.graphemes("éa"), ["é", "a"]);
  assert.deepEqual(T.graphemes("👍🏽!"), ["👍🏽", "!"]);
});

check("bold is kept as stars: read and written back exactly, a typed star or backslash kept as itself", () => {
  const m = (text, bold) => ({ text, marks: [...text].map((_, i) => bold.includes(i)) });
  // What the field held before bold, read as it always was.
  assert.deepEqual(T.readMarked("How I *actually* save"), m("How I actually save", [6, 7, 8, 9, 10, 11, 12, 13]));
  assert.deepEqual(T.readMarked("one *star"), m("one *star", []));
  assert.deepEqual(T.readMarked("5\\* rating, a \\\\ slash"), m("5* rating, a \\ slash", []));
  // Any text and any bold go to markup and back unchanged, and the cover reads the same bold.
  let state = 7;
  const rand = () => ((state = (Math.imul(state, 1103515245) + 12345) >>> 0) / 2 ** 32);
  const alphabet = ["a", "b", " ", "*", "\\", "\n", "é", "w"];
  for (let n = 0; n < 600; n += 1) {
    const length = Math.floor(rand() * 14);
    const text = Array.from({ length }, () => alphabet[Math.floor(rand() * alphabet.length)]).join("");
    const marks = Array.from({ length }, () => rand() < 0.4);
    const markup = T.writeMarked(text, marks);
    assert.deepEqual(T.readMarked(markup), { text, marks }, JSON.stringify({ text, marks, markup }));
    // The cover's words carry the same bold, letter for letter.
    const drawn = T.parseTitle(markup).flat(2).flatMap((seg) => [...seg.text].map((c) => [c, seg.emphasis]));
    const kept = [...text].map((c, i) => [c, marks[i]]).filter(([c]) => c !== " " && c !== "\n");
    assert.deepEqual(drawn, kept, JSON.stringify({ text, marks, markup }));
  }
  assert.equal(T.plainTitle("5\\* *rating*"), "5* rating");
});

check("typing carries bold on as a word processor does, and Cmd+B with nothing selected sets what is typed next", () => {
  const start = T.readMarked("do *want* it");
  const bold = (marked) => [...marked.text].filter((_, i) => marked.marks[i]).join("");
  // Typed inside the bold word, or straight after it: bold too.
  assert.equal(bold(T.editMarked(start, "do waxnt it", 6)), "waxnt");
  assert.equal(bold(T.editMarked(start, "do wants it", 8)), "wants");
  // A space typed after the bold word, and the word after it: plain; inside a bold run of words, bold.
  const spaced = T.editMarked(T.editMarked(T.readMarked("do *want*"), "do want ", 8), "do want i", 9);
  assert.equal(bold(spaced), "want");
  assert.equal(bold(T.editMarked(T.readMarked("*do what*"), "do x what", 4)), "do x what", "inside a bold run");
  // After the space, or before the word: plain.
  assert.equal(bold(T.editMarked(start, "do want sit", 9)), "want");
  assert.equal(bold(T.editMarked(start, "do Iwant it", 4)), "want");
  // Typed over a bold selection: bold, as what it replaced.
  assert.equal(bold(T.editMarked(start, "do need it", 7)), "need");
  // The same letter typed twice is told apart by the caret.
  const aa = T.readMarked("*a*a");
  assert.deepEqual(T.editMarked(aa, "aaa", 1).marks, [true, true, false]);
  assert.deepEqual(T.editMarked(aa, "aaa", 3).marks, [true, false, false]);
  // Deleted: the rest keep theirs.
  assert.equal(bold(T.editMarked(start, "do wnt it", 4)), "wnt");
  // Pasted in the middle of plain words: plain; Cmd+B before typing: bold.
  assert.equal(bold(T.editMarked(start, "do want it now and then", 23)), "want");
  assert.equal(bold(T.editMarked(start, "do want it now", 14, true)), "want now");
  assert.equal(bold(T.editMarked(T.readMarked("*want*"), "want it", 7, false)), "want");
});

check("Cmd+B bolds a selection, or takes it off one already bold; spaces never decide", () => {
  const marked = T.readMarked("do *what* you want");
  const bold = (m) => [...m.text].filter((_, i) => m.marks[i]).join("");
  assert.equal(bold(T.toggleBold(marked, 3, 7)), "");
  assert.equal(bold(T.toggleBold(marked, 0, 7)), "do what");
  // "what " with its space: every letter bold, so it comes off.
  assert.equal(bold(T.toggleBold(marked, 3, 8)), "");
  assert.equal(bold(T.toggleBold(marked, 7, 3)), "", "a selection made backwards");
  assert.equal(T.toggleBold(marked, 5, 5), marked, "a caret changes nothing");
  assert.equal(T.isBold(marked, 3, 8), true);
  assert.equal(T.isBold(marked, 2, 8), true, "the spaces round it never decide");
  assert.equal(T.isBold(marked, 1, 8), false);
  assert.equal(T.isBold(marked, 7, 7), true, "a caret reads the letter before it");
  assert.equal(T.isBold(marked, 0, 0), false);
});

check("words typed between stars turn bold as the second star goes in, the stars gone; any other star stays", () => {
  const typed = T.editMarked(T.readMarked("do what you *want"), "do what you *want*", 18);
  const done = T.convertStars(typed);
  assert.ok(done);
  assert.equal(T.writeMarked(done.marked.text, done.marked.marks), "do what you *want*");
  assert.equal(done.marked.text, "do what you want");
  assert.equal(done.moved(18), 16, "the caret comes back two stars");
  assert.equal(done.moved(3), 3);
  for (const text of ["5 * 3 * 2", "a *b", "* no*", "*a\nb*", "**"]) assert.equal(T.convertStars({ text, marks: [...text].map(() => false) }), null, text);
  const two = T.convertStars({ text: "*a* and *b c*", marks: new Array(13).fill(false) });
  assert.equal(T.writeMarked(two.marked.text, two.marked.marks), "*a* and *b c*");
  assert.equal(two.marked.text, "a and b c");
  // Bold already there is kept.
  const kept = T.convertStars({ text: "x *y*", marks: [true, false, false, false, false] });
  assert.deepEqual(kept.marked.marks, [true, false, true]);
});

check("a title is held to its length by its words, never by its stars, and never cut through a letter", () => {
  const long = T.writeMarked("a".repeat(200), new Array(200).fill(true));
  const clipped = T.clipMarked(long, T.MAX_TITLE_LENGTH);
  assert.equal(T.readMarked(clipped).text.length, T.MAX_TITLE_LENGTH);
  assert.ok(T.readMarked(clipped).marks.every(Boolean));
  assert.equal(T.clipMarked("*hi*", 140), "*hi*");
  const emoji = "a".repeat(139) + "😀";
  assert.equal(T.readMarked(T.clipMarked(emoji, 140)).text, "a".repeat(139));
});

console.log("layout");

check("a short title is set as large as its style allows", () => {
  const box = { x: 0, y: 0, w: 900, h: 1200 };
  const block = L.flow(T.parseTitle("Hi"), { box, face: "serif", emphasisFace: "serif-italic", maxSize: 230, minSize: 40, leading: 1, align: "center" }, measurer);
  assert.equal(block.size, 230);
  assert.equal(block.lines.length, 1);
});

check("a long title wraps into even lines, never ending on a lone word", () => {
  const box = { x: 0, y: 0, w: 900, h: 1200 };
  const block = L.flow(
    T.parseTitle("the quick brown fox jumps over the lazy dog"),
    { box, face: "serif", emphasisFace: "serif-italic", maxSize: 230, minSize: 40, leading: 1, align: "center" },
    measurer,
  );
  assert.ok(block.lines.length >= 2);
  const widths = block.lines.map((l) => l.width);
  assert.ok(Math.min(...widths) / Math.max(...widths) > 0.6, `uneven lines: ${widths.map(Math.round)}`);
});

check("a size is the largest that fits: a hair larger does not", () => {
  const box = { x: 0, y: 0, w: 700, h: 500 };
  const spec = { box, face: "sans", emphasisFace: "sans", maxSize: 400, minSize: 20, leading: 1.1, align: "center" };
  const title = T.parseTitle("habits that changed everything");
  const block = L.flow(title, spec, measurer);
  assert.ok(block.size < 400);
  assert.ok(inside(box, block.bounds, 1e-6));
  assert.ok(L.flowFitsAt(title, spec, measurer, block.size));
  assert.ok(!L.flowFitsAt(title, spec, measurer, block.size / L.FEWER_LINES_COST + 0.01));
});

check("over 400 titles, no size that fits is passed over, but for one line fewer at under a tenth's cost", () => {
  const specs = [
    { face: "serif", emphasisFace: "serif-italic", maxSize: 230, minSize: 40, leading: 0.98, align: "center" },
    { face: "mono", emphasisFace: "mono-bold", maxSize: 118, minSize: 30, leading: 1.34, align: "left", padX: 0.14, padY: 0.04, trailing: 0.78 },
    { face: "sans-heavy", emphasisFace: "sans-heavy", maxSize: 132, minSize: 34, leading: 1.14, align: "center", padX: 0.3, emphasisGap: 0.16 },
  ];
  const box = F.formatById("reel").safe;
  for (const base of specs) {
    const spec = { ...base, box };
    for (const title of TITLES) {
      const paragraphs = T.parseTitle(title);
      const block = L.flow(paragraphs, spec, measurer);
      assert.ok(L.flowFitsAt(paragraphs, spec, measurer, block.size), `${base.face} "${title}" does not fit at its own size`);
      for (let size = block.size / L.FEWER_LINES_COST + 0.5; size <= spec.maxSize; size += 2) {
        assert.ok(!L.flowFitsAt(paragraphs, spec, measurer, size), `${base.face} "${title}" set at ${block.size.toFixed(1)} but fits at ${size.toFixed(1)}`);
      }
    }
  }
});

check("a word wider than any line at the smallest size is broken between graphemes, and nothing is lost", () => {
  const box = { x: 0, y: 0, w: 300, h: 1200 };
  const title = "supercalifragilisticexpialidocious";
  const block = L.flow(T.parseTitle(title), { box, face: "wide", emphasisFace: "wide", maxSize: 200, minSize: 40, leading: 1, align: "left" }, measurer);
  assert.ok(block.lines.length > 1);
  assert.equal(block.lines.map((l) => l.segments.map((s) => s.text).join("")).join(""), title);
  for (const line of block.lines) assert.ok(line.width <= box.w + 1e-6);
});

check("too much even broken is cut at the last line that fits, with an ellipsis", () => {
  const box = { x: 0, y: 0, w: 300, h: 200 };
  const block = L.flow(T.parseTitle("W".repeat(140)), { box, face: "wide", emphasisFace: "wide", maxSize: 200, minSize: 40, leading: 1, align: "left" }, measurer);
  assert.equal(block.truncated, true);
  assert.ok(block.lines[block.lines.length - 1].segments.at(-1).text.endsWith("…"));
  assert.ok(inside(box, block.bounds, 1e-6));
});

console.log("covers");

check("every style keeps every word inside the safe area, in every size, over 410 titles, its overhanging ink too", () => {
  let scenes = 0;
  for (const format of F.FORMATS) {
    for (const style of S.STYLES) {
      for (const title of titlesFor(style.id)) {
        const scene = cover(title, style.id, format.id);
        scenes += 1;
        assert.ok(inside(format.safe, scene.readable), `${style.id} ${format.id} "${title}" readable area leaves the safe area`);
        for (const { op, rect } of readableInk(scene)) {
          assert.ok(inside(format.safe, rect), `${style.id} ${format.id} "${title}": ${op.kind} "${op.text ?? ""}" outside the safe area`);
          assert.ok(inside(scene.readable, rect, 1), `${style.id} ${format.id} "${title}": ink outside the area the scene reports`);
        }
        assert.equal(scene.truncated, false, `${style.id} ${format.id} "${title}" was cut short`);
      }
    }
    // Pasty's default lettering is Goo Teardrop, then Goo Even: held to the same, over a hundred titles each.
    for (const style of ["pasty", "pasty-flat"]) {
      for (const pastyLettering of ["goo", "goo-even"]) {
        for (const title of titlesFor(style).slice(0, 100)) {
          const scene = cover(title, style, format.id, { pastyLettering });
          scenes += 1;
          for (const { op, rect } of readableInk(scene)) assert.ok(inside(format.safe, rect), `${style} ${pastyLettering} ${format.id} "${title}": ${op.kind} outside the safe area`);
          assert.equal(scene.truncated, false, `${style} ${pastyLettering} ${format.id} "${title}" was cut short`);
        }
      }
    }
  }
  assert.ok(scenes > 4000);
});

check("no word is dropped or doubled: the drawn text is the typed text", () => {
  for (const format of F.FORMATS) {
    for (const style of S.STYLES.filter((s) => !LIQUID_STYLES.has(s.id))) {
      for (const title of TITLES) {
        const scene = cover(title, style.id, format.id, COLOURS.green);
        const typed = stripSpaces(T.plainTitle(title));
        const expected = style.id === "echo" ? typed.toLocaleUpperCase() : typed;
        assert.equal(stripSpaces(mainText(scene)), expected, `${style.id} ${format.id} "${title}"`);
      }
    }
  }
});

check("even the longest unbroken title stays inside the safe area", () => {
  for (const format of F.FORMATS) {
    for (const style of S.STYLES) {
      for (const title of PATHOLOGICAL) {
        const scene = cover(title, style.id, format.id);
        for (const { rect } of readableInk(scene)) assert.ok(inside(format.safe, rect, 1), `${style.id} ${format.id} "${title}"`);
        assert.ok(inside(format.safe, scene.readable, 1), `${style.id} ${format.id} "${title}" readable area`);
      }
    }
  }
});

check("Echo repeats the title in outline toward both edges, never a copy wholly off the cover", () => {
  for (const format of F.FORMATS) {
    const scene = cover("FOCUS", "echo", format.id);
    const copies = scene.ops.filter((op) => op.kind === "text" && op.outline);
    const main = scene.ops.find((op) => op.kind === "text" && !op.outline);
    assert.ok(copies.some((op) => op.y < main.y) && copies.some((op) => op.y > main.y), `${format.id} echoes one way only`);
    for (const op of copies) {
      const m = FACE_METRICS[op.face];
      assert.ok(op.y + m.descent * op.size > 0 && op.y - m.ascent * op.size < format.height, `${format.id} copy off the cover`);
      assert.ok(op.alpha > 0 && op.alpha < 1);
    }
  }
});

check("Mono ends with its cursor after the last letter, and the block sits in the middle", () => {
  const format = F.formatById("reel");
  const scene = cover("hello world", "mono", "reel");
  const caret = scene.ops.at(-1);
  const lastText = scene.ops.filter((op) => op.kind === "text").at(-1);
  assert.equal(caret.kind, "box");
  assert.ok(caret.x > lastText.x + measurer.width(lastText.face, lastText.text) * lastText.size);
  const centre = scene.readable.x + scene.readable.w / 2;
  assert.ok(near(centre, format.safe.x + format.safe.w / 2, 0.01));
});

check("stars mean something only to Stickery: every other style sets a starred word exactly as the rest", () => {
  for (const style of S.STYLES.filter((st) => st.id !== "stickery")) {
    for (const [starred, plain] of [["How I *actually* save", "How I actually save"], ["*ÉÅ*", "ÉÅ"], ["take up *space* now", "take up space now"]]) {
      for (const ground of ["light", "dark"]) {
        const a = cover(starred, style.id, "post-4x5", { ...COLOURS.blue, ground });
        const b = cover(plain, style.id, "post-4x5", { ...COLOURS.blue, ground });
        assert.deepEqual(a.ops, b.ops, `${style.id} "${starred}" is not set as "${plain}"`);
      }
    }
  }
  // Stickery still reads them: the starred word, not the longest, is the funky one.
  const funky = textOps(cover("How I *do* save money", "stickery", "reel", { lettering: "yesteryear" })).filter((op) => !op.face.startsWith("plain-"));
  assert.deepEqual(funky.map((op) => op.text), ["do"]);
});

check("Mono's cursor stays in when a word is broken", () => {
  for (const title of ["https://example.com/very/long/url/path/that/goes", "x".repeat(49)]) {
    const broken = cover(title, "mono", "reel");
    const caret = broken.ops.at(-1);
    assert.equal(caret.kind, "box");
    assert.ok(inside(F.formatById("reel").safe, caret, 0.01), `"${title}" cursor outside`);
  }
});

check("the first op fills the whole cover with the chosen ground", () => {
  for (const ground of ["light", "dark"]) {
    for (const style of S.STYLES) {
      const scene = cover("x", style.id, "post-4x5", { ...COLOURS.blue, ground });
      assert.deepEqual(scene.ops[0], { kind: "fill", color: P.GROUNDS[ground] });
    }
  }
});

console.log("colour");

const HUES = Array.from({ length: 24 }, (_, i) => i * 15);
const SHADES = Array.from({ length: 21 }, (_, i) => i / 20);

check("every hue and shade the sliders reach is a real sRGB colour, as a six-digit hex", () => {
  for (const hue of HUES) for (const shade of SHADES) assert.match(C.sliderColour(hue, shade), /^#[0-9A-F]{6}$/, `${hue} ${shade}`);
  assert.equal(C.sliderColour(360, 0.5), C.sliderColour(0, 0.5), "the hue wraps round");
});

check("shade runs from near-black to near-white at every hue, always lighter as it rises", () => {
  for (const hue of HUES) {
    const lum = SHADES.map((shade) => P.luminance(C.sliderColour(hue, shade)));
    for (let i = 1; i < lum.length; i += 1) assert.ok(lum[i] > lum[i - 1], `hue ${hue}: shade ${SHADES[i]} is not lighter`);
    assert.ok(lum[0] < 0.03 && lum.at(-1) > 0.8, `hue ${hue} runs ${lum[0].toFixed(3)} to ${lum.at(-1).toFixed(3)}`);
  }
});

check("in the middle of the shade, the hue slider runs through the colours, not shades of one", () => {
  const [r, g, b] = [0, 120, 240].map((hue) => P.rgb(C.sliderColour(hue, 0.55)));
  assert.ok(r[0] > r[1] && r[0] > r[2], "hue 0 is not red");
  assert.ok(g[1] > g[0] && g[1] > g[2], "hue 120 is not green");
  assert.ok(b[2] > b[0] && b[2] > b[1], "hue 240 is not blue");
});

check("the default is a deep sauce red, and it reads on the light ground at 4.5:1", () => {
  const palette = P.paletteFor(P.DEFAULT_COLOUR);
  const [r, g, b] = P.rgb(palette.ink);
  assert.ok(r > 150 && g < 80 && b < 80, palette.ink);
  assert.ok(P.contrast(palette.ink, palette.bg) >= 4.5);
});

check("a sticker's border shows on either ground: dark on light, light on dark, at 4.5:1", () => {
  for (const ground of ["light", "dark"]) {
    const palette = P.paletteFor({ ...COLOURS.green, ground });
    assert.ok(P.contrast(palette.outline, palette.bg) >= 4.5, `${ground}: border ${palette.outline} on ${palette.bg}`);
  }
});

check("an emphasised word is another shade of the colour, further from the ground", () => {
  for (const ground of ["light", "dark"]) {
    for (const hue of HUES) {
      for (const shade of [0.3, 0.5, 0.7]) {
        const palette = P.paletteFor({ hue, shade, ground });
        assert.notEqual(palette.accent, palette.ink, `${ground} ${hue} ${shade}`);
        assert.ok(P.contrast(palette.accent, palette.bg) >= P.contrast(palette.ink, palette.bg), `${ground} ${hue} ${shade}: the accent is closer to the ground`);
      }
    }
  }
});

check("words on a sticker or a highlight read on it at 4.5:1, whatever the colour", () => {
  for (const ground of ["light", "dark"]) {
    for (const hue of HUES) {
      for (const shade of SHADES) {
        const palette = P.paletteFor({ hue, shade, ground });
        for (const fill of [...palette.sticker, palette.accent]) assert.ok(P.contrast(P.readableOn(fill), fill) >= 4.5, `${ground} ${hue} ${shade} on ${fill}`);
      }
    }
  }
});

check("the page warns when the letters sit too close to the ground in lightness, and only then", () => {
  assert.equal(P.standsOut(P.paletteFor({ hue: 24, shade: 0.5, ground: "light" })), true);
  assert.equal(P.standsOut(P.paletteFor({ hue: 24, shade: 0.97, ground: "light" })), false);
  assert.equal(P.standsOut(P.paletteFor({ hue: 24, shade: 0.02, ground: "dark" })), false);
  assert.equal(P.standsOut(P.paletteFor({ hue: 90, shade: 0.8, ground: "dark" })), true);
});

check("the slider tracks run through every hue at the shade, and every shade of the hue", () => {
  assert.equal(C.hueTrack(0.5).match(/#[0-9A-F]{6}/g).length, 13);
  assert.equal(C.shadeTrack(200).match(/#[0-9A-F]{6}/g).length, 11);
  assert.ok(C.shadeTrack(200).startsWith("linear-gradient(to right, "));
});

check("contrast is WCAG's: black on white is 21, a colour on itself 1", () => {
  assert.ok(near(P.contrast("#000000", "#FFFFFF"), 21, 1e-9));
  assert.ok(near(P.contrast("#777777", "#777777"), 1, 1e-9));
  assert.equal(P.withAlpha("#FF5B2E", 0.5), "rgba(255, 91, 46, 0.5)");
});

console.log("memory");

check("a design round-trips through storage", () => {
  const design = { ...D.DEFAULT_DESIGN, text: "How I *plan*", style: "stickery", lettering: "goo", plainFace: "plain-jost", pastyLettering: "goo-even", hue: 305, shade: 0.45, ground: "dark", format: "post-4x5", seed: 12345, place: { x: -40, y: 120, angle: -0.3, sx: 1.4, sy: 0.9 } };
  assert.deepEqual(D.readDesign(D.writeDesign(design)), design);
  // A placement stored wrong is home, or held to what can be drawn.
  assert.deepEqual(D.readDesign(JSON.stringify({ ...design, place: "moved" })).place, PL.HOME);
  assert.deepEqual(D.readDesign(JSON.stringify({ ...design, place: { x: 1e9, y: Number.NaN, angle: 7, sx: 0, sy: 99 } })).place, { x: 5000, y: 0, angle: PL.wrapAngle(7), sx: PL.MIN_SCALE, sy: PL.MAX_SCALE });
  // A lettering or face this version does not know falls back, the rest kept; so does Spread, which is gone.
  assert.deepEqual(
    D.readDesign(JSON.stringify({ ...design, lettering: "comic", plainFace: "papyrus", pastyLettering: "brush" })),
    { ...design, lettering: D.DEFAULT_DESIGN.lettering, plainFace: D.DEFAULT_DESIGN.plainFace, pastyLettering: D.DEFAULT_DESIGN.pastyLettering },
  );
  assert.equal(D.readDesign(JSON.stringify({ ...design, style: "spread" })).style, D.DEFAULT_DESIGN.style);
  // Pasty's default was Drip until version 2: a design still on it from then takes Goo Teardrop; one chosen since keeps Drip.
  assert.equal(D.DEFAULT_DESIGN.pastyLettering, "goo");
  assert.equal(D.readDesign(JSON.stringify({ pastyLettering: "drip" })).pastyLettering, "goo");
  assert.equal(D.readDesign(JSON.stringify({ pastyLettering: "goo-even" })).pastyLettering, "goo-even");
  assert.equal(D.readDesign(D.writeDesign({ ...design, pastyLettering: "drip" })).pastyLettering, "drip");
  assert.deepEqual(S.PASTY_LETTERINGS.map((l) => l.name), ["Goo Teardrop", "Goo Even", "Drip"]);
});

check("whatever storage holds, the maker opens with something it understands", () => {
  for (const raw of [null, "", "not json", "null", "42", "[1,2]", '"text"', "{}"]) assert.deepEqual(D.readDesign(raw), D.DEFAULT_DESIGN, String(raw));
  const odd = D.readDesign(JSON.stringify({ text: 7, style: "vaporwave", hue: 400, shade: -1, ground: "pink", format: "square", seed: 1.5 }));
  assert.deepEqual(odd, D.DEFAULT_DESIGN);
  assert.deepEqual(D.readDesign(JSON.stringify({ hue: 0, shade: 1, ground: "dark", seed: -7 })), { ...D.DEFAULT_DESIGN, hue: 0, shade: 1, ground: "dark", seed: -7 });
  // What the last version stored: nine named colours, gone, and styles since removed; the title is kept.
  const old = D.readDesign(JSON.stringify({ text: "kept", style: "poster", palette: "cobalt", format: "reel" }));
  assert.deepEqual(old, { ...D.DEFAULT_DESIGN, text: "kept" });
  for (const style of ["glow", "sticker"]) assert.equal(D.readDesign(JSON.stringify({ style })).style, D.DEFAULT_DESIGN.style);
  assert.equal(D.readDesign(JSON.stringify({ text: "x".repeat(500) })).text.length, T.MAX_TITLE_LENGTH);
});

console.log("saving");

check("the file is named for the title and the size", () => {
  assert.equal(V.fileName("How I *plan* my week!", "reel"), "how-i-plan-my-week-reel-cover.png");
  assert.equal(V.fileName("Café in Zürich", "post-3x4"), "cafe-in-zurich-post.png");
  assert.equal(V.fileName("", "reel"), "reel-cover.png");
  assert.equal(V.fileName("👍👍", "post-4x5"), "post.png");
  const long = V.fileName("the art of doing less and getting more done every single day of the year", "reel");
  assert.ok(long.length <= 48 + "-reel-cover.png".length && !long.includes("--") && /^[a-z0-9-]+\.png$/.test(long), long);
});

check("an iPhone opens the share sheet; a computer and Android download; an app's browser holds", () => {
  const env = (o) => ({ canShareFiles: false, touch: false, android: false, inAppBrowser: false, ...o });
  assert.equal(V.saveMethod(env({ canShareFiles: true, touch: true })), "share");
  assert.equal(V.saveMethod(env({ canShareFiles: true })), "download");
  assert.equal(V.saveMethod(env({ touch: true })), "download");
  assert.equal(V.saveMethod(env({ canShareFiles: true, touch: true, android: true })), "download");
  assert.equal(V.saveMethod(env({ touch: true, inAppBrowser: true })), "hold");
  assert.equal(V.saveMethod(env({ canShareFiles: true, touch: true, android: true, inAppBrowser: true })), "hold");
  assert.equal(V.saveMethod(env({ canShareFiles: true, touch: true, inAppBrowser: true })), "share");
  assert.equal(V.isAndroid("Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/141.0 Mobile Safari/537.36"), true);
  assert.equal(V.isAndroid("Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15"), false);
});

check("Instagram's and Facebook's browsers are recognised, Safari and Chrome are not", () => {
  const ig = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 389.0.0.29.87 (iPhone15,2; iOS 18_5; en_GB; en-GB; scale=3.00; 1179x2556; 754227838)";
  const fb = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22F76 [FBAN/FBIOS;FBAV/512.0.0.41.106;FBBV/732093476]";
  const safari = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
  const chrome = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
  assert.equal(V.isInAppBrowser(ig), true);
  assert.equal(V.isInAppBrowser(fb), true);
  assert.equal(V.isInAppBrowser(safari), false);
  assert.equal(V.isInAppBrowser(chrome), false);
});

console.log("grain");

check("the grain is the same every time, and another seed is other grain", () => {
  const a = G.grainPixels(64, 2, 1);
  assert.deepEqual(a, G.grainPixels(64, 2, 1));
  assert.notDeepEqual(a, G.grainPixels(64, 2, 2));
});

check("each grain is a two by two cell of pure white or black, mostly faint", () => {
  const size = 128;
  const px = G.grainPixels(size, 2, 9);
  let faint = 0;
  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      const i = (y * size + x) * 4;
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1]]) {
        const j = ((y + dy) * size + x + dx) * 4;
        assert.deepEqual([...px.slice(j, j + 4)], [...px.slice(i, i + 4)]);
      }
      assert.ok(px[i] === 0 || px[i] === 255);
      assert.ok(px[i] === px[i + 1] && px[i] === px[i + 2]);
      if (px[i + 3] < 128) faint += 1;
    }
  }
  assert.ok(faint / (size / 2) ** 2 > 0.65, `only ${faint} faint grains`);
});

console.log("fonts");

/** A gate whose loads settle when the test says, and whose timers run when the test says. */
function testGate() {
  const loads = [];
  const timers = [];
  const gate = createFontGate(
    {
      load: (text) =>
        new Promise((resolve, reject) => {
          loads.push({ text, resolve, reject });
        }),
      patience: 3000,
      setTimer: (run, ms) => timers.push({ run, ms }),
    },
    "Aa ",
  );
  return { gate, loads, timers };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

{
  const { gate, loads, timers } = testGate();
  assert.equal(gate.snapshot("Aa"), -1, "nothing is ready before anything is asked for");
  gate.request("Aa");
  gate.request("Aa");
  assert.equal(loads.length, 1, "a request in flight is not made twice");
  assert.equal(gate.snapshot("Aa"), -1, "nothing is ready while its files load");
  loads[0].resolve();
  await tick();
  assert.ok(gate.snapshot("Aa") >= 0, "ready once they arrive");
  assert.ok(gate.snapshot("a A") >= 0);

  gate.request("A Łódź");
  assert.equal(loads.length, 2);
  assert.deepEqual([...loads[1].text].sort(), ["d", "ó", "Ł", "ź"].sort(), "only what is new is asked for");
  assert.equal(gate.snapshot("Łódź"), -1, "a new character waits for its file, however long the page has been open");
  assert.ok(gate.snapshot("Aa") >= 0, "what was ready stays ready");

  // The file never comes: after patience, draw with what there is.
  timers.at(-1).run();
  const after = gate.snapshot("Łódź");
  assert.ok(after >= 0);
  // It arrives late after all: the count moves, so the cover is measured and drawn again.
  gate.changed();
  assert.ok(gate.snapshot("Łódź") > after);
  loads[1].resolve();
  await tick();
  assert.equal(timers.length, 2);
  passed += 1;
  console.log("  ok  the font gate waits on each new character's file, never on a check, with patience and late arrivals");
}

{
  const { gate, loads } = testGate();
  let told = 0;
  const off = gate.subscribe(() => (told += 1));
  gate.request("x");
  loads[0].reject(new Error("offline"));
  await tick();
  assert.ok(gate.snapshot("x") >= 0, "a failed file is not waited on");
  assert.equal(told, 1);
  off();
  gate.changed();
  assert.equal(told, 1, "an unsubscribed listener is not told");
  passed += 1;
  console.log("  ok  a failed load opens the gate, and listeners are told once");
}

console.log("painting");

/** A 2D context that keeps a transform and records where each piece of text lands. */
function recorder() {
  let m = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const calls = [];
  const point = (x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const multiply = (n) => {
    m = [
      m[0] * n[0] + m[2] * n[1],
      m[1] * n[0] + m[3] * n[1],
      m[0] * n[2] + m[2] * n[3],
      m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4],
      m[1] * n[4] + m[3] * n[5] + m[5],
    ];
  };
  const ctx = {
    calls,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineJoin: "miter",
    globalAlpha: 1,
    font: "",
    textAlign: "start",
    textBaseline: "alphabetic",
    save: () => stack.push({ m: [...m], alpha: ctx.globalAlpha, font: ctx.font }),
    restore: () => {
      const s = stack.pop();
      m = s.m;
      ctx.globalAlpha = s.alpha;
      ctx.font = s.font;
    },
    setTransform: (a, b, c, d, e, f) => {
      m = [a, b, c, d, e, f];
    },
    translate: (x, y) => multiply([1, 0, 0, 1, x, y]),
    scale: (x, y) => multiply([x, 0, 0, y, 0, 0]),
    transform: (a, b, c, d, e, f) => multiply([a, b, c, d, e, f]),
    rotate: (a) => multiply([Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]),
    fillRect: (x, y, w, h) => calls.push({ kind: "fillRect", at: point(x, y), w, h, style: ctx.fillStyle }),
    fillText: (text, x, y) => calls.push({ kind: "fillText", text, at: point(x, y), font: ctx.font, alpha: ctx.globalAlpha, align: ctx.textAlign, baseline: ctx.textBaseline }),
    strokeText: (text, x, y) => calls.push({ kind: "strokeText", text, at: point(x, y), width: ctx.lineWidth, alpha: ctx.globalAlpha }),
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arcTo: () => {},
    closePath: () => {},
    fill: () => calls.push({ kind: "fill", style: ctx.fillStyle }),
    stroke: () => calls.push({ kind: "stroke", style: ctx.strokeStyle, width: ctx.lineWidth }),
    drawImage: (image, ...args) => calls.push({ kind: "drawImage", image, at: args.length > 2 ? args.slice(4, 6) : args, from: args.length > 2 ? args.slice(0, 4) : null, m: [...m] }),
    createRadialGradient: () => ({ stops: [], addColorStop(o, c) { this.stops.push([o, c]); } }),
    createPattern: () => ({ pattern: true }),
    get depth() {
      return stack.length;
    },
  };
  return ctx;
}

const font = (face, size) => `${size}px ${face}`;

check("every word is drawn where the scene puts it, at any scale and from any origin", () => {
  for (const style of S.STYLES) {
    const scene = cover("How I *actually* save money", style.id, "reel");
    for (const [scale, origin] of [[1, { x: 0, y: 0 }], [0.25, { x: 0, y: 240 }]]) {
      const ctx = recorder();
      paint(ctx, scene, { scale, origin, font, grain: null });
      assert.equal(ctx.depth, 0, "save and restore unbalanced");
      const texts = [];
      const walk = (ops, turn) => {
        for (const op of ops) {
          if (op.kind === "turn") walk(op.ops, op);
          else if (op.kind === "text") texts.push({ op, turn });
        }
      };
      walk(scene.ops, null);
      const drawn = ctx.calls.filter((c) => c.kind === "fillText" || c.kind === "strokeText");
      assert.equal(drawn.length, texts.length);
      drawn.forEach((call, i) => {
        const { op, turn } = texts[i];
        let [x, y] = [op.x, op.y];
        if (turn) {
          const cos = Math.cos(turn.angle);
          const sin = Math.sin(turn.angle);
          [x, y] = [turn.cx + (x - turn.cx) * cos - (y - turn.cy) * sin, turn.cy + (x - turn.cx) * sin + (y - turn.cy) * cos];
        }
        assert.ok(near(call.at[0], (x - origin.x) * scale, 1e-6) && near(call.at[1], (y - origin.y) * scale, 1e-6), `${style.id} "${op.text}" drawn off its place`);
        assert.equal(call.kind, op.outline ? "strokeText" : "fillText");
        if (call.kind === "fillText") {
          assert.equal(call.font, font(op.face, op.size));
          assert.equal(call.align, "left");
          assert.equal(call.baseline, "alphabetic");
        }
      });
    }
  }
});

check("a liquid layer is copied from its part of the lit canvas to its place, without the scene's scale", () => {
  const scene = cover("kite", "pasty");
  const ctx = recorder();
  const image = { lit: true };
  paint(ctx, scene, { scale: 0.5, origin: { x: 0, y: 240 }, font, grain: null, liquid: () => ({ image, sx: 3, sy: 5, w: 10, h: 12, x: 40, y: 50 }) });
  const [call] = ctx.calls.filter((c) => c.kind === "drawImage");
  assert.equal(call.image, image);
  assert.deepEqual(call.from, [3, 5, 10, 12]);
  assert.deepEqual(call.at, [40, 50]);
  assert.deepEqual(call.m, [1, 0, 0, 1, 0, 0]);
});

check("grain is drawn only when there is a tile to draw", () => {
  const scene = cover("grain", "editorial", "reel", COLOURS.green);
  const without = recorder();
  paint(without, scene, { scale: 1, font, grain: null });
  const withTile = recorder();
  paint(withTile, scene, { scale: 1, font, grain: {} });
  const fills = (ctx) => ctx.calls.filter((c) => c.kind === "fillRect").length;
  assert.equal(fills(withTile), fills(without) + 1);
});

console.log("strokes");

const FONT_IDS = ["drip", "goo"];

check("every printable letter, figure and mark has strokes in every hand", () => {
  for (const font of FONT_IDS) {
    for (let c = 0x21; c <= 0x7e; c += 1) {
      const ch = String.fromCharCode(c);
      const glyphs = ST.strokeGlyphs(font, ch);
      assert.ok(glyphs.length >= 1 && glyphs.every((g) => g.strokes.length > 0), `${font} has no strokes for ${ch}`);
    }
    assert.ok(ST.strokeGlyphs(font, " ")[0].advance > 0);
  }
});

check("what a phone types is drawn: curly quotes, dashes, an ellipsis, letters beyond Latin-1", () => {
  const curly = String.fromCharCode(0x2019);
  const dashes = [String.fromCharCode(0x2013), String.fromCharCode(0x2014)];
  for (const font of FONT_IDS) {
    assert.deepEqual(ST.strokeGlyphs(font, curly), ST.strokeGlyphs(font, "'"));
    for (const dash of dashes) assert.deepEqual(ST.strokeGlyphs(font, dash), ST.strokeGlyphs(font, "-"));
    assert.equal(ST.strokeGlyphs(font, String.fromCharCode(0x2026)).length, 3);
    assert.deepEqual(ST.strokeGlyphs(font, "Ł"), ST.strokeGlyphs(font, "L"));
    assert.deepEqual(ST.strokeGlyphs(font, "ő"), ST.strokeGlyphs(font, "o"));
    assert.ok(ST.strokeGlyphs(font, "é")[0].strokes.length > ST.strokeGlyphs(font, "e")[0].strokes.length - 1);
    assert.deepEqual(ST.strokeGlyphs(font, "👍"), [], "an emoji has no strokes, and is set as text");
  }
});

check("each hand's metrics are its own, measured from its glyphs", () => {
  for (const font of FONT_IDS) {
    const m = ST.strokeMetrics(font);
    assert.ok(m.cap > m.xHeight && m.xHeight > 0.2 && m.ascent >= m.cap && m.descent > 0.1 && m.space > 0, `${font} ${JSON.stringify(m)}`);
  }
  // Goo's lowercase is its own: drawn wider than Drip's, letter by letter.
  assert.ok(ST.strokeGlyphs("goo", "w")[0].advance > ST.strokeGlyphs("drip", "w")[0].advance);
});

check("Drip draws every Latin-1 letter, accents built over the letter and an i's dot left off under one", () => {
  for (let c = 0xc0; c <= 0xff; c += 1) {
    const ch = String.fromCharCode(c);
    if (ch === "\u00d7" || ch === "\u00f7") continue;
    assert.ok(ST.strokeGlyphs("drip", ch).length >= 1, `Drip has no ${ch}`);
  }
  const dots = (ch) => ST.strokeGlyphs("drip", ch)[0].strokes.filter((st) => st.length === 2).length;
  assert.equal(dots("i"), 1);
  assert.equal(dots("\u00ed"), 0, "an i with an acute keeps its dot");
  assert.equal(dots("\u00ef"), 2, "an i with two dots has the diaeresis's two and not its own");
  for (const ch of ["\u00a3", "\u20ac", "\u00b0"]) assert.ok(ST.strokeGlyphs("drip", ch).length, `Drip has no ${ch}`);
});

console.log("paste");

const RECIPE = { weight: 0.07, pressure: 0.85, bulb: 0.9, wobble: 0.03, smooth: 2, bow: 0.05, wave: 0.03, drip: 1, dripLength: [0.2, 0.6], droplets: 1 };
const AREA = { x: 0, y: 0, w: 1080, h: 1920 };
const placed = (ch, seed, extra = {}) => ({ glyph: ST.strokeGlyphs("drip", ch)[0], x: 300, y: 900, sx: 300, sy: 300, angle: 0.05, skew: 0, seed, ...extra });

check("corner cutting keeps a stroke's ends and rounds its corners", () => {
  const out = LQ.chaikin([[0, 0], [10, 0], [10, 10]], 2);
  assert.deepEqual(out[0], [0, 0]);
  assert.deepEqual(out.at(-1), [10, 10]);
  assert.ok(!out.some(([x, y]) => x === 10 && y === 0), "the corner is still sharp");
});

check("a stroke is resampled evenly, both ends kept", () => {
  const { pts, at } = LQ.resample([[0, 0], [100, 0], [100, 50]], 7);
  assert.deepEqual(pts[0], [0, 0]);
  assert.deepEqual(pts.at(-1), [100, 50]);
  for (let i = 1; i < at.length; i += 1) assert.ok(at[i] - at[i - 1] <= 7 + 1e-9);
});

check("a letter's paste is the same every time from its seed, and another seed is another letter", () => {
  const a = LQ.pasteGlyph(placed("k", 11), RECIPE, 1500, AREA);
  assert.deepEqual(a, LQ.pasteGlyph(placed("k", 11), RECIPE, 1500, AREA));
  assert.notDeepEqual(a, LQ.pasteGlyph(placed("k", 12), RECIPE, 1500, AREA));
});

check("drips never run below their floor, droplets land in their area, no bead is thinner than two fifths of the paste", () => {
  const area = { x: 100, y: 500, w: 800, h: 800 };
  let drips = 0;
  for (let seed = 1; seed <= 300; seed += 1) {
    const ch = "abcdefghijklmnopqrstuvwxyzHIKLMNT"[seed % 33];
    const floor = 1000 + (seed % 7) * 20;
    const paste = LQ.pasteGlyph(placed(ch, seed), RECIPE, floor, area);
    const r0 = RECIPE.weight * 300;
    for (const chain of paste.chains) {
      for (const b of chain) assert.ok(b.r >= r0 * 0.39 && Number.isFinite(b.x) && Number.isFinite(b.y), `${ch} ${seed} bead`);
    }
    // The drips are the chains after the glyph's own strokes; each starts at its stem's foot.
    for (const chain of paste.chains.slice(paste.strokes)) {
      drips += 1;
      for (const b of chain.slice(1)) assert.ok(b.y + b.r <= floor + 1e-6, `${ch} ${seed}: a drip below its floor`);
      assert.ok(chain.at(-1).y > chain[0].y, `${ch} ${seed}: a drip that does not fall`);
    }
    for (const drop of paste.droplets) {
      const [d] = drop;
      assert.ok(d.x - d.r >= area.x && d.x + d.r <= area.x + area.w && d.y - d.r >= area.y && d.y + d.r <= area.y + area.h);
    }
  }
  assert.ok(drips > 60, `only ${drips} drips in 300 letters`);
});

check("a stem is never ruled straight: the hand bows it and sways it, by its seed", () => {
  const bare = { ...RECIPE, bow: 0, wave: 0, wobble: 0, drip: 0 };
  const straight = LQ.pasteGlyph(placed("l", 4, { angle: 0 }), bare, 1500, AREA).chains[0];
  const drawn = LQ.pasteGlyph(placed("l", 4, { angle: 0 }), { ...bare, bow: 0.05, wave: 0.03 }, 1500, AREA).chains[0];
  const spread = (chain) => Math.max(...chain.slice(0, 20).map((b) => b.x)) - Math.min(...chain.slice(0, 20).map((b) => b.x));
  assert.ok(spread(drawn) > spread(straight) + 2, `the stem strays ${spread(drawn).toFixed(1)}px against ${spread(straight).toFixed(1)}px`);
});

check("a letter drawn taller is drawn with the same paste, so its counters stay open", () => {
  const short = LQ.pasteGlyph(placed("o", 9), RECIPE, 1500, AREA).chains[0];
  const tall = LQ.pasteGlyph(placed("o", 9, { sy: 450 }), RECIPE, 1500, AREA).chains[0];
  const mean = (chain) => chain.reduce((sum, b) => sum + b.r, 0) / chain.length;
  assert.ok(Math.abs(mean(tall) - mean(short)) < mean(short) * 0.05);
});

console.log("paste, drawn");

/** A tapered capsule's depth worked out the slow way: the deepest of many discs swept between its two ends. */
function sweptDepth(px, py, a, b) {
  let best = -Infinity;
  for (let i = 0; i <= 4000; i += 1) {
    const t = i / 4000;
    const cx = a.x + (b.x - a.x) * t;
    const cy = a.y + (b.y - a.y) * t;
    best = Math.max(best, a.r + (b.r - a.r) * t - Math.hypot(px - cx, py - cy));
  }
  return best;
}

check("a tapered capsule's depth is exact: outside it, the distance to the swept discs", () => {
  const next = N.random(99);
  for (let k = 0; k < 400; k += 1) {
    const a = { x: next() * 200, y: next() * 200, r: 2 + next() * 30 };
    const b = { x: next() * 200, y: next() * 200, r: 2 + next() * 30 };
    const px = next() * 260 - 30;
    const py = next() * 260 - 30;
    const exact = LR.capsuleDepth(px, py, a, b);
    const slow = sweptDepth(px, py, a, b);
    if (slow < 0) assert.ok(Math.abs(exact - slow) < 0.05, `outside: ${exact} against ${slow}`);
    else assert.ok(exact >= slow - 0.05, `inside: ${exact} against ${slow}`);
  }
});

check("a smooth union is never less than the larger, and is the larger when the two are far apart", () => {
  for (const [a, b] of [[1, 2], [5, -3], [0, 0], [-10, 4]]) {
    assert.ok(LR.smoothMax(a, b, 4) >= Math.max(a, b));
    assert.equal(LR.smoothMax(a, b, 4), LR.smoothMax(b, a, 4));
  }
  assert.equal(LR.smoothMax(10, 0, 4), 10);
  assert.equal(LR.smoothMax(3, 2, 0), 3);
});

const TARGET = { width: 400, height: 400, scale: 1, origin: { x: 0, y: 0 } };
const GROUND = "#F2EEE6";
const paintOf = (finish, chains, extra = {}) => ({ chains, colourOf: chains.map(() => 0), tone: chains.map(() => 1), finish, pool: 12, seed: 3, ...extra });
/** One drop of paste, alone (`ground` null) or lit on a ground with its shadow. */
const one = (finish, chains = [[{ x: 200, y: 200, r: 40 }]], ground = null) => LR.renderLiquid(paintOf(finish, chains), TARGET, { colours: ["#9E1B1B"], ground });
const alphaAt = (img, x, y) => img.data[((y - img.y) * img.w + (x - img.x)) * 4 + 3];
const rgbAt = (img, x, y) => [0, 1, 2].map((k) => img.data[((y - img.y) * img.w + (x - img.x)) * 4 + k]);

check("a drop of paste covers its disc, and nothing far from it", () => {
  for (const finish of ["gloss", "flat"]) {
    const img = one(finish);
    assert.equal(alphaAt(img, 200, 200), 255, finish);
    assert.equal(alphaAt(img, img.x, img.y), 0, `${finish} corner`);
    for (let i = 0; i < img.data.length; i += 1) assert.ok(Number.isFinite(img.data[i]));
  }
});

check("on a ground, paste is opaque, and the layer's edge is exactly the ground, so it never shows", () => {
  const ground = P.rgb(GROUND);
  for (const finish of ["gloss", "flat"]) {
    const img = one(finish, undefined, GROUND);
    for (let x = img.x; x < img.x + img.w; x += 1) {
      assert.deepEqual(rgbAt(img, x, img.y), ground, `${finish} top edge`);
      assert.deepEqual(rgbAt(img, x, img.y + img.h - 1), ground, `${finish} bottom edge`);
    }
    for (let i = 3; i < img.data.length; i += 4) assert.equal(img.data[i], 255);
  }
});

check("paste on a ground shades it down and to the right, away from the light, never up and to the left", () => {
  const lum = (c) => c[0] + c[1] + c[2];
  for (const finish of ["gloss"]) {
    const img = one(finish, undefined, GROUND);
    const away = rgbAt(img, Math.round(200 + 44 * 0.57), Math.round(200 + 44 * 0.82));
    const toward = rgbAt(img, Math.round(200 - 44 * 0.57), Math.round(200 - 44 * 0.82));
    assert.ok(lum(away) < lum(toward) - 6, `${finish}: ${away} against ${toward}`);
  }
  const flat = one("flat", undefined, GROUND);
  assert.deepEqual(rgbAt(flat, 200 + 25, 200 + 36), P.rgb(GROUND), "flat paste casts no shadow");
});

check("gel's shadow is a stain of its colour, never grey", () => {
  const stain = (finish) => {
    const [r, g, b] = rgbAt(one(finish, undefined, GROUND), Math.round(200 + 43 * 0.57), Math.round(200 + 43 * 0.82));
    return r - (g + b) / 2;
  };
  const [gr, gg, gb] = P.rgb(GROUND);
  const bare = gr - (gg + gb) / 2;
  assert.ok(stain("gloss") > bare + 3, `gel shadow ${stain("gloss")} against ground ${bare}`);
});

check("a field's depth is its deepest capsule's, exactly, however few of them are worked out in full", () => {
  // Most capsules are passed over at most pixels, for being no deeper than
  // the beads before them could be: here every one is measured, the slow way.
  let seed = 11;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  for (let n = 0; n < 24; n += 1) {
    let x = 120 + rnd() * 160;
    let y = 120 + rnd() * 160;
    const chain = Array.from({ length: 1 + Math.floor(rnd() * 30) }, () => {
      x += (rnd() - 0.5) * 24;
      y += (rnd() - 0.5) * 24;
      return { x, y, r: 1 + rnd() * 26 };
    });
    const target = { width: 400, height: 400, scale: 0.4 + rnd() * 0.8, origin: { x: rnd() * 30, y: rnd() * 30 } };
    const field = LR.liquidField(paintOf(rnd() < 0.5 ? "gloss" : "flat", [chain]), target);
    const beads = chain.map((b) => ({ x: (b.x - target.origin.x) * target.scale, y: (b.y - target.origin.y) * target.scale, r: b.r * target.scale }));
    const segments = beads.length === 1 ? [[beads[0], beads[0]]] : beads.slice(1).map((b, i) => [beads[i], b]);
    const radii = beads.map((b) => b.r).sort((p, q) => p - q);
    const reach = Math.max(0.5, radii[Math.floor(radii.length / 2)]) * 2.4;
    let compared = 0;
    for (let py = 0; py < field.h; py += 1) {
      for (let px = 0; px < field.w; px += 1) {
        let deepest = -Infinity;
        for (const [a, b] of segments) deepest = Math.max(deepest, LR.capsuleDepth(field.x + px + 0.5, field.y + py + 0.5, a, b));
        // Out past what the shadow reads, the depth is not worked out at all.
        if (deepest < -reach) continue;
        compared += 1;
        const want = Math.round((Math.max(-128, Math.min(127, Math.fround(deepest))) + 128) * 256);
        assert.equal(field.data[(py * field.w + px) * 4], want, `chain ${n} at ${px},${py}`);
      }
    }
    assert.ok(compared > 20, `chain ${n}: ${compared} pixels compared`);
  }
});

check("paste made small has no edge but its own: where its depth was not worked out, nothing is drawn", () => {
  // Letters apart, each worked out in a box of its own; a small canvas (a
  // thumbnail, the preview's quick draft) once drew a faint line along the
  // boxes' edges, read as an edge of the paste.
  const chains = [
    Array.from({ length: 8 }, (_, i) => ({ x: 120 + i * 12, y: 140, r: 22 })),
    Array.from({ length: 6 }, (_, i) => ({ x: 250, y: 120 + i * 18, r: 16 })),
    [{ x: 160, y: 290, r: 34 }],
  ];
  for (const scale of [0.22, 0.5, 1]) {
    for (const finish of ["gloss", "flat"]) {
      const field = LR.liquidField(paintOf(finish, chains, { colourOf: [0, 0, 0], tone: [1, 1, 1] }), { width: 400, height: 400, scale, origin: { x: 0, y: 0 } });
      const img = LR.shadeField(field, { colours: ["#9E1B1B"], ground: null });
      for (let i = 0; i < field.w * field.h; i += 1) {
        const d = field.data[i * 4] / 256 - 128;
        if (d < -1.5) assert.equal(img.data[i * 4 + 3], 0, `${finish} at ${scale}: paste drawn ${(-d).toFixed(1)} pixels out`);
      }
    }
  }
});

check("flat paste is one colour exactly: no light, no shadow, no texture, no dither, every letter alike", () => {
  const chains = [Array.from({ length: 9 }, (_, i) => ({ x: 160 + i * 15, y: 200 + (i % 3) * 6, r: 26 + (i % 4) * 3 })), [{ x: 230, y: 150, r: 30 }, { x: 260, y: 120, r: 18 }]];
  const field = LR.liquidField(paintOf("flat", chains), TARGET);
  const paste = P.rgb("#9E1B1B");
  for (const ground of [GROUND, null]) {
    const img = LR.shadeField(field, { colours: ["#9E1B1B"], ground });
    let inside = 0;
    for (let i = 0; i < field.w * field.h; i += 1) {
      const d = field.data[i * 4] / 256 - 128;
      const rgb = [0, 1, 2].map((k) => img.data[i * 4 + k]);
      if (d > 1.5) {
        inside += 1;
        assert.deepEqual(rgb, paste, `inside the paste: ${rgb}`);
        assert.equal(img.data[i * 4 + 3], 255);
      } else if (d < -1.5) {
        if (ground) assert.deepEqual(rgb, P.rgb(ground), `beside the paste: ${rgb}`);
        else assert.equal(img.data[i * 4 + 3], 0);
      }
    }
    assert.ok(inside > 3000, `${inside} pixels of paste`);
  }
  // Pasty Flat's letters are all the one tone, and cast no shadow on a photo.
  for (const lettering of ["goo", "goo-even", "drip"]) {
    const op = liquidOf(cover("Art is different", "pasty-flat", "reel", { pastyLettering: lettering, photo: true }));
    assert.equal(op.finish, "flat");
    assert.ok(op.tone.every((t) => t === 1), `${lettering}: tones ${[...new Set(op.tone)]}`);
    assert.equal(op.shadow, false, `${lettering}: a shadow on the photo`);
  }
});

check("gel is lit: a highlight far brighter than its body, a body darker than its colour", () => {
  const img = one("gloss");
  let brightest = 0;
  let darkest = 255;
  for (let y = 165; y < 235; y += 1) {
    for (let x = 165; x < 235; x += 1) {
      const o = ((y - img.y) * img.w + (x - img.x)) * 4;
      if (img.data[o + 3] < 255) continue;
      brightest = Math.max(brightest, img.data[o + 1]);
      darkest = Math.min(darkest, img.data[o]);
    }
  }
  assert.ok(brightest > 200, `highlight ${brightest}`);
  assert.ok(darkest < 0x9e, `body ${darkest}`);
});

check("two strokes closer than the pooling distance join; farther apart they stay two", () => {
  const near = one("flat", [[{ x: 150, y: 200, r: 30 }], [{ x: 216, y: 200, r: 30 }]]);
  assert.ok(alphaAt(near, 183, 200) > 0, "a 6px gap with 12px of pooling did not join");
  const far = one("flat", [[{ x: 120, y: 200, r: 30 }], [{ x: 290, y: 200, r: 30 }]]);
  assert.equal(alphaAt(far, 205, 200), 0);
});

check("the same paste is the same pixels", () => {
  assert.deepEqual(one("gloss").data, one("gloss").data);
});

check("a blur keeps a flat field flat and its total", () => {
  const w = 30;
  const h = 20;
  const flat = new Float32Array(w * h).fill(0.4);
  LR.boxBlur(flat, w, h, 3);
  assert.ok(flat.every((v) => Math.abs(v - 0.4) < 1e-6));
  const spike = new Float32Array(w * h);
  spike[10 * w + 15] = 1;
  LR.boxBlur(spike, w, h, 2);
  assert.ok(Math.abs(spike.reduce((a, b) => a + b, 0) - 1) < 1e-3);
});

console.log("liquid letters");

const SPEC = {
  box: F.formatById("reel").safe,
  fonts: [{ id: "drip", share: 1 }],
  maxSize: 640,
  minSize: 64,
  gap: -0.04,
  maxLines: 7,
  stretch: 1.25,
  tracking: 0.01,
  inkGap: 0.12,
  jitter: { scale: 0.15, angle: 0.075, rise: 0.05, squash: 0.1 },
  upper: false,
  swapCase: 0.3,
  salt: "pasty",
};
const DRIP = new Set(Object.keys({ ...Object.fromEntries([..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"].map((c) => [c, 1])) }));
const letterOf = (glyph) => [...DRIP].find((c) => ST.strokeGlyphs("drip", c)[0] === glyph);

check("every character typed becomes a glyph, or plain text when no hand can draw it", () => {
  for (const title of TITLES) {
    const layout = LL.liquidLayout(T.parseTitle(title), SPEC);
    const expected = T.graphemes(T.plainTitle(title).replace(/ /g, "")).reduce((n, g) => n + Math.max(1, ST.strokeGlyphs("drip", g).length), 0);
    assert.equal(layout.glyphs.length + layout.missing.length, expected, title);
  }
  assert.equal(LL.liquidLayout(T.parseTitle("Week 👍"), SPEC).missing.map((m) => m.text).join(""), "👍");
});

check("a word is drawn the same wherever it goes, and the same letter differently in another word", () => {
  const kOf = (title) => LL.liquidLayout(T.parseTitle(title), SPEC).glyphs.find((g) => /k/i.test(letterOf(g.glyph) ?? ""));
  const alone = kOf("kite");
  const later = kOf("kite surfing");
  assert.equal(alone.seed, later.seed);
  assert.equal(alone.angle, later.angle);
  const other = kOf("handkerchief");
  assert.notEqual(other.seed, alone.seed);
  assert.notEqual(other.angle, alone.angle);
});

check("the hand mixes its cases now and then, as a sign painter's does, but never draws an i as an I", () => {
  let swapped = 0;
  let letters = 0;
  for (let i = 0; i < 200; i += 1) {
    const word = `kitchen${i}`.replace(/\d/g, (d) => "abcdefghij"[d]);
    for (const [k, g] of LL.liquidLayout(T.parseTitle(word), SPEC).glyphs.entries()) {
      const drawn = letterOf(g.glyph);
      letters += 1;
      if (drawn !== word[k]) swapped += 1;
      if (word[k] === "i") assert.notEqual(drawn, "I", `${word}: an I for an i`);
    }
  }
  assert.ok(swapped > letters * 0.18 && swapped < letters * 0.36, `${swapped} of ${letters} letters in the other case`);
  const typed = LL.liquidLayout(T.parseTitle("plain"), { ...SPEC, swapCase: 0 }).glyphs.map((g) => letterOf(g.glyph)).join("");
  assert.equal(typed, "plain");
});

check("letters never come closer than the ink gap, so paste never fills the space between them", () => {
  for (const title of TITLES.slice(0, 150)) {
    const layout = LL.liquidLayout(T.parseTitle(title), SPEC);
    for (let i = 1; i < layout.glyphs.length; i += 1) {
      const a = layout.glyphs[i - 1];
      const b = layout.glyphs[i];
      if (a.line !== b.line || b.x < a.x) continue;
      const ia = ST.glyphBox(a.glyph);
      const ib = ST.glyphBox(b.glyph);
      if (ia.x1 <= ia.x0 || ib.x1 <= ib.x0) continue;
      const gap = b.x + ib.x0 * b.sx - (a.x + ia.x1 * a.sx);
      assert.ok(gap >= SPEC.inkGap * layout.sizes[a.line] - 1e-6, `${title}: letters ${i - 1} and ${i} only ${gap.toFixed(1)}px apart`);
    }
  }
});

check("typed lines are kept as typed while they fit, and drips stop at the line below", () => {
  const layout = LL.liquidLayout(T.parseTitle("Kite\nhandkerchief"), SPEC);
  assert.deepEqual([...new Set(layout.glyphs.map((g) => g.line))], [0, 1]);
  assert.ok(layout.floors[0] <= Math.min(...layout.glyphs.filter((g) => g.line === 1).map((g) => g.y)));
  assert.equal(layout.floors.at(-1), SPEC.box.y + SPEC.box.h);
});

console.log("stickers");

const grid = (v, cell) => Math.abs(v / cell - Math.round(v / cell)) < 1e-6;

check("a sticker is straight steps on its grid, round every letter with room to spare", () => {
  const next = N.random(5);
  for (let k = 0; k < 120; k += 1) {
    const boxes = Array.from({ length: 1 + Math.floor(next() * 12) }, () => ({ x: 100 + next() * 500, y: 100 + next() * 300, w: 10 + next() * 120, h: 10 + next() * 90 }));
    const cell = 24;
    const pad = 20;
    const polygons = SP.steppedOutline(boxes, { cell, pad });
    assert.ok(polygons.length >= 1);
    for (const p of polygons) {
      assert.ok(p.length >= 8 && p.length % 2 === 0);
      for (let i = 0; i < p.length; i += 2) {
        assert.ok(grid(p[i], cell) && grid(p[i + 1], cell), "a corner off the grid");
        const nx = p[(i + 2) % p.length];
        const ny = p[(i + 3) % p.length];
        assert.ok(nx === p[i] || ny === p[i + 1], "an edge that is not straight across or down");
      }
    }
    const inAny = (x, y) => polygons.some((p) => SP.insidePolygon(p, x, y));
    for (const b of boxes) {
      for (const [x, y] of [[b.x - pad + 1, b.y - pad + 1], [b.x + b.w + pad - 1, b.y - pad + 1], [b.x - pad + 1, b.y + b.h + pad - 1], [b.x + b.w + pad - 1, b.y + b.h + pad - 1]]) {
        assert.ok(inAny(x, y), "a padded letter pokes out of its sticker");
      }
    }
  }
});

check("cut by hand: a rough sticker has no long straight side, and a step on each of its four outer sides", () => {
  const next = N.random(17);
  let cases = 0;
  for (let k = 0; k < 150; k += 1) {
    const boxes = Array.from({ length: 1 + Math.floor(next() * 8) }, () => ({ x: 100 + next() * 600, y: 100 + next() * 300, w: 60 + next() * 300, h: 30 + next() * 90 }));
    const cell = 20;
    const pad = 18;
    const plain = SP.steppedOutline(boxes, { cell, pad });
    const rough = SP.steppedOutline(boxes, { cell, pad, rough: { run: 12, seed: k + 1 } });
    // A step only adds paper: whatever the plain sticker covered, the rough one does.
    for (let y = 80; y < 560; y += 7) {
      for (let x = 80; x < 1100; x += 7) {
        if (plain.some((p) => SP.insidePolygon(p, x, y))) assert.ok(rough.some((p) => SP.insidePolygon(p, x, y)), `case ${k}: a step cut paper away`);
      }
    }
    for (const p of rough) {
      cases += 1;
      assert.ok(SP.longestEdge(p) <= 12 * cell + 1e-6, `case ${k}: a side runs ${SP.longestEdge(p) / cell} steps straight`);
      // No outer side, top, bottom, left or right, runs straight from corner
      // to corner: the outline leaves the box round it somewhere along each.
      const b = SP.polygonBounds([p]);
      const along = (test) => {
        let length = 0;
        for (let i = 0; i < p.length; i += 2) {
          const j = (i + 2) % p.length;
          if (test(p[i], p[i + 1]) && test(p[j], p[j + 1])) length += Math.abs(p[j] - p[i]) + Math.abs(p[j + 1] - p[i + 1]);
        }
        return length;
      };
      for (const [name, test, side] of [
        ["top", (x, y) => y === b.y, b.w],
        ["bottom", (x, y) => y === b.y + b.h, b.w],
        ["left", (x) => x === b.x, b.h],
        ["right", (x) => x === b.x + b.w, b.h],
      ]) {
        if (side >= 4 * cell) assert.ok(along(test) < side - 1e-6, `case ${k}: its ${name} is straight from corner to corner`);
      }
    }
  }
  assert.ok(cases >= 150);
  // The same seed cuts the same steps; another seed others.
  const boxes = [{ x: 0, y: 0, w: 600, h: 60 }];
  assert.deepEqual(SP.steppedOutline(boxes, { cell: 20, pad: 10, rough: { run: 12, seed: 3 } }), SP.steppedOutline(boxes, { cell: 20, pad: 10, rough: { run: 12, seed: 3 } }));
  assert.notDeepEqual(SP.steppedOutline(boxes, { cell: 20, pad: 10, rough: { run: 12, seed: 3 } }), SP.steppedOutline(boxes, { cell: 20, pad: 10, rough: { run: 12, seed: 4 } }));
});

check("a ring of words makes a sticker with no hole; words far apart make two", () => {
  const ring = [
    { x: 0, y: 0, w: 300, h: 40 },
    { x: 0, y: 260, w: 300, h: 40 },
    { x: 0, y: 0, w: 40, h: 300 },
    { x: 260, y: 0, w: 40, h: 300 },
  ];
  const filled = SP.steppedOutline(ring, { cell: 20, pad: 10 });
  assert.equal(filled.length, 1);
  assert.ok(SP.insidePolygon(filled[0], 150, 150), "the middle is a hole");
  assert.equal(SP.steppedOutline([{ x: 0, y: 0, w: 50, h: 50 }, { x: 600, y: 0, w: 50, h: 50 }], { cell: 20, pad: 10 }).length, 2);
});

/**
 * A Stickery cover's parts, measured as the layout measures them: each
 * plain word's ink as upright strips (and its whole box), and its funky
 * words' paste beads or ink strips, turned as they are drawn.
 */
function stickerParts(scene) {
  const plain = [];
  const funky = [];
  const strips = (op, turn) =>
    (measurer.columns(op.face, op.text) ?? []).map((c) => applyTurn({ x: op.x + c.x * op.size, y: op.y + c.top * op.size, w: c.w * op.size, h: (c.bottom - c.top) * op.size }, turn));
  const walk = (ops, turn) => {
    for (const op of ops) {
      if (op.kind === "turn") walk(op.ops, op);
      else if (op.kind === "text") {
        const ink = measurer.bounds(op.face, op.text);
        const box = applyTurn({ x: op.x - ink.left * op.size, y: op.y - ink.ascent * op.size, w: (ink.left + ink.right) * op.size, h: (ink.ascent + ink.descent) * op.size }, turn);
        if (op.face.startsWith("plain-")) plain.push({ op, box, strips: strips(op, turn), turned: !!turn });
        else funky.push(...strips(op, turn).map((b) => ({ kind: "box", ...b })));
      }
    }
  };
  walk(scene.ops, null);
  for (const b of liquidOf(scene)?.chains.flat() ?? []) funky.push({ kind: "circle", ...b });
  return { plain, funky };
}

/** How far a box is from a circle or another box, edge to edge (zero when they touch or overlap). */
function apart(box, part) {
  if (part.kind === "circle") {
    const dx = Math.max(box.x - part.x, 0, part.x - (box.x + box.w));
    const dy = Math.max(box.y - part.y, 0, part.y - (box.y + box.h));
    return Math.max(0, Math.hypot(dx, dy) - part.r);
  }
  const dx = Math.max(box.x - (part.x + part.w), 0, part.x - (box.x + box.w));
  const dy = Math.max(box.y - (part.y + part.h), 0, part.y - (box.y + box.h));
  return Math.hypot(dx, dy);
}

const LETTERING_IDS = S.LETTERINGS.map((l) => l.id);

check("Stickery: a sticker per typed line, the colours in turn, funky words in every sticker, a border that shows", () => {
  const format = F.formatById("reel");
  for (const lettering of LETTERING_IDS) {
    for (const colour of [COLOURS.green, { hue: 60, shade: 0.85, ground: "dark" }]) {
      const palette = P.paletteFor({ ...INK, ...colour });
      const scene = cover("things *aren't*\n*what* they seem\nand *more*", "stickery", "reel", { ...colour, lettering });
      const shapes = scene.ops.filter((op) => op.kind === "shape");
      assert.deepEqual(shapes.map((s) => s.color), [palette.sticker[0], palette.sticker[1], palette.sticker[0]]);
      for (const shape of shapes) assert.ok(P.contrast(shape.stroke, scene.ops[0].color) >= 4.5, `a border lost on the ${colour.ground ?? "light"} ground`);
      // Each sticker is one piece of paper, and carries some funky word.
      for (const shape of shapes) assert.equal(shape.polygons.length, 1, `${lettering}: a sticker in two pieces`);
      const { plain, funky } = stickerParts(scene);
      const carried = shapes.filter((s) => funky.some((f) => s.polygons.some((p) => SP.insidePolygon(p, f.x + (f.w ?? 0) / 2, f.y + (f.h ?? 0) / 2))));
      assert.equal(carried.length, 3, `${lettering}: a funky word is missing from its sticker`);
      const paste = liquidOf(scene);
      if (paste) assert.equal(paste.ground, null, "Stickery's paste lies on its stickers, not the ground");
      assert.equal(!!paste, S.letteringFace(lettering) === null, `${lettering} drawn the wrong way`);
      assert.deepEqual(plain.map((p) => p.op.text), ["things", "they", "seem", "and"]);
      assert.ok(inside(format.safe, scene.readable, 1));
      for (const { op } of plain) {
        const sticker = shapes.find((s) => s.polygons.some((p) => SP.insidePolygon(p, op.x + 1, op.y - 1)));
        assert.ok(sticker, `${lettering}: "${op.text}" is not on a sticker`);
        assert.equal(op.color, P.readableOn(sticker.color));
      }
    }
  }
});

check("Stickery is laid out by the title and the shuffle: the same seed the same, another seed elsewhere, nothing all to one side", () => {
  const title = "things *aren't*\n*what* they seem\nand *more*\nthan *this*";
  const lefts = (scene) => scene.ops.filter((op) => op.kind === "shape").map((op) => Math.round(SP.polygonBounds(op.polygons).x));
  assert.deepEqual(lefts(cover(title, "stickery")), lefts(cover(title, "stickery")));
  const seeds = [0, 1, 2, 3, 4, 5].map((seed) => lefts(cover(title, "stickery", "reel", { seed })));
  assert.ok(new Set(seeds.map((l) => l.join())).size >= 5, "the shuffle does not move the stickers");
  for (const l of seeds) assert.ok(new Set(l).size > 1, `every sticker starts at ${l[0]}`);
  // Stickers stacked well apart, as Main Sticker 2's: 1.2 to 1.6 of a
  // plain x-height between them (the border is a 0.045 of one), each set
  // to the other side of the last by an eighth of its width or so.
  const scene = cover(title, "stickery");
  const shapes = scene.ops.filter((op) => op.kind === "shape");
  const boxes = shapes.map((op) => SP.polygonBounds(op.polygons));
  for (let i = 1; i < boxes.length; i += 1) {
    // The border is held to 1.2px at the least, which says nothing then of the x-height.
    const unit = shapes[i - 1].strokeWidth / 0.045;
    const gap = boxes[i].y - (boxes[i - 1].y + boxes[i - 1].h);
    if (shapes[i - 1].strokeWidth > 1.2) assert.ok(gap >= unit * 1.1 && gap <= unit * 1.7 + 1, `stickers ${i - 1} and ${i} are ${(gap / unit).toFixed(2)} x-heights apart`);
    else assert.ok(gap > 0, `stickers ${i - 1} and ${i} touch`);
    const shift = (boxes[i].x - boxes[i - 1].x) / boxes[i].w;
    assert.ok(Math.abs(shift) >= 0.04 && Math.abs(shift) <= 0.4, `sticker ${i} sits ${shift.toFixed(2)} of its width along`);
  }
  // The second sticker a colour a long way round the wheel from the first, as pink sits over blue.
  const [a, b] = shapes.map((op) => P.rgb(op.color));
  assert.ok(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > 120, "the stickers are one colour");
});

check("Stickery with no stars: each sticker's longest word is the funky one", () => {
  for (const lettering of ["goo", "yesteryear"]) {
    const scene = cover("do what you desire\nit is what it is", "stickery", "reel", { ...COLOURS.blue, lettering });
    const { plain, funky } = stickerParts(scene);
    const shapes = scene.ops.filter((op) => op.kind === "shape");
    assert.equal(shapes.filter((s) => funky.some((f) => s.polygons.some((p) => SP.insidePolygon(p, f.x + (f.w ?? 0) / 2, f.y + (f.h ?? 0) / 2)))).length, 2);
    assert.deepEqual(plain.map((p) => p.op.text), ["do", "what", "you", "it", "is", "it", "is"]);
  }
});

const STICKER_TITLES = ["do what you *want*", "it is *what it is*", "things *aren't*\n*what* they seem", "How I actually save money", "my morning routine as a consultant in Singapore", "*Week 12* of building in public"];

check("Stickery is one unit: plain words settle close round the funky word, never touching it, whatever the lettering, face or shuffle", () => {
  let words = 0;
  for (const lettering of LETTERING_IDS) {
    for (const seed of [0, 1, 2, 3]) {
      for (const title of STICKER_TITLES) {
        const plainFace = FACES.PLAIN_FACES[(seed + words) % FACES.PLAIN_FACES.length].id;
        const scene = cover(title, "stickery", "reel", { seed, lettering, plainFace });
        const { plain, funky } = stickerParts(scene);
        const size = plain[0]?.op.size ?? 1;
        let nearest = Infinity;
        for (const { op, strips } of plain) {
          words += 1;
          const d = Math.min(...strips.flatMap((box) => funky.map((f) => apart(box, f))));
          assert.ok(d > 0, `${lettering} ${seed} "${title}": "${op.text}" touches the funky word`);
          nearest = Math.min(nearest, d);
        }
        // Not floating apart: the plain word nearest the funky one has settled right up to it.
        if (plain.length) assert.ok(nearest < size * 0.4, `${lettering} ${seed} "${title}": the plain words float ${(nearest / size).toFixed(2)} of their size away`);
      }
    }
  }
  assert.ok(words > 300);
});

check("Stickery's plain words are never turned and a line reads in order; its funky word is always turned 2 to 6 degrees, another way each shuffle", () => {
  const angles = new Set();
  for (const lettering of LETTERING_IDS) {
    for (const seed of [0, 1, 2, 3]) {
      for (const title of STICKER_TITLES) {
        const scene = cover(title, "stickery", "reel", { seed, lettering });
        const { plain } = stickerParts(scene);
        for (const p of plain) assert.equal(p.turned, false, `${lettering} "${title}": "${p.op.text}" is turned`);
        // Along a line (words set in turn, each right of the last; a line is
        // at least its own height from the next), each word within half its
        // size of its neighbour in height, so the line still reads in order.
        for (let i = 1; i < plain.length; i += 1) {
          const [a, b] = [plain[i - 1].op, plain[i].op];
          if (b.x <= a.x || Math.abs(b.y - a.y) > a.size * 0.85) continue;
          assert.ok(Math.abs(b.y - a.y) <= a.size * 0.5 + 0.5, `${lettering} ${seed} "${title}": "${b.text}" ${((b.y - a.y) / a.size).toFixed(2)} of a line off "${a.text}"`);
        }
        const turns = scene.ops.filter((op) => op.kind === "turn");
        const paste = liquidOf(scene);
        if (!paste) {
          assert.ok(turns.length >= 1, `${lettering} "${title}": the funky word is not turned`);
          for (const t of turns) {
            assert.ok(Math.abs(t.angle) >= 0.034 && Math.abs(t.angle) <= 0.101, `${lettering}: turned ${((t.angle * 180) / Math.PI).toFixed(1)} degrees`);
            angles.add(t.angle.toFixed(3));
          }
        }
      }
    }
  }
  assert.ok(angles.size > 30, "the funky words sit at the same few angles");
});

check("every lettering and every plain face keeps Stickery inside the safe area", () => {
  for (const format of F.FORMATS) {
    for (const lettering of LETTERING_IDS) {
      for (const [i, title] of TITLES.slice(0, 30).entries()) {
        const plainFace = FACES.PLAIN_FACES[i % FACES.PLAIN_FACES.length].id;
        const scene = cover(title, "stickery", format.id, { lettering, plainFace });
        for (const { op, rect } of readableInk(scene)) assert.ok(inside(format.safe, rect, 1), `${lettering} ${plainFace} ${format.id} "${title}": ${op.kind} outside`);
        for (const { op } of stickerParts(scene).plain) assert.equal(op.face, plainFace, `${lettering} "${title}": "${op.text}" set in ${op.face}`);
        const funkyFace = S.letteringFace(lettering);
        for (const op of textOps(scene)) if (!op.face.startsWith("plain-") && op.face !== "sans") assert.equal(op.face, funkyFace, `${lettering} "${title}": "${op.text}" in ${op.face}`);
      }
    }
  }
});

check("a sticker with no funky word sets its words the size of its neighbours', and a script's apostrophe sits close", () => {
  for (const lettering of LETTERING_IDS) {
    for (const seed of [0, 1, 2]) {
      const scene = cover("I love *you*\nmore than *words*\ncan say", "stickery", "reel", { seed, lettering });
      const sizes = stickerParts(scene).plain.map((p) => [p.op.text, p.op.size]);
      const alone = sizes.filter(([t]) => t === "can" || t === "say").map(([, v]) => v);
      const beside = sizes.filter(([t]) => t !== "can" && t !== "say").map(([, v]) => v);
      assert.ok(alone.length && beside.length);
      // A line of two beside a funky word may grow a quarter, and a longer one shrink: within that, the same.
      for (const v of alone) assert.ok(v >= Math.min(...beside) * 0.75 && v <= Math.max(...beside) * 1.34, `${lettering} ${seed}: "can say" at ${v.toFixed(1)} beside ${beside.map((b) => b.toFixed(1)).join(", ")}`);
    }
  }
  // A typeface sets "aren't" in pieces at its apostrophe, each a twentieth of an em of clear paper from the ink beside it.
  for (const lettering of ["yesteryear", "leckerli", "damion"]) {
    const funky = textOps(cover("things *aren't*", "stickery", "reel", { lettering })).filter((op) => !op.face.startsWith("plain-"));
    assert.deepEqual(funky.map((op) => op.text), ["aren", "'", "t"], lettering);
    const ink = (op) => measurer.columns(op.face, op.text).map((c) => ({ x0: op.x + c.x * op.size, x1: op.x + (c.x + c.w) * op.size, top: c.top, bottom: c.bottom }));
    for (let i = 1; i < funky.length; i += 1) {
      const [a, b] = [funky[i - 1], funky[i]];
      let gap = Infinity;
      for (const p of ink(a)) for (const q of ink(b)) if (q.top < p.bottom && p.top < q.bottom) gap = Math.min(gap, q.x0 - p.x1);
      assert.ok(Math.abs(gap - 0.05 * a.size) < 0.01 * a.size, `${lettering}: "${a.text}" to "${b.text}" ${(gap / a.size).toFixed(3)} em`);
    }
  }
});

check("the picker offers the owner's four plain faces, two sans and two serif; the suggestions wait", () => {
  const offered = FACES.PLAIN_FACES.filter((f) => f.offered);
  assert.deepEqual(offered.map((f) => f.name), ["Outfit", "Jost", "Fraunces", "Newsreader"]);
  assert.deepEqual(offered.map((f) => f.kind), ["sans", "sans", "serif", "serif"]);
  assert.ok(FACES.PLAIN_FACES.find((f) => f.id === FACES.DEFAULT_PLAIN_FACE).offered);
  // A face from before, no longer offered, falls back.
  assert.equal(D.readDesign(JSON.stringify({ plainFace: "plain-inter" })).plainFace, FACES.DEFAULT_PLAIN_FACE);
});

check("Goo swells and thins slowly, as a brush: necks to swells about 2.5 apart, and never a step between", () => {
  const radii = (lettering) => liquidOf(cover("*remember*", "stickery", "reel", { lettering })).chains.flat().map((b) => b.r).sort((a, b) => a - b);
  // Measured as the critic measured Main Sticker 2 (2.6 to 2.9): the 90th of every bead's radius over the 10th.
  const ratio = (r) => r[Math.floor(r.length * 0.9)] / r[Math.floor(r.length * 0.1)];
  assert.ok(ratio(radii("goo")) > 1.8 && ratio(radii("goo")) < 3.6, `goo neck to swell ${ratio(radii("goo")).toFixed(2)}`);
  for (const lettering of ["goo", "goo-even"]) {
    const op = liquidOf(cover("*smooth transitions everywhere*", "stickery", "reel", { lettering }));
    // Bead to bead, never more than a fifth of the stroke's full weight.
    for (const chain of op.chains) {
      const full = Math.max(...chain.map((b) => b.r));
      for (let i = 1; i < chain.length; i += 1) {
        const [a, b] = [chain[i - 1].r, chain[i].r];
        // Where one bead lies wholly inside the next (a drip's drop filling out), there is no edge to step.
        if (Math.abs(a - b) >= Math.hypot(chain[i].x - chain[i - 1].x, chain[i].y - chain[i - 1].y)) continue;
        assert.ok(Math.abs(a - b) <= full * 0.2, `${lettering}: the paste steps from ${a.toFixed(1)} to ${b.toFixed(1)}`);
      }
    }
  }
});

check("a word's last t swings its crossbar out into a drop grown from the bar as paste grows, never a ball on a stick or on a swollen end", () => {
  const t = ST.strokeGlyphs("goo", "t")[0];
  const area = { x: 0, y: 0, w: 4000, h: 4000 };
  const recipe = { weight: 0.064, pressure: 0, bulb: 0.4, balls: 1, bulbReach: 6, wobble: 0, smooth: 1, spline: true, bow: 0, wave: 0, pen: { kind: "pressure", thin: 0.62 }, drip: 0, dripLength: [0, 0], droplets: 0 };
  for (const end of ["teardrop", "ball", "drip", "taper"]) {
    for (let seed = 1; seed <= 24; seed += 1) {
      const g = { glyph: t, x: 400, y: 900, sx: 400, sy: 400, angle: 0, skew: 0, seed, char: "t", final: true };
      const { chains, strokes } = LQ.pasteGlyph(g, { ...recipe, crossbar: { length: 0.3, ball: 2, end } }, Infinity, area);
      const bar = chains.slice(0, strokes).find((c) => Math.abs(c.at(-1).y - c[0].y) < Math.abs(c.at(-1).x - c[0].x) * 0.4);
      const swash = chains[strokes];
      assert.ok(bar && swash && swash.length > 4, `${end} ${seed}: no swash`);
      const middle = [...bar.map((b) => b.r)].sort((p, q) => p - q)[Math.floor(bar.length / 2)];
      // The bar's own ends never swell first: the swash grows from the bar's own stroke.
      for (const b of [bar[0], bar.at(-1)]) assert.ok(b.r <= middle * 1.15, `${end} ${seed}: the bar's end swelled to ${(b.r / middle).toFixed(2)} of it`);
      if (end === "teardrop") {
        for (let i = 1; i < swash.length; i += 1) {
          const grow = (swash[i].r - swash[i - 1].r) / Math.max(1e-6, Math.hypot(swash[i].x - swash[i - 1].x, swash[i].y - swash[i - 1].y));
          assert.ok(grow <= 0.3, `teardrop ${seed}: the drop swells ${grow.toFixed(2)} of a radius a radius along`);
        }
        assert.ok(swash.at(-1).r >= middle * 1.8, `teardrop ${seed}: the drop is only ${(swash.at(-1).r / middle).toFixed(2)} of the bar`);
      }
      if (end === "taper") assert.ok(swash.at(-1).r < middle * 0.4, `taper ${seed}: the flick ends ${(swash.at(-1).r / middle).toFixed(2)} of the bar`);
    }
  }
});

check("a hand held to a most weight never swells past it, its balls and swellings stacked", () => {
  const area = { x: 0, y: 0, w: 4000, h: 4000 };
  const recipe = { weight: 0.064, pressure: 0, bulb: 0.4, balls: 1, bulbReach: 6, footBalls: 0, maxWeight: 1.35, wobble: 0, smooth: 1, spline: true, bow: 0, wave: 0, pen: { kind: "pressure", thin: 0.62 }, swell: { neck: 0.8, amount: [0.15, 0.35], reach: 0.1 }, drip: 0, dripLength: [0, 0], droplets: 0 };
  let beads = 0;
  for (const ch of "abcdefghijklmnopqrstuvwxyz") {
    for (let seed = 1; seed <= 6; seed += 1) {
      const g = { glyph: ST.strokeGlyphs("goo", ch)[0], x: 400, y: 900, sx: 400, sy: 400, angle: 0, skew: 0, seed, char: ch };
      const { chains, strokes } = LQ.pasteGlyph(g, recipe, Infinity, area);
      const most = recipe.weight * 400 * recipe.maxWeight;
      for (const chain of chains.slice(0, strokes)) {
        if (chain.length < 2) continue;
        for (const b of chain) {
          beads += 1;
          assert.ok(b.r <= most + 1e-6, `${ch} ${seed}: a bead ${(b.r / (recipe.weight * 400)).toFixed(2)} of the weight`);
        }
      }
    }
  }
  assert.ok(beads > 2000);
});

check("a stroke drawn through its points is smooth: no corner but the font's cusps, and every point kept", () => {
  const coarse = [[0, 0], [10, 0], [20, 6], [26, 16], [28, 28]];
  const smooth = LQ.smoothStroke(coarse);
  for (const p of coarse) assert.ok(smooth.some(([x, y]) => Math.hypot(x - p[0], y - p[1]) < 1e-9), "a point of the font was lost");
  let sharpest = 0;
  for (let i = 1; i < smooth.length - 1; i += 1) {
    const [a, b, c] = [smooth[i - 1], smooth[i], smooth[i + 1]];
    const u = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const v = Math.atan2(c[1] - b[1], c[0] - b[0]);
    sharpest = Math.max(sharpest, Math.abs(Math.atan2(Math.sin(v - u), Math.cos(v - u))));
  }
  assert.ok(sharpest < 0.2, `a ${((sharpest * 180) / Math.PI).toFixed(0)} degree kink`);
  // A cusp, where the stroke turns back, stays a cusp rather than a loop.
  const cusp = LQ.smoothStroke([[0, 0], [0, 10], [0, 20], [3, 10], [6, 0]]);
  assert.ok(cusp.some(([x, y]) => x === 0 && y === 20));
  assert.ok(Math.max(...cusp.map(([, y]) => y)) <= 20 + 1e-9, "the cusp overshot into a loop");
});

check("the pen rules: a brush is heavy going down and light going up, a nib heavy across its edge", () => {
  const line = (dx, dy) => Array.from({ length: 12 }, (_, i) => [i * dx, i * dy]);
  const mid = (pts, pen) => LQ.penWeights(pts, pen)[6];
  const brush = { kind: "pressure", thin: 0.25 };
  assert.ok(near(mid(line(0, 1), brush), 1, 0.02), "a downstroke is not full weight");
  assert.ok(mid(line(1, -0.6), brush) < 0.35, "a rising join is not a hairline");
  assert.ok(mid(line(0.2, -1), brush) > 0.3 && mid(line(0.2, -1), brush) < 0.5, "a steep upstroke does not ease off");
  const nib = { kind: "nib", thin: 0.15, angle: Math.PI / 4 };
  // Moving along the edge's own line, thinnest; across it, heaviest.
  assert.ok(mid(line(1, -1), nib) < 0.2 && mid(line(1, 1), nib) > 0.95);
  assert.deepEqual(LQ.penWeights(line(1, 0), undefined), line(1, 0).map(() => 1));
});

check("a mark sits by its ink: an apostrophe close after its letter, however wide its margin", () => {
  const layout = LL.liquidLayout(T.parseTitle("aren't"), { box: { x: 0, y: 0, w: 2000, h: 600 }, fonts: [{ id: "drip", share: 1 }], maxSize: 300, minSize: 40, gap: 0, maxLines: 1, stretch: 1, tracking: 0.01, inkGap: -0.06, jitter: { scale: 0, angle: 0, rise: 0, squash: 0 }, upper: false, align: "left", salt: "t" });
  const [n, mark] = [layout.glyphs[3], layout.glyphs[4]];
  const nEnd = n.x + ST.glyphBox(n.glyph).x1 * n.sx;
  const markStart = mark.x + ST.glyphBox(mark.glyph).x0 * mark.sx;
  assert.ok(markStart - nEnd < 0.12 * mark.sx && markStart - nEnd > 0, `the apostrophe is ${((markStart - nEnd) / mark.sx).toFixed(2)} em from the n`);
});

console.log("paste, set");

/** The closest two beads of two sets of chains come, edge to edge (below zero they overlap). */
function closest(a, b) {
  let best = Infinity;
  for (const ca of a) for (const p of ca) for (const cb of b) for (const q of cb) best = Math.min(best, Math.hypot(p.x - q.x, p.y - q.y) - p.r - q.r);
  return best;
}

check("kerned by their paste, letters keep a thin gap, now and then touching so their paste bridges, never overlapping", () => {
  let pairs = 0;
  let touching = 0;
  for (const style of ["pasty", "pasty-flat"]) {
    for (const title of ["Hello", "kite", "morning routine", "Take up space", "How I *actually* plan my week", ...TITLES.slice(0, 40)]) {
      const op = liquidOf(cover(title, style, "reel", COLOURS.red));
      if (!op) continue;
      const byGlyph = new Map();
      op.chains.slice(0, op.letters).forEach((c, i) => {
        const g = op.glyphOf[i];
        if (!byGlyph.has(g)) byGlyph.set(g, { line: op.lineOf[i], chains: [] });
        byGlyph.get(g).chains.push(c);
      });
      const glyphs = [...byGlyph.entries()].sort((p, q) => p[0] - q[0]).map(([, v]) => v);
      for (let i = 1; i < glyphs.length; i += 1) {
        if (glyphs[i].line !== glyphs[i - 1].line) continue;
        const gap = closest(glyphs[i - 1].chains, glyphs[i].chains);
        pairs += 1;
        // The two letters' own paste, for how near is near.
        const own = [...glyphs[i - 1].chains, ...glyphs[i].chains].flat();
        const r = own.reduce((sum, b) => sum + b.r, 0) / own.length;
        if (gap < r * 0.05) touching += 1;
        else assert.ok(gap > r * 0.2 || style !== "pasty", `${style} "${title}": letters ${i - 1} and ${i} ${gap.toFixed(1)}px apart, bridged by accident`);
        // A touching pair meets, it does not overlap: the pooling makes the bridge.
        assert.ok(gap >= -0.5, `${style} "${title}": letters ${i - 1} and ${i} overlap by ${(-gap).toFixed(1)}px`);
      }
    }
  }
  assert.ok(touching > pairs * 0.05 && touching < pairs * 0.45, `${touching} of ${pairs} pairs touch`);
});

check("a line's paste, its drips included, never reaches the line below", () => {
  let lines = 0;
  for (const title of TITLES.filter((t) => t.includes("\n")).slice(0, 60)) {
    const op = liquidOf(cover(title, "pasty", "reel", COLOURS.red));
    if (!op) continue;
    const byLine = new Map();
    op.chains.slice(0, op.letters).forEach((c, i) => {
      if (!byLine.has(op.lineOf[i])) byLine.set(op.lineOf[i], []);
      byLine.get(op.lineOf[i]).push(c);
    });
    const ids = [...byLine.keys()].sort((p, q) => p - q);
    for (let i = 1; i < ids.length; i += 1) {
      lines += 1;
      const above = byLine.get(ids[i - 1]);
      const below = byLine.get(ids[i]);
      // Only the line above's drips are held back; its letters and the line below's may sit close.
      const lowest = Math.max(...above.flat().map((b) => b.y + b.r));
      const top = Math.min(...below.flat().map((b) => b.y - b.r));
      if (lowest <= top) continue;
      assert.ok(closest(above, below) >= -0.5 || lowest - top < 0, `"${title}": line ${ids[i - 1]} runs into line ${ids[i]}`);
    }
  }
  assert.ok(lines > 20);
});

check("a droplet lands whole on the cover, never cut by its edge", () => {
  for (const format of F.FORMATS) {
    for (const title of TITLES.slice(0, 80)) {
      const op = liquidOf(cover(title, "pasty", format.id, COLOURS.red));
      if (!op) continue;
      for (const drop of op.chains.slice(op.letters)) {
        for (const b of drop) assert.ok(b.x - b.r >= 0 && b.y - b.r >= 0 && b.x + b.r <= format.width && b.y + b.r <= format.height, `${format.id} "${title}"`);
      }
    }
  }
});

check("a word too long for any line is broken between letters, not shrunk to a sliver", () => {
  const scene = cover("W".repeat(60), "pasty", "reel", COLOURS.red);
  const op = liquidOf(scene);
  assert.ok(new Set(op.lineOf).size >= 3, "it was not broken");
  const tallest = Math.max(...op.chains.slice(0, op.letters).flat().map((b) => b.r));
  assert.ok(tallest > 4, `paste ${tallest.toFixed(1)}px thick`);
  assert.ok(inside(F.formatById("reel").safe, scene.readable, 1));
});

check("a layer is known by its paste: moved paste is another layer, the same paste the same, a new colour only new light", () => {
  const a = liquidOf(cover("kite", "pasty", "reel", COLOURS.red));
  const b = liquidOf(cover("kite", "pasty", "reel", COLOURS.red));
  assert.equal(a.key, b.key);
  const moved = a.chains.map((c) => c.map((bead) => ({ ...bead, x: bead.x + 0.5 })));
  assert.notEqual(S.pasteKey(moved, a.colourOf, a.tone, a.finish, a.pool), a.key);
  // The colours are light on the paste, not the paste: dragging a slider makes nothing again.
  const recoloured = liquidOf(cover("kite", "pasty", "reel", { hue: 200, shade: 0.7, ground: "dark" }));
  assert.equal(recoloured.key, a.key);
  assert.notDeepEqual(recoloured.colours, a.colours);
  assert.equal(recoloured.ground, P.GROUNDS.dark);
  assert.notEqual(liquidOf(cover("kite", "pasty", "reel", { seed: 9 })).key, a.key, "the shuffle drew the same paste");
  // Stickery's words move with the plain words beside them, whose widths depend on the face.
  const wide = { ...measurer, width: (face, text) => measurer.width(face, text) * (face.startsWith("plain-") ? 1.15 : 1) };
  const first = liquidOf(cover("*actually* save money on groceries every week", "stickery", "reel", { ...COLOURS.blue, lettering: "goo" }));
  const second = liquidOf(cover("*actually* save money on groceries every week", "stickery", "reel", { ...COLOURS.blue, lettering: "goo" }, wide));
  assert.notEqual(first.key, second.key);
});

check("Stickery with many lines still fits, its stickers apart, its words not dwarfed by their steps", () => {
  const format = F.formatById("reel");
  for (const count of [1, 4, 8, 16, 26]) {
    const title = Array.from({ length: count }, (_, i) => `*${String.fromCharCode(97 + (i % 26))}*`).join("\n");
    const scene = cover(title, "stickery", "reel", { ...COLOURS.green, lettering: "goo" });
    assert.ok(inside(format.safe, scene.readable, 1), `${count} lines leave the safe area`);
    const shapes = scene.ops.filter((op) => op.kind === "shape").map((op) => SP.polygonBounds(op.polygons));
    assert.equal(shapes.length, count);
    for (let i = 1; i < shapes.length; i += 1) assert.ok(shapes[i].y >= shapes[i - 1].y + shapes[i - 1].h, `${count} lines: stickers ${i - 1} and ${i} overlap`);
    const op = liquidOf(scene);
    const paste = op.chains.flat();
    const inkHeight = Math.max(...paste.map((b) => b.y + b.r)) - Math.min(...paste.map((b) => b.y - b.r));
    assert.equal(scene.ops.filter((o) => o.kind === "liquid").length, 1, "every liquid word is one layer");
    assert.ok(inkHeight > 0);
  }
});

check("a long line wraps inside its sticker rather than becoming a strip", () => {
  const scene = cover("this is a rather long line of plain words with one *liquid* word in it", "stickery", "reel", COLOURS.purple);
  const [shape] = scene.ops.filter((op) => op.kind === "shape").map((op) => SP.polygonBounds(op.polygons));
  assert.ok(shape.h > shape.w * 0.3, `the sticker is ${shape.w.toFixed(0)} by ${shape.h.toFixed(0)}`);
  const plain = stickerParts(scene).plain.map((p) => p.op);
  assert.ok(new Set(plain.map((op) => Math.round(op.y))).size >= 2, "the plain words did not wrap");
  assert.ok(Math.min(...plain.map((op) => op.size)) > 30);
});

check("Pasty and Pasty Flat letter in Drip, or in Goo as a teardrop or evened out, in their own gel or paste", () => {
  const glyphsOf = (op) => new Set(op.glyphOf).size;
  for (const style of ["pasty", "pasty-flat"]) {
    const drip = liquidOf(cover("what you want", style, "post-4x5", { ...COLOURS.red, pastyLettering: "drip" }));
    for (const lettering of ["goo", "goo-even"]) {
      const op = liquidOf(cover("what you want", style, "post-4x5", { ...COLOURS.red, pastyLettering: lettering }));
      assert.ok(op, `${style} ${lettering}: no paste`);
      assert.notEqual(op.key, drip.key, `${style} ${lettering} is drawn as Drip`);
      assert.equal(op.finish, style === "pasty" ? "gloss" : "flat", `${style} ${lettering}: ${op.finish}`);
      assert.equal(op.ground, P.GROUNDS.light);
      assert.equal(glyphsOf(op), "whatyouwant".length, `${style} ${lettering}: a letter lost`);
      // Goo's letters run into each other and carry no spatter; the evened one swells no further than its cap.
      assert.equal(op.chains.length, op.letters, `${style} ${lettering}: droplets`);
    }
    for (const title of TITLES.slice(0, 30)) {
      for (const lettering of ["goo", "goo-even"]) {
        const scene = cover(title, style, "reel", { pastyLettering: lettering });
        for (const { op, rect } of readableInk(scene)) assert.ok(inside(F.formatById("reel").safe, rect, 1), `${style} ${lettering} "${title}": ${op.kind} outside`);
      }
    }
  }
});

check("the liquid styles lie on the cover's ground and are lit on it", () => {
  for (const ground of ["light", "dark"]) {
    for (const style of ["pasty", "pasty-flat"]) {
      const op = liquidOf(cover("Art is different", style, "reel", { ...COLOURS.green, ground }));
      assert.equal(op.ground, P.GROUNDS[ground], style);
      assert.equal(op.finish, style === "pasty" ? "gloss" : "flat", style);
    }
  }
});

console.log("photo");

check("a photo always covers the whole cover: fitted by its shorter side, zoomed into a window that never runs off it", () => {
  for (const [pw, ph] of [[4000, 3000], [3000, 4000], [1080, 1920], [600, 600]]) {
    for (const format of F.FORMATS) {
      const { width: cw, height: ch } = format;
      const fit = PH.sourceRect(pw, ph, cw, ch, PH.DEFAULT_FRAME);
      // At zoom 1 the window has the cover's shape and reaches one pair of the photo's edges.
      assert.ok(Math.abs(fit.sw / fit.sh - cw / ch) < 1e-6, `${pw}x${ph} on ${format.id}: the window is not the cover's shape`);
      assert.ok(Math.abs(fit.sw - pw) < 1e-6 || Math.abs(fit.sh - ph) < 1e-6, `${pw}x${ph} on ${format.id}: neither side fits`);
      for (const zoom of [1, 1.7, 3, PH.MAX_ZOOM]) {
        for (const [cx, cy] of [[0, 0], [0.5, 0.5], [1, 1], [0.9, 0.1]]) {
          const r = PH.sourceRect(pw, ph, cw, ch, { zoom, cx, cy, flip: false });
          assert.ok(r.sx >= -1e-9 && r.sy >= -1e-9 && r.sx + r.sw <= pw + 1e-9 && r.sy + r.sh <= ph + 1e-9, `${format.id} zoom ${zoom} at ${cx},${cy} runs off the photo`);
          assert.ok(Math.abs(r.sw - fit.sw / zoom) < 1e-6, `zoom ${zoom} does not narrow the window`);
        }
      }
    }
  }
});

check("a photo dragged follows the finger, mirrored with it, and zooms about the point under the pointer", () => {
  const [pw, ph, cw, ch] = [4000, 3000, 1080, 1350];
  const frame = { zoom: 2, cx: 0.5, cy: 0.5, flip: false };
  const moved = PH.panFrame(frame, 100, 50, pw, ph, cw, ch);
  assert.ok(moved.cx < frame.cx && moved.cy < frame.cy, "dragging right and down did not show more of the left and top");
  // The photo's point under the finger is under it still: 100 cover pixels across.
  const before = PH.sourceRect(pw, ph, cw, ch, frame);
  const after = PH.sourceRect(pw, ph, cw, ch, moved);
  assert.ok(Math.abs((before.sx - after.sx) / (before.sw / cw) - 100) < 1e-6);
  const mirrored = PH.panFrame({ ...frame, flip: true }, 100, 0, pw, ph, cw, ch);
  assert.ok(mirrored.cx > frame.cx, "a mirrored photo dragged right moved the wrong way");
  // Never off the photo, however far it is dragged.
  const far = PH.sourceRect(pw, ph, cw, ch, PH.panFrame(frame, 1e6, -1e6, pw, ph, cw, ch));
  assert.ok(far.sx === 0 && Math.abs(far.sy + far.sh - ph) < 1e-6);
  for (const flip of [false, true]) {
    for (const at of [{ x: 200, y: 300 }, { x: 900, y: 1200 }, { x: 540, y: 675 }]) {
      const f = { zoom: 1.5, cx: 0.4, cy: 0.6, flip };
      const z = PH.zoomFrame(f, 1.8, at, pw, ph, cw, ch);
      const a = PH.sourceRect(pw, ph, cw, ch, f);
      const b = PH.sourceRect(pw, ph, cw, ch, z);
      const u = flip ? 1 - at.x / cw : at.x / cw;
      const pa = { x: a.sx + u * a.sw, y: a.sy + (at.y / ch) * a.sh };
      const pb = { x: b.sx + u * b.sw, y: b.sy + (at.y / ch) * b.sh };
      assert.ok(Math.hypot(pa.x - pb.x, pa.y - pb.y) < 0.5, `flip ${flip}: the point under the pointer moved ${Math.hypot(pa.x - pb.x, pa.y - pb.y).toFixed(2)}px`);
      assert.ok(Math.abs(z.zoom - 2.7) < 1e-9);
    }
  }
  assert.equal(PH.zoomFrame({ ...frame, zoom: 4 }, 10, { x: 0, y: 0 }, pw, ph, cw, ch).zoom, PH.MAX_ZOOM);
  assert.equal(PH.zoomFrame(frame, 0.01, { x: 0, y: 0 }, pw, ph, cw, ch).zoom, 1);
});

check("a photo's adjustments do what they say, and nothing when nothing is set", () => {
  const pixel = (r, g, b, adjust) => {
    const data = new Uint8ClampedArray([r, g, b, 200]);
    PH.adjustPixels(data, { ...PH.DEFAULT_ADJUST, ...adjust });
    return [...data];
  };
  const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  for (const c of [[0, 0, 0], [255, 255, 255], [120, 60, 200], [33, 180, 90]]) assert.deepEqual(pixel(...c, {}), [...c, 200], "a neutral photo changed");
  const grey = [128, 128, 128];
  assert.ok(lum(pixel(...grey, { exposure: 1 })) > 160 && lum(pixel(...grey, { exposure: -1 })) < 100, "exposure");
  assert.ok(lum(pixel(...grey, { brightness: 0.5 })) > 150 && lum(pixel(...grey, { brightness: -0.5 })) < 110, "brightness");
  const dark = pixel(40, 40, 40, { contrast: 0.6 });
  const light = pixel(215, 215, 215, { contrast: 0.6 });
  assert.ok(dark[0] < 30 && light[0] > 225, "contrast did not spread the values");
  const flat = pixel(40, 200, 90, { contrast: -1 });
  assert.ok(flat.slice(0, 3).every((v) => Math.abs(v - 128) <= 1), `contrast at -1 is ${flat}`);
  const mono = pixel(200, 60, 30, { saturation: -1 });
  assert.ok(Math.abs(mono[0] - mono[1]) <= 1 && Math.abs(mono[1] - mono[2]) <= 1, `saturation at -1 left colour: ${mono}`);
  const vivid = pixel(160, 110, 100, { saturation: 0.8 });
  assert.ok(vivid[0] - vivid[2] > 60 - 1, "saturation did not deepen the colour");
  const warm = pixel(...grey, { temperature: 1 });
  const cool = pixel(...grey, { temperature: -1 });
  assert.ok(warm[0] > warm[2] + 20 && cool[2] > cool[0] + 20, "temperature");
  const magenta = pixel(...grey, { tint: 1 });
  assert.ok(magenta[1] < magenta[0] - 10, "tint");
  // Hue turns the colour round: half a turn either way is the same, a full turn is where it began.
  assert.deepEqual(pixel(200, 60, 30, { hue: 180 }), pixel(200, 60, 30, { hue: -180 }));
  const red = pixel(200, 40, 40, { hue: 120 });
  assert.ok(red[1] > red[0], `a red turned a third is not green: ${red}`);
  const dimmed = pixel(200, 200, 200, { dim: 1 });
  assert.ok(Math.abs(dimmed[0] - 70) <= 1, `dim at full is ${dimmed[0]}`);
  // Read back held to its range; the label reads as the slider means.
  assert.deepEqual(PH.readAdjust({ exposure: 9, hue: -400, dim: "a lot", contrast: 0.25 }), { ...PH.DEFAULT_ADJUST, exposure: 2, hue: -180, contrast: 0.25 });
  assert.deepEqual(PH.readFrame({ zoom: 50, cx: -1, cy: 2, flip: "yes" }), { zoom: PH.MAX_ZOOM, cx: 0, cy: 1, flip: false });
  assert.equal(PH.adjustLabel("exposure", 0.5), "+0.5 EV");
  assert.equal(PH.adjustLabel("contrast", -0.12), "-12%");
  assert.equal(PH.adjustLabel("hue", 30), "30°");
  assert.equal(PH.adjustLabel("dim", 0.4), "40%");
});

check("on a photo the paste has no ground: its shadow is a layer of its own, white where it falls on nothing", () => {
  const scene = cover("Hello", "pasty", "post-4x5", { photo: true });
  assert.deepEqual(scene.ops.slice(0, 2).map((op) => op.kind), ["fill", "photo"]);
  const op = liquidOf(scene);
  assert.equal(op.ground, null);
  assert.equal(op.shadow, true);
  const plain = liquidOf(cover("Hello", "pasty", "post-4x5"));
  assert.equal(plain.shadow, false);
  assert.ok(!cover("Hello", "pasty", "post-4x5").ops.some((o) => o.kind === "photo"));
  // The field is the same paste either way; only how it is lit changes.
  assert.equal(op.key, plain.key);
  for (const finish of ["gloss"]) {
    const field = LR.liquidField(paintOf(finish, [Array.from({ length: 9 }, (_, i) => ({ x: 200 + i * 15, y: 200, r: 30 }))]), TARGET);
    const shadow = LR.shadeField(field, { colours: ["#9E1B1B"], ground: null, shadow: true });
    const at = (x, y) => {
      const o = ((y - shadow.y) * shadow.w + (x - shadow.x)) * 4;
      return [shadow.data[o], shadow.data[o + 1], shadow.data[o + 2], shadow.data[o + 3]];
    };
    // Every pixel is opaque, to multiply by; far from the paste, white; down and to the right of it (away from the light), darker.
    for (let i = 3; i < shadow.data.length; i += 4) assert.equal(shadow.data[i], 255);
    assert.deepEqual(at(shadow.x + 2, shadow.y + 2), [255, 255, 255, 255], `${finish}: shadow where none falls`);
    const below = at(260, 236);
    assert.ok(below[0] < 250, `${finish}: no shadow beside the paste (${below})`);
  }
  // Stickery's paste lies on its stickers: no shadow, photo or none.
  assert.equal(liquidOf(cover("*Hello*", "stickery", "post-4x5", { photo: true, lettering: "goo" })).shadow, false);
});

console.log("placing");

{
  // A box off the middle, as letters usually are, and placements of every kind: turned, scaled, stretched.
  const RECT = { x: 180, y: 520, w: 640, h: 300 };
  const PLACES = [
    PL.HOME,
    { x: 0, y: 0, angle: 0, sx: 1.5, sy: 1.5 },
    { x: 60, y: -140, angle: 0.4, sx: 0.8, sy: 0.8 },
    { x: -200, y: 300, angle: -2.2, sx: 1.3, sy: 0.6 },
    { x: 15, y: 15, angle: Math.PI / 2, sx: 2.4, sy: 1.1 },
  ];
  const close = (p, q, e = 1e-6) => near(p.x, q.x, e) && near(p.y, q.y, e);

  check("a placement maps about the box's middle: home moves nothing, and the middle goes where it is moved", () => {
    PL.placeMatrix(RECT, PL.HOME).forEach((v, i) => assert.ok(near(v, [1, 0, 0, 1, 0, 0][i], 1e-12)));
    for (const place of PLACES) {
      const m = PL.placeMatrix(RECT, place);
      const c = PL.centre(RECT);
      assert.ok(close(PL.apply(m, c), { x: c.x + place.x, y: c.y + place.y }));
      // Undone by its inverse, and composed in the order named.
      const p = { x: 333, y: 777 };
      assert.ok(close(PL.apply(PL.invert(m), PL.apply(m, p)), p, 1e-6));
      const n = PL.placeMatrix(RECT, PLACES[2]);
      assert.ok(close(PL.apply(PL.multiply(m, n), p), PL.apply(m, PL.apply(n, p)), 1e-6));
      // A box's own corners land where boxCorners says, and the box is inside what it maps to.
      const corners = PL.boxCorners(RECT, place);
      const b = PL.mappedBounds(m, RECT);
      for (const k of corners) assert.ok(k.x >= b.x - 1e-6 && k.x <= b.x + b.w + 1e-6 && k.y >= b.y - 1e-6 && k.y <= b.y + b.h + 1e-6);
      assert.ok(near(Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y), RECT.w * Math.abs(place.sx), 1e-6));
      assert.ok(near(Math.hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y), RECT.h * Math.abs(place.sy), 1e-6));
    }
    assert.ok(PL.isHome(PL.HOME) && !PL.isHome(PLACES[1]));
  });

  check("a corner dragged scales keeping the box's shape, the opposite corner staying put; free, the corner lands on the pointer", () => {
    for (const place of PLACES) {
      for (const h of PL.HANDLES.filter((h) => h.u && h.v)) {
        const anchor = PL.boxPoint(RECT, place, -h.u, -h.v);
        const grabbed = PL.boxPoint(RECT, place, h.u, h.v);
        for (const [dx, dy] of [[40, 25], [-60, 10], [5, -80], [120, 90]]) {
          const p = { x: grabbed.x + dx, y: grabbed.y + dy };
          const next = PL.dragHandle(RECT, place, h, p);
          assert.ok(close(PL.boxPoint(RECT, next, -h.u, -h.v), anchor, 1e-6), `${h.id}: the opposite corner moved`);
          assert.ok(near(next.sx / next.sy, place.sx / place.sy, 1e-9), `${h.id}: the box changed shape`);
          assert.equal(next.angle, place.angle);
          const free = PL.dragHandle(RECT, place, h, p, { free: true });
          assert.ok(close(PL.boxPoint(RECT, free, -h.u, -h.v), anchor, 1e-6));
          assert.ok(close(PL.boxPoint(RECT, free, h.u, h.v), p, 1e-6), `${h.id}: a free corner is not under the pointer`);
          // From the middle: the middle stays.
          const middle = PL.dragHandle(RECT, place, h, p, { fromMiddle: true });
          assert.ok(close(PL.boxPoint(RECT, middle, 0, 0), PL.boxPoint(RECT, place, 0, 0), 1e-6));
        }
      }
    }
  });

  check("a side dragged stretches one way only, the opposite side staying put; never inside out, never past the limits", () => {
    for (const place of PLACES) {
      for (const h of PL.HANDLES.filter((h) => !h.u !== !h.v)) {
        const anchor = PL.boxPoint(RECT, place, -h.u, -h.v);
        const grabbed = PL.boxPoint(RECT, place, h.u, h.v);
        const next = PL.dragHandle(RECT, place, h, { x: grabbed.x + 37, y: grabbed.y - 21 });
        assert.ok(close(PL.boxPoint(RECT, next, -h.u, -h.v), anchor, 1e-6), `${h.id}: the opposite side moved`);
        if (h.u) assert.equal(next.sy, place.sy);
        else assert.equal(next.sx, place.sx);
        // Dragged right through the opposite side and beyond: held at the least scale, the right way round.
        const through = PL.dragHandle(RECT, place, h, { x: anchor.x - (grabbed.x - anchor.x) * 3, y: anchor.y - (grabbed.y - anchor.y) * 3 });
        const s = h.u ? through.sx : through.sy;
        assert.ok(s > 0 && near(s, PL.MIN_SCALE, 1e-9), `${h.id}: turned inside out (${s})`);
        const far = PL.dragHandle(RECT, place, h, { x: anchor.x + (grabbed.x - anchor.x) * 100, y: anchor.y + (grabbed.y - anchor.y) * 100 });
        assert.ok(near(h.u ? far.sx : far.sy, PL.MAX_SCALE, 1e-9));
      }
    }
  });

  check("the turning handle turns by as far as the pointer goes round, in fifteen degree steps with Shift, drawn to square within three degrees", () => {
    const deg = (a) => (a * 180) / Math.PI;
    for (const place of PLACES) {
      const middle = PL.boxPoint(RECT, place, 0, 0);
      const start = PL.turnHandle(RECT, place, 40);
      const round = (by) => {
        const a = Math.atan2(start.y - middle.y, start.x - middle.x) + (by * Math.PI) / 180;
        const r = Math.hypot(start.x - middle.x, start.y - middle.y) * 1.7;
        return { x: middle.x + Math.cos(a) * r, y: middle.y + Math.sin(a) * r };
      };
      const turned = PL.turnTo(RECT, place, start, round(37));
      assert.ok(near(deg(PL.wrapAngle(turned.angle - place.angle)), 37, 1e-6) || near(Math.abs(deg(turned.angle)) % 90, 0, 1e-6));
      assert.equal(turned.sx, place.sx);
      assert.equal(turned.x, place.x);
      const stepped = PL.turnTo(RECT, place, start, round(37), true);
      assert.ok(near(deg(stepped.angle) / 15, Math.round(deg(stepped.angle) / 15), 1e-9));
    }
    const upright = PL.turnTo(RECT, { ...PL.HOME, angle: (88 * Math.PI) / 180 }, { x: 900, y: 0 }, { x: 900, y: 0 });
    assert.ok(near(upright.angle, Math.PI / 2, 1e-12));
    // The handle sits above the box, or below it where above is off the cover.
    const cover = { w: 1080, h: 1920 };
    assert.equal(PL.turnSide(RECT, PL.HOME, 40, cover), -1);
    const high = { ...PL.HOME, y: -RECT.y - RECT.h / 2 + 10 };
    assert.equal(PL.turnSide(RECT, high, 40, cover), 1);
    const below = PL.turnHandle(RECT, high, 40, 1);
    assert.ok(below.y > PL.boxPoint(RECT, high, 0, 1).y);
  });

  check("two fingers carry the letters under them: moved, scaled and turned so each finger keeps its place on them", () => {
    for (const place of PLACES) {
      const a0 = { x: 400, y: 600 };
      const b0 = { x: 620, y: 760 };
      for (const [a, b] of [
        [{ x: 420, y: 640 }, { x: 700, y: 820 }],
        [{ x: 380, y: 580 }, { x: 560, y: 900 }],
        [{ x: 500, y: 500 }, { x: 610, y: 780 }],
      ]) {
        const next = PL.pinchTo(RECT, place, a0, b0, a, b);
        const under = (p) => PL.apply(PL.placeMatrix(RECT, next), PL.toBox(RECT, place, p));
        assert.ok(close(under(a0), a, 1e-6), "the first finger slid");
        assert.ok(close(under(b0), b, 1e-6), "the second finger slid");
        assert.ok(near(next.sx / next.sy, place.sx / place.sy, 1e-9));
      }
    }
  });

  check("scaled about a point, that point of the letters stays put; turned by an angle, only the angle changes", () => {
    for (const place of PLACES) {
      for (const k of [0.5, 1.07, 3]) {
        const at = { x: 410, y: 655 };
        const next = PL.scaleAbout(RECT, place, k, at);
        const under = PL.apply(PL.placeMatrix(RECT, next), PL.toBox(RECT, place, at));
        assert.ok(close(under, at, 1e-6));
        assert.ok(near(next.sx, place.sx * k, 1e-9) && near(next.sy, place.sy * k, 1e-9));
      }
      // Held to the limits, the point still put.
      const huge = PL.scaleAbout(RECT, place, 1000, { x: 0, y: 0 });
      assert.ok(near(Math.max(Math.abs(huge.sx), Math.abs(huge.sy)), PL.MAX_SCALE, 1e-9));
      const turned = PL.turnBy(place, Math.PI / 12);
      assert.deepEqual({ ...turned, angle: 0 }, { ...place, angle: 0 });
      assert.ok(near(turned.angle, PL.wrapAngle(place.angle + Math.PI / 12), 1e-12));
    }
  });

  check("a moved box is drawn to the cover's middle near it, each way on its own, and kept on the cover", () => {
    const cover = { w: 1080, h: 1920 };
    const c = PL.centre(RECT);
    const near6 = PL.snapToMiddle(RECT, { ...PL.HOME, x: cover.w / 2 - c.x + 6, y: 200 }, cover, 8);
    assert.ok(near6.across && !near6.down);
    assert.equal(near6.place.x, cover.w / 2 - c.x);
    assert.equal(near6.place.y, 200);
    const both = PL.snapToMiddle(RECT, { ...PL.HOME, x: cover.w / 2 - c.x - 7, y: cover.h / 2 - c.y + 7 }, cover, 8);
    assert.ok(both.across && both.down);
    assert.ok(!PL.snapToMiddle(RECT, { ...PL.HOME, x: cover.w / 2 - c.x + 9 }, cover, 8).across);
    const lost = PL.keepOnCover(RECT, { ...PL.HOME, x: 5000, y: -5000 }, cover);
    assert.deepEqual(PL.boxPoint(RECT, lost, 0, 0), { x: cover.w, y: 0 });
    // A press inside the turned box, and only inside it, is on the letters.
    const turned = { ...PL.HOME, angle: Math.PI / 4 };
    assert.ok(PL.insideBox(RECT, turned, c));
    assert.ok(!PL.insideBox(RECT, turned, { x: RECT.x + 4, y: RECT.y + 4 }));
    assert.ok(PL.insideBox(RECT, PL.HOME, { x: RECT.x + 4, y: RECT.y + 4 }));
    assert.ok(PL.insideBox(RECT, PL.HOME, { x: RECT.x - 3, y: c.y }, 4) && !PL.insideBox(RECT, PL.HOME, { x: RECT.x - 3, y: c.y }));
  });

  check("placed letters: home changes nothing; otherwise every word and sticker drawn through the map, paste made again where it lands, the ground and photo left where they are", () => {
    const place = { x: -80, y: 260, angle: 0.5, sx: 1.6, sy: 0.9 };
    for (const style of S.STYLES.map((s) => s.id)) {
      for (const photo of [false, true]) {
        const extra = style === "stickery" ? { lettering: "goo" } : style.startsWith("pasty") ? { pastyLettering: "goo" } : {};
        const base = cover("How I *plan* my week", style, "reel", { photo, ...extra });
        assert.equal(S.placeScene(base, PL.HOME), base);
        const moved = S.placeScene(base, place);
        const m = PL.placeMatrix(base.readable, place);
        // The backdrop is the same ops, first, in the same order.
        const backdrop = base.ops.filter(S.isBackdrop);
        assert.deepEqual(moved.ops.slice(0, backdrop.length), backdrop, style);
        assert.ok(moved.ops.slice(backdrop.length).every((op) => op.kind === "matrix" || op.kind === "liquid"), `${style}: a letter left unplaced`);
        for (const op of moved.ops.filter((o) => o.kind === "matrix")) assert.deepEqual(op.m, m);
        // Everything else is kept, in order.
        const flat = moved.ops.flatMap((op) => (op.kind === "matrix" ? op.ops : [op])).filter((op) => op.kind !== "liquid");
        assert.deepEqual(flat, base.ops.filter((op) => op.kind !== "liquid"), style);
        // Paste: each bead where the map takes it, as thick as the map makes its area, and a new layer.
        const before = S.liquidOps(base);
        const after = S.liquidOps(moved);
        assert.equal(after.length, before.length);
        before.forEach((op, i) => {
          assert.notEqual(after[i].key, op.key);
          op.chains.forEach((chain, j) =>
            chain.forEach((b, k) => {
              const q = after[i].chains[j][k];
              assert.ok(close(q, PL.apply(m, b), 1e-9));
              assert.ok(near(q.r, b.r * Math.sqrt(place.sx * place.sy), 1e-9));
            }),
          );
        });
        assert.deepEqual(moved.readable, PL.mappedBounds(m, base.readable));
        assert.equal(moved.ops.some((op) => op.kind === "photo"), photo);
      }
    }
  });

  check("placed letters are painted through the map: each word where the map takes it", () => {
    const base = cover("Placed here", "editorial", "reel");
    const place = { x: 120, y: -300, angle: -0.7, sx: 1.25, sy: 1.25 };
    const at = (scene) => {
      const ctx = recorder();
      paint(ctx, scene, { scale: 1, font, grain: null });
      return ctx.calls.filter((c) => c.kind === "fillText");
    };
    const home = at(base);
    const moved = at(S.placeScene(base, place));
    assert.equal(moved.length, home.length);
    const m = PL.placeMatrix(base.readable, place);
    home.forEach((call, i) => {
      const want = PL.apply(m, { x: call.at[0], y: call.at[1] });
      assert.ok(near(moved[i].at[0], want.x, 1e-6) && near(moved[i].at[1], want.y, 1e-6), call.text);
    });
  });
}

check("undo goes back a thing done: a run of the same change is one step, a pause or another change a new one", () => {
  let h = H.emptyHistory();
  // A slider dragged: forty moves, a step.
  for (let i = 0; i < 40; i += 1) h = H.record(h, { hue: i }, ["hue"], i * 16);
  assert.equal(h.past.length, 1);
  assert.deepEqual(h.past[0], { hue: 0 });
  // Another field, or the same after a pause: new steps.
  h = H.record(h, { hue: 40 }, ["shade"], 700);
  h = H.record(h, { hue: 40, shade: 1 }, ["shade"], 700 + H.STEP_PAUSE + 1);
  assert.equal(h.past.length, 3);
  // A step never runs past its longest, however steady the typing.
  let t = H.emptyHistory();
  for (let i = 0; i < 60; i += 1) t = H.record(t, i, ["text"], i * 200);
  assert.equal(t.past.length, Math.ceil((60 * 200) / H.STEP_LONGEST));
  // Undo and redo walk back and forth; a new change drops what was undone.
  const u = H.undo(h, "now");
  assert.deepEqual(u.state, { hue: 40, shade: 1 });
  const r = H.redo(u.history, u.state);
  assert.equal(r.state, "now");
  assert.equal(H.redo(r.history, r.state), null);
  const again = H.undo(r.history, "now");
  assert.equal(H.record(again.history, again.state, ["seed"], 99999).future.length, 0);
  assert.equal(H.undo(H.emptyHistory(), 1), null);
  // An undo ends the step growing, so the next change is a step of its own.
  assert.equal(u.history.open, null);
  assert.equal(H.seal(h).open, null);
  // Never more than the most kept.
  let many = H.emptyHistory();
  for (let i = 0; i < 300; i += 1) many = H.record(many, i, [`k${i}`], i);
  assert.equal(many.past.length, H.MOST_STEPS);
  assert.equal(many.past[0], 200);
});

console.log("page");

check("the phone view's post is the grid's at an iPhone's width: three across with their gaps, each 3:4, as every size's grid window is", () => {
  const tile = PHONE.gridTile();
  assert.ok(near(tile.w * PHONE.GRID_COLUMNS + PHONE.GRID_GAP * (PHONE.GRID_COLUMNS - 1), PHONE.PHONE_WIDTH, 1e-9));
  assert.ok(near(tile.h / tile.w, 4 / 3, 1e-12));
  // 393 points across: a post about 130 by 173.
  assert.equal(Math.round(tile.w), 130);
  assert.equal(Math.round(tile.h), 173);
  // Three pixels to a point, so sharp on any phone; the canvas is the grid window's shape.
  assert.equal(PHONE.tilePixels(), Math.round(tile.w * 3));
  for (const format of F.FORMATS) {
    const window = format.grid ?? { x: 0, y: 0, w: format.width, h: format.height };
    assert.ok(near(window.h / window.w, 4 / 3, 0.002), `${format.id}: the grid shows ${window.w} by ${window.h}`);
  }
});

check("the pre-paint script is one valid script", () => {
  assert.doesNotThrow(() => new Function(prepaintScript));
});

check("no em or en dash anywhere in the maker's source", () => {
  const dir = new URL("../src/components/reel-cover-maker/", import.meta.url);
  const files = readdirSync(dir, { recursive: true }).filter((f) => /\.(ts|tsx|css|md)$/.test(f));
  assert.ok(files.length > 20);
  for (const file of files) {
    const text = readFileSync(new URL(file, dir), "utf8");
    assert.ok(!/[\u2013\u2014]/.test(text), `${file} has a dash`);
  }
});

console.log(`\n${passed} checks passed`);
