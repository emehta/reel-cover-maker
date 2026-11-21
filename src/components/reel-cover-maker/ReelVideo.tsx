"use client";

import { FilmSlate, FolderOpen } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "@/components/reel-cover-maker/ReelCoverMaker.module.css";
import { allow, allowed, entriesOf, folderPicker, hasFile, keepFolder, loadFolder, readText, writeText } from "@/components/reel-cover-maker/reel-folder";
import {
  embedPage,
  PAGE_DIR,
  PAGE_FILE,
  pickReel,
  readMessage,
  readSaved,
  SAVE_DIR,
  SAVE_FILES,
  servesFile,
  sortReels,
  type ReelEntry,
  type SaveFile,
} from "@/components/reel-cover-maker/reel-video";

/** The reel opened last, so the next visit opens it again. */
const LAST_KEY = "reel-cover-maker:video-reel";
/** How often the open reel's folder is looked at for a new version of the reel, which Claude writes as it works. */
const WATCH_MS = 2500;

type View =
  | { kind: "starting" }
  | { kind: "unsupported" }
  | { kind: "closed" }
  | { kind: "empty" }
  | { kind: "failed" }
  | { kind: "open"; src: string };

function lastReel(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

function keepLast(name: string) {
  try {
    localStorage.setItem(LAST_KEY, name);
  } catch {
    // Not kept: the newest reel opens next time.
  }
}

/** Every file of the reel's page, by its path inside `preview/`, as a link to the file on disk (nothing is read until played). */
async function linksOf(dir: FileSystemDirectoryHandle, prefix: string, out: Record<string, string>): Promise<void> {
  for (const entry of await entriesOf(dir)) {
    if (!servesFile(entry.name)) continue;
    if (entry.kind === "directory") await linksOf(entry as FileSystemDirectoryHandle, `${prefix}${entry.name}/`, out);
    else out[`${prefix}${entry.name}`] = URL.createObjectURL(await (entry as FileSystemFileHandle).getFile());
  }
}

/** When the reel's page was last written: a new version from Claude is opened in its place. */
async function pageStamp(dir: FileSystemDirectoryHandle): Promise<number> {
  try {
    const page = await dir.getDirectoryHandle(PAGE_DIR);
    return (await (await page.getFileHandle(PAGE_FILE)).getFile()).lastModified;
  } catch {
    return 0;
  }
}

/**
 * The reel's video, in the page's own window: `instanceof` is never true
 * across windows (each has its own HTMLVideoElement), so it is known by its
 * tag.
 */
function reelVideo(frame: HTMLIFrameElement | null): HTMLVideoElement | null {
  try {
    const video = frame?.contentDocument?.getElementById("v");
    return video?.tagName === "VIDEO" ? (video as HTMLVideoElement) : null;
  } catch {
    return null;
  }
}

/**
 * Video, beside Cover: the reels in the Reels folder, each played in its own
 * page in Reelic's look. The page is the reel's (`preview/index.html`, the
 * same page Claude checks), run here from the folder's own files.
 */
export default function ReelVideo({ active }: { active: boolean }) {
  const [view, setView] = useState<View>({ kind: "starting" });
  const root = useRef<FileSystemDirectoryHandle | null>(null);
  const reels = useRef<Map<string, FileSystemDirectoryHandle>>(new Map());
  const list = useRef<ReelEntry[]>([]);
  const current = useRef<string | null>(null);
  const links = useRef<string[]>([]);
  const frame = useRef<HTMLIFrameElement>(null);
  const loading = useRef(0);
  /** When the open reel's page was written, to tell a new version. */
  const stamp = useRef(0);
  const forgetLinks = () => {
    for (const url of links.current) URL.revokeObjectURL(url);
    links.current = [];
  };

  const openReel = useCallback(async (name: string, resume?: number) => {
    const dir = reels.current.get(name);
    if (!dir) return;
    const run = ++loading.current;
    try {
      const page = await dir.getDirectoryHandle(PAGE_DIR);
      const files: Record<string, string> = {};
      await linksOf(page, "", files);
      const html = await readText(page, [PAGE_FILE]);
      const texts: Partial<Record<SaveFile, string>> = {};
      for (const file of SAVE_FILES) {
        const text = await readText(dir, [SAVE_DIR, file]);
        if (text !== undefined) texts[file] = text;
      }
      const pageTime = await pageStamp(dir);
      if (run !== loading.current || html === undefined) {
        for (const url of Object.values(files)) URL.revokeObjectURL(url);
        if (html === undefined && run === loading.current) setView({ kind: "failed" });
        return;
      }
      const doc = embedPage(html, { files, saved: readSaved(texts), reels: list.current, reel: name, ...(resume === undefined ? {} : { resume }) });
      const src = URL.createObjectURL(new Blob([doc], { type: "text/html" }));
      forgetLinks();
      links.current = [...Object.values(files), src];
      current.current = name;
      stamp.current = pageTime;
      keepLast(name);
      setView({ kind: "open", src });
    } catch {
      if (run === loading.current) setView({ kind: "failed" });
    }
  }, []);

  const openFolder = useCallback(
    async (folder: FileSystemDirectoryHandle) => {
      root.current = folder;
      const found = new Map<string, FileSystemDirectoryHandle>();
      // The folder picked may be one reel itself, or the Reels folder of them all.
      if (await hasFile(folder, [PAGE_DIR, PAGE_FILE])) found.set(folder.name, folder);
      else
        for (const entry of await entriesOf(folder)) {
          if (entry.kind !== "directory" || !servesFile(entry.name)) continue;
          const dir = entry as FileSystemDirectoryHandle;
          if (await hasFile(dir, [PAGE_DIR, PAGE_FILE])) found.set(entry.name, dir);
        }
      reels.current = found;
      list.current = sortReels([...found.keys()]);
      const name = pickReel(list.current, lastReel());
      if (!name) {
        setView({ kind: "empty" });
        return;
      }
      await openReel(name);
    },
    [openReel],
  );

  // A folder opened before is opened again at once if the browser still allows it, else on a press.
  useEffect(() => {
    let gone = false;
    void (async () => {
      if (!folderPicker()) {
        setView({ kind: "unsupported" });
        return;
      }
      const folder = await loadFolder();
      if (gone) return;
      if (folder && (await allowed(folder))) await openFolder(folder);
      else {
        root.current = folder;
        if (!gone) setView({ kind: "closed" });
      }
    })();
    return () => {
      gone = true;
    };
  }, [openFolder]);

  // A check in headless Chrome hands it a folder of its own (`?playtest=1`), as no picker can be pressed there.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("playtest")) return;
    (window as unknown as { reelicOpen?: (folder: FileSystemDirectoryHandle) => Promise<void> }).reelicOpen = openFolder;
  }, [openFolder]);

  useEffect(() => forgetLinks, []);

  // What the reel's page asks: its sound picks saved, or another reel opened.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!frame.current || event.source !== frame.current.contentWindow) return;
      const message = readMessage(event.data);
      if (!message) return;
      if (message.type === "open") {
        if (reels.current.has(message.name)) void openReel(message.name);
        return;
      }
      const name = current.current;
      const dir = name ? reels.current.get(name) : undefined;
      if (!dir) return;
      void writeText(dir, SAVE_DIR, message.name, message.text).catch(() => undefined);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [openReel]);

  // While Video is showing, the reel's folder is looked at every few seconds: a new version Claude has written opens in
  // place, where it was playing.
  useEffect(() => {
    if (!active || view.kind !== "open") return;
    let busy = false;
    const look = async () => {
      const name = current.current;
      const dir = name ? reels.current.get(name) : undefined;
      if (busy || !name || !dir || document.hidden) return;
      busy = true;
      try {
        const pageTime = await pageStamp(dir);
        if (pageTime && stamp.current && pageTime !== stamp.current) {
          stamp.current = pageTime;
          await openReel(name, reelVideo(frame.current)?.currentTime);
        }
      } finally {
        busy = false;
      }
    };
    const timer = window.setInterval(() => void look(), WATCH_MS);
    return () => window.clearInterval(timer);
  }, [active, view.kind, openReel]);

  // Back to Cover: the reel stops where it is.
  useEffect(() => {
    if (!active) reelVideo(frame.current)?.pause();
  }, [active]);

  /** Opens the folder kept from before, once allowed again; or, asked for another (none, or nothing in it), the picker. */
  const pick = async (another: boolean) => {
    const folder = root.current;
    if (!another && folder && (await allow(folder))) {
      await openFolder(folder);
      return;
    }
    const picker = folderPicker();
    if (!picker) return;
    try {
      const chosen = await picker({ id: "reels", mode: "readwrite", startIn: "videos" });
      await keepFolder(chosen);
      await openFolder(chosen);
    } catch {
      // The picker closed with nothing chosen: nothing changes.
    }
  };

  if (view.kind === "open")
    return (
      <div className={styles.videoMain} hidden={!active}>
        <iframe ref={frame} key={view.src} className={styles.videoFrame} src={view.src} title="The reel" allow="autoplay; fullscreen" />
      </div>
    );

  const lead =
    view.kind === "unsupported"
      ? "Video opens the Reels folder on this Mac, which needs Chrome or Arc."
      : view.kind === "empty"
        ? "There is no reel in this folder yet."
        : view.kind === "failed"
          ? "This reel could not be opened."
          : "Your reels are in the Reels folder in Movies.";

  return (
    <div className={styles.videoMain} hidden={!active}>
      <div className={styles.videoEmpty}>
        <FilmSlate size={28} weight="bold" aria-hidden="true" />
        <p className={styles.videoLead}>{view.kind === "starting" ? "" : lead}</p>
        {view.kind !== "unsupported" && (
          <button type="button" className={styles.save} onClick={() => void pick(view.kind === "empty" || view.kind === "failed")} disabled={view.kind === "starting"}>
            <FolderOpen size={18} weight="bold" aria-hidden="true" />
            {view.kind === "empty" || view.kind === "failed" ? "Open another folder" : "Open Reels folder"}
          </button>
        )}
      </div>
    </div>
  );
}
