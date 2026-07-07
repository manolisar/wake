// The consumption engine, ported verbatim from
// ~/Projects/voyage-planner/src/engine/consumption.ts.
//
// speed + engines + settings → CalculationResult (per-fuel t/h rates, per-DG
// loads, overload flags). Plus static (port/standby) burns and the DG4
// close-loop transform.

import { NOMINAL_KW } from './trialData';
import { LOAD_LIMITS, engineConfigs } from './engineDefaults';
import { interpPropPower, interpSFOC } from './interpolation';
import { getEngineWithLimits, selectEngines, distributeLoad } from './loadSharing';
import type { EngineState, EngineResult, CalculationResult, FuelType, VesselSettings } from './types';

const OPEN_LOOP_ONLY_IDS = new Set(
  engineConfigs.filter((c) => c.openLoopOnly).map((c) => c.id)
);

/**
 * Transform engine states for close-loop waters: any open-loop-scrubber-only DG
 * (DG4) running HFO must drop to MGO, since its scrubber can't operate. Engines
 * already on a compliant fuel (LSFO/MGO) and all other DGs are left unchanged.
 */
export function closeLoopEngines(engines: EngineState[]): EngineState[] {
  return engines.map((e) =>
    OPEN_LOOP_ONLY_IDS.has(e.id) && e.fuel === 'HFO' ? { ...e, fuel: 'MGO' } : e
  );
}

/**
 * In-port transform: force every DG to the compliant in-port fuel (default MGO),
 * so a shore stay burns the harbour fuel regardless of the sea lineup. Respects
 * each DG's bunker legality — a DG that can't take the requested fuel (DG3 has no
 * HFO line) keeps the first fuel it legally can, preferring the requested one.
 */
export function harbourEngines(engines: EngineState[], inPortFuel: FuelType): EngineState[] {
  return engines.map((e) => {
    const cfg = engineConfigs.find((c) => c.id === e.id);
    const fuel = cfg && cfg.allowedFuels.includes(inPortFuel) ? inPortFuel : cfg?.allowedFuels[0] ?? e.fuel;
    return { ...e, fuel };
  });
}

export interface StaticConsumptionResult {
  rate: number;
  perFuel: { hfo: number; mgo: number; lsfo: number };
  availablePowerKW: number;
  insufficient: boolean;
}

/** Port boiler burns MGO at a fixed rate for every hour the vessel is in port.
 *  CE-validated 2026-07-07 (diverges from the reference planner's 0.18). */
export const PORT_BOILER_RATE_MT_PER_HR = 0.2;

/** Sailing boiler burns MGO at a fixed rate for every sea-passage hour.
 *  CE-validated 2026-07-07 (the reference planner has no sailing boiler). */
export const SEA_BOILER_RATE_MT_PER_HR = 0.14;

export interface PortConsumption {
  /** DG (hotel load) rate, t/hr — boiler excluded */
  dgRate: number;
  /** Boiler rate, t/hr (MGO), constant while in port */
  boilerRate: number;
  /** Boiler fuel for the given hours, MT (MGO) */
  boilerMT: number;
  /** Per-fuel totals for the given hours, MT — boiler folded into MGO */
  perFuelMT: { hfo: number; mgo: number; lsfo: number };
  /** Total fuel for the given hours, MT (DG + boiler) */
  totalMT: number;
  insufficient: boolean;
  availablePowerKW: number;
}

/**
 * The plant core: given a total power demand, a DG lineup, SFOC deterioration,
 * and a minimum-DG floor, select engines (fuel-priority), load-share, and burn
 * fuel. The single place selection + SFOC live. Pure.
 */
