import { AlertIcon, CheckIcon } from './Icons';

export type ToastKind = 'success' | 'error';

// The live region stays mounted permanently — a conditionally-mounted
// aria-live element is often not announced by screen readers. Content (and
// visibility) toggle inside it; errors are assertive and styled distinctly.
export function Toast({ message, kind = 'success' }: { message: string; kind?: ToastKind }) {
  const error = kind === 'error';
  return (
    <div
      role={error ? 'alert' : 'status'}
      aria-live={error ? 'assertive' : 'polite'}
      className="vt-no-print pointer-events-none fixed bottom-[22px] left-1/2 z-[60] -translate-x-1/2"
    >
      {message && (
        <div
          key={message}
          className="vt-slide-up flex items-center gap-2 rounded-[10px] px-[1.1rem] py-2.5 text-[0.78rem] font-semibold text-white shadow-[0_10px_40px_rgba(0,0,0,0.15)]"
          style={{ background: error ? 'var(--color-spd-hi-fg)' : 'var(--color-navy)' }}
        >
          <span className="inline-flex" style={{ color: error ? '#FDE68A' : '#6EE7B7' }}>
            {error ? <AlertIcon size={15} /> : <CheckIcon size={15} />}
          </span>
          {message}
        </div>
      )}
    </div>
  );
}
