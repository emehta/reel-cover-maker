/**
 * Video: the reel Claude cut, opened from the Reels folder on this Mac and
 * played in the reel's own page. Nothing is uploaded: Reelic reads the
 * folder through the browser and hands the page its files as local links.
 * What the owner does to it (sound picks, and notes for Claude) is written
 * back into the reel's folder, `reelic/`, where Claude reads it; Claude
 * marks a note Seen or Done, with a reply, in the same file, and the page
 * shows it.
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
export const SAVE_FILES = ["picks.json", "notes.json"] as const;
export type SaveFile = (typeof SAVE_FILES)[number];

/** A reel is a folder holding its page at `preview/index.html`. */
export const PAGE_DIR = "preview";
export const PAGE_FILE = "index.html";

/** The most a saved file may be: notes and picks are a few kilobytes. */
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

/**
 * A note for Claude: tied to a moment of the reel (`t`, seconds) or to the
 * whole of it (null). The page writes `id`, `t`, `text` and `sent`; Claude
 * writes `seen` (when it read it), `done` and a `reply`.
 */
export interface Note {
  id: string;
  t: number | null;
  text: string;
  sent: string;
  seen?: string;
  done?: boolean;
  reply?: string;
}

/** The longest note, and the most notes a reel keeps. */
export const MAX_NOTE = 4000;
const MAX_NOTES = 500;

function noteOf(value: unknown): Note | null {
  if (!value || typeof value !== "object") return null;
  const n = value as Record<string, unknown>;
  if (typeof n.id !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(n.id)) return null;
  if (typeof n.text !== "string" || !n.text.trim() || n.text.length > MAX_NOTE) return null;
  const t = n.t === null || n.t === undefined ? null : typeof n.t === "number" && Number.isFinite(n.t) && n.t >= 0 ? n.t : undefined;
  if (t === undefined) return null;
  const note: Note = { id: n.id, t, text: n.text, sent: typeof n.sent === "string" ? n.sent : "" };
  if (typeof n.seen === "string" && n.seen) note.seen = n.seen;
  if (n.done === true) note.done = true;
  if (typeof n.reply === "string" && n.reply.trim()) note.reply = n.reply;
  return note;
}

/** A reel's notes file read back: `{ "notes": [...] }` (or a bare list), anything malformed left out. */
export function readNotes(text: string | undefined): Note[] {
  if (text === undefined) return [];
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return [];
  }
  const list = Array.isArray(value) ? value : value && typeof value === "object" ? (value as { notes?: unknown }).notes : undefined;
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: Note[] = [];
  for (const item of list) {
    const note = noteOf(item);
    if (note && !seen.has(note.id)) {
      seen.add(note.id);
      out.push(note);
    }
  }
  return out;
}

export function notesFile(notes: readonly Note[]): string {
  return `${JSON.stringify({ notes }, null, 2)}\n`;
}

export type NoteOp = { type: "note-add"; note: Note } | { type: "note-delete"; id: string };

/**
 * A note sent or taken back, applied to what is in the file now (so a Seen or
 * a reply Claude wrote meanwhile is kept). Once Claude has seen a note it
 * stays: deleting it is refused.
 */
export function applyNoteOp(notes: readonly Note[], op: NoteOp): Note[] {
  if (op.type === "note-add") {
    if (notes.some((n) => n.id === op.note.id) || notes.length >= MAX_NOTES) return [...notes];
    return [...notes, op.note];
  }
  return notes.filter((n) => n.id !== op.id || Boolean(n.seen || n.done));
}

/** Notes Claude has not seen yet. */
export function unseen(notes: readonly Note[]): Note[] {
  return notes.filter((n) => !n.seen && !n.done);
}

/** What was saved in a reel's folder, read back: JSON that does not parse is as if it were not there. */
export interface Saved {
  picks?: Record<string, unknown>;
  notes?: Note[];
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
  if (files["notes.json"] !== undefined) saved.notes = readNotes(files["notes.json"]);
  return saved;
}

/** What the reel's page is handed: its files by their paths in `preview/`, and the rest. */
export interface Boot {
  files: Record<string, string>;
  saved: Saved;
  reels: ReelEntry[];
  reel: string;
  /** Where to start playing, after the page is built again for an edit. */
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

/** What the reel's page may ask of Reelic: its sound picks saved, a note sent or taken back, or another reel opened. */
export type ReelMessage = { type: "save"; name: "picks.json"; text: string } | NoteOp | { type: "open"; name: string };

/** A message from the reel's page, checked; anything else is null and ignored. */
export function readMessage(data: unknown): ReelMessage | null {
  if (!data || typeof data !== "object") return null;
  const m = data as Record<string, unknown>;
  if (m.reelic !== 1) return null;
  if (m.type === "save") {
    if (m.name !== "picks.json" || typeof m.text !== "string" || m.text.length > MAX_SAVE) return null;
    return { type: "save", name: "picks.json", text: m.text };
  }
  if (m.type === "note-add") {
    const note = noteOf(m.note);
    // A note from the page is only ever new: never one already marked by Claude.
    return note && !note.seen && !note.done && !note.reply ? { type: "note-add", note } : null;
  }
  if (m.type === "note-delete") {
    return typeof m.id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(m.id) ? { type: "note-delete", id: m.id } : null;
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
