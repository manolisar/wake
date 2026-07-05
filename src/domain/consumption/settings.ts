// Settings resolution (ship defaults + per-voyage overrides → the snapshot a
// calculation runs with) and tolerant parsing for bundle round-trips.

import { DEFAULT_CONSUMPTION_SETTINGS, SETTING_RANGES, engineConfigs } from './engineDefaults';
import type {
  ConsumptionOverrides,
  ConsumptionSettings,
  EngineState,
  FuelType,
} from './types';

const FUELS: FuelType[] = ['HFO', 'MGO', 'LSFO'];

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function fuel(v: unknown, fallback: FuelType): FuelType {
  return FUELS.includes(v as FuelType) ? (v as FuelType) : fallback;
}

/** Clamp a fuel to what the DG's bunker connections actually allow (DG3 has
 *  no HFO line). Falls back to the config's first allowed fuel. */
function legalFuel(id: number, f: FuelType): FuelType {
  const cfg = engineConfigs.find((c) => c.id === id);
  if (!cfg) return f;
  return cfg.allowedFuels.includes(f) ? f : cfg.allowedFuels[0];
}

function normalizeEngines(v: unknown, fallback: EngineState[]): EngineState[] {
  const src = Array.isArray(v) ? v : [];
  // Always shape to the 4 configured DGs, in id order.
  return engineConfigs.map((cfg) => {
    const raw = src.find((e) => e && typeof e === 'object' && (e as EngineState).id === cfg.id);
    const fb = fallback.find((e) => e.id === cfg.id)!;
    if (!raw) return { ...fb, fuel: legalFuel(cfg.id, fb.fuel) };
    const r = raw as Record<string, unknown>;
    return {
      id: cfg.id,
      available: typeof r.available === 'boolean' ? r.available : fb.available,
      fuel: legalFuel(cfg.id, fuel(r.fuel, fb.fuel)),
    };
  });
}

/**
 * Coerce an unknown blob (hand-edited file, older schema) into a fully valid
 * ConsumptionSettings, falling back per-field to `base` (defaults). Never throws.
 */
export function normalizeSettings(
  v: unknown,
  base: ConsumptionSettings = DEFAULT_CONSUMPTION_SETTINGS
): ConsumptionSettings {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const port = (o.port && typeof o.port === 'object' ? o.port : {}) as Record<string, unknown>;
  const stby = (o.stby && typeof o.stby === 'object' ? o.stby : {}) as Record<string, unknown>;
  const R = SETTING_RANGES;
  return {
    hotelLoad: clamp(num(o.hotelLoad, base.hotelLoad), R.hotelLoad.min, R.hotelLoad.max),
    seaMargin: clamp(num(o.seaMargin, base.seaMargin), R.seaMargin.min, R.seaMargin.max),
    sfocDet: clamp(num(o.sfocDet, base.sfocDet), R.sfocDet.min, R.sfocDet.max),
    propAux: clamp(num(o.propAux, base.propAux), R.propAux.min, R.propAux.max),
    maneuverAuxKW: clamp(
      num(o.maneuverAuxKW, base.maneuverAuxKW),
      R.maneuverAuxKW.min,
      R.maneuverAuxKW.max
    ),
    engines: normalizeEngines(o.engines, base.engines),
    port: {
      engineCount: clamp(
        Math.round(num(port.engineCount, base.port.engineCount)),
        R.engineCount.min,
        R.engineCount.max
      ),
      fuelType: fuel(port.fuelType, base.port.fuelType),
    },
    stby: {
      avgPowerMW: clamp(num(stby.avgPowerMW, base.stby.avgPowerMW), R.avgPowerMW.min, R.avgPowerMW.max),
      engineCount: clamp(
        Math.round(num(stby.engineCount, base.stby.engineCount)),
        R.engineCount.min,
        R.engineCount.max
      ),
      fuelType: fuel(stby.fuelType, base.stby.fuelType),
    },
  };
}

/**
 * Merge per-voyage overrides onto the ship defaults. Overrides win field-by-
 * field; `engines` overrides as a whole array (the UI edits all 4 DG cards).
 * The result is re-normalized so an override can never smuggle in an illegal
 * value (e.g. DG3 on HFO).
 */
export function resolveSettings(
  defaults: ConsumptionSettings,
  overrides: ConsumptionOverrides | undefined
): ConsumptionSettings {
  const base = normalizeSettings(defaults);
  if (!overrides) return base;
  const merged = {
    ...base,
    ...('hotelLoad' in overrides ? { hotelLoad: overrides.hotelLoad } : null),
    ...('seaMargin' in overrides ? { seaMargin: overrides.seaMargin } : null),
    ...('sfocDet' in overrides ? { sfocDet: overrides.sfocDet } : null),
    ...('propAux' in overrides ? { propAux: overrides.propAux } : null),
    ...('maneuverAuxKW' in overrides ? { maneuverAuxKW: overrides.maneuverAuxKW } : null),
    ...(overrides.engines ? { engines: overrides.engines } : null),
    port: { ...base.port, ...overrides.port },
    stby: { ...base.stby, ...overrides.stby },
  };
  return normalizeSettings(merged, base);
}

/** Tolerant parse of a persisted overrides blob. Unknown/invalid keys drop. */
export function normalizeOverrides(v: unknown): ConsumptionOverrides | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const out: ConsumptionOverrides = {};
  const R = SETTING_RANGES;
  const numIf = (key: 'hotelLoad' | 'seaMargin' | 'sfocDet' | 'propAux' | 'maneuverAuxKW', r: { min: number; max: number }) => {
    if (o[key] != null && Number.isFinite(Number(o[key]))) out[key] = clamp(Number(o[key]), r.min, r.max);
  };
  numIf('hotelLoad', R.hotelLoad);
  numIf('seaMargin', R.seaMargin);
  numIf('sfocDet', R.sfocDet);
  numIf('propAux', R.propAux);
  numIf('maneuverAuxKW', R.maneuverAuxKW);
  if (Array.isArray(o.engines)) {
    out.engines = normalizeEngines(o.engines, DEFAULT_CONSUMPTION_SETTINGS.engines);
  }
  if (o.port && typeof o.port === 'object') {
    const p = o.port as Record<string, unknown>;
    const port: ConsumptionOverrides['port'] = {};
    if (p.engineCount != null && Number.isFinite(Number(p.engineCount)))
      port.engineCount = clamp(Math.round(Number(p.engineCount)), R.engineCount.min, R.engineCount.max);
    if (FUELS.includes(p.fuelType as FuelType)) port.fuelType = p.fuelType as FuelType;
    if (Object.keys(port).length) out.port = port;
  }
  if (o.stby && typeof o.stby === 'object') {
    const s = o.stby as Record<string, unknown>;
    const stby: ConsumptionOverrides['stby'] = {};
    if (s.avgPowerMW != null && Number.isFinite(Number(s.avgPowerMW)))
      stby.avgPowerMW = clamp(Number(s.avgPowerMW), R.avgPowerMW.min, R.avgPowerMW.max);
    if (s.engineCount != null && Number.isFinite(Number(s.engineCount)))
      stby.engineCount = clamp(Math.round(Number(s.engineCount)), R.engineCount.min, R.engineCount.max);
    if (FUELS.includes(s.fuelType as FuelType)) stby.fuelType = s.fuelType as FuelType;
    if (Object.keys(stby).length) out.stby = stby;
  }
  return Object.keys(out).length ? out : undefined;
}
