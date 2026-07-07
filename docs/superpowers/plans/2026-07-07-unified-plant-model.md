# Unified Plant Model + Configurable Boilers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make St/By, Port, and Tender fuel burn driven by the real DG lineup (per-DG fuel + availability) through one shared engine core, and turn the two boiler rates into editable settings.

**Architecture:** Extract the guts of `computeConsumption` into a single `computePlantConsumption(totalKW, engines, sfocDet, minEngines)` core. Each phase becomes a thin wrapper = build a power demand + apply a lineup transform (`closeLoopEngines` for St/By, new `harbourEngines` for Port/Tender) + call the core with a minimum-DG floor. The old abstract `computeStaticConsumption` / `computeStbyConsumption` (which ignored the lineup and availability) are deleted. Boiler rates move from hardcoded constants to `ConsumptionSettings` fields.

**Tech Stack:** TypeScript (strict), Vitest, React 19. All engine code is framework-free under `src/domain/consumption/`.

**Spec:** `docs/superpowers/specs/2026-07-07-unified-plant-model-design.md`

**Working branch:** `unified-plant-model` (already checked out).

**Golden discipline:** The **sea** goldens in `consumption.test.ts` (`computeConsumption` at speed 15 / 22 / 0) and the sea/tender-default numbers in `voyageConsumption.test.ts` MUST stay byte-identical — they are the proof the core extraction is faithful. Never edit their expected numbers. St/By numbers and the port-boiler expectation (0.20 → 0.19) DO change and their tests are rewritten.

**Run tests with:** `npx vitest run src/domain/consumption/` (add `--reporter=verbose` for names). Typecheck with `npx tsc --noEmit`.

---

## File Structure

| File | Responsibility after this plan |
|---|---|
| `src/domain/consumption/loadSharing.ts` | `selectEngines` takes an explicit `minEngines` floor. |
| `src/domain/consumption/consumption.ts` | `computePlantConsumption` core; `computeConsumption` (sea) wraps it; `harbourEngines` transform; `computePortConsumption` (DG core + boiler). `computeStaticConsumption`/`computeStbyConsumption` deleted. |
| `src/domain/consumption/engineDefaults.ts` | New defaults: `inPortFuel`, `portBoilerRate` (0.19), `seaBoilerRate` (0.14); reduced port/tender/stby setups (no `fuelType`); new clamp ranges. |
| `src/domain/consumption/settings.ts` | Normalize/resolve the new fields; drop removed `fuelType` keys tolerantly. |
| `src/domain/consumption/types.ts` | Setups lose `fuelType`; settings gain `inPortFuel`+boiler rates; `StbyPhase`/`PortPhase` carry `result: CalculationResult`; `StbyPhase` loses `engineCount`/`fuelType`/`extraMgoEngines`. |
| `src/domain/consumption/voyageConsumption.ts` | Wrappers call the core + transforms; boiler rates from settings. |
| `src/components/ConsumptionSettingsModal.tsx` | Remove per-phase fuel selectors; add `inPortFuel` selector + two boiler-rate inputs. |
| `src/components/ConsumptionReport.tsx` | St/By row shows real fuel mix from `result`; assumptions line shows `inPortFuel` + boiler rates. |
| test files | Sea goldens preserved; St/By/port-boiler tests rewritten; new core + `harbourEngines` + settings tests. |

---

## Task 1: Add explicit `minEngines` floor to `selectEngines`

**Files:**
- Modify: `src/domain/consumption/loadSharing.ts:20-48`
- Modify: `src/domain/consumption/consumption.ts:70-74` (the one caller)
- Test: `src/domain/consumption/loadSharing.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/domain/consumption/loadSharing.test.ts`:

```ts
import { getEngineWithLimits, selectEngines } from './loadSharing';
import type { EngineState } from './types';

describe('selectEngines minEngines floor', () => {
  const engines: EngineState[] = [
    { id: 1, available: true, fuel: 'MGO' },
    { id: 2, available: true, fuel: 'MGO' },
    { id: 3, available: true, fuel: 'MGO' },
    { id: 4, available: true, fuel: 'MGO' },
  ];
  it('runs at least minEngines even when one DG covers the demand', () => {
    const wl = getEngineWithLimits(engines);
    const { selected } = selectEngines(wl, 5000, 2); // 5 MW fits in 1 DG, floor 2
    expect(selected.length).toBe(2);
  });
  it('runs a single DG when minEngines is 1', () => {
    const wl = getEngineWithLimits(engines);
    const { selected } = selectEngines(wl, 5000, 1);
    expect(selected.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/consumption/loadSharing.test.ts`
Expected: FAIL — the 3rd argument is currently `speed`, so `selectEngines(wl, 5000, 2)` treats `2` as a speed and floors to 2 by coincidence in test 1 but test 2 (`minEngines: 1`) yields 2 engines (speed 1 > 0 → min 2). At least the second test fails.

- [ ] **Step 3: Change the signature**

In `src/domain/consumption/loadSharing.ts`, change `selectEngines`:

```ts
export function selectEngines(
  allEngines: EngineWithLimits[],
  totalKW: number,
  minEngines: number
): { selected: EngineWithLimits[]; allAvailable: EngineWithLimits[]; insufficient: boolean } {
  const sorted = allEngines
    .filter((e) => e.available)
    .sort((a, b) => {
      if (FUEL_PRIORITY[a.fuel] !== FUEL_PRIORITY[b.fuel])
        return FUEL_PRIORITY[a.fuel] - FUEL_PRIORITY[b.fuel];
      return a.id - b.id;
    });

  const selected: EngineWithLimits[] = [];
  let capacity = 0;

  for (const eng of sorted) {
    selected.push(eng);
    capacity += eng.maxKW;
    if (capacity >= totalKW && selected.length >= minEngines) break;
  }

  return {
    selected,
    allAvailable: sorted,
    insufficient: capacity < totalKW && selected.length === sorted.length,
  };
}
```

(Only the third param name changed and the internal `const minEngines = …` line is removed.)

- [ ] **Step 4: Update the sole caller so the sea path is unchanged**

