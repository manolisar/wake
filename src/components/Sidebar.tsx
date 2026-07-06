// Left sidebar — a "chart index" of the folder: each .json is a sheet, its
// cruises nested beneath (sorted by start date). Toolbar adds templates / files
// and expands-collapses the whole tree; rows carry copy / paste / delete.
import { useState } from 'react';
import type { WorkspaceFile } from '../storage/workspace';
import { voyageEndDate, voyageStartDate } from '../domain/schedule';
import { ConfirmModal } from './ConfirmModal';
import {
  SearchIcon,
  PlusIcon,
  FilePlusIcon,
  FolderIcon,
  CopyIcon,
  PasteIcon,
  TrashIcon,
  ExpandIcon,
  CollapseIcon,
} from './Icons';

interface Props {
  files: WorkspaceFile[];
  selectedFile: string;
  selectedId: string;
  search: string;
  expanded: Record<string, boolean>;
  canEdit: boolean;
  canMutate: boolean; // canEdit AND edit-authorised → add / delete / paste
  clipboardCount: number;
  onSearch: (s: string) => void;
  onSelect: (file: string, id: string) => void;
  onToggleFile: (file: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onAddTemplate: () => void;
  onNewFile: () => void;
  onCopyVoyage: (file: string, id: string) => void;
  onRequestPaste: (file: string) => void;
  onDeleteVoyage: (file: string, id: string) => void;
}

function fmtDate(d: string): string {
  if (!d) return '—';
  const t = Date.parse(d + 'T00:00:00Z');
  return Number.isNaN(t)
    ? d
    : new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
}

const STATUS = {
  active: { dot: '#10b981', label: 'Active' },
  ended: { dot: 'var(--color-muted)', label: 'Ended' },
  locked: { dot: 'var(--color-amber)', label: 'Locked' },
};

export function Sidebar({
  files,
  selectedFile,
  selectedId,
  search,
  expanded,
  canEdit,
  canMutate,
  clipboardCount,
  onSearch,
  onSelect,
  onToggleFile,
  onExpandAll,
  onCollapseAll,
  onAddTemplate,
  onNewFile,
  onCopyVoyage,
  onRequestPaste,
  onDeleteVoyage,
}: Props) {
  const q = search.trim().toLowerCase();
  const iconBtn =
    'vt-unbutton inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-rail hover:text-ink';
  // Pending delete confirmation (styled dialog instead of window.confirm).
  const [confirmDel, setConfirmDel] = useState<{ file: string; id: string; label: string } | null>(null);

  return (
    <aside className="flex min-h-0 w-full flex-col bg-surface">
      {/* search */}
      <div className="relative flex-shrink-0 px-3 pt-3">
        <span className="pointer-events-none absolute left-[22px] top-1/2 -translate-y-1/2 text-faint">
          <SearchIcon size={14} />
        </span>
        <input
          type="search"
          name="voyage-search"
          autoComplete="off"
          spellCheck={false}
          aria-label="Search cruises and ports across all files"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search cruises, ports…"
          className="w-full rounded-lg border border-line bg-bg py-2 pl-8 pr-2.5 text-[0.78rem] text-ink outline-none transition-colors focus:border-cyan focus:bg-surface"
        />
      </div>

      {/* toolbar */}
      <div className="flex flex-shrink-0 flex-col gap-2 px-3 pb-2.5 pt-3">
        {canMutate && (
          <div className="flex items-stretch gap-2">
            <button
              onClick={onAddTemplate}
              disabled={!selectedFile}
              title={selectedFile ? `Add a template to ${selectedFile}` : 'Select a file first'}
              className="vt-unbutton inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-cyan px-3 py-2 text-[0.8rem] font-semibold text-white shadow-[0_1px_2px_rgba(6,182,212,0.25)] transition hover:brightness-105 disabled:opacity-40 disabled:shadow-none"
            >
              <PlusIcon size={14} /> Add Template
            </button>
            <button
              onClick={onNewFile}
              title="Create a new .json file in the folder"
              className="vt-unbutton inline-flex items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[0.8rem] font-semibold text-ink transition hover:border-cyan/40 hover:bg-rail"
            >
              <FilePlusIcon size={14} /> New .json
            </button>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-[0.6rem] font-bold uppercase tracking-[1.1px] text-faint">Files</span>
          <div className="flex items-center gap-0.5">
            <button onClick={onExpandAll} title="Expand all" aria-label="Expand all files" className={iconBtn}>
              <ExpandIcon size={14} />
            </button>
            <button onClick={onCollapseAll} title="Collapse all" aria-label="Collapse all files" className={iconBtn}>
              <CollapseIcon size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="mx-3 border-t border-line" />

      {/* tree */}
      <div className="vt-scroll min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {files.length === 0 && (
          <div className="px-3 py-10 text-center text-[0.74rem] leading-relaxed text-faint">
            No <span className="font-mono">.json</span> files in this folder yet.
          </div>
        )}

        {files.map((file) => {
          const open = expanded[file.name] !== false;
          const fileActive = selectedFile === file.name;
          const rows = Object.values(file.voyages)
            .filter((vo) => {
              if (!q) return true;
              const hay = (vo.number + ' ' + vo.title + ' ' + vo.legs.map((l) => l.port).join(' ')).toLowerCase();
              return hay.includes(q);
            })
            .sort((a, b) => voyageStartDate(a).localeCompare(voyageStartDate(b)));
          if (q && rows.length === 0 && !file.error) return null;

          return (
            <div key={file.name} className="mb-1">
              {/* file header */}
              <div
                className="group flex items-center gap-0.5 rounded-lg px-1 transition-colors"
                style={{ background: fileActive ? 'color-mix(in srgb, var(--color-cyan) 9%, transparent)' : 'transparent' }}
              >
                <button
                  type="button"
                  onClick={() => onToggleFile(file.name)}
                  aria-label={open ? `Collapse ${file.name}` : `Expand ${file.name}`}
                  aria-expanded={open}
                  className="vt-unbutton flex h-7 w-5 flex-shrink-0 items-center justify-center rounded text-faint transition-transform hover:text-ink"
                  style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => onSelect(file.name, rows[0]?.id ?? '')}
                  aria-current={fileActive ? 'true' : undefined}
                  className="vt-unbutton flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left"
                >
                  <span className="flex-shrink-0" style={{ color: fileActive ? 'var(--color-cyan-deep)' : 'var(--color-muted)' }}>
                    <FolderIcon size={14} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[0.76rem] font-bold tracking-[-0.1px] text-ink">
                    {file.name.replace(/\.json$/i, '')}
                  </span>
                  {file.shipId && (
                    <span className="flex-shrink-0 rounded bg-rail px-1 font-mono text-[0.6rem] font-bold uppercase tracking-[0.5px] text-muted">
                      {file.shipId}
                    </span>
                  )}
                  {!file.error && (
                    <span className="flex-shrink-0 font-mono text-[0.6rem] font-semibold text-faint">{Object.keys(file.voyages).length}</span>
                  )}
                </button>
                {clipboardCount > 0 && canMutate && !file.error && (
                  <button
                    type="button"
                    onClick={() => onRequestPaste(file.name)}
                    title={`Paste copied cruise into ${file.name}`}
                    aria-label={`Paste copied cruise into ${file.name}`}
                    className="vt-unbutton flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-cyan-deep hover:bg-rail"
                  >
                    <PasteIcon size={13} />
                  </button>
                )}
              </div>

              {open && file.error && (
                <div className="ml-7 mt-0.5 rounded-md bg-[color-mix(in_srgb,var(--color-pink)_8%,transparent)] px-2 py-1.5 text-[0.62rem] leading-snug text-[color:var(--color-spd-hi-fg)]">
                  Couldn’t read this file — {file.error}
                </div>
              )}

              {/* cruises */}
              {open && !file.error && (
                <div className="relative ml-[14px] mt-0.5 pl-2.5">
                  <span className="absolute left-0 top-1 bottom-1 w-px bg-line" aria-hidden="true" />
                  {rows.length === 0 && (
                    <div className="px-2 py-1.5 text-[0.66rem] italic text-faint">No cruises yet</div>
                  )}
                  {rows.map((vo) => {
                    const active = file.name === selectedFile && vo.id === selectedId;
                    const st = vo.locked ? STATUS.locked : vo.ended ? STATUS.ended : STATUS.active;
                    // Primary line = operator-entered cruise number + date span;
                    // the product name sits greyed beneath. The voyage's `id`
                    // stays a separate internal identity and is never shown.
                    const start = voyageStartDate(vo);
                    const end = voyageEndDate(vo);
                    const range = start ? (end && end !== start ? `${fmtDate(start)} – ${fmtDate(end)}` : fmtDate(start)) : '—';
                    return (
                      <div key={vo.id} className="group relative flex items-center">
                        {active && <span className="absolute -left-[10px] top-1.5 bottom-1.5 w-[2px] rounded-full bg-cyan" aria-hidden="true" />}
                        <button
                          type="button"
                          onClick={() => onSelect(file.name, vo.id)}
                          aria-current={active ? 'true' : undefined}
                          className="vt-unbutton flex min-w-0 flex-1 select-none items-center gap-2 rounded-md px-2 py-[5px] transition-colors hover:bg-rail"
                          style={{ background: active ? 'color-mix(in srgb, var(--color-cyan) 12%, transparent)' : 'transparent' }}
                        >
                          <span
                            aria-hidden="true"
                            className="h-[7px] w-[7px] flex-shrink-0 rounded-full"
                            style={{ background: st.dot, boxShadow: active ? `0 0 0 3px color-mix(in srgb, ${st.dot} 22%, transparent)` : 'none' }}
                          />
                          <span className="min-w-0 flex-1 text-left">
                            <span className="flex items-baseline gap-1.5">
                              <span className="flex-shrink-0 font-mono text-[0.74rem] font-bold text-cyan-deep">
                                {vo.number || '—'}
                              </span>
                              <span
                                className="min-w-0 truncate font-mono text-[0.68rem] tabular-nums"
                                style={{
                                  color: active ? 'var(--color-cyan-deep)' : 'var(--color-ink)',
                                  fontWeight: active ? 600 : 500,
                                }}
                              >
                                {range}
                              </span>
                            </span>
                            <span
                              className="block truncate text-[0.64rem] text-faint"
                              style={{ fontStyle: vo.title ? 'normal' : 'italic' }}
                            >
                              {vo.title || 'Untitled cruise'}
                            </span>
                          </span>
                          <span className="sr-only">{st.label}</span>
                        </button>
                        {canEdit && (
                          <div className="absolute right-1 flex items-center gap-0.5 rounded-md bg-rail px-0.5 opacity-0 shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                            <button
                              type="button"
                              onClick={() => onCopyVoyage(file.name, vo.id)}
                              title={`Copy “${vo.title || 'Untitled cruise'}”`}
                              aria-label={`Copy cruise ${vo.title || 'Untitled'}`}
                              className="vt-unbutton flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-line hover:text-cyan-deep"
                            >
                              <CopyIcon size={12} />
                            </button>
                            {canMutate && (
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmDel({
                                    file: file.name,
                                    id: vo.id,
                                    label: vo.number ? `${vo.number} — ${vo.title || 'Untitled cruise'}` : vo.title || 'Untitled cruise',
                                  })
                                }
                                title="Delete cruise"
                                aria-label={`Delete cruise ${vo.title || 'Untitled'}`}
                                className="vt-unbutton flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-line hover:text-[color:var(--color-spd-hi-fg)]"
                              >
                                <TrashIcon size={12} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {confirmDel && (
        <ConfirmModal
          title="Delete cruise"
          body={`Delete “${confirmDel.label}” from ${confirmDel.file}? The file on disk is updated immediately.`}
          confirmLabel="Delete Cruise"
          onConfirm={() => {
            onDeleteVoyage(confirmDel.file, confirmDel.id);
            setConfirmDel(null);
          }}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </aside>
  );
}
