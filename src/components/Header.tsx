// Top bar — brand + folder, signed-in user, themes, Save (flush to folder),
// XLSX export, and the Enable Edit / Lock toggle. The chosen folder is the live
// record; Save flushes the current file's edits to disk immediately.
import { useEffect, useRef, useState } from 'react';
import { APP_NAME, APP_VERSION } from '../appMeta';
import type { XlsxScope } from '../storage/excel';
import { THEMES, type Theme } from '../hooks/useTheme';
import {
  CompassIcon,
  DownloadIcon,
  FileIcon,
  FolderIcon,
  GridIcon,
  SaveIcon,
  LockIcon,
  EditIcon,
  PaletteIcon,
  CheckIcon,
  GaugeIcon,
  BoltIcon,
} from './Icons';

interface Props {
  dirName: string;
  fileName: string; // current file ('' if none)
  shipId: string; // current file's ship (display)
  userLabel: string;
  canEdit: boolean;
  canImport: boolean; // canEdit AND edit-authorised → Excel import allowed
  editing: boolean;
  voyageTotal: number; // voyages in the current file
  exportMenu: boolean;
  hasVoyage: boolean; // a voyage is selected → consumption can run
  onImportExcel: () => void;
  onToggleExportMenu: () => void;
  onCloseExportMenu: () => void;
  onExportXlsx: (scope: XlsxScope) => void;
  onSaveJson: () => void;
  onOpenFolder: () => void;
  onToggleLock: () => void;
  onSignOut: () => void;
  onFuelSetup: () => void;
  onCalculate: () => void;
  theme: Theme;
  onSetTheme: (t: Theme) => void;
}