In `src/domain/consumption/consumption.ts`, the `computeConsumption` call currently reads:

```ts
  const { selected: runningEngines, allAvailable, insufficient } = selectEngines(
    allEngines,
    totalKW,
    speed
  );
```

Replace the third argument with the explicit floor:

```ts
  const { selected: runningEngines, allAvailable, insufficient } = selectEngines(
    allEngines,
    totalKW,
    speed > 0 ? 2 : 1
  );
```

- [ ] **Step 5: Run tests to verify green (incl. sea goldens)**

Run: `npx vitest run src/domain/consumption/`
Expected: PASS, including the untouched `computeConsumption` speed 15/22/0 goldens.

- [ ] **Step 6: Commit**

```bash
git add src/domain/consumption/loadSharing.ts src/domain/consumption/consumption.ts src/domain/consumption/loadSharing.test.ts
git commit -m "selectEngines takes an explicit minEngines floor"
```

---

## Task 2: Extract the `computePlantConsumption` core

**Files:**
- Modify: `src/domain/consumption/consumption.ts:59-133`
- Test: `src/domain/consumption/consumption.test.ts`

- [ ] **Step 1: Write the failing test**

Add a new describe block to `src/domain/consumption/consumption.test.ts` (import `computePlantConsumption` in the existing import from `./consumption`):

```ts
describe('computePlantConsumption (shared core)', () => {
  it('given a fixed demand, selects + load-shares like the sea path', () => {
    // 20456 kW is the total the speed-15 sea golden feeds the plant.
    const wl = settings.engines;
    const r = computePlantConsumption(20456, wl, settings.sfocDet, 2);
    expect(r.numRunning).toBe(2);
    expect(r.hfoRate).toBeCloseTo(4.199129047136, 10);
    expect(r.totalRate).toBeCloseTo(4.199129047136, 10);
  });
  it('honours availability — DG1 offline shifts the mix', () => {
    const noDg1 = settings.engines.map((e) => (e.id === 1 ? { ...e, available: false } : e));
    const r = computePlantConsumption(20456, noDg1, settings.sfocDet, 2);
    expect(r.engineResults.find((e) => e.id === 1)!.status).toBe('OFFLINE');
    expect(r.numRunning).toBe(2); // DG2 (HFO) + next by priority
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/consumption/consumption.test.ts`
Expected: FAIL — `computePlantConsumption is not a function`.

- [ ] **Step 3: Extract the core**

In `src/domain/consumption/consumption.ts`, replace the body of `computeConsumption` (lines 59-133) with a thin wrapper plus the extracted core. The core is the existing code from `selectEngines` onward:

```ts
/**
 * The plant core: given a total power demand, a DG lineup, SFOC deterioration,
 * and a minimum-DG floor, select engines (fuel-priority), load-share, and burn
 * fuel. The single place selection + SFOC live. Pure.
 */
export function computePlantConsumption(
  totalKW: number,
  engines: EngineState[],
  sfocDet: number,
  minEngines: number
): CalculationResult {
  const allEngines = getEngineWithLimits(engines);
  const { selected: runningEngines, allAvailable, insufficient } = selectEngines(
    allEngines,
    totalKW,
    minEngines
  );
  const numRunning = runningEngines.length;
  const runningIds = new Set(runningEngines.map((e) => e.id));
  const engineLoads = distributeLoad(runningEngines, totalKW);

  let hfoRate = 0, mgoRate = 0, lsfoRate = 0;
  runningEngines.forEach((e) => {
    const kw = engineLoads.get(e.id) || 0;
    const lf = kw / NOMINAL_KW;
    const sfoc = interpSFOC(lf) * (1 + sfocDet / 100);
    const cons = (sfoc * kw) / 1e6;
    if (e.fuel === 'HFO') hfoRate += cons;
    else if (e.fuel === 'LSFO') lsfoRate += cons;
    else mgoRate += cons;
  });

  const engineResults: EngineResult[] = allEngines.map((eng) => {
    if (!eng.available) {
      return {
        id: eng.id, status: 'OFFLINE' as const, loadKW: 0, loadFraction: 0,
        loadLimit: eng.loadLimit, overloaded: false, fuelConsumption: 0, fuel: eng.fuel,
      };
    }
    if (runningIds.has(eng.id)) {
      const kw = engineLoads.get(eng.id) || 0;
      const lf = kw / NOMINAL_KW;
      const sfoc = interpSFOC(lf) * (1 + sfocDet / 100);
      return {
        id: eng.id, status: 'RUNNING' as const, loadKW: kw, loadFraction: lf,
        loadLimit: eng.loadLimit, overloaded: lf > eng.loadLimit,
        fuelConsumption: (sfoc * kw) / 1e6, fuel: eng.fuel,
      };
    }
    return {
      id: eng.id, status: 'STANDBY' as const, loadKW: 0, loadFraction: 0,
      loadLimit: eng.loadLimit, overloaded: false, fuelConsumption: 0, fuel: eng.fuel,
    };
  });

  const avgLoadPercent = numRunning > 0 ? (totalKW / (numRunning * NOMINAL_KW)) * 100 : 0;

  return {
    propPowerKW: 0, // set by the sea wrapper; irrelevant for static phases
    totalPowerKW: totalKW,
    avgLoadPercent,
    engineResults,
    hfoRate, mgoRate, lsfoRate,
    totalRate: hfoRate + mgoRate + lsfoRate,
    insufficient,
    numRunning,
    numAvailable: allAvailable.length,
    hfoRunning: runningEngines.filter((e) => e.fuel === 'HFO').length,
    mgoRunning: runningEngines.filter((e) => e.fuel === 'MGO').length,
    lsfoRunning: runningEngines.filter((e) => e.fuel === 'LSFO').length,
  };
}

export function computeConsumption(
  speed: number,
  engines: EngineState[],
  settings: VesselSettings
): CalculationResult {
  const propKW = interpPropPower(speed);
  const propWithMargin = propKW * (1 + settings.seaMargin / 100);
  const propAux = speed > 0 ? settings.propAux : 0;
  const totalKW = propWithMargin + propAux + settings.hotelLoad;
  const r = computePlantConsumption(totalKW, engines, settings.sfocDet, speed > 0 ? 2 : 1);
  return { ...r, propPowerKW: propWithMargin + propAux };
}
```

