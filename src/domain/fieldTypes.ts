// Single source of truth for every editable grid cell: its edit type, COLUMN
// width, alignment, input attributes, and blur-normaliser. The colgroup widths
// (LegsTable), the input rendering (LegRow), and the on-blur normalisation all
// read from here, so a column is re-sized or re-typed from one place.
//
// Why this exists: the frozen-column seam (TIME↔SPEED) came from sticky offsets
// measured at runtime going stale when computed cell widths changed mid-edit.
// With deterministic widths here + a <colgroup>, the offsets are constant.
import type { Leg } from '../types';

export type EditType =
  | 'location' // long free text, gets reclaimed slack
  | 'note' // long free text (remarks)
  | 'date' // ISO YYYY-MM-DD
  | 'clock' // wall-clock hh:mm, 00:00–23:59
  | 'duration' // elapsed HH:mm, may exceed 24h
  | 'distance' // non-negative nm
  | 'speed' // decimal knots
  | 'offset'; // signed integer hours (UTC)

export interface FieldSpec {
  type: EditType;
  width: number; // COLUMN width in px (the input fills it via w-full)
  align: 'left' | 'right' | 'center';
  mono?: boolean;
  inputMode?: 'decimal' | 'numeric' | 'text';
  maxLength?: number;
  placeholder?: string;
  color?: string; // preserve existing per-field colours
  weight?: number;
  normalize?: (raw: string) => string; // applied on blur
}

// ── normalisers ───────────────────────────────────────────────────────────
const trim = (s: string) => s.trim();

// "830"->"08:30", "8:5"->"08:05", "1830"->"18:30"; leaves malformed input
// untouched so the invalid-affordance can flag it instead of silently eating it.
export function normClock(raw: string, allowOver24 = false): string {
  const t = raw.trim();
  if (t === '') return '';
  let h: number, m: number;
  if (t.includes(':')) {
    const [hh, mm = '0'] = t.split(':');
    h = Number(hh);
    m = Number(mm || 0);
  } else {
    const d = t.replace(/\D/g, '');
    if (d.length <= 2) {
      h = Number(d);
      m = 0;
    } else {
      m = Number(d.slice(-2));
      h = Number(d.slice(0, -2));
    }
  }
  if (!Number.isFinite(h) || !Number.isFinite(m) || m > 59) return t;
  if (!allowOver24 && h > 23) return t;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
export const normDuration = (s: string) => normClock(s, true);

const normNum = (s: string) => {
  // trim, parse; keep the raw string if it isn't a finite number so the
  // invalid affordance can flag it rather than blanking the operator's input.
  const t = s.trim();
  if (t === '') return '';
  const n = Number(t);
  return Number.isFinite(n) ? String(n) : t;
};
const normOffset = (s: string) => {
  // "+5"/"5"->"5", "-5"->"-5"; non-integers pass through unchanged (flagged).
  const t = s.trim().replace(/^\+/, '');
  return t;
};

// ── spec map (every editable field; computed columns handled separately) ───
export const FIELD_SPEC: Record<string, FieldSpec> = {
  date: { type: 'date', width: 92, align: 'left', mono: true, maxLength: 10, placeholder: 'YYYY-MM-DD', normalize: trim },
  port: { type: 'location', width: 190, align: 'left', weight: 600, normalize: trim },
  dist: { type: 'distance', width: 56, align: 'right', mono: true, inputMode: 'decimal', normalize: normNum },
  speed: { type: 'speed', width: 60, align: 'right', mono: true, inputMode: 'decimal', normalize: normNum },
  eta: { type: 'clock', width: 50, align: 'center', mono: true, inputMode: 'numeric', maxLength: 5, placeholder: 'hh:mm', normalize: normClock },
  arr: { type: 'clock', width: 50, align: 'center', mono: true, inputMode: 'numeric', maxLength: 5, placeholder: 'hh:mm', normalize: normClock },
  dep: { type: 'clock', width: 50, align: 'center', mono: true, inputMode: 'numeric', maxLength: 5, placeholder: 'hh:mm', normalize: normClock },
  faw: { type: 'clock', width: 50, align: 'center', mono: true, inputMode: 'numeric', maxLength: 5, placeholder: 'hh:mm', normalize: normClock },
  sunrise: { type: 'clock', width: 52, align: 'center', mono: true, inputMode: 'numeric', maxLength: 5, placeholder: 'hh:mm', color: 'var(--color-muted)', normalize: normClock },
  sunset: { type: 'clock', width: 52, align: 'center', mono: true, inputMode: 'numeric', maxLength: 5, placeholder: 'hh:mm', color: 'var(--color-muted)', normalize: normClock },
  stbyArrDist: { type: 'distance', width: 58, align: 'center', mono: true, inputMode: 'decimal', normalize: normNum },
  stbyDepDist: { type: 'distance', width: 58, align: 'center', mono: true, inputMode: 'decimal', normalize: normNum },
  utc: { type: 'offset', width: 44, align: 'center', mono: true, inputMode: 'numeric', placeholder: '±0', color: '#0891b2', weight: 700, normalize: normOffset },
  openLoop: { type: 'duration', width: 56, align: 'center', mono: true, inputMode: 'numeric', placeholder: 'HH:mm', color: '#0284C7', normalize: normDuration },
  seaCond: { type: 'duration', width: 56, align: 'center', mono: true, inputMode: 'numeric', placeholder: 'HH:mm', color: '#6366F1', normalize: normDuration },
  remarks: { type: 'note', width: 200, align: 'left', color: 'var(--color-muted)', normalize: trim },
};

// ── Column geometry ─────────────────────────────────────────────────────────
// One ordered width per visible column (26 total). Editable columns read their
// width from FIELD_SPEC so the spec stays the single source; computed/control
// columns carry an explicit literal. Order MUST match COLUMNS in LegsTable and
// the FIELD_COL map in LegRow.
export const COL_W: number[] = [
  64, //  0 Type    (control — fit "TENDER")
  FIELD_SPEC.date.width, //  1 Date
  FIELD_SPEC.port.width, //  2 Location
  FIELD_SPEC.dist.width, //  3 Dist
  92, //  4 Mode    (control — SPD|TIME toggle)
  60, //  5 Time    (computed "127:00")
  60, //  6 Speed   (computed badge / input)
  FIELD_SPEC.eta.width, //  7 ETA
  FIELD_SPEC.arr.width, //  8 Arr
  FIELD_SPEC.dep.width, //  9 Dep
  FIELD_SPEC.faw.width, // 10 FAW
  FIELD_SPEC.stbyArrDist.width, // 11 S/B Arr Dist
  58, // 12 S/B Arr Time (computed)
  58, // 13 S/B Arr Spd  (computed)
  FIELD_SPEC.stbyDepDist.width, // 14 S/B Dep Dist
  58, // 15 S/B Dep Time (computed)
  58, // 16 S/B Dep Spd  (computed)
  54, // 17 Port hrs (computed)
  // Sunrise/Daylight carry the widest single-word headers — floor the column
  // so the label fits without clipping at the 0.6rem header size.
  Math.max(FIELD_SPEC.sunrise.width, 70), // 18 Sunrise
  FIELD_SPEC.sunset.width, // 19 Sunset
  70, // 20 Daylight (computed)
  FIELD_SPEC.utc.width, // 21 UTC ±
  FIELD_SPEC.openLoop.width, // 22 Open Loop
  FIELD_SPEC.seaCond.width, // 23 Sea Cond
  FIELD_SPEC.remarks.width, // 24 Remarks
  96, // 25 Actions (control — 4 icon buttons)
];

// Number of left-frozen columns (Type … Speed).
export const FROZEN = 7;

// Constant cumulative left offset for each frozen column — replaces the old
// runtime measurement that went stale mid-edit. Derived once from COL_W.
export const FROZEN_LEFTS: number[] = (() => {
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < FROZEN; i++) {
    out.push(acc);
    acc += COL_W[i];
  }
  return out;
})();

