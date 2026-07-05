import { describe, it, expect } from 'vitest';
import { computeVoyageConsumption, consumptionSignature } from './voyageConsumption';
import { computeConsumption, computeStaticConsumption, computePortConsumption, closeLoopEngines } from './consumption';
import { blendLegFuel } from './blend';
import { interpPropPower } from './interpolation';
import { DEFAULT_CONSUMPTION_SETTINGS } from './engineDefaults';
import { seedVoyages } from '../sampleVoyages';
import type { Voyage } from '../../types';

const settings = DEFAULT_CONSUMPTION_SETTINGS;
const seed = seedVoyages();

function clone(v: Voyage): Voyage {
  return JSON.parse(JSON.stringify(v));
}

describe('computeVoyageConsumption — voyage 586 fixture', () => {
  const voyage = seed['586'];
  const r = computeVoyageConsumption(voyage, settings, { by: 'Test' });
  // Basseterre is legs[3] → first port call (legs[0]) has no passage, so
  // Basseterre is the first LegConsumption WITH a sea phase.
  const basseterre = r.legs.find((l) => l.port.startsWith('Basseterre'))!;

  it('produces one entry per port/tender leg only', () => {
    expect(r.legs).toHaveLength(8); // 8 port calls in the fixture
    expect(r.legs[0].port).toContain('Fort Lauderdale');
    expect(r.legs[0].sea).toBeUndefined(); // embark port — no passage
  });

  it('sea phase = passage hours × blended open/close rates (Basseterre)', () => {
    const sea = basseterre.sea!;
    expect(sea.hours).toBeCloseTo(62, 5); // FAW 17:00 (-5) → ETA 08:00 (-4), 3 days on
    expect(sea.speed).toBeCloseTo(1130 / 62, 5);
    expect(sea.openLoopHours).toBeCloseTo(58, 5);
    expect(sea.changeoverHours).toBe(2);
    const open = computeConsumption(sea.speed, settings.engines, settings);
    const close = computeConsumption(sea.speed, closeLoopEngines(settings.engines), settings);
    const expected = blendLegFuel(open, close, 62, 58);
    expect(sea.hfoMT).toBeCloseTo(expected.hfoMT, 10);
    expect(sea.mgoMT).toBeCloseTo(expected.mgoMT, 10);
    expect(sea.totalMT).toBeCloseTo(expected.totalMT, 10);
    expect(sea.closeResult).toBeDefined();
  });

  it('st/by with distance data derives power from the maneuvering speed', () => {
    const arr = basseterre.stbyArr!;
    expect(arr.source).toBe('speed');
    expect(arr.speed).toBeCloseTo(11, 5); // 11 nm / 1 h
    const expectedKW = interpPropPower(11) + settings.maneuverAuxKW + settings.hotelLoad;
    expect(arr.powerKW).toBeCloseTo(expectedKW, 6);
    const s = computeStaticConsumption(expectedKW, settings.stby.engineCount, settings.stby.fuelType, settings.sfocDet);
    expect(arr.totalMT).toBeCloseTo(s.rate * 1, 10); // 1 h phase
  });

  it('st/by without distance data falls back to the default power', () => {
    const bridgetown = r.legs.find((l) => l.port.startsWith('Bridgetown'))!;
    const arr = bridgetown.stbyArr!; // fixture has no stbyArrDist here
    expect(arr.source).toBe('default');
    expect(arr.powerKW).toBeCloseTo(settings.stby.avgPowerMW * 1000, 6);
  });

  it('port stay = hotel DG burn + boiler for Dep−Arr hours', () => {
    const port = basseterre.portStay!;
    expect(port.hours).toBeCloseTo(9, 5);
    const expected = computePortConsumption(
      settings.hotelLoad, settings.port.engineCount, settings.port.fuelType, settings.sfocDet, 9
    );
    expect(port.totalMT).toBeCloseTo(expected.totalMT, 10);
    expect(port.boilerMT).toBeCloseTo(0.18 * 9, 10);
  });

  it('totals are additive across all phases and fuels', () => {
    let hfo = 0, mgo = 0, lsfo = 0, total = 0;
    for (const l of r.legs) {
      for (const p of [l.sea, l.stbyArr, l.stbyDep, l.portStay]) {
        if (!p) continue;
        hfo += p.hfoMT; mgo += p.mgoMT; lsfo += p.lsfoMT; total += p.totalMT;
      }
    }
    expect(r.totals.hfoMT).toBeCloseTo(hfo, 10);
    expect(r.totals.mgoMT).toBeCloseTo(mgo, 10);
    expect(r.totals.lsfoMT).toBeCloseTo(lsfo, 10);
    expect(r.totals.totalMT).toBeCloseTo(total, 10);
    expect(r.totals.totalMT).toBeCloseTo(hfo + mgo + lsfo, 8);
    expect(r.totals.totalMT).toBeGreaterThan(0);
  });

  it('snapshot carries the resolved settings and attribution', () => {
    expect(r.settings).toEqual(settings);
    expect(r.by).toBe('Test');
    expect(r.computedAt).toBeTruthy();
  });
});

describe('per-leg St/By power override', () => {
  it('an override MW wins over both speed data and the default', () => {
    const voyage = clone(seed['586']);
    const basseterreIdx = voyage.legs.findIndex((l) => l.port.startsWith('Basseterre'));
    voyage.legs[basseterreIdx].stbyArrPowerMW = '14';
    const r = computeVoyageConsumption(voyage, settings, { by: 'Test' });
    const arr = r.legs.find((l) => l.port.startsWith('Basseterre'))!.stbyArr!;
    expect(arr.source).toBe('override');
    expect(arr.powerKW).toBe(14000);
    expect(arr.speed).toBeUndefined();
  });
});

describe('TIME-mode voyages (587)', () => {
  it('uses the target speed for the sea phase', () => {
    const r = computeVoyageConsumption(seed['587'], settings, { by: 'Test' });
    const coco = r.legs.find((l) => l.port.includes('CocoCay'))!;
    expect(coco.sea!.speed).toBeCloseTo(18, 5);
    expect(coco.sea!.hours).toBeCloseTo(420 / 18, 5);
  });
});

describe('warnings & staleness', () => {
  it('warns when a follow-on passage cannot be solved', () => {
    const voyage = clone(seed['586']);
    const castriesIdx = voyage.legs.findIndex((l) => l.port.startsWith('Castries'));
    voyage.legs[castriesIdx].eta = ''; // SPD mode without an ETA → unsolvable
    const r = computeVoyageConsumption(voyage, settings, { by: 'Test' });
    expect(r.warnings.some((w) => w.includes('Castries') && w.includes('passage not computable'))).toBe(true);
  });

  it('does not warn about the embark port (no passage by design)', () => {
    const r = computeVoyageConsumption(seed['586'], settings, { by: 'Test' });
    expect(r.warnings.some((w) => w.includes('passage not computable'))).toBe(false);
  });

  it('signature changes when a consumption-relevant input changes', () => {
    const voyage = clone(seed['586']);
    const sigBefore = consumptionSignature(voyage, settings);
    voyage.legs[3].openLoop = '10:00';
    expect(consumptionSignature(voyage, settings)).not.toBe(sigBefore);
    // …but not when an irrelevant field (remarks) changes.
    const voyage2 = clone(seed['586']);
    voyage2.legs[3].remarks = 'changed';
    expect(consumptionSignature(voyage2, settings)).toBe(sigBefore);
  });
});
