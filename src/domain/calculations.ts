// The speed/time solver — ported verbatim from the design artifact's
// DCLogic.compute() (design lines 394–498). Kept as a pure function over a
// Voyage so it is unit-testable and the React layer only renders the result.
//
// Each port leg solves over its passage Distance against the time since the
// PREVIOUS port's FAW (Full Away) instant. Timestamps convert to absolute UTC
// minutes via each leg's UTC offset, so timezone changes across a crossing are
// exact.
//   - SPD mode: operator enters the times → Speed (kn) is computed.
//   - TIME mode: operator enters a target Speed → ETA is computed.
import type { Leg, Voyage } from '../types';
import { dayNum, hhmmToMin, minToHHMM, fmtHM, instUTC } from './time';

export type SpeedBand = 'hi' | 'lo' | 'ok';

/** Per-leg display values derived from the solve (no event handlers — the
 *  component wires those). Raw editable values are read from the Leg itself. */
export interface LegView {
  isPort: boolean;
  isSea: boolean;
  timeDisplay: string;
  timeComputed: boolean;
  speedComputed: boolean; // port leg in SPD mode → show computed badge
  speedInput: boolean; // port leg in TIME mode → show speed input
  speedDisplay: string | null; // computed speed, 1dp
  speedBand: SpeedBand | null;
  etaComputed: boolean; // TIME mode → show computed ETA
  etaInput: boolean; // SPD mode → ETA is an input
  etaDisplay: string; // computed ETA 'HH:MM' or '—'
  // St/By split: arrival (Arr−ETA, pilot→berth) and departure (FAW−Dep, berth→pilot).
  // Each carries a manual distance (on the Leg) and a computed maneuvering speed.
  stbyArrTime: string; // 'H:MM' or '—'
  stbyArrSpeed: string | null; // computed kn (dist ÷ arrival time) or null
  stbyDepTime: string;
  stbyDepSpeed: string | null;
  portDisplay: string;
  daylightDisplay: string;
  hasDaylight: boolean;
  // Numeric mirrors of the displays above, for downstream math (consumption
  // orchestration). null = not computable for this leg.
  timeHrsNum: number | null; // passage hours (prev FAW → this arrival)
  speedNum: number | null; // passage speed, kn
  stbyArrMin: number | null; // arrival St/By minutes (Arr − ETA)
  stbyDepMin: number | null; // departure St/By minutes (FAW − Dep)
  portMinNum: number | null; // port stay minutes (Dep − Arr)
  stbyArrSpeedNum: number | null; // maneuvering speed, kn (dist ÷ time)
  stbyDepSpeedNum: number | null;
  /** True when this row's port time spans from the PREVIOUS row's arrival —
   *  an overnight stay entered as two date rows (arrive on one, depart the
   *  next). Such a row has no passage of its own by design. */
  portOvernight: boolean;
}

export interface Summary {
  totalDist: number;
  avg: number | null;
  totalHrs: number;
  portCalls: number;
  stbyMin: number;
  portMin: number;
  openLoopMin: number;
  seaCondMin: number;
}

export interface VoyageComputation {
  legViews: LegView[];
  summary: Summary;
}

function speedBand(speed: number): SpeedBand {
  if (speed > 19) return 'hi';
  if (speed < 10) return 'lo';
  return 'ok';
}

