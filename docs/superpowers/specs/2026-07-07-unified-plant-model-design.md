# Unified lineup-aware plant model + configurable boilers — design

*Date: 2026-07-07 · Status: approved for planning · Area: `src/domain/consumption/`*

## Problem

The consumption engine runs **three divergent plant models** that don't agree with
each other:

- **Sea** (`computeConsumption`) — reads the real 4-DG lineup: per-DG fuel, per-DG
  availability, fuel-priority selection, load-sharing, SFOC. Correct and rich.
- **St/By** (`computeStbyConsumption`) — an *abstract* model: N DGs on one fuel, plus a
  hand-rolled escalation loop that lights extra DGs on MGO. **Ignores the real lineup and
  DG availability entirely.**
- **Port / Tender** (`computeStaticConsumption`) — same abstract N-DGs-on-one-fuel slab.
  Also ignores availability.

Consequences the operator hit:

1. Marking DG1 or DG2 unavailable changes the **sea** burn but has **no effect** on St/By,
   Port, or Tender.
2. St/By can't express "one HFO-capable DG is down, so the plant now runs 1×HFO + 2×MGO" —
   the abstract model always yields the configured fuel + MGO-escalation regardless of which
   physical engines are on the board.

Separately, the two boiler rates (port 0.20 t/h, sailing 0.14 t/h) are **hardcoded
constants**; the CE wants them editable.

## Goal

One plant model for every phase, driven by the real DG lineup (fuel + availability), so
lineup changes flow through consistently. Boiler rates become editable settings.

## Approach (chosen)

**Approach A — extract a shared core + per-phase transforms.** Pull the guts of
`computeConsumption` into a single core; every phase becomes a thin wrapper that (a) builds a
power demand, (b) applies a lineup *transform*, (c) calls the core with a minimum-DG floor.

Rejected: **Approach B** (rewrite each phase function in place) — duplicates the
transform + selection logic 2–3× and preserves the divergent-models problem we are removing.

### The core

```ts
// consumption.ts
export function computePlantConsumption(
  totalKW: number,
  engines: EngineState[],
  sfocDet: number,
  minEngines: number,
): CalculationResult
```

This is today's `computeConsumption` body from `selectEngines` onward, with the
`minEngines` floor passed in instead of derived from `speed`. Returns the existing
`CalculationResult` (per-fuel rates, per-DG `engineResults`, overload flags, `insufficient`,
running counts). Pure, framework-free.

`selectEngines` gains an explicit `minEngines` parameter (today it computes
`speed > 0 ? 2 : 1` internally). The sea wrapper passes `speed > 0 ? 2 : 1`, preserving
behavior exactly.

### The transforms (pure `EngineState[] → EngineState[]`)

- `closeLoopEngines(engines)` — **exists.** Forces the open-loop-scrubber-only DG (DG4)
  from HFO → MGO. Used by the close portion of a sea leg and by **all** St/By phases.
- `harbourEngines(engines, inPortFuel)` — **new.** Forces **every** DG to `inPortFuel`
  (respecting per-DG legality; MGO is legal for all four). Used by Port + Tender.

### Per-phase wrappers

| Phase | Demand `totalKW` | Transform | `minEngines` |
|---|---|---|---|
| Sea (open) | `propKW·(1+seaMargin)+propAux+hotel` | none | `speed>0 ? 2 : 1` |
| Sea (close portion) | same | `closeLoopEngines` | `speed>0 ? 2 : 1` |
| St/By | override MW → speed-derived → `stby.avgPowerMW` fallback | `closeLoopEngines` | `stby.engineCount` |
| Port | `hotelLoad` | `harbourEngines(_, inPortFuel)` | `port.engineCount` |
| Tender | `tender.totalPowerKW` | `harbourEngines(_, inPortFuel)` | `tender.engineCount` |

- **Sea** demand/margin/aux/hotel assembly and the open/close blend (`blend.ts`) are
  unchanged. Sea = `computePlantConsumption` with the untouched sea demand → **identical
  numbers, golden-locked.**
