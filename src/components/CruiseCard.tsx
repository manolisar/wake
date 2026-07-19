// Cruise header card — title, date span + attribution + filename, status pill,
// route chips (ports only), and duration summary.
import type { Voyage } from '../types';
import { fmtDate, dayNum } from '../domain/time';

export function CruiseCard({
  voyage,
  fileName,
  editable,
  onTitle,
  onNumber,
}: {
  voyage: Voyage | undefined;
  fileName: string;
  editable: boolean;
  onTitle: (s: string) => void;
  onNumber: (s: string) => void;
}) {
  if (!voyage) return null;
  const portLegs = voyage.legs.filter((l) => l.type === 'Port');
  const dates = voyage.legs.length
    ? `${fmtDate(voyage.legs[0].date)} → ${fmtDate(voyage.legs[voyage.legs.length - 1].date)}`
    : 'No dates';
  const duration = (() => {
    if (!voyage.legs.length) return '';
    const a = dayNum(voyage.legs[0].date);
    const b = dayNum(voyage.legs[voyage.legs.length - 1].date);
    return a != null && b != null
      ? `${b - a} nights · ${portLegs.length} ports`
      : `${portLegs.length} ports`;
  })();

  return (
    <div className="rounded-xl border border-line bg-surface px-[1.3rem] py-[1.1rem] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {editable ? (
            <div className="flex items-center gap-1.5">
              <input
                value={voyage.number}
                onChange={(e) => onNumber(e.target.value)}
                aria-label="Voyage number"
                autoComplete="off"
                spellCheck={false}
                inputMode="numeric"
                maxLength={3}
                placeholder="000"
                className="w-[3.6rem] rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-center font-mono text-[1.25rem] font-extrabold leading-tight tracking-[-0.3px] text-cyan-deep outline-none transition-colors [font-variant-numeric:tabular-nums] placeholder:font-bold placeholder:text-faint hover:bg-rail focus:border-cyan focus:bg-surface"
              />
              <span className="text-[1.25rem] font-extrabold leading-tight text-faint">—</span>
              <input
                value={voyage.title}
                onChange={(e) => onTitle(e.target.value)}
                aria-label="Cruise name"
                autoComplete="off"
                spellCheck={false}
                placeholder="e.g. British Isles & Ireland"
                className="w-full max-w-[24rem] rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-[1.25rem] font-extrabold leading-tight tracking-[-0.3px] text-ink outline-none transition-colors placeholder:font-bold placeholder:text-faint hover:bg-rail focus:border-cyan focus:bg-surface"
              />
            </div>
          ) : (
            <h2
              className="break-words px-1.5 py-0.5 text-[1.25rem] font-extrabold leading-tight tracking-[-0.3px]"
              style={{ color: voyage.title || voyage.number ? 'var(--color-ink)' : 'var(--color-faint)', fontStyle: voyage.title || voyage.number ? 'normal' : 'italic' }}
            >
              {voyage.number && <span className="font-mono text-cyan-deep [font-variant-numeric:tabular-nums]">{voyage.number}</span>}
              {voyage.number && (voyage.title ? ' — ' : '')}
              {voyage.title || (voyage.number ? '' : 'Untitled cruise')}
            </h2>
          )}
          <div className="mt-1.5 px-1.5 text-[0.7rem] tracking-[0.3px] text-muted">
            {dates} · {voyage.loggedBy} · <span className="font-mono">{fileName}</span>
          </div>
        </div>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.65rem] font-bold tracking-[0.5px]"
          style={
            voyage.ended
              ? { background: 'rgba(107,123,143,0.18)', color: 'var(--color-muted)' }
              : { background: 'rgba(16,185,129,0.18)', color: '#10b981' }
          }
        >
          {voyage.ended ? 'Ended' : 'Active'}
        </span>
      </div>
      <div className="mt-3.5 flex flex-wrap items-center gap-2 font-mono text-[0.82rem]">
        {portLegs.map((l, i) => (
          <span key={i} className="flex min-w-0 items-center gap-2">
            {i > 0 && <span className="text-faint">→</span>}
            <span className="max-w-[16rem] truncate font-bold" title={(l.port || '—').split(',')[0]}>{(l.port || '—').split(',')[0]}</span>
          </span>
        ))}
        <span className="ml-auto font-sans text-[0.68rem] uppercase tracking-[0.5px] text-muted">
          {duration}
        </span>
      </div>
    </div>
  );
}
