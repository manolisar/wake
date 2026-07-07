// Engine configuration + default settings, ported from
// ~/Projects/voyage-planner/src/data/engineDefaults.ts, extended with the
// combined app's full default parameter set.

import type { ConsumptionSettings, EngineConfig, FuelType } from './types';

export const engineConfigs: EngineConfig[] = [
  { id: 1, label: 'DG1', mgoLocked: false, allowedFuels: ['HFO', 'MGO', 'LSFO'] },
  { id: 2, label: 'DG2', mgoLocked: false, allowedFuels: ['HFO', 'MGO', 'LSFO'] },
  { id: 3, label: 'DG3', mgoLocked: true, allowedFuels: ['MGO', 'LSFO'] },
  { id: 4, label: 'DG4', mgoLocked: false, allowedFuels: ['HFO', 'MGO', 'LSFO'], openLoopOnly: true },
];

export const LOAD_LIMITS: Record<FuelType, number> = {
  HFO: 0.8,
  MGO: 0.7,
  LSFO: 0.8,
};

export const FUEL_PRIORITY: Record<FuelType, number> = {
  HFO: 0,
  LSFO: 1,
  MGO: 2,
};

/** Ship-level defaults — the final fallback when a bundle carries none. */
export const DEFAULT_CONSUMPTION_SETTINGS: ConsumptionSettings = {
  hotelLoad: 8000, // kW
  seaMargin: 0, // %
  sfocDet: 2, // %
  propAux: 1500, // kW
  engines: [
    { id: 1, available: true, fuel: 'HFO' },
    { id: 2, available: true, fuel: 'HFO' },
    { id: 3, available: true, fuel: 'MGO' },
    { id: 4, available: true, fuel: 'HFO' },
  ],
  port: { engineCount: 1, fuelType: 'MGO' },
  tender: { totalPowerKW: 11000, engineCount: 2, fuelType: 'MGO' }, // CE 2026-07-07
  stby: { avgPowerMW: 10, engineCount: 2, fuelType: 'MGO' },
  thrusterIdleKW: 1080, // 3 × 360 kW, CE-validated 2026-07-07
  thrusterHighKW: 9000, // 3 × 3,000 kW, final 30 min of St/By
  portBoilerRate: 0.19, // t/h MGO, CE-validated 2026-07-07 (was 0.20)
  seaBoilerRate: 0.14, // t/h MGO, CE-validated 2026-07-07
  inPortFuel: 'MGO',
};

/** Clamp ranges for every numeric parameter (UI + normalizer share these). */
export const SETTING_RANGES = {
  hotelLoad: { min: 0, max: 20000 },
  seaMargin: { min: -10, max: 20 },
  sfocDet: { min: 0, max: 5 },
  propAux: { min: 0, max: 5000 },
  thrusterIdleKW: { min: 0, max: 8000 },
  thrusterHighKW: { min: 0, max: 20000 },
  portBoilerRate: { min: 0, max: 1 },
  seaBoilerRate: { min: 0, max: 1 },
  tenderPowerKW: { min: 0, max: 40000 },
  engineCount: { min: 1, max: 4 },
  avgPowerMW: { min: 0, max: 50 },
} as const;
