// .json Save / Open — v8 "JSON is the record" philosophy, single-file flavor.
//
// Prefers the File System Access API (Chromium / Edge — the corporate target)
// so the operator picks a real file on the network share and re-saves IN PLACE:
// Open retains the file handle, and Save writes straight back to it (no dialog,
// no stale copy). Falls back to a download anchor / hidden file input on
// browsers without it (Firefox, Safari), where in-place save isn't possible —
// there Save always produces a fresh download.
import type { Bundle, ShipCode, VoyageMap } from '../types';
import { buildBundle, parseBundle } from './bundle';

// Minimal typings for the File System Access API surface we use (avoids a
// dependency on the full lib + keeps strict mode happy).
type FSPermissionState = 'granted' | 'denied' | 'prompt';
interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
}
export interface FileHandle {
  readonly name: string;
  createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }>;
  getFile: () => Promise<File>;
  // Permission helpers exist on Chromium handles; optional so typing stays safe.
  queryPermission?: (d: { mode: 'read' | 'readwrite' }) => Promise<FSPermissionState>;
  requestPermission?: (d: { mode: 'read' | 'readwrite' }) => Promise<FSPermissionState>;
}
interface FSAccessWindow {
  showSaveFilePicker?: (opts?: SaveFilePickerOptions) => Promise<FileHandle>;
  showOpenFilePicker?: (opts?: {
    types?: { description?: string; accept: Record<string, string[]> }[];
    multiple?: boolean;
  }) => Promise<FileHandle[]>;
}

const JSON_TYPES = [{ description: 'Speed Templates JSON', accept: { 'application/json': ['.json'] } }];

function suggestedName(ship: ShipCode): string {
  return `${ship}_speed-template_${new Date().toISOString().slice(0, 10)}.json`;
}

export interface SaveResult {
  filename: string;
  method: 'fs-access' | 'download';
  handle: FileHandle | null; // bound handle for subsequent in-place saves (FS Access only)
}

export interface OpenResult {
  bundle: Bundle;
  handle: FileHandle | null; // retained so Save can write back in place
  filename: string | null;
}

/** Ensure we may write to a previously-opened handle (may prompt once). */
async function ensureWritable(handle: FileHandle): Promise<boolean> {
  if (!handle.queryPermission || !handle.requestPermission) return true; // assume writable
  if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
}

/** Raised when the user revoked write permission on a bound handle. */
export class WritePermissionError extends Error {
  constructor() {
    super('write-permission-denied');
    this.name = 'WritePermissionError';
  }
}

/**
 * Write straight back to an already-bound file handle (no picker). Throws
 * WritePermissionError if the user declines the readwrite prompt — the caller
 * then falls back to Save As.
 */
export async function writeToHandle(
  handle: FileHandle,
  ship: ShipCode,
  voyages: VoyageMap,
  selectedId: string,
): Promise<string> {
  if (!(await ensureWritable(handle))) throw new WritePermissionError();
  const text = JSON.stringify(buildBundle(voyages, selectedId, ship), null, 2);
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
  return handle.name;
}

/**
 * Pick a NEW location and write there (Save As). On FS Access browsers the
 * returned handle is retained so later saves go in place; the download fallback
 * returns a null handle (no in-place save possible). Returns null if cancelled.
 */
export async function saveJsonAs(
  ship: ShipCode,
  voyages: VoyageMap,
  selectedId: string,
): Promise<SaveResult | null> {
  const text = JSON.stringify(buildBundle(voyages, selectedId, ship), null, 2);
  const w = window as unknown as FSAccessWindow;

  if (typeof w.showSaveFilePicker === 'function') {
    try {
      const handle = await w.showSaveFilePicker({ suggestedName: suggestedName(ship), types: JSON_TYPES });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      const file = await handle.getFile();
      return { filename: file.name, method: 'fs-access', handle };
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return null; // user cancelled
      // fall through to download on any unexpected picker failure
    }
  }
  return downloadJson(text, suggestedName(ship));
}

function downloadJson(text: string, filename: string): SaveResult {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
  return { filename, method: 'download', handle: null };
}

/** Returns the parsed bundle + retained handle, or null if the user cancelled. */
export async function openJson(): Promise<OpenResult | null> {
  const w = window as unknown as FSAccessWindow;
  if (typeof w.showOpenFilePicker === 'function') {
    try {
      const [handle] = await w.showOpenFilePicker({ types: JSON_TYPES, multiple: false });
      const file = await handle.getFile();
      return { bundle: parseBundle(await file.text()), handle, filename: file.name };
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return null;
      throw e;
    }
  }
  return openViaInput();
}

function openViaInput(): Promise<OpenResult | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      try {
        // No handle on the fallback path — in-place save isn't available here.
        resolve({ bundle: parseBundle(await file.text()), handle: null, filename: file.name });
      } catch (e) {
        reject(e);
      }
    };
    input.click();
  });
}
