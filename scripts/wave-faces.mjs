/**
 * Writes Wave's letters: src/components/reel-cover-maker/wave-faces/*.ts.
 *
 * Wave sets every line to one width, and a canvas cannot set a variable
 * font's width axis (WebKit ignores fontStretch altogether), so the letters
 * are drawn from their outlines rather than as text: each face's capitals,
 * figures and marks, read with HarfBuzz from the font files Google Fonts
 * serves, at weight 900 and at every width where the font's outlines,
 * advances and kerning change course. Between two of those widths every
 * point moves in a straight line (gvar, HVAR and GPOS deltas are linear
 * between their regions' edges), so the page reads any width in between
 * exactly, to the rounding HarfBuzz itself makes.
 *
 * Run it again after changing a face or the characters: `node
 * scripts/wave-faces.mjs`. The fonts are fetched at a pinned commit of
 * google/fonts and checked by their hash, so the output is the same
 * wherever it is run. The files are generated: never edit them by hand.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const hb = await require("harfbuzzjs");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src/components/reel-cover-maker/wave-faces");
const CACHE = join(tmpdir(), "reelic-wave-fonts");

/** Each face, where its file is, the hash it must have, and the settings it is set at. */
const FACES = [
  {
    id: "mona",
    name: "Mona Sans",
    url: "https://raw.githubusercontent.com/google/fonts/8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5/ofl/monasans/MonaSans%5Bwdth,wght%5D.ttf",
    licence: "https://raw.githubusercontent.com/google/fonts/8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5/ofl/monasans/OFL.txt",
    sha256: "fd6e79634b5ae804a45aac7e2e3c2a325b41291fba59034f4732b0135b8475b3",
    wght: 900,
    // Wave sets it at its narrowest, a line widened only a little to meet another: its wider half is never drawn.
    range: [75, 100],
  },
  {
    id: "anton",
    name: "Anton",
    url: "https://raw.githubusercontent.com/google/fonts/cee74d7ca45d66d5c1878c828645c862f2788d2d/ofl/anton/Anton-Regular.ttf",
    licence: "https://raw.githubusercontent.com/google/fonts/cee74d7ca45d66d5c1878c828645c862f2788d2d/ofl/anton/OFL.txt",
    sha256: "a4ba3a92350ebb031da0cb47630ac49eb265082ca1bc0450442f4a83ab947cab",
    wght: null,
  },
  {
    id: "archivo",
    name: "Archivo",
    url: "https://raw.githubusercontent.com/google/fonts/95f4904fc8bcf26d3420fe315560c96417c6dec7/ofl/archivo/Archivo%5Bwdth,wght%5D.ttf",
    licence: "https://raw.githubusercontent.com/google/fonts/95f4904fc8bcf26d3420fe315560c96417c6dec7/ofl/archivo/OFL.txt",
    sha256: "0e094a7d3c7c4c25cf1310c4b30014f1dae9332220b1c2c88f4fa996f0b05053",
    wght: 900,
  },
];

/**
 * The characters drawn: Wave sets its titles in capitals, so the capitals
 * of Latin, Latin-1 and Latin Extended-A, the figures, and the marks and
 * symbols a title is typed with. A face that lacks one leaves it out; the
 * page then draws its base letter, or failing that sets it as text.
 */
const CHARACTERS = [
  ..." !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`{|}~",
  ..."¡¢£¥§©«®°±·»¿×÷",
  ..."ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞ",
  ..."ĀĂĄĆĈĊČĎĐĒĔĖĘĚĜĞĠĢĤĦĨĪĬĮİĴĶĹĻĽĿŁŃŅŇŊŌŎŐŒŔŖŘŚŜŞŠŢŤŦŨŪŬŮŰŲŴŶŸŹŻŽȘȚ",
  ..."‘’‚“”„•…‹›€™\u2013\u2014",
];

/** HarfBuzz is asked for outlines at this many times the font's own units, so a delta is never rounded before it is read. */
const PREC = 64;

