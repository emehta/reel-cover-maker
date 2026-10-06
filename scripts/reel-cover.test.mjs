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
const D = await import("@/components/reel-cover-maker/design");
const V = await import("@/components/reel-cover-maker/save");
const G = await import("@/components/reel-cover-maker/grain");
const { paint } = await import("@/components/reel-cover-maker/paint");
const ST = await import("@/components/reel-cover-maker/strokes");
const LQ = await import("@/components/reel-cover-maker/liquid");
const LR = await import("@/components/reel-cover-maker/liquid-render");
const LL = await import("@/components/reel-cover-maker/liquid-layout");
const SP = await import("@/components/reel-cover-maker/stepped");
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
};

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
const measurer = {
  width: advance,
  metrics: (face) => FACE_METRICS[face],
  bounds: (face, text) => {
    const m = FACE_METRICS[face];
    const decomposed = text.normalize("NFD");
    const tall = /[a-z\u0300-\u036f\p{Extended_Pictographic}]/u.test(decomposed) && !/^[A-Z0-9\s]*$/.test(text);
    const italic = face === "serif-italic";
    const accentFirst = /^.[\u0300-\u036f]/u.test(decomposed) ? 0.05 : 0;
    const emojiLast = /\p{Extended_Pictographic}$/u.test(text) ? 0.1 : 0;
    return {
      ascent: tall ? m.ascent : m.cap,
      descent: /[gjpqyQ,;\p{Extended_Pictographic}]/u.test(text) ? m.descent : 0,
      left: (italic ? 0.06 : 0) + accentFirst,
      right: advance(face, text) + (italic ? 0.08 : 0) + emojiLast,
    };
  },
};

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

const LIQUID_STYLES = new Set(["pasty", "pasty-flat", "spread", "stickery"]);
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
        const scene = S.buildScene({ title, style: style.id, palette: "black", format: format.id }, measurer);
        scenes += 1;
        assert.ok(inside(format.safe, scene.readable), `${style.id} ${format.id} "${title}" readable area leaves the safe area`);
        for (const { op, rect } of readableInk(scene)) {
          assert.ok(inside(format.safe, rect), `${style.id} ${format.id} "${title}": ${op.kind} "${op.text ?? ""}" outside the safe area`);
          assert.ok(inside(scene.readable, rect, 1), `${style.id} ${format.id} "${title}": ink outside the area the scene reports`);
        }
        assert.equal(scene.truncated, false, `${style.id} ${format.id} "${title}" was cut short`);
      }
    }
  }
  assert.ok(scenes > 4000);
});

check("no word is dropped or doubled: the drawn text is the typed text", () => {
  for (const format of F.FORMATS) {
    for (const style of S.STYLES.filter((s) => !LIQUID_STYLES.has(s.id))) {
      for (const title of TITLES) {
        const scene = S.buildScene({ title, style: style.id, palette: "green", format: format.id }, measurer);
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
        const scene = S.buildScene({ title, style: style.id, palette: "black", format: format.id }, measurer);
        for (const { rect } of readableInk(scene)) assert.ok(inside(format.safe, rect, 1), `${style.id} ${format.id} "${title}"`);
        assert.ok(inside(format.safe, scene.readable, 1), `${style.id} ${format.id} "${title}" readable area`);
      }
    }
  }
});

