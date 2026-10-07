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
 * Its core, about 30 MB, is fetched from jsDelivr only when the first video
 * is made, and kept by the browser's cache.
 */

/** ffmpeg.wasm's core, its version pinned. */
const CORE = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";

export type VideoKind = "mov" | "mp4";

export const VIDEO_TYPE: Record<VideoKind, string> = { mov: "video/quicktime", mp4: "video/mp4" };

/** The frames per second every video is made at. */
export const VIDEO_FPS = 30;

/** ffmpeg's arguments for frames `f00000.png` on, at `fps`, into `out`. Pure: the tests hold it. */
export function encodeArgs(kind: VideoKind, fps: number, out: string): string[] {
  const input = ["-framerate", String(fps), "-i", "f%05d.png"];
  if (kind === "mov") {
    // ProRes 4444 with a 16-bit alpha, marked as Apple's own so Apple's apps take it as theirs; at a fixed quality
    // a third smaller than ProRes's own target and still beyond what an eye can tell (63 dB, measured 7 Oct).
    return [...input, "-c:v", "prores_ks", "-profile:v", "4", "-qscale:v", "4", "-pix_fmt", "yuva444p10le", "-alpha_bits", "16", "-vendor", "apl0", "-r", String(fps), out];
  }
  return [...input, "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-r", String(fps), out];
}

/** A frame's file name, as the encoder reads them in turn. */
export function frameName(index: number): string {
  return `f${String(index).padStart(5, "0")}.png`;
}

async function blobURL(url: string, type: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not fetch ${url} (${response.status}).`);
  return URL.createObjectURL(new Blob([await response.arrayBuffer()], { type }));
}

let core: Promise<{ coreURL: string; wasmURL: string }> | null = null;

/** The core's script and WebAssembly as addresses a worker may load, fetched once. */
function coreFiles() {
  core ??= Promise.all([blobURL(`${CORE}/ffmpeg-core.js`, "text/javascript"), blobURL(`${CORE}/ffmpeg-core.wasm`, "application/wasm")]).then(
    ([coreURL, wasmURL]) => ({ coreURL, wasmURL }),
    (error) => {
      core = null;
      throw error;
    },
  );
  return core;
}

export interface VideoMaker {
  /** A frame, as a PNG, the next in turn. */
  add(png: Blob): Promise<void>;
  /** Every frame added, encoded; `onProgress` hears how far through, 0 to 1. */
  finish(onProgress?: (done: number) => void): Promise<Blob>;
  /** Let the worker go, made or not. */
  close(): void;
}

/** A worker ready to take frames for a video of `kind`, ffmpeg loaded in it. */
export async function videoMaker(kind: VideoKind): Promise<VideoMaker> {
  const worker = new Worker(new URL("./video.worker.ts", import.meta.url), { type: "module" });
  let nextId = 1;
  let onProgress: ((done: number) => void) | null = null;
  const waiting = new Map<number, { resolve: (data: { data?: Uint8Array }) => void; reject: (error: Error) => void }>();
  worker.onmessage = (event: MessageEvent<{ id?: number; type?: string; progress?: number; ok?: boolean; error?: string; log?: string[]; data?: Uint8Array }>) => {
    const message = event.data;
    if (message.type === "progress") {
      onProgress?.(Math.min(1, Math.max(0, message.progress ?? 0)));
      return;
    }
    const call = message.id !== undefined ? waiting.get(message.id) : undefined;
    if (!call || message.id === undefined) return;
    waiting.delete(message.id);
    if (message.ok) call.resolve(message);
    else call.reject(new Error([message.error ?? "ffmpeg failed.", ...(message.log ?? [])].join("\n")));
  };
  const fail = (error: Error) => {
    for (const call of waiting.values()) call.reject(error);
    waiting.clear();
  };
  worker.onerror = () => fail(new Error("The video worker stopped."));
  const ask = (request: object, transfer: Transferable[] = []) =>
    new Promise<{ data?: Uint8Array }>((resolve, reject) => {
      const id = nextId;
      nextId += 1;
      waiting.set(id, { resolve, reject });
      worker.postMessage({ ...request, id }, transfer);
    });

  try {
    await ask({ type: "load", ...(await coreFiles()) });
  } catch (error) {
    worker.terminate();
    throw error;
  }
  let count = 0;
  const out = kind === "mov" ? "out.mov" : "out.mp4";
  return {
    async add(png) {
      const data = new Uint8Array(await png.arrayBuffer());
      await ask({ type: "write", path: frameName(count), data }, [data.buffer]);
      count += 1;
    },
    async finish(progress) {
      onProgress = progress ?? null;
      await ask({ type: "exec", args: encodeArgs(kind, VIDEO_FPS, out) });
      const { data } = await ask({ type: "read", path: out });
      if (!data) throw new Error("ffmpeg made no file.");
      return new Blob([data as Uint8Array<ArrayBuffer>], { type: VIDEO_TYPE[kind] });
    },
    close() {
      fail(new Error("The video was called off."));
      worker.terminate();
    },
  };
}
