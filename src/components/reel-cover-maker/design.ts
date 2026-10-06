/**
 * What the maker remembers between visits: the title being worked on and the
 * style, colour and size it is made in, so the next cover matches the last
 * one on the grid. Kept in this browser only.
 *
 * Read defensively: storage can hold anything (an older version's shape, a
 * hand edit, nothing at all), and whatever is not understood falls back to
 * the default rather than breaking the page.
 */

import { DEFAULT_FORMAT, isFormatId, type FormatId } from "@/components/reel-cover-maker/formats";
import { DEFAULT_PALETTE, isPaletteId, type PaletteId } from "@/components/reel-cover-maker/palettes";
import { DEFAULT_STYLE, isStyleId, type StyleId } from "@/components/reel-cover-maker/scene";
import { MAX_TITLE_LENGTH } from "@/components/reel-cover-maker/title";

export interface Design {
  text: string;
  style: StyleId;
  palette: PaletteId;
  format: FormatId;
}

export const STORAGE_KEY = "reel-cover-maker:v1";

export const DEFAULT_DESIGN: Design = {
  text: "",
  style: DEFAULT_STYLE,
  palette: DEFAULT_PALETTE,
  format: DEFAULT_FORMAT,
};

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
    text: typeof stored.text === "string" ? stored.text.slice(0, MAX_TITLE_LENGTH) : DEFAULT_DESIGN.text,
    style: isStyleId(stored.style) ? stored.style : DEFAULT_DESIGN.style,
    palette: isPaletteId(stored.palette) ? stored.palette : DEFAULT_DESIGN.palette,
    format: isFormatId(stored.format) ? stored.format : DEFAULT_DESIGN.format,
  };
}

export function writeDesign(design: Design): string {
  return JSON.stringify(design);
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
