// Version history panel — newest first. Colors keyed by action type.
import type { Version } from '../types';

function colorsFor(action: string): { color: string; bg: string } {
  if (action === 'Unlocked') return { color: 'var(--color-amber)', bg: 'rgba(217,119,6,0.12)' };
  if (action === 'Locked') return { color: 'var(--color-muted)', bg: 'var(--color-rail)' };
  return { color: 'var(--color-cyan-deep)', bg: 'rgba(6,182,212,0.12)' };
}

export function VersionHistory({ versions }: { versions: Version[] }) {
  const rows = versions.map((ver, i) => ({ ...ver, tag: 'v' + (i + 1) })).reverse();
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <h2 className="text-[0.6rem] font-bold uppercase tracking-[1.2px] text-muted">
          Version History
        </h2>
        <span className="font-mono text-[0.62rem] text-faint">{versions.length} entries</span>
      </div>
      <div>
        {rows.map((ver, i) => {
          const c = colorsFor(ver.action);
          return (
            <div
              key={i}
              className="vt-cv grid grid-cols-[auto_1fr_auto] items-start gap-2.5 border-b border-line px-4 py-2.5 last:border-b-0"
            >
              <span
                className="rounded-[5px] px-1.5 py-0.5 font-mono text-[0.66rem] font-extrabold"
                style={{ color: c.color, background: c.bg }}
              >
                {ver.tag}
              </span>
              <div className="min-w-0 break-words">
                <div className="text-[0.74rem] font-bold">
                  {ver.action}
                  <span className="font-normal text-muted"> · {ver.by}</span>
                </div>
                <div className="text-[0.66rem] text-muted">{ver.note}</div>
              </div>
              <span className="whitespace-nowrap font-mono text-[0.62rem] text-faint">{ver.at}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