Note: `propPowerKW` is only meaningful for the sea path, so the wrapper sets it after calling the core. The sea goldens assert `propPowerKW`, so this preserves them.

- [ ] **Step 4: Run tests to verify green (sea goldens included)**

Run: `npx vitest run src/domain/consumption/`
Expected: PASS. The speed 15/22/0 goldens must still pass — same math, just relocated.

- [ ] **Step 5: Commit**

```bash
git add src/domain/consumption/consumption.ts src/domain/consumption/consumption.test.ts
git commit -m "Extract computePlantConsumption core; computeConsumption wraps it"
```

---

## Task 3: Add the `harbourEngines` transform

**Files:**
- Modify: `src/domain/consumption/consumption.ts` (near `closeLoopEngines`, ~line 23)
- Test: `src/domain/consumption/consumption.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `consumption.test.ts` (import `harbourEngines`):

```ts
describe('harbourEngines', () => {
  it('forces every available DG to the in-port fuel', () => {
    const h = harbourEngines(settings.engines, 'MGO');
    expect(h.every((e) => e.fuel === 'MGO')).toBe(true);
  });
  it('respects DG legality (DG3 has no HFO line) — falls back to a legal fuel', () => {
    // Requesting HFO for the whole plant must not put DG3 (MGO-locked) on HFO.
    const h = harbourEngines(settings.engines, 'HFO');
    expect(h.find((e) => e.id === 3)!.fuel).toBe('MGO'); // DG3 stays legal
    expect(h.find((e) => e.id === 1)!.fuel).toBe('HFO');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/consumption/consumption.test.ts`
Expected: FAIL — `harbourEngines is not a function`.

- [ ] **Step 3: Implement the transform**

In `src/domain/consumption/consumption.ts`, add after `closeLoopEngines` (reuse `engineConfigs` already imported from `./engineDefaults`):

```ts
/**
 * In-port transform: force every DG to the compliant in-port fuel (default MGO),
 * so a shore stay burns the harbour fuel regardless of the sea lineup. Respects
 * each DG's bunker legality — a DG that can't take the requested fuel (DG3 has no
 * HFO line) keeps the first fuel it legally can, preferring the requested one.
 */
export function harbourEngines(engines: EngineState[], inPortFuel: FuelType): EngineState[] {
  return engines.map((e) => {
    const cfg = engineConfigs.find((c) => c.id === e.id);
    const fuel = cfg && cfg.allowedFuels.includes(inPortFuel) ? inPortFuel : cfg?.allowedFuels[0] ?? e.fuel;
    return { ...e, fuel };
  });
}
```

- [ ] **Step 4: Run tests to verify green**

Run: `npx vitest run src/domain/consumption/consumption.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/consumption/consumption.ts src/domain/consumption/consumption.test.ts
git commit -m "Add harbourEngines transform (force in-port fuel, respect DG legality)"
```

---

## Task 4: Boiler rates as settings (port default 0.20 → 0.19)

**Files:**
- Modify: `src/domain/consumption/types.ts:82-114`
- Modify: `src/domain/consumption/engineDefaults.ts:27-56`
- Modify: `src/domain/consumption/consumption.ts` (boiler constants → defaults; `computePortConsumption` takes `boilerRate`)
- Modify: `src/domain/consumption/settings.ts`
- Modify: `src/domain/consumption/voyageConsumption.ts` (sea + port boiler read settings)
- Test: `consumption.test.ts`, `voyageConsumption.test.ts`, `settings.test.ts`

- [ ] **Step 1: Write the failing tests**

In `settings.test.ts` add:

```ts
import { normalizeSettings, normalizeOverrides } from './settings';

describe('boiler-rate settings', () => {
  it('defaults port boiler to 0.19 and sea boiler to 0.14', () => {
    const s = normalizeSettings({});
    expect(s.portBoilerRate).toBeCloseTo(0.19, 10);
    expect(s.seaBoilerRate).toBeCloseTo(0.14, 10);
  });
  it('clamps boiler rates into [0, 1] and coerces per-voyage overrides', () => {
    expect(normalizeSettings({ portBoilerRate: 9 }).portBoilerRate).toBe(1);
    expect(normalizeOverrides({ portBoilerRate: 0.25 })!.portBoilerRate).toBeCloseTo(0.25, 10);
  });
});
```

In `consumption.test.ts`, update the existing `computePortConsumption` block for the interim boiler-param signature + 0.19 (this replaces the current block at lines 97-107). This uses the **Task-4 signature** `(demandKW, engineCount, fuelType, sfocDet, boilerRate, hours)`; Task 6 Step 1 rewrites it to the engines-based signature:

```ts
describe('computePortConsumption (DG + boiler)', () => {
  it('8 MW hotel / 1 DG / MGO / det 2 / 10 h / boiler 0.19 → 18.2726 MT', () => {
    const r = computePortConsumption(8000, 1, 'MGO', 2, 0.19, 10);
    expect(r.dgRate).toBeCloseTo(1.6472630857142858, 10); // golden DG burn (unchanged)
    expect(r.boilerMT).toBeCloseTo(0.19 * 10, 10);
    const expectedMT = 1.6472630857142858 * 10 + 1.9;
    expect(r.perFuelMT.mgo).toBeCloseTo(expectedMT, 10);
    expect(r.totalMT).toBeCloseTo(expectedMT, 10);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/domain/consumption/`
Expected: FAIL — new settings fields undefined; `computePortConsumption` signature mismatch.

- [ ] **Step 3: Add the type fields**

In `src/domain/consumption/types.ts`, extend `ConsumptionSettings` (add after `thrusterHighKW`):

```ts
  /** Port boiler burn (t/h MGO) while alongside. CE default 0.19 (2026-07-07). */
  portBoilerRate: number;
  /** Sailing boiler burn (t/h MGO) per sea-passage hour. CE default 0.14. */
  seaBoilerRate: number;
```

And `ConsumptionOverrides` (add):

```ts
  portBoilerRate?: number;
  seaBoilerRate?: number;
```

- [ ] **Step 4: Add defaults + ranges**

In `src/domain/consumption/engineDefaults.ts`, add to `DEFAULT_CONSUMPTION_SETTINGS` (after `thrusterHighKW`):

```ts
  portBoilerRate: 0.19, // t/h MGO, CE-validated 2026-07-07 (was 0.20)
  seaBoilerRate: 0.14, // t/h MGO, CE-validated 2026-07-07
```

And to `SETTING_RANGES`:

```ts
  portBoilerRate: { min: 0, max: 1 },
  seaBoilerRate: { min: 0, max: 1 },
```

- [ ] **Step 5: Rework the boiler constants + `computePortConsumption`**

In `src/domain/consumption/consumption.ts`:
- Delete the exported `PORT_BOILER_RATE_MT_PER_HR` and `SEA_BOILER_RATE_MT_PER_HR` constants (their values now live in defaults).
- Change `computePortConsumption` to take the boiler rate as a parameter. For now keep its DG side on `computeStaticConsumption` (Task 6 swaps that for the core). New signature and body:

```ts
export function computePortConsumption(
  demandKW: number,
  engineCount: number,
  fuelType: FuelType,
  sfocDet: number,
  boilerRate: number,
  hours: number
): PortConsumption {
  const dg = computeStaticConsumption(demandKW, engineCount, fuelType, sfocDet);
  const boilerMT = boilerRate * hours;
  const perFuelMT = {
    hfo: dg.perFuel.hfo * hours,
    mgo: dg.perFuel.mgo * hours + boilerMT,
    lsfo: dg.perFuel.lsfo * hours,
  };
  return {
    dgRate: dg.rate, boilerRate, boilerMT, perFuelMT,
    totalMT: perFuelMT.hfo + perFuelMT.mgo + perFuelMT.lsfo,
    insufficient: dg.insufficient, availablePowerKW: dg.availablePowerKW,
  };
}
```

> NOTE: This interim `computePortConsumption` keeps the abstract `(engineCount, fuelType)` DG side and only adds the `boilerRate` param. Task 6 swaps the DG side for the core (engines-based signature). Same golden numbers either way.

- [ ] **Step 6: Thread settings through `voyageConsumption.ts`**

In `src/domain/consumption/voyageConsumption.ts`:
- Replace the `SEA_BOILER_RATE_MT_PER_HR` import/use with `settings.seaBoilerRate`:

```ts
const seaBoilerMT = settings.seaBoilerRate * hours;
```

- Update the two `computePortConsumption` calls (normal + tender) to pass `settings.portBoilerRate` in the boiler slot and drop the old positional boiler assumption. Normal port:

```ts
const p = isTender
  ? computePortConsumption(settings.tender.totalPowerKW, settings.tender.engineCount, settings.tender.fuelType, settings.sfocDet, settings.portBoilerRate, hours)
  : computePortConsumption(settings.hotelLoad, settings.port.engineCount, settings.port.fuelType, settings.sfocDet, settings.portBoilerRate, hours);
```

- [ ] **Step 7: Normalizers**

In `src/domain/consumption/settings.ts`:
- In `normalizeSettings`, add (inside the returned object):

```ts
    portBoilerRate: clamp(num(o.portBoilerRate, base.portBoilerRate), R.portBoilerRate.min, R.portBoilerRate.max),
    seaBoilerRate: clamp(num(o.seaBoilerRate, base.seaBoilerRate), R.seaBoilerRate.min, R.seaBoilerRate.max),
```

- In `normalizeOverrides`, extend the `numIf` key union and calls:

```ts
  const numIf = (key: 'hotelLoad' | 'seaMargin' | 'sfocDet' | 'propAux' | 'thrusterIdleKW' | 'thrusterHighKW' | 'portBoilerRate' | 'seaBoilerRate', r: { min: number; max: number }) => {
    if (o[key] != null && Number.isFinite(Number(o[key]))) out[key] = clamp(Number(o[key]), r.min, r.max);
  };
  // …existing numIf calls…
  numIf('portBoilerRate', R.portBoilerRate);
  numIf('seaBoilerRate', R.seaBoilerRate);
```

- [ ] **Step 8: Update `voyageConsumption.test.ts` boiler expectations**

Change the two references to `SEA_BOILER_RATE_MT_PER_HR` to `settings.seaBoilerRate`, and the port-boiler assertions `0.2 * 9` → `0.19 * 9` and `0.2 * hours` → `0.19 * hours`. Remove the now-unused `SEA_BOILER_RATE_MT_PER_HR` import.

- [ ] **Step 9: Run tests to verify green**

Run: `npx vitest run src/domain/consumption/` then `npx tsc --noEmit`
Expected: PASS + clean typecheck. Sea goldens untouched.

- [ ] **Step 10: Commit**

```bash
git add src/domain/consumption/
git commit -m "Boiler rates become settings (port default 0.20 → 0.19)"
```

---

## Task 5: Add the `inPortFuel` policy setting (additive)

**Files:**
- Modify: `src/domain/consumption/types.ts`
- Modify: `src/domain/consumption/engineDefaults.ts`
- Modify: `src/domain/consumption/settings.ts`
- Test: `settings.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe('inPortFuel policy', () => {
  it('defaults to MGO', () => {
    expect(normalizeSettings({}).inPortFuel).toBe('MGO');
  });
  it('accepts a valid fuel and rejects garbage', () => {
    expect(normalizeSettings({ inPortFuel: 'LSFO' }).inPortFuel).toBe('LSFO');
    expect(normalizeSettings({ inPortFuel: 'ZZZ' }).inPortFuel).toBe('MGO');
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run src/domain/consumption/settings.test.ts`
Expected: FAIL — `inPortFuel` undefined.

- [ ] **Step 3: Add type + default + normalize**

`types.ts` — add to `ConsumptionSettings`:

```ts
  /** Fuel forced on every DG in port + while tendering (harbour transform). CE default MGO. */
  inPortFuel: FuelType;
```

and to `ConsumptionOverrides`:

```ts
  inPortFuel?: FuelType;
```

`engineDefaults.ts` — add to `DEFAULT_CONSUMPTION_SETTINGS`:

```ts
  inPortFuel: 'MGO',
```

`settings.ts` — in `normalizeSettings` returned object:

```ts
    inPortFuel: fuel(o.inPortFuel, base.inPortFuel),
```

and in `normalizeOverrides` (after the boiler `numIf` calls):

```ts
  if (FUELS.includes(o.inPortFuel as FuelType)) out.inPortFuel = o.inPortFuel as FuelType;
```

- [ ] **Step 4: Run to verify green**

Run: `npx vitest run src/domain/consumption/settings.test.ts` then `npx tsc --noEmit`
Expected: PASS + clean.

- [ ] **Step 5: Commit**

```bash
git add src/domain/consumption/
git commit -m "Add inPortFuel policy setting (default MGO), not yet wired"
```

---

## Task 6: Rewire Port + Tender onto the core (harbour transform, availability, no per-phase fuel)

**Files:**
- Modify: `src/domain/consumption/types.ts` (drop `PortSetup.fuelType`/`TenderSetup.fuelType`; add `PortPhase.result`)
- Modify: `src/domain/consumption/engineDefaults.ts` (reduce port/tender setups)
- Modify: `src/domain/consumption/settings.ts` (drop fuelType from port/tender normalize)
- Modify: `src/domain/consumption/consumption.ts` (`computePortConsumption` → core; delete `computeStaticConsumption`)
- Modify: `src/domain/consumption/voyageConsumption.ts` (port/tender wrappers)
- Modify: `src/components/ConsumptionReport.tsx` (assumptions line)
- Test: `consumption.test.ts`, `voyageConsumption.test.ts`

- [ ] **Step 1: Update the `computePortConsumption` test to the final engines-based signature**

Replace the Task-4 `computePortConsumption` test body with:

```ts
describe('computePortConsumption (DG core + boiler)', () => {
  it('8 MW hotel / harbour MGO / floor 1 / det 2 / 10 h / boiler 0.19 → preserved DG golden', () => {
    const r = computePortConsumption(8000, settings.engines, 'MGO', 2, 1, 0.19, 10);
    expect(r.dgRate).toBeCloseTo(1.6472630857142858, 10); // 1-DG-MGO golden preserved
    expect(r.boilerMT).toBeCloseTo(1.9, 10);
    expect(r.totalMT).toBeCloseTo(1.6472630857142858 * 10 + 1.9, 10);
    expect(r.result.numRunning).toBe(1);
    expect(r.result.engineResults.find((e) => e.status === 'RUNNING')!.fuel).toBe('MGO');
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run src/domain/consumption/consumption.test.ts`
Expected: FAIL — signature mismatch / `r.result` undefined.

- [ ] **Step 3: Types**

`types.ts`:
- `PortSetup` → `{ engineCount: number }` (remove `fuelType`).
- `TenderSetup` → `{ totalPowerKW: number; engineCount: number }` (remove `fuelType`).
- `PortPhase` — add `result: CalculationResult;`.
- Update the `PortConsumption` interface in `consumption.ts` (Step 5) to carry `result`.

- [ ] **Step 4: Defaults + normalizers**

`engineDefaults.ts`:
```ts
  port: { engineCount: 1 },
  tender: { totalPowerKW: 11000, engineCount: 2 },
```

`settings.ts` — in `normalizeSettings`, drop `fuelType` from the `port` and `tender` blocks:
```ts
    port: {
      engineCount: clamp(Math.round(num(port.engineCount, base.port.engineCount)), R.engineCount.min, R.engineCount.max),
    },
    tender: {
      totalPowerKW: clamp(num(tender.totalPowerKW, base.tender.totalPowerKW), R.tenderPowerKW.min, R.tenderPowerKW.max),
      engineCount: clamp(Math.round(num(tender.engineCount, base.tender.engineCount)), R.engineCount.min, R.engineCount.max),
    },
```
And in `normalizeOverrides`, remove the `fuelType` handling from the `port` and `tender` blocks (keep `engineCount` / `totalPowerKW`).

- [ ] **Step 5: `computePortConsumption` → core; delete `computeStaticConsumption`**

`consumption.ts`:
- Update `PortConsumption` interface: add `result: CalculationResult;` (keep `dgRate`, `boilerRate`, `boilerMT`, `perFuelMT`, `totalMT`, `insufficient`; drop `availablePowerKW`).
- Rewrite:

```ts
export function computePortConsumption(
  demandKW: number,
  engines: EngineState[],
  inPortFuel: FuelType,
  sfocDet: number,
  minEngines: number,
  boilerRate: number,
  hours: number
): PortConsumption {
  const dg = computePlantConsumption(demandKW, harbourEngines(engines, inPortFuel), sfocDet, minEngines);
  const boilerMT = boilerRate * hours;
  const perFuelMT = {
    hfo: dg.hfoRate * hours,
    mgo: dg.mgoRate * hours + boilerMT,
    lsfo: dg.lsfoRate * hours,
  };
  return {
    result: dg, dgRate: dg.totalRate, boilerRate, boilerMT, perFuelMT,
    totalMT: perFuelMT.hfo + perFuelMT.mgo + perFuelMT.lsfo,
    insufficient: dg.insufficient,
  };
}
```

- Delete `computeStaticConsumption` and its `StaticConsumptionResult` interface (no longer referenced once Task 7 lands; it becomes unused here — verify with a project grep in Step 8).

> Because `computeStbyConsumption` still calls `computeStaticConsumption` until Task 7, keep `computeStaticConsumption` in place through Task 6 and delete it in Task 7. Adjust: in Task 6, do NOT delete `computeStaticConsumption` yet — only rewire `computePortConsumption`. Delete both static + stby functions in Task 7.

- [ ] **Step 6: Port/tender wrappers in `voyageConsumption.ts`**

Replace the port-stay block's `computePortConsumption` calls:

```ts
const p = isTender
  ? computePortConsumption(settings.tender.totalPowerKW, settings.engines, settings.inPortFuel, settings.sfocDet, settings.tender.engineCount, settings.portBoilerRate, hours)
  : computePortConsumption(settings.hotelLoad, settings.engines, settings.inPortFuel, settings.sfocDet, settings.port.engineCount, settings.portBoilerRate, hours);
```

Add `result: p.result` to the `lc.portStay` object literal.

- [ ] **Step 7: Report assumptions line**

In `src/components/ConsumptionReport.tsx`, replace the Port + Tender + St/By-fallback spans (lines 267-269) with:

```tsx
            <span>In-port fuel <b className="font-mono text-ink">{s.inPortFuel}</b></span>
            <span>Port <b className="font-mono text-ink">{s.port.engineCount} DG min</b></span>
            <span>Tender <b className="font-mono text-ink">{s.tender.engineCount} DG · {(s.tender.totalPowerKW / 1000).toFixed(1)} MW</b></span>
            <span>St/By fallback <b className="font-mono text-ink">{s.stby.avgPowerMW} MW · {s.stby.engineCount} DG min</b></span>
            <span>Boiler <b className="font-mono text-ink">{s.portBoilerRate} / {s.seaBoilerRate} t/h</b></span>
```

(`s.stby.fuelType` etc. are gone; St/By fuel display moves to the per-row mix in Task 7.)

- [ ] **Step 8: Update `voyageConsumption.test.ts` port/tender expectations**

- Port stay test: change `computePortConsumption(settings.hotelLoad, settings.port.engineCount, settings.port.fuelType, settings.sfocDet, 9)` → `computePortConsumption(settings.hotelLoad, settings.engines, settings.inPortFuel, settings.sfocDet, settings.port.engineCount, settings.portBoilerRate, 9)`.
- Tender test: same shape with `settings.tender.totalPowerKW`, `settings.tender.engineCount`; drop `settings.tender.fuelType`/`settings.port.fuelType` references; keep `expect(settings.tender.totalPowerKW).toBe(11000)` and `engineCount === 2`. Boiler assertions already 0.19 from Task 4.

- [ ] **Step 9: Run + typecheck + grep**

Run: `npx vitest run src/domain/consumption/ && npx tsc --noEmit`
Then: `grep -rn "\.fuelType" src/domain/consumption src/components | grep -iE 'port|tender'`
Expected: PASS, clean typecheck, no lingering `port.fuelType`/`tender.fuelType` reads. Sea + tender-default numbers unchanged.

- [ ] **Step 10: Commit**

```bash
git add src/domain/consumption/ src/components/ConsumptionReport.tsx
git commit -m "Port/Tender run the lineup via harbour transform; drop per-phase fuel"
```

---

## Task 7: Rewire St/By onto the core (closed-loop, availability); delete legacy statics

**Files:**
- Modify: `src/domain/consumption/types.ts` (`StbySetup` drop `fuelType`; `StbyPhase` drop `engineCount`/`fuelType`/`extraMgoEngines`, add `result`)
- Modify: `src/domain/consumption/engineDefaults.ts` (`stby` reduce)
- Modify: `src/domain/consumption/settings.ts` (stby normalize drop fuelType)
- Modify: `src/domain/consumption/consumption.ts` (delete `computeStbyConsumption` + `computeStaticConsumption` + their interfaces)
- Modify: `src/domain/consumption/voyageConsumption.ts` (`stbyPhase` → core)
- Modify: `src/components/ConsumptionReport.tsx` (`StbyRow` fuel mix)
- Test: `consumption.test.ts`, `voyageConsumption.test.ts`

- [ ] **Step 1: Write the failing tests (the motivating cases)**

In `consumption.test.ts`, delete the whole `describe('computeStbyConsumption', …)` block and add, using the core + `closeLoopEngines`:

```ts
describe('closed-loop St/By plant (via computePlantConsumption)', () => {
  const clEngines = () => closeLoopEngines(settings.engines); // DG1 HFO, DG2 HFO, DG3 MGO, DG4→MGO
  it('full board, 3 DGs needed → 2×HFO + 1×MGO', () => {
    // 30 MW: DG1+DG2 (HFO, cap 13.44 each = 26.88) can't carry it → +1 MGO.
    const r = computePlantConsumption(30000, clEngines(), settings.sfocDet, 2);
    const running = r.engineResults.filter((e) => e.status === 'RUNNING');
    expect(running.filter((e) => e.fuel === 'HFO').length).toBe(2);
    expect(running.filter((e) => e.fuel === 'MGO').length).toBe(1);
    expect(r.insufficient).toBe(false);
  });
  it('DG1 unavailable, 3 DGs needed → 1×HFO + 2×MGO', () => {
    const lineup = closeLoopEngines(
      settings.engines.map((e) => (e.id === 1 ? { ...e, available: false } : e))
    );
    const r = computePlantConsumption(30000, lineup, settings.sfocDet, 2);
    const running = r.engineResults.filter((e) => e.status === 'RUNNING');
    expect(running.filter((e) => e.fuel === 'HFO').length).toBe(1); // only DG2 left on HFO
    expect(running.filter((e) => e.fuel === 'MGO').length).toBe(2); // DG3 + DG4
    expect(r.insufficient).toBe(false);
  });
});
```

In `voyageConsumption.test.ts`, update the St/By-with-distance test: remove `computeStbyConsumption` import and the `arr.extraMgoEngines` assertion; assert against the core:

```ts
    const expectedKW = interpPropPower(11) + settings.propAux + thrusters + settings.hotelLoad;
    expect(arr.powerKW).toBeCloseTo(expectedKW, 6);
    const s = computePlantConsumption(expectedKW, closeLoopEngines(settings.engines), settings.sfocDet, settings.stby.engineCount);
    expect(arr.totalMT).toBeCloseTo(s.totalRate * 1, 10);
    expect(arr.result.numRunning).toBe(s.numRunning);
```

(Import `computePlantConsumption` and `closeLoopEngines`; drop `computeStbyConsumption`.)

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run src/domain/consumption/`
Expected: FAIL — `computeStbyConsumption` still imported somewhere / `arr.result` undefined.

- [ ] **Step 3: Types**

`types.ts`:
- `StbySetup` → `{ avgPowerMW: number; engineCount: number }` (drop `fuelType`).
- `StbyPhase` — remove `engineCount`, `fuelType`, `extraMgoEngines`; add `result: CalculationResult;`. Keep `source`, `speed?`, `powerKW`.

- [ ] **Step 4: Defaults + normalize**

`engineDefaults.ts`:
```ts
  stby: { avgPowerMW: 10, engineCount: 2 },
```
`settings.ts` — in `normalizeSettings` `stby` block drop `fuelType`:
```ts
    stby: {
      avgPowerMW: clamp(num(stby.avgPowerMW, base.stby.avgPowerMW), R.avgPowerMW.min, R.avgPowerMW.max),
      engineCount: clamp(Math.round(num(stby.engineCount, base.stby.engineCount)), R.engineCount.min, R.engineCount.max),
    },
```
and in `normalizeOverrides` `stby` block remove the `fuelType` handling.

- [ ] **Step 5: `stbyPhase` → core**

In `voyageConsumption.ts`, replace the plant call inside `stbyPhase` (currently `computeStbyConsumption(...)`) and the returned object:

```ts
  const r = computePlantConsumption(
    powerKW,
    closeLoopEngines(settings.engines),
    settings.sfocDet,
    settings.stby.engineCount
  );
  if (r.insufficient) {
    warnings.push(`${label}: demand ${(powerKW / 1000).toFixed(1)} MW exceeds available DG capacity`);
  }
  return {
    hours,
    hfoMT: r.hfoRate * hours,
    mgoMT: r.mgoRate * hours,
    lsfoMT: r.lsfoRate * hours,
    totalMT: r.totalRate * hours,
    insufficient: r.insufficient,
    source,
    speed,
    powerKW,
    result: r,
  };
```

Update imports: drop `computeStbyConsumption`, add `computePlantConsumption`; `closeLoopEngines` is already imported.

- [ ] **Step 6: Delete the legacy statics**

In `consumption.ts`, delete `computeStbyConsumption`, `StbyConsumptionResult`, `computeStaticConsumption`, and `StaticConsumptionResult`. Verify nothing references them:

```bash
grep -rn "computeStbyConsumption\|computeStaticConsumption\|StaticConsumptionResult\|StbyConsumptionResult" src
```
Expected: no matches.

- [ ] **Step 7: Report `StbyRow` fuel mix**

In `ConsumptionReport.tsx`, replace the `<span>` at lines 148-151 (the `phase.engineCount DG · phase.fuelType +N MGO`) with a mix derived from `phase.result`. Add this helper near the top (after `hrs`):

```tsx
const fuelMix = (r: CalculationResult) => {
  const running = r.engineResults.filter((e) => e.status === 'RUNNING');
  const by: Record<string, number> = {};
  running.forEach((e) => { by[e.fuel] = (by[e.fuel] ?? 0) + 1; });
  const parts = (['HFO', 'MGO', 'LSFO'] as FuelType[]).filter((f) => by[f]).map((f) => `${by[f]}×${f}`);
  return `${running.length} DG · ${parts.join(' ')}`;
};
```

Replace the span with:

```tsx
        <span className="ml-2 font-mono text-[0.58rem] text-faint">
          {fuelMix(phase.result)}
          {phase.result.insufficient && <span className="ml-1 text-amber">⚠ capacity</span>}
        </span>
```

- [ ] **Step 8: Run + typecheck**

Run: `npx vitest run src/domain/consumption/ && npx tsc --noEmit`
Expected: PASS + clean. Sea + tender-default numbers unchanged; new St/By mix tests green.

- [ ] **Step 9: Commit**

```bash
git add src/domain/consumption/ src/components/ConsumptionReport.tsx
git commit -m "St/By runs the closed-loop lineup via the core; delete legacy statics"
```

---

## Task 8: Fuel Setup UI — drop fuel selectors, add in-port fuel + boiler inputs

**Files:**
- Modify: `src/components/ConsumptionSettingsModal.tsx`

- [ ] **Step 1: Add the boiler scalars**

In the `SCALARS` array (lines 34-41) append two entries:

```tsx
  { key: 'portBoilerRate', label: 'Port boiler', unit: 't/h', step: 0.01, hint: 'MGO while alongside' },
  { key: 'seaBoilerRate', label: 'Sea boiler', unit: 't/h', step: 0.01, hint: 'MGO per sea hour' },
```

Extend the `ScalarKey` type (line 32):

```tsx
type ScalarKey = 'hotelLoad' | 'seaMargin' | 'sfocDet' | 'propAux' | 'thrusterIdleKW' | 'thrusterHighKW' | 'portBoilerRate' | 'seaBoilerRate';
```

Extend `scalarRange` (lines 146-153) with `portBoilerRate: R.portBoilerRate` and `seaBoilerRate: R.seaBoilerRate`.

- [ ] **Step 2: Remove the Port fuel selector**

In the Port stay card (lines 302-334), delete the entire "Fuel" `<div>` (the `<select id="fuel-port-fuel">` block) and change the grid from `grid-cols-2` to a single column for `DGs`. Update the helper text (lines 335-337) to:

```tsx
              <div className="mt-1.5 text-[0.58rem] text-faint">
                Minimum DGs on the in-port fuel (below). Hotel-load DGs + boiler.
              </div>
```

- [ ] **Step 3: Remove the Tender fuel selector**

In the Tender card (lines 347-395), delete the "Fuel" `<div>` (`<select id="fuel-tender-fuel">`) and change `grid-cols-3` to `grid-cols-2` (Total kW + DGs).

- [ ] **Step 4: Remove the St/By fuel selector + add in-port fuel control**

In the St/By card (lines 409-457), delete the "Fuel" `<div>` (`<select id="fuel-stby-fuel">`) and change `grid-cols-3` to `grid-cols-2`. Update its helper text to:

```tsx
              <div className="mt-1.5 text-[0.58rem] text-faint">
                Fallback power when a St/By phase has no distance/override. Fuel follows the DG
                lineup (closed-loop); DGs are the minimum floor.
              </div>
```

Then add a new in-port fuel control. Insert a 4th card into the Port/St/By grid (after the St/By card, before the closing `</div>` at line 464):

```tsx
            <div className="rounded-lg border border-line p-3">
              <div className={label}>
                In-port fuel
                {!onDefaults && draftOverrides.inPortFuel && (
                  <OverriddenPill
                    onReset={() =>
                      setDraftOverrides((o) => {
                        const next = { ...o };
                        delete next.inPortFuel;
                        return next;
                      })
                    }
                    disabled={!canEditTab}
                  />
                )}
              </div>
              <select
                aria-label="In-port fuel"
                className={input}
                value={view.inPortFuel}
                disabled={!canEditTab}
                onChange={(e) => {
                  const v = e.target.value as FuelType;
                  if (onDefaults) setDraftDefaults((d) => ({ ...d, inPortFuel: v }));
                  else setDraftOverrides((o) => ({ ...o, inPortFuel: v }));
                }}
              >
                {FUELS.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
              <div className="mt-1.5 text-[0.58rem] text-faint">
                Forced on every DG in port &amp; while tendering (emission compliance).
              </div>
            </div>
```

- [ ] **Step 5: Verify in the browser**

Start the dev server (preview_start), open Fuel Setup, confirm: two boiler inputs appear in the scalar grid; Port/Tender/St/By cards no longer show a fuel dropdown; the In-port fuel card shows MGO; editing a boiler rate and Saving persists (reopen shows the value). Screenshot for the record.

- [ ] **Step 6: Commit**

```bash
git add src/components/ConsumptionSettingsModal.tsx
git commit -m "Fuel Setup: in-port fuel + editable boiler rates; remove per-phase fuel pickers"
```

---

## Task 9: Docs + memory

**Files:**
- Modify: `CLAUDE.md` §7 (app-only bucket unchanged) + §8 (assumptions)
- Create: memory file for the boiler default change

- [ ] **Step 1: Update CLAUDE.md §8**

Rewrite the maneuvering/boiler paragraph and the divergences list to state:
- St/By, Port, and Tender now run the **real DG lineup** (per-DG fuel + availability) through one core with per-phase transforms (`closeLoopEngines` for St/By; `harbourEngines`→`inPortFuel` for Port/Tender). The old abstract count+fuel model and the MGO-escalation loop are gone; extra MGO DGs are now emergent from fuel-priority selection.
- Boiler rates are settings: port **0.19 t/h** (was 0.20), sailing **0.14 t/h**, both MGO, ship-default + per-voyage override.
- `inPortFuel` (default MGO) is the harbour transform target for Port + Tender.
- Golden-lock note: the SFOC/load-sharing math stays locked via the **sea** goldens (`computeConsumption`); St/By/Port escalation numbers are intentionally superseded.

- [ ] **Step 2: Update the §8 UI paragraph**

Note Fuel Setup now exposes editable boiler rates + an in-port fuel selector, and the Port/Tender/St/By cards no longer carry a fuel picker.

- [ ] **Step 3: Write the memory file**

Create `/Users/Manos/.claude/projects/-Users-Manos-Projects-wake/memory/plant-model-unification.md`:

```markdown
---
name: plant-model-unification
description: St/By/Port/Tender share one lineup-aware plant core; boiler rates are settings
metadata:
  type: project
---

2026-07-07: unified the consumption engine so St/By, Port, and Tender all run the real DG
lineup (per-DG fuel + availability) through `computePlantConsumption`, with per-phase
transforms (`closeLoopEngines` for St/By, `harbourEngines`→`inPortFuel` for Port/Tender).
Deleted the abstract `computeStaticConsumption`/`computeStbyConsumption` and the MGO-escalation
loop — extra MGO DGs are now emergent from fuel-priority selection.

**Why:** the old St/By/Port models ignored DG availability and the real lineup; "one HFO DG
out → 1×HFO+2×MGO" was impossible to express.

**How to apply:** the sea goldens in `consumption.test.ts` are the guardrail that the core
extraction is faithful — never edit their numbers. Boiler rates are now settings (port 0.19,
sea 0.14 t/h MGO); `inPortFuel` default MGO.
```

Add a one-line pointer to `MEMORY.md`.

- [ ] **Step 4: Full test + typecheck sweep**

Run: `npx vitest run && npx tsc --noEmit`
Expected: whole suite green, clean typecheck.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "Docs: unified plant model + configurable boilers (CLAUDE.md §8)"
```

---

## Self-Review (completed by plan author)

- **Spec coverage:** shared core (T2) ✓, transforms `closeLoopEngines` existing + `harbourEngines` (T3) ✓, St/By closed-loop + availability (T7) ✓, Port/Tender harbour + availability (T6) ✓, `inPortFuel` (T5) ✓, boiler rates as settings + 0.19 default (T4) ✓, drop `fuelType`/`extraMgoEngines` (T6/T7) ✓, `result` on phases + report mix (T6/T7) ✓, UI (T8) ✓, golden discipline (every task runs the suite; sea goldens never edited) ✓, docs/§8 (T9) ✓.
- **Type consistency:** `computePlantConsumption(totalKW, engines, sfocDet, minEngines)`, `harbourEngines(engines, inPortFuel)`, `computePortConsumption(demandKW, engines, inPortFuel, sfocDet, minEngines, boilerRate, hours)`, `StbyPhase.result` / `PortPhase.result` — used consistently across T2/T6/T7. The T4→T6 `computePortConsumption` signature migration is called out explicitly so the interim test matches the interim signature.
- **Placeholder scan:** none — every code step carries concrete code or an exact edit target.
- **Ordering guard:** `computeStaticConsumption` is kept until T7 (T6 note) because `computeStbyConsumption` depends on it; both deleted together in T7 with a grep gate.
