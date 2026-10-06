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
const CL = await import("@/components/reel-cover-maker/collage");
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

/** Colours to set covers in: near-black letters on the light ground, and a few others. */
const INK = { hue: 0, shade: 0.02, ground: "light", seed: 0 };
const COLOURS = {
  green: { hue: 140, shade: 0.42 },
  blue: { hue: 255, shade: 0.45 },
  red: { hue: 25, shade: 0.42 },
  purple: { hue: 305, shade: 0.45 },
};
/** A cover for a title in a style and size, in near-black unless told otherwise. */
const cover = (title, style, format = "reel", colour = {}, m = measurer) => S.buildScene({ title, style, format, ...INK, ...colour }, m);

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

check("Mono's highlight covers an accented capital, and its cursor stays in when a word is broken", () => {
  const scene = cover("*ÉÅ*", "mono", "reel");
  const box = scene.ops.find((op) => op.kind === "box");
  const text = scene.ops.find((op) => op.kind === "text");
  assert.ok(box.y <= text.y - measurer.bounds(text.face, text.text).ascent * text.size);
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

check("Mono's highlighted words read on their highlight", () => {
  for (const hue of HUES) {
    const scene = cover("a *b*", "mono", "reel", { hue, shade: 0.5 });
    const mark = scene.ops.find((op) => op.kind === "box");
    const marked = scene.ops.filter((op) => op.kind === "text").at(-1);
    assert.ok(P.contrast(marked.color, mark.color) >= 4.5, `hue ${hue}`);
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
  const design = { text: "How I *plan*", style: "spread", hue: 305, shade: 0.45, ground: "dark", format: "post-4x5", seed: 12345 };
  assert.deepEqual(D.readDesign(D.writeDesign(design)), design);
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

const FONT_IDS = ["drip", "script", "sans"];

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
  assert.notEqual(ST.strokeMetrics("drip").xHeight, ST.strokeMetrics("script").xHeight);
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
  for (const finish of ["gloss", "flat", "matte"]) {
    const img = one(finish);
    assert.equal(alphaAt(img, 200, 200), 255, finish);
    assert.equal(alphaAt(img, img.x, img.y), 0, `${finish} corner`);
    for (let i = 0; i < img.data.length; i += 1) assert.ok(Number.isFinite(img.data[i]));
  }
});

check("on a ground, paste is opaque, and the layer's edge is exactly the ground, so it never shows", () => {
  const ground = P.rgb(GROUND);
  for (const finish of ["gloss", "matte"]) {
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
  for (const finish of ["gloss", "matte"]) {
    const img = one(finish, undefined, GROUND);
    const away = rgbAt(img, Math.round(200 + 44 * 0.57), Math.round(200 + 44 * 0.82));
    const toward = rgbAt(img, Math.round(200 - 44 * 0.57), Math.round(200 - 44 * 0.82));
    assert.ok(lum(away) < lum(toward) - 6, `${finish}: ${away} against ${toward}`);
  }
  const flat = one("flat", undefined, GROUND);
  assert.deepEqual(rgbAt(flat, 200 + 25, 200 + 36), P.rgb(GROUND), "flat paste casts no shadow");
});

check("gel's shadow is a stain of its colour, never grey; matte paste's is grey", () => {
  const stain = (finish) => {
    const [r, g, b] = rgbAt(one(finish, undefined, GROUND), Math.round(200 + 43 * 0.57), Math.round(200 + 43 * 0.82));
    return r - (g + b) / 2;
  };
  const [gr, gg, gb] = P.rgb(GROUND);
  const bare = gr - (gg + gb) / 2;
  assert.ok(stain("gloss") > bare + 3, `gel shadow ${stain("gloss")} against ground ${bare}`);
  assert.ok(Math.abs(stain("matte") - bare) < 3, `matte shadow ${stain("matte")}`);
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

check("a knife cuts a stroke's free ends square, but never an O, which has none", () => {
  const bar = [Array.from({ length: 11 }, (_, i) => ({ x: 100 + i * 20, y: 200, r: 30 }))];
  const round = LR.renderLiquid(paintOf("flat", bar), TARGET, { colours: ["#9E1B1B"], ground: null });
  const square = LR.renderLiquid(paintOf("flat", bar, { square: true }), TARGET, { colours: ["#9E1B1B"], ground: null });
  // Past the end, off the stroke's axis: inside a round end's corner region, outside a square one.
  assert.ok(alphaAt(round, 100 - 22, 200) > 0 && alphaAt(square, 100 - 22, 200) === 0, "the end is not cut");
  assert.ok(alphaAt(square, 100 - 10, 200 + 18) > 0, "the cut took the end's corner");
  const ring = [Array.from({ length: 25 }, (_, i) => ({ x: 200 + 100 * Math.cos((i / 24) * Math.PI * 2), y: 200 + 100 * Math.sin((i / 24) * Math.PI * 2), r: 22 }))];
  const o = LR.renderLiquid(paintOf("flat", ring, { square: true }), TARGET, { colours: ["#9E1B1B"], ground: null });
  assert.equal(alphaAt(o, 300, 200), 255, "the O was cut where it closes");
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

check("Stickery: a sticker per typed line, the colours in turn, starred words in liquid letters, a border that shows", () => {
  const format = F.formatById("reel");
  for (const colour of [COLOURS.green, COLOURS.blue, { hue: 60, shade: 0.85, ground: "dark" }, { hue: 330, shade: 0.7, ground: "dark" }]) {
    const palette = P.paletteFor({ ...INK, ...colour });
    const scene = cover("things *aren't*\n*what* they seem\nand *more*", "stickery", "reel", colour);
    const shapes = scene.ops.filter((op) => op.kind === "shape");
    assert.deepEqual(shapes.map((s) => s.color), [palette.sticker[0], palette.sticker[1], palette.sticker[0]]);
    for (const shape of shapes) assert.ok(P.contrast(shape.stroke, scene.ops[0].color) >= 4.5, `a border lost on the ${colour.ground ?? "light"} ground`);
    // One layer holds every liquid word; each of the three stickers carries some of it.
    const [paste] = scene.ops.filter((op) => op.kind === "liquid");
    assert.equal(paste.ground, null, "Stickery's paste lies on its stickers, not the ground");
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

check("Stickery is laid out by the title and the shuffle: the same seed the same, another seed elsewhere, nothing all to one side", () => {
  const title = "things *aren't*\n*what* they seem\nand *more*\nthan *this*";
  const lefts = (scene) => scene.ops.filter((op) => op.kind === "shape").map((op) => Math.round(SP.polygonBounds(op.polygons).x));
  assert.deepEqual(lefts(cover(title, "stickery")), lefts(cover(title, "stickery")));
  const seeds = [0, 1, 2, 3, 4, 5].map((seed) => lefts(cover(title, "stickery", "reel", { seed })));
  assert.ok(new Set(seeds.map((l) => l.join())).size >= 5, "the shuffle does not move the stickers");
  for (const l of seeds) assert.ok(new Set(l).size > 1, `every sticker starts at ${l[0]}`);
  // Stickers stacked close: a step or so apart, never touching.
  const scene = cover(title, "stickery");
  const boxes = scene.ops.filter((op) => op.kind === "shape").map((op) => SP.polygonBounds(op.polygons));
  const cell = scene.ops.find((op) => op.kind === "shape").strokeWidth / 0.13;
  for (let i = 1; i < boxes.length; i += 1) {
    const gap = boxes[i].y - (boxes[i - 1].y + boxes[i - 1].h);
    assert.ok(gap >= 0 && gap <= cell * 1.2, `stickers ${i - 1} and ${i} are ${gap.toFixed(0)}px apart`);
  }
});

check("Stickery with no stars: each sticker's longest word is the liquid one", () => {
  const scene = cover("do what you desire\nit is what it is", "stickery", "reel", COLOURS.blue);
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

check("kerned by their paste, letters keep a thin gap, now and then touching so their paste bridges, never overlapping", () => {
  let pairs = 0;
  let touching = 0;
  for (const style of ["pasty", "pasty-flat", "spread"]) {
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
        if (style !== "spread") {
          pairs += 1;
          // The two letters' own paste, for how near is near.
          const own = [...glyphs[i - 1].chains, ...glyphs[i].chains].flat();
          const r = own.reduce((sum, b) => sum + b.r, 0) / own.length;
          if (gap < r * 0.05) touching += 1;
          else assert.ok(gap > r * 0.2 || style !== "pasty", `${style} "${title}": letters ${i - 1} and ${i} ${gap.toFixed(1)}px apart, bridged by accident`);
        }
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
  const wide = { ...measurer, width: (face, text) => measurer.width(face, text) * (face === "sans" ? 1.15 : 1) };
  const first = liquidOf(cover("*actually* save money on groceries every week", "stickery", "reel", COLOURS.blue));
  const second = liquidOf(cover("*actually* save money on groceries every week", "stickery", "reel", COLOURS.blue, wide));
  assert.notEqual(first.key, second.key);
});

check("Stickery with many lines still fits, its stickers apart, its words not dwarfed by their steps", () => {
  const format = F.formatById("reel");
  for (const count of [1, 4, 8, 16, 26]) {
    const title = Array.from({ length: count }, (_, i) => `*${String.fromCharCode(97 + (i % 26))}*`).join("\n");
    const scene = cover(title, "stickery", "reel", COLOURS.green);
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
  const plain = scene.ops.filter((op) => op.kind === "text");
  assert.ok(new Set(plain.map((op) => Math.round(op.y))).size >= 2, "the plain words did not wrap");
  assert.ok(Math.min(...plain.map((op) => op.size)) > 30);
});

console.log("collage");

const COLLAGE = { box: { x: 100, y: 300, w: 880, h: 880 }, font: "sans", weight: 0.09, letterGap: 0.045, lineGap: 0.05, wordGap: 0.22, condense: 0.8, maxSize: 900, minSize: 56, jitter: { scale: 0, angle: 0, rise: 0, squash: 0 }, upper: true, salt: "spread" };
/** Each line's ink: left and right of its paste, top and bottom of its capitals. */
function collageLines(layout) {
  const lines = new Map();
  for (const g of layout.glyphs) {
    const box = ST.glyphBox(g.glyph);
    const r = COLLAGE.weight * g.em;
    const ink = { x0: g.x + box.x0 * g.sx - r, x1: g.x + box.x1 * g.sx + r, y0: g.y + box.y0 * g.sy - r, y1: g.y + box.y1 * g.sy + r };
    const l = lines.get(g.line) ?? { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, count: 0 };
    lines.set(g.line, { x0: Math.min(l.x0, ink.x0), x1: Math.max(l.x1, ink.x1), y0: Math.min(l.y0, ink.y0), y1: Math.max(l.y1, ink.y1), count: l.count + 1 });
  }
  return [...lines.values()];
}

check("Spread packs a title into a square, as a collage: full lines run its width, the block about as tall as wide", () => {
  const titles = ["Art is different", "How I actually save money", "The art of doing less", "Less is more says the sign", "this is so satisfying to watch", "what nobody tells you about money in Singapore"];
  for (const title of titles) {
    const layout = CL.collageLayout(T.parseTitle(title), COLLAGE);
    const lines = collageLines(layout);
    const side = COLLAGE.box.w;
    const widest = Math.max(...lines.map((l) => l.x1 - l.x0));
    for (const l of lines) {
      const width = l.x1 - l.x0;
      // A full line runs the width; a small one is a short word, centred.
      if (width > widest * 0.7) assert.ok(Math.abs(width - widest) < widest * 0.04, `"${title}": a line ${width.toFixed(0)}px of ${widest.toFixed(0)}`);
      else assert.ok(Math.abs((l.x0 + l.x1) / 2 - (COLLAGE.box.x + side / 2)) < 2, `"${title}": a small line off centre`);
    }
    const height = Math.max(...lines.map((l) => l.y1)) - Math.min(...lines.map((l) => l.y0));
    assert.ok(height / widest > 0.75 && height / widest < 1.25, `"${title}" is ${widest.toFixed(0)} by ${height.toFixed(0)}`);
    assert.ok(widest <= side + 1 && height <= side + 1, `"${title}" leaves its square`);
    // Every letter kept, in order.
    const letters = layout.glyphs.length + layout.missing.length;
    assert.equal(letters, T.plainTitle(title).replace(/ /g, "").length, title);
  }
});

check("Spread breaks a long word only into pieces of three letters or more, and the shuffle lays it out another way", () => {
  const plans = new Set();
  for (let seed = 0; seed < 12; seed += 1) {
    const layout = CL.collageLayout(T.parseTitle("Art is different"), { ...COLLAGE, salt: `spread#${seed}` });
    const counts = new Map();
    for (const g of layout.glyphs) counts.set(`${g.word}:${g.line}`, (counts.get(`${g.word}:${g.line}`) ?? 0) + 1);
    for (const [key, n] of counts) {
      const word = Number(key.split(":")[0]);
      const pieces = [...counts.keys()].filter((k) => Number(k.split(":")[0]) === word).length;
      if (pieces > 1) assert.ok(n >= 3, `seed ${seed}: a piece of ${n} letters`);
    }
    plans.add(collageLines(layout).map((l) => l.count).join(","));
  }
  assert.ok(plans.size >= 2, "the shuffle always lays the title out alike");
  const a = CL.collageLayout(T.parseTitle("Art is different"), COLLAGE);
  assert.deepEqual(a, CL.collageLayout(T.parseTitle("Art is different"), COLLAGE));
});

check("the liquid styles lie on the cover's ground and are lit on it; Spread's ends are cut square", () => {
  for (const ground of ["light", "dark"]) {
    for (const style of ["pasty", "pasty-flat", "spread"]) {
      const op = liquidOf(cover("Art is different", style, "reel", { ...COLOURS.green, ground }));
      assert.equal(op.ground, P.GROUNDS[ground], style);
      assert.equal(op.square, style === "spread", style);
      assert.equal(op.finish, style === "pasty" ? "gloss" : "matte", style);
    }
  }
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
