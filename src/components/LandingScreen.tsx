// Identify step — enter name, pick role. The app then asks for the folder that
// holds the .json files (FolderGate) and opens read-only; the daily password is
// requested only when editing. Name + role are stamped on every committed change.
import { useRef, useState, type FormEvent } from 'react';
import { APP_NAME, APP_VERSION } from '../appMeta';
import type { Role, Session } from '../types';
import { ROLES, roleCanEdit } from '../domain/roles';
import { CompassIcon } from './Icons';

export function LandingScreen({ initial, onDone }: { initial: Session | null; onDone: (s: Session) => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [role, setRole] = useState<Role>(initial?.role ?? 'navigation');
  const [touched, setTouched] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const ready = name.trim().length > 0;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!name.trim()) {
      nameRef.current?.focus();
      return;
    }
    onDone({ name: name.trim(), role });
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-navy p-4">
      <form
        onSubmit={submit}
        className="vt-scale-in w-[460px] max-w-[94vw] overflow-hidden rounded-2xl bg-surface shadow-[0_25px_50px_-12px_rgba(0,0,0,0.45)]"
      >
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-cyan text-white">
            <CompassIcon size={17} />
          </span>
          <div>
            <div className="text-[0.95rem] font-extrabold leading-tight tracking-tight">
              {APP_NAME} <span className="align-middle text-[0.62rem] font-semibold text-faint">v{APP_VERSION}</span>
            </div>
            <div className="font-mono text-[0.6rem] uppercase tracking-[1px] text-faint">
              Solstice-class fleet · sign in
            </div>
          </div>
        </div>

        <div className="px-5 py-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="vst-name" className="mb-1.5 block text-[0.6rem] font-bold uppercase tracking-[1.2px] text-faint">
                Name
              </label>
              <input
                id="vst-name"
                ref={nameRef}
                name="name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={touched && !name.trim()}
                placeholder="e.g. John Doe"
                className="min-h-11 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-cyan"
              />
              {touched && !name.trim() && (
                <div role="alert" className="mt-1.5 text-[0.66rem] font-semibold text-pink">
                  Enter your name.
                </div>
              )}
            </div>
            <div>
              <label htmlFor="vst-role" className="mb-1.5 block text-[0.6rem] font-bold uppercase tracking-[1.2px] text-faint">
                Role
              </label>
              <select
                id="vst-role"
                name="role"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="min-h-11 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-cyan"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                    {!roleCanEdit(r.value) ? ' (view only)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-3 text-[0.66rem] leading-relaxed text-muted">
            Your name + role are stamped on every change you commit (attribution). Marine is view-only; all other
            roles may edit. Next you&rsquo;ll choose the folder with your <span className="font-mono">.json</span> files;
            the app opens read-only and asks for today&rsquo;s access code only when you enable editing.
          </div>
        </div>

        <div className="flex justify-end border-t border-line px-5 py-3.5">
          <button
            type="submit"
            disabled={!ready}
            className="min-h-11 rounded-lg bg-cyan px-4 py-2 text-[0.8rem] font-semibold text-white hover:brightness-95 disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      </form>
    </div>
  );
}
