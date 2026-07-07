// The consumption orchestrator: maps a populated voyage (computeVoyage's leg
// views) onto the SL consumption engine and rolls up a per-leg / per-fuel
// picture. Pure — the React layer calls it and renders the snapshot.
//
// Phase model per port call:
//   Sea passage — prev port's FAW → this ETA, at the solved passage speed.
//                 openLoop (HH:MM on the leg) splits DG4 between HFO (open
//                 loop) and MGO (close loop) with a 2 h changeover blend.
//                 Plus the sailing boiler (MGO, 0.14 t/h) for every hour.
//   St/By arr   — ETA → Arr. Power: per-leg MW override > speed-derived
//                 (trial curve at the maneuvering speed + the thruster
//                 profile + hotel) > the fallback default (stby.avgPowerMW).
//                 Standby is modeled closed-loop; DGs needed beyond the
//                 configured St/By count run on MGO (CE 2026-07-07).
//   Port stay   — Arr → Dep. Hotel-load DGs + fixed MGO boiler (0.20 t/h).
//                 Tender legs instead run the tender plant assumption: a
//                 fixed total output on the tender DG count (CE 2026-07-07:
//                 11,000 kW on 2 DGs), + the same port boiler.
//   St/By dep   — Dep → FAW. Same power resolution as arrival.

import type { Leg, Voyage } from '../../types';
import { computeVoyage } from '../calculations';
import { hhmmToMin } from '../time';
import {
  computeConsumption,
  computePortConsumption,
  computeStbyConsumption,
  closeLoopEngines,
  SEA_BOILER_RATE_MT_PER_HR,
} from './consumption';
import { interpPropPower } from './interpolation';
import { blendLegFuel, splitLegHours } from './blend';
import type {
  CalculationResult,
  ConsumptionSettings,
  ConsumptionTotals,
  LegConsumption,
  StbyPhase,
  VoyageConsumption,
} from './types';

/** Leg fields the calculation depends on — the staleness signature basis. */
function legSignature(l: Leg) {
  return [
    l.type, l.mode, l.date, l.dist, l.speed, l.eta, l.arr, l.dep, l.faw, l.utc,
    l.openLoop, l.stbyArrDist, l.stbyDepDist, l.stbyArrPowerMW, l.stbyDepPowerMW,
  ];
}

/** Signature of everything the run depends on; compared against the live
 *  voyage to flag a stale snapshot. */
export function consumptionSignature(voyage: Voyage, settings: ConsumptionSettings): string {
  return JSON.stringify([settings, voyage.legs.map(legSignature)]);
}

/** The high-output thruster window at the end of every St/By phase. */
export const THRUSTER_HIGH_HOURS = 0.5;

/**
 * Average thruster/steering power over a St/By phase: idle thrusters for the
 * whole period except the final 30 minutes, which run at high output for
 * docking/undocking (CE-validated profile, 2026-07-07). Phases shorter than
 * 30 minutes are all high output.
 */
export function thrusterAvgKW(hours: number, settings: ConsumptionSettings): number {
  if (hours <= 0) return 0;
  const high = Math.min(hours, THRUSTER_HIGH_HOURS);
  const idle = hours - high;
  return (settings.thrusterIdleKW * idle + settings.thrusterHighKW * high) / hours;
}

function stbyPhase(
  minutes: number,
  overrideMW: string,
  stbySpeed: number | null,
  settings: ConsumptionSettings,
  warnings: string[],
  label: string
): StbyPhase {
  const hours = minutes / 60;
  let powerKW: number;
  let source: StbyPhase['source'];
  let speed: number | undefined;

  const ovr = Number(overrideMW);
  if (overrideMW !== '' && Number.isFinite(ovr) && ovr > 0) {
    powerKW = ovr * 1000;
    source = 'override';
  } else if (stbySpeed != null && stbySpeed > 0) {
    // Speed-derived: trial-curve propulsion at the maneuvering speed, plus the
    // thruster profile and hotel. No sea margin — that is an open-water
    // weather allowance, not a harbour one.
    powerKW = interpPropPower(stbySpeed) + thrusterAvgKW(hours, settings) + settings.hotelLoad;
    source = 'speed';
    speed = stbySpeed;
  } else {
    powerKW = settings.stby.avgPowerMW * 1000;
    source = 'default';
  }

  const r = computeStbyConsumption(powerKW, settings.stby.engineCount, settings.stby.fuelType, settings.sfocDet);
  if (r.insufficient) {
    warnings.push(
      `${label}: demand ${(powerKW / 1000).toFixed(1)} MW exceeds ` +
        `${settings.stby.engineCount + r.extraMgoEngines} DG capacity` +
        (r.extraMgoEngines > 0 ? ` (incl. ${r.extraMgoEngines} extra on MGO)` : ` at ${settings.stby.fuelType} limits`)
    );
  }
  return {
    hours,
    hfoMT: r.perFuel.hfo * hours,
    mgoMT: r.perFuel.mgo * hours,
    lsfoMT: r.perFuel.lsfo * hours,
    totalMT: r.rate * hours,
    insufficient: r.insufficient,
    source,
    speed,
    powerKW,
    engineCount: settings.stby.engineCount,
    fuelType: settings.stby.fuelType,
    extraMgoEngines: r.extraMgoEngines,
  };
}

