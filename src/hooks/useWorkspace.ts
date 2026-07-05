// Folder-backed workspace state machine. Replaces the per-ship useVoyages: the
// chosen directory is the live record — every .json is read on open, edits and
// paste write straight back to that file's handle (debounced). Holds selection
// (file + voyage), the daily-password edit gate, and cross-file copy/paste.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Leg, LegType, Session, Voyage } from '../types';
import { roleCanEdit, roleLabel } from '../domain/roles';
import { dayNum } from '../domain/time';
import { localDateKey } from '../domain/password';
import { voyageStartDate, fileStartKey } from '../domain/schedule';
import { isShipCode } from '../domain/ships';
import {
  pickWorkspaceDir,
  readWorkspace,
  writeWorkspaceFile,
  createWorkspaceFile,
  type WorkspaceFile,
  type WDirHandle,
  type WFileHandle,
  type WorkspaceLoad,
} from '../storage/workspace';
import { exportExcel, importExcel, type XlsxScope } from '../storage/excel';
import { saveDirHandle, loadDirHandle } from '../storage/idbHandle';

function nowStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
  );
}

const TYPE_CYCLE: LegType[] = ['Port', 'Sea', 'Tender'];
const EDIT_SS_KEY = 'vst_unlocked';
function readEditAuth(): boolean {
  try {
    return sessionStorage.getItem(EDIT_SS_KEY) === localDateKey();
  } catch {
    return false;
  }
}

const DAY_MS = 86400000;
/** Shift every dated leg by deltaDays (keeps times); used on paste re-date. */
function shiftDates(vo: Voyage, deltaDays: number): void {
  if (!deltaDays) return;
  for (const l of vo.legs) {
    if (!l.date) continue;
    const t = Date.parse(l.date + 'T00:00:00Z');
    if (!Number.isNaN(t)) {
      l.date = new Date(t + deltaDays * DAY_MS).toISOString().slice(0, 10);
    }
  }
}

export interface PasteState {
  targetFile: string;
  name: string;
  startDate: string;
}

export interface WorkspaceApi {
  dirName: string;
  lastDirName: string; // name of the remembered folder ('' if none) for "reopen"
  files: WorkspaceFile[];
  selectedFile: string;
  selectedId: string;
  current: Voyage | undefined;
  currentFile: WorkspaceFile | undefined;
  shipCode: string; // current file's shipId (display)

  canEdit: boolean;
  editAuthorized: boolean;
  editable: boolean;
  loggedBy: string;

  search: string;
  expanded: Record<string, boolean>;
  toast: string;
  exportMenu: boolean;
  showPassword: boolean;
  showUnlock: boolean;
  unlockNote: string;
  clipboardCount: number;
  pasteState: PasteState | null;

  openFolder: () => Promise<void>;
  reopenLast: () => Promise<void>;
  doImportExcel: () => Promise<void>;
  setSearch: (s: string) => void;
  setExportMenu: (open: boolean) => void;
  flash: (msg: string) => void;
  selectVoyage: (file: string, id: string) => void;
  toggleFile: (file: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
  createVoyage: () => void;
  createFile: () => Promise<void>;
  deleteVoyage: (file: string, id: string) => void;
  setTitle: (title: string) => void;
  setNumber: (number: string) => void;

  updateLeg: (i: number, field: keyof Leg, val: string) => void;
  fillDown: (fromIndex: number, toIndex: number, field: keyof Leg) => void;
  undo: () => void;
  redo: () => void;
  setMode: (i: number, mode: 'speed' | 'time') => void;
  toggleType: (i: number) => void;
  addLeg: (type: LegType) => void;
  insertLeg: (i: number) => void;
  deleteLeg: (i: number) => void;
  moveLeg: (i: number, dir: -1 | 1) => void;

  toggleLock: () => void;
  confirmPassword: () => void;
  cancelPassword: () => void;
  setUnlockNote: (s: string) => void;
  confirmUnlock: () => void;
  cancelUnlock: () => void;

  copyVoyage: (file: string, id: string) => void;
  requestPaste: (targetFile: string) => void;
  setPasteName: (s: string) => void;
  setPasteDate: (s: string) => void;
  confirmPaste: () => void;
  cancelPaste: () => void;

  doSaveJson: () => Promise<void>;
  doExportExcel: (scope: XlsxScope) => Promise<void>;
}

export function useWorkspace(session: Session): WorkspaceApi {
  const canEdit = roleCanEdit(session.role);
  const loggedBy = `${session.name} · ${roleLabel(session.role)}`;

  const [dirName, setDirName] = useState('');
  const [lastDirName, setLastDirName] = useState('');
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [selectedFile, setSelectedFile] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editAuthorized, setEditAuthorized] = useState(readEditAuth);
  const [showPassword, setShowPassword] = useState(false);
  const [showUnlock, setShowUnlock] = useState(false);
  const [unlockNote, setUnlockNote] = useState('');
  const [toast, setToast] = useState('');
  const [exportMenu, setExportMenu] = useState(false);
  const [clipboardCount, setClipboardCount] = useState(0);
  const [pasteState, setPasteState] = useState<PasteState | null>(null);

