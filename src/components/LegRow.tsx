// One leg row in the table. Reads raw values from the Leg and computed
// display values from its LegView. Field/column set ported from the design.
import { memo, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type CSSProperties, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import type { Leg, LegType } from '../types';
import type { LegView, SpeedBand } from '../domain/calculations';
import { FIELD_COL, FIELD_SPEC, FROZEN, isInvalid } from '../domain/fieldTypes';

const TYPE_CHIP: Record<LegType, { label: string; bg: string; fg: string; bd: string; row: string; solid: string }> = {
  Port: { label: 'PORT', bg: '#EFF6FF', fg: '#2563EB', bd: '#BFDBFE', row: 'var(--color-surface)', solid: 'var(--color-surface)' },
  Sea: { label: 'SEA', bg: '#ECFEFF', fg: '#0891b2', bd: '#A5F3FC', row: 'rgba(2,132,199,0.05)', solid: 'color-mix(in srgb, #0284C7 5%, var(--color-surface))' },
  Tender: { label: 'TENDER', bg: '#FFF7ED', fg: '#EA580C', bd: '#FED7AA', row: 'rgba(234,88,12,0.06)', solid: 'color-mix(in srgb, #EA580C 6%, var(--color-surface))' },
};

// Speed-band warning colours. In-band speeds render in plain ink; only the
// out-of-range bands (hi/lo) get a colour + thin underline accent, so colour
// means "attention" rather than decoration. Theme-aware via tokens.
const SPEED_VAR: Record<SpeedBand, string> = {
  hi: 'var(--color-spd-hi-fg)',
  lo: 'var(--color-spd-lo-fg)',
  ok: 'var(--color-spd-ok-fg)',
};

const tdCls = 'border-b border-r border-line';
// Soft shadow at the right of the frozen-column block (shows once content
// scrolls under it). Kept here so the Speed cell can compose it with its accent.
const FREEZE_EDGE = '6px 0 8px -6px rgba(15, 23, 42, 0.22)';
const dash = <span className="font-mono text-[0.72rem] text-faint">—</span>;

// Accessible names for the otherwise-unlabeled grid inputs.
const FIELD_LABEL: Partial<Record<keyof Leg, string>> = {
  date: 'Date',
  port: 'Location',
  dist: 'Distance in nautical miles',
  eta: 'ETA',
  arr: 'Arrival',
  dep: 'Departure',
  faw: 'Full away (FAW)',
  sunrise: 'Sunrise',
  sunset: 'Sunset',
  utc: 'UTC offset',
  openLoop: 'Open loop time',
  seaCond: 'Sea condition time',
  stbyArrDist: 'Arrival St/By distance',
  stbyDepDist: 'Departure St/By distance',
  remarks: 'Remarks',
  speed: 'Target speed in knots',
};
interface Props {
  leg: Leg;
  view: LegView;
  index: number;
  readonly: boolean;
  lefts: number[]; // constant left offsets for the frozen columns
  scrolled: boolean; // table scrolled off its left edge — show the freeze-edge shadow
  scrolledRight: boolean; // table not at its right edge — show the sticky-actions shadow
  fillActive: boolean; // this row is within an in-progress fill range
  fillCol: number; // table-column being filled (-1 when not dragging)
  showStandby: boolean; // St/By column group visible
  showSun: boolean; // Sunrise/Sunset/Daylight group visible
  showLoop: boolean; // Open Loop / Sea Cond group visible
  onField: (i: number, field: keyof Leg, val: string) => void;
  onMode: (i: number, mode: 'speed' | 'time') => void;
  onToggleType: (i: number) => void;
  onUp: (i: number) => void;
  onDown: (i: number) => void;
  onInsert: (i: number) => void;
  onDelete: (i: number) => void;
  onFillPreview: (from: number, to: number, col: number) => void;
  onFillCommit: (from: number, to: number, field: keyof Leg) => void;
}

function LegRowImpl({
  leg,
  view,
  index,
  readonly,
  lefts,
  scrolled,
  scrolledRight,
  fillActive,
  fillCol,
  showStandby,
  showSun,
  showLoop,
  onField,
  onMode,
  onToggleType,
  onUp,
  onDown,
  onInsert,
  onDelete,
  onFillPreview,
  onFillCommit,
}: Props) {
  const chip = TYPE_CHIP[leg.type];
  const set = (field: keyof Leg) => (e: ChangeEvent<HTMLInputElement>) => onField(index, field, e.target.value);
  // Value captured when an input gains focus — used to revert on Escape and to
  // skip the blur-normalise when an Escape revert is in flight.
  const focusValRef = useRef('');
  const revertingRef = useRef(false);

  // Sticky style for the first FROZEN columns. `bg` keeps frozen cells opaque
  // so scrolled columns don't bleed through their transparent row tint.
  // Column separators are drawn as an inset shadow on each cell's LEFT edge,
  // not via border-r: adjacent sticky cells can overlap by a subpixel once
  // scrolled and the right-hand cell paints on top, so a right border gets
  // covered — a left-drawn line is painted by the cell on top and survives.
  const frozen = (col: number, bg = chip.solid): CSSProperties | undefined => {
    if (col >= FROZEN) return undefined;
    const parts: string[] = [];
    if (col > 0) parts.push('inset 1px 0 0 0 var(--color-line)');
    return {
      position: 'sticky',
      left: lefts[col] ?? 0,
      zIndex: 10,
      background: bg,
      boxShadow: parts.length ? parts.join(', ') : undefined,
    };
  };
  // The freeze-edge shadow is driven inline by `scrolled` (see the Speed cell)
  // so the boundary only shadows while content sits under it.

  // Excel-style fill handle: drag down from a cell to copy its value into the
  // rows below — a +1-day series for dates, the same value verbatim for every
  // other field. Tracks the pointer over rows by their data-leg-index, previews
  // live (in the dragged field's column), and commits on release.
  const startFill = (e: PointerEvent, field: keyof Leg) => {
    if (readonly) return;
    e.preventDefault();
    e.stopPropagation();
    const col = FIELD_COL[field] ?? -1;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'crosshair';
    let target = index;
    const move = (ev: globalThis.PointerEvent) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const tr = el?.closest('[data-leg-index]') as HTMLElement | null;
      if (tr) {
        const n = Number(tr.dataset.legIndex);
        if (!Number.isNaN(n)) target = Math.max(index, n);
      }
      onFillPreview(index, target, col);
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      onFillPreview(-1, -1, -1);
      if (target > index) onFillCommit(index, target, field);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    onFillPreview(index, index, col);
  };

  // Shared input renderer for the dense cells. Every visual attribute (width via
  // the colgroup, alignment, mono, colour, weight, placeholder, inputMode,
  // maxLength) comes from FIELD_SPEC, so a column is re-typed/re-sized from one
  // place. The input fills its column (w-full) rather than carrying a fixed px
  // width that would fight the table-fixed colgroup. Also wires the editing-UX:
  // select-all on focus, blur-normalise, Escape-revert, invalid affordance, and
  // a copy-down fill handle.
  const inp = (field: keyof Leg) => {
    const spec = FIELD_SPEC[field];
    const col = FIELD_COL[field] ?? -1;
    const inFill = fillActive && fillCol === col; // this cell is in the drag range
    const invalid = !readonly && isInvalid(field, leg[field]);
    const onFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      focusValRef.current = e.currentTarget.value;
      e.currentTarget.select();
    };
    const onBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      if (revertingRef.current) {
        revertingRef.current = false;
        return;
      }
      const norm = spec.normalize?.(e.currentTarget.value);
      if (norm != null && norm !== leg[field]) onField(index, field, norm);
    };
    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        revertingRef.current = true; // suppress the blur-normalise about to fire
        if (focusValRef.current !== leg[field]) onField(index, field, focusValRef.current);
        e.currentTarget.blur();
      }
    };
    return (
      <span className="relative block w-full">
        {/* readOnly (not disabled) in view mode: text keeps full contrast and
            stays selectable/copyable — same rationale as RemarksCell below.
            Mutations are additionally gated upstream (updateLeg checks editable). */}
        <input
          value={leg[field]}
          onChange={set(field)}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          readOnly={readonly}
          data-col={col}
          aria-label={`${FIELD_LABEL[field] ?? field}, leg ${index + 1}`}
          aria-invalid={invalid || undefined}
          inputMode={spec.inputMode}
          maxLength={spec.maxLength}
          spellCheck={false}
          placeholder={spec.placeholder ?? '—'}
          style={{
            color: spec.color ?? 'var(--color-ink)',
            fontWeight: spec.weight,
            textAlign: spec.align,
            // Inline bg only when in a fill range (inline beats the hover/focus
            // utility classes, which we want active otherwise). Invalid draws a
            // 2px red underline as an inset shadow — no layout shift.
            ...(inFill ? { background: 'color-mix(in srgb, var(--color-cyan) 16%, var(--color-surface))' } : null),
            ...(invalid ? { boxShadow: 'inset 0 -2px 0 0 var(--color-spd-hi-fg)' } : null),
          }}
          className={`w-full min-w-0 rounded border border-transparent bg-transparent px-1 py-[3px] text-[0.72rem] outline-none focus:border-cyan focus:bg-surface hover:bg-rail ${
            spec.mono ? 'font-mono' : ''
          }`}
        />
        {!readonly && (
          <span
            role="button"
            tabIndex={-1}
            aria-label={`Fill ${FIELD_LABEL[field] ?? field} down from leg ${index + 1}`}
            title="Drag down to fill the cells below"
            onPointerDown={(e) => startFill(e, field)}
            className="vt-fill-handle absolute bottom-[2px] right-[2px] h-[7px] w-[7px] cursor-crosshair rounded-[2px] border border-surface bg-cyan shadow-[0_0_0_1px_rgba(0,0,0,0.08)]"
          />
        )}
      </span>
    );
  };

  const dateBg = fillActive && fillCol === FIELD_COL.date ? 'color-mix(in srgb, var(--color-cyan) 16%, var(--color-surface))' : chip.solid;

  // Speed cell's left edge: a 3px coloured band when out-of-band (calmer than an
  // underline), else the same 1px separator the other frozen cells use. Drawn as
  // an inset shadow so there's no layout shift and it survives sticky overlap.
  const speedBand = view.speedBand && view.speedBand !== 'ok' ? view.speedBand : null;
  const speedLeft = speedBand
    ? `inset 3px 0 0 0 ${SPEED_VAR[speedBand]}`
    : 'inset 1px 0 0 0 var(--color-line)';

  return (
    <tr data-leg-index={index} style={{ background: chip.row }}>
      {/* Type */}
      <td className={`${tdCls} px-1.5 py-[3px] text-center`} style={frozen(0)}>
        <button
          type="button"
          onClick={() => onToggleType(index)}
          disabled={readonly}
          aria-label={`Leg ${index + 1} type: ${chip.label}. Change type`}
          className="vt-unbutton rounded-[5px] border px-[7px] py-0.5 font-mono text-[0.58rem] font-extrabold tracking-[0.5px]"
          style={{
            background: 'transparent',
            color: chip.fg,
            borderColor: `color-mix(in srgb, ${chip.fg} 38%, transparent)`,
            cursor: readonly ? 'default' : 'pointer',
          }}
        >
          {chip.label}
        </button>
      </td>
      {/* Date — fill handle (drag down for a +1-day series) lives in inp(). */}
      <td className={`${tdCls} px-1`} style={frozen(1, dateBg)}>
        {inp('date')}
      </td>
      {/* Location */}
      <td className={`${tdCls} px-1`} style={frozen(2)}>{inp('port')}</td>
      {/* Dist */}
      <td className={`${tdCls} px-1 text-right`} style={frozen(3)}>
        {view.isPort ? inp('dist') : dash}
      </td>
      {/* Mode */}
      <td className={`${tdCls} px-1 text-center`} style={frozen(4)}>
        {view.isPort && (
          <span className="inline-flex overflow-hidden rounded-md border border-line" role="group" aria-label={`Leg ${index + 1} solve mode`}>
            <button
              type="button"
              onClick={() => onMode(index, 'speed')}
              disabled={readonly}
              aria-pressed={leg.mode === 'speed'}
              aria-label="Speed mode: enter times, compute speed"
              className="vt-unbutton px-3 py-[4px] text-[0.62rem] font-extrabold tracking-[0.7px]"
              style={leg.mode === 'speed' ? { background: '#06b6d4', color: '#fff' } : { background: 'var(--color-surface)', color: 'var(--color-muted)' }}
            >
              SPD
            </button>
            <button
              type="button"
              onClick={() => onMode(index, 'time')}
              disabled={readonly}
              aria-pressed={leg.mode !== 'speed'}
              aria-label="Time mode: enter target speed, compute ETA"
              className="vt-unbutton border-l-2 border-line px-3 py-[4px] text-[0.62rem] font-extrabold tracking-[0.7px]"
              style={leg.mode !== 'speed' ? { background: '#6366F1', color: '#fff' } : { background: 'var(--color-surface)', color: 'var(--color-muted)' }}
            >
              TIME
            </button>
          </span>
        )}
      </td>
      {/* Time (computed) — width is pinned by the colgroup; clip rather than let
          a long "127:00" reflow the column (which is what used to stale the
          frozen offsets and open the seam). */}
      <td className={`${tdCls} overflow-hidden pl-1.5 pr-2 text-right`} style={frozen(5)}>
        <div className="overflow-hidden font-mono text-[0.74rem] font-bold whitespace-nowrap" style={{ color: view.timeComputed ? 'var(--color-ink)' : 'var(--color-faint)' }}>
          {view.timeDisplay}
        </div>
      </td>
      {/* Speed */}
      <td className={`${tdCls} overflow-hidden px-1 text-right`} style={{ ...frozen(6), boxShadow: scrolled ? `${speedLeft}, ${FREEZE_EDGE}` : speedLeft }}>
        {view.speedComputed ? (
          view.speedDisplay ? (
            <span
              className="inline-block overflow-hidden font-mono text-[0.74rem] font-extrabold whitespace-nowrap"
              style={{ color: speedBand ? SPEED_VAR[speedBand] : 'var(--color-ink)' }}
            >
              {view.speedDisplay}
            </span>
          ) : (
            dash
          )
        ) : view.speedInput ? (
          <input
            value={leg.speed}
            onChange={set('speed')}
            readOnly={readonly}
            data-col={FIELD_COL.speed}
            aria-label={`Target speed in knots, leg ${index + 1}`}
            inputMode="decimal"
            spellCheck={false}
            placeholder="kn"
            style={{ background: 'color-mix(in srgb, var(--color-cyan) 10%, var(--color-surface))' }}
            className="w-full min-w-0 rounded border border-cyan px-1 py-[3px] text-right font-mono text-[0.72rem] font-bold outline-none focus:bg-surface"
          />
        ) : null}
      </td>
      {/* ETA */}
      <td className={`${tdCls} px-1 text-center`}>
        {view.isSea ? (
          dash
        ) : view.etaComputed ? (
          <span className="font-mono text-[0.72rem] font-bold text-cyan-deep">{view.etaDisplay}</span>
        ) : (
          inp('eta')
        )}
      </td>
      {/* Arr / Dep / FAW */}
      <td className={`${tdCls} px-1 text-center`}>{view.isPort ? inp('arr') : dash}</td>
      <td className={`${tdCls} px-1 text-center`}>{view.isPort ? inp('dep') : dash}</td>
      <td className={`${tdCls} px-1 text-center`}>{view.isPort ? inp('faw') : dash}</td>
      {/* St/By group (cols 11–16): Arr distance·time·speed, Dep distance·time·speed */}
      {showStandby && (
        <>
          <td className={`${tdCls} px-1 text-center`}>
            {view.isPort ? inp('stbyArrDist') : dash}
          </td>
          <td className={`${tdCls} px-1.5 text-center`}>
            <span className="font-mono text-[0.7rem] text-amber">{view.isPort ? view.stbyArrTime : '—'}</span>
          </td>
          <td className={`${tdCls} px-1.5 text-center`}>
            {view.stbyArrSpeed ? (
              <span className="font-mono text-[0.7rem] font-bold text-cyan-deep">{view.stbyArrSpeed}</span>
            ) : (
              dash
            )}
          </td>
          <td className={`${tdCls} px-1 text-center`}>
            {view.isPort ? inp('stbyDepDist') : dash}
          </td>
          <td className={`${tdCls} px-1.5 text-center`}>
            <span className="font-mono text-[0.7rem] text-amber">{view.isPort ? view.stbyDepTime : '—'}</span>
          </td>
          <td className={`${tdCls} px-1.5 text-center`}>
            {view.stbyDepSpeed ? (
              <span className="font-mono text-[0.7rem] font-bold text-cyan-deep">{view.stbyDepSpeed}</span>
            ) : (
              dash
            )}
          </td>
        </>
      )}
      {/* Port hrs */}
      <td className={`${tdCls} px-1.5 text-center`}>
        <span className="font-mono text-[0.7rem] text-pink">{view.portDisplay}</span>
      </td>
      {/* Sun group (cols 18–20): Sunrise / Sunset / Daylight */}
      {showSun && (
        <>
          <td className={`${tdCls} px-1 text-center`}>{view.isPort ? inp('sunrise') : dash}</td>
          <td className={`${tdCls} px-1 text-center`}>{view.isPort ? inp('sunset') : dash}</td>
          <td className={`${tdCls} px-1.5 text-center`}>
            <span className="font-mono text-[0.7rem]" style={{ color: view.hasDaylight ? 'var(--color-amber)' : 'var(--color-faint)' }}>
              {view.daylightDisplay}
            </span>
          </td>
        </>
      )}
      {/* UTC ± */}
      <td className={`${tdCls} px-1 text-center`}>{inp('utc')}</td>
      {/* Loop group (cols 22–23): Open Loop / Sea Cond */}
      {showLoop && (
        <>
          <td className={`${tdCls} px-1 text-center`}>{view.isPort ? inp('openLoop') : dash}</td>
          <td className={`${tdCls} px-1 text-center`}>{view.isPort ? inp('seaCond') : dash}</td>
        </>
      )}
      {/* Remarks */}
      <td className={`${tdCls} px-1`}>
        <RemarksCell value={leg.remarks} readonly={readonly} index={index} onChange={(v) => onField(index, 'remarks', v)} />
      </td>
      {/* Actions — sticky to the right edge so add/insert/delete stay reachable
          when the table is scrolled. Opaque bg + left separator/shadow mirror
          the frozen-left block. */}
      <td
        className="vt-no-print whitespace-nowrap border-b border-line px-1.5 py-[3px] text-center"
        style={{
          position: 'sticky',
          right: 0,
          zIndex: 10,
          background: chip.solid,
          boxShadow: scrolledRight ? 'inset 1px 0 0 0 var(--color-line), -6px 0 8px -6px rgba(15, 23, 42, 0.22)' : 'inset 1px 0 0 0 var(--color-line)',
        }}
      >
        <span className="inline-flex gap-0.5">
          <ActionBtn label={`Move leg ${index + 1} up`} hoverClass="hover:text-cyan-deep" disabled={readonly} onClick={() => onUp(index)}>↑</ActionBtn>
          <ActionBtn label={`Move leg ${index + 1} down`} hoverClass="hover:text-cyan-deep" disabled={readonly} onClick={() => onDown(index)}>↓</ActionBtn>
          <ActionBtn label={`Insert leg below leg ${index + 1}`} hoverClass="hover:text-green" disabled={readonly} onClick={() => onInsert(index)}>＋</ActionBtn>
          <ActionBtn label={`Delete leg ${index + 1}`} hoverClass="hover:text-[#DC2626]" disabled={readonly} onClick={() => onDelete(index)}>✕</ActionBtn>
        </span>
      </td>
    </tr>
  );
}

