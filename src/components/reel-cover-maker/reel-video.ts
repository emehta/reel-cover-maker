/**
 * Video: the reel Claude cut, opened from the Reels folder on this Mac and
 * played in the reel's own page. Nothing is uploaded: Reelic reads the
 * folder through the browser and hands the page its files as local links.
 * The owner's sound picks are written back into the reel's folder,
 * `reelic/picks.json`, where Claude reads them. Notes on the reel are said
 * to Claude in the terminal, not left here (the owner's call, 21 Nov).
 *
 * Pure: no DOM, so the tests run it in node.
 */

export interface ReelEntry {
  /** The folder's name, which is what is opened. */
  name: string;
  /** How the list shows it. */
  title: string;
}

/** The files Reelic may write into a reel's `reelic/` folder, and no others. */
export const SAVE_DIR = "reelic";
export const SAVE_FILES = ["picks.json"] as const;
export type SaveFile = (typeof SAVE_FILES)[number];

/** A reel is a folder holding its page at `preview/index.html`. */
export const PAGE_DIR = "preview";
export const PAGE_FILE = "index.html";

/** The most a saved file may be: picks are a few kilobytes. */
const MAX_SAVE = 512 * 1024;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function sentence(words: string): string {
  const plain = words.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return plain ? plain[0].toUpperCase() + plain.slice(1) : "";
}

/** A reel folder's name as the list shows it: "2026-11-20-first-half" is "First half, 20 Nov 2026". */
export function reelTitle(folder: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[-_ ](.+))?$/.exec(folder);
  const month = m ? Number(m[2]) : 0;
  if (!m || month < 1 || month > 12) return sentence(folder) || folder;
  const date = `${Number(m[3])} ${MONTHS[month - 1]} ${m[1]}`;
  return m[4] ? `${sentence(m[4])}, ${date}` : date;
}

/** Newest first: reels are named by their date, so the name sorts them, the latest at the top. */
export function sortReels(names: readonly string[]): ReelEntry[] {
  return [...new Set(names)]
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
    .map((name) => ({ name, title: reelTitle(name) }));
}

/** The reel to open: the one opened last if it is still there, else the newest. */
export function pickReel(reels: readonly ReelEntry[], last: string | null): string | null {
  if (last && reels.some((r) => r.name === last)) return last;
  return reels[0]?.name ?? null;
}

export function isSaveFile(name: unknown): name is SaveFile {
  return typeof name === "string" && (SAVE_FILES as readonly string[]).includes(name);
}

/** What was saved in a reel's folder, read back: JSON that does not parse is as if it were not there. */
export interface Saved {
  picks?: Record<string, unknown>;
}

function objectOf(text: string | undefined): Record<string, unknown> | undefined {
  if (text === undefined) return undefined;
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

export function readSaved(files: Partial<Record<SaveFile, string>>): Saved {
  const saved: Saved = {};
  const picks = objectOf(files["picks.json"]);
  if (picks) saved.picks = picks;
  return saved;
}

/** What the reel's page is handed: its files by their paths in `preview/`, and the rest. */
export interface Boot {
  files: Record<string, string>;
  saved: Saved;
  reels: ReelEntry[];
  reel: string;
  /** Where to start playing, when a new version of the reel opens in place of the old. */
  resume?: number;
}

/**
 * The reel's page with what Reelic hands it put first, before anything of
 * its own runs: `data-embed` on its root (its Reelic look, from the first
 * frame) and `window.REELIC`. The JSON is written so nothing in it can end
 * the script early.
 */
export function embedPage(html: string, boot: Boot): string {
  const json = JSON.stringify(boot)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  const head =
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    `<script>document.documentElement.setAttribute("data-embed","");window.REELIC=${json};</script>`;
  return head + html.replace(/^﻿?\s*<!doctype html>/i, "");
}

/** What the reel's page may ask of Reelic: its sound picks saved, or another reel opened. */
export type ReelMessage = { type: "save"; name: "picks.json"; text: string } | { type: "open"; name: string };

/** A message from the reel's page, checked; anything else is null and ignored. */
export function readMessage(data: unknown): ReelMessage | null {
  if (!data || typeof data !== "object") return null;
  const m = data as Record<string, unknown>;
  if (m.reelic !== 1) return null;
  if (m.type === "save") {
    if (m.name !== "picks.json" || typeof m.text !== "string" || m.text.length > MAX_SAVE) return null;
    return { type: "save", name: "picks.json", text: m.text };
  }
  if (m.type === "open") {
    if (typeof m.name !== "string" || !m.name || m.name.includes("/") || m.name.length > 200) return null;
    return { type: "open", name: m.name };
  }
  return null;
}

/** Files Reelic never hands the page: the Finder's own, and anything hidden. */
export function servesFile(name: string): boolean {
  return !name.startsWith(".");
}
