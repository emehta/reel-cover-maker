/**
 * What the maker remembers between visits: the title being worked on, the
 * style, Stickery's lettering and plain face and the colour of its letters,
 * Pasty's lettering, the colour (hue, shade and ground), the size, the
 * shuffle, how the photo behind the cover is framed and adjusted (the
 * photo itself is kept in photo-store.ts, being too big for here), and
 * where the letters have been moved to, so the next cover matches the
 * last one on the grid. Kept in this browser only.
 *
 * Read defensively: storage can hold anything (an older version's shape, a
 * hand edit, nothing at all), and whatever is not understood falls back to
 * the default rather than breaking the page.
 */

import { DEFAULT_FORMAT, isFormatId, type FormatId } from "@/components/reel-cover-maker/formats";
import { DEFAULT_PLAIN_FACE, isPlainFaceId, type PlainFaceId } from "@/components/reel-cover-maker/faces";
import { DEFAULT_COLOUR, isGround, isTextMode, type Ground, type TextMode } from "@/components/reel-cover-maker/palettes";
import { DEFAULT_ADJUST, DEFAULT_FRAME, readAdjust, readFrame, type PhotoAdjust, type PhotoFrame } from "@/components/reel-cover-maker/photo";
import { HOME, readPlace, type Place } from "@/components/reel-cover-maker/place";
import {
  DEFAULT_LETTERING,
  DEFAULT_PASTY_LETTERING,
  DEFAULT_STYLE,
  isLetteringId,
  isPastyLetteringId,
  isStyleId,
  type LetteringId,
  type PastyLetteringId,
  type StyleId,
} from "@/components/reel-cover-maker/scene";
import { clipMarked, MAX_TITLE_LENGTH } from "@/components/reel-cover-maker/title";

export interface Design {
  text: string;
  style: StyleId;
  lettering: LetteringId;
  plainFace: PlainFaceId;
  pastyLettering: PastyLetteringId;
  hue: number;
  shade: number;
  ground: Ground;
  /** The colour of Stickery's letters on its stickers; with "colour", the hue and shade of its own two sliders. */
  textMode: TextMode;
  textHue: number;
  textShade: number;
  format: FormatId;
  /** The shuffle: every random choice a style makes is seeded by it as well as by the title. */
  seed: number;
  photoFrame: PhotoFrame;
  photoAdjust: PhotoAdjust;
  /** Where the letters have been moved, turned and scaled to; home is where the style sets them. */
  place: Place;
}

export const STORAGE_KEY = "reel-cover-maker:v1";

/**
 * Which version of the maker wrote a design, so a default changed since
 * can be given to a design that only had the old one: before version 2,
 * Pasty's lettering defaulted to Drip, and a design still on Drip from
 * then takes Goo Teardrop, the default since (the owner's ask, 7 Oct).
 */
export const DESIGN_VERSION = 2;

export const DEFAULT_DESIGN: Design = {
  text: "",
  style: DEFAULT_STYLE,
  lettering: DEFAULT_LETTERING,
  plainFace: DEFAULT_PLAIN_FACE,
  pastyLettering: DEFAULT_PASTY_LETTERING,
  hue: DEFAULT_COLOUR.hue,
  shade: DEFAULT_COLOUR.shade,
  ground: DEFAULT_COLOUR.ground,
  textMode: "auto",
  // A pale tint of the default red, for when a colour of its own is first picked: it reads on that red.
  textHue: DEFAULT_COLOUR.hue,
  textShade: 0.9,
  format: DEFAULT_FORMAT,
  seed: 0,
  photoFrame: DEFAULT_FRAME,
  photoAdjust: DEFAULT_ADJUST,
  place: HOME,
};

const number = (value: unknown, lo: number, hi: number): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= lo && value <= hi ? value : null;

/** A stored design, or the default for anything in it that is missing or not understood. */
export function readDesign(raw: string | null): Design {
  let stored: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) stored = parsed as Record<string, unknown>;
  } catch {
    // Not JSON: start afresh.
  }
  return {
    text: typeof stored.text === "string" ? clipMarked(stored.text, MAX_TITLE_LENGTH) : DEFAULT_DESIGN.text,
    style: isStyleId(stored.style) ? stored.style : DEFAULT_DESIGN.style,
    lettering: isLetteringId(stored.lettering) ? stored.lettering : DEFAULT_DESIGN.lettering,
    plainFace: isPlainFaceId(stored.plainFace) ? stored.plainFace : DEFAULT_DESIGN.plainFace,
    pastyLettering:
      isPastyLetteringId(stored.pastyLettering) && !(stored.pastyLettering === "drip" && !(Number(stored.version) >= 2))
        ? stored.pastyLettering
        : DEFAULT_DESIGN.pastyLettering,
    hue: number(stored.hue, 0, 360) ?? DEFAULT_DESIGN.hue,
    shade: number(stored.shade, 0, 1) ?? DEFAULT_DESIGN.shade,
    ground: isGround(stored.ground) ? stored.ground : DEFAULT_DESIGN.ground,
    textMode: isTextMode(stored.textMode) ? stored.textMode : DEFAULT_DESIGN.textMode,
    textHue: number(stored.textHue, 0, 360) ?? DEFAULT_DESIGN.textHue,
    textShade: number(stored.textShade, 0, 1) ?? DEFAULT_DESIGN.textShade,
    format: isFormatId(stored.format) ? stored.format : DEFAULT_DESIGN.format,
    seed: Number.isInteger(stored.seed) && Math.abs(stored.seed as number) < 2 ** 31 ? (stored.seed as number) : DEFAULT_DESIGN.seed,
    photoFrame: readFrame(stored.photoFrame),
    photoAdjust: readAdjust(stored.photoAdjust),
    place: readPlace(stored.place),
  };
}

export function writeDesign(design: Design): string {
  return JSON.stringify({ ...design, version: DESIGN_VERSION });
}

/** The stored design, or the default where storage is blocked (a private window, a sandboxed frame). */
export function loadDesign(): Design {
  try {
    return readDesign(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_DESIGN;
  }
}

export function saveDesign(design: Design): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, writeDesign(design));
  } catch {
    // Storage full or blocked: the design lives as long as the page does.
  }
}
