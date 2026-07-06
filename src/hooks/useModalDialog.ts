// Shared modal-dialog behaviour: Escape to close, Tab trapped inside the
// dialog, initial focus moved in, and focus returned to the opener on close.
// Extracted from EditPasswordModal so every modal behaves identically.
import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = 'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])';

export function useModalDialog(dialogRef: RefObject<HTMLElement | null>, onClose: () => void): void {
  // The close callback may change identity per render (e.g. a dirty-guarded
  // close) — hold it in a ref so the effect mounts exactly once per dialog
  // and the focus save/restore doesn't fire on re-renders.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    // Move focus into the dialog unless something inside (e.g. an autoFocus
    // input) already claimed it during mount.
    const dialog = dialogRef.current;
    if (dialog && !dialog.contains(document.activeElement)) {
      dialog.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const f = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
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
    // dialogRef is a stable ref object — this runs once per dialog mount.
  }, [dialogRef]);
}
