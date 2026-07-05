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
  stby: { avgPowerMW: 10, engineCount: 2, fuelType: 'MGO' },
  maneuverAuxKW: 2000,
};

/** Clamp ranges for every numeric parameter (UI + normalizer share these). */
export const SETTING_RANGES = {
  hotelLoad: { min: 0, max: 20000 },
  seaMargin: { min: -10, max: 20 },
  sfocDet: { min: 0, max: 5 },
  propAux: { min: 0, max: 5000 },
  maneuverAuxKW: { min: 0, max: 8000 },
  engineCount: { min: 1, max: 4 },
  avgPowerMW: { min: 0, max: 50 },
} as const;