- **St/By** demand is built exactly as today (see "St/By auxiliaries" below); only the plant
  side changes. The old `extraMgoEngines` escalation is **retired** — an extra DG on MGO is
  now the *emergent* result of fuel-priority selection over the closed-loop lineup.
- **Port / Tender** run the same core against the harbour-transformed lineup. With default
  settings (`inPortFuel = MGO`, `port.engineCount = 1`, hotel 8000 kW) the result equals
  today's `computeStaticConsumption(8000, 1, MGO, det)` → **port default numbers preserved.**

`computeStaticConsumption` and `computeStbyConsumption` are **cleanly deleted** (no
deprecated shims) — verified 2026-07-07 to have no callers outside
`src/domain/consumption/` and its tests, which are the regression guardrail. The boiler
helper `computePortConsumption` is reworked to call the core (DG side) + boiler (below).

### St/By auxiliaries — unchanged

The speed-derived St/By demand keeps its full form:

```
powerKW = interpPropPower(stbySpeed) + propAux + thrusterAvgKW(hours) + hotelLoad
```

`thrusterIdleKW`, `thrusterHighKW`, `propAux`, and the `thrusterAvgKW` time-weighting are
**untouched** — they live on the demand side and are orthogonal to this refactor. The
override and fallback sources remain stated totals (no auxiliaries added). Only
`stby.fuelType` leaves (fuel now comes from the lineup).

## Configuration changes

### Removed
- `StbySetup.fuelType`
- `PortSetup.fuelType`
- `TenderSetup.fuelType`
- `StbyPhase.extraMgoEngines` (result type)

### Added (on `ConsumptionSettings` / `ConsumptionOverrides`, ship-default + per-voyage)
- `inPortFuel: FuelType` — harbour transform target for Port + Tender. **Default `MGO`.**
- `portBoilerRate: number` — t/h MGO while alongside. **Default `0.19`** (was 0.20).
- `seaBoilerRate: number` — t/h MGO per sea-passage hour. **Default `0.14`** (unchanged).

### Kept
- `stby.engineCount` (now the St/By min-DG floor), `stby.avgPowerMW` (no-distance fallback).
- `port.engineCount` (port floor), `tender.engineCount` (tender floor),
  `tender.totalPowerKW`.
- Full DG lineup cards (`engines[]`): availability + per-DG fuel — now the single source of
  truth for St/By, Port, and Tender fuel as well as Sea.

### Ranges / clamps (`SETTING_RANGES`, shared by UI + normalizer)
- `portBoilerRate`, `seaBoilerRate`: `{ min: 0, max: 1 }` t/h.
- `inPortFuel`: validated against `FuelType`.

### Bundle round-trip
- Boiler rates become editable; constants `PORT_BOILER_RATE_MT_PER_HR` /
  `SEA_BOILER_RATE_MT_PER_HR` become the **default values**, not the live rate.
- Tolerant normalizers (`normalizeSettings`, `normalizeOverrides`) drop the removed
  `fuelType` keys on read and supply defaults for the new fields — old v2 files load without
  error. No bundle-version bump required (still v2; new fields are additive with defaults).

## Result-type & report changes

- Every phase already or newly carries its `CalculationResult` DG breakdown:
  - `SeaPhase` — has `openResult` / `closeResult` today (unchanged).
  - `StbyPhase` — **replace** `engineCount` / `fuelType` / `extraMgoEngines` with a single
    `result: CalculationResult`.
  - `PortPhase` — **add** `result: CalculationResult` (DG side).
- `ConsumptionReport.tsx`:
  - St/By row: instead of `"{engineCount} DG · {fuelType} +N MGO"`, render a **compact** mix
    from `result` (e.g. `"3 DG · 2×HFO 1×MGO"`), plus overload/insufficient flags. The full
    `CalculationResult` is retained on the phase, so a per-DG expansion is a later add with no
    schema change.
  - Settings summary line: replace the per-phase fuel labels with the DG lineup +
    `inPortFuel`; show editable boiler rates.
