// DG selection + load distribution, ported verbatim from
// ~/Projects/voyage-planner/src/engine/loadSharing.ts.

import { NOMINAL_KW } from './trialData';
import { LOAD_LIMITS, FUEL_PRIORITY } from './engineDefaults';
import type { EngineState } from './types';

export interface EngineWithLimits extends EngineState {
  loadLimit: number;
  maxKW: number;
}

export function getEngineWithLimits(engines: EngineState[]): EngineWithLimits[] {
  return engines.map((e) => {
    const loadLimit = LOAD_LIMITS[e.fuel];
    return { ...e, loadLimit, maxKW: NOMINAL_KW * loadLimit };
  });
}

export function selectEngines(
  allEngines: EngineWithLimits[],
  totalKW: number,
  minEngines: number
): { selected: EngineWithLimits[]; allAvailable: EngineWithLimits[]; insufficient: boolean } {
  const sorted = allEngines
    .filter((e) => e.available)
    .sort((a, b) => {
      if (FUEL_PRIORITY[a.fuel] !== FUEL_PRIORITY[b.fuel])
        return FUEL_PRIORITY[a.fuel] - FUEL_PRIORITY[b.fuel];
      return a.id - b.id;
    });

  const selected: EngineWithLimits[] = [];
  let capacity = 0;

  for (const eng of sorted) {
    selected.push(eng);
    capacity += eng.maxKW;
    if (capacity >= totalKW && selected.length >= minEngines) break;
  }

  return {
    selected,
    allAvailable: sorted,
    insufficient: capacity < totalKW && selected.length === sorted.length,
  };
}

export function distributeLoad(
  runningEngines: EngineWithLimits[],
  totalKW: number
): Map<number, number> {
  const engineLoads = new Map<number, number>();
  if (runningEngines.length === 0) return engineLoads;

  for (const eng of runningEngines) engineLoads.set(eng.id, 0);
  let remaining = totalKW;
  let uncapped = [...runningEngines];

  while (remaining > 1e-6 && uncapped.length > 0) {
    const share = remaining / uncapped.length;
    const newUncapped: EngineWithLimits[] = [];
    let excess = 0;

    for (const eng of uncapped) {
      const current = engineLoads.get(eng.id)!;
      const wanted = current + share;
      if (wanted > eng.maxKW) {
        engineLoads.set(eng.id, eng.maxKW);
        excess += wanted - eng.maxKW;
      } else {
        engineLoads.set(eng.id, wanted);
        newUncapped.push(eng);
      }
    }
    remaining = excess;
    if (newUncapped.length === uncapped.length) break;
    uncapped = newUncapped;
  }

  return engineLoads;
}
