/**
 * Wave's faces: which there are, and their letters, fetched only once a
 * cover asks for one (each is a file of its own, Mona Sans's the largest at
 * about 60 KB sent), as a face's font file is.
 *
 * Kept here once fetched, so the layout (wave.ts), which is pure, reads
 * them as it reads any table; until one has arrived a cover in it has
 * nothing to draw, and the page waits for it, as it waits for a font.
 */

import type { WaveFaceData, WaveFaceId } from "@/components/reel-cover-maker/wave-faces/types";

export type { WaveFaceData, WaveFaceId } from "@/components/reel-cover-maker/wave-faces/types";

export interface WaveFace {
  id: WaveFaceId;
  name: string;
  /**
   * How its lines are brought to one width. Classic: lines near the widest
   * share its cap height, the narrower of them widened to meet it (Mona
   * Sans by its width axis, Anton, which has none, by its spacing), and the
   * rest scaled up to the width. Brick: every line one cap height, each
   * set at the width that makes it as wide as the others (Archivo).
   */
  mode: "classic" | "brick";
  /** The width it is set at before any line is widened (its own narrowest for Mona Sans), or null for a face with one. */
  width: number | null;
}

/** In the order the Lettering list shows them; Mona Sans first, the pick of the three (9 Nov). */
export const WAVE_FACES: readonly WaveFace[] = [
  { id: "mona", name: "Mona Sans", mode: "classic", width: 75 },
  { id: "anton", name: "Anton", mode: "classic", width: null },
  { id: "archivo", name: "Archivo", mode: "brick", width: 100 },
];

export const DEFAULT_WAVE_FACE: WaveFaceId = "mona";

export function isWaveFaceId(value: unknown): value is WaveFaceId {
  return WAVE_FACES.some((f) => f.id === value);
}

export function waveFaceOf(id: WaveFaceId): WaveFace {
  return WAVE_FACES.find((f) => f.id === id) ?? WAVE_FACES[0];
}

/** Each face's file, fetched once asked for. */
const FILES: Record<WaveFaceId, () => Promise<WaveFaceData>> = {
  mona: () => import("@/components/reel-cover-maker/wave-faces/mona").then((m) => m.MONA),
  anton: () => import("@/components/reel-cover-maker/wave-faces/anton").then((m) => m.ANTON),
  archivo: () => import("@/components/reel-cover-maker/wave-faces/archivo").then((m) => m.ARCHIVO),
};

const loaded = new Map<WaveFaceId, WaveFaceData>();
const asked = new Map<WaveFaceId, Promise<boolean>>();
const failed = new Set<WaveFaceId>();
const listeners = new Set<() => void>();
let version = 0;

function told() {
  version += 1;
  for (const listener of listeners) listener();
}

/** A face's letters, or null until they have arrived. */
export function waveFaceData(id: WaveFaceId): WaveFaceData | null {
  return loaded.get(id) ?? null;
}

/** Letters had another way (the tests import them): kept as if fetched. */
export function keepWaveFace(data: WaveFaceData): void {
  if (loaded.get(data.id) === data) return;
  loaded.set(data.id, data);
  failed.delete(data.id);
  told();
}

/**
 * Fetches a face's letters, once: true when they are here. A fetch that
 * fails (offline) is not kept as an answer, so the next ask tries again.
 */
export function loadWaveFace(id: WaveFaceId): Promise<boolean> {
  if (loaded.has(id)) return Promise.resolve(true);
  let pending = asked.get(id);
  if (!pending) {
    pending = FILES[id]().then(
      (data) => {
        asked.delete(id);
        keepWaveFace(data);
        return true;
      },
      () => {
        asked.delete(id);
        failed.add(id);
        told();
        return false;
      },
    );
    asked.set(id, pending);
  }
  return pending;
}

/** Whether the last fetch of a face failed: the page says it cannot be drawn rather than waiting on it. */
export function waveFaceFailed(id: WaveFaceId): boolean {
  return failed.has(id) && !loaded.has(id);
}

/** For useSyncExternalStore: told whenever a face arrives, or fails to. */
export function subscribeWaveFaces(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A number that changes whenever a face arrives or fails. */
export function waveFacesVersion(): number {
  return version;
}