- `ConsumptionSettingsModal.tsx`:
  - Remove the Port / Tender / St/By **fuel** selectors.
  - Add `inPortFuel` selector (one control; applies to Port + Tender).
  - Add `portBoilerRate` / `seaBoilerRate` numeric inputs to the scalar grid (ovr pills for
    the per-voyage tab).
  - St/By card keeps `avgPowerMW` (fallback) + `engineCount` (floor); helper text updated to
    "fuel follows the DG lineup, closed-loop".

## Warnings

Uniform, driven by `CalculationResult.insufficient` from the core:
- St/By: `"{leg} St/By {arr|dep}: demand X MW exceeds available DG capacity"`.
- Port/Tender: `"{leg}: {hotel|tender} load exceeds available DG capacity"`.
The `extraMgoEngines` wording is removed.

## Testing

- **Sea goldens** (`consumption.test.ts`) — must stay **byte-identical**; they are the proof
  the core extraction is faithful. Do not edit their expected numbers.
- **Port default-board goldens** — must stay identical (harbour→MGO, floor 1 = 1-DG-MGO).
  Update only the port-boiler expectation to 0.19.
- **St/By tests** — rewritten for the new model:
  - Full board, 3 DGs needed → `2×HFO + 1×MGO` (emergent, not escalation).
  - **DG1 unavailable, 3 DGs needed → `1×HFO + 2×MGO`** (the motivating case).
  - Availability now affects St/By / Port / Tender burn.
  - Delete `extraMgoEngines` assertions.
- **New**: `harbourEngines` unit tests (forces all to `inPortFuel`, respects DG3 lock).
- **New**: boiler-rate settings flow through `computeVoyageConsumption` and override
  resolution; clamps enforced.
- `voyageConsumption.test.ts` — update St/By and port-boiler expectations; sea + tender
  default numbers hold.
- `settings.test.ts` — new fields normalize/clamp; removed fields drop cleanly from old blobs.

## Docs / assumptions to update (`CLAUDE.md` §8)

These are **CE-facing assumption changes** — flag for CE re-bless, don't merge silently:

1. Port boiler default **0.20 → 0.19 t/h** (operator-directed, 2026-07-07).
2. St/By, Port, Tender now run the **real closed-loop / harbour lineup** with availability;
   the "extra DG runs on MGO" escalation is replaced by emergent fuel-priority selection.
3. Boiler rates are now **settings** (ship default + per-voyage), not constants.
4. In-port fuel is a **policy setting** (`inPortFuel`, default MGO) applied to Port + Tender
   via the harbour transform; St/By fuel follows the lineup under the closed-loop transform
   (not forced to `inPortFuel`).

Update the golden-lock note: the DG SFOC/load-sharing math remains golden-locked via the
**sea** goldens; St/By/Port escalation numbers are intentionally superseded.

## Out of scope (YAGNI)

- Configurable boiler **fuel** (stays MGO — operator confirmed).
- Changing the sea open/close blend model.
- Per-DG maneuvering fuel differences beyond the closed-loop transform.
- Bundle version bump (additive fields with defaults suffice).

## File touch list

- `consumption.ts` — add `computePlantConsumption`, `harbourEngines`; delete
  `computeStaticConsumption` + `computeStbyConsumption`; rework `computePortConsumption`;
  boiler constants become default exports.
- `loadSharing.ts` — `selectEngines` gains `minEngines` param.
- `engineDefaults.ts` — new defaults (`inPortFuel`, `portBoilerRate`, `seaBoilerRate`);
  drop per-phase `fuelType`; add ranges.
- `settings.ts` — normalize/resolve new fields, drop removed ones.
- `types.ts` — settings + phase-result type changes.
- `voyageConsumption.ts` — St/By/Port/Tender wrappers call the core + transforms; boiler
  rates from settings.
- `ConsumptionSettingsModal.tsx`, `ConsumptionReport.tsx` — UI per above.
- Test files as listed.