check("Echo repeats the title in outline toward both edges, never a copy wholly off the cover", () => {
  for (const format of F.FORMATS) {
    const scene = S.buildScene({ title: "FOCUS", style: "echo", palette: "black", format: format.id }, measurer);
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
  const scene = S.buildScene({ title: "hello world", style: "mono", palette: "black", format: "reel" }, measurer);
  const caret = scene.ops.at(-1);
  const lastText = scene.ops.filter((op) => op.kind === "text").at(-1);
  assert.equal(caret.kind, "box");
  assert.ok(caret.x > lastText.x + measurer.width(lastText.face, lastText.text) * lastText.size);
  const centre = scene.readable.x + scene.readable.w / 2;
  assert.ok(near(centre, format.safe.x + format.safe.w / 2, 0.01));
});

check("Mono's highlight covers an accented capital, and its cursor stays in when a word is broken", () => {
  const scene = S.buildScene({ title: "*ÉÅ*", style: "mono", palette: "black", format: "reel" }, measurer);
  const box = scene.ops.find((op) => op.kind === "box");
  const text = scene.ops.find((op) => op.kind === "text");
  assert.ok(box.y <= text.y - measurer.bounds(text.face, text.text).ascent * text.size);
  for (const title of ["https://example.com/very/long/url/path/that/goes", "x".repeat(49)]) {
    const broken = S.buildScene({ title, style: "mono", palette: "black", format: "reel" }, measurer);
    const caret = broken.ops.at(-1);
    assert.equal(caret.kind, "box");
    assert.ok(inside(F.formatById("reel").safe, caret, 0.01), `"${title}" cursor outside`);
  }
});

check("the first op fills the whole cover with the palette's ground", () => {
  for (const style of S.STYLES) {
    const scene = S.buildScene({ title: "x", style: style.id, palette: "blue", format: "post-4x5" }, measurer);
    assert.deepEqual(scene.ops[0], { kind: "fill", color: P.paletteById("blue").bg });
  }
});

console.log("colour");

check("nine colours, named for the letters, as asked: green, yellow, blue, orange, purple, black, white, brown, a dark red", () => {
  assert.deepEqual(P.PALETTES.map((p) => p.name), ["Green", "Yellow", "Blue", "Orange", "Purple", "Black", "White", "Brown", "Red"]);
  assert.equal(new Set(P.PALETTES.map((p) => p.id)).size, P.PALETTES.length);
  for (const p of P.PALETTES) for (const c of [p.bg, p.ink, p.accent, ...p.sticker]) assert.match(c, /^#[0-9A-F]{6}$/i, `${p.id} ${c}`);
  // The red is a dark one.
  assert.ok(P.luminance(P.paletteById("red").ink) < 0.1);
});

check("the letters read on their plain ground at 4.5:1, an emphasised word at 3:1", () => {
  for (const p of P.PALETTES) {
    assert.ok(P.contrast(p.ink, p.bg) >= 4.5, `${p.id} letters on ground ${P.contrast(p.ink, p.bg).toFixed(2)}`);
    assert.ok(P.contrast(p.accent, p.bg) >= 3, `${p.id} accent on ground ${P.contrast(p.accent, p.bg).toFixed(2)}`);
    assert.notEqual(p.accent, p.ink, `${p.id} emphasis would not show`);
  }
});

check("a sticker's words read on either of its colours at 4.5:1", () => {
  for (const p of P.PALETTES) {
    for (const fill of p.sticker) assert.ok(P.contrast(P.readableOn(fill), fill) >= 4.5, `${p.id} on ${fill}`);
  }
});

check("Mono's highlighted words read on their highlight at 4.5:1", () => {
  for (const p of P.PALETTES) {
    const scene = S.buildScene({ title: "a *b*", style: "mono", palette: p.id, format: "reel" }, measurer);
    const mark = scene.ops.find((op) => op.kind === "box");
    const marked = scene.ops.filter((op) => op.kind === "text").at(-1);
    assert.ok(P.contrast(marked.color, mark.color) >= 4.5, `${p.id} highlighted text`);
  }
});

check("contrast is WCAG's: black on white is 21, a colour on itself 1", () => {
  assert.ok(near(P.contrast("#000000", "#FFFFFF"), 21, 1e-9));
  assert.ok(near(P.contrast("#777777", "#777777"), 1, 1e-9));
  assert.equal(P.withAlpha("#FF5B2E", 0.5), "rgba(255, 91, 46, 0.5)");
});

console.log("memory");

check("a design round-trips through storage", () => {
  const design = { text: "How I *plan*", style: "spread", palette: "purple", format: "post-4x5" };
  assert.deepEqual(D.readDesign(D.writeDesign(design)), design);
});

check("whatever storage holds, the maker opens with something it understands", () => {
  for (const raw of [null, "", "not json", "null", "42", "[1,2]", '"text"', "{}"]) assert.deepEqual(D.readDesign(raw), D.DEFAULT_DESIGN, String(raw));
  const odd = D.readDesign(JSON.stringify({ text: 7, style: "vaporwave", palette: "green", format: "square" }));
  assert.deepEqual(odd, { ...D.DEFAULT_DESIGN, palette: "green" });
  // What the last version stored: its styles and colours are gone, and fall back.
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
    drawImage: (image, x, y) => calls.push({ kind: "drawImage", image, at: [x, y], m: [...m] }),
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
    const scene = S.buildScene({ title: "How I *actually* save money", style: style.id, palette: "black", format: "reel" }, measurer);
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

check("grain is drawn only when there is a tile to draw", () => {
  const scene = S.buildScene({ title: "grain", style: "editorial", palette: "green", format: "reel" }, measurer);
  const without = recorder();
  paint(without, scene, { scale: 1, font, grain: null });
  const withTile = recorder();
  paint(withTile, scene, { scale: 1, font, grain: {} });
  const fills = (ctx) => ctx.calls.filter((c) => c.kind === "fillRect").length;
  assert.equal(fills(withTile), fills(without) + 1);
});

console.log("strokes");

const FONT_IDS = ["elfin", "felix", "script", "sans"];

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
  assert.notEqual(ST.strokeMetrics("elfin").xHeight, ST.strokeMetrics("felix").xHeight);
});

console.log("paste");

const RECIPE = { weight: 0.07, pressure: 0.85, bulb: 0.9, wobble: 0.03, smooth: 2, drip: 1, dripLength: [0.2, 0.6], droplets: 1 };
const AREA = { x: 0, y: 0, w: 1080, h: 1920 };
const placed = (ch, seed, extra = {}) => ({ glyph: ST.strokeGlyphs("elfin", ch)[0], x: 300, y: 900, sx: 300, sy: 300, angle: 0.05, skew: 0, seed, ...extra });

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

check("drips never run below their floor, droplets land in their area, no bead is thinner than a third of the paste", () => {
  const area = { x: 100, y: 500, w: 800, h: 800 };
  for (let seed = 1; seed <= 300; seed += 1) {
    const ch = "abcdefghijklmnopqrstuvwxyz"[seed % 26];
    const floor = 1000 + (seed % 7) * 20;
    const paste = LQ.pasteGlyph(placed(ch, seed), RECIPE, floor, area);
    const r0 = RECIPE.weight * 300;
    for (const chain of paste.chains) {
      for (const b of chain) assert.ok(b.r >= r0 * 0.34 && Number.isFinite(b.x) && Number.isFinite(b.y), `${ch} ${seed} bead`);
    }
    // The drips are the chains after the glyph's own strokes.
    for (const chain of paste.chains.slice(ST.strokeGlyphs("elfin", ch)[0].strokes.length)) {
      for (const b of chain) assert.ok(b.y + b.r <= floor + 1e-6, `${ch} ${seed}: a drip below its floor`);
    }
    for (const drop of paste.droplets) {
      const [d] = drop;
      assert.ok(d.x - d.r >= area.x && d.x + d.r <= area.x + area.w && d.y - d.r >= area.y && d.y + d.r <= area.y + area.h);
    }
  }
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
const one = (finish, chains = [[{ x: 200, y: 200, r: 40 }]]) =>
  LR.renderLiquid({ chains, colours: ["#9E1B1B"], colourOf: chains.map(() => 0), tone: chains.map(() => 1), finish, pool: 12, seed: 3 }, TARGET);
const alphaAt = (img, x, y) => img.data[((y - img.y) * img.w + (x - img.x)) * 4 + 3];

check("a drop of paste covers its disc, and nothing far from it", () => {
  for (const finish of ["gloss", "flat", "matte"]) {
    const img = one(finish);
    assert.equal(alphaAt(img, 200, 200), 255, finish);
    assert.equal(alphaAt(img, img.x, img.y), 0, `${finish} corner`);
    for (let i = 0; i < img.data.length; i += 1) assert.ok(Number.isFinite(img.data[i]));
  }
});

check("gloss and matte paste cast a shadow down and to the right; flat casts none", () => {
  const shadowAt = (img) => alphaAt(img, 200 + 12, 200 + 44);
  assert.ok(shadowAt(one("gloss")) > 0);
  assert.ok(shadowAt(one("matte")) > 0);
  assert.equal(alphaAt(one("flat"), 200 + 12, 200 + 44), 0);
  assert.equal(alphaAt(one("gloss"), 200 - 44, 200 - 44), 0, "no shadow up and to the left");
});

check("gloss paste is lit: a highlight brighter than its body, a body darker than its colour", () => {
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
  inkGap: 0.17,
  jitter: { scale: 0.11, angle: 0.08, rise: 0.045, squash: 0.08 },
  upper: false,
  salt: "pasty",
};

check("every character typed becomes a glyph, or plain text when no hand can draw it", () => {
  for (const title of TITLES) {
    const layout = LL.liquidLayout(T.parseTitle(title), SPEC);
    const expected = T.graphemes(T.plainTitle(title).replace(/ /g, "")).reduce((n, g) => n + Math.max(1, ST.strokeGlyphs("elfin", g).length), 0);
    assert.equal(layout.glyphs.length + layout.missing.length, expected, title);
  }
  assert.equal(LL.liquidLayout(T.parseTitle("Week 👍"), SPEC).missing.map((m) => m.text).join(""), "👍");
});

check("a word is drawn the same wherever it goes, and the same letter differently in another word", () => {
  const kOf = (title) => LL.liquidLayout(T.parseTitle(title), SPEC).glyphs.find((g) => g.glyph === ST.strokeGlyphs("elfin", "k")[0] || g.glyph === ST.strokeGlyphs("felix", "k")[0]);
  const alone = kOf("kite");
  const later = kOf("kite surfing");
  assert.equal(alone.seed, later.seed);
  assert.equal(alone.angle, later.angle);
  const other = kOf("handkerchief");
  assert.notEqual(other.seed, alone.seed);
  assert.notEqual(other.angle, alone.angle);
});

check("Felix draws only capitals, its lowercase being too tight to read as paste", () => {
  const felixLower = new Set([..."abcdefghijklmnopqrstuvwxyz"].map((c) => ST.strokeGlyphs("felix", c)[0]));
  const felixCaps = new Set([..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].map((c) => ST.strokeGlyphs("felix", c)[0]));
  for (const title of TITLES) {
    for (const g of LL.liquidLayout(T.parseTitle(title), SPEC).glyphs) {
      assert.ok(!felixLower.has(g.glyph), `"${title}" drew a Felix lowercase letter`);
    }
  }
  // A word's hand is seeded by the word, so the share is counted over many different words.
  let felix = 0;
  for (let i = 0; i < 300; i += 1) {
    const [first] = LL.liquidLayout(T.parseTitle(`Word${i}`), SPEC).glyphs;
    if (felixCaps.has(first.glyph)) felix += 1;
  }
  assert.ok(felix > 300 * 0.3 && felix < 300 * 0.6, `Felix drew ${felix} of 300 words' capitals`);
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

check("Stickery: a sticker per typed line, the colours in turn, starred words in liquid letters", () => {
  const format = F.formatById("reel");
  for (const palette of P.PALETTES) {
    const scene = S.buildScene({ title: "things *aren't*\n*what* they seem\nand *more*", style: "stickery", palette: palette.id, format: "reel" }, measurer);
    const shapes = scene.ops.filter((op) => op.kind === "shape");
    assert.deepEqual(shapes.map((s) => s.color), [palette.sticker[0], palette.sticker[1], palette.sticker[0]]);
    // One layer holds every liquid word; each of the three stickers carries some of it.
    const [paste] = scene.ops.filter((op) => op.kind === "liquid");
    const carried = shapes.filter((s) => paste.chains.some((c) => s.polygons.some((p) => SP.insidePolygon(p, c[0].x, c[0].y))));
    assert.equal(carried.length, 3, "a starred word is missing from its sticker");
    const plain = scene.ops.filter((op) => op.kind === "text").map((op) => op.text);
    assert.deepEqual(plain, ["things", "they", "seem", "and"]);
    assert.ok(inside(format.safe, scene.readable, 1));
    for (const op of scene.ops.filter((o) => o.kind === "text")) {
      const sticker = shapes.find((s) => s.polygons.some((p) => SP.insidePolygon(p, op.x + 1, op.y - 1)));
      assert.ok(sticker, `"${op.text}" is not on a sticker`);
      assert.equal(op.color, P.readableOn(sticker.color));
    }
  }
});

check("Stickery with no stars: each sticker's longest word is the liquid one", () => {
  const scene = S.buildScene({ title: "do what you desire\nit is what it is", style: "stickery", palette: "blue", format: "reel" }, measurer);
  const [paste] = scene.ops.filter((op) => op.kind === "liquid");
  const shapes = scene.ops.filter((op) => op.kind === "shape");
  assert.equal(shapes.filter((s) => paste.chains.some((c) => s.polygons.some((p) => SP.insidePolygon(p, c[0].x, c[0].y)))).length, 2);
  const plain = scene.ops.filter((op) => op.kind === "text").map((op) => op.text);
  assert.deepEqual(plain, ["do", "what", "you", "it", "is", "it", "is"]);
});

console.log("paste, set");

const liquidOf = (scene) => scene.ops.find((op) => op.kind === "liquid");
/** The closest two beads of two sets of chains come, edge to edge (below zero they overlap). */
function closest(a, b) {
  let best = Infinity;
  for (const ca of a) for (const p of ca) for (const cb of b) for (const q of cb) best = Math.min(best, Math.hypot(p.x - q.x, p.y - q.y) - p.r - q.r);
  return best;
}

check("kerned by their paste, neighbouring letters never touch, however they swell and lean", () => {
  for (const style of ["pasty", "pasty-flat", "spread"]) {
    for (const title of ["Hello", "kite", "morning routine", "Take up space", "How I *actually* plan my week", ...TITLES.slice(0, 40)]) {
      const op = liquidOf(S.buildScene({ title, style, palette: "red", format: "reel" }, measurer));
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
        assert.ok(gap >= -0.5, `${style} "${title}": letters ${i - 1} and ${i} overlap by ${(-gap).toFixed(1)}px`);
      }
    }
  }
});

check("a line's paste, its drips included, never reaches the line below", () => {
  let lines = 0;
  for (const title of TITLES.filter((t) => t.includes("\n")).slice(0, 60)) {
    const op = liquidOf(S.buildScene({ title, style: "pasty", palette: "red", format: "reel" }, measurer));
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
      const op = liquidOf(S.buildScene({ title, style: "pasty", palette: "red", format: format.id }, measurer));
      if (!op) continue;
      for (const drop of op.chains.slice(op.letters)) {
        for (const b of drop) assert.ok(b.x - b.r >= 0 && b.y - b.r >= 0 && b.x + b.r <= format.width && b.y + b.r <= format.height, `${format.id} "${title}"`);
      }
    }
  }
});

check("a word too long for any line is broken between letters, not shrunk to a sliver", () => {
  const scene = S.buildScene({ title: "W".repeat(60), style: "pasty", palette: "red", format: "reel" }, measurer);
  const op = liquidOf(scene);
  assert.ok(new Set(op.lineOf).size >= 3, "it was not broken");
  const tallest = Math.max(...op.chains.slice(0, op.letters).flat().map((b) => b.r));
  assert.ok(tallest > 4, `paste ${tallest.toFixed(1)}px thick`);
  assert.ok(inside(F.formatById("reel").safe, scene.readable, 1));
});

check("a layer is known by its paste: moved paste is another layer, the same paste the same", () => {
  const a = liquidOf(S.buildScene({ title: "kite", style: "pasty", palette: "red", format: "reel" }, measurer));
  const b = liquidOf(S.buildScene({ title: "kite", style: "pasty", palette: "red", format: "reel" }, measurer));
  assert.equal(a.key, b.key);
  const moved = a.chains.map((c) => c.map((bead) => ({ ...bead, x: bead.x + 0.5 })));
  assert.notEqual(S.pasteKey(moved, a.colours, a.colourOf, a.tone, a.finish, a.pool), a.key);
  assert.notEqual(S.pasteKey(a.chains, ["#000000"], a.colourOf, a.tone, a.finish, a.pool), a.key);
  // Stickery's words move with the plain words beside them, whose widths depend on the face.
  const wide = { ...measurer, width: (face, text) => measurer.width(face, text) * (face === "sans" ? 1.15 : 1) };
  const one = liquidOf(S.buildScene({ title: "*actually* save money on groceries every week", style: "stickery", palette: "blue", format: "reel" }, measurer));
  const two = liquidOf(S.buildScene({ title: "*actually* save money on groceries every week", style: "stickery", palette: "blue", format: "reel" }, wide));
  assert.notEqual(one.key, two.key);
});

check("Stickery with many lines still fits, its stickers apart, its words not dwarfed by their steps", () => {
  const format = F.formatById("reel");
  for (const count of [1, 4, 8, 16, 26]) {
    const title = Array.from({ length: count }, (_, i) => `*${String.fromCharCode(97 + (i % 26))}*`).join("\n");
    const scene = S.buildScene({ title, style: "stickery", palette: "green", format: "reel" }, measurer);
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
  const scene = S.buildScene({ title: "this is a rather long line of plain words with one *liquid* word in it", style: "stickery", palette: "purple", format: "reel" }, measurer);
  const [shape] = scene.ops.filter((op) => op.kind === "shape").map((op) => SP.polygonBounds(op.polygons));
  assert.ok(shape.h > shape.w * 0.3, `the sticker is ${shape.w.toFixed(0)} by ${shape.h.toFixed(0)}`);
  const plain = scene.ops.filter((op) => op.kind === "text");
  assert.ok(new Set(plain.map((op) => Math.round(op.y))).size >= 2, "the plain words did not wrap");
  assert.ok(Math.min(...plain.map((op) => op.size)) > 30);
});

console.log("page");

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