// ── Memoisation ─────────────────────────────────────────────────────────────
// Without this, a single keystroke re-renders every row (App recomputes all
// legViews → new array → all rows re-render), keeping the layout in flux. With a
// value-aware comparator only the edited row (and any genuinely-changed
// downstream row whose Leg or LegView differs) repaints.
const LEG_FIELDS: (keyof Leg)[] = [
  'type', 'date', 'port', 'dist', 'mode', 'eta', 'arr', 'dep', 'faw',
  'sunrise', 'sunset', 'utc', 'openLoop', 'seaCond', 'stbyArrDist', 'stbyDepDist', 'remarks', 'speed',
];
function legEqual(a: Leg, b: Leg): boolean {
  if (a === b) return true;
  for (const f of LEG_FIELDS) if (a[f] !== b[f]) return false;
  return true;
}
// Display fields LegRow actually reads from its LegView. Kept in sync with the
// JSX above — a missed field here would leave a computed cell stale.
const VIEW_FIELDS: (keyof LegView)[] = [
  'isPort', 'isSea', 'timeDisplay', 'timeComputed', 'speedComputed', 'speedInput',
  'speedDisplay', 'speedBand', 'etaComputed', 'etaDisplay', 'stbyArrTime', 'stbyArrSpeed',
  'stbyDepTime', 'stbyDepSpeed', 'portDisplay', 'daylightDisplay', 'hasDaylight',
];
function viewEqual(a: LegView, b: LegView): boolean {
  if (a === b) return true;
  for (const f of VIEW_FIELDS) if (a[f] !== b[f]) return false;
  return true;
}

