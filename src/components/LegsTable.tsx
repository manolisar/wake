// Legs section — header (legend, view controls, add buttons) and the 26-column
// table. The first FROZEN columns (Type … Speed) stick to the left and the
// Actions column sticks to the right; all offsets are DETERMINISTIC (from the
// COL_W width table), not measured — a <colgroup> + table-fixed layout pins
// every column width so a computed cell can never reflow its column and leave
// the sticky offsets stale.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Leg, LegType, Voyage } from '../types';
import type { LegView } from '../domain/calculations';
import { COL_FIELD, COL_W, FROZEN, FROZEN_LEFTS } from '../domain/fieldTypes';
import { LegRow } from './LegRow';
import { PlusIcon } from './Icons';

const COLUMNS: [string, string][] = [
  ['Type', 'center'], ['Date', 'left'], ['Location', 'left'], ['Dist', 'right'], ['Mode', 'center'],
  ['Time', 'right'], ['Speed', 'right'], ['ETA', 'center'], ['Arr', 'center'], ['Dep', 'center'], ['FAW', 'center'],
  ['S/B Arr Dist', 'center'], ['S/B Arr Time', 'center'], ['S/B Arr Spd', 'center'], ['S/B Dep Dist', 'center'], ['S/B Dep Time', 'center'], ['S/B Dep Spd', 'center'],
  ['Port hrs', 'center'], ['Sunrise', 'center'], ['Sunset', 'center'],
  ['Daylight', 'center'], ['UTC ±', 'center'], ['Open Loop', 'center'], ['Sea Cond', 'center'], ['Remarks', 'left'], ['', 'center'],
];

// Collapsible column groups → the table-column indices they own. Hiding a group
// drops its <col>, <th>, and matching <td>s as a unit. All indices are ≥ FROZEN,
// so hiding never disturbs the frozen-left offsets.
const GROUP_COLS = {
  standby: [11, 12, 13, 14, 15, 16],
  sun: [18, 19, 20],
  loop: [22, 23],
} as const;

interface ColPrefs {
  standby: boolean;
  sun: boolean;
  loop: boolean;
}

// localStorage-backed view pref (same pattern as the sidebar width in App).
function usePref<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  }, [key, v]);
  return [v, setV];
}

interface Props {
  voyage: Voyage | undefined;
  legViews: LegView[];
  readonly: boolean;
  onField: (i: number, field: keyof Leg, val: string) => void;
  onMode: (i: number, mode: 'speed' | 'time') => void;
  onToggleType: (i: number) => void;
  onUp: (i: number) => void;
  onDown: (i: number) => void;
  onInsert: (i: number) => void;
  onDelete: (i: number) => void;
  onAdd: (type: LegType) => void;
  onFill: (from: number, to: number, field: keyof Leg) => void;
}

