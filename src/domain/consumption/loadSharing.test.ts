import { describe, it, expect } from 'vitest';
import { getEngineWithLimits, selectEngines, distributeLoad } from './loadSharing';
import type { EngineState } from './types';

const engines: EngineState[] = [
  { id: 1, available: true, fuel: 'HFO' },
  { id: 2, available: true, fuel: 'HFO' },
  { id: 3, available: true, fuel: 'MGO' },
  { id: 4, available: true, fuel: 'HFO' },
];

describe('getEngineWithLimits', () => {
  it('applies per-fuel load limits against nominal 16800 kW', () => {
    const withLimits = getEngineWithLimits(engines);
    expect(withLimits[0].maxKW).toBeCloseTo(16800 * 0.8); // HFO
    expect(withLimits[2].maxKW).toBeCloseTo(16800 * 0.7); // MGO
  });
});

describe('selectEngines', () => {
  it('prefers HFO engines and honours the min-2 rule at sea', () => {
    const all = getEngineWithLimits(engines);
    const { selected } = selectEngines(all, 5000, 15); // tiny demand, still 2 DGs
    expect(selected).toHaveLength(2);
    expect(selected.map((e) => e.fuel)).toEqual(['HFO', 'HFO']);
  });

  it('allows a single engine at zero speed', () => {
    const all = getEngineWithLimits(engines);
    const { selected } = selectEngines(all, 5000, 0);
    expect(selected).toHaveLength(1);
  });

  it('adds MGO engines last and flags insufficiency', () => {
    const all = getEngineWithLimits(engines);
    const { selected, insufficient } = selectEngines(all, 60000, 20);
    expect(selected).toHaveLength(4);
    expect(selected[selected.length - 1].fuel).toBe('MGO');
    expect(insufficient).toBe(true); // 3×13440 + 11760 = 52080 < 60000
  });

  it('skips unavailable engines', () => {
    const all = getEngineWithLimits(
      engines.map((e) => (e.id === 1 ? { ...e, available: false } : e))
    );
    const { selected } = selectEngines(all, 20000, 15);
    expect(selected.map((e) => e.id)).not.toContain(1);
  });
});

describe('distributeLoad', () => {
  it('splits load equally when nobody caps', () => {
    const all = getEngineWithLimits(engines).slice(0, 2);
    const loads = distributeLoad(all, 20000);
    expect(loads.get(1)).toBeCloseTo(10000);
    expect(loads.get(2)).toBeCloseTo(10000);
  });

  it('caps MGO at 70% and waterfalls the excess to HFO engines', () => {
    const all = getEngineWithLimits([
      { id: 1, available: true, fuel: 'HFO' },
      { id: 3, available: true, fuel: 'MGO' },
    ]);
    const loads = distributeLoad(all, 25000);
    expect(loads.get(3)).toBeCloseTo(16800 * 0.7); // 11760, capped
    expect(loads.get(1)).toBeCloseTo(25000 - 16800 * 0.7); // 13240
  });
});