export function computePlantConsumption(
  totalKW: number,
  engines: EngineState[],
  sfocDet: number,
  minEngines: number
): CalculationResult {
  const allEngines = getEngineWithLimits(engines);
  const { selected: runningEngines, allAvailable, insufficient } = selectEngines(
    allEngines,
    totalKW,
    minEngines
  );
  const numRunning = runningEngines.length;
  const runningIds = new Set(runningEngines.map((e) => e.id));
  const engineLoads = distributeLoad(runningEngines, totalKW);

  let hfoRate = 0, mgoRate = 0, lsfoRate = 0;
  runningEngines.forEach((e) => {
    const kw = engineLoads.get(e.id) || 0;
    const lf = kw / NOMINAL_KW;
    const sfoc = interpSFOC(lf) * (1 + sfocDet / 100);
    const cons = (sfoc * kw) / 1e6;
    if (e.fuel === 'HFO') hfoRate += cons;
    else if (e.fuel === 'LSFO') lsfoRate += cons;
    else mgoRate += cons;
  });

  const engineResults: EngineResult[] = allEngines.map((eng) => {
    if (!eng.available) {
      return {
        id: eng.id, status: 'OFFLINE' as const, loadKW: 0, loadFraction: 0,
        loadLimit: eng.loadLimit, overloaded: false, fuelConsumption: 0, fuel: eng.fuel,
      };
    }
    if (runningIds.has(eng.id)) {
      const kw = engineLoads.get(eng.id) || 0;
      const lf = kw / NOMINAL_KW;
      const sfoc = interpSFOC(lf) * (1 + sfocDet / 100);
      return {
        id: eng.id, status: 'RUNNING' as const, loadKW: kw, loadFraction: lf,
        loadLimit: eng.loadLimit, overloaded: lf > eng.loadLimit,
        fuelConsumption: (sfoc * kw) / 1e6, fuel: eng.fuel,
      };
    }
    return {
      id: eng.id, status: 'STANDBY' as const, loadKW: 0, loadFraction: 0,
      loadLimit: eng.loadLimit, overloaded: false, fuelConsumption: 0, fuel: eng.fuel,
    };
  });

  const avgLoadPercent = numRunning > 0 ? (totalKW / (numRunning * NOMINAL_KW)) * 100 : 0;

  return {
    propPowerKW: 0, // set by the sea wrapper; irrelevant for static phases
    totalPowerKW: totalKW,
    avgLoadPercent,
    engineResults,
    hfoRate, mgoRate, lsfoRate,
    totalRate: hfoRate + mgoRate + lsfoRate,
    insufficient,
    numRunning,
    numAvailable: allAvailable.length,
    hfoRunning: runningEngines.filter((e) => e.fuel === 'HFO').length,
    mgoRunning: runningEngines.filter((e) => e.fuel === 'MGO').length,
    lsfoRunning: runningEngines.filter((e) => e.fuel === 'LSFO').length,
  };
}

export function computeConsumption(
  speed: number,
  engines: EngineState[],
  settings: VesselSettings
): CalculationResult {
  const propKW = interpPropPower(speed);
  const propWithMargin = propKW * (1 + settings.seaMargin / 100);
  const propAux = speed > 0 ? settings.propAux : 0;
  const totalKW = propWithMargin + propAux + settings.hotelLoad;
  const r = computePlantConsumption(totalKW, engines, settings.sfocDet, speed > 0 ? 2 : 1);
  return { ...r, propPowerKW: propWithMargin + propAux };
}

/** Compute fuel consumption for port/standby (no speed, custom power) */
export function computeStaticConsumption(
  totalPowerKW: number,
  engineCount: number,
  fuelType: FuelType,
  sfocDet: number
): StaticConsumptionResult {
  if (engineCount <= 0 || totalPowerKW <= 0) {
    return {
      rate: 0,
      perFuel: { hfo: 0, mgo: 0, lsfo: 0 },
      availablePowerKW: 0,
      insufficient: false,
    };
  }

  const loadLimit = LOAD_LIMITS[fuelType];
  const maxKW = NOMINAL_KW * loadLimit;
  const availablePowerKW = maxKW * engineCount;
  const perEngineKW = Math.min(totalPowerKW / engineCount, maxKW);
  const lf = perEngineKW / NOMINAL_KW;
  const baseSFOC = interpSFOC(lf);
  const sfoc = baseSFOC * (1 + sfocDet / 100);
  const perEngineCons = (sfoc * perEngineKW) / 1e6;
  const totalRate = perEngineCons * engineCount;

  const perFuel = { hfo: 0, mgo: 0, lsfo: 0 };
  if (fuelType === 'HFO') perFuel.hfo = totalRate;
  else if (fuelType === 'MGO') perFuel.mgo = totalRate;
  else perFuel.lsfo = totalRate;

  return {
    rate: totalRate,
    perFuel,
    availablePowerKW,
    insufficient: totalPowerKW > availablePowerKW,
  };
}

