// Paste-voyage dialog — edit the new voyage's name and start date before it is
// cloned into the target file. Changing the start date shifts every dated leg by
// the same offset (times are kept).
import { useRef, type FormEvent } from 'react';
import { useModalDialog } from '../hooks/useModalDialog';
import { PasteIcon } from './Icons';

interface Props {
  targetFile: string;
  name: string;
  startDate: string;
  onName: (s: string) => void;
  onDate: (s: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PasteVoyageModal({ targetFile, name, startDate, onName, onDate, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLFormElement>(null);

  useModalDialog(ref, onCancel);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onConfirm();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(10,25,41,0.45)] backdrop-blur-[4px]"
      onClick={onCancel}
    >
      <form
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="vst-paste-title"
        style={{ overscrollBehavior: 'contain' }}
        className="vt-scale-in w-[440px] max-w-[92vw] overflow-hidden rounded-2xl bg-surface shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)]"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-5 py-4">
          <span className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[9px] border border-cyan/40 bg-[rgba(6,182,212,0.1)] text-cyan-deep">
            <PasteIcon size={15} />
          </span>
          <div>
            <div id="vst-paste-title" className="text-[0.9rem] font-extrabold">Paste voyage</div>
            <div className="text-[0.66rem] text-muted">
              into <span className="font-mono">{targetFile}</span>
            </div>
          </div>
        </div>
        <div className="px-5 py-[1.1rem]">
          <label htmlFor="vst-paste-name" className="mb-1.5 block text-[0.6rem] font-bold uppercase tracking-[1.2px] text-faint">
            Voyage name
          </label>
          <input
            id="vst-paste-name"
            autoFocus
            value={name}
            onChange={(e) => onName(e.target.value)}
            spellCheck={false}
            className="mb-3 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-cyan"
          />
          <label htmlFor="vst-paste-date" className="mb-1.5 block text-[0.6rem] font-bold uppercase tracking-[1.2px] text-faint">
            Start date
          </label>
          <input
            id="vst-paste-date"
            type="date"
            value={startDate}
            onChange={(e) => onDate(e.target.value)}
            className="w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono text-sm text-ink outline-none focus:border-cyan"
          />
          <div className="mt-2 text-[0.64rem] leading-relaxed text-muted">
            Changing the start date shifts every dated leg by the same number of days; times are kept.
          </div>
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
            type="submit"
            className="rounded-lg bg-cyan px-4 py-2 text-[0.78rem] font-semibold text-white hover:brightness-95"
          >
            Paste
          </button>
        </div>
      </form>
    </div>
  );
}
