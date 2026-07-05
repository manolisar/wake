import { describe, it, expect } from 'vitest';
import { interpPropPower, interpSFOC } from './interpolation';

describe('interpPropPower', () => {
  it('returns exact trial-curve points', () => {
    expect(interpPropPower(0)).toBe(0);
    expect(interpPropPower(15)).toBe(10956);
    expect(interpPropPower(25)).toBe(49158);
  });

  it('interpolates linearly between points (golden: reference engine)', () => {
    expect(interpPropPower(15.5)).toBeCloseTo(11700, 6);
    expect(interpPropPower(4.2)).toBeCloseTo(1672.8, 6);
  });

  it('clamps outside the curve', () => {
    expect(interpPropPower(-3)).toBe(0);
    expect(interpPropPower(30)).toBe(49158);
  });
});

describe('interpSFOC', () => {
  it('returns exact curve points', () => {
    expect(interpSFOC(0.85)).toBe(187.56);
    expect(interpSFOC(0.25)).toBe(205.58);
    expect(interpSFOC(1.0)).toBe(194.31);
  });

  it('interpolates between points (golden: reference engine)', () => {
    expect(interpSFOC(0.6)).toBeCloseTo(201.298, 6);
  });

  it('clamps outside the curve', () => {
    expect(interpSFOC(0.1)).toBe(205.58);
    expect(interpSFOC(1.2)).toBe(194.31);
  });
});
