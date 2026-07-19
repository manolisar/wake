// Folder prompt — shown after sign-in, before the workspace. The chosen folder
// is the live record: every .json in it is read in, and edits write back there.
// Chromium/Edge only (directory picker); other browsers get a clear message.
import { supportsFolders } from '../storage/workspace';
import { FolderIcon } from './Icons';

export function FolderGate({
  userLabel,
  lastDirName,
  onChoose,
  onReopen,
}: {
  userLabel: string;
  lastDirName: string;
  onChoose: () => void;
  onReopen: () => void;
}) {
  const ok = supportsFolders();
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-navy p-4">
      <div className="vt-scale-in w-[460px] max-w-[94vw] overflow-hidden rounded-2xl bg-surface shadow-[0_25px_50px_-12px_rgba(0,0,0,0.45)]">
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-cyan text-white">
            <FolderIcon size={16} />
          </span>
          <div>
            <h1 className="text-[0.95rem] font-extrabold leading-tight tracking-tight">Choose your templates folder</h1>
            <div className="font-mono text-[0.6rem] uppercase tracking-[1px] text-faint">{userLabel}</div>
          </div>
        </div>
        <div className="px-5 py-5">
          <p className="text-[0.78rem] leading-relaxed text-muted">
            Pick the folder that holds your Wake template <span className="font-mono">.json</span> files. Every file is
            opened into a tree of voyages. Edits and pasted voyages are written straight back into the folder — it is the
            live record.
          </p>
          {!ok && (
            <div role="alert" className="mt-3 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-[0.72rem] text-[#92400E]">
              This browser can&rsquo;t open folders. Use Google Chrome or Microsoft Edge on the workstation.
            </div>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3.5">
          {lastDirName && (
            <button
              type="button"
              onClick={onReopen}
              disabled={!ok}
              title={`Reopen ${lastDirName}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-cyan px-4 py-2 text-[0.8rem] font-semibold text-white hover:brightness-95 disabled:opacity-50"
            >
              <FolderIcon size={14} /> Reopen{' '}
              <span className="max-w-[150px] truncate font-mono text-[0.72rem] opacity-90">{lastDirName}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onChoose}
            disabled={!ok}
            className={
              lastDirName
                ? 'inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-[0.8rem] font-semibold text-ink hover:bg-rail disabled:opacity-50'
                : 'inline-flex min-h-11 items-center gap-2 rounded-lg bg-cyan px-4 py-2 text-[0.8rem] font-semibold text-white hover:brightness-95 disabled:opacity-50'
            }
          >
            <FolderIcon size={14} /> {lastDirName ? 'Choose another folder…' : 'Choose folder…'}
          </button>
        </div>
      </div>
    </div>
  );
}