export function computeVoyage(v: Voyage | undefined): VoyageComputation {
  if (!v) return { legViews: [], summary: emptySummary() };

  let lastPort: { depInstant: number | null } | null = null;
  let totalDist = 0;
  let calcDist = 0;
  let totalHrs = 0;
  let portCalls = 0;
  let stbyMin = 0;
  let portMin = 0;
  let openLoopMin = 0;
  let seaCondMin = 0;

  const legViews = v.legs.map((leg: Leg, i: number): LegView => {
    const isPort = leg.type === 'Port' || leg.type === 'Tender';
    const d = Number(leg.dist);
    if (isPort && !isNaN(d) && leg.dist !== '') totalDist += d;

    const olm = hhmmToMin(leg.openLoop);
    if (olm != null) openLoopMin += olm;
    const scm = hhmmToMin(leg.seaCond);
    if (scm != null) seaCondMin += scm;

    let timeHrs: number | null = null;
    let speed: number | null = null;
    let effSpeed: number | null = null; // passage speed for downstream math (both modes)
    let etaComputedMin: number | null = null;

    if (isPort) {
      portCalls++;
      const canCalc = !!lastPort && lastPort.depInstant != null;
      if (leg.mode === 'time') {
        const spd = Number(leg.speed);
        if (canCalc && spd > 0 && d > 0) {
          timeHrs = d / spd;
          effSpeed = spd; // effective passage speed = the operator's target
          const arrInst = (lastPort!.depInstant as number) + timeHrs * 60;
          etaComputedMin = arrInst + Number(leg.utc) * 60;
        }
      } else {
        const arrInst = instUTC(leg, hhmmToMin(leg.eta));
        if (canCalc && arrInst != null) {
          timeHrs = (arrInst - (lastPort!.depInstant as number)) / 60;
          if (d > 0 && timeHrs > 0) speed = d / timeHrs;
          effSpeed = speed;
        }
      }
      if (timeHrs != null && d > 0 && timeHrs > 0) {
        totalHrs += timeHrs;
        calcDist += d;
      }

      // St/By (maneuvering): arrival (Arr−ETA, pilot→berth) and departure
      // (FAW−Dep, berth→pilot). Port time = Dep−Arr.
      const eMin = hhmmToMin(leg.eta);
      const aMin = hhmmToMin(leg.arr);
      const dpMin = hhmmToMin(leg.dep);
      const fMin = hhmmToMin(leg.faw);
      const arrStbyMin = aMin != null && eMin != null && aMin >= eMin ? aMin - eMin : null;
      const depStbyMin = fMin != null && dpMin != null && fMin >= dpMin ? fMin - dpMin : null;
      let lPort = 0;
      let hasPort = false;
      let portOvernight = false;
      if (dpMin != null && aMin != null && dpMin >= aMin) {
        lPort = dpMin - aMin;
        hasPort = true;
      } else if (dpMin != null && aMin == null && eMin == null) {
        // Overnight in port: the stay spans two date rows — arrival on one
        // row, departure on the next. When this row has a Dep but no ETA/Arr
        // and the previous row is a port call that arrived but never
        // departed, port time runs from that arrival to this departure
        // across the date change.
        const prev = i > 0 ? v.legs[i - 1] : undefined;
        if (
          prev &&
          (prev.type === 'Port' || prev.type === 'Tender') &&
          hhmmToMin(prev.dep) == null &&
          hhmmToMin(prev.faw) == null
        ) {
          const from = instUTC(prev, hhmmToMin(prev.arr));
          const to = instUTC(leg, dpMin);
          if (from != null && to != null && to > from) {
            lPort = to - from;
            hasPort = true;
            portOvernight = true;
          }
        }
      }
      stbyMin += (arrStbyMin ?? 0) + (depStbyMin ?? 0);
      portMin += lPort;

      // Maneuvering speeds = St/By distance ÷ St/By time (hours).
      const arrDist = Number(leg.stbyArrDist);
      const depDist = Number(leg.stbyDepDist);
      const arrStbySpeed =
        arrStbyMin != null && arrStbyMin > 0 && arrDist > 0 && leg.stbyArrDist !== ''
          ? arrDist / (arrStbyMin / 60)
          : null;
      const depStbySpeed =
        depStbyMin != null && depStbyMin > 0 && depDist > 0 && leg.stbyDepDist !== ''
          ? depDist / (depStbyMin / 60)
          : null;

      // This port's departure (FAW, else Dep) becomes the start for the next.
      const depMin = hhmmToMin(leg.faw);
      const altMin = hhmmToMin(leg.dep);
      const di = instUTC(leg, depMin != null ? depMin : altMin);
      if (di != null) lastPort = { depInstant: di };

      const view: LegView = {
        isPort,
        isSea: false,
        timeDisplay: timeHrs != null ? fmtHM(timeHrs * 60) : '—',
        timeComputed: timeHrs != null,
        speedComputed: leg.mode === 'speed',
        speedInput: leg.mode !== 'speed',
        speedDisplay: speed != null ? speed.toFixed(1) : null,
        speedBand: speed != null ? speedBand(speed) : null,
        etaComputed: leg.mode !== 'speed',
        etaInput: leg.mode === 'speed',
        etaDisplay: etaComputedMin != null ? minToHHMM(etaComputedMin) : '—',
        stbyArrTime: arrStbyMin != null ? fmtHM(arrStbyMin) : '—',
        stbyArrSpeed: arrStbySpeed != null ? arrStbySpeed.toFixed(1) : null,
        stbyDepTime: depStbyMin != null ? fmtHM(depStbyMin) : '—',
        stbyDepSpeed: depStbySpeed != null ? depStbySpeed.toFixed(1) : null,
        portDisplay: hasPort ? fmtHM(lPort) : '—',
        timeHrsNum: timeHrs,
        speedNum: effSpeed,
        stbyArrMin: arrStbyMin,
        stbyDepMin: depStbyMin,
        portMinNum: hasPort ? lPort : null,
        stbyArrSpeedNum: arrStbySpeed,
        stbyDepSpeedNum: depStbySpeed,
        portOvernight,
        ...daylight(leg),
      };
      return view;
    }

    // At-sea leg: a date carrier, no per-leg speed math.
    return {
      isPort: false,
      isSea: true,
      timeDisplay: '—',
      timeComputed: false,
      speedComputed: false,
      speedInput: false,
      speedDisplay: null,
      speedBand: null,
      etaComputed: false,
      etaInput: false,
      etaDisplay: '—',
      stbyArrTime: '—',
      stbyArrSpeed: null,
      stbyDepTime: '—',
      stbyDepSpeed: null,
      portDisplay: '—',
      timeHrsNum: null,
      speedNum: null,
      stbyArrMin: null,
      stbyDepMin: null,
      portMinNum: null,
      stbyArrSpeedNum: null,
      stbyDepSpeedNum: null,
      portOvernight: false,
      ...daylight(leg),
    };
  });

  const avg = totalHrs > 0 ? calcDist / totalHrs : null;
  return {
    legViews,
    summary: { totalDist, avg, totalHrs, portCalls, stbyMin, portMin, openLoopMin, seaCondMin },
  };
}

function daylight(leg: Leg): { daylightDisplay: string; hasDaylight: boolean } {
  const sr = hhmmToMin(leg.sunrise);
  const ss = hhmmToMin(leg.sunset);
  if (sr != null && ss != null && ss > sr) {
    return { daylightDisplay: minToHHMM(ss - sr), hasDaylight: true };
  }
  return { daylightDisplay: '—', hasDaylight: false };
}

function emptySummary(): Summary {
  return {
    totalDist: 0,
    avg: null,
    totalHrs: 0,
    portCalls: 0,
    stbyMin: 0,
    portMin: 0,
    openLoopMin: 0,
    seaCondMin: 0,
  };
}

// Re-exported so other modules (xlsx) can reuse the same day math.
export { dayNum };