  const dirRef = useRef<WDirHandle | null>(null);
  const lastHandleRef = useRef<WDirHandle | null>(null);
  const handlesRef = useRef<Map<string, WFileHandle>>(new Map());
  const filesRef = useRef<WorkspaceFile[]>(files);
  const dirtyRef = useRef<Set<string>>(new Set());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clipboardRef = useRef<{ sourceFile: string; id: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Per-voyage undo/redo history. Keyed by file::voyage so switching voyages
  // keeps each one's stack. Snapshots are full-voyage clones, capped at 50.
  const historyRef = useRef<Map<string, { past: Voyage[]; future: Voyage[] }>>(new Map());

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  // Edit authorization is scoped to the local date. A tab left open past local
  // midnight must drop back to view mode — re-check on focus/visibility and on a
  // slow timer so the stale stamp doesn't keep editing alive into a new day.
  useEffect(() => {
    if (!editAuthorized) return;
    const check = () => {
      if (!readEditAuth()) {
        try {
          sessionStorage.removeItem(EDIT_SS_KEY);
        } catch {
          /* ignore */
        }
        setEditAuthorized(false);
      }
    };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    const id = setInterval(check, 60000);
    return () => {
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
      clearInterval(id);
    };
  }, [editAuthorized]);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2200);
  }, []);

  // ── Disk write-back ───────────────────────────────────────────────────
  // Returns the names of files that failed to write (re-queued for retry) so
  // callers like Save can report honestly instead of always flashing "Saved".
  const flushDirty = useCallback(async (): Promise<string[]> => {
    const names = [...dirtyRef.current];
    dirtyRef.current.clear();
    const failed: string[] = [];
    for (const name of names) {
      const f = filesRef.current.find((x) => x.name === name);
      const h = handlesRef.current.get(name);
      if (f && h && !f.error) {
        try {
          await writeWorkspaceFile(h, f);
        } catch {
          dirtyRef.current.add(name); // retry on next flush
          failed.push(name);
        }
      }
    }
    return failed;
  }, []);

  const markDirty = useCallback(
    (name: string, immediate = false) => {
      if (!name) return;
      dirtyRef.current.add(name);
      if (flushTimer.current) clearTimeout(flushTimer.current);
      if (immediate) {
        void flushDirty();
      } else {
        flushTimer.current = setTimeout(() => void flushDirty(), 1000);
      }
    },
    [flushDirty],
  );

  // ── Folder open ───────────────────────────────────────────────────────
  // Offer "reopen last folder": the handle's .name reads without permission.
  useEffect(() => {
    loadDirHandle()
      .then((h) => {
        if (h) {
          lastHandleRef.current = h;
          setLastDirName(h.name);
        }
      })
      .catch(() => {});
  }, []);

  const applyLoad = useCallback(
    (load: WorkspaceLoad) => {
      dirRef.current = load.dir;
      handlesRef.current = load.handles;
      setDirName(load.dir.name);
      setFiles(load.files);
      const firstFile = load.files.find((f) => !f.error && Object.keys(f.voyages).length) ?? load.files[0];
      setSelectedFile(firstFile?.name ?? '');
      setSelectedId(firstFile?.selectedId ?? '');
      setExpanded(Object.fromEntries(load.files.map((f) => [f.name, true])));
      void saveDirHandle(load.dir);
      lastHandleRef.current = load.dir;
      setLastDirName(load.dir.name);
      const okCount = load.files.filter((f) => !f.error).length;
      flash(`Loaded ${okCount} file(s) from ${load.dir.name}`);
    },
    [flash],
  );

  const openFolder = useCallback(async () => {
    try {
      const dir = await pickWorkspaceDir();
      if (!dir) return;
      applyLoad(await readWorkspace(dir));
    } catch (e) {
      flash(`Could not open folder: ${(e as Error).message}`);
    }
  }, [applyLoad, flash]);

  // Reopen the remembered folder — readWorkspace re-requests readwrite (one
  // permission prompt) on this click. Falls back to the picker if it's gone.
  const reopenLast = useCallback(async () => {
    const h = lastHandleRef.current;
    if (!h) {
      await openFolder();
      return;
    }
    try {
      applyLoad(await readWorkspace(h));
    } catch (e) {
      flash(`Couldn’t reopen ${h.name}: ${(e as Error).message}. Choose the folder again.`);
    }
  }, [applyLoad, openFolder, flash]);

  // ── Derived ───────────────────────────────────────────────────────────
  const currentFile = useMemo(() => files.find((f) => f.name === selectedFile), [files, selectedFile]);
  const current = currentFile?.voyages[selectedId];
  const shipCode = currentFile?.shipId ?? '';
  const editable = !!current && !current.locked && canEdit && editAuthorized;

  const HISTORY_CAP = 50;
  const histKey = useCallback(() => `${selectedFile}::${selectedId}`, [selectedFile, selectedId]);
  const getHist = useCallback(() => {
    const k = histKey();
    let h = historyRef.current.get(k);
    if (!h) {
      h = { past: [], future: [] };
      historyRef.current.set(k, h);
    }
    return h;
  }, [histKey]);

  // Replace the current voyage object outright (used by undo/redo) without
  // touching history. Schedules the debounced write-back.
  const applyVoyage = useCallback(
    (next: Voyage) => {
      setFiles((prev) =>
        prev.map((f) => (f.name === selectedFile && f.voyages[selectedId] ? { ...f, voyages: { ...f.voyages, [selectedId]: next } } : f)),
      );
      markDirty(selectedFile);
    },
    [selectedFile, selectedId, markDirty],
  );

  // Mutate the current voyage in the current file, then schedule write-back.
  // Clone ONLY the edited voyage (not every voyage in the file) so a keystroke
  // doesn't deep-copy the whole file; the new voyage object is also what lets
  // computeVoyage + LegRow memoise on identity. Before applying, snapshot the
  // pre-edit voyage onto the undo stack (deduped so a synchronous burst — e.g. a
  // multi-cell paste — collapses to one undo step rather than one per cell).
  const mutate = useCallback(
    (fn: (v: Voyage) => void) => {
      const target = filesRef.current.find((f) => f.name === selectedFile)?.voyages[selectedId];
      if (target) {
        const h = getHist();
        const snap = structuredClone(target);
        const last = h.past[h.past.length - 1];
        if (!last || JSON.stringify(last) !== JSON.stringify(snap)) {
          h.past.push(snap);
          if (h.past.length > HISTORY_CAP) h.past.shift();
          h.future = [];
        }
      }
      setFiles((prev) =>
        prev.map((f) => {
          if (f.name !== selectedFile) return f;
          const t = f.voyages[selectedId];
          if (!t) return f;
          const v = structuredClone(t);
          fn(v);
          return { ...f, voyages: { ...f.voyages, [selectedId]: v } };
        }),
      );
      markDirty(selectedFile);
    },
    [selectedFile, selectedId, markDirty, getHist],
  );

  const undo = useCallback(() => {
    const h = historyRef.current.get(histKey());
    const target = filesRef.current.find((f) => f.name === selectedFile)?.voyages[selectedId];
    if (!h || !h.past.length || !target) return;
    h.future.push(structuredClone(target));
    applyVoyage(h.past.pop() as Voyage);
    flash('Undo');
  }, [histKey, selectedFile, selectedId, applyVoyage, flash]);

  const redo = useCallback(() => {
    const h = historyRef.current.get(histKey());
    const target = filesRef.current.find((f) => f.name === selectedFile)?.voyages[selectedId];
    if (!h || !h.future.length || !target) return;
    h.past.push(structuredClone(target));
    applyVoyage(h.future.pop() as Voyage);
    flash('Redo');
  }, [histKey, selectedFile, selectedId, applyVoyage, flash]);

  const guessUtc = useCallback((): string => {
    const v = currentFile?.voyages[selectedId];
    if (v) {
      for (let i = v.legs.length - 1; i >= 0; i--) {
        if (v.legs[i].utc !== '') return v.legs[i].utc;
      }
    }
    return '-5';
  }, [currentFile, selectedId]);

  const blankLeg = useCallback(
    (type: LegType): Leg => ({
      type,
      date: '',
      port: type === 'Sea' ? 'At Sea' : type === 'Tender' ? 'Anchorage' : '',
      dist: '',
      mode: 'speed',
      eta: '',
      arr: '',
      dep: '',
      faw: '',
      sunrise: '',
      sunset: '',
      utc: guessUtc(),
      openLoop: '',
      seaCond: '',
      stbyArrDist: '',
      stbyDepDist: '',
      stbyArrPowerMW: '',
      stbyDepPowerMW: '',
      remarks: '',
      speed: '',
    }),
    [guessUtc],
  );

  // ── Leg operations ────────────────────────────────────────────────────
  const updateLeg = useCallback(
    (i: number, field: keyof Leg, val: string) => {
      if (!editable && field !== 'type') return;
      mutate((v) => {
        (v.legs[i][field] as string) = val;
      });
    },
    [editable, mutate],
  );
  // Excel-style fill handle: copy the value in row `fromIndex` down through
  // `toIndex` (inclusive). Dates write a +1-day series; every other field copies
  // verbatim. No-op if the source value is blank/malformed (date).
  const fillDown = useCallback(
    (fromIndex: number, toIndex: number, field: keyof Leg) => {
      if (!editable || toIndex <= fromIndex) return;
      const src = currentFile?.voyages[selectedId]?.legs[fromIndex];
      if (!src) return;
      if (field === 'date') {
        const base = dayNum(src.date);
        if (base == null) return;
        mutate((v) => {
          for (let i = fromIndex + 1; i <= toIndex; i++) {
            if (!v.legs[i]) break;
            v.legs[i].date = new Date((base + (i - fromIndex)) * 86400000).toISOString().slice(0, 10);
          }
        });
      } else {
        const val = src[field];
        mutate((v) => {
          for (let i = fromIndex + 1; i <= toIndex; i++) {
            if (!v.legs[i]) break;
            (v.legs[i][field] as string) = val;
          }
        });
      }
    },
    [editable, currentFile, selectedId, mutate],
  );
  const setMode = useCallback(
    (i: number, mode: 'speed' | 'time') => {
      if (!editable) return;
      mutate((v) => {
        v.legs[i].mode = mode;
      });
    },
    [editable, mutate],
  );
  const toggleType = useCallback(
    (i: number) => {
      if (!editable) return;
      mutate((v) => {
        const cur = v.legs[i].type;
        v.legs[i].type = TYPE_CYCLE[(TYPE_CYCLE.indexOf(cur) + 1) % 3];
      });
    },
    [editable, mutate],
  );
  const addLeg = useCallback(
    (type: LegType) => {
      if (!editable) return;
      const l = blankLeg(type);
      mutate((v) => {
        v.legs.push(l);
      });
      flash((type === 'Sea' ? 'At-sea' : type === 'Tender' ? 'Tender' : 'Port') + ' leg added');
    },
    [editable, blankLeg, mutate, flash],
  );
  const insertLeg = useCallback(
    (i: number) => {
      if (!editable) return;
      const l = blankLeg('Port');
      mutate((v) => {
        v.legs.splice(i + 1, 0, l);
      });
    },
    [editable, blankLeg, mutate],
  );
  const deleteLeg = useCallback(
    (i: number) => {
      if (!editable) return;
      mutate((v) => {
        v.legs.splice(i, 1);
      });
    },
    [editable, mutate],
  );
  const moveLeg = useCallback(
    (i: number, dir: -1 | 1) => {
      if (!editable) return;
      mutate((v) => {
        const j = i + dir;
        if (j < 0 || j >= v.legs.length) return;
        const t = v.legs[i];
        v.legs[i] = v.legs[j];
        v.legs[j] = t;
      });
    },
    [editable, mutate],
  );

  // ── Selection / tree ──────────────────────────────────────────────────
  const selectVoyage = useCallback((file: string, id: string) => {
    setSelectedFile(file);
    setSelectedId(id);
  }, []);
  const toggleFile = useCallback((file: string) => {
    setExpanded((prev) => ({ ...prev, [file]: prev[file] === false }));
  }, []);
  const expandAll = useCallback(() => {
    setExpanded(Object.fromEntries(filesRef.current.map((f) => [f.name, true])));
  }, []);
  const collapseAll = useCallback(() => {
    setExpanded(Object.fromEntries(filesRef.current.map((f) => [f.name, false])));
  }, []);

  // Chronological file order, reused after add/import so the tree stays sorted.
  const sortFiles = (arr: WorkspaceFile[]): WorkspaceFile[] =>
    [...arr].sort((a, b) => {
      const ka = fileStartKey(a.voyages);
      const kb = fileStartKey(b.voyages);
      return ka === kb ? a.name.localeCompare(b.name) : ka.localeCompare(kb);
    });

  const nextId = (voyages: Record<string, Voyage>): string => {
    const ids = Object.keys(voyages).map(Number).filter((n) => !isNaN(n));
    return String((ids.length ? Math.max(...ids) : 0) + 1);
  };

  // Add a blank template (cruise) to the selected file. Title starts empty so
  // the crew types the product name (e.g. "Norwegian Fjords").
  const createVoyage = useCallback(() => {
    if (!canEdit || !editAuthorized || !selectedFile) return;
    let newId = '';
    setFiles((prev) =>
      prev.map((f) => {
        if (f.name !== selectedFile) return f;
        const voyages = { ...f.voyages };
        newId = nextId(voyages);
        voyages[newId] = {
          id: newId,
          number: '',
          title: '',
          ended: false,
          locked: false,
          loggedBy,
          legs: [],
          versions: [{ action: 'Created', by: loggedBy, note: 'New template', at: nowStamp() }],
        };
        return { ...f, voyages, selectedId: newId };
      }),
    );
    if (newId) setSelectedId(newId);
    markDirty(selectedFile);
    flash('Template added');
  }, [canEdit, editAuthorized, selectedFile, loggedBy, markDirty, flash]);

  // Create a brand-new empty .json file in the folder.
  const createFile = useCallback(async () => {
    if (!canEdit || !editAuthorized || !dirRef.current) return;
    const raw = window.prompt('New file name (without .json):', 'templates');
    if (raw === null) return;
    const base = raw.trim() || 'templates';
    try {
      const existing = new Set(filesRef.current.map((f) => f.name));
      const { handle, file } = await createWorkspaceFile(dirRef.current, base, {}, '', '', existing);
      handlesRef.current.set(file.name, handle);
      setFiles((prev) => sortFiles([...prev, file]));
      setSelectedFile(file.name);
      setSelectedId('');
      setExpanded((prev) => ({ ...prev, [file.name]: true }));
      flash(`Created ${file.name}`);
    } catch (e) {
      flash(`Couldn’t create file: ${(e as Error).message}`);
    }
  }, [canEdit, editAuthorized, flash]);

  // Delete a cruise (template) from its file and write the file back.
  const deleteVoyage = useCallback(
    (fileName: string, id: string) => {
      if (!canEdit || !editAuthorized) return;
      const target = filesRef.current.find((f) => f.name === fileName);
      if (!target || !target.voyages[id]) return;
      const voyages = { ...target.voyages };
      delete voyages[id];
      const newSel = target.selectedId === id ? Object.keys(voyages)[0] ?? '' : target.selectedId;
      const newFile: WorkspaceFile = { ...target, voyages, selectedId: newSel };
      setFiles((prev) => prev.map((f) => (f.name === fileName ? newFile : f)));
      if (selectedFile === fileName && selectedId === id) setSelectedId(newSel);
      const handle = handlesRef.current.get(fileName);
      if (handle) writeWorkspaceFile(handle, newFile).catch(() => markDirty(fileName));
      flash('Cruise deleted');
    },
    [canEdit, editAuthorized, selectedFile, selectedId, markDirty, flash],
  );

  // Edit the current cruise's name (product name).
  const setTitle = useCallback(
    (title: string) => {
      if (!editable) return;
      mutate((v) => {
        v.title = title;
      });
    },
    [editable, mutate],
  );

  // Edit the current cruise's 3-digit voyage number. Digits only, max 3.
  const setNumber = useCallback(
    (number: string) => {
      if (!editable) return;
      const clean = number.replace(/\D/g, '').slice(0, 3);
      mutate((v) => {
        v.number = clean;
      });
    },
    [editable, mutate],
  );

  // ── Lock / edit gate ──────────────────────────────────────────────────
  const toggleLock = useCallback(() => {
    if (!canEdit) return;
    // Open the password gate even with no voyage selected — otherwise an empty
    // folder is a dead end (can't authorize → can't create the first file).
    if (!editAuthorized) {
      setShowPassword(true);
      return;
    }
    if (!current) return; // authorized but nothing to lock yet
    if (current.locked) {
      setUnlockNote('');
      setShowUnlock(true);
    } else {
      mutate((vo) => {
        vo.locked = true;
        vo.versions.push({ action: 'Locked', by: loggedBy, note: 'Edits committed', at: nowStamp() });
      });
      flash('Voyage locked');
    }
  }, [current, canEdit, editAuthorized, loggedBy, mutate, flash]);

  const confirmPassword = useCallback(() => {
    try {
      sessionStorage.setItem(EDIT_SS_KEY, localDateKey());
    } catch {
      /* private mode */
    }
    setEditAuthorized(true);
    setShowPassword(false);
    if (current && current.locked) {
      mutate((vo) => {
        vo.locked = false;
        vo.versions.push({ action: 'Unlocked', by: loggedBy, note: 'Edit enabled', at: nowStamp() });
      });
    }
    flash('Edit enabled');
  }, [current, loggedBy, mutate, flash]);
  const cancelPassword = useCallback(() => setShowPassword(false), []);

  const confirmUnlock = useCallback(() => {
    const note = unlockNote.trim() || 'No reason given';
    mutate((vo) => {
      vo.locked = false;
      vo.versions.push({ action: 'Unlocked', by: loggedBy, note, at: nowStamp() });
    });
    setShowUnlock(false);
    setUnlockNote('');
    flash('Unlocked — edit mode enabled');
  }, [unlockNote, loggedBy, mutate, flash]);
  const cancelUnlock = useCallback(() => setShowUnlock(false), []);

  // ── Copy / paste across files ─────────────────────────────────────────
  const copyVoyage = useCallback(
    (file: string, id: string) => {
      clipboardRef.current = { sourceFile: file, id };
      setClipboardCount(1);
      const title = filesRef.current.find((f) => f.name === file)?.voyages[id]?.title ?? 'voyage';
      flash(`Copied “${title}” — paste into a file`);
    },
    [flash],
  );

  const requestPaste = useCallback((targetFile: string) => {
    const clip = clipboardRef.current;
    if (!clip) return;
    const src = filesRef.current.find((f) => f.name === clip.sourceFile)?.voyages[clip.id];
    if (!src) return;
    setPasteState({
      targetFile,
      name: `${src.title} (copy)`,
      startDate: voyageStartDate(src),
    });
  }, []);
  const setPasteName = useCallback((s: string) => setPasteState((p) => (p ? { ...p, name: s } : p)), []);
  const setPasteDate = useCallback((s: string) => setPasteState((p) => (p ? { ...p, startDate: s } : p)), []);
  const cancelPaste = useCallback(() => setPasteState(null), []);

  const confirmPaste = useCallback(() => {
    const clip = clipboardRef.current;
    const ps = pasteState;
    if (!clip || !ps) {
      setPasteState(null);
      return;
    }
    const src = filesRef.current.find((f) => f.name === clip.sourceFile)?.voyages[clip.id];
    const target = filesRef.current.find((f) => f.name === ps.targetFile);
    if (!src || !target) {
      setPasteState(null);
      return;
    }
    // Build the new target file from current committed state, then write it
    // straight to disk (not via the post-render ref, which would race the
    // setFiles commit and persist the stale file).
    const voyages = { ...target.voyages };
    const newId = nextId(voyages);
    const clone = JSON.parse(JSON.stringify(src)) as Voyage;
    clone.id = newId;
    clone.title = ps.name.trim() || src.title;
    clone.locked = false;
    const oldStart = voyageStartDate(src);
    if (ps.startDate && oldStart) {
      const delta = Math.round((Date.parse(ps.startDate + 'T00:00:00Z') - Date.parse(oldStart + 'T00:00:00Z')) / DAY_MS);
      shiftDates(clone, delta);
    }
    clone.versions = [
      ...(clone.versions ?? []),
      { action: 'Pasted', by: loggedBy, note: `From ${clip.sourceFile}`, at: nowStamp() },
    ];
    voyages[newId] = clone;
    const newFile: WorkspaceFile = { ...target, voyages, selectedId: newId };

    setFiles((prev) => prev.map((f) => (f.name === ps.targetFile ? newFile : f)));
    setSelectedFile(ps.targetFile);
    setSelectedId(newId);
    setExpanded((prev) => ({ ...prev, [ps.targetFile]: true }));
    setPasteState(null);

    const handle = handlesRef.current.get(ps.targetFile);
    if (handle) writeWorkspaceFile(handle, newFile).catch(() => markDirty(ps.targetFile));
    flash(`Pasted into ${ps.targetFile}`);
  }, [pasteState, loggedBy, markDirty, flash]);

  // ── Save / export ─────────────────────────────────────────────────────
  const doSaveJson = useCallback(async () => {
    if (!selectedFile) {
      flash('Nothing to save');
      return;
    }
    dirtyRef.current.add(selectedFile);
    const failed = await flushDirty();
    if (failed.includes(selectedFile)) {
      flash(`Couldn’t save ${selectedFile} — check folder access`);
    } else {
      flash(`Saved · ${selectedFile}`);
    }
  }, [selectedFile, flushDirty, flash]);

  // Import an .xlsx into the folder as a NEW .json file, then select it.
  const doImportExcel = useCallback(async () => {
    if (!canEdit || !editAuthorized || !dirRef.current) return;
    try {
      const res = await importExcel(loggedBy);
      if (!res) return;
      const ship = res.shipCode ?? '';
      const base = `${ship || 'import'}_${new Date().toISOString().slice(0, 10)}`;
      const existing = new Set(filesRef.current.map((f) => f.name));
      const { handle, file } = await createWorkspaceFile(
        dirRef.current,
        base,
        res.voyages,
        res.selectedId,
        ship,
        existing,
      );
      handlesRef.current.set(file.name, handle);
      setFiles((prev) =>
        [...prev, file].sort((a, b) => {
          const ka = fileStartKey(a.voyages);
          const kb = fileStartKey(b.voyages);
          return ka === kb ? a.name.localeCompare(b.name) : ka.localeCompare(kb);
        }),
      );
      setSelectedFile(file.name);
      setSelectedId(file.selectedId);
      setExpanded((prev) => ({ ...prev, [file.name]: true }));
      flash(`Imported ${Object.keys(res.voyages).length} voyage(s) → ${file.name}`);
    } catch (e) {
      flash(`Import failed: ${(e as Error).message}`);
    }
  }, [canEdit, editAuthorized, loggedBy, flash]);

  const doExportExcel = useCallback(
    async (scope: XlsxScope) => {
      setExportMenu(false);
      if (!currentFile) return;
      const ship = isShipCode(currentFile.shipId) ? currentFile.shipId : 'EC';
      try {
        flash('Building Excel…');
        const filename = await exportExcel(ship, currentFile.voyages, scope, selectedId);
        flash(scope === 'all' ? `All voyages exported · ${filename}` : `Exported · ${filename}`);
      } catch (e) {
        flash(`Export failed: ${(e as Error).message}`);
      }
    },
    [currentFile, selectedId, flash],
  );

  return {
    dirName,
    lastDirName,
    files,
    selectedFile,
    selectedId,
    current,
    currentFile,
    shipCode,
    canEdit,
    editAuthorized,
    editable,
    loggedBy,
    search,
    expanded,
    toast,
    exportMenu,
    showPassword,
    showUnlock,
    unlockNote,
    clipboardCount,
    pasteState,
    openFolder,
    reopenLast,
    doImportExcel,
    setSearch,
    setExportMenu,
    flash,
    selectVoyage,
    toggleFile,
    expandAll,
    collapseAll,
    createVoyage,
    createFile,
    deleteVoyage,
    setTitle,
    setNumber,
    updateLeg,
    fillDown,
    undo,
    redo,
    setMode,
    toggleType,
    addLeg,
    insertLeg,
    deleteLeg,
    moveLeg,
    toggleLock,
    confirmPassword,
    cancelPassword,
    setUnlockNote,
    confirmUnlock,
    cancelUnlock,
    copyVoyage,
    requestPaste,
    setPasteName,
    setPasteDate,
    confirmPaste,
    cancelPaste,
    doSaveJson,
    doExportExcel,
  };
}
