import { describe, it, expect } from 'vitest';
import { buildWorkbook, parseWorkbook } from './excel';
import { seedVoyages } from '../domain/sampleVoyages';

async function buildThenParse() {
  const seed = seedVoyages();
  const ids = Object.keys(seed).sort((a, b) => Number(a) - Number(b));
  const wb = await buildWorkbook('EC', seed, ids);
  const buf = await wb.xlsx.writeBuffer();
  return parseWorkbook(buf as ArrayBuffer, 'Tester · Master');
}

describe('Excel round-trip (build → parse)', () => {
  it('preserves the voyage set and detects the ship from the title', async () => {
    const res = await buildThenParse();
    expect(res.shipCode).toBe('EC');
    expect(res.shipName).toBe('Celebrity Eclipse');
    expect(Object.keys(res.voyages).length).toBe(36);
    expect(res.selectedId).toBe('586');
  });

  it('round-trips leg values through the template columns', async () => {
    const res = await buildThenParse();
    const legs = res.voyages['586'].legs;
    const basseterre = legs[3];
    expect(basseterre.port).toBe('Basseterre, St. Kitts & Nevis');
    expect(basseterre.type).toBe('Port');
    expect(basseterre.date).toBe('2026-12-25');
    expect(basseterre.dist).toBe('1130');
    expect(basseterre.eta).toBe('08:00');
    expect(basseterre.faw).toBe('19:00');
    expect(basseterre.utc).toBe('-4');
    expect(basseterre.openLoop).toBe('58:00'); // 58h → 58 → 58:00
    // at-sea legs survive as carriers
    expect(legs[1].type).toBe('Sea');
    expect(legs[1].port).toBe('At Sea');
  });

  it('drops app-only fields not present in the template', async () => {
    const res = await buildThenParse();
    const basseterre = res.voyages['586'].legs[3];
    // St/By distances + Sea Condition have no column in the official template
    expect(basseterre.stbyArrDist).toBe('');
    expect(basseterre.stbyDepDist).toBe('');
    expect(basseterre.seaCond).toBe('');
  });
});
