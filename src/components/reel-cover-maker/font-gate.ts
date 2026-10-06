/**
 * Whether a title may be drawn yet: every character of it asked of every
 * face, and the files that cover it arrived (or waited on long enough).
 *
 * The record is kept here, by the maker, rather than read from
 * `document.fonts.check`: Chrome answers that true for a family installed on
 * the computer, whatever the page has loaded, and on a Mac with Instrument
 * Serif installed it opened the gate on a title the page's own files had not
 * reached. Pure but for the two functions it is given, so a test can drive it.
 */

export interface FontGateOptions {
  /** Ask every face for the files covering `text`; settles when they have arrived or failed. */
  load: (text: string) => Promise<unknown>;
  /** How long to wait on a file that does not arrive (offline, blocked) before drawing with what there is. */
  patience: number;
  setTimer: (run: () => void, ms: number) => unknown;
}

export interface FontGate {
  /** -1 while a character of `title` is not ready, else a count that changes whenever a face arrives. */
  snapshot(title: string): number;
  /** Ask for whatever of `title` has not been asked for. */
  request(title: string): void;
  subscribe(listener: () => void): () => void;
  /** A face finished loading somewhere: whatever was measured before it must be measured again. */
  changed(): void;
}

export function createFontGate(options: FontGateOptions, always = ""): FontGate {
  const ready = new Set<string>();
  const asked = new Set<string>();
  const listeners = new Set<() => void>();
  let loads = 0;

  const changed = () => {
    loads += 1;
    for (const listener of listeners) listener();
  };

  return {
    snapshot(title) {
      if (!ready.size) return -1;
      for (const character of title) if (!ready.has(character)) return -1;
      return loads;
    },
    request(title) {
      const missing = [...new Set(`${always}${title}`)].filter((c) => !ready.has(c) && !asked.has(c));
      if (!missing.length) return;
      for (const c of missing) asked.add(c);
      let settled = false;
      // Whichever comes first, the files or the end of patience; a file that
      // arrives after that is reported by `changed` from the browser's event.
      const settle = () => {
        if (settled) return;
        settled = true;
        for (const c of missing) {
          asked.delete(c);
          ready.add(c);
        }
        changed();
      };
      options.load(missing.join("")).then(settle, settle);
      options.setTimer(settle, options.patience);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    changed,
  };
}
