import { useEffect, useMemo, useRef, useState } from 'react';
import { APP_NAME } from './appMeta';
import type { Session } from './types';
import { useSession } from './hooks/useSession';
import { useTheme, type Theme } from './hooks/useTheme';
import { useWorkspace, type WorkspaceApi } from './hooks/useWorkspace';
import { computeVoyage } from './domain/calculations';
import { roleLabel } from './domain/roles';
import { isModeledPlant } from './domain/ships';
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
import { ConsumptionSettingsModal } from './components/ConsumptionSettingsModal';
import { ConsumptionReport } from './components/ConsumptionReport';
import { ErrorBoundary } from './components/ErrorBoundary';
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

  // Warm the lazy Excel chunks (~1.3 MB) once the app goes idle, so the first
  // Export/Import click doesn't stall on the download. Initial load stays lean.
  useEffect(() => {
    const warm = () => {
      void import('exceljs');
      void import('xlsx');
    };
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(warm, { timeout: 8000 });
    else window.setTimeout(warm, 4000);
  }, []);

  // Warn before the tab closes with edits still queued for the debounced
  // write-back — beforeunload only fires while a save is pending.
  const { pendingSave } = w;
  useEffect(() => {
    if (!pendingSave) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [pendingSave]);

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
        {APP_NAME} — {w.selectedFile || 'no file'}
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
        pendingSave={w.pendingSave}
        voyageTotal={total}
        exportMenu={w.exportMenu}
        hasVoyage={!!w.current}
        onFuelSetup={() => w.setShowFuelSetup(true)}
        onCalculate={w.calculateConsumption}
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
          aria-valuenow={sidebarW}
          aria-valuemin={240}
          aria-valuemax={640}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              e.preventDefault();
              setSidebarW((w) => Math.min(640, Math.max(240, w + (e.key === 'ArrowLeft' ? -16 : 16))));
            }
          }}
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
            // No fixed min width: header, tabs and summary cards wrap to the
            // viewport; the legs table scrolls inside its own container.
            <div className="flex flex-col gap-5 px-6 py-6">
              <CruiseCard voyage={w.current} fileName={w.selectedFile} editable={w.editable} onTitle={w.setTitle} onNumber={w.setNumber} />

              {/* Main tabs: the ports/times grid vs the voyage's fuel consumption.
                  Full ARIA tabs pattern: roving tabIndex + ArrowLeft/Right. */}
              <div
                role="tablist"
                aria-label="Voyage views"
                className="flex gap-1.5"
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                    e.preventDefault();
                    const next = !w.showReport;
                    w.setShowReport(next);
                    requestAnimationFrame(() =>
                      document.getElementById(next ? 'vst-tab-fuel' : 'vst-tab-grid')?.focus(),
                    );
                  }
                }}
              >
                <button
                  id="vst-tab-grid"
                  role="tab"
                  aria-selected={!w.showReport}
                  aria-controls="vst-panel-grid"
                  tabIndex={!w.showReport ? 0 : -1}
                  onClick={() => w.setShowReport(false)}
                  className={
                    'rounded-lg px-4 py-2 text-[0.78rem] font-bold ' +
                    (!w.showReport ? 'bg-navy text-white' : 'border border-line bg-surface text-muted hover:bg-rail')
                  }
                >
                  Ports &amp; Times
                </button>
                <button
                  id="vst-tab-fuel"
                  role="tab"
                  aria-selected={w.showReport}
                  aria-controls="vst-panel-fuel"
                  tabIndex={w.showReport ? 0 : -1}
                  onClick={() => w.setShowReport(true)}
                  className={
                    'rounded-lg px-4 py-2 text-[0.78rem] font-bold ' +
                    (w.showReport ? 'bg-navy text-white' : 'border border-line bg-surface text-muted hover:bg-rail')
                  }
                >
                  Fuel Consumption
                  {w.consumptionStale && (
                    <>
                      <span
                        aria-hidden="true"
                        className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle"
                        style={{ background: 'var(--color-amber-btn)' }}
                        title="Data changed since the last calculation"
                      />
                      <span className="sr-only">Data changed</span>
                    </>
                  )}
                </button>
              </div>

              {!w.showReport ? (
                <div id="vst-panel-grid" role="tabpanel" aria-labelledby="vst-tab-grid" className="flex flex-col gap-5">
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
                  <section className="vt-no-print grid grid-cols-[1.4fr_1fr] gap-4">
                    <VersionHistory versions={w.current.versions} />
                    <MathExplainer />
                  </section>
                </div>
              ) : (
                <div id="vst-panel-fuel" role="tabpanel" aria-labelledby="vst-tab-fuel">
                  {!isModeledPlant(w.shipCode) && (
                    <div
                      role="status"
                      className="flex items-center gap-2 border-b border-warn-border bg-warn-bg px-5 py-2.5"
                    >
                      <span aria-hidden="true" className="text-amber">⚠</span>
                      <span className="text-[0.72rem] font-semibold text-amber">
                        This ship runs a MAN plant — the consumption model (Wärtsilä 16V46) is not
                        validated for it. Figures are indicative only.
                      </span>
                    </div>
                  )}
                  <ConsumptionReport
                    voyage={w.current}
                    consumption={w.consumptionResult}
                    stale={w.consumptionStale}
                    transient={!!w.consumptionResult && w.current.consumption !== w.consumptionResult}
                    editable={w.editable}
                    onSetLegField={w.updateLeg}
                    onRecalculate={w.calculateConsumption}
                  />
                </div>
              )}
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
                  className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-cyan px-4 py-2 text-[0.8rem] font-semibold text-white shadow-[0_1px_2px_rgba(6,182,212,0.25)] transition-[filter] hover:brightness-105"
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
      {w.showFuelSetup && (
        <ConsumptionSettingsModal
          defaults={w.consumptionDefaults}
          overrides={w.current?.consumptionOverrides}
          canEditDefaults={w.canEdit && w.editAuthorized && !!w.selectedFile}
          canEditVoyage={w.editable}
          hasVoyage={!!w.current}
          onSaveDefaults={w.setConsumptionDefaults}
          onSaveOverrides={w.setVoyageOverrides}
          onClose={() => w.setShowFuelSetup(false)}
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
      <Toast message={w.toast.msg} kind={w.toast.kind} />
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
      <>
        <FolderGate
          userLabel={`${session.name} · ${roleLabel(session.role)}`}
          lastDirName={w.lastDirName}
          onChoose={w.openFolder}
          onReopen={w.reopenLast}
        />
        {/* Folder-open failures (denied permission, unreadable dir) flash here */}
        <Toast message={w.toast.msg} kind={w.toast.kind} />
      </>
    );
  }
  return <Workspace w={w} onSignOut={onSignOut} theme={theme} onSetTheme={onSetTheme} />;
}

export default function App() {
  const { session, setSession, signOut } = useSession();
  const { theme, setTheme } = useTheme();

  if (!session) return <LandingScreen initial={null} onDone={setSession} />;

  return (
    <ErrorBoundary>
      <SignedIn session={session} onSignOut={signOut} theme={theme} onSetTheme={setTheme} />
    </ErrorBoundary>
  );
}
