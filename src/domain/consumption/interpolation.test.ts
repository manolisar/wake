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
    expect(interpSFOC(0.85)).toBe(179.89);
    expect(interpSFOC(0.25)).toBe(201.34);
    expect(interpSFOC(1.0)).toBe(186.85);
  });

  it('interpolates between points (FAT ISO 3046/1 curve)', () => {
    expect(interpSFOC(0.6)).toBeCloseTo(188.208, 6);
  });

  it('clamps outside the curve', () => {
    expect(interpSFOC(0.1)).toBe(201.34);
    expect(interpSFOC(1.2)).toBe(186.85);
  });
});
