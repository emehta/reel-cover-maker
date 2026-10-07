/**
 * An animated cover as a video file, made in the browser: frames handed in
 * as PNGs, encoded by ffmpeg compiled to WebAssembly (video.worker.ts).
 *
 * - With no photo the cover is clear but for its letters, so the video is
 *   too: a QuickTime movie in ProRes 4444 with its alpha, the format every
 *   editor (Final Cut, Premiere, DaVinci Resolve, CapCut) and every Apple
 *   device reads with its transparency, to lay over a video.
 * - With a photo there is nothing to see through: an MP4 in H.264, which
 *   anything plays and Instagram takes as it is.
 *
 * Browsers' own encoders keep no alpha (none offers VP9, AV1 or HEVC with
 * it, measured 7 Oct in Chromium and WebKit), which is why ffmpeg is used.
 * Its core, about 30 MB, is fetched from jsDelivr and compiled once, ahead
 * of the first video where it can be (`prepareVideo`), and handed to every
 * encoder compiled.
 *
 * It was slow (the owner, 7 Oct), so a movie is made in pieces at once:
 * ProRes keeps every frame whole, so the frames are shared out among a few
 * encoders in runs, each run encoded as soon as its last frame is in (the
 * first while later frames are still being drawn), and the runs joined end
 * to end without encoding again. The finished cover held at the end is
 * encoded once and repeated. H.264 does not join so cleanly, so an MP4 is
 * one encoder's, its held end padded by ffmpeg.
 */

/** ffmpeg.wasm's core, its version pinned. */
const CORE = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";

export type VideoKind = "mov" | "mp4";

export const VIDEO_TYPE: Record<VideoKind, string> = { mov: "video/quicktime", mp4: "video/mp4" };

/** The frames per second every video is made at. */
export const VIDEO_FPS = 30;

/** The fewest frames a run is worth an encoder of its own for. */
const LEAST_RUN = 12;

/** A frame's file name, as the encoder reads them in turn. */
export function frameName(index: number): string {
  return `f${String(index).padStart(5, "0")}.png`;
}

/**
 * ffmpeg's arguments for the frames named from `f00000.png` on, at `fps`,
 * into `out`; an MP4 holds its last frame `hold` seconds more. Pure: the
 * tests hold it.
 */
export function encodeArgs(kind: VideoKind, fps: number, out: string, hold = 0): string[] {
  const input = ["-framerate", String(fps), "-i", "f%05d.png"];
  if (kind === "mov") {
    // ProRes 4444 with a 16-bit alpha, marked as Apple's own so Apple's apps take it as theirs; at a fixed quality
    // a third smaller than ProRes's own target, four times as quick, and still beyond what an eye can tell (63 dB, 7 Oct).
    return [...input, "-c:v", "prores_ks", "-profile:v", "4", "-qscale:v", "4", "-pix_fmt", "yuva444p10le", "-alpha_bits", "16", "-vendor", "apl0", "-r", String(fps), out];
  }
  const pad = hold > 0 ? ["-vf", `tpad=stop_mode=clone:stop_duration=${hold}`] : [];
  return [...input, ...pad, "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-r", String(fps), out];
}

/** One frame, the finished cover, as a ProRes movie of its own: what a movie's held end repeats. */
export function holdArgs(fps: number, png: string, out: string): string[] {
  return ["-framerate", String(fps), "-i", png, "-frames:v", "1", "-c:v", "prores_ks", "-profile:v", "4", "-qscale:v", "4", "-pix_fmt", "yuva444p10le", "-alpha_bits", "16", "-vendor", "apl0", out];
}

/** The list ffmpeg joins runs by: each run in turn, then the held end `holds` times. */
export function joinList(runs: readonly string[], hold: string | null, holds: number): string {
  return [...runs.map((r) => `file '${r}'`), ...(hold ? Array.from({ length: holds }, () => `file '${hold}'`) : [])].join("\n") + "\n";
}

/**
 * The runs joined end to end, as they are, no frame encoded again: each
 * frame then given its own thirtieth of a second, since the join leaves a
 * few ticks over at each seam (measured 7 Oct: 29.83 a second where 30 was
 * meant). Frame N at N thirtieths, in the runs' own time base (TB), which
 * the movie keeps: the core's muxer writes a retimed packet's ticks on a
 * clock of its own unconverted (a 30000-tick clock played it twice as fast).
 */
export function joinArgs(list: string, out: string, fps = VIDEO_FPS): string[] {
  return ["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-bsf:v", `setts=ts=N/(${fps}*TB)`, out];
}

