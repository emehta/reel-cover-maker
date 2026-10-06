/**
 * The photo behind the cover, kept in this browser between visits: too big
 * for localStorage, so in IndexedDB, as the file the page made of it.
 * Every call fails quietly (a private window, storage blocked or full):
 * the photo then lasts as long as the page does.
 */

const DATABASE = "reel-cover-maker";
const STORE = "photos";
const KEY = "background";

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function run<T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return open().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const request = act(db.transaction(STORE, mode).objectStore(STORE));
          request.onsuccess = () => resolve(request.result ?? null);
          request.onerror = () => resolve(null);
        } catch {
          resolve(null);
        } finally {
          db.close();
        }
      }),
  );
}

export function savePhoto(file: Blob): Promise<unknown> {
  return run("readwrite", (store) => store.put(file, KEY));
}

export function loadPhoto(): Promise<Blob | null> {
  return run<Blob>("readonly", (store) => store.get(KEY) as IDBRequest<Blob>).then((v) => (v instanceof Blob ? v : null));
}

export function forgetPhoto(): Promise<unknown> {
  return run("readwrite", (store) => store.delete(KEY));
}
