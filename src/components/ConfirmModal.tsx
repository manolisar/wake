// Styled confirmation dialog for destructive actions (replaces window.confirm
// so delete flows match the app's other modals: trap, Escape, focus restore).
import { useRef } from 'react';
import { useModalDialog } from '../hooks/useModalDialog';
import { TrashIcon } from './Icons';

interface Props {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({ title, body, confirmLabel, onConfirm, onCancel }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalDialog(dialogRef, onCancel);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(10,25,41,0.45)] backdrop-blur-[4px]"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="vst-confirm-title"
        aria-describedby="vst-confirm-body"
        style={{ overscrollBehavior: 'contain' }}
        className="vt-scale-in w-[420px] max-w-[92vw] overflow-hidden rounded-2xl bg-surface shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-5 py-4">
          <span
            className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[9px] border"
            style={{
              borderColor: 'color-mix(in srgb, var(--color-spd-hi-fg) 35%, transparent)',
              background: 'color-mix(in srgb, var(--color-spd-hi-fg) 10%, var(--color-surface))',
              color: 'var(--color-spd-hi-fg)',
            }}
          >
            <TrashIcon size={14} />
          </span>
          <h2 id="vst-confirm-title" className="text-[0.9rem] font-extrabold">
            {title}
          </h2>
        </div>
        <div id="vst-confirm-body" className="px-5 py-[1.1rem] text-[0.78rem] leading-relaxed text-muted">
          {body}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-3.5">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-line bg-surface px-3.5 py-2 text-[0.78rem] font-semibold text-ink hover:bg-rail"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg px-4 py-2 text-[0.78rem] font-semibold text-white hover:brightness-95"
            style={{ background: 'var(--color-spd-hi-fg)' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
