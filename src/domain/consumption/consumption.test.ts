// Golden numbers in this file were captured by running the REFERENCE engine in
// ~/Projects/voyage-planner (npx tsx, 2026-07-05) with identical inputs. The
// ported engine must reproduce them exactly.
import { describe, it, expect } from 'vitest';
import {
  computeConsumption,
  computeStaticConsumption,
  computePortConsumption,
  closeLoopEngines,
  BOILER_RATE_MT_PER_HR,
} from './consumption';
import { DEFAULT_CONSUMPTION_SETTINGS } from './engineDefaults';
import type { EngineState } from './types';

const settings = DEFAULT_CONSUMPTION_SETTINGS; // hotel 8000, margin 0, det 2, aux 1500
const engines: EngineState[] = settings.engines; // DG1/2/4 HFO, DG3 MGO

describe('computeConsumption (golden cross-check vs voyage-planner)', () => {
  it('speed 15, defaults → 2 HFO DGs at 10228 kW, 4.199129 t/h HFO', () => {
    const r = computeConsumption(15, engines, settings);
    expect(r.propPowerKW).toBeCloseTo(12456, 6);
    expect(r.totalPowerKW).toBeCloseTo(20456, 6);
    expect(r.numRunning).toBe(2);
    expect(r.hfoRate).toBeCloseTo(4.199129047136, 10);
    expect(r.mgoRate).toBe(0);
    expect(r.totalRate).toBeCloseTo(4.199129047136, 10);
    expect(r.insufficient).toBe(false);
    const running = r.engineResults.filter((e) => e.status === 'RUNNING');
    expect(running.map((e) => e.id)).toEqual([1, 2]);
    expect(running[0].loadKW).toBeCloseTo(10228, 0);
  });

  it('speed 22, defaults → all 4 DGs equal-share, HFO 6.2243 + MGO 2.07477 t/h', () => {
    const r = computeConsumption(22, engines, settings);
    expect(r.propPowerKW).toBeCloseTo(32421, 6);
    expect(r.totalPowerKW).toBeCloseTo(40421, 6);
    expect(r.numRunning).toBe(4);
    expect(r.hfoRate).toBeCloseTo(6.224302592691937, 10);
    expect(r.mgoRate).toBeCloseTo(2.0747675308973124, 10);
    expect(r.totalRate).toBeCloseTo(8.29907012358925, 10);
    const running = r.engineResults.filter((e) => e.status === 'RUNNING');
    running.forEach((e) => expect(e.loadKW).toBeCloseTo(40421 / 4, 0));
  });

  it('zero speed drops prop aux and allows a single DG', () => {
    const r = computeConsumption(0, engines, settings);
    expect(r.totalPowerKW).toBeCloseTo(settings.hotelLoad, 6);
    expect(r.numRunning).toBe(1);
  });
});

describe('closeLoopEngines', () => {
  it('forces DG4 from HFO to MGO, leaves the rest alone', () => {
    const cl = closeLoopEngines(engines);
    expect(cl.find((e) => e.id === 4)!.fuel).toBe('MGO');
    expect(cl.find((e) => e.id === 1)!.fuel).toBe('HFO');
    expect(cl.find((e) => e.id === 3)!.fuel).toBe('MGO');
  });

  it('leaves DG4 alone when already on a compliant fuel', () => {
    const lsfo = engines.map((e) => (e.id === 4 ? { ...e, fuel: 'LSFO' as const } : e));
    expect(closeLoopEngines(lsfo).find((e) => e.id === 4)!.fuel).toBe('LSFO');
  });
});

describe('computeStaticConsumption (golden cross-check)', () => {
  it('10 MW / 2 DGs / MGO / det 2 → 2.0853236 t/h', () => {
    const r = computeStaticConsumption(10000, 2, 'MGO', 2);
    expect(r.rate).toBeCloseTo(2.085323619047619, 10);
    expect(r.perFuel.mgo).toBeCloseTo(2.085323619047619, 10);
    expect(r.availablePowerKW).toBeCloseTo(23520, 6);
    expect(r.insufficient).toBe(false);
  });

  it('6.2 MW / 1 DG / MGO / det 2 → 1.2821197 t/h', () => {
    const r = computeStaticConsumption(6200, 1, 'MGO', 2);
    expect(r.rate).toBeCloseTo(1.2821197295238094, 10);
  });

  it('flags insufficiency when demand exceeds capped capacity', () => {
    const r = computeStaticConsumption(30000, 2, 'MGO', 2);
    expect(r.insufficient).toBe(true);
  });

  it('zero power or engines → zero burn', () => {
    expect(computeStaticConsumption(0, 2, 'MGO', 2).rate).toBe(0);
    expect(computeStaticConsumption(5000, 0, 'MGO', 2).rate).toBe(0);
  });
});

describe('computePortConsumption (golden cross-check)', () => {
  it('8 MW hotel / 1 DG / MGO / det 2 / 10 h → 18.2726 MT incl. 1.8 MT boiler', () => {
    const r = computePortConsumption(8000, 1, 'MGO', 2, 10);
    expect(r.dgRate).toBeCloseTo(1.6472630857142858, 10);
    expect(r.boilerMT).toBeCloseTo(BOILER_RATE_MT_PER_HR * 10, 10);
    expect(r.perFuelMT.mgo).toBeCloseTo(18.272630857142858, 10);
    expect(r.totalMT).toBeCloseTo(18.272630857142858, 10);
  });
});
