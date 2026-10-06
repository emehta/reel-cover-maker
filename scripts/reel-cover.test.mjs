/**
 * Reel Cover Maker, checked with no browser. `npm test`.
 *
 * What is wrong here leaves no error on screen: a word that falls outside the
 * part of the cover the profile grid shows, a line that is quietly dropped, a
 * colour pairing Instagram's encoder smears, a file Instagram shrinks. So
 * every style is set over hundreds of titles in every size, against a
 * measurer that stands in for the canvas, and every word is held to the safe
 * area and counted back.
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
const { paint, lightAlpha } = await import("@/components/reel-cover-maker/paint");
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
      }
    }
  };
  walk(scene.ops, null);
  return out;
}

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

check("a poster runs its widest line the full width, and keeps typed lines", () => {
  const box = { x: 0, y: 0, w: 900, h: 1200 };
  const spec = { box, face: "condensed", emphasisFace: "condensed", maxSize: 520, minSize: 56, gap: 0.085, align: "left", maxLines: 6 };
  const block = L.stack(T.parseTitle("HOW I SAVE MONEY"), spec, measurer);
  assert.ok(Math.max(...block.lines.map((l) => l.width)) > box.w * 0.98);
  const typed = L.stack(T.parseTitle("ONE\nTWO WORDS"), spec, measurer);
  assert.deepEqual(typed.lines.map((l) => l.segments.map((s) => s.text).join(" ")), ["ONE", "TWO WORDS"]);
});

check("a poster's lines never touch: each starts below the last one's ink", () => {
  const box = { x: 0, y: 0, w: 900, h: 1200 };
  const spec = { box, face: "condensed", emphasisFace: "condensed", maxSize: 520, minSize: 56, gap: 0.085, align: "left", maxLines: 6 };
  for (const title of TITLES.slice(0, 120)) {
    const block = L.stack(T.parseTitle(title.toLocaleUpperCase()), spec, measurer);
    for (let i = 1; i < block.lines.length; i += 1) {
      const above = block.lines[i - 1];
      const line = block.lines[i];
      assert.ok(line.baseline - line.ascent >= above.baseline + above.descent - 1e-6, `overlap in "${title}"`);
    }
  }
});

console.log("covers");

check("every style keeps every word inside the safe area, in every size, over 410 titles, its overhanging ink too", () => {
  let scenes = 0;
  for (const format of F.FORMATS) {
    for (const style of S.STYLES) {
      for (const title of TITLES) {
        const scene = S.buildScene({ title, style: style.id, palette: "ink", format: format.id }, measurer);
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
  assert.ok(scenes > 7000);
});

check("no word is dropped or doubled: the drawn text is the typed text", () => {
  for (const format of F.FORMATS) {
    for (const style of S.STYLES) {
      for (const title of TITLES) {
        const scene = S.buildScene({ title, style: style.id, palette: "paper", format: format.id }, measurer);
        const typed = stripSpaces(T.plainTitle(title));
        const expected = style.id === "poster" || style.id === "echo" ? typed.toLocaleUpperCase() : typed;
        assert.equal(stripSpaces(mainText(scene)), expected, `${style.id} ${format.id} "${title}"`);
      }
    }
  }
});

check("even the longest unbroken title stays inside the safe area", () => {
  for (const format of F.FORMATS) {
    for (const style of S.STYLES) {
      for (const title of PATHOLOGICAL) {
        const scene = S.buildScene({ title, style: style.id, palette: "ink", format: format.id }, measurer);
        for (const { rect } of readableInk(scene)) assert.ok(inside(format.safe, rect, 1), `${style.id} ${format.id} "${title}"`);
        assert.ok(inside(format.safe, scene.readable, 1), `${style.id} ${format.id} "${title}" readable area`);
      }
    }
  }
});

check("Echo repeats the title in outline toward both edges, never a copy wholly off the cover", () => {
  for (const format of F.FORMATS) {
    const scene = S.buildScene({ title: "FOCUS", style: "echo", palette: "ink", format: format.id }, measurer);
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
  const scene = S.buildScene({ title: "hello world", style: "mono", palette: "ink", format: "reel" }, measurer);
  const caret = scene.ops.at(-1);
  const lastText = scene.ops.filter((op) => op.kind === "text").at(-1);
  assert.equal(caret.kind, "box");
  assert.ok(caret.x > lastText.x + measurer.width(lastText.face, lastText.text) * lastText.size);
  const centre = scene.readable.x + scene.readable.w / 2;
  assert.ok(near(centre, format.safe.x + format.safe.w / 2, 0.01));
});

check("Mono's highlight covers an accented capital, and its cursor stays in when a word is broken", () => {
  const scene = S.buildScene({ title: "*ÉÅ*", style: "mono", palette: "ink", format: "reel" }, measurer);
  const box = scene.ops.find((op) => op.kind === "box");
  const text = scene.ops.find((op) => op.kind === "text");
  assert.ok(box.y <= text.y - measurer.bounds(text.face, text.text).ascent * text.size);
  for (const title of ["https://example.com/very/long/url/path/that/goes", "x".repeat(49)]) {
    const broken = S.buildScene({ title, style: "mono", palette: "ink", format: "reel" }, measurer);
    const caret = broken.ops.at(-1);
    assert.equal(caret.kind, "box");
    assert.ok(inside(F.formatById("reel").safe, caret, 0.01), `"${title}" cursor outside`);
  }
});

check("Sticker turns its labels a little, and each line has its own", () => {
  const scene = S.buildScene({ title: "one two three four five six seven", style: "sticker", palette: "acid", format: "reel" }, measurer);
  const turn = scene.ops.find((op) => op.kind === "turn");
  assert.ok(turn && turn.angle < 0 && turn.angle > -0.1);
  const labels = turn.ops.filter((op) => op.kind === "box" && op.color === P.paletteById("acid").accent);
  const lines = new Set(turn.ops.filter((op) => op.kind === "text").map((op) => op.y));
  assert.equal(labels.length, lines.size);
});

check("the first op fills the whole cover with the palette's ground", () => {
  for (const style of S.STYLES) {
    const scene = S.buildScene({ title: "x", style: style.id, palette: "cobalt", format: "post-4x5" }, measurer);
    assert.deepEqual(scene.ops[0], { kind: "fill", color: P.paletteById("cobalt").bg });
  }
});

console.log("colour");

check("every palette is distinct and every colour a six-digit hex", () => {
  assert.equal(new Set(P.PALETTES.map((p) => p.id)).size, P.PALETTES.length);
  for (const p of P.PALETTES) for (const c of [p.bg, p.ink, p.accent, ...p.glow]) assert.match(c, /^#[0-9A-F]{6}$/i, `${p.id} ${c}`);
});

check("text reads on its ground: 7:1 for the title, 3:1 for the accent", () => {
  for (const p of P.PALETTES) {
    assert.ok(P.contrast(p.ink, p.bg) >= 7, `${p.id} ink on ground ${P.contrast(p.ink, p.bg).toFixed(2)}`);
    assert.ok(P.contrast(p.accent, p.bg) >= 3, `${p.id} accent on ground ${P.contrast(p.accent, p.bg).toFixed(2)}`);
  }
});

check("Glow's text reads at 4.5:1 on the lights behind it, anywhere text can go", () => {
  const blend = (under, over, alpha) => under.map((v, i) => v * (1 - alpha) + over[i] * alpha);
  const hex = (c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
  for (const p of P.PALETTES) {
    for (const f of F.FORMATS) {
      const scene = S.buildScene({ title: "lit", style: "glow", palette: p.id, format: f.id }, measurer);
      const lights = scene.ops.filter((op) => op.kind === "light");
      assert.equal(lights.length, 3);
      for (let y = f.safe.y; y <= f.safe.y + f.safe.h; y += 12) {
        for (let x = f.safe.x; x <= f.safe.x + f.safe.w; x += 12) {
          let ground = P.rgb(p.bg);
          for (const l of lights) ground = blend(ground, P.rgb(l.color), lightAlpha(l.alpha, l.r, Math.hypot(x - l.x, y - l.y)));
          const ratio = P.contrast(p.ink, hex(ground));
          assert.ok(ratio >= 4.5, `${p.id} ${f.id} at ${x},${y}: ${ratio.toFixed(2)}`);
        }
      }
    }
  }
});

check("a light falls away from its centre to nothing at its radius", () => {
  assert.equal(lightAlpha(0.8, 100, 0), 0.8);
  assert.ok(near(lightAlpha(0.8, 100, 35), 0.8 * 0.55));
  assert.equal(lightAlpha(0.8, 100, 100), 0);
  assert.equal(lightAlpha(0.8, 100, 400), 0);
  for (let d = 1; d < 100; d += 1) assert.ok(lightAlpha(1, 100, d) <= lightAlpha(1, 100, d - 1));
});

check("a sticker's text, a highlight's text and an emphasised sticker read at 4.5:1", () => {
  for (const p of P.PALETTES) {
    const onAccent = P.readableOn(p.accent, p);
    assert.ok(P.contrast(onAccent, p.accent) >= 4.5, `${p.id} text on the accent ${P.contrast(onAccent, p.accent).toFixed(2)}`);
    const scene = S.buildScene({ title: "a *b*", style: "sticker", palette: p.id, format: "reel" }, measurer);
    const ops = scene.ops.find((op) => op.kind === "turn").ops;
    const [label, mark] = ops.filter((op) => op.kind === "box");
    const [plain, marked] = ops.filter((op) => op.kind === "text");
    assert.ok(P.contrast(plain.color, label.color) >= 4.5, `${p.id} sticker text`);
    assert.ok(P.contrast(marked.color, mark.color) >= 4.5, `${p.id} emphasised sticker text`);
    assert.ok(P.contrast(mark.color, label.color) >= 4.5, `${p.id} the emphasis is lost on its label`);
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
  const design = { text: "How I *plan*", style: "glow", palette: "plum", format: "post-4x5" };
  assert.deepEqual(D.readDesign(D.writeDesign(design)), design);
});

check("whatever storage holds, the maker opens with something it understands", () => {
  for (const raw of [null, "", "not json", "null", "42", "[1,2]", '"text"', "{}"]) assert.deepEqual(D.readDesign(raw), D.DEFAULT_DESIGN, String(raw));
  const odd = D.readDesign(JSON.stringify({ text: 7, style: "vaporwave", palette: "ink", format: "square" }));
  assert.deepEqual(odd, { ...D.DEFAULT_DESIGN, palette: "ink" });
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
    const scene = S.buildScene({ title: "How I *actually* save money", style: style.id, palette: "ink", format: "reel" }, measurer);
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
  const scene = S.buildScene({ title: "grain", style: "editorial", palette: "paper", format: "reel" }, measurer);
  const without = recorder();
  paint(without, scene, { scale: 1, font, grain: null });
  const withTile = recorder();
  paint(withTile, scene, { scale: 1, font, grain: {} });
  const fills = (ctx) => ctx.calls.filter((c) => c.kind === "fillRect").length;
  assert.equal(fills(withTile), fills(without) + 1);
});

console.log("page");

check("the pre-paint script is one valid script", () => {
  assert.doesNotThrow(() => new Function(prepaintScript));
});

check("no em or en dash anywhere in the maker's source", () => {
  const dir = new URL("../src/components/reel-cover-maker/", import.meta.url);
  for (const file of readdirSync(dir)) {
    const text = readFileSync(new URL(file, dir), "utf8");
    assert.ok(!/[\u2013\u2014]/.test(text), `${file} has a dash`);
  }
});

console.log(`\n${passed} checks passed`);
