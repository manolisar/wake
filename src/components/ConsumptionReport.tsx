// The consumption view — the "Fuel Consumption" tab of the main area, with the
// per-leg fuel breakdown, DG loading, assumptions, totals by fuel, and
// warnings. Read-only view of a snapshot; the per-leg St/By MW inputs are the
// one edit surface (they write to the leg and mark the snapshot stale until
// recalculated).
import { useMemo, useState, type ReactNode } from 'react';
import type { Leg, Voyage } from '../types';
import type {
  CalculationResult,
  FuelType,
  StbyPhase,
  VoyageConsumption,
} from '../domain/consumption/types';
import { engineConfigs } from '../domain/consumption/engineDefaults';

interface Props {
  voyage: Voyage;
  consumption: VoyageConsumption | undefined; // undefined = not calculated yet
  stale: boolean;
  transient: boolean; // view-only run, not persisted
  editable: boolean;
  onSetLegField: (i: number, field: keyof Leg, val: string) => void;
  onRecalculate: () => void; // also serves as the first-time Calculate
}

const FUEL_COLOR: Record<FuelType, string> = {
  HFO: 'var(--color-amber)',
  MGO: 'var(--color-green)',
  LSFO: 'var(--color-indigo)',
};

const mt = (n: number) => (n === 0 ? '—' : n.toFixed(2));
const hrs = (n: number) => {
  const h = Math.floor(n);
  const m = Math.round((n - h) * 60);
  return `${h}:${String(m).padStart(2, '0')}`;
};

function FuelCells({ p }: { p: { hfoMT: number; mgoMT: number; lsfoMT: number; totalMT: number } }) {
  return (
    <>
      <td className="px-2 py-1 text-right font-mono text-[0.7rem] tabular-nums" style={{ color: FUEL_COLOR.HFO }}>
        {mt(p.hfoMT)}
      </td>
      <td className="px-2 py-1 text-right font-mono text-[0.7rem] tabular-nums" style={{ color: FUEL_COLOR.MGO }}>
        {mt(p.mgoMT)}
      </td>
      <td className="px-2 py-1 text-right font-mono text-[0.7rem] tabular-nums" style={{ color: FUEL_COLOR.LSFO }}>
        {mt(p.lsfoMT)}
      </td>
      <td className="px-2 py-1 text-right font-mono text-[0.72rem] font-bold tabular-nums text-ink">
        {p.totalMT.toFixed(2)}
      </td>
    </>
  );
}

