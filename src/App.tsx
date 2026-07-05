import { useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from './types';
import { useSession } from './hooks/useSession';
import { useTheme, type Theme } from './hooks/useTheme';
import { useWorkspace, type WorkspaceApi } from './hooks/useWorkspace';
import { computeVoyage } from './domain/calculations';
import { roleLabel } from './domain/roles';
import { LandingScreen } from './components/LandingScreen';
import { FolderGate } from './components/FolderGate';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { CruiseCard } from './components/CruiseCard';
import { SummaryCards } from './components/SummaryCards';
import { LegsTable } from './components/LegsTable';
import { VersionHistory } from './components/VersionHistory';
import { MathExplainer } from './components/MathExplainer';
import { UnlockModal } from './components/UnlockModal';
import { EditPasswordModal } from './components/EditPasswordModal';
import { PasteVoyageModal } from './components/PasteVoyageModal';
import { Toast } from './components/Toast';

function Workspace({
  w,
  onSignOut,
  theme,
  onSetTheme,
}: {
  w: WorkspaceApi;
  onSignOut: () => void;
  theme: Theme;
  onSetTheme: (t: Theme) => void;
}) {
  // Memoise on the voyage object identity. mutate() replaces only the edited
  // voyage with a fresh object, so `current` is a new reference exactly when the
  // voyage data changes — unrelated re-renders (sidebar drag, theme) reuse the
  // last computation instead of re-solving every leg.
  const current = w.current;
  const { legViews, summary } = useMemo(() => computeVoyage(current), [current]);
  const total = w.currentFile ? Object.keys(w.currentFile.voyages).length : 0;

  // Undo / redo (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z) on the current voyage. Ignored
  // while typing isn't the point — the per-voyage history is keystroke-grained —
  // so we let the browser's native field undo win only inside a focused input.
  const { undo, redo, editable } = w;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!editable || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return; // let native field undo handle it
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editable, undo, redo]);

  // Resizable sidebar (drag the divider). Width persists across sessions.
  const [sidebarW, setSidebarW] = useState<number>(() => {
    const v = Number(localStorage.getItem('vst_sidebar_w'));
    return v >= 240 && v <= 640 ? v : 320;
  });
  const dragging = useRef(false);
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      setSidebarW(Math.min(640, Math.max(240, e.clientX)));
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('vst_sidebar_w', String(sidebarW));
    } catch {
      /* ignore */
    }
  }, [sidebarW]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <h1 className="sr-only">
        Speed Planner SL — {w.selectedFile || 'no file'}
        {w.current ? `, ${w.current.title}` : ''}
      </h1>
      <Header
        dirName={w.dirName}
        fileName={w.selectedFile}
        shipId={w.shipCode}
        userLabel={w.loggedBy}
        canEdit={w.canEdit}
        canImport={w.canEdit && w.editAuthorized}
        editing={w.editable}
        voyageTotal={total}
        exportMenu={w.exportMenu}
        onImportExcel={w.doImportExcel}
        onToggleExportMenu={() => w.setExportMenu(!w.exportMenu)}
        onCloseExportMenu={() => w.setExportMenu(false)}
        onExportXlsx={w.doExportExcel}
        onSaveJson={w.doSaveJson}
        onOpenFolder={w.openFolder}
        onToggleLock={w.toggleLock}
        onSignOut={onSignOut}
        theme={theme}
        onSetTheme={onSetTheme}
      />

      <div className="flex min-h-0 flex-1">
        <div style={{ width: sidebarW }} className="flex min-h-0 flex-shrink-0 overflow-hidden">
          <Sidebar
            files={w.files}
            selectedFile={w.selectedFile}
            selectedId={w.selectedId}
            search={w.search}
            expanded={w.expanded}
            canEdit={w.canEdit}
            canMutate={w.canEdit && w.editAuthorized}
            clipboardCount={w.clipboardCount}
            onSearch={w.setSearch}
            onSelect={w.selectVoyage}
            onToggleFile={w.toggleFile}
            onExpandAll={w.expandAll}
            onCollapseAll={w.collapseAll}
            onAddTemplate={w.createVoyage}
            onNewFile={w.createFile}
            onCopyVoyage={w.copyVoyage}
            onRequestPaste={w.requestPaste}
            onDeleteVoyage={w.deleteVoyage}
          />
        </div>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          onPointerDown={(e) => {
            dragging.current = true;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
          }}
          className="w-[5px] flex-shrink-0 cursor-col-resize border-l border-line bg-surface transition-colors hover:border-cyan hover:bg-[color-mix(in_srgb,var(--color-cyan)_18%,transparent)]"
        />

        <main id="main-content" tabIndex={-1} className="vt-scroll min-w-0 flex-1 overflow-auto bg-bg outline-none">
          {w.current ? (
            <div className="flex min-w-[1180px] flex-col gap-5 px-6 py-6">
              <CruiseCard voyage={w.current} fileName={w.selectedFile} editable={w.editable} onTitle={w.setTitle} onNumber={w.setNumber} />
              <SummaryCards summary={summary} />
              <LegsTable
                voyage={w.current}
                legViews={legViews}
                readonly={!w.editable}
                onField={w.updateLeg}
                onMode={w.setMode}
                onToggleType={w.toggleType}
                onUp={(i) => w.moveLeg(i, -1)}
                onDown={(i) => w.moveLeg(i, 1)}
                onInsert={w.insertLeg}
                onDelete={w.deleteLeg}
                onAdd={w.addLeg}
                onFill={w.fillDown}
              />
              <section className="grid grid-cols-[1.4fr_1fr] gap-4">
                <VersionHistory versions={w.current.versions} />
                <MathExplainer />
              </section>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <div className="text-base font-bold text-ink">
                {w.files.length === 0 ? 'No files in this folder yet' : 'Select a cruise'}
              </div>
              <div className="max-w-md text-[0.8rem] leading-relaxed text-muted">
                {w.files.length === 0
                  ? w.canEdit
                    ? 'Create the first .json template here, or pick a different folder from the header.'
                    : 'This folder has no .json templates. Ask an editor to add one, or choose another folder from the header.'
                  : 'Pick a cruise from the tree on the left, or use Add Template to start one.'}
              </div>
              {w.files.length === 0 && w.canEdit && (
                <button
                  onClick={() => (w.editAuthorized ? w.createFile() : w.toggleLock())}
                  className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-cyan px-4 py-2 text-[0.8rem] font-semibold text-white shadow-[0_1px_2px_rgba(6,182,212,0.25)] transition hover:brightness-105"
                >
                  New .json file
                </button>
              )}
            </div>
          )}
        </main>
      </div>

      {w.showPassword && (
        <EditPasswordModal loggedBy={w.loggedBy} onConfirm={w.confirmPassword} onCancel={w.cancelPassword} />
      )}
      {w.showUnlock && (
        <UnlockModal
          loggedBy={w.loggedBy}
          note={w.unlockNote}
          onNote={w.setUnlockNote}
          onConfirm={w.confirmUnlock}
          onCancel={w.cancelUnlock}
        />
      )}
      {w.pasteState && (
        <PasteVoyageModal
          targetFile={w.pasteState.targetFile}
          name={w.pasteState.name}
          startDate={w.pasteState.startDate}
          onName={w.setPasteName}
          onDate={w.setPasteDate}
          onConfirm={w.confirmPaste}
          onCancel={w.cancelPaste}
        />
      )}
      <Toast message={w.toast} />
    </div>
  );
}

// After sign-in: hold the folder-backed workspace; show the folder picker until
// a folder is chosen, then the workspace.
function SignedIn({
  session,
  onSignOut,
  theme,
  onSetTheme,
}: {
  session: Session;
  onSignOut: () => void;
  theme: Theme;
  onSetTheme: (t: Theme) => void;
}) {
  const w = useWorkspace(session);
  if (!w.dirName) {
    return (
      <FolderGate
        userLabel={`${session.name} · ${roleLabel(session.role)}`}
        lastDirName={w.lastDirName}
        onChoose={w.openFolder}
        onReopen={w.reopenLast}
      />
    );
  }
  return <Workspace w={w} onSignOut={onSignOut} theme={theme} onSetTheme={onSetTheme} />;
}

export default function App() {
  const { session, setSession, signOut } = useSession();
  const { theme, setTheme } = useTheme();

  if (!session) return <LandingScreen initial={null} onDone={setSession} />;

  return <SignedIn session={session} onSignOut={signOut} theme={theme} onSetTheme={setTheme} />;
}
