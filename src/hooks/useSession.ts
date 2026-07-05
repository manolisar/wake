// Session = who is signed in (name + role). Persisted to localStorage so a known
// machine skips the identify step on relaunch. The app opens read-only; the
// daily password is a separate per-day gate, requested only when editing.
import { useCallback, useState } from 'react';
import type { Session } from '../types';
import { isRole } from '../domain/roles';

const KEY = 'vst_session';

function load(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (s && isRole(s.role) && typeof s.name === 'string' && s.name.trim()) {
      return { name: s.name, role: s.role };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function useSession() {
  const [session, setSessionState] = useState<Session | null>(load);

  const setSession = useCallback((s: Session) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* private mode — keep in memory */
    }
    setSessionState(s);
  }, []);

  const signOut = useCallback(() => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    setSessionState(null);
  }, []);

  return { session, setSession, signOut };
}
