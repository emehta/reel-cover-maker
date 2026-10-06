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

import { Anton, Archivo_Black, Instrument_Serif, Inter_Tight, Space_Mono } from "next/font/google";
import { FACE_IDS, type FaceId, type Measurer } from "@/components/reel-cover-maker/faces";
import { createFontGate, type FontGate } from "@/components/reel-cover-maker/font-gate";

const instrumentSerif = Instrument_Serif({ weight: "400", style: ["normal", "italic"], subsets: ["latin"] });
const anton = Anton({ weight: "400", subsets: ["latin"] });
const archivoBlack = Archivo_Black({ weight: "400", subsets: ["latin"] });
const spaceMono = Space_Mono({ weight: ["400", "700"], subsets: ["latin"] });

/** Variable, so it sets the covers' sans at two weights and the maker's own controls at any. */
export const interTight = Inter_Tight({ subsets: ["latin"], variable: "--rcm-font-ui" });

const FACES: Record<FaceId, { family: string; weight: number; italic: boolean }> = {
  serif: { family: instrumentSerif.style.fontFamily, weight: 400, italic: false },
  "serif-italic": { family: instrumentSerif.style.fontFamily, weight: 400, italic: true },
  condensed: { family: anton.style.fontFamily, weight: 400, italic: false },
  sans: { family: interTight.style.fontFamily, weight: 600, italic: false },
  "sans-heavy": { family: interTight.style.fontFamily, weight: 800, italic: false },
  wide: { family: archivoBlack.style.fontFamily, weight: 400, italic: false },
  mono: { family: spaceMono.style.fontFamily, weight: 400, italic: false },
  "mono-bold": { family: spaceMono.style.fontFamily, weight: 700, italic: false },
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

let gate: FontGate | null = null;

/** The one gate for the page, made on first use: the browser's font set does not exist on the server. */
function fontGate(): FontGate {
  gate ??= createFontGate(
    {
      load: (text) => Promise.all(FACE_IDS.map((face) => document.fonts.load(fontCss(face, 100), text))),
      patience: PATIENCE_MS,
      setTimer: (run, ms) => window.setTimeout(run, ms),
    },
    ALWAYS,
  );
  return gate;
}

/** For useSyncExternalStore: told whenever a face finishes loading, or fails to. */
export function subscribeFonts(listener: () => void): () => void {
  const g = fontGate();
  const unsubscribe = g.subscribe(listener);
  // A file that arrives after the gate stopped waiting for it still redraws the cover.
  const arrived = () => g.changed();
  document.fonts.addEventListener("loadingdone", arrived);
  document.fonts.addEventListener("loadingerror", arrived);
  return () => {
    unsubscribe();
    document.fonts.removeEventListener("loadingdone", arrived);
    document.fonts.removeEventListener("loadingerror", arrived);
  };
}

/** -1 while a character of `title` is still loading, else a number that changes each time a face arrives. */
export function fontsSnapshot(title: string): number {
  return fontGate().snapshot(title);
}

/** Ask every face for whatever of `title` (and the Latin letters) it has not been asked for. */
export function requestFonts(title: string): void {
  fontGate().request(title);
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
