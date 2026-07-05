import { describe, it, expect } from 'vitest';
import { computeVoyage } from './calculations';
import { seedVoyages } from './sampleVoyages';

const seed = seedVoyages();

describe('computeVoyage — SPD mode (voyage 586)', () => {
  const { legViews, summary } = computeVoyage(seed['586']);

  it('computes speed from times across the FAW carry (Basseterre, idx 3)', () => {
    const r = legViews[3];
    // 1130 nm over 62.0 h since Fort Lauderdale FAW → 18.2 kn
    expect(r.timeDisplay).toBe('62:00');
    expect(r.speedComputed).toBe(true);
    expect(r.speedDisplay).toBe('18.2');
    expect(r.speedBand).toBe('ok');
  });

  it('splits St/By into arrival and departure with maneuvering speeds', () => {
    const r = legViews[3];
    expect(r.stbyArrTime).toBe('1:00'); // Arr 09:00 − ETA 08:00
    expect(r.stbyDepTime).toBe('1:00'); // FAW 19:00 − Dep 18:00
    expect(r.stbyArrSpeed).toBe('11.0'); // 11 nm / 1.0 h
    expect(r.stbyDepSpeed).toBe('9.0'); // 9 nm / 1.0 h
    expect(r.portDisplay).toBe('9:00'); // Dep−Arr
  });

  it('rolls St/By time into the summary (arr + dep across legs)', () => {
    // Basseterre alone contributes 2:00 of St/By; total must be ≥ that.
    expect(summary.stbyMin >= 120).toBe(true);
  });

  it('computes daylight = sunset − sunrise', () => {
    expect(legViews[3].daylightDisplay).toBe('11:05'); // 17:38 − 06:33
    expect(legViews[3].hasDaylight).toBe(true);
  });

  it('treats at-sea legs as carriers (no speed math)', () => {
    expect(legViews[1].isSea).toBe(true);
    expect(legViews[1].speedComputed).toBe(false);
    expect(legViews[1].timeDisplay).toBe('—');
  });

  it('rolls up the summary', () => {
    expect(summary.portCalls).toBe(8);
    expect(summary.totalDist).toBe(3324);
    expect(summary.avg).not.toBeNull();
    expect(summary.avg! > 0).toBe(true);
  });
});

describe('computeVoyage — TIME mode (voyage 587)', () => {
  const { legViews } = computeVoyage(seed['587']);

  it('computes ETA from a target speed (CocoCay, idx 2)', () => {
    const r = legViews[2];
    expect(r.etaComputed).toBe(true);
    expect(r.timeDisplay).toBe('23:20'); // 420 nm / 18 kn = 23.333 h
    expect(r.etaDisplay).toBe('16:50');
  });
});

describe('computeVoyage — guards', () => {
  it('returns an empty result for an undefined voyage', () => {
    const { legViews, summary } = computeVoyage(undefined);
    expect(legViews).toEqual([]);
    expect(summary.portCalls).toBe(0);
  });
});
