// Tiny IndexedDB store for the last-used directory handle, so the app can offer
// "reopen last folder" (one-click re-grant) instead of re-navigating the picker.
// File System Access handles survive structured-clone into IndexedDB; on reload
// the handle's .name is readable without permission, but reading/writing its
// contents still needs a fresh readwrite grant (requested on the reopen click).
import type { WDirHandle } from './workspace';

const DB_NAME = 'vst-fs';
const STORE = 'handles';
const KEY = 'lastDir';

function openDB(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

export async function saveDirHandle(h: WDirHandle): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(h, KEY);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  } catch {
    /* IndexedDB unavailable (private mode) — reopen just won't be offered */
  }
}

export async function loadDirHandle(): Promise<WDirHandle | null> {
  try {
    const db = await openDB();
    const v = await new Promise<WDirHandle | null>((res, rej) => {
      const tx = db.transaction(STORE, 'readonly');
      const rq = tx.objectStore(STORE).get(KEY);
      rq.onsuccess = () => res((rq.result as WDirHandle) ?? null);
      rq.onerror = () => rej(rq.error);
    });
    db.close();
    return v;
  } catch {
    return null;
  }
}

export async function clearDirHandle(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((res) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => res();
      tx.onerror = () => res();
    });
    db.close();
  } catch {
    /* ignore */
  }
}
