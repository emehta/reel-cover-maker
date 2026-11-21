/**
 * The Reels folder, remembered: the browser keeps the folder the owner
 * opened (a handle, never its files) in IndexedDB, so the next visit asks
 * only to allow it again, with no picker. The browser.
 */

const DB = "reel-cover-maker-video";
const STORE = "folders";
const KEY = "reels";

/** What this browser lets a page do with a folder, where the DOM's types do not say yet. */
export interface FolderAccess {
  queryPermission?(options: { mode: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission?(options: { mode: "read" | "readwrite" }): Promise<PermissionState>;
}

type Picker = (options?: { id?: string; mode?: "read" | "readwrite"; startIn?: string }) => Promise<FileSystemDirectoryHandle>;

/** The folder picker, where there is one: Chrome and Arc on a Mac, not Safari. */
export function folderPicker(): Picker | null {
  const picker = (window as unknown as { showDirectoryPicker?: Picker }).showDirectoryPicker;
  return typeof picker === "function" ? picker.bind(window) : null;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await open();
    return await new Promise((resolve) => {
      const request = db.transaction(STORE).objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve((request.result as FileSystemDirectoryHandle | undefined) ?? null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function keepFolder(folder: FileSystemDirectoryHandle): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(folder, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Not kept: the next visit asks for the folder again, which is all it costs.
  }
}

/** Whether the folder may be read and written now, without asking. */
export async function allowed(folder: FileSystemDirectoryHandle): Promise<boolean> {
  const access = folder as unknown as FolderAccess;
  if (!access.queryPermission) return true;
  try {
    return (await access.queryPermission({ mode: "readwrite" })) === "granted";
  } catch {
    return false;
  }
}

/** Asks to read and write the folder again; only from a press, as the browser requires. */
export async function allow(folder: FileSystemDirectoryHandle): Promise<boolean> {
  const access = folder as unknown as FolderAccess;
  if (!access.requestPermission) return true;
  try {
    return (await access.requestPermission({ mode: "readwrite" })) === "granted";
  } catch {
    return false;
  }
}

/** A folder's entries, where the DOM's types do not list them yet. */
export async function entriesOf(folder: FileSystemDirectoryHandle): Promise<FileSystemHandle[]> {
  const out: FileSystemHandle[] = [];
  const values = (folder as unknown as { values(): AsyncIterable<FileSystemHandle> }).values();
  for await (const entry of values) out.push(entry);
  return out;
}

export async function hasFile(folder: FileSystemDirectoryHandle, path: readonly string[]): Promise<boolean> {
  try {
    let dir = folder;
    for (const part of path.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
    await dir.getFileHandle(path[path.length - 1]);
    return true;
  } catch {
    return false;
  }
}

export async function readText(folder: FileSystemDirectoryHandle, path: readonly string[]): Promise<string | undefined> {
  try {
    let dir = folder;
    for (const part of path.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
    return await (await (await dir.getFileHandle(path[path.length - 1])).getFile()).text();
  } catch {
    return undefined;
  }
}

export async function writeText(folder: FileSystemDirectoryHandle, dirName: string, name: string, text: string): Promise<void> {
  const dir = await folder.getDirectoryHandle(dirName, { create: true });
  const file = await dir.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  await writable.write(text);
  await writable.close();
}
