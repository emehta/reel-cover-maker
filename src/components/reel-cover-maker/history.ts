/**
 * Undo and redo for the whole cover: the text, its bold, the style, the
 * colour, a shuffle, where the letters were moved to, how the photo is
 * framed. Each change is kept as the design before it; a run of the same
 * change close together (a slider dragged, a word typed, the photo
 * panned) is one step, so an undo goes back a thing done, not a pixel.
 *
 * Pure: the tests run it.
 */

export interface History<T> {
  /** The designs before each step, the latest last. */
  past: T[];
  /** The designs undone, to redo, the next last. */
  future: T[];
  /** The step still growing: what it changes, when it was last added to, when it began. */
  open: { keys: string; at: number; since: number } | null;
}

/** How long a pause ends a step, and the longest one step may run, in milliseconds. */
export const STEP_PAUSE = 800;
export const STEP_LONGEST = 4000;
/** The most steps kept. */
export const MOST_STEPS = 100;

export function emptyHistory<T>(): History<T> {
  return { past: [], future: [], open: null };
}

/** A change made, from `before`, to the fields named, at `now`: a new step, or the one still growing. */
export function record<T>(history: History<T>, before: T, keys: readonly string[], now: number): History<T> {
  const name = [...keys].sort().join(",");
  const open = history.open;
  if (open && open.keys === name && now - open.at < STEP_PAUSE && now - open.since < STEP_LONGEST) {
    return { past: history.past, future: [], open: { ...open, at: now } };
  }
  const past = [...history.past, before].slice(-MOST_STEPS);
  return { past, future: [], open: { keys: name, at: now, since: now } };
}

/** The step before, from `current`; null when there is none. */
export function undo<T>(history: History<T>, current: T): { history: History<T>; state: T } | null {
  const state = history.past[history.past.length - 1];
  if (state === undefined) return null;
  return { history: { past: history.past.slice(0, -1), future: [...history.future, current], open: null }, state };
}

/** The step undone last, again; null when there is none. */
export function redo<T>(history: History<T>, current: T): { history: History<T>; state: T } | null {
  const state = history.future[history.future.length - 1];
  if (state === undefined) return null;
  return { history: { past: [...history.past, current].slice(-MOST_STEPS), future: history.future.slice(0, -1), open: null }, state };
}

/** A change that is not a step of its own (a photo taken, which undo cannot bring back): whatever comes next starts a new one. */
export function seal<T>(history: History<T>): History<T> {
  return history.open ? { ...history, open: null } : history;
}
