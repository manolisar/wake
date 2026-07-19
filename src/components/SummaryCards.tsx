// Seven stratified summary cards (top bar + title strip + tinted body),
// derived from the voyage Summary. The band palette is a harmonised set of
// mid-bright nautical hues that stay legible on both the light surface and the
// dark "bridge" surface; the body tint is mixed into the surface token via
// color-mix so it adapts to the theme automatically.
import type { Summary } from '../domain/calculations';
import { fmtHM } from '../domain/time';

interface CardDef {
  label: string;
  unit: string;
  value: string;
  sub: string;
  color: string;
}

function cards(s: Summary): CardDef[] {
  return [
    { label: 'Port Calls', unit: '', value: String(s.portCalls || 0), sub: 'stops', color: '#10b981' },
    { label: 'Total Distance', unit: 'nm', value: s.totalDist != null ? Math.round(s.totalDist).toLocaleString() : '0', sub: '', color: '#6b8cae' },
    { label: 'Average Speed', unit: 'kn', value: s.avg != null ? s.avg.toFixed(1) : '—', sub: 'passages', color: '#06b6d4' },
    { label: 'Steaming Time', unit: 'HH:MM', value: fmtHM((s.totalHrs || 0) * 60), sub: s.totalHrs ? '(' + (s.totalHrs / 24).toFixed(1) + ' d)' : '', color: '#f97316' },
    { label: 'St/By Time', unit: 'HH:MM', value: fmtHM(s.stbyMin || 0), sub: 'maneuvering', color: '#f59e0b' },
    { label: 'Port Time', unit: 'HH:MM', value: fmtHM(s.portMin || 0), sub: 'alongside', color: '#f43f5e' },
    { label: 'Open Loop', unit: 'HH:MM', value: fmtHM(s.openLoopMin || 0), sub: 'open ops', color: '#0284C7' },
    { label: 'Sea Condition', unit: 'HH:MM', value: fmtHM(s.seaCondMin || 0), sub: 'env ops', color: '#818cf8' },
  ];
}

export function SummaryCards({ summary }: { summary: Summary }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-8">
      {cards(summary).map((c, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-xl border border-line shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
          style={{ background: `color-mix(in srgb, ${c.color} 6%, var(--color-surface))` }}
        >
          <div className="h-2" style={{ background: c.color }} />
          {/* Text mixes the band with ink (40%) instead of using the raw band:
              the bright bands failed WCAG AA on their own tints (down to 1.55:1),
              and mixing with the theme's ink keeps it readable on all 3 themes. */}
          <div
            className="flex items-center justify-between border-b border-line px-3.5 py-2 text-[0.6rem] font-bold uppercase tracking-[1.5px]"
            style={{ color: `color-mix(in srgb, ${c.color} 40%, var(--color-ink))`, background: `color-mix(in srgb, ${c.color} 8%, var(--color-rail))` }}
          >
            <span>{c.label}</span>
            <span className="font-mono text-[0.6rem] normal-case tracking-[0.5px] text-muted">{c.unit}</span>
          </div>
          <div className="flex flex-wrap items-baseline gap-1.5 px-3.5 py-2.5">
            <span
              className="font-mono text-[1.4rem] font-extrabold leading-none [font-variant-numeric:tabular-nums]"
              style={{ color: `color-mix(in srgb, ${c.color} 40%, var(--color-ink))` }}
            >
              {c.value}
            </span>
            <span className="text-[0.58rem] text-muted">{c.sub}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
