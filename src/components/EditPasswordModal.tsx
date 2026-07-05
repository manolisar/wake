// Edit-authorisation gate. The app opens in VIEW mode; an allowed user requests
// editing and is prompted here for today's daily password ("bridge" + local date
// — see domain/password.ts). On success the session is marked edit-authorised
// (sessionStorage, keyed by today's date) so it is asked at most once per day.
// This is a convenience gate, not real security (shared keyword, public date).
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { checkPassword } from '../domain/password';
import { LockIcon } from './Icons';

interface Props {
  loggedBy: string;
  onConfirm: () => void; // password verified — caller enables editing
  onCancel: () => void;
}

export function EditPasswordModal({ loggedBy, onConfirm, onCancel }: Props) {
  const dialogRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);

  // Escape to close, Tab trapped within the dialog, focus returned on close.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const f = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
      );
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onCancel]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (checkPassword(value)) {
      onConfirm();
    } else {
      setError(true);
      inputRef.current?.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(10,25,41,0.45)] backdrop-blur-[4px]"
      onClick={onCancel}
    >
      <form
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="vst-edit-title"
        style={{ overscrollBehavior: 'contain' }}
        className="vt-scale-in w-[420px] max-w-[92vw] overflow-hidden rounded-2xl bg-surface shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)]"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-5 py-4">
          <span className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[9px] border border-[#FDE68A] bg-[#FFFBEB] text-amber">
            <LockIcon size={15} />
          </span>
          <div>
            <div id="vst-edit-title" className="text-[0.9rem] font-extrabold">Enable editing</div>
            <div className="text-[0.66rem] text-muted">Logged as {loggedBy}</div>
          </div>
        </div>
        <div className="px-5 py-[1.1rem]">
          <label htmlFor="vst-edit-code" className="mb-1.5 block text-[0.55rem] font-bold uppercase tracking-[1.2px] text-faint">
            Daily access code
          </label>
          <input
            id="vst-edit-code"
            ref={inputRef}
            type="password"
            name="access-code"
            autoComplete="off"
            spellCheck={false}
            autoFocus
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(false);
            }}
            aria-invalid={error}
            aria-describedby={error ? 'vst-edit-error' : undefined}
            placeholder="Enter today's password…"
            className="w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-ink outline-none focus:border-cyan"
          />
          {error && (
            <div
              id="vst-edit-error"
              role="alert"
              className="mt-2 text-[0.72rem] font-semibold text-[color:var(--color-spd-hi-fg)]"
            >
              Incorrect password for today. The code changes daily.
            </div>
          )}
          <div className="mt-3 text-[0.66rem] leading-relaxed text-muted">
            The app opens read-only. Editing needs today&rsquo;s code (the shared keyword followed by
            today&rsquo;s date). You&rsquo;ll be asked once per day on this machine.
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
            className="rounded-lg bg-amber-btn px-4 py-2 text-[0.78rem] font-semibold text-white hover:brightness-95"
          >
            Enable Edit
          </button>
        </div>
      </form>
    </div>
  );
}