async function fetchChecked(url, sha256, name) {
  mkdirSync(CACHE, { recursive: true });
  const file = join(CACHE, name);
  if (!existsSync(file)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  const bytes = readFileSync(file);
  if (sha256 && createHash("sha256").update(bytes).digest("hex") !== sha256) throw new Error(`${name}: not the file pinned (hash differs)`);
  return bytes;
}

/* The tables that say where a variable font's outlines change course. */

function tables(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = v.getUint16(4);
  const out = {};
  for (let i = 0; i < n; i += 1) {
    const at = 12 + i * 16;
    const tag = String.fromCharCode(v.getUint8(at), v.getUint8(at + 1), v.getUint8(at + 2), v.getUint8(at + 3));
    out[tag] = { offset: v.getUint32(at + 8), length: v.getUint32(at + 12) };
  }
  return { v, out };
}

const f2dot14 = (v, at) => v.getInt16(at) / 16384;

/** The font's axes in order, from fvar. */
function axesOf({ v, out }) {
  if (!out.fvar) return [];
  const o = out.fvar.offset;
  const first = o + v.getUint16(o + 4);
  const count = v.getUint16(o + 8);
  const size = v.getUint16(o + 10);
  const axes = [];
  for (let i = 0; i < count; i += 1) {
    const at = first + i * size;
    const tag = String.fromCharCode(v.getUint8(at), v.getUint8(at + 1), v.getUint8(at + 2), v.getUint8(at + 3));
    axes.push({ tag, min: v.getInt32(at + 4) / 65536, def: v.getInt32(at + 8) / 65536, max: v.getInt32(at + 12) / 65536 });
  }
  return axes;
}

/** Each axis's avar map, as [from, to] pairs in normalised coordinates; null where there is none. */
function avarOf({ v, out }, count) {
  if (!out.avar) return Array.from({ length: count }, () => null);
  let at = out.avar.offset + 6;
  const n = v.getUint16(at);
  at += 2;
  const maps = [];
  for (let a = 0; a < n; a += 1) {
    const pairs = v.getUint16(at);
    at += 2;
    const map = [];
    for (let k = 0; k < pairs; k += 1) {
      map.push([f2dot14(v, at), f2dot14(v, at + 2)]);
      at += 4;
    }
    maps.push(map);
  }
  return maps;
}

/** Every coordinate on `axis` at which a gvar tuple, or a region of HVAR's or GDEF's variation store, starts, peaks or ends. */
function regionEdges(t, axis) {
  const { v, out } = t;
  const edges = new Set([-1, 0, 1]);
  if (out.gvar) {
    const o = out.gvar.offset;
    const axisCount = v.getUint16(o + 4);
    const shared = v.getUint16(o + 6);
    const sharedAt = o + v.getUint32(o + 8);
    const glyphs = v.getUint16(o + 12);
    const long = v.getUint16(o + 14) & 1;
    const dataAt = o + v.getUint32(o + 16);
    for (let s = 0; s < shared; s += 1) edges.add(f2dot14(v, sharedAt + (s * axisCount + axis) * 2));
    for (let g = 0; g < glyphs; g += 1) {
      const start = long ? v.getUint32(o + 20 + g * 4) : v.getUint16(o + 20 + g * 2) * 2;
      const end = long ? v.getUint32(o + 20 + (g + 1) * 4) : v.getUint16(o + 20 + (g + 1) * 2) * 2;
      if (end <= start) continue;
      let at = dataAt + start;
      const tuples = v.getUint16(at) & 0x0fff;
      at += 4;
      for (let k = 0; k < tuples; k += 1) {
        const index = v.getUint16(at + 2);
        at += 4;
        if (index & 0x8000) {
          edges.add(f2dot14(v, at + axis * 2));
          at += axisCount * 2;
        }
        if (index & 0x4000) {
          edges.add(f2dot14(v, at + axis * 2));
          edges.add(f2dot14(v, at + (axisCount + axis) * 2));
          at += axisCount * 4;
        }
      }
    }
  }
  const store = (storeAt) => {
    const regions = storeAt + v.getUint32(storeAt + 2);
    const axisCount = v.getUint16(regions);
    const n = v.getUint16(regions + 2);
    for (let r = 0; r < n; r += 1) {
      for (let k = 0; k < 3; k += 1) edges.add(f2dot14(v, regions + 4 + ((r * axisCount + axis) * 3 + k) * 2));
    }
  };
  if (out.HVAR) store(out.HVAR.offset + v.getUint32(out.HVAR.offset + 4));
  if (out.GDEF) {
    const o = out.GDEF.offset;
    const minor = v.getUint16(o + 2);
    // GDEF 1.3 keeps its variation store's offset at 14, after the five offsets before it.
    if (minor >= 3 && v.getUint32(o + 14)) store(o + v.getUint32(o + 14));
  }
  return [...edges].filter((e) => e >= -1 && e <= 1).sort((a, b) => a - b);
}

/** A user coordinate from a normalised one, back through avar and the axis's range. */
function userOf(n, axis, map) {
  let pre = n;
  if (map && map.length > 1) {
    for (let k = 0; k + 1 < map.length; k += 1) {
      const [f0, t0] = map[k];
      const [f1, t1] = map[k + 1];
      if (n >= t0 - 1e-12 && n <= t1 + 1e-12) {
        pre = t1 === t0 ? f0 : f0 + ((n - t0) / (t1 - t0)) * (f1 - f0);
        break;
      }
    }
  }
  return pre < 0 ? axis.def + pre * (axis.def - axis.min) : axis.def + pre * (axis.max - axis.def);
}

/** The widths a face is sampled at: every one where anything in it changes course, in user coordinates. */
function widthsOf(bytes) {
  const t = tables(bytes);
  const axes = axesOf(t);
  const index = axes.findIndex((a) => a.tag === "wdth");
  if (index < 0) return null;
  const axis = axes[index];
  const map = avarOf(t, axes.length)[index];
  const user = new Set(regionEdges(t, index).map((n) => userOf(n, axis, map)));
  // avar's own corners are corners too, before it maps them.
  for (const [from] of map ?? []) user.add(from < 0 ? axis.def + from * (axis.def - axis.min) : axis.def + from * (axis.max - axis.def));
  const widths = [...new Set([...user].map((w) => Math.round(w * 1e4) / 1e4))].filter((w) => w >= axis.min - 1e-9 && w <= axis.max + 1e-9).sort((a, b) => a - b);
  return { axis, widths };
}

/* Reading the letters. */

function fontOf(bytes) {
  const face = hb.createFace(hb.createBlob(bytes), 0);
  const font = hb.createFont(face);
  font.setScale(face.upem * PREC, face.upem * PREC);
  return { face, font, upem: face.upem };
}

function shape(F, text, vars) {
  F.font.setVariations(vars);
  const buf = hb.createBuffer();
  buf.addText(text);
  buf.guessSegmentProperties();
  hb.shape(F.font, buf, "kern");
  const out = buf.json();
  buf.destroy();
  return out;
}

/** An outline as HarfBuzz draws it, in the font's units (y up): its commands and its points. */
function outlineOf(F, gid) {
  const d = F.font.glyphToPath(gid);
  const cmds = [];
  const pts = [];
  const re = /([MLQCZ])([^MLQCZ]*)/g;
  let m;
  while ((m = re.exec(d))) {
    cmds.push(m[1]);
    for (const n of m[2].split(/[ ,]+/).filter(Boolean)) pts.push(Math.round(Number(n) / PREC));
  }
  return { cmds: cmds.join(""), pts };
}

const fixed = (n) => Math.round(n / PREC);

async function build(spec) {
  const bytes = await fetchChecked(spec.url, spec.sha256, `${spec.id}.ttf`);
  const licence = (await fetchChecked(spec.licence, null, `${spec.id}-OFL.txt`)).toString("utf8");
  const F = fontOf(bytes);
  const varying = spec.wght !== null ? widthsOf(bytes) : null;
  const widths = varying ? varying.widths.filter((w) => !spec.range || (w >= spec.range[0] - 1e-9 && w <= spec.range[1] + 1e-9)) : [null];
  const varsAt = (w) => (w === null ? {} : { wght: spec.wght, wdth: w });

  // The characters this face draws itself, each one glyph with nothing substituted.
  // One the font draws as two (Mona Sans's Ŀ, an L and a dot) is left to the page's fallback.
  const unicodes = new Set(F.face.collectUnicodes());
  const gid = new Map();
  for (const c of CHARACTERS) {
    if (!unicodes.has(c.codePointAt(0))) continue;
    const g = shape(F, c, varsAt(widths[0]));
    if (g.length === 1) gid.set(c, g[0].g);
  }
  // One the font draws otherwise next to another (Archivo's backtick, set as another glyph after a letter) is left to the fallback too: the page sets pairs, not whole titles.
  for (const a of [...gid.keys()]) {
    for (const b of [...gid.keys()]) {
      const g = shape(F, a + b, varsAt(widths[0]));
      if (g.length === 2 && g[0].g === gid.get(a) && g[1].g === gid.get(b)) continue;
      if (g.length === 2 && g[0].g === gid.get(a)) gid.delete(b);
      else gid.delete(a);
    }
  }
  const chars = [...gid.keys()];

  const glyphs = {};
  for (const c of chars) {
    const at = widths.map((w) => {
      F.font.setVariations(varsAt(w));
      const g = shape(F, c, varsAt(w))[0];
      return { adv: fixed(g.ax), ...outlineOf(F, g.g) };
    });
    for (const a of at) if (a.cmds !== at[0].cmds || a.pts.length !== at[0].pts.length) throw new Error(`${spec.id} "${c}": its outline changes shape across widths`);
    // Points as given at the first width, and each other width as how far each point is from there.
    glyphs[c] = [at.map((a) => a.adv), at[0].cmds, at[0].pts, ...at.slice(1).map((a) => a.pts.map((p, i) => p - at[0].pts[i]))];
  }

  // Kerning: every pair's offset beyond the first's advance, at every width; a pair kerned nowhere is left out.
  const kern = {};
  for (const a of chars) {
    for (const b of chars) {
      const ks = widths.map((w) => {
        const g = shape(F, a + b, varsAt(w));
        if (g.length !== 2 || g[0].g !== gid.get(a) || g[1].g !== gid.get(b)) throw new Error(`${spec.id} "${a}${b}": substituted`);
        if (g[0].dx || g[0].dy || g[1].dx || g[1].dy) throw new Error(`${spec.id} "${a}${b}": positioned other than by advance`);
        const solo = shape(F, a, varsAt(w))[0].ax;
        return fixed(g[0].ax - solo);
      });
      if (ks.some((k) => k !== 0)) kern[a + b] = ks;
    }
  }

  // Kept by class, as the font keeps it: letters whose kerning is alike on one side share a class there, so a pair is a cell of a small table.
  const rowOf = (a) => chars.map((b) => (kern[a + b] ?? []).join(",")).join(";");
  const colOf = (b) => chars.map((a) => (kern[a + b] ?? []).join(",")).join(";");
  const classes = (keyOf) => {
    const byKey = new Map();
    const out = {};
    for (const c of chars) {
      const key = keyOf(c);
      if (!/\d/.test(key)) continue;
      if (!byKey.has(key)) byKey.set(key, byKey.size + 1);
      out[c] = byKey.get(key);
    }
    return out;
  };
  const left = classes(rowOf);
  const right = classes(colOf);
  const cells = {};
  for (const [pair, ks] of Object.entries(kern)) {
    const [a, b] = [...pair];
    const cell = `${left[a]},${right[b]}`;
    if (cells[cell] && cells[cell].join() !== ks.join()) throw new Error(`${spec.id} "${pair}": its class's cell differs`);
    cells[cell] = ks;
  }
  const kernOf = (a, b, k) => cells[`${left[a]},${right[b]}`]?.[k] ?? 0;

  // Checked: titles shaped whole set exactly as pairs add up, and a width between two samples read in a straight line.
  const random = (() => {
    let s = 20261109;
    return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  })();
  for (let trial = 0; trial < 300; trial += 1) {
    const text = Array.from({ length: 2 + Math.floor(random() * 14) }, () => chars[Math.floor(random() * chars.length)]).join("");
    const k = Math.floor(random() * widths.length);
    const w = widths[k];
    const g = shape(F, text, varsAt(w));
    const cs = [...text];
    if (g.length !== cs.length) throw new Error(`${spec.id} "${text}": ${g.length} glyphs for ${cs.length} characters`);
    let pen = 0;
    let model = 0;
    g.forEach((x, i) => {
      if (x.g !== gid.get(cs[i])) throw new Error(`${spec.id} "${text}": "${cs[i]}" substituted in context`);
      const own = glyphs[cs[i]][0][k] + (i + 1 < cs.length ? kernOf(cs[i], cs[i + 1], k) : 0);
      pen += x.ax / PREC;
      model += own;
    });
    if (Math.abs(pen - model) > cs.length * 0.5 + 0.5) throw new Error(`${spec.id} "${text}" at ${w}: ${pen} by HarfBuzz, ${model} by pairs`);
  }
  let worst = 0;
  if (varying) {
    for (let k = 0; k + 1 < widths.length; k += 1) {
      const w = (widths[k] + widths[k + 1]) / 2;
      const t = (w - widths[k]) / (widths[k + 1] - widths[k]);
      for (const c of chars) {
        F.font.setVariations(varsAt(w));
        const real = outlineOf(F, shape(F, c, varsAt(w))[0].g).pts;
        const [, , p0, ...ds] = glyphs[c];
        const d0 = k === 0 ? null : ds[k - 1];
        const d1 = ds[k];
        real.forEach((p, i) => {
          const a = p0[i] + (d0 ? d0[i] : 0);
          const b = p0[i] + d1[i];
          worst = Math.max(worst, Math.abs(a + (b - a) * t - p));
        });
        const adv = shape(F, c, varsAt(w))[0].ax / PREC;
        const [advs] = glyphs[c];
        worst = Math.max(worst, Math.abs(advs[k] + (advs[k + 1] - advs[k]) * t - adv));
      }
      // Kerning in a straight line too, over a spread of pairs.
      for (let n = 0; n < 400; n += 1) {
        const a = chars[Math.floor(random() * chars.length)];
        const b = chars[Math.floor(random() * chars.length)];
        const g = shape(F, a + b, varsAt(w));
        const real = (g[0].ax - shape(F, a, varsAt(w))[0].ax) / PREC;
        const k0 = kernOf(a, b, k);
        worst = Math.max(worst, Math.abs(k0 + (kernOf(a, b, k + 1) - k0) * t - real));
      }
    }
    if (worst > 1.01) throw new Error(`${spec.id}: a width between samples is ${worst} units off a straight line`);
  }

  const data = { id: spec.id, name: spec.name, upem: F.upem, wght: spec.wght, widths: varying ? widths : null, glyphs, kern: { left, right, cells } };
  const constName = spec.id.toUpperCase();
  const body =
    `// Generated by scripts/wave-faces.mjs from ${spec.name} (SIL Open Font License 1.1, see LICENSE.md). Do not edit by hand.\n` +
    `import type { WaveFaceData } from "@/components/reel-cover-maker/wave-faces/types";\n\n` +
    // Every character past ASCII escaped, so the file is plain ASCII (its dashes among them: the source holds none).
    `export const ${constName}: WaveFaceData = ${JSON.stringify(data).replace(/[\u007f-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`)};\n`;
  writeFileSync(join(OUT, `${spec.id}.ts`), body);
  console.log(`${spec.id}: ${chars.length} characters, ${Object.keys(kern).length} kerned pairs in ${Object.keys(cells).length} cells, widths ${varying ? widths.join(", ") : "none"}, off a line by ${worst.toFixed(2)} at most, ${(body.length / 1024).toFixed(0)} KB`);
  return { spec, licence };
}

mkdirSync(OUT, { recursive: true });
const made = [];
for (const spec of FACES) made.push(await build(spec));

writeFileSync(
  join(OUT, "LICENSE.md"),
  `# Wave's letters\n\n` +
    `The files beside this one are generated by \`scripts/wave-faces.mjs\` from these typefaces, each under the SIL Open Font License, Version 1.1. They hold each face's outlines, advances and kerning at weight 900 (Anton has one weight) and at the widths where they change course, so the page can draw the letters at any width; they are not fonts and cannot be installed as one.\n\n` +
    made.map(({ spec, licence }) => `## ${spec.name}\n\nFrom ${spec.url}\n\n\`\`\`\n${licence.trim()}\n\`\`\`\n`).join("\n"),
);
