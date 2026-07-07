// Fuel Setup — the full parameter surface of the SL consumption model, in two
// tabs: SHIP DEFAULTS (stored on the current .json file) and THIS VOYAGE
// (overrides stored on the voyage; anything untouched follows the defaults).
import { useMemo, useRef, useState } from 'react';
import { useModalDialog } from '../hooks/useModalDialog';
import type {
  ConsumptionOverrides,
  ConsumptionSettings,
  EngineState,
  FuelType,
} from '../domain/consumption/types';
import { SETTING_RANGES, engineConfigs } from '../domain/consumption/engineDefaults';
import { normalizeSettings, resolveSettings } from '../domain/consumption/settings';

interface Props {
  defaults: ConsumptionSettings;
  overrides: ConsumptionOverrides | undefined;
  canEditDefaults: boolean; // role + daily password (file-level, like createFile)
  canEditVoyage: boolean; // editable (voyage unlock included)
  hasVoyage: boolean;
  onSaveDefaults: (s: ConsumptionSettings) => void;
  onSaveOverrides: (o: ConsumptionOverrides | undefined) => void;
  onClose: () => void;
}

const FUEL_COLOR: Record<FuelType, string> = {
  HFO: 'var(--color-amber)',
  MGO: 'var(--color-green)',
  LSFO: 'var(--color-indigo)',
};

type ScalarKey = 'hotelLoad' | 'seaMargin' | 'sfocDet' | 'propAux' | 'thrusterIdleKW' | 'thrusterHighKW';

const SCALARS: { key: ScalarKey; label: string; unit: string; step: number; hint: string }[] = [
  { key: 'hotelLoad', label: 'Hotel load', unit: 'kW', step: 100, hint: 'Accommodation & services' },
  { key: 'seaMargin', label: 'Sea margin', unit: '%', step: 1, hint: 'Weather / hull degradation' },
  { key: 'sfocDet', label: 'SFOC deterioration', unit: '%', step: 0.5, hint: 'Engine wear vs FAT curve' },
  { key: 'propAux', label: 'Prop auxiliaries', unit: 'kW', step: 100, hint: 'Steering, ventilation — at sea & St/By' },
  { key: 'thrusterIdleKW', label: 'Thrusters idle', unit: 'kW', step: 100, hint: 'St/By except final 30 min (3×360 kW)' },
  { key: 'thrusterHighKW', label: 'Thrusters high', unit: 'kW', step: 500, hint: 'Final 30 min of St/By (3×3,000 kW)' },
];

function OverriddenPill({ onReset, disabled }: { onReset: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onReset}
      disabled={disabled}
      title="Overridden for this voyage — click to revert to the ship default"
      className="ml-1.5 inline-flex items-center gap-1 rounded-full border border-warn-border bg-warn-bg px-1.5 py-[1px] font-mono text-[0.6rem] font-bold uppercase tracking-[0.5px] text-amber hover:brightness-95"
    >
      ovr ×
    </button>
  );
}

