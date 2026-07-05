import { describe, it, expect } from 'vitest';
import { splitLegHours, blendLegFuel, CHANGEOVER_HOURS_PER_LEG } from './blend';
import { computeConsumption, closeLoopEngines } from './consumption';
import { DEFAULT_CONSUMPTION_SETTINGS } from './engineDefaults';

describe('splitLegHours', () => {
  it('undefined openLoopHours → whole leg pure open, no changeover', () => {
    expect(splitLegHours(24, undefined)).toEqual({ pureOpen: 24, changeover: 0, pureClose: 0 });
  });

  it('10 OL hours of a 24 h leg → 8 pure-open + 2 changeover + 14 close', () => {
    expect(splitLegHours(24, 10)).toEqual({ pureOpen: 8, changeover: 2, pureClose: 14 });
  });

  it('OL shorter than the changeover window is all changeover', () => {
    expect(splitLegHours(24, 1.5)).toEqual({ pureOpen: 0, changeover: 1.5, pureClose: 22.5 });
  });

  it('zero OL → all close-loop, no changeover; OL clamped to leg hours', () => {
    expect(splitLegHours(24, 0)).toEqual({ pureOpen: 24 - 24, changeover: 0, pureClose: 24 });
    expect(splitLegHours(10, 99)).toEqual({ pureOpen: 10, changeover: 0, pureClose: 0 });
  });
});

describe('blendLegFuel', () => {
  const settings = DEFAULT_CONSUMPTION_SETTINGS;
  const open = computeConsumption(15, settings.engines, settings);
  const close = computeConsumption(15, closeLoopEngines(settings.engines), settings);

  it('whole-leg open equals open rate × hours', () => {
    const f = blendLegFuel(open, close, 24, undefined);
    expect(f.totalMT).toBeCloseTo(open.totalRate * 24, 10);
    expect(f.hfoMT).toBeCloseTo(open.hfoRate * 24, 10);
  });

  it('whole-leg close equals close rate × hours', () => {
    const f = blendLegFuel(open, close, 24, 0);
    expect(f.totalMT).toBeCloseTo(close.totalRate * 24, 10);
  });

  it('changeover hours burn a 50/50 blend', () => {
    const f = blendLegFuel(open, close, 24, 10);
    const expectHfo =
      open.hfoRate * 8 + close.hfoRate * 14 + 0.5 * (open.hfoRate + close.hfoRate) * 2;
    expect(f.hfoMT).toBeCloseTo(expectHfo, 10);
    expect(CHANGEOVER_HOURS_PER_LEG).toBe(2);
  });
});
