/**
 * The typefaces, served from this site by next/font (no request to Google
 * from the visitor's browser), and the means to know they have arrived.
 *
 * A canvas draws in whatever face is loaded at the moment it draws, and a
 * face declared in CSS loads only once something asks for it. So nothing is
 * drawn until every face the title needs has loaded: a preview set in a
 * fallback face would be the wrong picture, and so would its download.
 * Each face is split by script (`unicode-range`), so the title's own
 * characters are what is asked for, and "Łódź" loads the Latin Extended
 * file it needs.
 */

import {
  Archivo_Black,
  Archivo_Narrow,
  Crimson_Pro,
  Fraunces,
  Instrument_Serif,
  Inter_Tight,
  Jost,
  Kaushan_Script,
  Leckerli_One,
  Libre_Caslon_Text,
  Newsreader,
  Outfit,
  Pacifico,
  Sofia_Sans_Condensed,
  Space_Mono,
  Yesteryear,
} from "next/font/google";
import { CORE_FACE_IDS, type FaceId, type Measurer } from "@/components/reel-cover-maker/faces";
import { createFontGate, type FontGate } from "@/components/reel-cover-maker/font-gate";

const instrumentSerif = Instrument_Serif({ weight: "400", style: ["normal", "italic"], subsets: ["latin"] });
const archivoBlack = Archivo_Black({ weight: "400", subsets: ["latin"] });
const spaceMono = Space_Mono({ weight: ["400", "700"], subsets: ["latin"] });

/** Variable, so it sets Stickery's plain words and the maker's own controls at any weight. */
export const interTight = Inter_Tight({ subsets: ["latin"], variable: "--rcm-font-ui" });

// Stickery's plain faces, one weight each, so a choice loads one file a script.
const outfit = Outfit({ weight: "300", subsets: ["latin"] });
const jost = Jost({ weight: "300", subsets: ["latin"] });
const fraunces = Fraunces({ weight: "300", subsets: ["latin"] });
const newsreader = Newsreader({ weight: "300", subsets: ["latin"] });
const sofia = Sofia_Sans_Condensed({ weight: "400", subsets: ["latin"] });
const archivoNarrow = Archivo_Narrow({ weight: "400", subsets: ["latin"] });
const crimson = Crimson_Pro({ weight: "400", subsets: ["latin"] });
const caslon = Libre_Caslon_Text({ weight: "400", subsets: ["latin"] });

// Stickery's funky words, where they are set in a brush script.
const yesteryear = Yesteryear({ weight: "400", subsets: ["latin"] });
const pacifico = Pacifico({ weight: "400", subsets: ["latin"] });
const leckerli = Leckerli_One({ weight: "400", subsets: ["latin"] });
const kaushan = Kaushan_Script({ weight: "400", subsets: ["latin"] });

const FACES: Record<FaceId, { family: string; weight: number; italic: boolean }> = {
  serif: { family: instrumentSerif.style.fontFamily, weight: 400, italic: false },
  "serif-italic": { family: instrumentSerif.style.fontFamily, weight: 400, italic: true },
  sans: { family: interTight.style.fontFamily, weight: 600, italic: false },
  wide: { family: archivoBlack.style.fontFamily, weight: 400, italic: false },
  mono: { family: spaceMono.style.fontFamily, weight: 400, italic: false },
  "mono-bold": { family: spaceMono.style.fontFamily, weight: 700, italic: false },
  "plain-outfit": { family: outfit.style.fontFamily, weight: 300, italic: false },
  "plain-jost": { family: jost.style.fontFamily, weight: 300, italic: false },
  "plain-fraunces": { family: fraunces.style.fontFamily, weight: 300, italic: false },
  "plain-newsreader": { family: newsreader.style.fontFamily, weight: 300, italic: false },
  "plain-sofia": { family: sofia.style.fontFamily, weight: 400, italic: false },
  "plain-archivo": { family: archivoNarrow.style.fontFamily, weight: 400, italic: false },
  "plain-crimson": { family: crimson.style.fontFamily, weight: 400, italic: false },
  "plain-caslon": { family: caslon.style.fontFamily, weight: 400, italic: false },
  "funky-yesteryear": { family: yesteryear.style.fontFamily, weight: 400, italic: false },
  "funky-pacifico": { family: pacifico.style.fontFamily, weight: 400, italic: false },
  "funky-leckerli": { family: leckerli.style.fontFamily, weight: 400, italic: false },
  "funky-kaushan": { family: kaushan.style.fontFamily, weight: 400, italic: false },
};

/** The CSS font for a face at a size in pixels, as a canvas reads it. */
export function fontCss(face: FaceId, size: number): string {
  const { family, weight, italic } = FACES[face];
  return `${italic ? "italic " : ""}${weight} ${size}px ${family}`;
}

/**
 * Characters asked for up front, besides the title's own: every printable
 * letter of the Latin file each face is split into, so typing only ever
 * waits on a character from further afield.
 */
const ALWAYS = (() => {
  let text = "";
  for (let c = 0x20; c <= 0x7e; c += 1) text += String.fromCharCode(c);
  for (let c = 0xa1; c <= 0xff; c += 1) if (c !== 0xad) text += String.fromCharCode(c);
  return `${text}\u2018\u2019\u201c\u201d\u2026\u2022`;
})();

