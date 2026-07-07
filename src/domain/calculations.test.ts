import { describe, it, expect } from 'vitest';
import { computeVoyage } from './calculations';
import { seedVoyages } from './sampleVoyages';
import type { Leg, Voyage } from '../types';

const seed = seedVoyages();

describe('computeVoyage — SPD mode (voyage 586)', () => {
  const { legViews, summary } = computeVoyage(seed['586']);

  it('computes speed from times across the FAW carry (Basseterre, idx 3)', () => {
    const r = legViews[3];
    // 1130 nm over 62.0 h since Fort Lauderdale FAW → 18.2 kn
    expect(r.timeDisplay).toBe('62:00');
    expect(r.speedComputed).toBe(true);
    expect(r.speedDisplay).toBe('18.2');
    expect(r.speedBand).toBe('ok');
  });

  it('splits St/By into arrival and departure with maneuvering speeds', () => {
    const r = legViews[3];
    expect(r.stbyArrTime).toBe('1:00'); // Arr 09:00 − ETA 08:00
    expect(r.stbyDepTime).toBe('1:00'); // FAW 19:00 − Dep 18:00
    expect(r.stbyArrSpeed).toBe('11.0'); // 11 nm / 1.0 h
    expect(r.stbyDepSpeed).toBe('9.0'); // 9 nm / 1.0 h
    expect(r.portDisplay).toBe('9:00'); // Dep−Arr
  });

  it('surfaces numeric mirrors for downstream math (Basseterre, idx 3)', () => {
    const r = legViews[3];
    expect(r.timeHrsNum).toBeCloseTo(62.0, 5);
    expect(r.speedNum).toBeCloseTo(1130 / 62, 5);
    expect(r.stbyArrMin).toBe(60);
    expect(r.stbyDepMin).toBe(60);
    expect(r.portMinNum).toBe(9 * 60);
    expect(r.stbyArrSpeedNum).toBeCloseTo(11.0, 5);
    expect(r.stbyDepSpeedNum).toBeCloseTo(9.0, 5);
    // At-sea carriers expose nulls.
    expect(legViews[1].timeHrsNum).toBeNull();
    expect(legViews[1].speedNum).toBeNull();
  });

  it('rolls St/By time into the summary (arr + dep across legs)', () => {
    // Basseterre alone contributes 2:00 of St/By; total must be ≥ that.
    expect(summary.stbyMin >= 120).toBe(true);
  });

  it('computes daylight = sunset − sunrise', () => {
    expect(legViews[3].daylightDisplay).toBe('11:05'); // 17:38 − 06:33
    expect(legViews[3].hasDaylight).toBe(true);
  });

  it('treats at-sea legs as carriers (no speed math)', () => {
    expect(legViews[1].isSea).toBe(true);
    expect(legViews[1].speedComputed).toBe(false);
    expect(legViews[1].timeDisplay).toBe('—');
  });

  it('rolls up the summary', () => {
    expect(summary.portCalls).toBe(8);
    expect(summary.totalDist).toBe(3324);
    expect(summary.avg).not.toBeNull();
    expect(summary.avg! > 0).toBe(true);
  });
});

describe('computeVoyage — TIME mode (voyage 587)', () => {
  const { legViews } = computeVoyage(seed['587']);

  it('computes ETA from a target speed (CocoCay, idx 2)', () => {
    const r = legViews[2];
    expect(r.etaComputed).toBe(true);
    expect(r.timeDisplay).toBe('23:20'); // 420 nm / 18 kn = 23.333 h
    expect(r.etaDisplay).toBe('16:50');
    // TIME mode: the target speed is the effective passage speed…
    expect(r.speedNum).toBeCloseTo(18, 5);
    expect(r.timeHrsNum).toBeCloseTo(420 / 18, 5);
    // …but the computed-speed display stays off (speed is the input here).
    expect(r.speedDisplay).toBeNull();
  });
});

describe('computeVoyage — overnight port stays (two date rows)', () => {
  // Arrival row (no Dep/FAW) + next-date departure row (no ETA/Arr): port
  // time runs from the first row's Arr to the second row's Dep.
  const L = (p: Partial<Leg>): Leg => ({
    type: 'Port', date: '', port: '', dist: '', mode: 'speed', eta: '', arr: '', dep: '',
    faw: '', sunrise: '', sunset: '', utc: '', openLoop: '', seaCond: '', stbyArrDist: '',
    stbyDepDist: '', stbyArrPowerMW: '', stbyDepPowerMW: '', remarks: '', speed: '', ...p,
  });
  const V = (legs: Leg[]): Voyage =>
    ({ legs, versions: [], locked: false, ended: false } as never as Voyage);
  const legs = [
    L({ date: '2027-03-01', port: 'Start', dep: '16:00', faw: '17:00', utc: '-5' }),
    L({ date: '2027-03-02', port: 'Hamilton, Bermuda', dist: '380', eta: '17:00', arr: '18:00', utc: '-4', stbyArrDist: '10' }),
    L({ date: '2027-03-03', port: 'Hamilton, Bermuda', dep: '08:00', faw: '08:30', utc: '-4', stbyDepDist: '5' }),
  ];
  const { legViews, summary } = computeVoyage(V(legs));

  it('counts arrival→next-date departure as port time on the departure row', () => {
    const dep = legViews[2];
    expect(dep.portOvernight).toBe(true);
    expect(dep.portMinNum).toBe(14 * 60); // 18:00 → 08:00 next day
    expect(dep.portDisplay).toBe('14:00');
    expect(summary.portMin).toBe(14 * 60);
  });

  it('keeps the phases on their own rows: St/By arr on row 1, St/By dep on row 2', () => {
    expect(legViews[1].stbyArrMin).toBe(60);
    expect(legViews[1].portMinNum).toBeNull(); // no Dep on the arrival row
    expect(legViews[1].portOvernight).toBe(false);
    expect(legViews[2].stbyDepMin).toBe(30);
  });

  it('anchors the next passage on the departure row FAW, not the arrival row', () => {
    // The arrival row never departs, so it must not update the FAW carry.
    const withNext = V([
      ...legs,
      L({ date: '2027-03-05', port: 'Next', dist: '450', eta: '08:30', utc: '-4' }),
    ]);
    const r = computeVoyage(withNext).legViews[3];
    expect(r.timeHrsNum).toBeCloseTo(48, 5); // 03-03 08:30 FAW → 03-05 08:30 ETA
  });

  it('does not stitch when the previous row already departed', () => {
    const normal = V([
      L({ date: '2027-03-02', port: 'A', arr: '18:00', dep: '20:00', faw: '21:00', utc: '-4' }),
      L({ date: '2027-03-03', port: 'B', dep: '08:00', utc: '-4' }),
    ]);
    const r = computeVoyage(normal).legViews[1];
    expect(r.portOvernight).toBe(false);
    expect(r.portMinNum).toBeNull();
  });
});

describe('computeVoyage — guards', () => {
  it('returns an empty result for an undefined voyage', () => {
    const { legViews, summary } = computeVoyage(undefined);
    expect(legViews).toEqual([]);
    expect(summary.portCalls).toBe(0);
  });
});