export function Header({
  dirName,
  fileName,
  shipId,
  userLabel,
  canEdit,
  canImport,
  editing,
  voyageTotal,
  exportMenu,
  hasVoyage,
  onImportExcel,
  onToggleExportMenu,
  onCloseExportMenu,
  onExportXlsx,
  onSaveJson,
  onOpenFolder,
  onToggleLock,
  onSignOut,
  onFuelSetup,
  onCalculate,
  theme,
  onSetTheme,
}: Props) {
  const iconBtn =
    'inline-flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-line bg-surface px-3 py-2 text-[0.75rem] font-semibold text-ink hover:bg-rail';
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (exportMenu) menuRef.current?.querySelector('button')?.focus();
  }, [exportMenu]);

  const [themeMenu, setThemeMenu] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (themeMenu) themeMenuRef.current?.querySelector('button')?.focus();
  }, [themeMenu]);

  // ArrowUp/Down cycle focus through a menu's items (ARIA menu pattern).
  const menuArrowNav = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = Array.from(
      e.currentTarget.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]'),
    );
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next].focus();
  };

  return (
    <header className="z-[5] flex h-14 flex-shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
      <span className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-cyan text-white">
        <CompassIcon size={15} />
      </span>
      <div className="min-w-0">
        <div className="truncate text-[0.95rem] font-extrabold leading-tight tracking-[-0.2px]">
          {APP_NAME} <span className="align-middle text-[0.62rem] font-semibold text-faint">v{APP_VERSION}</span>{' '}
          {fileName && <span className="font-medium opacity-65">— {fileName}</span>}
        </div>
        <div className="truncate font-mono text-[0.6rem] uppercase tracking-[1px] text-faint">
          <FolderIcon size={9} /> {dirName || 'no folder'}
          {shipId ? ` · ${shipId}` : ''}
        </div>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        <span className="hidden text-[0.68rem] text-muted sm:inline">{userLabel}</span>
        <button onClick={onOpenFolder} className={iconBtn} title="Choose a different folder">
          <FolderIcon size={14} /> Folder
        </button>
        <div className="relative">
          <button
            onClick={() => setThemeMenu((o) => !o)}
            className={iconBtn}
            aria-haspopup="menu"
            aria-expanded={themeMenu}
            title="Themes"
          >
            <PaletteIcon size={14} /> Themes <span className="text-[0.6rem] opacity-45">{themeMenu ? '▴' : '▾'}</span>
          </button>
          {themeMenu && (
            <div className="fixed inset-0 z-40" onClick={() => setThemeMenu(false)}>
              <div
                ref={themeMenuRef}
                role="menu"
                aria-label="Select a theme"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setThemeMenu(false);
                  else menuArrowNav(e);
                }}
                className="vt-scale-in absolute right-0 top-[42px] min-w-[208px] overflow-hidden rounded-[10px] border border-line bg-surface p-1.5 shadow-[0_10px_40px_rgba(0,0,0,0.15)]"
              >
                {THEMES.map((t) => {
                  const active = t.value === theme;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={active}
                      onClick={() => {
                        onSetTheme(t.value);
                        setThemeMenu(false);
                      }}
                      className="vt-unbutton flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left hover:bg-rail"
                    >
                      <span className="inline-flex w-3.5 justify-center text-cyan-deep">
                        {active ? <CheckIcon size={13} /> : null}
                      </span>
                      <span className="flex-1">
                        <span className="block text-[0.78rem] font-semibold text-ink">{t.label}</span>
                        <span className="block text-[0.62rem] text-muted">{t.hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <button onClick={onSignOut} className={iconBtn} title="Sign out">
          <span aria-hidden="true">⇄</span> Sign out
        </button>
      </div>

      <span
        className="inline-flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-[0.62rem] font-bold tracking-[0.8px]"
        style={
          editing
            ? { background: 'var(--color-warn-bg)', color: 'var(--color-amber)', borderColor: 'var(--color-warn-border)' }
            : { background: 'var(--color-rail)', color: 'var(--color-muted)', borderColor: 'var(--color-line)' }
        }
      >
        {!canEdit ? 'VIEW ONLY · MARINE' : editing ? 'EDIT MODE' : 'VIEW ONLY'}
      </span>

      <button
        onClick={onFuelSetup}
        className={iconBtn}
        title="Consumption parameters — ship defaults & per-voyage overrides"
        disabled={!dirName}
      >
        <GaugeIcon size={13} /> Fuel Setup
      </button>
      <button
        onClick={onCalculate}
        className="inline-flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-navy px-3.5 py-2 text-[0.75rem] font-semibold text-white hover:brightness-110 disabled:opacity-40"
        title={hasVoyage ? 'Calculate fuel consumption for this voyage' : 'Select a voyage first'}
        disabled={!hasVoyage}
      >
        <BoltIcon size={13} /> Consumption
      </button>

      {canImport && (
        <button onClick={onImportExcel} className={iconBtn} title="Import an Excel (.xlsx) template as a new file in the folder">
          <FileIcon size={13} /> Import
        </button>
      )}
      <button
        onClick={onSaveJson}
        className={iconBtn}
        title={fileName ? `Save ${fileName} to the folder now` : 'Nothing to save'}
        disabled={!fileName}
      >
        <SaveIcon size={13} /> Save
      </button>

      <div className="relative">
        <button onClick={onToggleExportMenu} className={iconBtn} aria-haspopup="menu" aria-expanded={exportMenu} disabled={!fileName}>
          <DownloadIcon size={13} /> Export <span className="text-[0.6rem] opacity-45">{exportMenu ? '▴' : '▾'}</span>
        </button>
        {exportMenu && (
          <div className="fixed inset-0 z-40" onClick={onCloseExportMenu}>
            <div
              ref={menuRef}
              role="menu"
              aria-label="Export to Excel"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Escape') onCloseExportMenu();
                else menuArrowNav(e);
              }}
              className="vt-scale-in absolute right-4 top-[58px] min-w-[218px] overflow-hidden rounded-[10px] border border-line bg-surface p-1.5 shadow-[0_10px_40px_rgba(0,0,0,0.15)]"
            >
              <div className="px-2 pb-1 pt-1.5 text-[0.5rem] font-bold uppercase tracking-[1.2px] text-faint">
                Excel · template format
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={() => onExportXlsx('current')}
                className="vt-unbutton flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-[0.78rem] text-ink hover:bg-rail"
              >
                <span className="inline-flex text-cyan-deep">
                  <FileIcon size={14} />
                </span>
                This voyage
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => onExportXlsx('all')}
                className="vt-unbutton flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-[0.78rem] text-ink hover:bg-rail"
              >
                <span className="inline-flex text-green">
                  <GridIcon size={14} />
                </span>
                All voyages in file
                <span className="ml-auto font-mono text-[0.6rem] text-faint">{voyageTotal}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {canEdit && dirName && (
        <button
          onClick={onToggleLock}
          className="inline-flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-[0.75rem] font-semibold text-white hover:brightness-95"
          style={{ background: editing ? 'var(--color-btn-strong)' : 'var(--color-amber-btn)' }}
        >
          <span className="inline-flex">{editing ? <LockIcon size={13} /> : <EditIcon size={13} />}</span>
          {editing ? 'Lock Voyage' : 'Enable Edit'}
        </button>
      )}
    </header>
  );
}