function DgBreakdown({ result, title }: { result: CalculationResult; title: string }) {
  return (
    <div className="min-w-[260px]">
      <div className="mb-1 font-mono text-[0.55rem] font-bold uppercase tracking-[1px] text-faint">
        {title} · {(result.totalPowerKW / 1000).toFixed(1)} MW total
      </div>
      <table className="w-full">
        <tbody>
          {result.engineResults.map((e) => (
            <tr key={e.id} className="border-t border-line/60">
              <td className="py-0.5 pr-2 font-mono text-[0.62rem] font-bold">DG{e.id}</td>
              <td className="py-0.5 pr-2 text-[0.62rem] text-muted">{e.status.toLowerCase()}</td>
              <td className="py-0.5 pr-2 text-right font-mono text-[0.62rem] tabular-nums">
                {e.status === 'RUNNING' ? `${Math.round(e.loadKW).toLocaleString()} kW` : '—'}
              </td>
              <td
                className="py-0.5 pr-2 text-right font-mono text-[0.62rem] tabular-nums"
                style={{ color: e.overloaded ? 'var(--color-spd-hi-fg)' : undefined }}
              >
                {e.status === 'RUNNING' ? `${(e.loadFraction * 100).toFixed(0)}%${e.overloaded ? ' ⚠' : ''}` : ''}
              </td>
              <td className="py-0.5 pr-2 font-mono text-[0.62rem] font-bold" style={{ color: FUEL_COLOR[e.fuel] }}>
                {e.status === 'OFFLINE' ? '' : e.fuel}
              </td>
              <td className="py-0.5 text-right font-mono text-[0.62rem] tabular-nums">
                {e.status === 'RUNNING' ? `${e.fuelConsumption.toFixed(3)} t/h` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StbyRow({
  label,
  phase,
  legIndex,
  field,
  editable,
  onSetLegField,
  currentOverride,
}: {
  label: string;
  phase: StbyPhase;
  legIndex: number;
  field: 'stbyArrPowerMW' | 'stbyDepPowerMW';
  editable: boolean;
  onSetLegField: (i: number, field: keyof Leg, val: string) => void;
  currentOverride: string;
}) {
  const sourceText =
    phase.source === 'speed'
      ? `${phase.speed!.toFixed(1)} kn → ${(phase.powerKW / 1000).toFixed(1)} MW`
      : phase.source === 'override'
        ? `override ${(phase.powerKW / 1000).toFixed(1)} MW`
        : `default ${(phase.powerKW / 1000).toFixed(1)} MW`;
  return (
    <tr className="border-t border-line/50">
      <td className="py-1 pl-7 pr-2 text-[0.7rem] text-muted">{label}</td>
      <td className="px-2 py-1 text-right font-mono text-[0.7rem] tabular-nums">{hrs(phase.hours)}</td>
      <td className="px-2 py-1 text-[0.62rem] text-muted">
        <span
          className="rounded px-1 py-[1px] font-mono"
          style={
            phase.source === 'override'
              ? { background: '#FFFBEB', color: 'var(--color-amber)' }
              : phase.source === 'speed'
                ? { background: 'var(--color-spd-ok-bg)', color: 'var(--color-spd-ok-fg)' }
                : { background: 'var(--color-rail)', color: 'var(--color-muted)' }
          }
        >
          {sourceText}
        </span>
        {editable && (
          <span className="ml-2 inline-flex items-center gap-1 text-[0.58rem] text-faint">
            ovr
            <input
              type="number"
              aria-label={`${label} power override, MW`}
              className="w-[52px] rounded border border-line bg-surface px-1 py-[1px] font-mono text-[0.62rem] outline-none focus:border-cyan"
              placeholder="MW"
              min={0}
              step={0.5}
              value={currentOverride}
              onChange={(e) => onSetLegField(legIndex, field, e.target.value)}
            />
          </span>
        )}
        <span className="ml-2 font-mono text-[0.58rem] text-faint">
          {phase.engineCount} DG · {phase.fuelType}
        </span>
      </td>
      <FuelCells p={phase} />
    </tr>
  );
}

export function ConsumptionReport({
  voyage,
  consumption,
  stale,
  transient,
  editable,
  onSetLegField,
  onRecalculate,
}: Props) {
  const [openDg, setOpenDg] = useState<number | null>(null);

  const overriddenKeys = useMemo(
    () => Object.keys(voyage.consumptionOverrides ?? {}),
    [voyage.consumptionOverrides],
  );

  // Not calculated yet — offer the command inline.
  if (!consumption) {
    return (
      <section className="vt-scale-in flex flex-col items-center justify-center gap-3 rounded-2xl border border-line bg-surface px-6 py-16 text-center">
        <span className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-[11px] bg-navy font-mono text-[0.72rem] font-bold text-white">
          MT
        </span>
        <div className="text-base font-bold text-ink">No consumption calculated yet</div>
        <div className="max-w-md text-[0.8rem] leading-relaxed text-muted">
          Run the SL consumption model over this voyage's populated legs — sea passages at their
          solved speeds, St/By phases, and port stays. Parameters are in Fuel Setup.
        </div>
        <button
          onClick={onRecalculate}
          className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-navy px-4 py-2 text-[0.8rem] font-semibold text-white hover:brightness-110"
        >
          Calculate Consumption
        </button>
      </section>
    );
  }

  const s = consumption.settings;
  const t = consumption.totals;
  const offline = s.engines.filter((e) => !e.available).map((e) => `DG${e.id}`);

  const th = 'px-2 py-1.5 text-right font-mono text-[0.55rem] font-bold uppercase tracking-[1px] text-faint';

  return (
    <section
      aria-labelledby="vst-report-title"
      className="vt-scale-in flex flex-col overflow-hidden rounded-2xl border border-line bg-surface"
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-line px-5 py-4">
        <span className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-navy font-mono text-[0.62rem] font-bold text-white">
          MT
        </span>
        <div className="flex-1">
          <div id="vst-report-title" className="text-[0.9rem] font-extrabold">
            Consumption Report — {voyage.number} · {voyage.title}
          </div>
          <div className="text-[0.66rem] text-muted">
            Calculated {new Date(consumption.computedAt).toLocaleString()} by {consumption.by || '—'}
            {transient && ' · view-only (not saved)'}
          </div>
        </div>
        {!stale && (
          <button
            onClick={onRecalculate}
            className="rounded-lg border border-line bg-surface px-3.5 py-2 text-[0.78rem] font-semibold text-ink hover:bg-rail"
            title="Run the calculation again with the current data and parameters"
          >
            Recalculate
          </button>
        )}
      </div>

        {/* Stale banner */}
        {stale && (
          <div className="flex items-center gap-3 border-b border-[#FDE68A] bg-[#FFFBEB] px-5 py-2.5">
            <span className="text-[0.72rem] font-semibold text-amber">
              Voyage data or parameters changed since this calculation — figures below may be outdated.
            </span>
            <button
              onClick={onRecalculate}
              className="ml-auto rounded-lg bg-amber-btn px-3 py-1.5 text-[0.7rem] font-bold text-white hover:brightness-95"
            >
              Recalculate
            </button>
          </div>
        )}

        <div className="px-5 py-4">
          {/* Assumptions */}
          <div className="mb-4 rounded-lg border border-line bg-rail/50 px-3.5 py-2.5">
            <div className="mb-1 font-mono text-[0.55rem] font-bold uppercase tracking-[1.2px] text-faint">
              Assumptions{overriddenKeys.length ? ` · voyage overrides: ${overriddenKeys.join(', ')}` : ' · ship defaults'}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[0.66rem] text-muted">
              <span>Hotel <b className="font-mono text-ink">{s.hotelLoad} kW</b></span>
              <span>Sea margin <b className="font-mono text-ink">{s.seaMargin}%</b></span>
              <span>SFOC det. <b className="font-mono text-ink">{s.sfocDet}%</b></span>
              <span>Prop aux <b className="font-mono text-ink">{s.propAux} kW</b></span>
              <span>Maneuver aux <b className="font-mono text-ink">{s.maneuverAuxKW} kW</b></span>
              <span>
                DGs{' '}
                {s.engines.map((e) => (
                  <b key={e.id} className="mr-1 font-mono" style={{ color: e.available ? FUEL_COLOR[e.fuel] : 'var(--color-faint)' }}>
                    {engineConfigs.find((c) => c.id === e.id)?.label}:{e.available ? e.fuel : 'off'}
                  </b>
                ))}
              </span>
              <span>Port <b className="font-mono text-ink">{s.port.engineCount} DG · {s.port.fuelType}</b></span>
              <span>St/By fallback <b className="font-mono text-ink">{s.stby.avgPowerMW} MW · {s.stby.engineCount} DG · {s.stby.fuelType}</b></span>
              {offline.length > 0 && <span className="text-amber">Offline: {offline.join(', ')}</span>}
            </div>
          </div>

          {/* Per-leg table */}
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-line">
                <th className="px-2 py-1.5 text-left font-mono text-[0.55rem] font-bold uppercase tracking-[1px] text-faint">
                  Phase
                </th>
                <th className={th}>Hours</th>
                <th className="px-2 py-1.5 text-left font-mono text-[0.55rem] font-bold uppercase tracking-[1px] text-faint">
                  Basis
                </th>
                <th className={th} style={{ color: FUEL_COLOR.HFO }}>HFO MT</th>
                <th className={th} style={{ color: FUEL_COLOR.MGO }}>MGO MT</th>
                <th className={th} style={{ color: FUEL_COLOR.LSFO }}>LSFO MT</th>
                <th className={th}>Total MT</th>
              </tr>
            </thead>
            <tbody>
              {consumption.legs.map((lc) => {
                const legTotal =
                  (lc.sea?.totalMT ?? 0) + (lc.stbyArr?.totalMT ?? 0) + (lc.stbyDep?.totalMT ?? 0) + (lc.portStay?.totalMT ?? 0);
                const leg = voyage.legs[lc.legIndex];
                return (
                  <ManeuverGroup key={lc.legIndex}>
                    {/* Port-call header */}
                    <tr className="border-t-2 border-line bg-rail/60">
                      <td colSpan={6} className="px-2 py-1.5 text-[0.74rem] font-bold text-ink">
                        {lc.port || '(unnamed)'}
                        <span className="ml-2 font-mono text-[0.6rem] font-normal text-faint">{lc.date}</span>
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-[0.74rem] font-extrabold tabular-nums text-ink">
                        {legTotal > 0 ? legTotal.toFixed(2) : '—'}
                      </td>
                    </tr>
                    {lc.sea && (
                      <>
                        <tr className="border-t border-line/50">
                          <td className="py-1 pl-7 pr-2 text-[0.7rem] text-muted">
                            Sea passage
                            <button
                              type="button"
                              onClick={() => setOpenDg(openDg === lc.legIndex ? null : lc.legIndex)}
                              className="ml-2 rounded border border-line px-1.5 py-[1px] font-mono text-[0.55rem] text-faint hover:bg-rail"
                            >
                              DG {openDg === lc.legIndex ? '▴' : '▾'}
                            </button>
                          </td>
                          <td className="px-2 py-1 text-right font-mono text-[0.7rem] tabular-nums">{hrs(lc.sea.hours)}</td>
                          <td className="px-2 py-1 text-[0.62rem] text-muted">
                            <span className="font-mono">{lc.sea.speed.toFixed(1)} kn</span>
                            {lc.sea.openLoopHours != null && (
                              <span className="ml-2 font-mono text-[0.58rem] text-faint">
                                OL {hrs(lc.sea.openLoopHours)}
                                {lc.sea.changeoverHours > 0 && ` · c/o ${hrs(lc.sea.changeoverHours)}`}
                              </span>
                            )}
                            {lc.sea.insufficient && <span className="ml-1 text-amber">⚠ capacity</span>}
                          </td>
                          <FuelCells p={lc.sea} />
                        </tr>
                        {openDg === lc.legIndex && (
                          <tr>
                            <td colSpan={7} className="bg-rail/40 px-7 py-2">
                              <div className="flex flex-wrap gap-8">
                                <DgBreakdown result={lc.sea.openResult} title={lc.sea.closeResult ? 'Open loop' : 'Whole passage'} />
                                {lc.sea.closeResult && <DgBreakdown result={lc.sea.closeResult} title="Close loop (DG4 → MGO)" />}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    )}
                    {lc.stbyArr && leg && (
                      <StbyRow
                        label="St/By arrival"
                        phase={lc.stbyArr}
                        legIndex={lc.legIndex}
                        field="stbyArrPowerMW"
                        editable={editable}
                        onSetLegField={onSetLegField}
                        currentOverride={leg.stbyArrPowerMW}
                      />
                    )}
                    {lc.portStay && (
                      <tr className="border-t border-line/50">
                        <td className="py-1 pl-7 pr-2 text-[0.7rem] text-muted">Port stay</td>
                        <td className="px-2 py-1 text-right font-mono text-[0.7rem] tabular-nums">{hrs(lc.portStay.hours)}</td>
                        <td className="px-2 py-1 text-[0.62rem] text-muted">
                          <span className="font-mono text-[0.58rem]">
                            DG {lc.portStay.dgRate.toFixed(3)} t/h + boiler {lc.portStay.boilerMT.toFixed(2)} MT
                          </span>
                          {lc.portStay.insufficient && <span className="ml-1 text-amber">⚠ capacity</span>}
                        </td>
                        <FuelCells p={lc.portStay} />
                      </tr>
                    )}
                    {lc.stbyDep && leg && (
                      <StbyRow
                        label="St/By departure"
                        phase={lc.stbyDep}
                        legIndex={lc.legIndex}
                        field="stbyDepPowerMW"
                        editable={editable}
                        onSetLegField={onSetLegField}
                        currentOverride={leg.stbyDepPowerMW}
                      />
                    )}
                  </ManeuverGroup>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-navy">
                <td className="px-2 py-2 text-[0.74rem] font-extrabold text-ink">Voyage total</td>
                <td className="px-2 py-2 text-right font-mono text-[0.66rem] tabular-nums text-muted">
                  sea {hrs(t.seaHrs)} · s/b {hrs(t.stbyHrs)} · port {hrs(t.portHrs)}
                </td>
                <td className="px-2 py-2 text-right font-mono text-[0.6rem] text-faint">boiler {t.boilerMT.toFixed(2)} MT</td>
                <td className="px-2 py-2 text-right font-mono text-[0.76rem] font-bold tabular-nums" style={{ color: FUEL_COLOR.HFO }}>
                  {t.hfoMT.toFixed(2)}
                </td>
                <td className="px-2 py-2 text-right font-mono text-[0.76rem] font-bold tabular-nums" style={{ color: FUEL_COLOR.MGO }}>
                  {t.mgoMT.toFixed(2)}
                </td>
                <td className="px-2 py-2 text-right font-mono text-[0.76rem] font-bold tabular-nums" style={{ color: FUEL_COLOR.LSFO }}>
                  {t.lsfoMT.toFixed(2)}
                </td>
                <td className="px-2 py-2 text-right font-mono text-[0.82rem] font-extrabold tabular-nums text-ink">
                  {t.totalMT.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Warnings */}
          {consumption.warnings.length > 0 && (
            <div className="mt-3 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-3.5 py-2.5">
              <div className="mb-1 font-mono text-[0.55rem] font-bold uppercase tracking-[1.2px] text-amber">
                Warnings
              </div>
              <ul className="list-inside list-disc text-[0.66rem] leading-relaxed text-amber">
                {consumption.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
    </section>
  );
}

// React fragments can't take a key when written as <>…</>, so a named
// pass-through keeps the per-leg grouping keyed without an extra DOM node.
function ManeuverGroup({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
