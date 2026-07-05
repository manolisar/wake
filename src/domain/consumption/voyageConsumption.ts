// The consumption orchestrator: maps a populated voyage (computeVoyage's leg
// views) onto the SL consumption engine and rolls up a per-leg / per-fuel
// picture. Pure — the React layer calls it and renders the snapshot.
//
// Phase model per port call:
//   Sea passage — prev port's FAW → this ETA, at the solved passage speed.
//                 openLoop (HH:MM on the leg) splits DG4 between HFO (open
//                 loop) and MGO (close loop) with a 2 h changeover blend.
//   St/By arr   — ETA → Arr. Power: per-leg MW override > speed-derived
//                 (trial curve at the maneuvering speed + maneuvering aux +
//                 hotel) > the fallback default (stby.avgPowerMW).
//   Port stay   — Arr → Dep. Hotel-load DGs + fixed MGO boiler.
//   St/By dep   — Dep → FAW. Same power resolution as arrival.

import type { Leg, Voyage } from '../../types';
import { computeVoyage } from '../calculations';
import { hhmmToMin } from '../time';
import {
  computeConsumption,
  computePortConsumption,
  computeStaticConsumption,
  closeLoopEngines,
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
    // maneuvering-gear allowance and hotel. No sea margin — that is an
    // open-water weather allowance, not a harbour one.
    powerKW = interpPropPower(stbySpeed) + settings.maneuverAuxKW + settings.hotelLoad;
    source = 'speed';
    speed = stbySpeed;
  } else {
    powerKW = settings.stby.avgPowerMW * 1000;
    source = 'default';
  }

  const r = computeStaticConsumption(powerKW, settings.stby.engineCount, settings.stby.fuelType, settings.sfocDet);
  if (r.insufficient) {
    warnings.push(
      `${label}: demand ${(powerKW / 1000).toFixed(1)} MW exceeds ` +
        `${settings.stby.engineCount} DG capacity at ${settings.stby.fuelType} limits`
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
      lc.sea = {
        hours,
        speed,
        openLoopHours,
        changeoverHours: splitLegHours(hours, openLoopHours).changeover,
        ...fuel,
        insufficient: open.insufficient || !!close?.insufficient,
        openResult: open,
        closeResult: close,
      };
      totals.seaHrs += hours;
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
      const p = computePortConsumption(
        settings.hotelLoad, settings.port.engineCount, settings.port.fuelType, settings.sfocDet, hours
      );
      if (p.insufficient) {
        warnings.push(`${label}: hotel load exceeds ${settings.port.engineCount} DG port capacity`);
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
