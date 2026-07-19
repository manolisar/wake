// Golden numbers in this file were captured by running the REFERENCE engine in
// ~/Projects/voyage-planner (npx tsx, 2026-07-05) with identical inputs. The
// ported engine must reproduce them exactly.
//
// Documented divergences from the reference (CE-validated assumptions,
// 2026-07-07): a port boiler (default 0.20 t/h; reference: 0.18), a sailing
// boiler (default 0.14 t/h) the reference lacks, and St/By running the real
// closed-loop DG lineup (via computePlantConsumption — app-only, no reference
// counterpart). Boiler rates are settings (ship default + per-voyage
// override) as of the boiler-rate-settings task.
import { describe, it, expect } from 'vitest';
import {
  computeConsumption,
  computePlantConsumption,
  computePortConsumption,
  closeLoopEngines,
  harbourEngines,
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

describe('computePlantConsumption (shared core)', () => {
  it('given a fixed demand, selects + load-shares like the sea path', () => {
    // 20456 kW is the total the speed-15 sea golden feeds the plant.
    const wl = settings.engines;
    const r = computePlantConsumption(20456, wl, settings.sfocDet, 2);
    expect(r.numRunning).toBe(2);
    expect(r.hfoRate).toBeCloseTo(4.199129047136, 10);
    expect(r.totalRate).toBeCloseTo(4.199129047136, 10);
  });
  it('honours availability — DG1 offline shifts the mix', () => {
    const noDg1 = settings.engines.map((e) => (e.id === 1 ? { ...e, available: false } : e));
    const r = computePlantConsumption(20456, noDg1, settings.sfocDet, 2);
    expect(r.engineResults.find((e) => e.id === 1)!.status).toBe('OFFLINE');
    expect(r.numRunning).toBe(2); // DG2 (HFO) + next by priority
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

describe('harbourEngines', () => {
  it('forces every available DG to the in-port fuel', () => {
    const h = harbourEngines(settings.engines, 'MGO');
    expect(h.every((e) => e.fuel === 'MGO')).toBe(true);
  });
  it('respects DG legality (DG3 has no HFO line) — falls back to a legal fuel', () => {
    // Requesting HFO for the whole plant must not put DG3 (MGO-locked) on HFO.
    const h = harbourEngines(settings.engines, 'HFO');
    expect(h.find((e) => e.id === 3)!.fuel).toBe('MGO'); // DG3 stays legal
    expect(h.find((e) => e.id === 1)!.fuel).toBe('HFO');
  });
});

describe('computePortConsumption (DG core + boiler)', () => {
  it('8 MW hotel / harbour MGO / floor 1 / det 2 / 10 h / boiler 0.19 → preserved DG golden', () => {
    const r = computePortConsumption(8000, settings.engines, 'MGO', { sfocDet: 2, minEngines: 1, boilerRate: 0.19, hours: 10 });
    expect(r.dgRate).toBeCloseTo(1.6472630857142858, 10); // 1-DG-MGO golden preserved
    expect(r.boilerMT).toBeCloseTo(1.9, 10);
    expect(r.totalMT).toBeCloseTo(1.6472630857142858 * 10 + 1.9, 10);
    expect(r.result.numRunning).toBe(1);
    expect(r.result.engineResults.find((e) => e.status === 'RUNNING')!.fuel).toBe('MGO');
  });
});

describe('closed-loop St/By plant (via computePlantConsumption)', () => {
  const clEngines = () => closeLoopEngines(settings.engines); // DG1 HFO, DG2 HFO, DG3 MGO, DG4→MGO
  it('full board, 3 DGs needed → 2×HFO + 1×MGO', () => {
    // 30 MW: DG1+DG2 (HFO, cap 13.44 each = 26.88) can't carry it → +1 MGO.
    const r = computePlantConsumption(30000, clEngines(), settings.sfocDet, 2);
    const running = r.engineResults.filter((e) => e.status === 'RUNNING');
    expect(running.filter((e) => e.fuel === 'HFO').length).toBe(2);
    expect(running.filter((e) => e.fuel === 'MGO').length).toBe(1);
    expect(r.insufficient).toBe(false);
  });
  it('DG1 unavailable, 3 DGs needed → 1×HFO + 2×MGO', () => {
    const lineup = closeLoopEngines(
      settings.engines.map((e) => (e.id === 1 ? { ...e, available: false } : e))
    );
    const r = computePlantConsumption(30000, lineup, settings.sfocDet, 2);
    const running = r.engineResults.filter((e) => e.status === 'RUNNING');
    expect(running.filter((e) => e.fuel === 'HFO').length).toBe(1); // only DG2 left on HFO
    expect(running.filter((e) => e.fuel === 'MGO').length).toBe(2); // DG3 + DG4
    expect(r.insufficient).toBe(false);
  });
});
