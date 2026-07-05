// Time / date helpers — ported verbatim from the design artifact's DCLogic
// methods so the computed numbers match 1:1. All arithmetic is in integer
// minutes; "instants" are absolute UTC minutes since the epoch day.
import type { Leg } from '../types';

/** Whole-day number (days since epoch) for an ISO date, or null. */
export function dayNum(iso: string): number | null {
  if (!iso) return null;
  const t = Date.parse(iso + 'T00:00:00Z');
  if (isNaN(t)) return null;
  return Math.round(t / 86400000);
}

/** 'HH:MM' → minutes-of-day, or null if blank/malformed. */
export function hhmmToMin(s: string | null | undefined): number | null {
  if (s === '' || s == null) return null;
  const m = String(s).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return +m[1] * 60 + +m[2];
}

/** minutes → 'HH:MM', wrapped into a single day (mod 1440). */
export function minToHHMM(m: number): string {
  m = (((Math.round(m) % 1440) + 1440) % 1440);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

/** minutes → 'H:MM' elapsed duration (may exceed 24h), or '—'. */
export function fmtHM(mins: number | null | undefined): string {
  if (mins == null || isNaN(mins)) return '—';
  mins = Math.round(mins);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h + ':' + String(m).padStart(2, '0');
}

/** Absolute UTC instant (minutes) for a leg's local time, applying its UTC offset. */
export function instUTC(leg: Leg, timeMin: number | null): number | null {
  const d = dayNum(leg.date);
  if (d == null || timeMin == null || leg.utc === '' || leg.utc == null || isNaN(Number(leg.utc))) {
    return null;
  }
  return d * 1440 + timeMin - Number(leg.utc) * 60;
}

/** ISO date → 'dd Mon yyyy' (en-GB, UTC) for display. */
export function fmtDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00Z');
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
