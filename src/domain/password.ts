// Daily access gate.
//
// The valid password is the steady keyword "bridge" followed by today's date
// in YYYY-MM-DD, read from the LOCAL machine clock — so it rolls over at the
// operator's local midnight (e.g. on 2026-06-25 → "bridge2026-06-25").
//
// This is a low-friction shared gate to keep a passerby out of an unattended
// PC, NOT cryptographic security: anyone who knows the keyword can derive the
// day's password. It mirrors the v8 stance that the real access control is the
// machine/share, not an in-app secret. No secret is ever stored; the check is
// a plain client-side string compare.

const KEYWORD = 'bridge';

/** Local date as YYYY-MM-DD (not UTC — matches the operator's wall clock). */
export function localDateKey(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/** The password that unlocks the app today (or for a given date). */
export function expectedPassword(d: Date = new Date()): string {
  return KEYWORD + localDateKey(d);
}

/** Constant-ish compare (trim only — this is a convenience gate, not a vault). */
export function checkPassword(input: string, d: Date = new Date()): boolean {
  return input.trim() === expectedPassword(d);
}
