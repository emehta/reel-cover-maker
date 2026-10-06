/**
 * The typefaces, served from this site by next/font (no request to Google
 * from the visitor's browser), and the means to know they have arrived.
 *
 * A canvas draws in whatever face is loaded at the moment it draws, and a
 * face declared in CSS loads only once something asks for it. So nothing is
 * drawn until every face the title needs has loaded: a preview set in a
 * fallback face would be the wrong picture, and so would its download.
 * Each face is split by script (`unicode-range`), so the title itself is
 * what is asked for, and "Łódź" loads the Latin Extended file it needs.
 */

import { Anton, Archivo_Black, Instrument_Serif, Inter_Tight, Space_Mono } from "next/font/google";
import { FACE_IDS, type FaceId, type Measurer } from "@/components/reel-cover-maker/faces";

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

/** Letters every title is drawn with besides its own: the placeholder's, and both cases. */
const ALWAYS = "Type your title Aa";

const listeners = new Set<() => void>();
let loads = 0;
/** Safari has answered `check` true before a face was fetched, so nothing counts as ready until one load has finished. */
let firstLoadDone = false;
let waitedLongEnough = false;

function changed() {
  loads += 1;
  for (const listener of listeners) listener();
}

/** For useSyncExternalStore: told whenever a face finishes loading, or fails to. */
export function subscribeFonts(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    document.fonts.addEventListener("loadingdone", changed);
    document.fonts.addEventListener("loadingerror", changed);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      document.fonts.removeEventListener("loadingdone", changed);
      document.fonts.removeEventListener("loadingerror", changed);
    }
  };
}

/**
 * -1 while a face `title` needs is still loading, else a number that changes
 * each time any face finishes, so a measurer made before it is replaced.
 */
export function fontsSnapshot(title: string): number {
  const text = `${title} ${ALWAYS}`;
  const ready =
    waitedLongEnough || (firstLoadDone && FACE_IDS.every((face) => document.fonts.check(fontCss(face, 100), text)));
  return ready ? loads : -1;
}

/** Ask for every face `title` needs and has not loaded. Whatever happens is reported to subscribers. */
export function requestFonts(title: string): void {
  const text = `${title} ${ALWAYS}`;
  const missing = firstLoadDone ? FACE_IDS.filter((face) => !document.fonts.check(fontCss(face, 100), text)) : FACE_IDS;
  if (!missing.length) return;
  const done = () => {
    firstLoadDone = true;
    changed();
  };
  Promise.all(missing.map((face) => document.fonts.load(fontCss(face, 100), text))).then(done, done);
}

/** A face that never arrives (offline, blocked) must not hold the maker blank: after this, draw with what there is. */
export function stopWaitingForFonts(): void {
  if (waitedLongEnough) return;
  waitedLongEnough = true;
  changed();
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
  const bounds = new Map<string, { ascent: number; descent: number }>();
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
        };
        bounds.set(key, b);
      }
      return b;
    },
  };
  measurer = { loads: loadsSeen, measurer: made };
  return made;
}
