import { describe, it, expect } from 'vitest';
import { normalizeSettings, resolveSettings, normalizeOverrides } from './settings';
import { DEFAULT_CONSUMPTION_SETTINGS } from './engineDefaults';

describe('normalizeSettings', () => {
  it('returns full defaults for garbage input', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_CONSUMPTION_SETTINGS);
    expect(normalizeSettings('nonsense')).toEqual(DEFAULT_CONSUMPTION_SETTINGS);
  });

  it('clamps numerics to their ranges', () => {
    const s = normalizeSettings({ hotelLoad: 99999, seaMargin: -50, sfocDet: 9 });
    expect(s.hotelLoad).toBe(20000);
    expect(s.seaMargin).toBe(-10);
    expect(s.sfocDet).toBe(5);
  });

  it('never lets DG3 onto HFO (no bunker connection)', () => {
    const s = normalizeSettings({
      engines: [{ id: 3, available: true, fuel: 'HFO' }],
    });
    expect(s.engines.find((e) => e.id === 3)!.fuel).toBe('MGO');
    expect(s.engines).toHaveLength(4); // always reshaped to the 4 DGs
  });
});

describe('resolveSettings', () => {
  it('returns defaults untouched with no overrides', () => {
    expect(resolveSettings(DEFAULT_CONSUMPTION_SETTINGS, undefined)).toEqual(
      DEFAULT_CONSUMPTION_SETTINGS
    );
  });

  it('applies scalar and nested overrides field-by-field', () => {
    const s = resolveSettings(DEFAULT_CONSUMPTION_SETTINGS, {
      hotelLoad: 9500,
      stby: { avgPowerMW: 12 },
    });
    expect(s.hotelLoad).toBe(9500);
    expect(s.stby.avgPowerMW).toBe(12);
    expect(s.stby.engineCount).toBe(DEFAULT_CONSUMPTION_SETTINGS.stby.engineCount); // untouched
    expect(s.sfocDet).toBe(DEFAULT_CONSUMPTION_SETTINGS.sfocDet);
  });

  it('re-normalizes overridden values (illegal fuel, out-of-range)', () => {
    const s = resolveSettings(DEFAULT_CONSUMPTION_SETTINGS, {
      seaMargin: 100,
      engines: [
        { id: 1, available: true, fuel: 'HFO' },
        { id: 2, available: false, fuel: 'HFO' },
        { id: 3, available: true, fuel: 'HFO' }, // illegal — must clamp to MGO
        { id: 4, available: true, fuel: 'HFO' },
      ],
    });
    expect(s.seaMargin).toBe(20);
    expect(s.engines.find((e) => e.id === 3)!.fuel).toBe('MGO');
    expect(s.engines.find((e) => e.id === 2)!.available).toBe(false);
  });
});

describe('normalizeOverrides', () => {
  it('drops garbage and empty blobs', () => {
    expect(normalizeOverrides(null)).toBeUndefined();
    expect(normalizeOverrides({})).toBeUndefined();
    expect(normalizeOverrides({ hotelLoad: 'not a number' })).toBeUndefined();
  });

  it('keeps only valid keys, clamped', () => {
    const o = normalizeOverrides({ hotelLoad: 30000, bogus: 1, port: { fuelType: 'LSFO' } });
    expect(o).toEqual({ hotelLoad: 20000, port: { fuelType: 'LSFO' } });
  });
});