export const LegRow = memo(
  LegRowImpl,
  (a, b) =>
    a.index === b.index &&
    a.readonly === b.readonly &&
    a.scrolled === b.scrolled &&
    a.scrolledRight === b.scrolledRight &&
    a.fillActive === b.fillActive &&
    a.fillCol === b.fillCol &&
    a.showStandby === b.showStandby &&
    a.showSun === b.showSun &&
    a.showLoop === b.showLoop &&
    a.lefts === b.lefts &&
    legEqual(a.leg, b.leg) &&
    viewEqual(a.view, b.view),
);

// Remarks cell: a full-width single-line input plus an expandable panel that
// reveals the whole note in a wrapping textarea (long remarks no longer clip).
function RemarksCell({
  value,
  readonly,
  index,
  onChange,
}: {
  value: string;
  readonly: boolean;
  index: number;
  onChange: (v: string) => void;
}) {
  const PANEL_W = 320;
  const PANEL_H = 150;
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Position the portal panel relative to the toggle, flipping above the button
  // when there isn't room below (keeps bottom rows from being clipped).
  const place = () => {
    const b = btnRef.current?.getBoundingClientRect();
    if (!b) return;
    const flipUp = b.bottom + PANEL_H + 8 > window.innerHeight;
    const top = flipUp ? b.top - PANEL_H - 6 : b.bottom + 6;
    const left = Math.max(8, Math.min(b.right - PANEL_W, window.innerWidth - PANEL_W - 8));
    setPos({ left, top: Math.max(8, top) });
  };

  useLayoutEffect(() => {
    if (open) place();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    // Re-place on viewport changes; close on any scroll (fixed panel would drift).
    window.addEventListener('resize', place);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="flex items-center gap-1">
      {/* readOnly (not disabled) in view mode so the text stays full-contrast
          and selectable — a disabled field greys it out and blocks copy. */}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readonly}
        data-col={FIELD_COL.remarks}
        aria-label={`Remarks, leg ${index + 1}`}
        spellCheck={false}
        placeholder="—"
        className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-[3px] text-[0.72rem] text-muted outline-none focus:border-cyan focus:bg-surface hover:bg-rail"
      />
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`${open ? 'Collapse' : 'Expand'} remarks for leg ${index + 1}`}
        title="Expand remarks"
        className="vt-unbutton flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-faint hover:bg-rail hover:text-ink"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.12s ease' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open &&
        pos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[100]" onClick={() => setOpen(false)} aria-hidden="true" />
            <div
              className="fixed z-[101] rounded-lg border border-line bg-surface p-2 shadow-[0_8px_24px_rgba(15,23,42,0.18)]"
              style={{ left: pos.left, top: pos.top, width: PANEL_W }}
            >
              <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                readOnly={readonly}
                rows={5}
                autoFocus
                spellCheck={false}
                placeholder="Remarks…"
                aria-label={`Full remarks for leg ${index + 1}`}
                className="w-full resize-y whitespace-pre-wrap break-words rounded border border-line bg-bg px-2 py-1.5 text-[0.74rem] leading-relaxed text-ink outline-none focus:border-cyan"
              />
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}

function ActionBtn({
  children,
  label,
  hoverClass,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  hoverClass: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`vt-unbutton rounded px-[3px] text-[0.8rem] leading-none text-muted hover:bg-rail disabled:opacity-25 ${hoverClass}`}
    >
      {children}
    </button>
  );
}
