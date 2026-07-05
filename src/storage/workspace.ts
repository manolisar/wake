// Folder-backed workspace (the new "folder is the live record" model).
//
// On open the operator picks a directory; every .json in it is read and parsed
// into a WorkspaceFile, and edits/paste write straight back to that file's
// handle. Chromium/Edge only (File System Access API directory pickers); the
// corporate target. No directory access = the app can't run the folder flow.
import type { Bundle, VoyageMap } from '../types';
import type { ConsumptionSettings } from '../domain/consumption/types';
import { buildBundle, parseBundle } from './bundle';
import { fileStartKey } from '../domain/schedule';

// ── Minimal File System Access typings (avoids depending on the full lib) ──
type FSPermissionState = 'granted' | 'denied' | 'prompt';
interface Writable {
  write: (data: string) => Promise<void>;
  close: () => Promise<void>;
}
export interface WFileHandle {
  readonly kind: 'file';
  readonly name: string;
  getFile: () => Promise<File>;
  createWritable: () => Promise<Writable>;
}
export interface WDirHandle {
  readonly kind: 'directory';
  readonly name: string;
  values: () => AsyncIterableIterator<WFileHandle | WDirHandle>;
  getFileHandle: (name: string, opts?: { create?: boolean }) => Promise<WFileHandle>;
  queryPermission?: (d: { mode: 'read' | 'readwrite' }) => Promise<FSPermissionState>;
  requestPermission?: (d: { mode: 'read' | 'readwrite' }) => Promise<FSPermissionState>;
}
interface DirPickerWindow {
  showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<WDirHandle>;
}

export function supportsFolders(): boolean {
  return typeof (window as unknown as DirPickerWindow).showDirectoryPicker === 'function';
}

/** State for one .json in the folder. The FS handle is held outside React. */
export interface WorkspaceFile {
  name: string; // filename, e.g. "EC_caribbean.json"
  shipId: string; // bundle.shipId (display only)
  voyages: VoyageMap;
  selectedId: string;
  /** Ship-level consumption defaults stored in this file (v2 bundles). */
  consumptionDefaults?: ConsumptionSettings;
  error?: string; // set if the file failed to parse
}

export interface WorkspaceLoad {
  dir: WDirHandle;
  files: WorkspaceFile[];
  handles: Map<string, WFileHandle>; // filename → handle for write-back
}

/** Prompt for a folder (readwrite). Returns null if the user cancelled. */
export async function pickWorkspaceDir(): Promise<WDirHandle | null> {
  const w = window as unknown as DirPickerWindow;
  if (!w.showDirectoryPicker) throw new Error('This browser has no folder picker (use Chrome or Edge).');
  try {
    return await w.showDirectoryPicker({ mode: 'readwrite' });
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') return null;
    throw e;
  }
}

async function ensureWritable(dir: WDirHandle): Promise<boolean> {
  if (!dir.queryPermission || !dir.requestPermission) return true;
  if ((await dir.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  return (await dir.requestPermission({ mode: 'readwrite' })) === 'granted';
}

/** Read + parse every .json in the folder, sorted chronologically by file. */
export async function readWorkspace(dir: WDirHandle): Promise<WorkspaceLoad> {
  await ensureWritable(dir);
  const files: WorkspaceFile[] = [];
  const handles = new Map<string, WFileHandle>();

  for await (const entry of dir.values()) {
    if (entry.kind !== 'file' || !entry.name.toLowerCase().endsWith('.json')) continue;
    handles.set(entry.name, entry);
    try {
      const file = await entry.getFile();
      const bundle = parseBundle(await file.text());
      files.push({
        name: entry.name,
        shipId: bundle.shipId || '',
        voyages: bundle.voyages,
        selectedId: bundle.selectedId || Object.keys(bundle.voyages)[0] || '',
        consumptionDefaults: bundle.consumptionDefaults,
      });
    } catch (e) {
      files.push({ name: entry.name, shipId: '', voyages: {}, selectedId: '', error: (e as Error).message });
    }
  }

  files.sort((a, b) => {
    const ka = fileStartKey(a.voyages);
    const kb = fileStartKey(b.voyages);
    return ka === kb ? a.name.localeCompare(b.name) : ka.localeCompare(kb);
  });
  return { dir, files, handles };
}

function bundleFor(file: WorkspaceFile): Bundle {
  return buildBundle(file.voyages, file.selectedId, file.shipId, file.consumptionDefaults);
}

/** Write a file's voyages back to its handle in place. */
export async function writeWorkspaceFile(handle: WFileHandle, file: WorkspaceFile): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(bundleFor(file), null, 2));
  await writable.close();
}

/** Create a brand-new .json in the folder (deduping the name) and return its handle + entry. */
export async function createWorkspaceFile(
  dir: WDirHandle,
  baseName: string,
  voyages: VoyageMap,
  selectedId: string,
  shipId: string,
  existing: ReadonlySet<string>,
): Promise<{ handle: WFileHandle; file: WorkspaceFile }> {
  let name = baseName.toLowerCase().endsWith('.json') ? baseName : `${baseName}.json`;
  let i = 2;
  while (existing.has(name)) {
    name = `${baseName.replace(/\.json$/i, '')} (${i}).json`;
    i++;
  }
  const handle = await dir.getFileHandle(name, { create: true });
  const file: WorkspaceFile = { name, shipId, voyages, selectedId };
  await writeWorkspaceFile(handle, file);
  return { handle, file };
}
