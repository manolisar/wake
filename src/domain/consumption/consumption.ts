// The consumption engine, ported verbatim from
// ~/Projects/voyage-planner/src/engine/consumption.ts.
//
// speed + engines + settings → CalculationResult (per-fuel t/h rates, per-DG
// loads, overload flags). Plus port/standby burns via the shared plant core
// and the DG4 close-loop / harbour-fuel transforms.

import { NOMINAL_KW } from './trialData';
import { engineConfigs, REF_LHV_MJ_KG, FUEL_LHV_MJ_KG } from './engineDefaults';
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

export interface PortConsumption {
  /** DG breakdown from the shared plant core (harbour lineup). */
  result: CalculationResult;
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
    const sfoc = interpSFOC(lf) * (REF_LHV_MJ_KG / FUEL_LHV_MJ_KG[e.fuel]) * (1 + sfocDet / 100);
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
      const sfoc = interpSFOC(lf) * (REF_LHV_MJ_KG / FUEL_LHV_MJ_KG[eng.fuel]) * (1 + sfocDet / 100);
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

/**
 * Port consumption = DG burn (via the shared plant core, run on the harbour
 * lineup — every DG forced to `inPortFuel` where legal) + an MGO boiler burn
 * at the given rate, both applied for the same `hours`. Single source of
 * truth so the port box, the voyage summary, and the export all roll up
 * boiler identically.
 */
export function computePortConsumption(
  demandKW: number,
  engines: EngineState[],
  inPortFuel: FuelType,
  opts: { sfocDet: number; minEngines: number; boilerRate: number; hours: number }
): PortConsumption {
  const { sfocDet, minEngines, boilerRate, hours } = opts;
  const dg = computePlantConsumption(demandKW, harbourEngines(engines, inPortFuel), sfocDet, minEngines);
  const boilerMT = boilerRate * hours;
  const perFuelMT = {
    hfo: dg.hfoRate * hours,
    mgo: dg.mgoRate * hours + boilerMT,
    lsfo: dg.lsfoRate * hours,
  };
  return {
    result: dg,
    dgRate: dg.totalRate,
    boilerRate,
    boilerMT,
    perFuelMT,
    totalMT: perFuelMT.hfo + perFuelMT.mgo + perFuelMT.lsfo,
    insufficient: dg.insufficient,
  };
}
