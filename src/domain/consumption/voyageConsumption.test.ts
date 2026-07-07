import { describe, it, expect } from 'vitest';
import { computeVoyageConsumption, consumptionSignature, thrusterAvgKW } from './voyageConsumption';
import {
  computeConsumption,
  computeStbyConsumption,
  computePortConsumption,
  closeLoopEngines,
} from './consumption';
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

  it('sea phase = passage hours × blended open/close rates + sailing boiler (Basseterre)', () => {
    const sea = basseterre.sea!;
    expect(sea.hours).toBeCloseTo(62, 5); // FAW 17:00 (-5) → ETA 08:00 (-4), 3 days on
    expect(sea.speed).toBeCloseTo(1130 / 62, 5);
    expect(sea.openLoopHours).toBeCloseTo(58, 5);
    expect(sea.changeoverHours).toBe(2);
    const open = computeConsumption(sea.speed, settings.engines, settings);
    const close = computeConsumption(sea.speed, closeLoopEngines(settings.engines), settings);
    const expected = blendLegFuel(open, close, 62, 58);
    const boiler = settings.seaBoilerRate * 62; // sailing boiler, MGO
    expect(sea.boilerMT).toBeCloseTo(boiler, 10);
    expect(sea.hfoMT).toBeCloseTo(expected.hfoMT, 10);
    expect(sea.mgoMT).toBeCloseTo(expected.mgoMT + boiler, 10);
    expect(sea.totalMT).toBeCloseTo(expected.totalMT + boiler, 10);
    expect(sea.closeResult).toBeDefined();
  });

  it('st/by with distance data derives power from the maneuvering speed + thruster profile', () => {
    const arr = basseterre.stbyArr!;
    expect(arr.source).toBe('speed');
    expect(arr.speed).toBeCloseTo(11, 5); // 11 nm / 1 h
    // 1 h phase: 30 min idle (1,080 kW) + final 30 min high (9,000 kW) → 5,040 kW avg.
    const thrusters = thrusterAvgKW(1, settings);
    expect(thrusters).toBeCloseTo(5040, 8);
    // Prop auxiliaries run during St/By too (CE 2026-07-07).
    const expectedKW = interpPropPower(11) + settings.propAux + thrusters + settings.hotelLoad;
    expect(arr.powerKW).toBeCloseTo(expectedKW, 6);
    const s = computeStbyConsumption(expectedKW, settings.stby.engineCount, settings.stby.fuelType, settings.sfocDet);
    expect(arr.totalMT).toBeCloseTo(s.rate * 1, 10); // 1 h phase
    expect(arr.extraMgoEngines).toBe(s.extraMgoEngines);
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
      settings.hotelLoad, settings.engines, settings.inPortFuel, settings.sfocDet, settings.port.engineCount, settings.portBoilerRate, 9
    );
    expect(port.totalMT).toBeCloseTo(expected.totalMT, 10);
    expect(port.boilerMT).toBeCloseTo(0.19 * 9, 10);
  });

  it('totals.boilerMT rolls up port and sailing boilers together', () => {
    let boiler = 0;
    for (const l of r.legs) {
      boiler += (l.sea?.boilerMT ?? 0) + (l.portStay?.boilerMT ?? 0);
    }
    expect(boiler).toBeGreaterThan(0);
    expect(r.totals.boilerMT).toBeCloseTo(boiler, 10);
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

describe('tender stays (Type: Tender)', () => {
  it('a tender leg runs the tender plant: fixed total output on 2 DGs + port boiler', () => {
    const voyage = clone(seed['586']);
    const idx = voyage.legs.findIndex((l) => l.port.startsWith('Basseterre'));
    voyage.legs[idx].type = 'Tender';
    const r = computeVoyageConsumption(voyage, settings, { by: 'Test' });
    const stay = r.legs.find((l) => l.port.startsWith('Basseterre'))!.portStay!;
    expect(stay.tender).toBe(true);
    expect(stay.hours).toBeCloseTo(9, 5);
    const expected = computePortConsumption(
      settings.tender.totalPowerKW, settings.engines, settings.inPortFuel, settings.sfocDet, settings.tender.engineCount, settings.portBoilerRate, 9
    );
    expect(settings.tender.totalPowerKW).toBe(11000); // CE 2026-07-07
    expect(settings.tender.engineCount).toBe(2);
    expect(stay.totalMT).toBeCloseTo(expected.totalMT, 10);
    expect(stay.dgRate).toBeCloseTo(expected.dgRate, 10);
    expect(stay.boilerMT).toBeCloseTo(0.19 * 9, 10); // port boiler still applies
  });

  it('a normal port leg is unaffected by the tender assumptions', () => {
    const r = computeVoyageConsumption(seed['586'], settings, { by: 'Test' });
    const stay = r.legs.find((l) => l.port.startsWith('Basseterre'))!.portStay!;
    expect(stay.tender).toBeUndefined();
    const expected = computePortConsumption(
      settings.hotelLoad, settings.engines, settings.inPortFuel, settings.sfocDet, settings.port.engineCount, settings.portBoilerRate, 9
    );
    expect(stay.totalMT).toBeCloseTo(expected.totalMT, 10);
  });
});

describe('overnight port stays (two date rows)', () => {
  it('the departure row carries the full overnight stay and raises no passage warning', () => {
    const voyage = clone(seed['586']);
    const i = voyage.legs.findIndex((l) => l.port.startsWith('Basseterre'));
    const arrRow = voyage.legs[i]; // Arr 09:00 on 2026-12-25
    const depRow = {
      ...clone(voyage)!.legs[i],
      date: '2026-12-26', eta: '', arr: '', dist: '', stbyArrDist: '', openLoop: '', seaCond: '',
    };
    arrRow.dep = '';
    arrRow.faw = '';
    voyage.legs.splice(i + 1, 0, depRow);
    const r = computeVoyageConsumption(voyage, settings, { by: 'Test' });
    const stay = r.legs.find((l) => l.legIndex === i + 1)!.portStay!;
    expect(stay.hours).toBeCloseTo(33, 5); // 09:00 → 18:00 next day
    expect(r.legs.find((l) => l.legIndex === i)!.portStay).toBeUndefined();
    expect(
      r.warnings.some((w) => w.includes('Basseterre') && w.includes('passage not computable'))
    ).toBe(false);
  });
});

describe('thrusterAvgKW (CE maneuvering profile)', () => {
  it('weights idle hours against the final-30-min high output', () => {
    // 2 h: 1.5 h × 1,080 + 0.5 h × 9,000 = 6,120 kWh → 3,060 kW average.
    expect(thrusterAvgKW(2, settings)).toBeCloseTo((1080 * 1.5 + 9000 * 0.5) / 2, 10);
  });

  it('phases of 30 minutes or less run entirely at high output', () => {
    expect(thrusterAvgKW(0.5, settings)).toBeCloseTo(9000, 10);
    expect(thrusterAvgKW(0.25, settings)).toBeCloseTo(9000, 10);
  });

  it('zero-length phases contribute nothing', () => {
    expect(thrusterAvgKW(0, settings)).toBe(0);
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