// Sum of all column widths — the table's natural (and minimum) width.
export const TABLE_MIN_W: number = COL_W.reduce((a, b) => a + b, 0);

// Table-column index of each editable field, exposed as `data-col` so the grid
// keyboard handler can move within a column and so multi-cell paste can map a
// clipboard grid onto fields. Kept here (next to COL_W) so the two stay aligned.
export const FIELD_COL: Partial<Record<keyof Leg, number>> = {
  date: 1,
  port: 2,
  dist: 3,
  speed: 6,
  eta: 7,
  arr: 8,
  dep: 9,
  faw: 10,
  stbyArrDist: 11,
  stbyDepDist: 14,
  sunrise: 18,
  sunset: 19,
  utc: 21,
  openLoop: 22,
  seaCond: 23,
  remarks: 24,
};

// Reverse of FIELD_COL: table-column index → editable field. Used by multi-cell
// paste to find which field a pasted column targets.
export const COL_FIELD: Record<number, keyof Leg> = Object.fromEntries(
  Object.entries(FIELD_COL).map(([field, col]) => [col, field as keyof Leg]),
) as Record<number, keyof Leg>;

// True when a normaliser left a non-empty value unchanged AND it doesn't parse —
// drives the subtle invalid-input affordance. Empty is always valid.
export function isInvalid(field: keyof Leg, value: string): boolean {
  const spec = FIELD_SPEC[field];
  if (!spec || value.trim() === '') return false;
  switch (spec.type) {
    case 'clock':
      return normClock(value) === value.trim() && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(value.trim());
    case 'duration':
      return normDuration(value) === value.trim() && !/^\d+:[0-5]\d$/.test(value.trim());
    case 'distance':
    case 'speed':
      return !Number.isFinite(Number(value.trim()));
    case 'offset':
      return !/^-?\d+$/.test(value.trim());
    default:
      return false;
  }
}