/** A face that never arrives (offline, blocked) must not hold the maker blank for longer than this. */
const PATIENCE_MS = 3000;

/** One gate a face, made on first use (the browser's font set does not exist on the server), so a face is loaded only once a cover asks for it. */
const gates = new Map<FaceId, FontGate>();
const listeners = new Set<() => void>();
/** Moves whenever any face arrives: what a measurer is made for. */
let version = 0;

function told() {
  version += 1;
  for (const listener of listeners) listener();
}

function fontGate(face: FaceId): FontGate {
  let gate = gates.get(face);
  if (!gate) {
    gate = createFontGate(
      {
        load: (text) => document.fonts.load(fontCss(face, 100), text),
        patience: PATIENCE_MS,
        setTimer: (run, ms) => window.setTimeout(run, ms),
      },
      ALWAYS,
    );
    gate.subscribe(told);
    gates.set(face, gate);
  }
  return gate;
}

/** The faces a cover may be drawn in: every core face, and the plain and funky faces Stickery is set in. */
export function facesFor(plain: FaceId, funky?: FaceId | null): FaceId[] {
  return funky ? [...CORE_FACE_IDS, plain, funky] : [...CORE_FACE_IDS, plain];
}

/** For useSyncExternalStore: told whenever a face finishes loading, or fails to. */
export function subscribeFonts(listener: () => void): () => void {
  listeners.add(listener);
  // A file that arrives after its gate stopped waiting for it still redraws the cover.
  const arrived = () => {
    for (const gate of gates.values()) gate.changed();
  };
  document.fonts.addEventListener("loadingdone", arrived);
  document.fonts.addEventListener("loadingerror", arrived);
  return () => {
    listeners.delete(listener);
    document.fonts.removeEventListener("loadingdone", arrived);
    document.fonts.removeEventListener("loadingerror", arrived);
  };
}

/** -1 while a character of `title` is still loading in one of `faces`, else a number that changes each time a face arrives. */
export function fontsSnapshot(title: string, faces: readonly FaceId[]): number {
  for (const face of faces) if (fontGate(face).snapshot(title) < 0) return -1;
  return version;
}

/** Ask each of `faces` for whatever of `title` (and the Latin letters) it has not been asked for. */
export function requestFonts(title: string, faces: readonly FaceId[]): void {
  for (const face of faces) fontGate(face).request(title);
}

/** Text is measured at this size and scaled, which canvas text does in proportion. */
const MEASURE_SIZE = 100;

let measurer: { loads: number; measurer: Measurer } | null = null;

/** A measurer for the faces as loaded now; one per load, so its cache never outlives a face it measured in fallback. */
export function measurerFor(loadsSeen: number): Measurer {
  if (measurer && measurer.loads === loadsSeen) return measurer.measurer;
  const ctx = document.createElement("canvas").getContext("2d");
  const widths = new Map<string, number>();
  const metrics = new Map<FaceId, { cap: number; ascent: number; descent: number }>();
  const bounds = new Map<string, { ascent: number; descent: number; left: number; right: number }>();
  const measure = (face: FaceId, text: string) => {
    if (!ctx) return null;
    ctx.font = fontCss(face, MEASURE_SIZE);
    return ctx.measureText(text);
  };
  const made: Measurer = {
    width(face, text) {
      const key = `${face}\u0000${text}`;
      let width = widths.get(key);
      if (width === undefined) {
        width = (measure(face, text)?.width ?? text.length * MEASURE_SIZE * 0.55) / MEASURE_SIZE;
        widths.set(key, width);
      }
      return width;
    },
    metrics(face) {
      let m = metrics.get(face);
      if (!m) {
        const cap = measure(face, "H")?.actualBoundingBoxAscent ?? 70;
        // Accented capitals reach highest; descenders and commas lowest.
        const ascent = measure(face, "ÅÉÎÑbdfhkl")?.actualBoundingBoxAscent ?? 95;
        const descent = measure(face, "gjpqy,;")?.actualBoundingBoxDescent ?? 25;
        m = { cap: cap / MEASURE_SIZE, ascent: Math.max(cap, ascent) / MEASURE_SIZE, descent: descent / MEASURE_SIZE };
        metrics.set(face, m);
      }
      return m;
    },
    bounds(face, text) {
      const key = `${face}\u0000${text}`;
      let b = bounds.get(key);
      if (!b) {
        const m = measure(face, text);
        b = {
          ascent: (m?.actualBoundingBoxAscent ?? 70) / MEASURE_SIZE,
          descent: Math.max(0, m?.actualBoundingBoxDescent ?? 0) / MEASURE_SIZE,
          left: (m?.actualBoundingBoxLeft ?? 0) / MEASURE_SIZE,
          right: (m?.actualBoundingBoxRight ?? m?.width ?? 0) / MEASURE_SIZE,
        };
        bounds.set(key, b);
      }
      return b;
    },
  };
  measurer = { loads: loadsSeen, measurer: made };
  return made;
}