export function ConsumptionSettingsModal({
  defaults,
  overrides,
  canEditDefaults,
  canEditVoyage,
  hasVoyage,
  onSaveDefaults,
  onSaveOverrides,
  onClose,
}: Props) {
  const [tab, setTab] = useState<'defaults' | 'voyage'>(hasVoyage ? 'voyage' : 'defaults');
  const [draftDefaults, setDraftDefaults] = useState<ConsumptionSettings>(() =>
    structuredClone(defaults),
  );
  const [draftOverrides, setDraftOverrides] = useState<ConsumptionOverrides>(() =>
    structuredClone(overrides ?? {}),
  );
  const dialogRef = useRef<HTMLDivElement>(null);
  const [unsavedHint, setUnsavedHint] = useState(false);

  // Backdrop click / Escape must not silently discard edits: while the drafts
  // differ from what was passed in, they show a hint instead of closing.
  // Cancel and Save always close.
  const dirty =
    JSON.stringify(draftDefaults) !== JSON.stringify(defaults) ||
    JSON.stringify(draftOverrides) !== JSON.stringify(overrides ?? {});
  const attemptClose = () => {
    if (dirty) setUnsavedHint(true);
    else onClose();
  };
  useModalDialog(dialogRef, attemptClose);

  const onDefaults = tab === 'defaults';
  const canEditTab = onDefaults ? canEditDefaults : canEditVoyage;
  const resolved = useMemo(
    () => resolveSettings(draftDefaults, draftOverrides),
    [draftDefaults, draftOverrides],
  );
  // The values the current tab displays.
  const view: ConsumptionSettings = onDefaults ? normalizeSettings(draftDefaults) : resolved;

  const setScalar = (key: ScalarKey, raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    if (onDefaults) setDraftDefaults((d) => ({ ...d, [key]: n }));
    else setDraftOverrides((o) => ({ ...o, [key]: n }));
  };
  const resetScalar = (key: ScalarKey) =>
    setDraftOverrides((o) => {
      const next = { ...o };
      delete next[key];
      return next;
    });

  const setEngines = (next: EngineState[]) => {
    if (onDefaults) setDraftDefaults((d) => ({ ...d, engines: next }));
    else setDraftOverrides((o) => ({ ...o, engines: next }));
  };
  const patchEngine = (id: number, patch: Partial<EngineState>) =>
    setEngines(view.engines.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const setGroup = (group: 'port' | 'tender' | 'stby', patch: Record<string, unknown>) => {
    if (onDefaults) setDraftDefaults((d) => ({ ...d, [group]: { ...d[group], ...patch } }));
    else setDraftOverrides((o) => ({ ...o, [group]: { ...o[group], ...patch } }));
  };
  const resetGroup = (group: 'port' | 'tender' | 'stby') =>
    setDraftOverrides((o) => {
      const next = { ...o };
      delete next[group];
      return next;
    });

  const save = () => {
    if (onDefaults) onSaveDefaults(normalizeSettings(draftDefaults));
    else onSaveOverrides(Object.keys(draftOverrides).length ? draftOverrides : undefined);
    onClose();
  };

  const label = 'mb-1 block text-[0.6rem] font-bold uppercase tracking-[1.2px] text-faint';
  const input =
    'w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 font-mono text-[0.78rem] text-ink outline-none focus:border-cyan disabled:opacity-50';
  const tabBtn = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-[0.72rem] font-bold ${
      active ? 'bg-navy text-white' : 'border border-line bg-surface text-muted hover:bg-rail'
    }`;

  const R = SETTING_RANGES;
  const scalarRange: Record<ScalarKey, { min: number; max: number }> = {
    hotelLoad: R.hotelLoad,
    seaMargin: R.seaMargin,
    sfocDet: R.sfocDet,
    propAux: R.propAux,
    thrusterIdleKW: R.thrusterIdleKW,
    thrusterHighKW: R.thrusterHighKW,
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(10,25,41,0.45)] backdrop-blur-[4px]"
      onClick={attemptClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="vst-fuel-title"
        style={{ overscrollBehavior: 'contain' }}
        className="vt-scale-in flex max-h-[92vh] w-[720px] max-w-[94vw] flex-col overflow-hidden rounded-2xl bg-surface shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-5 py-4">
          <span className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-navy text-white font-mono text-[0.62rem] font-bold">
            t/h
          </span>
          <div className="flex-1">
            <div id="vst-fuel-title" className="text-[0.9rem] font-extrabold">
              Fuel Setup — SL consumption model
            </div>
            <div className="text-[0.66rem] text-muted">
              4 × Wärtsilä 16V46 · DG3 MGO-locked · DG4 open-loop scrubber
            </div>
          </div>
          <div className="flex gap-1.5">
            <button type="button" className={tabBtn(onDefaults)} onClick={() => setTab('defaults')}>
              Ship defaults
            </button>
            <button
              type="button"
              className={tabBtn(!onDefaults)}
              onClick={() => setTab('voyage')}
              disabled={!hasVoyage}
              title={hasVoyage ? undefined : 'Select a voyage first'}
            >
              This voyage
            </button>
          </div>
        </div>

        <div className="vt-scroll min-h-0 flex-1 overflow-auto px-5 py-4">
          {!canEditTab && (
            <div className="mb-3 rounded-lg border border-line bg-rail px-3 py-2 text-[0.68rem] text-muted">
              View only — {onDefaults ? 'enable Edit to change the ship defaults' : 'enable Edit (and unlock the voyage) to override for this voyage'}.
            </div>
          )}

          {/* Vessel scalars */}
          <div className="grid grid-cols-3 gap-3">
            {SCALARS.map(({ key, label: lbl, unit, step, hint }) => {
              const overridden = !onDefaults && key in draftOverrides;
              return (
                <div key={key}>
                  <label htmlFor={`fuel-${key}`} className={label}>
                    {lbl} · {unit}
                    {overridden && <OverriddenPill onReset={() => resetScalar(key)} disabled={!canEditTab} />}
                  </label>
                  <input
                    id={`fuel-${key}`}
                    type="number"
                    className={input}
                    value={view[key]}
                    min={scalarRange[key].min}
                    max={scalarRange[key].max}
                    step={step}
                    disabled={!canEditTab}
                    onChange={(e) => setScalar(key, e.target.value)}
                  />
                  <div className="mt-0.5 text-[0.58rem] text-faint">{hint}</div>
                </div>
              );
            })}
          </div>

          {/* DG cards */}
          <div className="mt-4">
            <div className={label}>
              Diesel generators
              {!onDefaults && draftOverrides.engines && (
                <OverriddenPill
                  onReset={() =>
                    setDraftOverrides((o) => {
                      const next = { ...o };
                      delete next.engines;
                      return next;
                    })
                  }
                  disabled={!canEditTab}
                />
              )}
            </div>
            <div className="grid grid-cols-4 gap-2.5">
              {engineConfigs.map((cfg) => {
                const st = view.engines.find((e) => e.id === cfg.id)!;
                return (
                  <div
                    key={cfg.id}
                    className="overflow-hidden rounded-lg border border-line bg-surface"
                    style={{ borderTop: `5px solid ${st.available ? FUEL_COLOR[st.fuel] : 'var(--color-line)'}` }}
                  >
                    <div className="flex items-center justify-between px-2.5 pt-2">
                      <span className="font-mono text-[0.72rem] font-bold text-ink">{cfg.label}</span>
                      <label className="inline-flex items-center gap-1 text-[0.6rem] text-muted">
                        <input
                          type="checkbox"
                          checked={st.available}
                          disabled={!canEditTab}
                          onChange={(e) => patchEngine(cfg.id, { available: e.target.checked })}
                        />
                        avail
                      </label>
                    </div>
                    <div className="px-2.5 pb-2 pt-1.5">
                      <select
                        aria-label={`${cfg.label} fuel`}
                        className={input}
                        value={st.fuel}
                        disabled={!canEditTab || !st.available}
                        onChange={(e) => patchEngine(cfg.id, { fuel: e.target.value as FuelType })}
                      >
                        {cfg.allowedFuels.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                      <div className="mt-1 min-h-[0.9rem] text-[0.6rem] leading-tight text-faint">
                        {cfg.mgoLocked ? 'No HFO bunker line' : cfg.openLoopOnly ? 'Open-loop scrubber only' : ''}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Port + St/By fallback */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-line p-3">
              <div className={label}>
                Port stay
                {!onDefaults && draftOverrides.port && (
                  <OverriddenPill onReset={() => resetGroup('port')} disabled={!canEditTab} />
                )}
              </div>
              <div className="grid grid-cols-1 gap-2">
                <div>
                  <label htmlFor="fuel-port-count" className={label}>
                    DGs
                  </label>
                  <input
                    id="fuel-port-count"
                    type="number"
                    className={input}
                    min={R.engineCount.min}
                    max={R.engineCount.max}
                    value={view.port.engineCount}
                    disabled={!canEditTab}
                    onChange={(e) => setGroup('port', { engineCount: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="mt-1.5 text-[0.58rem] text-faint">
                Hotel-load DGs + fixed MGO boiler 0.20 t/h while alongside (0.14 t/h at sea).
              </div>
            </div>

            <div className="rounded-lg border border-line p-3">
              <div className={label}>
                Tender stay
                {!onDefaults && draftOverrides.tender && (
                  <OverriddenPill onReset={() => resetGroup('tender')} disabled={!canEditTab} />
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="fuel-tender-kw" className={label}>
                    Total · kW
                  </label>
                  <input
                    id="fuel-tender-kw"
                    type="number"
                    className={input}
                    min={R.tenderPowerKW.min}
                    max={R.tenderPowerKW.max}
                    step={500}
                    value={view.tender.totalPowerKW}
                    disabled={!canEditTab}
                    onChange={(e) => setGroup('tender', { totalPowerKW: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label htmlFor="fuel-tender-count" className={label}>
                    DGs
                  </label>
                  <input
                    id="fuel-tender-count"
                    type="number"
                    className={input}
                    min={R.engineCount.min}
                    max={R.engineCount.max}
                    value={view.tender.engineCount}
                    disabled={!canEditTab}
                    onChange={(e) => setGroup('tender', { engineCount: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="mt-1.5 text-[0.58rem] text-faint">
                Type: Tender legs always run a 2nd DG — fixed total plant output while tendering
                (hotel + tender ops), + the port boiler.
              </div>
            </div>

            <div className="rounded-lg border border-line p-3">
              <div className={label}>
                St/By fallback (no distance data)
                {!onDefaults && draftOverrides.stby && (
                  <OverriddenPill onReset={() => resetGroup('stby')} disabled={!canEditTab} />
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="fuel-stby-mw" className={label}>
                    Power · MW
                  </label>
                  <input
                    id="fuel-stby-mw"
                    type="number"
                    className={input}
                    min={R.avgPowerMW.min}
                    max={R.avgPowerMW.max}
                    step={0.5}
                    value={view.stby.avgPowerMW}
                    disabled={!canEditTab}
                    onChange={(e) => setGroup('stby', { avgPowerMW: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label htmlFor="fuel-stby-count" className={label}>
                    DGs
                  </label>
                  <input
                    id="fuel-stby-count"
                    type="number"
                    className={input}
                    min={R.engineCount.min}
                    max={R.engineCount.max}
                    value={view.stby.engineCount}
                    disabled={!canEditTab}
                    onChange={(e) => setGroup('stby', { engineCount: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="mt-1.5 text-[0.58rem] text-faint">
                Used when a St/By phase has no distance and no per-leg MW override. Standby always
                runs the real closed-loop DG lineup (from the DG cards above) — this DG count is
                the minimum floor; the load pulls in more DGs as needed.
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-line px-5 py-3.5">
          <div className="flex-1 text-[0.6rem] text-faint" aria-live="polite">
            {unsavedHint && dirty ? (
              <span className="font-semibold text-amber">Unsaved changes — Save or Cancel.</span>
            ) : onDefaults ? (
              'Saved to this .json file — applies to every voyage in it unless overridden.'
            ) : (
              'Saved on the voyage. The exact settings used are snapshotted with each calculation.'
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-line bg-surface px-3.5 py-2 text-[0.78rem] font-semibold text-ink hover:bg-rail"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!canEditTab}
            className="rounded-lg bg-cyan px-4 py-2 text-[0.78rem] font-semibold text-white hover:brightness-95 disabled:opacity-50"
          >
            {onDefaults ? 'Save ship defaults' : 'Save voyage overrides'}
          </button>
        </div>
      </div>
    </div>
  );
}
