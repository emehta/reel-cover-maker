/// <reference lib="webworker" />

/**
 * The worker that makes an animated cover's video: ffmpeg, compiled to
 * WebAssembly (ffmpeg.wasm's core), fetched only when a video is first
 * made. It is handed each frame as a PNG, keeps them in its own memory, and
 * encodes them in one go (video.ts says how).
 *
 * ffmpeg.wasm's own worker is not used: it loads the core by an address
 * worked out at run time, which the bundler refuses, so this one loads it
 * itself, with the bundler told to leave that import alone.
 */

// A module, so its names are its own.
export {};

interface Core {
  FS: { writeFile(path: string, data: Uint8Array): void; readFile(path: string): Uint8Array; unlink(path: string): void };
  exec(...args: string[]): void;
  ret: number;
  reset(): void;
  setTimeout(ms: number): void;
  setLogger(log: (entry: { type: string; message: string }) => void): void;
  setProgress(progress: (entry: { progress: number; time: number }) => void): void;
}

type Ask =
  | { id: number; type: "load"; coreURL: string; wasmURL: string }
  | { id: number; type: "write"; path: string; data: Uint8Array }
  | { id: number; type: "exec"; args: string[] }
  | { id: number; type: "read"; path: string }
  | { id: number; type: "remove"; path: string };

let core: Core | null = null;
/** The last lines ffmpeg wrote, said with a failure. */
const lines: string[] = [];

declare const self: DedicatedWorkerGlobalScope;

const post = (message: unknown, transfer: Transferable[] = []) => self.postMessage(message, transfer);

self.onmessage = async (event: MessageEvent<Ask>) => {
  const request = event.data;
  try {
    if (request.type === "load") {
      if (!core) {
        const made = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ request.coreURL)) as { default: (options: object) => Promise<Core> };
        // ffmpeg.wasm's way of telling the core where its WebAssembly is: after a hash on the script's address.
        core = await made.default({ mainScriptUrlOrBlob: `${request.coreURL}#${btoa(JSON.stringify({ wasmURL: request.wasmURL, workerURL: "" }))}` });
        core.setLogger(({ message }) => {
          lines.push(message);
          if (lines.length > 40) lines.shift();
        });
        core.setProgress(({ progress }) => post({ type: "progress", progress }));
      }
      post({ id: request.id, ok: true });
      return;
    }
    if (!core) throw new Error("ffmpeg is not loaded.");
    if (request.type === "write") {
      core.FS.writeFile(request.path, request.data);
      post({ id: request.id, ok: true });
    } else if (request.type === "remove") {
      core.FS.unlink(request.path);
      post({ id: request.id, ok: true });
    } else if (request.type === "exec") {
      lines.length = 0;
      core.setTimeout(-1);
      core.exec(...request.args);
      const code = core.ret;
      core.reset();
      post({ id: request.id, ok: code === 0, code, log: code === 0 ? [] : lines.slice(-12) });
    } else if (request.type === "read") {
      const data = core.FS.readFile(request.path);
      post({ id: request.id, ok: true, data }, [data.buffer]);
    }
  } catch (error) {
    post({ id: request.id, ok: false, error: String(error), log: lines.slice(-12) });
  }
};