/** How many encoders a movie of `frames` is shared among: half the cores, at most four, two on a phone, none with fewer than a run's worth. */
export function encoderCount(cores: number, touch: boolean, frames: number): number {
  const most = Math.max(1, Math.min(4, Math.floor(cores / 2), touch ? 2 : 4));
  return Math.max(1, Math.min(most, Math.floor(frames / LEAST_RUN)));
}

/** The frames `count` shared out in `runs` runs, in order, each as long as the next to a frame. */
export function runsOf(count: number, runs: number): { start: number; end: number }[] {
  return Array.from({ length: runs }, (_, i) => ({ start: Math.floor((i * count) / runs), end: Math.floor(((i + 1) * count) / runs) })).filter((r) => r.end > r.start);
}

async function blobURL(url: string, type: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not fetch ${url} (${response.status}).`);
  return URL.createObjectURL(new Blob([await response.arrayBuffer()], { type }));
}

interface CoreFiles {
  coreURL: string;
  wasmURL: string;
  /** The WebAssembly, compiled once for every encoder; null where it could not be handed over compiled. */
  module: WebAssembly.Module | null;
}

let core: Promise<CoreFiles> | null = null;

/** The core's script as an address a worker may load, and its WebAssembly compiled, each fetched once. */
function coreFiles(): Promise<CoreFiles> {
  core ??= (async () => {
    const wasmURL = `${CORE}/ffmpeg-core.wasm`;
    const [coreURL, module] = await Promise.all([
      blobURL(`${CORE}/ffmpeg-core.js`, "text/javascript"),
      (typeof WebAssembly.compileStreaming === "function" ? WebAssembly.compileStreaming(fetch(wasmURL)) : fetch(wasmURL).then((r) => r.arrayBuffer()).then((b) => WebAssembly.compile(b))).catch(() => null),
    ]);
    return { coreURL, wasmURL, module };
  })().catch((error) => {
    core = null;
    throw error;
  });
  return core;
}

/** The encoder fetched and compiled now, so the first video does not wait on it: called once a cover is animated. */
export function prepareVideo(): void {
  void coreFiles().catch(() => {});
}

/** One ffmpeg in a worker of its own. */
class Encoder {
  private worker = new Worker(new URL("./video.worker.ts", import.meta.url), { type: "module" });
  private nextId = 1;
  private waiting = new Map<number, { resolve: (data: { data?: Uint8Array }) => void; reject: (error: Error) => void }>();
  /** How far through what it is encoding, 0 to 1. */
  progress = 0;

  constructor() {
    this.worker.onmessage = (event: MessageEvent<{ id?: number; type?: string; progress?: number; ok?: boolean; error?: string; log?: string[]; data?: Uint8Array }>) => {
      const message = event.data;
      if (message.type === "progress") {
        this.progress = Math.min(1, Math.max(0, message.progress ?? 0));
        return;
      }
      const call = message.id !== undefined ? this.waiting.get(message.id) : undefined;
      if (!call || message.id === undefined) return;
      this.waiting.delete(message.id);
      if (message.ok) call.resolve(message);
      else call.reject(new Error([message.error ?? "ffmpeg failed.", ...(message.log ?? [])].join("\n")));
    };
    this.worker.onerror = () => this.fail(new Error("The video worker stopped."));
  }

  private fail(error: Error) {
    for (const call of this.waiting.values()) call.reject(error);
    this.waiting.clear();
  }

  private ask(request: object, transfer: Transferable[] = []) {
    return new Promise<{ data?: Uint8Array }>((resolve, reject) => {
      const id = this.nextId;
      this.nextId += 1;
      this.waiting.set(id, { resolve, reject });
      try {
        this.worker.postMessage({ ...request, id }, transfer);
      } catch (error) {
        this.waiting.delete(id);
        reject(error as Error);
      }
    });
  }

  async load(files: CoreFiles) {
    try {
      await this.ask({ type: "load", coreURL: files.coreURL, wasmURL: files.wasmURL, module: files.module });
    } catch (error) {
      // A browser that cannot hand a compiled module to a worker: the worker fetches and compiles its own.
      if (!(error instanceof DOMException) || !files.module) throw error;
      await this.ask({ type: "load", coreURL: files.coreURL, wasmURL: files.wasmURL, module: null });
    }
  }

  async write(path: string, data: Uint8Array) {
    await this.ask({ type: "write", path, data }, [data.buffer]);
  }

  async exec(args: string[]) {
    this.progress = 0;
    await this.ask({ type: "exec", args });
    this.progress = 1;
  }

  async read(path: string): Promise<Uint8Array> {
    const { data } = await this.ask({ type: "read", path });
    if (!data) throw new Error(`ffmpeg made no ${path}.`);
    return data;
  }

  close() {
    this.fail(new Error("The video was called off."));
    this.worker.terminate();
  }
}

export interface VideoJob {
  /** A frame, as a PNG, the next in turn: `frames` of them in all. */
  add(png: Blob): Promise<void>;
  /** Every frame added, encoded and held; `onProgress` hears how far the encoding is, 0 to 1. */
  finish(onProgress?: (done: number) => void): Promise<Blob>;
  /** Let every encoder go, made or not. */
  close(): void;
}

/**
 * Encoders ready to take `frames` frames for a video of `kind`, the last
 * held `hold` frames more, shared among as many as the device has cores to
 * spare (`cores`, fewer on a phone, `touch`).
 */
export async function videoJob(kind: VideoKind, frames: number, hold: number, device: { cores: number; touch: boolean }): Promise<VideoJob> {
  const files = await coreFiles();
  const count = kind === "mov" ? encoderCount(device.cores, device.touch, frames) : 1;
  const encoders = Array.from({ length: count }, () => new Encoder());
  const close = () => encoders.forEach((e) => e.close());
  try {
    await Promise.all(encoders.map((e) => e.load(files)));
  } catch (error) {
    close();
    throw error;
  }

  if (kind === "mp4") {
    const encoder = encoders[0];
    let added = 0;
    return {
      async add(png) {
        await encoder.write(frameName(added), new Uint8Array(await png.arrayBuffer()));
        added += 1;
      },
      async finish(onProgress) {
        const timer = window.setInterval(() => onProgress?.(encoder.progress), 250);
        try {
          await encoder.exec(encodeArgs("mp4", VIDEO_FPS, "out.mp4", hold / VIDEO_FPS));
          return new Blob([(await encoder.read("out.mp4")) as Uint8Array<ArrayBuffer>], { type: VIDEO_TYPE.mp4 });
        } finally {
          window.clearInterval(timer);
        }
      },
      close,
    };
  }

  const runs = runsOf(frames, count);
  /** Each run's movie, encoded as soon as its last frame is in. */
  const made: Promise<Uint8Array>[] = [];
  let added = 0;
  let last: Blob | null = null;
  return {
    async add(png) {
      const i = added;
      added += 1;
      last = png;
      const r = runs.findIndex((run) => i >= run.start && i < run.end);
      const run = runs[r];
      const encoder = encoders[r];
      await encoder.write(frameName(i - run.start), new Uint8Array(await png.arrayBuffer()));
      if (i === run.end - 1) {
        made[r] = encoder.exec(encodeArgs("mov", VIDEO_FPS, `run${r}.mov`)).then(() => encoder.read(`run${r}.mov`));
        // Settled here too, so a run that fails while frames are still coming is not left unheard.
        made[r].catch(() => {});
      }
    },
    async finish(onProgress) {
      // Only ever forward: an encoder begun on the held end starts its own count again.
      let best = 0;
      const timer = window.setInterval(() => {
        best = Math.max(best, encoders.reduce((sum, e) => sum + e.progress, 0) / (encoders.length + 1));
        onProgress?.(best);
      }, 250);
      try {
        if (added !== frames || !last) throw new Error(`The video was given ${added} of its ${frames} frames.`);
        const joiner = encoders[0];
        // The held end: the finished cover encoded once, by whichever encoder is free first.
        await joiner.write("hold.png", new Uint8Array(await (last as Blob).arrayBuffer()));
        const pieces = await Promise.all(made);
        await joiner.exec(holdArgs(VIDEO_FPS, "hold.png", "hold.mov"));
        // Every run beside the first, already in the joiner, handed to it to join.
        for (let r = 1; r < pieces.length; r += 1) await joiner.write(`run${r}.mov`, pieces[r]);
        const list = joinList(runs.map((_, r) => `run${r}.mov`), hold > 0 ? "hold.mov" : null, hold);
        await joiner.write("runs.txt", new TextEncoder().encode(list));
        await joiner.exec(joinArgs("runs.txt", "out.mov"));
        onProgress?.(1);
        return new Blob([(await joiner.read("out.mov")) as Uint8Array<ArrayBuffer>], { type: VIDEO_TYPE.mov });
      } finally {
        window.clearInterval(timer);
      }
    },
    close,
  };
}
