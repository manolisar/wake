import { describe, it, expect } from 'vitest';
import { buildBundle, parseBundle, BUNDLE_VERSION } from './bundle';
import { seedVoyages } from '../domain/sampleVoyages';
import { DEFAULT_CONSUMPTION_SETTINGS } from '../domain/consumption/engineDefaults';
import { computeVoyageConsumption } from '../domain/consumption/voyageConsumption';

const seed = seedVoyages();

describe('bundle round-trip', () => {
  it('builds and re-parses a full bundle losslessly', () => {
    const bundle = buildBundle(seed, '586');
    expect(bundle.bundleVersion).toBe(BUNDLE_VERSION);
    const back = parseBundle(JSON.stringify(bundle));
    expect(Object.keys(back.voyages).sort()).toEqual(Object.keys(seed).sort());
    expect(back.selectedId).toBe('586');
    expect(back.voyages['586'].legs.length).toBe(seed['586'].legs.length);
  });

  it('wraps a bare single-voyage JSON', () => {
    const voyage = seed['587'];
    const back = parseBundle(JSON.stringify(voyage));
    expect(back.voyages['587']).toBeDefined();
    expect(back.selectedId).toBe('587');
  });

  it('rejects non-JSON and non-object roots', () => {
    expect(() => parseBundle('not json')).toThrow(/valid JSON/);
    expect(() => parseBundle('[1,2,3]')).toThrow(/root must be an object/);
  });

  it('rejects an unknown bundleVersion', () => {
    expect(() => parseBundle(JSON.stringify({ bundleVersion: 99, voyages: {} }))).toThrow(/Unsupported file/);
  });

  it('rejects a voyage entry without a legs array', () => {
    const bad = { bundleVersion: BUNDLE_VERSION, voyages: { x: { id: 'x' } } };
    expect(() => parseBundle(JSON.stringify(bad))).toThrow(/missing a legs array/);
  });
});

describe('bundle v2 — consumption fields', () => {
  it('still accepts a v1 file (pre-consumption); fields simply absent', () => {
    const v1 = { ...buildBundle(seed, '586'), bundleVersion: 1 };
    delete (v1 as { consumptionDefaults?: unknown }).consumptionDefaults;
    const back = parseBundle(JSON.stringify(v1));
    expect(back.bundleVersion).toBe(2); // always re-emitted as current
    expect(back.consumptionDefaults).toBeUndefined();
    expect(back.voyages['586'].consumption).toBeUndefined();
  });

  it('round-trips consumptionDefaults, per-voyage overrides, and the snapshot', () => {
    const voyages = JSON.parse(JSON.stringify(seed)) as typeof seed;
    voyages['586'].consumptionOverrides = { hotelLoad: 9000, stby: { avgPowerMW: 12 } };
    voyages['586'].consumption = computeVoyageConsumption(
      voyages['586'],
      DEFAULT_CONSUMPTION_SETTINGS,
      { by: 'Test' }
    );
    const defaults = { ...DEFAULT_CONSUMPTION_SETTINGS, hotelLoad: 8500 };
    const back = parseBundle(JSON.stringify(buildBundle(voyages, '586', 'SL', defaults)));
    expect(back.consumptionDefaults?.hotelLoad).toBe(8500);
    expect(back.voyages['586'].consumptionOverrides).toEqual({
      hotelLoad: 9000,
      stby: { avgPowerMW: 12 },
    });
    expect(back.voyages['586'].consumption?.totals.totalMT).toBeCloseTo(
      voyages['586'].consumption!.totals.totalMT,
      8
    );
    expect(back.voyages['586'].consumption?.by).toBe('Test');
  });

  it('drops garbage consumption blobs instead of crashing', () => {
    const voyages = JSON.parse(JSON.stringify(seed)) as typeof seed;
    (voyages['586'] as unknown as Record<string, unknown>).consumption = { junk: true };
    (voyages['586'] as unknown as Record<string, unknown>).consumptionOverrides = 'garbage';
    const bad = buildBundle(voyages, '586', 'SL', 'nonsense' as never);
    const back = parseBundle(JSON.stringify(bad));
    expect(back.voyages['586'].consumption).toBeUndefined();
    expect(back.voyages['586'].consumptionOverrides).toBeUndefined();
    // A garbage defaults blob normalizes to the built-in defaults.
    expect(back.consumptionDefaults).toEqual(DEFAULT_CONSUMPTION_SETTINGS);
  });

  it('keeps a snapshot whose phases all carry their CalculationResult', () => {
    const voyages = JSON.parse(JSON.stringify(seed)) as typeof seed;
    voyages['586'].consumption = computeVoyageConsumption(
      voyages['586'],
      DEFAULT_CONSUMPTION_SETTINGS,
      { by: 'Test' }
    );
    // Sanity: the fixture really does produce St/By phases with a result.
    expect(
      voyages['586'].consumption.legs.some((l) => l.stbyArr?.result || l.stbyDep?.result)
    ).toBe(true);
    const back = parseBundle(JSON.stringify(buildBundle(voyages, '586')));
    expect(back.voyages['586'].consumption).toBeDefined();
  });

  it('drops a consumption snapshot whose St/By phase predates the result field', () => {
    const voyages = JSON.parse(JSON.stringify(seed)) as typeof seed;
    const snap = computeVoyageConsumption(voyages['586'], DEFAULT_CONSUMPTION_SETTINGS, {
      by: 'Test',
    });
    // Simulate an older build's snapshot: strip `result` off a St/By phase.
    const legWithStby = snap.legs.find((l) => l.stbyArr || l.stbyDep)!;
    const phase = (legWithStby.stbyArr ?? legWithStby.stbyDep)! as Record<string, unknown>;
    delete phase.result;
    voyages['586'].consumption = snap;
    const back = parseBundle(JSON.stringify(buildBundle(voyages, '586')));
    expect(back.voyages['586'].consumption).toBeUndefined();
  });

  it('keeps per-leg St/By power overrides through the leg normalizer', () => {
    const voyages = JSON.parse(JSON.stringify(seed)) as typeof seed;
    voyages['586'].legs[3].stbyArrPowerMW = '14';
    const back = parseBundle(JSON.stringify(buildBundle(voyages, '586')));
    expect(back.voyages['586'].legs[3].stbyArrPowerMW).toBe('14');
    expect(back.voyages['586'].legs[3].stbyDepPowerMW).toBe('');
  });
});