export function LegsTable(props: Props) {
  const { voyage, legViews, readonly, onAdd, onFill } = props;
  const legs = voyage?.legs ?? [];

  // Frozen-column left offsets are a constant cumulative sum of the COL_W width
  // table (computed once in fieldTypes). No measurement, no ResizeObserver — the
  // colgroup below guarantees columns never reflow, so these can't go stale.
  const lefts = FROZEN_LEFTS;

  // ── View prefs (persisted) ──────────────────────────────────────────────
  const [cols, setCols] = usePref<ColPrefs>('vst_cols', { standby: true, sun: true, loop: true });
  const [colsOpen, setColsOpen] = useState(false);

  const hiddenCols = useMemo(() => {
    const s = new Set<number>();
    if (!cols.standby) GROUP_COLS.standby.forEach((c) => s.add(c));
    if (!cols.sun) GROUP_COLS.sun.forEach((c) => s.add(c));
    if (!cols.loop) GROUP_COLS.loop.forEach((c) => s.add(c));
    return s;
  }, [cols]);
  const visibleWidth = useMemo(
    () => COL_W.reduce((acc, w, i) => (hiddenCols.has(i) ? acc : acc + w), 0),
    [hiddenCols],
  );

  // ── Scroll shadows: track both edges so the frozen-left and sticky-right
  // shadows only show while content sits under them. ─────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [scrolledRight, setScrolledRight] = useState(false);
  const syncScroll = (el: HTMLElement) => {
    setScrolled(el.scrollLeft > 0);
    setScrolledRight(el.scrollWidth - el.clientWidth - el.scrollLeft > 1);
  };
  useEffect(() => {
    if (scrollRef.current) syncScroll(scrollRef.current);
  }, [legs.length, visibleWidth]);

  // Excel-style grid keyboard navigation. Each data input carries a `data-col`
  // (its table-column index); inputs sit in row order in the DOM. Up/Down/Enter
  // move within a column (skipping rows that lack that input); Ctrl/Cmd+Up/Down
  // jump to the first/last row of the column; Tab/Shift+Tab step across cells,
  // wrapping rows. Left/Right keep their normal text-caret behaviour.
  const onGridKey = (e: React.KeyboardEvent<HTMLTableElement>) => {
    const t = e.target as HTMLElement;
    if (t.tagName !== 'INPUT' || t.dataset.col == null) return;
    const input = t as HTMLInputElement;
    const table = e.currentTarget;
    const go = (el: HTMLInputElement | undefined) => {
      if (!el) return;
      e.preventDefault();
      el.focus();
      el.select();
    };
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
      const col = Array.from(table.querySelectorAll<HTMLInputElement>(`input[data-col="${input.dataset.col}"]`));
      const i = col.indexOf(input);
      if ((e.ctrlKey || e.metaKey) && e.key !== 'Enter') {
        go(e.key === 'ArrowUp' ? col[0] : col[col.length - 1]);
      } else {
        go(col[i + (e.key === 'ArrowUp' ? -1 : 1)]);
      }
    } else if (e.key === 'Tab') {
      // DOM order is row-major, so stepping ±1 moves across columns and wraps to
      // the next/previous row. At the first/last input we fall through to native
      // Tab so focus can still leave the table.
      const all = Array.from(table.querySelectorAll<HTMLInputElement>('input[data-col]'));
      const i = all.indexOf(input);
      go(all[i + (e.shiftKey ? -1 : 1)]);
    }
  };

  // Multi-cell paste: when a grid input is focused, parse the clipboard as a TSV
  // grid and write it from the focused cell rightward/downward, mapping each
  // pasted column onto the field at that table-column. Targets that don't exist
  // (e.g. Sea rows lack most fields) are skipped rather than mis-assigned.
  const onPaste = (e: React.ClipboardEvent<HTMLTableElement>) => {
    if (readonly) return;
    const input = e.target as HTMLElement;
    if (input.tagName !== 'INPUT' || (input as HTMLInputElement).dataset.col == null) return;
    const text = e.clipboardData.getData('text');
    if (!text || (!text.includes('\t') && !text.includes('\n'))) return; // single value → native paste
    const grid = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').map((r) => r.split('\t'));
    const c0 = Number((input as HTMLInputElement).dataset.col);
    const r0 = Number((input.closest('[data-leg-index]') as HTMLElement | null)?.dataset.legIndex);
    if (!Number.isFinite(c0) || !Number.isFinite(r0)) return;
    const table = e.currentTarget;
    let wrote = 0;
    grid.forEach((row, r) => {
      row.forEach((val, c) => {
        const targetCol = c0 + c;
        const field = COL_FIELD[targetCol];
        if (field == null) return;
        const cell = table.querySelector<HTMLInputElement>(`tr[data-leg-index="${r0 + r}"] input[data-col="${targetCol}"]`);
        if (!cell || cell.disabled) return; // field absent on this row (Sea/Tender) → skip
        props.onField(r0 + r, field, val);
        wrote++;
      });
    });
    if (wrote) e.preventDefault();
  };

  // Live fill-handle range. null when not dragging. `col` is the table-column
  // being filled so the preview tints only that column's cells.
  const [fill, setFill] = useState<{ from: number; to: number; col: number } | null>(null);
  const onFillPreview = (from: number, to: number, col: number) => setFill(from < 0 ? null : { from, to, col });
  const onFillCommit = (from: number, to: number, field: keyof Leg) => {
    setFill(null);
    onFill(from, to, field);
  };

  const addBtn = (label: string, type: LegType) => (
    <button
      onClick={() => onAdd(type)}
      disabled={readonly}
      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[0.72rem] font-semibold hover:bg-rail disabled:opacity-50"
      style={{ color: readonly ? 'var(--color-faint)' : 'var(--color-ink)' }}
    >
      <PlusIcon size={12} />
      {label}
    </button>
  );

  return (
    <section>
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-[0.55rem] font-bold uppercase tracking-[1.5px] text-faint">
            Legs · {legs.length} stops
          </span>
          <span className="inline-flex items-center gap-1.5 font-mono text-[0.58rem] text-muted">
            <span className="inline-block h-[9px] w-[9px] rounded-sm" style={{ background: 'var(--color-spd-hi-fg)' }} />&gt;19 kn
          </span>
          <span className="inline-flex items-center gap-1.5 font-mono text-[0.58rem] text-muted">
            <span className="inline-block h-[9px] w-[9px] rounded-sm" style={{ background: 'var(--color-spd-lo-fg)' }} />&lt;10 kn
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Columns popover */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setColsOpen((o) => !o)}
              aria-expanded={colsOpen}
              className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[0.66rem] font-semibold text-muted hover:bg-rail"
            >
              Columns
            </button>
            {colsOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setColsOpen(false)} aria-hidden="true" />
                <div className="absolute right-0 z-50 mt-1 w-44 rounded-lg border border-line bg-surface p-1.5 shadow-[0_8px_24px_rgba(15,23,42,0.18)]">
                  {([['standby', 'St/By columns'], ['sun', 'Sunrise / Sunset'], ['loop', 'Open Loop / Sea']] as const).map(([key, label]) => (
                    <label key={key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[0.72rem] text-ink hover:bg-rail">
                      <input
                        type="checkbox"
                        checked={cols[key]}
                        onChange={(e) => setCols({ ...cols, [key]: e.target.checked })}
                        className="accent-cyan"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
          {addBtn('Port', 'Port')}
          {addBtn('At Sea', 'Sea')}
          {addBtn('Tender', 'Tender')}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="vt-scroll overflow-x-auto rounded-xl border border-line bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
        onScroll={(e) => syncScroll(e.currentTarget)}
      >
        {/* border-separate (not collapse): collapsed borders vanish on the
            sticky header / frozen cells during scroll in Chromium.
            table-fixed + colgroup: column widths come from COL_W, not content,
            so the frozen offsets above stay valid through every edit. */}
        <table
          onKeyDown={onGridKey}
          onPaste={onPaste}
          className="table-fixed border-separate border-spacing-0 text-[0.72rem]"
          style={{ minWidth: visibleWidth, width: visibleWidth }}
        >
          <colgroup>
            {COL_W.map((w, i) => (hiddenCols.has(i) ? null : <col key={i} style={{ width: w }} />))}
          </colgroup>
          <thead>
            <tr>
              {COLUMNS.map(([label, align], i) => {
                if (hiddenCols.has(i)) return null;
                const isFrozen = i < FROZEN;
                const isActions = i === COLUMNS.length - 1;
                // The St/By headers (11–16) are long ("S/B Arr Dist") — let them
                // wrap to a second line instead of forcing the column wider.
                const wrap = i >= 11 && i <= 16;
                return (
                  <th
                    key={i}
                    scope="col"
                    className={`sticky top-0 border-b border-r border-line bg-rail px-2 py-2 align-bottom text-[0.5rem] font-bold uppercase tracking-[1.1px] text-faint ${
                      wrap ? 'leading-tight' : 'whitespace-nowrap'
                    } ${isFrozen || isActions ? 'z-30' : 'z-20'}`}
                    style={{
                      textAlign: align as 'left' | 'right' | 'center',
                      // Match the body's left-edge separators (see LegRow) so the
                      // frozen-column borders stay put when the table scrolls.
                      ...(isFrozen
                        ? {
                            left: lefts[i] ?? 0,
                            boxShadow:
                              [
                                i > 0 ? 'inset 1px 0 0 0 var(--color-line)' : '',
                                i === FROZEN - 1 && scrolled ? '6px 0 8px -6px rgba(15, 23, 42, 0.22)' : '',
                              ]
                                .filter(Boolean)
                                .join(', ') || undefined,
                          }
                        : null),
                      // Actions header mirrors the body's sticky-right cell.
                      ...(isActions
                        ? {
                            right: 0,
                            boxShadow: scrolledRight
                              ? 'inset 1px 0 0 0 var(--color-line), -6px 0 8px -6px rgba(15, 23, 42, 0.22)'
                              : 'inset 1px 0 0 0 var(--color-line)',
                          }
                        : null),
                    }}
                  >
                    {label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {legs.map((leg, i) => (
              <LegRow
                key={i}
                leg={leg}
                view={legViews[i]}
                index={i}
                readonly={readonly}
                lefts={lefts}
                scrolled={scrolled}
                scrolledRight={scrolledRight}
                fillActive={!!fill && i > fill.from && i <= fill.to}
                fillCol={fill?.col ?? -1}
                showStandby={cols.standby}
                showSun={cols.sun}
                showLoop={cols.loop}
                onField={props.onField}
                onMode={props.onMode}
                onToggleType={props.onToggleType}
                onUp={props.onUp}
                onDown={props.onDown}
                onInsert={props.onInsert}
                onDelete={props.onDelete}
                onFillPreview={onFillPreview}
                onFillCommit={onFillCommit}
              />
            ))}
          </tbody>
        </table>
      </div>

      {legs.length === 0 && (
        <div className="px-4 py-10 text-center text-[0.82rem] text-faint">
          No legs yet for this voyage. {readonly ? 'Enable Edit to add legs.' : 'Use Add Port / At Sea / Tender above.'}
        </div>
      )}
    </section>
  );
}
