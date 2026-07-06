// Unlock-reason modal — the reason is recorded to the voyage's version history.
import { useRef } from 'react';
import { useModalDialog } from '../hooks/useModalDialog';
import { LockOpenIcon } from './Icons';

interface Props {
  loggedBy: string;
  note: string;
  onNote: (s: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function UnlockModal({ loggedBy, note, onNote, onConfirm, onCancel }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useModalDialog(dialogRef, onCancel);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(10,25,41,0.45)] backdrop-blur-[4px]"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="vst-unlock-title"
        style={{ overscrollBehavior: 'contain' }}
        className="vt-scale-in w-[440px] max-w-[92vw] overflow-hidden rounded-2xl bg-surface shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-5 py-4">
          <span className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[9px] border border-warn-border bg-warn-bg text-amber">
            <LockOpenIcon size={15} />
          </span>
          <div>
            <div id="vst-unlock-title" className="text-[0.9rem] font-extrabold">Unlock voyage for editing</div>
            <div className="text-[0.66rem] text-muted">Logged as {loggedBy}</div>
          </div>
        </div>
        <div className="px-5 py-[1.1rem]">
          <label htmlFor="vst-unlock-note" className="mb-1.5 block text-[0.55rem] font-bold uppercase tracking-[1.2px] text-faint">
            Reason · recorded to version history
          </label>
          <textarea
            id="vst-unlock-note"
            autoFocus
            value={note}
            onChange={(e) => onNote(e.target.value)}
            placeholder="e.g. Revised ETA Willemstad after weather routing"
            className="min-h-[70px] w-full resize-y rounded-lg border border-line px-2.5 py-2 text-[0.78rem] text-ink outline-none focus:border-cyan"
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-3.5">
          <button
            onClick={onCancel}
            className="rounded-lg border border-line bg-surface px-3.5 py-2 text-[0.78rem] font-semibold text-ink hover:bg-rail"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-amber-btn px-4 py-2 text-[0.78rem] font-semibold text-white hover:brightness-95"
          >
            Unlock &amp; Edit
          </button>
        </div>
      </div>
    </div>
  );
}