export function computeVoyageConsumption(
  voyage: Voyage,
  settings: ConsumptionSettings,
  meta: { by: string; now?: Date } = { by: '' }
): VoyageConsumption {
  const { legViews } = computeVoyage(voyage);
  const warnings: string[] = [];
  const legs: LegConsumption[] = [];
  const totals: ConsumptionTotals = {
    hfoMT: 0, mgoMT: 0, lsfoMT: 0, totalMT: 0,
    seaHrs: 0, stbyHrs: 0, portHrs: 0, boilerMT: 0,
  };

  voyage.legs.forEach((leg, i) => {
    const view = legViews[i];
    if (!view.isPort) return; // Sea rows are date carriers — no phases of their own.

    const lc: LegConsumption = { legIndex: i, port: leg.port, date: leg.date };
    const label = leg.port || `leg ${i + 1}`;

    // ── Sea passage ──
    if (view.timeHrsNum != null && view.timeHrsNum > 0 && view.speedNum != null && view.speedNum > 0) {
      const hours = view.timeHrsNum;
      const speed = view.speedNum;
      const open: CalculationResult = computeConsumption(speed, settings.engines, settings);
      const olMin = hhmmToMin(leg.openLoop);
      const openLoopHours = olMin != null ? olMin / 60 : undefined;
      const splits = openLoopHours != null && openLoopHours < hours;
      const close: CalculationResult | undefined = splits
        ? computeConsumption(speed, closeLoopEngines(settings.engines), settings)
        : undefined;
      const fuel = blendLegFuel(open, close ?? open, hours, openLoopHours);
      if (open.insufficient || close?.insufficient) {
        warnings.push(`${label}: sea passage demand exceeds available DG capacity`);
      }
      // Sailing boiler: fixed MGO burn for every passage hour (CE 2026-07-07).
      const seaBoilerMT = SEA_BOILER_RATE_MT_PER_HR * hours;
      lc.sea = {
        hours,
        speed,
        openLoopHours,
        changeoverHours: splitLegHours(hours, openLoopHours).changeover,
        ...fuel,
        mgoMT: fuel.mgoMT + seaBoilerMT,
        totalMT: fuel.totalMT + seaBoilerMT,
        boilerMT: seaBoilerMT,
        insufficient: open.insufficient || !!close?.insufficient,
        openResult: open,
        closeResult: close,
      };
      totals.seaHrs += hours;
      totals.boilerMT += seaBoilerMT;
    } else {
      // Warn only for follow-on port calls — the first port has no passage.
      const hasPrevPort = voyage.legs.some(
        (l, j) => j < i && (l.type === 'Port' || l.type === 'Tender')
      );
      if (hasPrevPort) {
        warnings.push(`${label}: passage not computable (missing times/speed) — sea burn skipped`);
      }
    }

    // ── St/By phases ──
    if (view.stbyArrMin != null && view.stbyArrMin > 0) {
      lc.stbyArr = stbyPhase(
        view.stbyArrMin, leg.stbyArrPowerMW, view.stbyArrSpeedNum, settings, warnings,
        `${label} St/By arrival`
      );
      totals.stbyHrs += lc.stbyArr.hours;
    }
    if (view.stbyDepMin != null && view.stbyDepMin > 0) {
      lc.stbyDep = stbyPhase(
        view.stbyDepMin, leg.stbyDepPowerMW, view.stbyDepSpeedNum, settings, warnings,
        `${label} St/By departure`
      );
      totals.stbyHrs += lc.stbyDep.hours;
    }

    // ── Port stay ──
    if (view.portMinNum != null && view.portMinNum > 0) {
      const hours = view.portMinNum / 60;
      // Tendering always runs the tender plant (2nd DG online, fixed total
      // output) instead of the plain hotel load.
      const isTender = leg.type === 'Tender';
      const p = isTender
        ? computePortConsumption(
            settings.tender.totalPowerKW, settings.tender.engineCount, settings.tender.fuelType, settings.sfocDet, hours
          )
        : computePortConsumption(
            settings.hotelLoad, settings.port.engineCount, settings.port.fuelType, settings.sfocDet, hours
          );
      if (p.insufficient) {
        warnings.push(
          isTender
            ? `${label}: tender load exceeds ${settings.tender.engineCount} DG capacity`
            : `${label}: hotel load exceeds ${settings.port.engineCount} DG port capacity`
        );
      }
      lc.portStay = {
        hours,
        hfoMT: p.perFuelMT.hfo,
        mgoMT: p.perFuelMT.mgo,
        lsfoMT: p.perFuelMT.lsfo,
        totalMT: p.totalMT,
        insufficient: p.insufficient,
        boilerMT: p.boilerMT,
        dgRate: p.dgRate,
        ...(isTender ? { tender: true } : null),
      };
      totals.portHrs += hours;
      totals.boilerMT += p.boilerMT;
    }

    for (const phase of [lc.sea, lc.stbyArr, lc.stbyDep, lc.portStay]) {
      if (!phase) continue;
      totals.hfoMT += phase.hfoMT;
      totals.mgoMT += phase.mgoMT;
      totals.lsfoMT += phase.lsfoMT;
      totals.totalMT += phase.totalMT;
    }

    legs.push(lc);
  });

  return {
    computedAt: (meta.now ?? new Date()).toISOString(),
    by: meta.by,
    settings,
    inputSignature: consumptionSignature(voyage, settings),
    legs,
    totals,
    warnings,
  };
}
