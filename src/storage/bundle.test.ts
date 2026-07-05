import { describe, it, expect } from 'vitest';
import { buildBundle, parseBundle, BUNDLE_VERSION } from './bundle';
import { seedVoyages } from '../domain/sampleVoyages';

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