/**
 * St/By plant burn with the closed-loop standby assumptions (CE 2026-07-07):
 * standby runs closed-loop at all times, the configured St/By DGs burn the
 * configured fuel, and whenever the load needs more DGs than configured each
 * extra engine runs on MGO (up to the 4 installed). Within the configured
 * capacity this is identical to computeStaticConsumption.
 */
export interface StbyConsumptionResult extends StaticConsumptionResult {
  /** DGs brought online on MGO beyond the configured count. */
  extraMgoEngines: number;
}

export function computeStbyConsumption(
  totalPowerKW: number,
  engineCount: number,
  fuelType: FuelType,
  sfocDet: number
): StbyConsumptionResult {
  const base = computeStaticConsumption(totalPowerKW, engineCount, fuelType, sfocDet);
  if (!base.insufficient || engineCount <= 0) return { ...base, extraMgoEngines: 0 };

  const baseMaxKW = NOMINAL_KW * LOAD_LIMITS[fuelType];
  const mgoMaxKW = NOMINAL_KW * LOAD_LIMITS.MGO;
  let extraMgoEngines = 0;
  let capacity = engineCount * baseMaxKW;
  while (engineCount + extraMgoEngines < 4 && capacity < totalPowerKW) {
    extraMgoEngines++;
    capacity += mgoMaxKW;
  }
  if (extraMgoEngines === 0) return { ...base, extraMgoEngines: 0 };

  // Equal-share the load across the mixed set (same waterfall as at sea).
  const units = [
    ...Array.from({ length: engineCount }, (_, i) => ({
      id: i + 1, available: true, fuel: fuelType, loadLimit: LOAD_LIMITS[fuelType], maxKW: baseMaxKW,
    })),
    ...Array.from({ length: extraMgoEngines }, (_, i) => ({
      id: engineCount + i + 1, available: true, fuel: 'MGO' as FuelType, loadLimit: LOAD_LIMITS.MGO, maxKW: mgoMaxKW,
    })),
  ];
  const loads = distributeLoad(units, Math.min(totalPowerKW, capacity));
  const perFuel = { hfo: 0, mgo: 0, lsfo: 0 };
  units.forEach((u) => {
    const kw = loads.get(u.id) || 0;
    if (kw <= 0) return;
    const sfoc = interpSFOC(kw / NOMINAL_KW) * (1 + sfocDet / 100);
    const cons = (sfoc * kw) / 1e6;
    if (u.fuel === 'HFO') perFuel.hfo += cons;
    else if (u.fuel === 'LSFO') perFuel.lsfo += cons;
    else perFuel.mgo += cons;
  });
  return {
    rate: perFuel.hfo + perFuel.mgo + perFuel.lsfo,
    perFuel,
    availablePowerKW: capacity,
    insufficient: totalPowerKW > capacity,
    extraMgoEngines,
  };
}

/**
 * Port consumption = DG hotel-load burn + a fixed MGO boiler burn (0.20 t/hr),
 * both applied for the same `hours`. Single source of truth so the port box,
 * the voyage summary, and the export all roll up boiler identically.
 */
export function computePortConsumption(
  hotelLoadKW: number,
  engineCount: number,
  fuelType: FuelType,
  sfocDet: number,
  hours: number
): PortConsumption {
  const dg = computeStaticConsumption(hotelLoadKW, engineCount, fuelType, sfocDet);
  const boilerMT = PORT_BOILER_RATE_MT_PER_HR * hours;
  const perFuelMT = {
    hfo: dg.perFuel.hfo * hours,
    mgo: dg.perFuel.mgo * hours + boilerMT,
    lsfo: dg.perFuel.lsfo * hours,
  };
  return {
    dgRate: dg.rate,
    boilerRate: PORT_BOILER_RATE_MT_PER_HR,
    boilerMT,
    perFuelMT,
    totalMT: perFuelMT.hfo + perFuelMT.mgo + perFuelMT.lsfo,
    insufficient: dg.insufficient,
    availablePowerKW: dg.availablePowerKW,
  };
}
